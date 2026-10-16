import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { record, root } from './workspace.mjs';

/** @param {unknown} value
 * @returns {value is {load: (source: string) => unknown}} */
function yamlModule(value) {
  return typeof record(value).load === 'function';
}

/** Read a YAML file of the repository with the installed parser.
 * @param {string} path */
async function loadYaml(path) {
  const web = createRequire(join(root, 'apps/web/package.json'));
  const mermaid = createRequire(web.resolve('mermaid'));
  const parser = createRequire(mermaid.resolve('chevrotain'));
  /** @type {unknown} */
  const yaml = parser('js-yaml');
  assert.ok(yamlModule(yaml));
  return record(yaml.load(await readFile(join(root, path), 'utf8')));
}

await test('CI runs only lint on pull requests with read-only access', async () => {
  const workflow = await loadYaml('.github/workflows/ci.yml');
  assert.deepEqual(Object.keys(record(workflow.on)), ['pull_request']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(record(workflow.concurrency)['cancel-in-progress'], true);
  const jobs = record(workflow.jobs);
  assert.deepEqual(Object.keys(jobs), ['lint']);
  const job = record(jobs.lint);
  assert.equal(job.name, 'Lint');
  const steps = Array.isArray(job.steps) ? job.steps.map(record) : [];
  assert.deepEqual(
    steps.filter((step) => step.run).map((step) => step.run),
    ['pnpm install --frozen-lockfile', 'pnpm lint'],
  );
});

await test('Dependabot opens its pull requests monthly', async () => {
  const config = await loadYaml('.github/dependabot.yml');
  const updates = Array.isArray(config.updates) ? config.updates : [];
  assert.ok(updates.length > 0);
  for (const update of updates)
    assert.equal(record(record(update).schedule).interval, 'monthly');
});

await test('the fast forward workflow runs trusted code by hand with narrow access', async () => {
  const path = '.github/workflows/ff-only-merge.yml';
  const workflow = await loadYaml(path);
  const on = record(workflow.on);
  assert.deepEqual(Object.keys(on), ['workflow_dispatch']);
  const inputs = record(record(on.workflow_dispatch).inputs);
  assert.deepEqual(Object.keys(inputs), [
    'pr_number',
    'expected_head_sha',
    'dry_run',
  ]);
  for (const input of Object.values(inputs))
    assert.equal(record(input).required, true);
  assert.equal(record(inputs.dry_run).type, 'boolean');
  assert.equal(record(inputs.dry_run).default, true);
  assert.deepEqual(workflow.permissions, {
    contents: 'write',
    'pull-requests': 'read',
    checks: 'read',
    statuses: 'read',
  });
  assert.deepEqual(workflow.concurrency, {
    group: 'ff-only-main',
    'cancel-in-progress': false,
    queue: 'max',
  });
  const jobs = Object.values(record(workflow.jobs)).map(record);
  assert.equal(jobs.length, 1);
  const job = record(jobs[0]);
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.ok(typeof job['timeout-minutes'] === 'number');
  assert.equal(job.permissions, undefined);
  const steps = Array.isArray(job.steps) ? job.steps.map(record) : [];
  const checkouts = steps.filter((step) =>
    String(step.uses).startsWith('actions/checkout@'),
  );
  assert.equal(checkouts.length, 1);
  const checkout = record(checkouts[0]?.with);
  assert.equal(checkout.ref, '${{ github.workflow_sha }}');
  assert.equal(checkout['persist-credentials'], false);
  assert.equal(checkout.repository, undefined);
  const runs = steps.filter((step) => step.run !== undefined);
  assert.deepEqual(
    runs.map((step) => step.run),
    ['node tools/ff-only-merge.mjs'],
  );
  assert.deepEqual(record(runs[0]?.env), {
    GITHUB_TOKEN: '${{ github.token }}',
    PR_NUMBER: '${{ inputs.pr_number }}',
    EXPECTED_HEAD_SHA: '${{ inputs.expected_head_sha }}',
    DRY_RUN: '${{ inputs.dry_run }}',
  });
  const source = await readFile(join(root, path), 'utf8');
  const uses = [...source.matchAll(/^\s*- uses: (.+)$/gm)].map(
    (match) => match[1] ?? '',
  );
  assert.equal(uses.length, steps.filter((step) => step.uses).length);
  for (const line of uses)
    assert.match(line, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  assert.doesNotMatch(source, /secrets\./);
});

await test('the comment workflow runs trusted code on new comments with narrow access', async () => {
  const path = '.github/workflows/ff-merge-comment.yml';
  const workflow = await loadYaml(path);
  assert.deepEqual(workflow.on, { issue_comment: { types: ['created'] } });
  assert.deepEqual(workflow.permissions, {
    contents: 'write',
    'pull-requests': 'write',
    checks: 'read',
    statuses: 'read',
  });
  assert.equal(workflow.concurrency, undefined);
  const jobs = Object.values(record(workflow.jobs)).map(record);
  assert.equal(jobs.length, 1);
  const job = record(jobs[0]);
  for (const part of [
    "github.ref == 'refs/heads/main'",
    'github.event.issue.pull_request',
    "github.event.comment.user.type == 'User'",
    "startsWith(github.event.comment.body, '/ff-merge')",
    'github.event.comment.author_association',
  ])
    assert.ok(String(job.if).includes(part), part);
  assert.deepEqual(job.concurrency, {
    group: 'ff-only-main',
    'cancel-in-progress': false,
    queue: 'max',
  });
  assert.ok(typeof job['timeout-minutes'] === 'number');
  assert.equal(job.permissions, undefined);
  const steps = Array.isArray(job.steps) ? job.steps.map(record) : [];
  const checkout = record(
    steps.find((step) => String(step.uses).startsWith('actions/checkout@'))
      ?.with,
  );
  assert.equal(checkout.ref, '${{ github.workflow_sha }}');
  assert.equal(checkout['persist-credentials'], false);
  const runs = steps.filter((step) => step.run !== undefined);
  assert.deepEqual(
    runs.map((step) => step.run),
    ['node tools/ff-merge-comment.mjs'],
  );
  assert.deepEqual(record(runs[0]?.env), {
    GITHUB_TOKEN: '${{ github.token }}',
    PR_NUMBER: '${{ github.event.issue.number }}',
    COMMENT_ID: '${{ github.event.comment.id }}',
    COMMENT_USER_ID: '${{ github.event.comment.user.id }}',
    COMMENT_USER_LOGIN: '${{ github.event.comment.user.login }}',
    COMMENT_CREATED_AT: '${{ github.event.comment.created_at }}',
  });
  const source = await readFile(join(root, path), 'utf8');
  for (const match of source.matchAll(/^\s*- uses: (.+)$/gm))
    assert.match(
      match[1] ?? '',
      /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/,
    );
  assert.doesNotMatch(source, /secrets\.|comment\.body \}\}/);
});
