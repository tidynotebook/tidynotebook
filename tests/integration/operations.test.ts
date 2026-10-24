/**
 * Integration tests for deployment operations, health and readiness probes,
 * request log redaction, host encryption checks, and backup and restore.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { createTestBucket, type TestBucket } from './support/object-store.ts';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import {
  createAppWithHandlers,
  createHandlers,
  databaseProbes,
  evaluateReadiness,
  loadProtectedEnvironment,
  loadServerConfig,
  redactUrl,
  storageProbe,
  type ReadinessCheck,
  type ReadinessProbe,
} from '@notesapp/server';
import {
  createDocumentService,
  openFileObjectStore,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import {
  createDisposableDatabase,
  openSession,
  testServerUrl,
  type TestDatabase,
} from './support/database.ts';
import {
  anonymousIdentity,
  completeTestHandlers,
  stubProtocol,
  testEnvironment,
} from './support/server.ts';

await test('the root address and the API address give the same answer', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'notesapp-ops-health-'));
  try {
    const config = loadServerConfig(testEnvironment(tempDir));
    const app = await createAppWithHandlers(config, {
      handlers: completeTestHandlers(createHandlers(config)),
      identity: anonymousIdentity,
      protocols: [stubProtocol],
      webDist: null,
    });

    for (const pair of [
      ['/health', '/api/health'],
      ['/ready', '/api/ready'],
    ]) {
      const [rootPath, apiPath] = pair;
      assert.ok(rootPath !== undefined && apiPath !== undefined);
      const root = await app.inject({ method: 'GET', url: rootPath });
      const api = await app.inject({ method: 'GET', url: apiPath });
      assert.equal(root.statusCode, 200, rootPath);
      assert.equal(api.statusCode, 200, apiPath);
      assert.equal(root.headers['content-type'], api.headers['content-type']);
      assert.deepEqual(
        JSON.parse(root.body),
        JSON.parse(api.body),
        pair.join(' and '),
      );
    }

    await app.close();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

await test('readiness reports degraded when a probe fails', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'notesapp-ops-ready-'));
  try {
    const config = loadServerConfig(testEnvironment(tempDir));

    const failingProbe: ReadinessProbe = () =>
      Promise.resolve({
        name: 'database',
        status: 'degraded',
        detail: 'Simulated connection failure',
      });

    const handlers = createHandlers(config, [failingProbe]);
    const app = await createAppWithHandlers(config, {
      handlers: completeTestHandlers(handlers),
      identity: anonymousIdentity,
      protocols: [stubProtocol],
      webDist: null,
    });

    const res = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(res.statusCode, 503);
    const body: unknown = JSON.parse(res.body);
    assert.ok(
      typeof body === 'object' && body !== null,
      'the readiness problem is a record',
    );
    assert.ok('code' in body && 'status' in body);
    assert.equal(body.code, 'not_ready');
    assert.equal(body.status, 503);

    await app.close();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

await test('storage probe detects missing or unwritable directory', async () => {
  const missingDir = join(tmpdir(), `notesapp-nonexistent-${Date.now()}`);
  const probe = storageProbe(missingDir, openFileObjectStore(missingDir));
  const result = await probe();
  assert.equal(result.name, 'storage');
  assert.equal(result.status, 'degraded');
});

/** The check of one name inside a readiness report. */
function checkNamed(
  checks: readonly ReadinessCheck[],
  name: string,
): ReadinessCheck {
  const found = checks.find((check) => check.name === name);
  assert.ok(found !== undefined, `the report holds the ${name} check`);
  return found;
}

await test('a database that no pool can reach reports degraded', async () => {
  const store = openWorkspaceStore(
    'postgres://invalid:invalid@127.0.0.1:1/invalid',
    createDocumentService(),
  );
  try {
    const report = await evaluateReadiness(
      databaseProbes(() => store.probeDatabase()),
      'full',
    );
    assert.equal(report.status, 'degraded');
    assert.equal(checkNamed(report.checks, 'database').status, 'degraded');
    assert.equal(checkNamed(report.checks, 'migration').status, 'degraded');
  } finally {
    await store.close();
  }
});

/**
 * Issue 24 and finding 11 of the architecture review of 2026-09-11.
 *
 * The readiness probes opened a throwaway connection on every call, and an
 * orchestrator repeats that call every few seconds forever. The database
 * itself proves the fix here: the test caps the database at the connections
 * that the pool already holds, so a probe that opened one of its own would be
 * refused and would report a degraded database.
 */
/** How long the readiness connection test waits for one ended backend to exit. */
const backendExitBoundMs = 5000;

await test('a readiness probe opens no database connection of its own', async () => {
  const database = await createDisposableDatabase();
  // The administration session runs on the server database, so it takes none
  // of the connections that this test counts.
  const admin = await openSession(testServerUrl());
  // A row with no user name is a background worker of the server, such as an
  // autovacuum worker. It is not a connection of the store, so only the
  // sessions of a role count here, as in the teardown of a database.
  const openCount = async (): Promise<number> => {
    const rows = await admin.query<{ count: string }>(
      'select count(*)::text as count from pg_stat_activity where datname = $1 and usename is not null',
      [database.name],
    );
    return Number(rows[0]?.count ?? '0');
  };
  // The migration step may leave a connection behind, and it would widen the
  // limit below and hide the defect. The call without a timeout returns
  // before the backend exits, so the count below could still see it. With a
  // timeout, each call waits until its backend is gone.
  const ended = await admin.query<{ ended: boolean }>(
    'select pg_terminate_backend(pid, $2) as ended from pg_stat_activity where datname = $1 and usename is not null',
    [database.name, backendExitBoundMs],
  );
  assert.ok(
    ended.every((row) => row.ended),
    `a backend did not exit in ${String(backendExitBoundMs)} ms`,
  );
  assert.equal(await openCount(), 0, 'no session of the database remains');
  const store = openWorkspaceStore(
    database.runtimeUrl,
    createDocumentService(),
    { poolSize: 1 },
  );
  const limit = async (value: number): Promise<void> => {
    const statement = await admin.query<{ text: string }>(
      'select format($1, $2::text, $3::int) as text',
      ['alter database %I connection limit %s', database.name, value],
    );
    const text = statement[0]?.text;
    assert.ok(text !== undefined);
    await admin.query(text);
  };
  try {
    const probes = databaseProbes(() => store.probeDatabase());
    // The first read opens the one pooled connection of this store.
    assert.equal((await evaluateReadiness(probes, 'full')).status, 'ok');
    assert.equal(
      await openCount(),
      1,
      'the read borrows the one pooled connection and opens no other',
    );
    await limit(1);

    // Every later read must reuse that connection, because the database now
    // refuses a second one.
    for (let call = 0; call < 5; call += 1) {
      const report = await evaluateReadiness(probes, 'full');
      assert.equal(report.status, 'ok', `readiness call ${String(call + 1)}`);
      assert.equal(checkNamed(report.checks, 'database').status, 'ok');
      assert.equal(checkNamed(report.checks, 'migration').status, 'ok');
    }
  } finally {
    // A failed check must not leave the limit behind, so the teardown can
    // always reach the database.
    await limit(-1);
    await admin.close();
    await store.close();
    await database.destroy();
  }
});

await test('protected configuration files load without exposing their values', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'notesapp-ops-config-'));
  try {
    const secretFile = join(tempDir, 'auth-secret');
    writeFileSync(secretFile, 'a-protected-secret-with-at-least-32-characters');
    const loaded = await loadProtectedEnvironment({
      NOTESAPP_AUTH_SECRET_FILE: secretFile,
    });
    assert.equal(
      loaded['NOTESAPP_AUTH_SECRET'],
      'a-protected-secret-with-at-least-32-characters',
    );
    await assert.rejects(
      loadProtectedEnvironment({
        NOTESAPP_AUTH_SECRET: 'direct-value',
        NOTESAPP_AUTH_SECRET_FILE: secretFile,
      }),
      /set either NOTESAPP_AUTH_SECRET or NOTESAPP_AUTH_SECRET_FILE/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

await test('the request log redacts query strings', () => {
  assert.equal(
    redactUrl('/api/workspaces/123/search?q=classifiedQuery'),
    '/api/workspaces/123/search?[redacted]',
  );
  assert.equal(redactUrl('/api/health'), '/api/health');
});

await test('no metrics route is served', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'notesapp-ops-metrics-'));
  try {
    const config = loadServerConfig(testEnvironment(tempDir));
    const app = await createAppWithHandlers(config, {
      handlers: completeTestHandlers(createHandlers(config)),
      identity: anonymousIdentity,
      protocols: [stubProtocol],
      webDist: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { host: '127.0.0.1' },
    });
    assert.equal(res.statusCode, 404);

    await app.close();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

await test('host encryption verification script', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'notesapp-ops-encrypt-'));
  try {
    const scriptPath = join(process.cwd(), 'tools/ops/check-host.sh');

    // Without encryption marker, non-encrypted filesystem fails
    assert.throws(
      () => {
        execFileSync(
          scriptPath,
          [
            '--storage-dir',
            tempDir,
            '--db-dir',
            tempDir,
            '--wal-dir',
            tempDir,
            '--backup-dir',
            tempDir,
            '--temp-dir',
            tempDir,
            '--crash-dir',
            tempDir,
          ],
          { stdio: 'pipe' },
        );
      },
      (err: unknown) => err !== null,
    );

    // With simulated encryption marker and --allow-simulated, check passes
    writeFileSync(join(tempDir, '.encrypted_marker'), 'test');
    const output = execFileSync(
      scriptPath,
      [
        '--storage-dir',
        tempDir,
        '--db-dir',
        tempDir,
        '--wal-dir',
        tempDir,
        '--backup-dir',
        tempDir,
        '--temp-dir',
        tempDir,
        '--crash-dir',
        tempDir,
        '--allow-simulated',
      ],
      { encoding: 'utf8' },
    );
    assert.ok(output.includes('Host encryption check PASSED'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

for (const backend of [
  'filesystem',
  's3',
  'filesystem-to-s3',
  's3-to-filesystem',
])
  await test(`${backend} backup and restore round-trip a note with its history and attachments`, async () => {
    const sourceStorage = await mkdtemp(join(tmpdir(), 'notesapp-backup-src-'));
    const targetStorage = await mkdtemp(join(tmpdir(), 'notesapp-backup-tgt-'));
    const backupRoot = await mkdtemp(join(tmpdir(), 'notesapp-backups-'));
    const configRoot = await mkdtemp(join(tmpdir(), 'notesapp-backup-config-'));

    let sourceDb: TestDatabase | null = null;
    let targetDb: TestDatabase | null = null;
    let sourceBucket: TestBucket | null = null;
    let targetBucket: TestBucket | null = null;
    let sourceOptions: string[] = [];
    let targetOptions: string[] = [];

    try {
      sourceDb = await createDisposableDatabase();
      targetDb = await createDisposableDatabase();
      if (backend === 's3' || backend === 's3-to-filesystem')
        sourceBucket = await createTestBucket();
      if (backend === 's3' || backend === 'filesystem-to-s3')
        targetBucket = await createTestBucket();
      function configFile(bucket: TestBucket, label: string): string {
        const accessKeyIdFile = join(configRoot, `${label}-access`);
        const secretAccessKeyFile = join(configRoot, `${label}-secret`);
        const settingsFile = join(configRoot, `${label}-store.json`);
        writeFileSync(accessKeyIdFile, bucket.settings.accessKeyId, {
          mode: 0o600,
        });
        writeFileSync(secretAccessKeyFile, bucket.settings.secretAccessKey, {
          mode: 0o600,
        });
        writeFileSync(
          settingsFile,
          JSON.stringify({
            bucket: bucket.settings.bucket,
            region: bucket.settings.region,
            endpoint: bucket.settings.endpoint,
            accessKeyIdFile,
            secretAccessKeyFile,
          }),
          { mode: 0o600 },
        );
        return settingsFile;
      }
      if (sourceBucket)
        sourceOptions = [
          '--object-store-config-file',
          configFile(sourceBucket, 'source'),
        ];
      if (targetBucket)
        targetOptions = [
          '--object-store-config-file',
          configFile(targetBucket, 'target'),
        ];
      function assertNoS3Secrets(output: { stdout: string; stderr: string }) {
        for (const bucket of [sourceBucket, targetBucket]) {
          if (!bucket) continue;
          for (const text of [output.stdout, output.stderr])
            assert.equal(
              text.includes(bucket.settings.secretAccessKey),
              false,
              'Command output must not contain the S3 secret.',
            );
        }
      }
      const schemaStore = openWorkspaceStore(
        sourceDb.runtimeUrl,
        createDocumentService(),
        {
          poolSize: 1,
        },
      );
      const schemaReport = await evaluateReadiness(
        databaseProbes(() => schemaStore.probeDatabase()),
        'full',
      );
      await schemaStore.close();
      assert.equal(schemaReport.status, 'ok');

      // Create attachment file and database record in source
      const content = Buffer.from('dummy attachment content');
      const digest = createHash('sha256').update(content).digest('hex');
      const workspaceId = randomUUID();
      const relFolder = join('workspaces', workspaceId, 'attachments');
      mkdirSync(join(sourceStorage, relFolder), { recursive: true });
      const objectKey = `${relFolder}/${digest}`;
      if (sourceBucket) {
        await sourceBucket.store.write(
          objectKey,
          Readable.from([content]),
          content.length,
        );
        assert.equal(existsSync(join(sourceStorage, relFolder, digest)), false);
      } else {
        writeFileSync(join(sourceStorage, relFolder, digest), content);
      }

      const objectId = randomUUID();
      const pgClient = new pg.Client({
        connectionString: sourceDb.migrationUrl,
      });
      await pgClient.connect();
      await pgClient.query(
        'INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, now())',
        [workspaceId, 'Backup Test Workspace'],
      );
      await pgClient.query(
        `INSERT INTO attachment_objects (workspace_id, id, digest, size, media_type, state)
       VALUES ($1, $2, $3, $4, 'text/plain', 'finalized')`,
        [workspaceId, objectId, digest, content.length],
      );
      await pgClient.query(
        `INSERT INTO contents (workspace_id, digest, kind, size, object_id)
       VALUES ($1, $2, 'attachment', $3, $4)`,
        [workspaceId, digest, content.length, objectId],
      );

      // One real note with two saved versions, so the cycle covers note text and
      // its history and not only an attachment file.
      const accountId = randomUUID();
      const fileId = randomUUID();
      const notePath = 'notes/backup-round-trip.md';
      const bodies = [
        '# First save\n\nOriginal text.\n',
        '# Second save\n\nEdited text.\n',
      ];
      const noteDigests = bodies.map((body) =>
        createHash('sha256').update(body, 'utf8').digest('hex'),
      );
      const revisionIds = [randomUUID(), randomUUID()];
      await pgClient.query(
        'INSERT INTO accounts (id, limit_bytes) VALUES ($1, 1048576)',
        [accountId],
      );
      await pgClient.query(
        `INSERT INTO memberships (workspace_id, account_id, role)
       VALUES ($1, $2, 'owner')`,
        [workspaceId, accountId],
      );
      await pgClient.query(
        `INSERT INTO files (workspace_id, id, path, kind, deleted)
       VALUES ($1, $2, $3, 'note', false)`,
        [workspaceId, fileId, notePath],
      );
      for (const [index, body] of bodies.entries()) {
        const changesetId = randomUUID();
        await pgClient.query(
          `INSERT INTO contents (workspace_id, digest, kind, size, markdown)
         VALUES ($1, $2, 'markdown', $3, $4)`,
          [workspaceId, noteDigests[index], Buffer.byteLength(body), body],
        );
        await pgClient.query(
          `INSERT INTO changesets (workspace_id, id, mutation_id, actor_account_id, device_id, request_digest, cursor)
         VALUES ($1, $2, $3, $4, 'backup-test-device', $5, $6)`,
          [
            workspaceId,
            changesetId,
            randomUUID(),
            accountId,
            noteDigests[index],
            index + 1,
          ],
        );
        await pgClient.query(
          `INSERT INTO revisions (workspace_id, id, file_id, content_digest, path, deleted, changeset_id, actor_account_id, client_time)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7, now())`,
          [
            workspaceId,
            revisionIds[index],
            fileId,
            noteDigests[index],
            notePath,
            changesetId,
            accountId,
          ],
        );
      }
      await pgClient.query(
        `INSERT INTO revision_parents (workspace_id, child_id, parent_id, ordinal)
       VALUES ($1, $2, $3, 0)`,
        [workspaceId, revisionIds[1], revisionIds[0]],
      );
      await pgClient.query(
        'UPDATE files SET head_revision_id = $3 WHERE workspace_id = $1 AND id = $2',
        [workspaceId, fileId, revisionIds[1]],
      );
      await pgClient.query(
        'INSERT INTO live_paths (workspace_id, file_id, path) VALUES ($1, $2, $3)',
        [workspaceId, fileId, notePath],
      );
      await pgClient.end();

      const databaseUrlFile = join(configRoot, 'database-url');
      const targetDatabaseUrlFile = join(configRoot, 'target-database-url');
      const keyFile = join(configRoot, 'backup-key');
      const installationIdFile = join(configRoot, 'installation-id');
      writeFileSync(databaseUrlFile, sourceDb.migrationUrl);
      writeFileSync(targetDatabaseUrlFile, targetDb.migrationUrl);
      writeFileSync(
        keyFile,
        'test-backup-key-with-more-than-thirty-two-characters',
      );
      writeFileSync(installationIdFile, randomUUID());
      for (const file of [
        databaseUrlFile,
        targetDatabaseUrlFile,
        keyFile,
        installationIdFile,
      ])
        chmodSync(file, 0o600);
      const postgresPort = new URL(sourceDb.migrationUrl).port;
      assert.notEqual(postgresPort, '', 'The test database URL needs a port.');
      const postgresContainer = execFileSync(
        'docker',
        ['ps', '--filter', `publish=${postgresPort}`, '--format', '{{.ID}}'],
        { encoding: 'utf8' },
      ).trim();
      assert.notEqual(
        postgresContainer,
        '',
        `No container publishes PostgreSQL port ${postgresPort}.`,
      );
      assert.equal(
        postgresContainer.includes('\n'),
        false,
        `More than one container publishes PostgreSQL port ${postgresPort}.`,
      );

      // Run backup script
      const backupScript = join(process.cwd(), 'tools/ops/backup.sh');
      const backupArguments = [
        ...sourceOptions,
        '--storage-root',
        sourceStorage,
        '--backup-root',
        backupRoot,
        '--database-url-file',
        databaseUrlFile,
        '--key-file',
        keyFile,
        '--installation-id-file',
        installationIdFile,
        '--postgres-container',
        postgresContainer,
      ];
      if (sourceBucket) {
        const settingsFile = sourceOptions[1];
        assert.ok(settingsFile);
        for (const file of [settingsFile, join(configRoot, 'source-secret')]) {
          chmodSync(file, 0o640);
          try {
            const refused = spawnSync(backupScript, backupArguments, {
              encoding: 'utf8',
            });
            assertNoS3Secrets(refused);
            assert.notEqual(refused.status, 0);
            assert.match(refused.stderr, /protected|must not be readable/);
            assert.deepEqual(readdirSync(backupRoot), []);
          } finally {
            chmodSync(file, 0o600);
          }
        }
      }
      const backupOutput = spawnSync(backupScript, backupArguments, {
        encoding: 'utf8',
      });
      assertNoS3Secrets(backupOutput);
      assert.equal(backupOutput.status, 0, 'Backup must succeed.');
      assert.ok(backupOutput.stdout.includes('Backup completed successfully'));

      const backupFiles = readdirSync(backupRoot);
      assert.equal(backupFiles.length, 1);
      const backupName = backupFiles.at(0);
      assert.ok(backupName !== undefined);
      const backupFile = join(backupRoot, backupName);
      assert.match(backupFile, /[.]tar[.]gpg$/);

      // Verify backup using verify script
      const verifyScript = join(process.cwd(), 'tools/ops/verify-backup.sh');
      const verifyOutput = execFileSync(
        verifyScript,
        [
          '--backup-file',
          backupFile,
          '--key-file',
          keyFile,
          '--installation-id-file',
          installationIdFile,
        ],
        { encoding: 'utf8' },
      );
      assert.ok(verifyOutput.includes('Verification passed'));

      // A missing or corrupt referenced object must leave no completed archive.
      for (const fault of ['missing', 'digest', 'unavailable']) {
        if (fault === 'unavailable' && !sourceBucket) continue;
        const failedRoot = join(configRoot, `failed-${fault}`);
        let faultOptions = sourceOptions;
        if (fault === 'unavailable') {
          assert.ok(sourceBucket);
          await sourceBucket.store.write(
            objectKey,
            Readable.from([content]),
            content.length,
          );
          const invalidConfig = join(configRoot, 'unavailable.json');
          const sourceConfig = sourceOptions[1];
          assert.ok(sourceConfig);
          const settings: unknown = JSON.parse(
            readFileSync(sourceConfig, 'utf8'),
          );
          assert.ok(settings !== null && typeof settings === 'object');
          writeFileSync(
            invalidConfig,
            JSON.stringify({ ...settings, endpoint: 'http://127.0.0.1:1' }),
            { mode: 0o600 },
          );
          faultOptions = ['--object-store-config-file', invalidConfig];
        } else if (sourceBucket) {
          if (fault === 'missing') await sourceBucket.store.remove(objectKey);
          else
            await sourceBucket.store.write(
              objectKey,
              Readable.from([Buffer.alloc(content.length)]),
              content.length,
            );
        } else if (fault === 'missing') {
          await rm(join(sourceStorage, relFolder, digest));
        } else {
          writeFileSync(
            join(sourceStorage, relFolder, digest),
            Buffer.alloc(content.length),
          );
        }
        const failed = spawnSync(
          backupScript,
          [
            ...faultOptions,
            '--storage-root',
            sourceStorage,
            '--backup-root',
            failedRoot,
            '--database-url-file',
            databaseUrlFile,
            '--key-file',
            keyFile,
            '--installation-id-file',
            installationIdFile,
            '--postgres-container',
            postgresContainer,
          ],
          { encoding: 'utf8' },
        );
        assertNoS3Secrets(failed);
        assert.notEqual(failed.status, 0);
        if (fault === 'unavailable') {
          assert.match(failed.stderr, /service availability/);
          assert.doesNotMatch(failed.stderr, /database digest or size/);
        }
        assert.equal(
          failed.stdout.includes('Backup completed successfully'),
          false,
        );
        assert.deepEqual(readdirSync(failedRoot), []);
      }

      const restoreScript = join(process.cwd(), 'tools/ops/restore.sh');
      const restoreArguments = [
        ...targetOptions,
        '--backup-file',
        backupFile,
        '--storage-root',
        targetStorage,
        '--database-url-file',
        targetDatabaseUrlFile,
        '--key-file',
        keyFile,
        '--installation-id-file',
        installationIdFile,
        '--postgres-container',
        postgresContainer,
      ];
      const targetClient = new pg.Client({
        connectionString: targetDb.migrationUrl,
      });
      await targetClient.connect();
      try {
        // Compare all public table data, including existing target records.
        async function databaseState() {
          const tables = await targetClient.query<{ tablename: string }>(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
          );
          const state = [];
          for (const { tablename } of tables.rows) {
            const name = tablename.replaceAll('"', '""');
            const rows = await targetClient.query<{ value: unknown }>(
              `SELECT to_jsonb(t) AS value FROM public."${name}" t ORDER BY to_jsonb(t)::text`,
            );
            state.push({ table: tablename, rows: rows.rows });
          }
          return state;
        }
        async function bucketState() {
          const state = [];
          if (targetBucket) {
            for await (const { key } of targetBucket.store.list('')) {
              const value = await targetBucket.store.read(key);
              assert.ok(value);
              state.push({ key, content: await buffer(value) });
            }
          }
          return state.sort((a, b) => a.key.localeCompare(b.key));
        }
        for (const occupied of ['storage root', 'database', 'bucket']) {
          if (occupied === 'bucket' && !targetBucket) continue;
          const existingFile = join(targetStorage, 'existing');
          const existingWorkspace = randomUUID();
          if (occupied === 'storage root') writeFileSync(existingFile, 'keep');
          if (occupied === 'database')
            await targetClient.query(
              'INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, now())',
              [existingWorkspace, 'Keep this workspace'],
            );
          if (occupied === 'bucket') {
            assert.ok(targetBucket);
            await targetBucket.store.write(
              'staging/existing',
              Readable.from(['keep']),
              4,
            );
          }
          const beforeDatabase = await databaseState();
          const beforeBucket = await bucketState();
          const beforeFiles = readdirSync(targetStorage, { recursive: true });
          const refused = spawnSync(restoreScript, restoreArguments, {
            encoding: 'utf8',
          });
          assertNoS3Secrets(refused);
          assert.equal(refused.error, undefined);
          assert.notEqual(refused.status, null);
          assert.notEqual(refused.status, 0);
          assert.ok(
            refused.stderr
              .toLowerCase()
              .includes(
                `the target ${occupied === 'bucket' ? 'object storage bucket' : occupied} is not empty`,
              ),
            refused.stderr,
          );
          assert.equal(
            refused.stdout.includes('Restoration completed successfully'),
            false,
          );
          assert.deepEqual(await databaseState(), beforeDatabase);
          assert.deepEqual(await bucketState(), beforeBucket);
          assert.deepEqual(
            readdirSync(targetStorage, { recursive: true }),
            beforeFiles,
          );
          if (occupied === 'storage root') {
            assert.equal(readFileSync(existingFile, 'utf8'), 'keep');
            await rm(existingFile);
          }
          if (occupied === 'database')
            await targetClient.query('DELETE FROM workspaces WHERE id = $1', [
              existingWorkspace,
            ]);
          if (occupied === 'bucket') {
            assert.ok(targetBucket);
            await targetBucket.store.remove('staging/existing');
          }
        }
      } finally {
        await targetClient.end();
      }

      // Run restore into target environment.
      const restoreOutput = spawnSync(restoreScript, restoreArguments, {
        encoding: 'utf8',
      });
      assertNoS3Secrets(restoreOutput);
      assert.equal(restoreOutput.status, 0, 'Restore must succeed.');
      assert.ok(
        restoreOutput.stdout.includes('Restoration completed successfully'),
      );

      // Verify that the restored storage root contains the attachment
      const restoredFile = join(targetStorage, relFolder, digest);
      if (targetBucket) {
        assert.equal(existsSync(restoredFile), false);
        const restored = await targetBucket.store.read(objectKey);
        assert.ok(restored);
        assert.deepEqual(await buffer(restored), content);
      } else {
        assert.ok(existsSync(restoredFile));
        assert.deepEqual(readFileSync(restoredFile), content);
      }

      // The note and its two saved versions survive the cycle with their text.
      const restoredClient = new pg.Client({
        connectionString: targetDb.migrationUrl,
      });
      await restoredClient.connect();
      try {
        const counts = await restoredClient.query<{
          files: string;
          revisions: string;
          parents: string;
        }>(
          `SELECT (SELECT count(*) FROM files WHERE workspace_id = $1)::text AS files,
                (SELECT count(*) FROM revisions WHERE workspace_id = $1)::text AS revisions,
                (SELECT count(*) FROM revision_parents WHERE workspace_id = $1)::text AS parents`,
          [workspaceId],
        );
        assert.deepEqual(counts.rows.at(0), {
          files: '1',
          revisions: '2',
          parents: '1',
        });

        const history = await restoredClient.query<{
          markdown: string;
          path: string;
          is_head: boolean;
        }>(
          `SELECT c.markdown, r.path, (f.head_revision_id = r.id) AS is_head
         FROM revisions r
         JOIN contents c
           ON c.workspace_id = r.workspace_id AND c.digest = r.content_digest
         JOIN files f
           ON f.workspace_id = r.workspace_id AND f.id = r.file_id
         WHERE r.workspace_id = $1 AND r.file_id = $2
         ORDER BY c.markdown`,
          [workspaceId, fileId],
        );
        assert.deepEqual(
          history.rows.map((row) => row.markdown),
          bodies,
        );
        assert.deepEqual(
          history.rows.map((row) => row.path),
          [notePath, notePath],
        );
        assert.deepEqual(
          history.rows.map((row) => row.is_head),
          [false, true],
        );

        const parent = await restoredClient.query<{ parent_id: string }>(
          'SELECT parent_id FROM revision_parents WHERE workspace_id = $1 AND child_id = $2',
          [workspaceId, revisionIds[1]],
        );
        assert.equal(parent.rows.at(0)?.parent_id, revisionIds[0]);
      } finally {
        await restoredClient.end();
      }
    } finally {
      if (sourceBucket) await sourceBucket.destroy();
      if (targetBucket) await targetBucket.destroy();
      if (sourceDb) await sourceDb.destroy();
      if (targetDb) await targetDb.destroy();
      await rm(sourceStorage, { recursive: true, force: true });
      await rm(targetStorage, { recursive: true, force: true });
      await rm(backupRoot, { recursive: true, force: true });
      await rm(configRoot, { recursive: true, force: true });
    }
  });
