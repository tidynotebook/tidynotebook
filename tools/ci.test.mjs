import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const gate = workflow.split("node <<'JS'\n")[1]?.split('\n          JS')[0];
assert.ok(gate, 'the required result check has an executable gate');

function results(source = 'true', image = 'true') {
  return {
    scope: { result: 'success', outputs: { source, image } },
    static: { result: 'success' },
    tests: { result: source === 'true' ? 'success' : 'skipped' },
    performance: { result: source === 'true' ? 'success' : 'skipped' },
    image: { result: image === 'true' ? 'success' : 'skipped' },
  };
}

/** @param {unknown} jobs */
function run(jobs) {
  return spawnSync(process.execPath, ['--eval', gate ?? ''], {
    encoding: 'utf8',
    env: { ...process.env, RESULTS: JSON.stringify(jobs) },
  }).status;
}

await test('the served workflow accepts complete source and document proof', () => {
  assert.equal(run(results()), 0);
  assert.equal(run(results('false', 'false')), 0);
  assert.equal(run(results('true', 'false')), 0);
});

await test('the required result refuses failed, cancelled and missing selected work', () => {
  for (const name of ['scope', 'static', 'tests', 'performance', 'image']) {
    for (const result of ['failure', 'cancelled', 'skipped', '']) {
      const jobs = results();
      Reflect.set(jobs, name, { ...Reflect.get(jobs, name), result });
      assert.notEqual(run(jobs), 0, `${name}: ${result}`);
    }
  }
  assert.notEqual(run(results('', 'false')), 0);
  assert.notEqual(run(results('false', '')), 0);
  const docs = results('false', 'false');
  docs.static.result = 'skipped';
  assert.notEqual(run(docs), 0);
});
