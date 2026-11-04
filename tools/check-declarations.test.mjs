import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { record } from './workspace.mjs';

await test('typed lint builds absent declarations and stops on either tool failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'typed-lint-'));
  try {
    const manifest = record(
      JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
      ),
    );
    const script = record(manifest.scripts)['lint:types'];
    assert.equal(typeof script, 'string');
    writeFileSync(
      join(directory, 'tsc'),
      '#!/bin/sh\necho build >> calls\n[ "$BUILD_EXIT" = 0 ] || exit "$BUILD_EXIT"\necho declaration > output.d.ts\n',
      { mode: 0o700 },
    );
    writeFileSync(
      join(directory, 'oxlint'),
      '#!/bin/sh\ntest -s output.d.ts || exit 42\necho lint >> calls\nexit "$LINT_EXIT"\n',
      { mode: 0o700 },
    );
    for (const [build, lint, expected, calls] of [
      [0, 0, 0, 'build\nlint\n'],
      [9, 0, 9, 'build\n'],
      [0, 7, 7, 'build\nlint\n'],
    ]) {
      rmSync(join(directory, 'output.d.ts'), { force: true });
      rmSync(join(directory, 'calls'), { force: true });
      const result = spawnSync('sh', ['-c', String(script)], {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          BUILD_EXIT: String(build),
          LINT_EXIT: String(lint),
        },
        encoding: 'utf8',
      });
      assert.equal(result.status, expected, result.stderr);
      assert.equal(readFileSync(join(directory, 'calls'), 'utf8'), calls);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
