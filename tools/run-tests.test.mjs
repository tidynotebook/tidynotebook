import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { selectedTests } from './run-tests.mjs';
import { record } from './workspace.mjs';

const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'),
);

await test('native unit patterns cover each selected file once across three shards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'unit-patterns-'));
  try {
    const selected = [
      'apps/web/src/a.test.ts',
      'packages/core/src/deep/b.test.ts',
      'tools/a.test.mjs',
      'tools/b.test.ts',
      'tools/sdk-codegen/src/deep/c.test.ts',
    ];
    const excluded = [
      'tests/integration/a.test.ts',
      'tests/browser/a.test.ts',
      'tests/image/a.test.ts',
      'apps/web/dist/a.test.ts',
      'packages/core/dist/a.test.ts',
      'tools/fixture/a.test.ts',
    ];
    for (const file of [...selected, ...excluded]) {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      writeFileSync(
        join(directory, file),
        `import test from 'node:test'; test(${JSON.stringify(file)}, () => {});`,
      );
    }
    copyFileSync(
      new URL('../node-test.config.json', import.meta.url),
      join(directory, 'node-test.config.json'),
    );
    const manifest = record(
      JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
      ),
    );
    const command = String(record(manifest.scripts)['test:unit:run']);
    const seen = [];
    for (let index = 1; index <= 3; index++) {
      const result = spawnSync(
        'sh',
        [
          '-c',
          command.replace(
            'node ',
            `node --test-reporter=tap --no-experimental-test-coverage --test-shard=${index}/3 `,
          ),
        ],
        { cwd: directory, env, encoding: 'utf8' },
      );
      assert.equal(result.status, 0, result.stderr);
      seen.push(
        ...[
          ...result.stdout.matchAll(/^ok \d+ - (.+\.test\.(?:ts|mjs))$/gm),
        ].map((match) => match[1] ?? ''),
      );
    }
    assert.deepEqual(
      seen.sort((left, right) => left.localeCompare(right)),
      selected.sort((left, right) => left.localeCompare(right)),
    );
    writeFileSync(
      join(directory, selected[0] ?? ''),
      "throw new Error('deliberate unit failure');",
    );
    assert.notEqual(
      spawnSync(
        'sh',
        [
          '-c',
          command.replace('node ', 'node --no-experimental-test-coverage '),
        ],
        {
          cwd: directory,
          env,
          encoding: 'utf8',
        },
      ).status,
      0,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('integration scheduling covers every file once and separates the slow files', () => {
  const files = [
    'a.test.ts',
    'sync.test.ts',
    'b.test.ts',
    'oauth-startup.test.ts',
    'revisions.test.ts',
    'c.test.ts',
  ];
  assert.deepEqual(selectedTests(files, undefined).slice(0, 3), [
    'sync.test.ts',
    'oauth-startup.test.ts',
    'revisions.test.ts',
  ]);
  const seen = [];
  for (let index = 1; index <= 4; index++) {
    const selected = selectedTests(files, `${index}/4`);
    assert.ok(
      selected.filter((file) =>
        ['sync.test.ts', 'oauth-startup.test.ts', 'revisions.test.ts'].includes(
          file,
        ),
      ).length <= 1,
    );
    seen.push(...selected);
  }
  assert.deepEqual(
    seen.sort((left, right) => left.localeCompare(right)),
    [...files].sort((left, right) => left.localeCompare(right)),
  );
  for (const shard of [
    '0/4',
    '5/4',
    '1/0',
    'x',
    '1/2/3',
    '9007199254740992/9007199254740992',
  ])
    assert.throws(() => selectedTests(files, shard));
});

await test('integration command propagates failure and keeps coverage configurable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'integration-runner-'));
  try {
    mkdirSync(join(directory, 'tools'));
    mkdirSync(join(directory, 'tests/integration'), { recursive: true });
    for (const name of ['run-tests.mjs', 'workspace.mjs'])
      copyFileSync(
        new URL(name, import.meta.url),
        join(directory, 'tools', name),
      );
    copyFileSync(
      new URL('../node-test.config.json', import.meta.url),
      join(directory, 'node-test.config.json'),
    );
    const file = join(directory, 'tests/integration/fixture.test.mjs');
    writeFileSync(
      file,
      "import test from 'node:test'; test('fixture', () => {});",
    );
    for (const coverage of ['on', 'off']) {
      const result = spawnSync(
        process.execPath,
        ['tools/run-tests.mjs', 'integration'],
        {
          cwd: directory,
          env: { ...env, NOTESAPP_COVERAGE: coverage },
          encoding: 'utf8',
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.stdout.includes('coverage report'),
        coverage === 'on',
        result.stdout,
      );
    }
    writeFileSync(file, "throw new Error('deliberate integration failure');");
    const failure = spawnSync(
      process.execPath,
      ['tools/run-tests.mjs', 'integration'],
      { cwd: directory, env, encoding: 'utf8' },
    );
    assert.equal(failure.status, 1, failure.stdout + failure.stderr);
    assert.match(
      failure.stdout + failure.stderr,
      /deliberate integration failure/,
    );
    for (const args of [
      ['unit'],
      ['integration', '--shard=x'],
      ['integration', '--shard=1/4', '--shard=2/4'],
    ])
      assert.notEqual(
        spawnSync(process.execPath, ['tools/run-tests.mjs', ...args], {
          cwd: directory,
          env,
          encoding: 'utf8',
        }).status,
        0,
      );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
