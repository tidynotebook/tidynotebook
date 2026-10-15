import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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

await test('DCO checks PR and merge-group commits using the trusted base script', async (t) => {
  const workflow = await loadYaml('.github/workflows/dco.yml');
  assert.ok('pull_request_target' in record(workflow.on));
  assert.ok('merge_group' in record(workflow.on));
  const job = record(record(workflow.jobs)['sign-off']);
  const steps = Array.isArray(job.steps) ? job.steps.map(record) : [];
  const checkout = steps.find((step) =>
    String(step.uses).startsWith('actions/checkout@'),
  );
  assert.equal(
    record(checkout?.with).ref,
    '${{ github.event.pull_request.base.ref || github.event.merge_group.base_ref }}',
  );
  const script = steps.find((step) => typeof step.run === 'string')?.run;
  assert.equal(typeof script, 'string');
  if (typeof script !== 'string') throw new Error('DCO has no command.');
  await mkdir(join(root, '.tooling'), { recursive: true });
  const directory = await mkdtemp(join(root, '.tooling/dco-workflow-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, 'gh'),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$DCO_ARGS"\nprintf "%s" "$DCO_FIXTURE"\nexit "$DCO_API_EXIT"\n',
    { mode: 0o755 },
  );
  for (const pull of ['392', '']) {
    for (const signed of [true, false]) {
      for (const apiExit of ['0', '1']) {
        const commits = [
          {
            sha: 'head',
            author: null,
            parents: [{}],
            commit: {
              author: { name: 'Contributor', email: 'contributor@example.com' },
              message: signed
                ? 'fix: test\n\nSigned-off-by: Contributor <contributor@example.com>'
                : 'fix: test',
              verification: { verified: false },
            },
          },
        ];
        /** @type {import('node:child_process').SpawnSyncReturns<string>} */
        const result = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH ?? ''}`,
            GITHUB_REPOSITORY: 'owner/repo',
            PULL_REQUEST: pull,
            GROUP_BASE: 'base',
            GROUP_HEAD: 'head',
            DCO_ARGS: join(directory, 'args'),
            DCO_FIXTURE: JSON.stringify(commits),
            DCO_API_EXIT: apiExit,
          },
        });
        assert.equal(
          result.status === 0,
          signed && apiExit === '0',
          result.stderr,
        );
        const args = await readFile(join(directory, 'args'), 'utf8');
        assert.ok(
          args.includes(
            pull
              ? 'repos/owner/repo/pulls/392/commits'
              : 'repos/owner/repo/compare/base...head',
          ),
        );
        assert.ok(args.includes('--paginate\n--slurp'));
      }
    }
  }
});
