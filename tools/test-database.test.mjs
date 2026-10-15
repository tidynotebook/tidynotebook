import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { record } from './workspace.mjs';

await test('shared database setup migrates once before it returns and propagates failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'database-setup-'));
  try {
    writeFileSync(
      join(directory, 'docker'),
      '#!/bin/sh\nif [ "$1" = ps ]; then echo fixture; elif [ "$1" = inspect ]; then echo healthy; fi\n',
      { mode: 0o700 },
    );
    writeFileSync(
      join(directory, 'pnpm'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SETUP_LOG"\nexit "${SETUP_EXIT:-0}"\n',
      { mode: 0o700 },
    );
    const log = join(directory, 'calls');
    const env = {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      SETUP_LOG: log,
    };
    const script = new URL(
      './test-database/ensure-postgres.sh',
      import.meta.url,
    ).pathname;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync('bash', [script], { env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        readFileSync(log, 'utf8').trim().split('\n'),
        Array(attempt + 1).fill('db:migrate --profile test'),
      );
    }
    assert.equal(
      spawnSync('bash', [script], { env: { ...env, SETUP_EXIT: '9' } }).status,
      9,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('local integration runs use shared setup after the build', () => {
  const manifest = record(
    JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ),
  );
  const script = record(manifest.scripts)['test:integration'];
  assert.equal(typeof script, 'string');
  assert.match(
    String(script),
    /^pnpm run build && tools\/test-database\/ensure-postgres.sh/,
  );
});
