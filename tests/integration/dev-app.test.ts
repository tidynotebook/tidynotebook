import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase } from './support/database.ts';
import { devEnvironment, devSettings } from './support/dev-app.ts';

await test('the local server config uses the selected port and separate roles', async () => {
  const database = await createDisposableDatabase();
  const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-dev-config-'));
  try {
    const environment = devEnvironment(
      database,
      storageRoot,
      3123,
      'a-local-secret-with-enough-random-length',
    );
    const config = loadServerConfig(environment);
    assert.equal(config.origin, 'http://127.0.0.1:3123');
    assert.deepEqual(config.listen, { host: '127.0.0.1', port: 3123 });
    assert.equal(config.databaseUrl, database.runtimeUrl);
    assert.equal(config.authDatabaseUrl, database.authUrl);
    assert.equal(config.storageRoot, storageRoot);
    assert.notEqual(config.databaseUrl, config.authDatabaseUrl);
  } finally {
    await database.destroy();
    await rm(storageRoot, { recursive: true, force: true });
  }
});

await test('a local run takes more settings of its own and never replaces its own', () => {
  assert.deepEqual(devSettings(undefined, []), {});
  assert.deepEqual(
    devSettings(
      JSON.stringify({
        NOTESAPP_ACCOUNT_PORTAL_URL: 'https://billing.example.test',
      }),
      ['NOTESAPP_ORIGIN'],
    ),
    { NOTESAPP_ACCOUNT_PORTAL_URL: 'https://billing.example.test' },
  );
  for (const text of [
    '[]',
    JSON.stringify({ PATH: '/bin' }),
    JSON.stringify({ NOTESAPP_PORT: 3 }),
    JSON.stringify({ NOTESAPP_ORIGIN: 'http://evil.test' }),
  ])
    assert.throws(() => devSettings(text, ['NOTESAPP_ORIGIN']), Error, text);
});
