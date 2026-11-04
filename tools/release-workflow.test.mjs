import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  repository,
  requireEnvironment,
  requireProof,
  versionFromRef,
  waitForProof,
} from './release-workflow.mjs';

const sha = 'a'.repeat(40);
const run = {
  id: 100,
  event: 'push',
  head_sha: sha,
  head_repository: { full_name: repository },
  path: '.github/workflows/ci.yml',
  check_suite_id: 20,
  head_branch: 'ci/example',
};
const check = {
  id: 200,
  name: 'Check',
  head_sha: sha,
  app: { id: 15368 },
  check_suite: { id: 20 },
  status: 'completed',
  conclusion: 'success',
};

await test('release accepts stable tags and main only', () => {
  assert.equal(versionFromRef('refs/heads/main'), 'main');
  assert.equal(versionFromRef('refs/tags/v1.2.3'), '1.2.3');
  for (const ref of [
    'refs/heads/feature',
    'refs/tags/v01.2.3',
    'refs/tags/v1.2.3-rc.1',
    'refs/tags/v1.2.3+build',
    'refs/tags/v1.2',
    'refs/tags/v1.2.3/inject',
  ])
    assert.throws(() => versionFromRef(ref));
});

await test('the exact source accepts its PR branch push Check from GitHub Actions', () => {
  requireProof([run], [check], sha);
  for (const bad of [
    { event: 'pull_request' },
    { head_sha: 'b'.repeat(40) },
    { head_repository: { full_name: 'fork/core' } },
    { path: '.github/workflows/other.yml' },
  ])
    assert.throws(() => requireProof([{ ...run, ...bad }], [check], sha));
  for (const bad of [
    { app: { id: 1 } },
    { head_sha: 'b'.repeat(40) },
    { check_suite: { id: 21 } },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { name: 'other' },
  ])
    assert.throws(() => requireProof([run], [{ ...check, ...bad }], sha));
  assert.throws(() =>
    requireProof([run, { ...run, id: 101, check_suite_id: 21 }], [check], sha),
  );
  assert.throws(() =>
    requireProof(
      [run],
      [check, { ...check, id: 201, conclusion: 'failure' }],
      sha,
    ),
  );
});

const environment = {
  name: 'release',
  can_admins_bypass: false,
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
  protection_rules: [],
};

await test('version protection accepts an environment with no reviewer rule', () => {
  requireEnvironment(environment);
  requireEnvironment({
    ...environment,
    protection_rules: [{ type: 'branch_policy' }],
  });
});

await test('version protection refuses every required-reviewer rule', () => {
  for (const reviewers of [
    [],
    [{ type: 'User', reviewer: { id: 23272598 } }],
    [{ type: 'User', reviewer: { id: 1 } }],
    [{ type: 'Team', reviewer: { id: 1 } }],
  ]) {
    assert.throws(
      () =>
        requireEnvironment({
          ...environment,
          protection_rules: [
            { type: 'branch_policy' },
            {
              type: 'required_reviewers',
              prevent_self_review: false,
              reviewers,
            },
          ],
        }),
      /Remove required reviewers/,
    );
  }
});

await test('version protection refuses wait-timer rules even with a zero delay', () => {
  for (const waitTimer of [0, 43200]) {
    assert.throws(
      () =>
        requireEnvironment({
          ...environment,
          protection_rules: [
            { type: 'branch_policy' },
            { type: 'wait_timer', wait_timer: waitTimer },
          ],
        }),
      /Remove the wait timer/,
    );
  }
});

await test('version protection keeps the environment name, bypass and branch-policy guards', () => {
  for (const change of [
    { name: 'other' },
    { can_admins_bypass: true },
    { can_admins_bypass: undefined },
    { protection_rules: undefined },
    { protection_rules: {} },
    { protection_rules: [null] },
    { deployment_branch_policy: null },
    {
      deployment_branch_policy: {
        protected_branches: true,
        custom_branch_policies: true,
      },
    },
    {
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: false,
      },
    },
  ])
    assert.throws(() => requireEnvironment({ ...environment, ...change }));
});

const proofBudget = 40 * 60 * 1000;

/** @param {import('node:test').TestContext} t
 * @param {(path: string, signal: AbortSignal) => Promise<Response>} respond */
function proofClock(t, respond) {
  let now = 0;
  let calls = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(performance, 'now', () => now);
  /** @type {typeof fetch} */
  const fetchProof = async (input, options) => {
    calls++;
    assert.ok(options?.signal);
    assert.ok(typeof input === 'string');
    return respond(input, options.signal);
  };
  t.mock.method(globalThis, 'fetch', fetchProof);
  return {
    calls: () => calls,
    /** Advance elapsed time without running callbacks to model a late response.
     * @param {number} milliseconds */
    elapse(milliseconds) {
      now += milliseconds;
    },
    /** @param {number} milliseconds */
    async advance(milliseconds) {
      now += milliseconds;
      t.mock.timers.tick(milliseconds);
      await setImmediate();
    },
  };
}

await test('proof wait keeps the ten second cadence and accepts timely exact-source proof', async (t) => {
  let checks = 0;
  const clock = proofClock(t, async (path) =>
    Response.json(
      path.includes('/actions/')
        ? { workflow_runs: [run] }
        : { check_runs: ++checks === 1 ? [] : [check] },
    ),
  );
  const result = waitForProof(sha);
  await setImmediate();
  assert.equal(clock.calls(), 2);
  await clock.advance(9999);
  assert.equal(clock.calls(), 2);
  await clock.advance(1);
  await result;
  assert.equal(clock.calls(), 4);
});

await test('slow proof requests consume the budget and cap the last sleep', async (t) => {
  const clock = proofClock(t, async (path) => {
    if (path.includes('/actions/')) {
      clock.elapse(proofBudget - 1000);
      return Response.json({ workflow_runs: [run] });
    }
    return Response.json({ check_runs: [] });
  });
  let finished = false;
  const result = waitForProof(sha).catch((error) => {
    finished = true;
    return error;
  });
  await setImmediate();
  await clock.advance(999);
  assert.equal(finished, false);
  await clock.advance(1);
  assert.match((await result).message, /latest push CI Check must pass/);
  assert.equal(clock.calls(), 2);
});

for (const stage of ['request', 'body']) {
  await test(`proof deadline cancels a hung ${stage} and makes no extra request`, async (t) => {
    /** @type {AbortSignal | undefined} */
    let signal;
    const clock = proofClock(t, async (_path, requestSignal) => {
      signal = requestSignal;
      /** @returns {Promise<never>} */
      const hang = () =>
        new Promise((_resolve, reject) =>
          requestSignal.addEventListener(
            'abort',
            () => reject(requestSignal.reason),
            { once: true },
          ),
        );
      if (stage === 'request') return hang();
      const response = Response.json({});
      t.mock.method(response, 'json', hang);
      return response;
    });
    const result = waitForProof(sha).catch((error) => error);
    await setImmediate();
    await clock.advance(proofBudget);
    assert.match((await result).message, /latest push CI Check must pass/);
    assert.equal(signal?.aborted, true);
    assert.equal(clock.calls(), 1);
  });
}

for (const stage of ['runs', 'checks', 'body']) {
  await test(`proof wait rejects a late ${stage} response even before its timer callback`, async (t) => {
    const clock = proofClock(t, async (path) => {
      const runs = path.includes('/actions/');
      const response = Response.json(
        runs ? { workflow_runs: [run] } : { check_runs: [check] },
      );
      if ((stage === 'runs' && runs) || (stage === 'checks' && !runs))
        clock.elapse(proofBudget);
      if (stage === 'body' && !runs) {
        t.mock.method(response, 'json', async () => {
          clock.elapse(proofBudget);
          return { check_runs: [check] };
        });
      }
      return response;
    });
    await assert.rejects(waitForProof(sha), /latest push CI Check must pass/);
    assert.equal(clock.calls(), stage === 'runs' ? 1 : 2);
  });
}

await test('proof API errors fail immediately without a sleep or retry', async (t) => {
  const clock = proofClock(t, async () => new Response('', { status: 503 }));
  await assert.rejects(waitForProof(sha), /Cannot read release proof:.*503/);
  assert.equal(clock.calls(), 1);
  await clock.advance(proofBudget);
  assert.equal(clock.calls(), 1);
});

for (const stage of ['fetch', 'body']) {
  await test(`a late ${stage} rejection reports the prior proof timeout before the timer callback`, async (t) => {
    let calls = 0;
    const failure = new Error('late API failure');
    const clock = proofClock(t, async (path, signal) => {
      calls++;
      if (calls <= 2)
        return Response.json(
          path.includes('/actions/')
            ? { workflow_runs: [] }
            : { check_runs: [] },
        );
      const rejectLate = async () => {
        clock.elapse(proofBudget - 10000);
        assert.equal(signal.aborted, false);
        throw failure;
      };
      if (stage === 'fetch') return rejectLate();
      const response = Response.json({ workflow_runs: [run] });
      t.mock.method(response, 'json', rejectLate);
      return response;
    });
    const result = waitForProof(sha).catch((error) => error);
    await setImmediate();
    await clock.advance(10000);
    /** @type {unknown} */
    const error = await result;
    assert.ok(error instanceof assert.AssertionError);
    assert.match(error.message, /source has no push CI run/);
    assert.notEqual(error, failure);
    assert.equal(clock.calls(), 3);
  });

  await test(`a pre-deadline ${stage} rejection preserves the original error immediately`, async (t) => {
    const failure = new Error('ordinary API failure');
    const clock = proofClock(t, async () => {
      const rejectEarly = async () => {
        clock.elapse(1000);
        throw failure;
      };
      if (stage === 'fetch') return rejectEarly();
      const response = Response.json({});
      t.mock.method(response, 'json', rejectEarly);
      return response;
    });
    await assert.rejects(waitForProof(sha), (error) => error === failure);
    assert.equal(clock.calls(), 1);
    await clock.advance(proofBudget);
    assert.equal(clock.calls(), 1);
  });
}
