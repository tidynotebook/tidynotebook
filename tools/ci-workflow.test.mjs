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

const manual = "github.event_name == 'workflow_dispatch'";

await test('the workflow runs on a pull request and by hand, never on a push', async () => {
  const workflow = await loadYaml('.github/workflows/ci.yml');
  const triggers = record(workflow.on);
  assert.ok('pull_request' in triggers);
  assert.ok('workflow_dispatch' in triggers);
  assert.ok(!('push' in triggers));
});

await test('the Check job is fast and runs on every trigger', async () => {
  const workflow = await loadYaml('.github/workflows/ci.yml');
  const job = record(record(workflow.jobs).check);
  assert.equal(job.if, undefined);
  assert.ok(Number(job['timeout-minutes']) <= 10);
  const steps = Array.isArray(job.steps) ? job.steps.map(record) : [];
  const commands = steps
    .map((step) => (typeof step.run === 'string' ? step.run : ''))
    .join('\n');
  for (const command of [
    'pnpm contract:lint',
    'pnpm generated:check',
    'pnpm typecheck',
    'pnpm lint',
    'pnpm format:check',
  ])
    assert.ok(commands.includes(command), command);
  assert.ok(!commands.includes('pnpm verify'));
  assert.ok(!commands.includes('pnpm build'));
});

await test('the full jobs run only when a person starts the workflow', async () => {
  const workflow = await loadYaml('.github/workflows/ci.yml');
  const jobs = record(workflow.jobs);
  for (const name of ['verify', 'performance', 'image'])
    assert.equal(record(jobs[name]).if, manual, name);
});

await test('Dependabot opens its pull requests monthly', async () => {
  const config = await loadYaml('.github/dependabot.yml');
  const updates = Array.isArray(config.updates) ? config.updates : [];
  assert.ok(updates.length > 0);
  for (const update of updates)
    assert.equal(record(record(update).schedule).interval, 'monthly');
});
