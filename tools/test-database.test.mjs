import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { record, root } from './workspace.mjs';

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
      '#!/bin/sh\ntest -z "${NOTESAPP_TEST_DATABASE_URL+x}${NOTESAPP_RUNTIME_PASSWORD+x}${NOTESAPP_AUTH_DATABASE_PASSWORD+x}" || exit 44\necho "pnpm $*" >> calls\nexit "$MIGRATE_EXIT"\n',
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
          NOTESAPP_TEST_DATABASE_URL: 'postgres://stale.invalid/notesapp_test',
          NOTESAPP_RUNTIME_PASSWORD: 'stale-runtime',
          NOTESAPP_AUTH_DATABASE_PASSWORD: 'stale-auth',
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

await test('stale service overrides cannot reach migration, write, read or object-store connections', () => {
  const directory = mkdtempSync(join(tmpdir(), 'compose-overrides-'));
  const require = createRequire(import.meta.url);
  const log = join(directory, 'connections');
  const hook = join(directory, 'connections.mjs');
  try {
    // Stop at the real client boundary, before any socket can open. The URLs
    // name reserved invalid hosts, never a real external database or store.
    writeFileSync(
      hook,
      `
import pg from ${JSON.stringify(pathToFileURL(require.resolve('pg')).href)};
import { S3Client } from ${JSON.stringify(pathToFileURL(require.resolve('@aws-sdk/client-s3')).href)};
import { appendFileSync } from 'node:fs';
const record = (value) => appendFileSync(${JSON.stringify(log)}, JSON.stringify(value) + '\\n');
pg.Client.prototype.connect = async function () {
  const { host, port, database, user } = this.connectionParameters;
  record({ kind: 'postgres', host, port, database, user });
  throw new Error('Synthetic connection stopped before network access');
};
S3Client.prototype.send = async function () {
  const { hostname, port } = await this.config.endpoint();
  record({ kind: 's3', host: hostname, port });
  throw new Error('Synthetic connection stopped before network access');
};
`,
    );
    writeFileSync(join(directory, 'docker'), '#!/bin/sh\nexit 0\n', {
      mode: 0o700,
    });
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => key !== 'NODE_TEST_CONTEXT',
        ),
      ),
      PATH: `${directory}:${process.env.PATH}`,
      NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`,
      NOTESAPP_TEST_DATABASE_URL:
        'postgres://stale:stale@stale.invalid:6543/notesapp_test',
      NOTESAPP_TEST_S3_ENDPOINT: 'https://stale.invalid:9443',
      AWS_ENDPOINT_URL: 'https://stale.invalid:9443',
      AWS_ENDPOINT_URL_S3: 'https://stale.invalid:9443',
      PGHOST: 'stale.invalid',
      PGPORT: '6543',
      PGDATABASE: 'notesapp_test',
      PGUSER: 'stale',
      NOTESAPP_RUNTIME_PASSWORD: 'stale-runtime',
      NOTESAPP_AUTH_DATABASE_PASSWORD: 'stale-auth',
    };
    const manifest = record(
      JSON.parse(
        readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
      ),
    );
    const database = pathToFileURL(
      join(root, 'tests/integration/support/database.ts'),
    ).href;
    const objects = pathToFileURL(
      join(root, 'tests/integration/support/object-store.ts'),
    ).href;
    const postgres = {
      kind: 'postgres',
      host: '127.0.0.1',
      port: 55432,
      database: 'notesapp_test',
      user: 'notesapp_migrate',
    };
    const scenarios = [
      {
        command: String(record(manifest.scripts)['test:services']),
        expected: postgres,
      },
      {
        code: `import { createDisposableDatabase } from ${JSON.stringify(database)}; await createDisposableDatabase();`,
        expected: postgres,
      },
      {
        code: `import { openSession, testServerUrl, testPassword, testIdentityPassword } from ${JSON.stringify(database)};
if (testPassword() !== 'notesapp_app_test_password' || testIdentityPassword() !== 'notesapp_auth_test_password') throw new Error('Stale role password');
await openSession(testServerUrl());`,
        expected: postgres,
      },
      {
        code: `import { createTestBucket } from ${JSON.stringify(objects)}; await createTestBucket();`,
        expected: { kind: 's3', host: '127.0.0.1', port: 59000 },
      },
    ];
    for (const scenario of scenarios) {
      rmSync(log, { force: true });
      const result =
        scenario.command === undefined
          ? spawnSync(
              process.execPath,
              ['--input-type=module', '-e', String(scenario.code)],
              { cwd: root, env, encoding: 'utf8' },
            )
          : spawnSync('sh', ['-c', scenario.command], {
              cwd: root,
              env,
              encoding: 'utf8',
            });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(
        result.stdout + result.stderr,
        /Synthetic connection stopped before network access/,
      );
      assert.deepEqual(
        readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
        [scenario.expected],
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
