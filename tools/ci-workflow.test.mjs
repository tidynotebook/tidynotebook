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

await test('proof runs on pull requests, merge groups, main and manual dispatch', async () => {
  const workflow = await loadYaml('.github/workflows/ci.yml');
  const triggers = record(workflow.on);
  for (const event of ['pull_request', 'merge_group', 'workflow_dispatch'])
    assert.ok(event in triggers, event);
  assert.deepEqual(record(triggers.push).branches, ['main']);
});

await test('the final Check waits for all selected proof even after a failure', async () => {
  const workflow = await loadYaml('.github/workflows/ci.yml');
  const job = record(record(workflow.jobs).check);
  assert.equal(job.if, 'always()');
  assert.deepEqual(job.needs, [
    'scope',
    'static',
    'tests',
    'performance',
    'image',
  ]);
});

await test('source and image jobs follow the selected scope on every trigger', async () => {
  const workflow = await loadYaml('.github/workflows/ci.yml');
  const jobs = record(workflow.jobs);
  for (const name of ['tests', 'performance'])
    assert.equal(
      record(jobs[name]).if,
      "needs.scope.outputs.source == 'true'",
      name,
    );
  assert.equal(record(jobs.image).if, "needs.scope.outputs.image == 'true'");
  assert.equal(record(jobs.static).if, undefined);
});

await test('Dependabot opens its pull requests monthly', async () => {
  const config = await loadYaml('.github/dependabot.yml');
  const updates = Array.isArray(config.updates) ? config.updates : [];
  assert.ok(updates.length > 0);
  for (const update of updates)
    assert.equal(record(record(update).schedule).interval, 'monthly');
});
