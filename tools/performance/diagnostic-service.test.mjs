/** Checks the exact temporary diagnostic, its timer placement and safe records. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { record } from '../workspace.mjs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseSync } from 'oxc-parser';
import { canonicalDigest, diagnosticSource } from './diagnostic-service.mjs';
import { queryCategory } from './diagnostic-profile.mjs';

const source = await readFile(new URL('./service.ts', import.meta.url), 'utf8');

await test('the diagnostic uses the accepted canonical workload and its exact timer scope', () => {
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    canonicalDigest,
  );
  const generated = diagnosticSource(source);
  const parsed = parseSync('generated-service.ts', generated);
  assert.deepEqual(parsed.errors, []);
  assert.match(
    generated,
    /await beginSave\(migrationUrl\);\n  await saveRound\(0, false\);/,
  );
  assert.match(generated, /await endSave\(migrationUrl\);\n  const saveP95Ms/);
  assert.match(
    generated,
    /markRound\(round, measured, 'start'\);\n    await Promise\.all\(\n      prepared\.map/,
  );
  assert.match(
    generated,
    /saveSamples\.push\(elapsed\);\n      \}\),\n    \);\n    markRound\(round, measured, 'end'\);/,
  );
  const restored = generated
    .replace(
      "\nimport { beginSave, endSave, finishDiagnostic, markRound } from '../../tools/performance/diagnostic-profile.mjs';",
      '',
    )
    .replace("from '../../tools/performance/corpus.ts';", "from './corpus.ts';")
    .replace('  await beginSave(migrationUrl);\n', '')
    .replace('  await endSave(migrationUrl);\n', '')
    .replace("    markRound(round, measured, 'start');\n", '')
    .replace("    markRound(round, measured, 'end');\n", '')
    .replace('  await finishDiagnostic();\n', '');
  assert.equal(restored, source);
});

await test('any missing, duplicate or changed canonical input refuses the diagnostic', () => {
  assert.throws(
    () => diagnosticSource(source.replace('await saveRound(0, false);', '')),
    /source changed/,
  );
  assert.throws(
    () => diagnosticSource(source + '\nawait saveRound(0, false);'),
    /source changed/,
  );
  assert.throws(
    () =>
      diagnosticSource(
        source.replace('const activeUsers = 20;', 'const activeUsers = 1;'),
      ),
    /source changed/,
  );
});

await test('query records contain only fixed categories and never literals or parameters', () => {
  const privateValue = 'private-note-and-test-secret';
  for (const text of [
    `select '${privateValue}' from "files"`,
    `insert into "search_index" values ('${privateValue}')`,
    `delete from "${privateValue}"`,
    `select pg_advisory_xact_lock('${privateValue}')`,
    `begin; set local synchronous_commit to off; select pg_notify('${privateValue}', '${privateValue}'); commit`,
    { text: privateValue, values: [privateValue] },
  ])
    assert.equal(queryCategory(text).includes(privateValue), false);
  assert.equal(
    queryCategory('select id from workspaces where id = $1'),
    'select workspaces',
  );
  assert.equal(
    queryCategory(
      "select current_setting('notesapp.sync_hints', true) as mark; commit",
    ),
    'commit',
  );
  assert.equal(queryCategory(null), 'unknown');
});

await test('the actual workflow keeps the canonical gate and runs only its failure diagnostic', async () => {
  const web = createRequire(
    new URL('../../apps/web/package.json', import.meta.url),
  );
  const mermaid = createRequire(web.resolve('mermaid'));
  const parser = createRequire(mermaid.resolve('chevrotain'));
  /** @type {unknown} */
  const yaml = parser('js-yaml');
  const load = record(yaml)['load'];
  assert.equal(typeof load, 'function');
  if (typeof load !== 'function') throw new Error('The YAML parser is absent.');
  const workflow = record(
    load(
      await readFile(
        new URL('../../.github/workflows/ci.yml', import.meta.url),
        'utf8',
      ),
    ),
  );
  const steps = record(record(workflow['jobs'])['performance'])['steps'];
  assert.ok(Array.isArray(steps));
  const canonical = record(
    steps.find((step) => record(step)['id'] === 'service_budget'),
  );
  assert.equal(canonical['run'], 'pnpm perf:service');
  assert.equal(canonical['continue-on-error'], undefined);
  const diagnostic = record(
    steps.find((step) => record(step)['id'] === 'save_diagnostic'),
  );
  const condition = diagnostic['if'];
  assert.equal(typeof condition, 'string');
  if (typeof condition !== 'string')
    throw new Error('The diagnostic condition is absent.');
  // These operators and the fixed status function have the same semantics in JavaScript.
  const run = new Function('failure', 'steps', `return (${condition});`);
  assert.equal(
    run(() => true, { service_budget: { outcome: 'failure' } }),
    true,
  );
  assert.equal(
    run(() => true, { service_budget: { outcome: 'skipped' } }),
    false,
  );
  assert.equal(
    run(() => false, { service_budget: { outcome: 'success' } }),
    false,
  );
  assert.equal(diagnostic['continue-on-error'], undefined);
});
