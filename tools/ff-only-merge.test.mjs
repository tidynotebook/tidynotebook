import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GateError,
  checkRange,
  mainRef,
  parseInputs,
  run,
} from './ff-only-merge.mjs';
import {
  B,
  C,
  H,
  api,
  fakeGitHub,
  graphqlUrl,
  old,
  passing,
  repo,
} from './ff-merge-fake.mjs';

const env = {
  PR_NUMBER: '5',
  EXPECTED_HEAD_SHA: H,
  DRY_RUN: 'false',
  GITHUB_TOKEN: 'token',
  GITHUB_REPOSITORY: repo,
  GITHUB_REF: mainRef,
  GITHUB_API_URL: api,
  GITHUB_GRAPHQL_URL: graphqlUrl,
};

/**
 * Runs the procedure against a changed passing state and expects a stop with
 * no write.
 *
 * @param {(state: import('./ff-merge-fake.mjs').State) => void} change
 * @param {RegExp} message
 */
async function expectStop(change, message) {
  const state = passing();
  change(state);
  const github = fakeGitHub(state);
  const outcome = await run(env, github.fetch);
  assert.equal(outcome.ok, false);
  assert.match(outcome.result, /^Stopped before the write/);
  assert.match(outcome.result, message);
  assert.equal(github.mutations.length, 0);
  assert.equal(state.main, B);
}

await test('the inputs are a positive integer and a full lowercase SHA', () => {
  assert.deepEqual(
    parseInputs({ PR_NUMBER: '397', EXPECTED_HEAD_SHA: H, DRY_RUN: 'true' }),
    { prNumber: 397, expectedHead: H, dryRun: true },
  );
  for (const dryRun of [undefined, '', 'yes', 'TRUE', '1', 'true '])
    assert.throws(
      () =>
        parseInputs({ PR_NUMBER: '5', EXPECTED_HEAD_SHA: H, DRY_RUN: dryRun }),
      /dry run input must be true or false/,
    );
  for (const number of [
    '',
    '0',
    '-1',
    '01',
    '1.5',
    '1e3',
    ' 5',
    '5\n',
    '5;x',
    '9999999999',
  ])
    assert.throws(
      () =>
        parseInputs({
          PR_NUMBER: number,
          EXPECTED_HEAD_SHA: H,
          DRY_RUN: 'false',
        }),
      /positive integer/,
    );
  for (const sha of [
    '',
    H.slice(1),
    H.toUpperCase(),
    `${H}0`,
    `${H.slice(1)}g`,
    'main',
    `$(id)${H.slice(5)}`,
  ])
    assert.throws(
      () =>
        parseInputs({
          PR_NUMBER: '5',
          EXPECTED_HEAD_SHA: sha,
          DRY_RUN: 'false',
        }),
      /40 character lowercase/,
    );
});

await test('a passing pull request moves main from B to H with one compare and swap', async () => {
  const state = passing();
  const github = fakeGitHub(state);
  const outcome = await run(env, github.fetch);
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
  assert.match(outcome.summary, /Fast forward main: done/);
  assert.match(outcome.summary, new RegExp(`main after \\| ${H}`));
  assert.ok(
    github.calls.every(
      (call) => call.startsWith('GET ') || call === `POST ${graphqlUrl}`,
    ),
  );
  assert.ok(!github.calls.some((call) => /\/merge\b|\/git\/refs\//.test(call)));
  assert.ok(
    !github.calls.some((call) =>
      /reviews|rules|check-runs|statuses/.test(call),
    ),
  );
});

await test('a dry run checks the fast forward twice and never writes', async () => {
  const state = passing();
  const github = fakeGitHub(state);
  const outcome = await run({ ...env, DRY_RUN: 'true' }, github.fetch);
  assert.equal(outcome.ok, true, outcome.result);
  assert.match(
    outcome.result,
    /The fast forward is valid for a{40}\. This was a dry run/,
  );
  assert.equal(github.mutations.length, 0);
  assert.equal(state.main, B);
  assert.ok(
    github.calls.every(
      (call) => call.startsWith('GET ') || call === `POST ${graphqlUrl}`,
    ),
  );
  assert.equal(
    github.calls.filter((call) => call.includes('/compare/')).length,
    2,
  );
});

await test('the pull request is open and targets this repository and main', async () => {
  await expectStop((state) => {
    state.pr.base.repo = { id: 2 };
  }, /belongs to another repository/);
  await expectStop((state) => {
    state.pr.base.ref = 'release';
  }, /does not target main/);
  await expectStop((state) => {
    state.pr.state = 'closed';
  }, /is not open/);
});

await test('the head must be the expected SHA', async () => {
  await expectStop((state) => {
    state.pr.head.sha = old;
  }, /The head is dddddddddddd, not the expected aaaaaaaaaaaa/);
});

await test('reviews, checks, statuses and rules do not add merge gates', async () => {
  const state = passing();
  state.reviews = [];
  state.statuses = [];
  state.checkRuns = [];
  state.threads = [{ id: 'T1', isResolved: false, isOutdated: false }];
  state.rules = [{ type: 'update' }];
  state.pr.draft = true;
  state.pr.head.repo = { id: 2 };
  const github = fakeGitHub(state);
  const outcome = await run(env, github.fetch);
  assert.equal(outcome.ok, true, outcome.result);
  assert.equal(state.main, H);
  assert.ok(
    !github.calls.some((call) =>
      /reviews|rules|check-runs|statuses/.test(call),
    ),
  );
});

await test('main must be an ancestor of H', async () => {
  const state = passing();
  checkRange(state.compare, state.commits, B, H);
  assert.throws(
    () =>
      checkRange(
        { ...state.compare, status: 'diverged', behind_by: 1 },
        state.commits,
        B,
        H,
      ),
    /not an ancestor/,
  );
  assert.throws(
    () => checkRange({ ...state.compare, status: 'identical' }, [], B, H),
    /already points/,
  );
  assert.throws(
    () =>
      checkRange(
        { ...state.compare, merge_base_commit: { sha: old } },
        state.commits,
        B,
        H,
      ),
    /merge base/,
  );
  assert.throws(
    () => checkRange({ ...state.compare, ahead_by: 300 }, state.commits, B, H),
    /every commit/,
  );
  state.commits[0] = { sha: C, parents: [{ sha: B }, { sha: old }] };
  checkRange(state.compare, state.commits, B, H);
});

await test('any change between the two reads stops the write', async () => {
  /** @type {((state: import('./ff-merge-fake.mjs').State) => void)[]} */
  const changes = [
    (state) => {
      state.main = C;
      state.compare = {
        ...state.compare,
        ahead_by: 1,
        merge_base_commit: { sha: C },
      };
      state.commits = state.commits.slice(1);
    },
  ];
  for (const change of changes) {
    const state = passing();
    const github = fakeGitHub(state, { afterRead: change });
    const outcome = await run(env, github.fetch);
    assert.equal(outcome.ok, false);
    assert.match(outcome.result, /changed between the two reads/);
    assert.equal(github.mutations.length, 0);
  }
  const moved = passing();
  const github = fakeGitHub(moved, {
    afterRead: (state) => {
      state.pr.head.sha = old;
    },
  });
  assert.match(
    (await run(env, github.fetch)).result,
    /The head is dddddddddddd/,
  );
  assert.equal(github.mutations.length, 0);
});

await test('a rejected write is reported once and never retried', async () => {
  const state = passing();
  const github = fakeGitHub(state, { write: 'reject' });
  const outcome = await run(env, github.fetch);
  assert.equal(outcome.ok, false);
  assert.match(
    outcome.result,
    /GitHub rejected the update: Changes must be made through a pull request\. main is at b{40}/,
  );
  assert.equal(github.mutations.length, 1);
  assert.equal(state.main, B);
});

await test('a lost answer is settled by reading main back, with no retry', async () => {
  const lost = passing();
  const notApplied = fakeGitHub(lost, { write: 'lost' });
  const first = await run(env, notApplied.fetch);
  assert.equal(first.ok, false);
  assert.match(
    first.result,
    /unclear \(socket hang up\)\. main is at b{40}\. Nothing was retried/,
  );
  assert.equal(notApplied.mutations.length, 1);

  const applied = passing();
  const github = fakeGitHub(applied, { write: 'lost-applied' });
  const second = await run(env, github.fetch);
  assert.equal(second.ok, true);
  assert.match(
    second.result,
    /unclear \(socket hang up\), but main is at a{40}/,
  );
  assert.equal(github.mutations.length, 1);
});

await test('the run stops outside main and never sends the token to another host', async () => {
  const state = passing();
  const github = fakeGitHub(state);
  const outcome = await run(
    { ...env, GITHUB_REF: 'refs/heads/topic' },
    github.fetch,
  );
  assert.match(outcome.result, /must run from main/);
  assert.equal(github.calls.length, 0);

  /** @type {import('./ff-only-merge.mjs').Fetch} */
  const redirect = async (address, init) => {
    const reply = await github.fetch(address, init);
    return address.includes('/compare/')
      ? {
          ...reply,
          headers: { get: () => '<https://evil.test/x>; rel="next"' },
        }
      : reply;
  };
  const before = github.calls.length;
  assert.match((await run(env, redirect)).result, /outside its API/);
  assert.ok(github.calls.slice(before).every((call) => call.includes(api)));
  assert.ok(new GateError('x') instanceof Error);
});
