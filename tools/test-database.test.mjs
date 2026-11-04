import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { record } from './workspace.mjs';

await test('test services wait for Compose health, migrate once, and stop on failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'test-services-'));
  try {
    const manifest = record(
      JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
      ),
    );
    const scripts = record(manifest.scripts);
    writeFileSync(
      join(directory, 'docker'),
      '#!/bin/sh\necho "docker $*" >> calls\nexit "$COMPOSE_EXIT"\n',
      { mode: 0o700 },
    );
    writeFileSync(
      join(directory, 'pnpm'),
      '#!/bin/sh\necho "pnpm $*" >> calls\nexit "$MIGRATE_EXIT"\n',
      { mode: 0o700 },
    );
    for (const [compose, migrate, expected] of [
      [0, 0, 0],
      [8, 0, 8],
      [0, 9, 9],
    ]) {
      rmSync(join(directory, 'calls'), { force: true });
      const result = spawnSync('sh', ['-c', String(scripts['test:services'])], {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          COMPOSE_EXIT: String(compose),
          MIGRATE_EXIT: String(migrate),
        },
      });
      assert.equal(result.status, expected, result.stderr);
      assert.deepEqual(
        readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n'),
        [
          'docker compose -p notesapp-test -f compose.test.yaml up -d --wait',
          ...(compose === 0 ? ['pnpm db:migrate --profile test'] : []),
        ],
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('integration starts only after its build and service migration succeed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'integration-setup-'));
  try {
    const manifest = record(
      JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
      ),
    );
    const scripts = record(manifest.scripts);
    writeFileSync(
      join(directory, 'pnpm'),
      '#!/bin/sh\ncase "$1" in\nrun) echo build >> calls; exit "$BUILD_EXIT";;\ntest:services) exec sh -c "$SERVICE_SCRIPT";;\ndb:migrate) echo migrate >> calls; exit "$MIGRATE_EXIT";;\n*) exit 43;;\nesac\n',
      { mode: 0o700 },
    );
    writeFileSync(
      join(directory, 'docker'),
      '#!/bin/sh\necho ready >> calls\nexit "$COMPOSE_EXIT"\n',
      { mode: 0o700 },
    );
    writeFileSync(
      join(directory, 'node'),
      '#!/bin/sh\necho tests >> calls\nexit "$TEST_EXIT"\n',
      { mode: 0o700 },
    );
    for (const [build, compose, migrate, tests, status, calls] of [
      [0, 0, 0, 0, 0, 'build\nready\nmigrate\ntests\n'],
      [6, 0, 0, 0, 6, 'build\n'],
      [0, 8, 0, 0, 8, 'build\nready\n'],
      [0, 0, 9, 0, 9, 'build\nready\nmigrate\n'],
      [0, 0, 0, 7, 7, 'build\nready\nmigrate\ntests\n'],
    ]) {
      rmSync(join(directory, 'calls'), { force: true });
      const result = spawnSync(
        'sh',
        ['-c', String(scripts['test:integration'])],
        {
          cwd: directory,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            SERVICE_SCRIPT: String(scripts['test:services']),
            BUILD_EXIT: String(build),
            COMPOSE_EXIT: String(compose),
            MIGRATE_EXIT: String(migrate),
            TEST_EXIT: String(tests),
          },
        },
      );
      assert.equal(result.status, status, result.stderr);
      assert.equal(readFileSync(join(directory, 'calls'), 'utf8'), calls);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
