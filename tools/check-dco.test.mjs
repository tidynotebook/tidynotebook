import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  commitOf,
  commitsOf,
  exemptLogins,
  needsSignOff,
  ownerLogin,
  report,
  signOffAddresses,
  unsignedCommits,
} from './check-dco.mjs';

const script = fileURLToPath(new URL('./check-dco.mjs', import.meta.url));

/**
 * One entry of the commit list of a pull request in the GitHub API.
 *
 * @param {{
 *   sha?: string;
 *   login?: string | null;
 *   name?: string;
 *   email?: string;
 *   message?: string;
 *   parents?: number;
 *   verified?: boolean;
 * }} [shape]
 */
function entry(shape = {}) {
  const login = shape.login === undefined ? 'contributor' : shape.login;
  return {
    sha: shape.sha ?? 'a1b2c3d4e5f6a7b8c9d0',
    commit: {
      author: {
        name: shape.name ?? 'Ada Contributor',
        email: shape.email ?? 'ada@example.com',
        date: '2026-10-04T10:00:00Z',
      },
      message: shape.message ?? 'fix(sync): keep a refused save',
      verification: { verified: shape.verified ?? false, reason: 'unsigned' },
    },
    author: login === null ? null : { login, type: 'User' },
    parents: Array.from({ length: shape.parents ?? 1 }, (_, index) => ({
      sha: `parent${index}`,
    })),
  };
}

/** @param {Parameters<typeof entry>[0]} [shape] */
const commit = (shape) => commitOf(entry(shape));

/** @param {unknown} list */
function run(list) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify(list),
    encoding: 'utf8',
  });
}

await test('a sign-off names the address of its line', () => {
  assert.deepEqual(
    signOffAddresses(
      'fix: a change\n\nSigned-off-by: Ada Contributor <Ada@Example.com>\n',
    ),
    ['ada@example.com'],
  );
  assert.deepEqual(
    signOffAddresses('fix: a change\n\nsigned-off-by: Ada <ada@example.com>'),
    ['ada@example.com'],
  );
  assert.deepEqual(
    signOffAddresses('fix: a change\n\nSigned-off-by: <ada@example.com>'),
    [],
  );
  assert.deepEqual(
    signOffAddresses('fix: a change\n\nSigned-off-by: Ada Contributor'),
    [],
  );
  assert.deepEqual(
    signOffAddresses('The text says Signed-off-by: Ada <ada@example.com>'),
    [],
  );
});

await test('an unsigned commit of another author fails the check', () => {
  const unsigned = commit();
  assert.equal(needsSignOff(unsigned), true);
  assert.deepEqual(unsignedCommits([unsigned]), [unsigned]);
  const result = report([unsigned]);
  assert.equal(result.passed, false);
  assert.match(result.report, /a1b2c3d4e5f6 by Ada Contributor/);
  assert.match(result.report, /git rebase --signoff/);
});

await test('a sign-off of the author passes the check', () => {
  const signed = commit({
    message:
      'fix(sync): keep a refused save\n\nSigned-off-by: Ada Contributor <ada@example.com>\n',
  });
  assert.deepEqual(unsignedCommits([signed]), []);
  assert.equal(report([signed]).passed, true);
});

await test('a sign-off of another person does not sign for the author', () => {
  const signed = commit({
    message:
      'fix(sync): keep a refused save\n\nSigned-off-by: Bob Other <bob@example.com>\n',
  });
  assert.equal(report([signed]).passed, false);
});

await test('a verified commit of the owner needs no sign-off', () => {
  assert.equal(
    needsSignOff(commit({ login: ownerLogin, verified: true })),
    false,
  );
});

await test('the address of the owner alone does not exempt a commit', () => {
  // GitHub links a commit to an account by its address, which anybody can
  // write. Only a verified signature proves that the owner made it.
  assert.equal(
    needsSignOff(commit({ login: ownerLogin, verified: false })),
    true,
  );
  assert.equal(
    needsSignOff(commit({ login: null, name: 'Bhushan Khanale' })),
    true,
  );
});

await test('a verified commit of Dependabot needs no sign-off', () => {
  assert.ok(exemptLogins.includes('dependabot[bot]'));
  assert.equal(
    needsSignOff(commit({ login: 'dependabot[bot]', verified: true })),
    false,
  );
});

await test('a verified commit of another author still needs a sign-off', () => {
  assert.equal(
    needsSignOff(commit({ login: 'contributor', verified: true })),
    true,
  );
});

await test('a merge commit needs no sign-off', () => {
  assert.equal(needsSignOff(commit({ parents: 2 })), false);
});

await test('one unsigned commit among signed commits fails the check', () => {
  const owner = commit({ sha: 'owner', login: ownerLogin, verified: true });
  const unsigned = commit({ sha: 'unsigned' });
  assert.deepEqual(unsignedCommits([owner, unsigned]), [unsigned]);
});

await test('a commit list that cannot be read fails loudly', () => {
  assert.throws(() => commitsOf('[]'), /empty/);
  assert.throws(() => commitsOf('{}'), /not a list/);
  const { commit: detail, ...noDetail } = entry();
  assert.ok(detail);
  assert.throws(() => commitsOf(JSON.stringify([noDetail])), /has no commit/);
});

await test('the script fails a pull request with an unsigned commit', () => {
  const failed = run([entry({ login: ownerLogin, verified: true }), entry()]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /has no sign-off of its author/);
  const passed = run([
    entry({ login: ownerLogin, verified: true }),
    entry({
      message:
        'fix: a change\n\nSigned-off-by: Ada Contributor <ada@example.com>\n',
    }),
  ]);
  assert.equal(passed.status, 0, passed.stderr);
  const unreadable = spawnSync(process.execPath, [script], {
    input: 'not json',
    encoding: 'utf8',
  });
  assert.equal(unreadable.status, 1);
  assert.match(unreadable.stderr, /cannot be read/);
});

await test('the workflow runs the check of the tip of the base branch', () => {
  // `base.sha` is the base commit of the pull request. A pull request that
  // was opened before the check landed has a base with no check script, so
  // the job failed on a missing file. The tip of the base branch always holds
  // the check.
  const workflow = readFileSync(
    fileURLToPath(new URL('../.github/workflows/dco.yml', import.meta.url)),
    'utf8',
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.base\.ref \|\| github\.event\.merge_group\.base_ref \}\}/,
  );
  assert.doesNotMatch(workflow, /pull_request\.base\.sha/);
});
