import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commentMaxAge,
  parseCommand,
  parseEvent,
  runComment,
} from './ff-merge-comment.mjs';
import {
  B,
  H,
  api,
  commentAt,
  fakeGitHub,
  graphqlUrl,
  old,
  passing,
  rabbit,
  repo,
  review,
} from './ff-merge-fake.mjs';
import { mainRef } from './ff-only-merge.mjs';

/** @typedef {import('./ff-merge-fake.mjs').State} State */

const env = {
  PR_NUMBER: '5',
  COMMENT_ID: '900',
  COMMENT_USER_ID: '7',
  COMMENT_USER_LOGIN: 'person',
  COMMENT_CREATED_AT: commentAt,
  GITHUB_TOKEN: 'token',
  GITHUB_REPOSITORY: repo,
  GITHUB_REF: mainRef,
  GITHUB_API_URL: api,
  GITHUB_GRAPHQL_URL: graphqlUrl,
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_RUN_ID: '42',
};

/** One minute after the comment. */
const now = Date.parse(commentAt) + 60 * 1000;

/** @param {number} minutes */
const at = (minutes) =>
  new Date(Date.parse(commentAt) + minutes * 60 * 1000)
    .toISOString()
    .replace('.000Z', 'Z');

/**
 * Runs a changed passing state.
 *
 * @param {(state: State) => void} change
 * @param {Parameters<typeof fakeGitHub>[1]} [options]
 * @param {number} [time]
 */
async function attempt(change, options = {}, time = now) {
  const state = passing();
  change(state);
  const github = fakeGitHub(state, options);
  const outcome = await runComment(env, github.fetch, time);
  return { state, github, outcome };
}

/**
 * The run stops before it trusts the author: no write, no reply, and no
 * request other than a read.
 *
 * @param {(state: State) => void} change
 * @param {RegExp} message
 * @param {number} [time]
 */
async function expectSilentStop(change, message, time = now) {
  const { state, github, outcome } = await attempt(change, {}, time);
  assert.equal(outcome.ok, false);
  assert.match(outcome.result, message);
  assert.equal(outcome.replied, false);
  assert.doesNotMatch(outcome.result, /reply/);
  assert.equal(github.mutations.length, 0);
  assert.deepEqual(state.replies, []);
  assert.ok(github.calls.every((call) => call.startsWith('GET ')));
  assert.equal(state.main, B);
}

/**
 * The author is trusted, a gate stops the run, and the reply says why.
 *
 * @param {(state: State) => void} change
 * @param {RegExp} message
 */
async function expectRepliedStop(change, message) {
  const { state, github, outcome } = await attempt(change);
  assert.equal(outcome.ok, false);
  assert.match(outcome.result, message);
  assert.equal(github.mutations.length, 0);
  assert.equal(state.main, B);
  assert.equal(state.replies.length, 1);
  assert.match(state.replies[0] ?? '', /Fast forward main: not done/);
  assert.match(state.replies[0] ?? '', message);
}

await test('the command is exactly /ff-merge or /ff-merge and a SHA prefix', () => {
  assert.equal(parseCommand('/ff-merge'), null);
  assert.equal(parseCommand('/ff-merge\r\n'), null);
  assert.equal(parseCommand('/ff-merge aaaaaaaaaaaa'), 'aaaaaaaaaaaa');
  assert.equal(parseCommand(`/ff-merge ${H}`), H);
  for (const body of [
    '',
    ' /ff-merge',
    '/ff-merged',
    '/ff-merge now',
    '/ff-merge aaaaaaa',
    `/ff-merge ${H}a`,
    '/ff-merge AAAAAAAAAAAA',
    '/ff-merge  aaaaaaaaaaaa',
    '/ff-merge\naaaaaaaaaaaa',
    '/ff-merge; rm -rf /',
    '/ff-merge $(id)',
    'please /ff-merge',
    '/FF-MERGE',
  ])
    assert.throws(() => parseCommand(body), /must be exactly \/ff-merge/);
});

await test('the event values are data of a strict shape', () => {
  assert.deepEqual(parseEvent(env), {
    prNumber: 5,
    commentId: 900,
    userId: 7,
    login: 'person',
    createdAt: commentAt,
  });
  /** @type {[string, string][]} */
  const invalid = [
    ['PR_NUMBER', '0'],
    ['COMMENT_ID', '9e3'],
    ['COMMENT_ID', ''],
    ['COMMENT_USER_ID', '-7'],
    ['COMMENT_USER_LOGIN', 'a b'],
    ['COMMENT_USER_LOGIN', '$(id)'],
    ['COMMENT_USER_LOGIN', 'x'.repeat(40)],
    ['COMMENT_CREATED_AT', 'yesterday'],
    ['COMMENT_CREATED_AT', '2026-10-16T11:00:00.000Z'],
  ];
  for (const [name, value] of invalid)
    assert.throws(() => parseEvent({ ...env, [name]: value }), /not valid/);
});

await test('one admin comment moves main from B to H and replies once', async () => {
  const { state, github, outcome } = await attempt(() => {});
  assert.equal(outcome.ok, true, outcome.result);
  assert.equal(state.main, H);
  assert.deepEqual(github.mutations, [
    {
      repositoryId: 'R_1',
      refUpdates: [
        { name: 'refs/heads/main', beforeOid: B, afterOid: H, force: false },
      ],
    },
  ]);
  assert.equal(outcome.replied, true);
  assert.equal(state.replies.length, 1);
  assert.match(state.replies[0] ?? '', /Fast forward main: done/);
  assert.match(
    state.replies[0] ?? '',
    new RegExp(`main moved from ${B} to ${H}`),
  );
  assert.match(
    state.replies[0] ?? '',
    /Run: https:\/\/github\.com\/owner\/repo\/actions\/runs\/42/,
  );
  const permission = github.calls.findIndex((call) =>
    call.includes('/collaborators/person/permission'),
  );
  const firstWrite = github.calls.findIndex((call) => !call.startsWith('GET '));
  assert.ok(permission >= 0 && permission < firstWrite);
  assert.ok(!github.calls.some((call) => call.includes('/reactions')));
  assert.ok(!github.calls.some((call) => /\/merge\b|\/git\/refs\//.test(call)));
});

await test('the SHA prefix form must name the head', async () => {
  const { outcome } = await attempt((state) => {
    state.comment.body = '/ff-merge aaaaaaaaaaaa';
  });
  assert.equal(outcome.ok, true, outcome.result);
  await expectRepliedStop((state) => {
    state.comment.body = '/ff-merge dddddddddddd';
  }, /not the commit in the comment/);
});

await test('a comment that is edited, old, foreign or malformed stops in silence', async () => {
  await expectSilentStop((state) => {
    state.comment.updated_at = at(1);
  }, /was edited/);
  await expectSilentStop(() => {}, /too old/, now + commentMaxAge);
  await expectSilentStop(
    () => {},
    /too old/,
    Date.parse(commentAt) - 2 * 60 * 1000,
  );
  await expectSilentStop((state) => {
    state.comment.user = { ...state.comment.user, id: 8 };
  }, /not the person in the event/);
  await expectSilentStop((state) => {
    state.comment.user = { ...state.comment.user, login: 'other' };
  }, /not the person in the event/);
  await expectSilentStop((state) => {
    state.comment.user = { ...state.comment.user, type: 'Bot' };
  }, /not the person in the event/);
  await expectSilentStop((state) => {
    state.comment.issue_url = `${api}/repos/${repo}/issues/6`;
  }, /another pull request/);
  await expectSilentStop((state) => {
    state.comment.created_at = at(-1);
    state.comment.updated_at = at(-1);
  }, /time does not match/);
});

await test('an admin gets a reply about a malformed command', async () => {
  await expectRepliedStop((state) => {
    state.comment.body = '/ff-merge please';
  }, /must be exactly/);
});

await test('a non-admin gets no reply, also for a malformed command', async () => {
  await expectSilentStop((state) => {
    state.permission.permission = 'write';
    state.comment.body = '/ff-merge please';
  }, /Only an admin/);
});

await test('only an admin can merge by comment', async () => {
  for (const permission of ['write', 'read', 'none', ''])
    await expectSilentStop((state) => {
      state.permission.permission = permission;
    }, /Only an admin/);
  await expectSilentStop((state) => {
    state.permission.user = { ...state.permission.user, id: 8 };
  }, /permission of another user/);
});

await test('a head that moved after the comment stops, even with a later approval', async () => {
  await expectRepliedStop((state) => {
    state.reviews = [
      review(1, rabbit, 'APPROVED', old),
      { ...review(2, rabbit, 'APPROVED'), submitted_at: at(30) },
    ];
  }, /CodeRabbit approved aaaaaaaaaaaa after the comment/);
  await expectRepliedStop((state) => {
    state.reviews = [
      { ...review(2, rabbit, 'APPROVED'), submitted_at: commentAt },
    ];
  }, /after the comment/);
  await expectRepliedStop((state) => {
    state.reviews = [review(1, rabbit, 'APPROVED', old)];
  }, /CodeRabbit approved dddddddddddd, not the head/);
});

await test('a force push after the approval stops, an older one does not', async () => {
  await expectRepliedStop((state) => {
    state.forcePushes = [{ id: 'F1', createdAt: '2026-10-16T10:30:00Z' }];
  }, /force pushed after the approval/);
  await expectRepliedStop((state) => {
    state.forcePushes = [{ id: 'F1', createdAt: '2026-10-16T10:02:00Z' }];
  }, /force pushed after the approval/);
  const { outcome } = await attempt((state) => {
    state.forcePushes = [{ id: 'F1', createdAt: '2026-10-16T10:01:30Z' }];
  });
  assert.equal(outcome.ok, true, outcome.result);
});

await test('a change between the two reads stops the write', async () => {
  const { state, github, outcome } = await attempt(() => {}, {
    afterForcePushes: (changed) => {
      changed.forcePushes.push({ id: 'F2', createdAt: '2026-10-16T09:00:00Z' });
    },
  });
  assert.equal(outcome.ok, false);
  assert.match(outcome.result, /changed between the two reads/);
  assert.equal(github.mutations.length, 0);
  assert.equal(state.replies.length, 1);
});

await test('a re-run after the merge stops and says so', async () => {
  await expectRepliedStop((state) => {
    state.pr.state = 'closed';
    state.pr.merged = true;
  }, /not open/);
});

await test('a rejected write is replied once and never retried', async () => {
  const { state, github, outcome } = await attempt(() => {}, {
    write: 'reject',
  });
  assert.equal(outcome.ok, false);
  assert.equal(github.mutations.length, 1);
  assert.equal(state.main, B);
  assert.equal(state.replies.length, 1);
  assert.match(state.replies[0] ?? '', /GitHub rejected the update/);
});

await test('a failed reply keeps the actual write outcome and never repeats it', async () => {
  for (const reply of /** @type {const} */ (['fail', 'lost'])) {
    const { state, github, outcome } = await attempt(() => {}, { reply });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.replied, false);
    assert.equal(state.main, H);
    assert.equal(github.mutations.length, 1);
    assert.match(outcome.result, /main moved from/);
    assert.match(outcome.result, /The reply comment failed/);
    assert.match(outcome.summary, /The reply comment failed/);
    assert.equal(
      github.calls.filter(
        (call) => call.startsWith('POST ') && call.includes('/comments'),
      ).length,
      1,
    );
  }
});
