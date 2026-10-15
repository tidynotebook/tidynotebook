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
