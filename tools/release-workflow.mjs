/** Validate the source and hosted proof before image publication. */
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { record } from './workspace.mjs';

export const repository = 'tidynotebook/tidynotebook';
export const image = 'ghcr.io/tidynotebook/tidynotebook';

/** @param {string} ref */
export function versionFromRef(ref) {
  if (ref === 'refs/heads/main') return 'main';
  const match =
    /^refs\/tags\/v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(ref);
  assert.ok(
    match?.[1],
    'Use main or an existing stable vMAJOR.MINOR.PATCH tag.',
  );
  return match[1];
}

/** Only same-repository push CI can supply the required Check.
 * @param {unknown[]} runs @param {unknown[]} checks @param {string} sha */
export function requireProof(runs, checks, sha) {
  const run = runs
    .map(record)
    .filter(
      (item) =>
        item.event === 'push' &&
        item.head_sha === sha &&
        record(item.head_repository).full_name === repository &&
        item.path === '.github/workflows/ci.yml',
    )
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
  assert.ok(run, 'The source has no push CI run from this repository.');
  const check = checks
    .map(record)
    .filter(
      (item) =>
        item.name === 'Check' &&
        item.head_sha === sha &&
        record(item.app).id === 15368 &&
        record(item.check_suite).id === run.check_suite_id,
    )
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
  assert.ok(
    check?.status === 'completed' && check.conclusion === 'success',
    'The latest push CI Check must pass on this exact source SHA.',
  );
}

/** @param {unknown} value */
export function requireEnvironment(value) {
  const environment = record(value);
  assert.equal(environment.name, 'release');
  assert.equal(
    environment.can_admins_bypass,
    false,
    'Disable administrator bypass.',
  );
  const rules = environment.protection_rules;
  assert.ok(Array.isArray(rules));
  const protection = rules.map(record);
  assert.ok(
    protection.every((rule) => typeof rule.type === 'string'),
    'The release environment returned an invalid protection rule.',
  );
  assert.ok(
    !protection.some((rule) => rule.type === 'required_reviewers'),
    'Remove required reviewers from the release environment.',
  );
  assert.ok(
    !protection.some((rule) => rule.type === 'wait_timer'),
    'Remove the wait timer from the release environment.',
  );
  assert.deepEqual(environment.deployment_branch_policy, {
    protected_branches: false,
    custom_branch_policies: true,
  });
}

/** @param {string} path
 * @param {AbortSignal} [signal]
 * @param {() => void} [checkDeadline]
 * @returns {Promise<Record<string, unknown>>} */
async function api(path, signal, checkDeadline = () => {}) {
  checkDeadline();
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      signal: signal ?? null,
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  ).catch((error) => {
    checkDeadline();
    throw error;
  });
  checkDeadline();
  assert.equal(
    response.status,
    200,
    `Cannot read release proof: ${path} (${response.status}).`,
  );
  const body = await response.json().catch((error) => {
    checkDeadline();
    throw error;
  });
  checkDeadline();
  return record(body);
}

/** @param {string} path @param {string} key
 * @param {(path: string) => Promise<Record<string, unknown>>} [request]
 * @returns {Promise<unknown[]>} */
async function pages(path, key, request = api) {
  /** @type {unknown[]} */
  const result = [];
  for (let page = 1; page <= 50; page++) {
    /** @type {Record<string, unknown>} */
    const body = await request(`${path}&per_page=100&page=${page}`);
    const items = body[key];
    assert.ok(Array.isArray(items));
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error('The release proof has too many pages.');
}

/** Wait for exact-source push proof within one monotonic forty-minute budget.
 * @param {string} sha */
export async function waitForProof(sha) {
  const deadline = performance.now() + 40 * 60 * 1000;
  let proofError = new assert.AssertionError({
    message: 'The latest push CI Check must pass on this exact source SHA.',
  });
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(proofError),
    Math.max(0, deadline - performance.now()),
  );
  const checkDeadline = () => {
    if (performance.now() >= deadline) controller.abort(proofError);
    controller.signal.throwIfAborted();
  };
  /** @param {string} path */
  const request = (path) => api(path, controller.signal, checkDeadline);
  try {
    for (;;) {
      checkDeadline();
      // API failures stop immediately. Only an absent or rejected proof retries.
      const runs = await pages(
        `actions/workflows/ci.yml/runs?head_sha=${sha}&event=push`,
        'workflow_runs',
        request,
      );
      const checks = await pages(
        `commits/${sha}/check-runs?check_name=Check&filter=latest`,
        'check_runs',
        request,
      );
      checkDeadline();
      try {
        requireProof(runs, checks, sha);
        checkDeadline();
        return;
      } catch (error) {
        if (!(error instanceof assert.AssertionError)) throw error;
        proofError = error;
        checkDeadline();
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(10000, deadline - performance.now())),
        );
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  const sha = process.env.SOURCE_SHA ?? '';
  assert.match(sha, /^[a-f0-9]{40}$/);
  const version = versionFromRef(process.env.GITHUB_REF ?? '');
  const current = await api('commits/main');
  if (version === 'main')
    assert.equal(current.sha, sha, 'A newer main commit exists.');
  else {
    const compare = await api(`compare/${sha}...${String(current.sha)}`);
    assert.ok(
      ['ahead', 'identical'].includes(String(compare.status)),
      'The version must be on main.',
    );
    requireEnvironment(await api('environments/release'));
    const policy = await api('environments/release/deployment-branch-policies');
    assert.ok(Array.isArray(policy.branch_policies));
    assert.equal(policy.branch_policies.length, 1);
    assert.equal(record(policy.branch_policies[0]).type, 'tag');
    assert.equal(record(policy.branch_policies[0]).name, 'v*');
    const tag = await api(`commits/v${version}`);
    assert.equal(tag.sha, sha, 'The version tag moved.');
  }
  await waitForProof(sha);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
