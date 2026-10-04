/**
 * The key of an identity account after the issuer left it (record 0135).
 *
 * An installation that ran the release before migration 0021 holds password
 * accounts with the issuer that Better Auth 1.7.0 to 1.7.2 wrote. Each check
 * reads what a person gets: a sign-in of the old account and a new sign-up.
 * The schema checks read the table that the migration left.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultAccountLimitBytes } from '@notesapp/core';
import { createAuth, loadServerConfig } from '@notesapp/server';
import {
  authRole,
  createDocumentService,
  createTestDatabase,
  dropTestDatabase,
  openIdentityStore,
  runMigrations,
  runtimeRole,
  testAuthPassword,
  testRuntimePassword,
  withCredentials,
} from '@notesapp/storage-server';
import { openSession, testServerUrl } from './support/database.ts';
import {
  migrationsBefore,
  registerFirstAccountOfEarlierRelease,
  writeIssuerAccount,
} from './support/earlier-schema.ts';

const serverUrl = testServerUrl();
const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const migrationUrl = await createTestDatabase(serverUrl, name);
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-account-key-'));
const earlier = await migrationsBefore('0021_auth_account_provider_key');
const run = {
  documents: createDocumentService(),
  databaseUrl: migrationUrl,
  runtimePassword: testRuntimePassword,
  authPassword: testAuthPassword,
};
await runMigrations({ ...run, migrationsFolder: earlier.folder });

const config = loadServerConfig({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: withCredentials(
    migrationUrl,
    runtimeRole,
    testRuntimePassword,
  ),
  NOTESAPP_AUTH_DATABASE_URL: withCredentials(
    migrationUrl,
    authRole,
    testAuthPassword,
  ),
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'auth-account-key-test-secret-0123456789',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
  NOTESAPP_RATE_LIMIT_MAX: '10000',
  NOTESAPP_BREACH_CHECK: 'off',
});
const identity = openIdentityStore(config.databaseUrl, { poolSize: 1 });
const auth = createAuth(config, {
  mail: null,
  allowSignUp: true,
  sessionAllowed: async (id) => (await identity.sessionAccount(id)) !== null,
});
const owner = await openSession(migrationUrl);

/** The status of one password sign-in. */
async function signIn(email: string, password: string): Promise<number> {
  const response: unknown = await auth.auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  return response instanceof Response ? response.status : 0;
}

/** Links an identity user to a new account, as the first run did then. */
async function register(authUserId: string): Promise<void> {
  const runtime = await openSession(config.databaseUrl);
  try {
    const account = await registerFirstAccountOfEarlierRelease(
      runtime,
      authUserId,
      defaultAccountLimitBytes,
    );
    assert.ok(account !== null);
  } finally {
    await runtime.close();
  }
}

const kept = { email: 'kept@notes.invalid', password: 'kept-password-12345' };
const keptUserId = await writeIssuerAccount(owner, {
  email: kept.email,
  passwordHash: await (await auth.auth.$context).password.hash(kept.password),
  emailVerified: true,
});
await register(keptUserId);
await runMigrations(run);

await test('an account from before the migration still signs in', async () => {
  assert.equal(await signIn(kept.email, kept.password), 200);
  assert.notEqual(await signIn(kept.email, 'not-the-password-12345'), 200);
});

await test('a new sign-up writes its password account', async () => {
  const email = 'new@notes.invalid';
  const made: unknown = await auth.auth.api.signUpEmail({
    body: { email, name: email, password: 'new-account-password-123' },
  });
  const user: unknown =
    made !== null && typeof made === 'object'
      ? Reflect.get(made, 'user')
      : null;
  const userId: unknown =
    user !== null && typeof user === 'object' ? Reflect.get(user, 'id') : null;
  assert.ok(typeof userId === 'string');
  const rows = await owner.query<{
    provider_id: string;
    has_password: boolean;
  }>(
    'select provider_id, password is not null as has_password from auth_account where user_id = $1',
    [userId],
  );
  assert.deepEqual(rows, [{ provider_id: 'credential', has_password: true }]);
});

await test('the table has no issuer and keys an account by its provider', async () => {
  const columns = await owner.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'auth_account'",
  );
  assert.ok(columns.length > 0);
  assert.ok(!columns.some((column) => column.column_name === 'issuer'));
  const duplicate = await owner.failure(
    `insert into auth_account (id, user_id, account_id, provider_id)
     values ($1, $2, $2, 'credential')`,
    [randomUUID(), keptUserId],
  );
  // The row identifier is new, so only the provider key can refuse it.
  assert.equal(duplicate.code, '23505');
});

await owner.close();
await auth.close();
await identity.close();
await dropTestDatabase(serverUrl, name);
await earlier.remove();
await rm(storageRoot, { recursive: true, force: true });
