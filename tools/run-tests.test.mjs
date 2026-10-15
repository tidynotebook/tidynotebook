import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { testArguments } from './run-tests.mjs';

await test('named tests and a shard remain separate', () => {
  assert.deepEqual(testArguments(['--', 'sync', '--shard=2/4']), {
    names: ['sync'],
    flags: ['--test-shard=2/4'],
  });
  assert.deepEqual(testArguments([]), { names: [], flags: [] });
  for (const args of [
    ['--shard=0/4'],
    ['--shard=5/4'],
    ['--shard=1/0'],
    ['--shard=x'],
    ['--shard=1/2', '--shard=2/2'],
  ])
    assert.throws(() => testArguments(args));
});

await test('the real Node runner covers each file once across shards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'test-shards-'));
  try {
    const files = Array.from({ length: 6 }, (_, index) => {
      const file = join(directory, `${index}.test.mjs`);
      writeFileSync(
        file,
        `import test from 'node:test'; test('fixture-${index}', () => {});`,
      );
      return file;
    });
    const seen = [];
    for (let index = 1; index <= 3; index++) {
      const { flags } = testArguments([`--shard=${index}/3`]);
      const result = spawnSync(
        process.execPath,
        ['--test', '--test-reporter=tap', ...flags, ...files],
        {
          encoding: 'utf8',
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) => key !== 'NODE_TEST_CONTEXT',
            ),
          ),
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /fixture-/, result.stdout);
      seen.push(
        ...[...result.stdout.matchAll(/^ok \d+ - fixture-(\d+)$/gm)].map(
          (match) => match[1],
        ),
      );
    }
    assert.deepEqual(seen.sort(), ['0', '1', '2', '3', '4', '5']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
