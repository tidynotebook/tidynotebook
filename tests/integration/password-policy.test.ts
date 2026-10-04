/**
 * The one password policy and its breach check (record 0116).
 *
 * The breach service is a stub here, so the test decides whether a password
 * is listed and whether the service answers. The real service is the default
 * of the configuration, and nothing in this file reaches it.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultAccountLimitBytes } from '@notesapp/core';
import {
  authProblemCode,
  createAuth,
  createAuthPool,
  loadServerConfig,
  registerIdentity,
  sessionAllowedBy,
} from '@notesapp/server';
import { openIdentityStore } from '@notesapp/storage-server';
import { createDisposableDatabase, openSession } from './support/database.ts';

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-password-'));
const config = loadServerConfig({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'password-policy-test-secret-0123456789',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
});
const identity = openIdentityStore(config.databaseUrl, { poolSize: 2 });
const pool = createAuthPool(config);

/** What the stub service answers for the next check. */
let service: 'listed' | 'clear' | 'down' = 'clear';
const asked: string[] = [];
let unavailable = 0;
const auth = createAuth(
  config,
  {
    mail: null,
    allowSignUp: true,
    sessionAllowed: sessionAllowedBy(identity),
    breachQuery: (prefix) => {
      asked.push(prefix);
      if (service === 'down') return Promise.resolve(null);
      // A listed answer names the suffix of the listed password, and a clear
      // answer names a suffix that no password of this file has.
      return Promise.resolve(service === 'listed' ? listedRange : 'AAAA:1');
    },
    onBreachUnavailable: () => {
      unavailable += 1;
    },
  },
  pool,
);

/** The range answer that lists the password below. */
const listedPassword = 'correct horse battery staple';
const listedRange = `${'X'.repeat(35)}:0\n${suffixOf(listedPassword)}:42`;

/** The digest suffix of one password, as the service lists it. */
function suffixOf(password: string): string {
  return createHash('sha1')
    .update(password, 'utf8')
    .digest('hex')
    .toUpperCase()
    .slice(5);
}

/** Registers the first account with one password. */
function registerWith(password: string, email: string) {
  return registerIdentity(auth.auth, identity, {
    email,
    name: email,
    password,
    ground: { kind: 'first-run' },
    newAccount: {
      limitBytes: defaultAccountLimitBytes,
      standing: 'active',
      removeAfterSeconds: null,
    },
  });
}

/** Whether an identity user of one address exists. */
async function userExists(email: string): Promise<boolean> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query(
      'select 1 from auth_user where email = $1',
      [email],
    );
    return rows.length === 1;
  } finally {
    await session.close();
  }
}

await test('a listed password is refused and leaves no identity user', async () => {
  service = 'listed';
  const refused = await registerWith(listedPassword, 'listed@notes.invalid');
  assert.deepEqual(refused, {
    ok: false,
    error: { code: 'password_breached', fileIds: [] },
  });
  assert.equal(await userExists('listed@notes.invalid'), false);
  // Only five characters of the digest left the server.
  assert.ok(asked.every((prefix) => /^[0-9A-F]{5}$/.test(prefix)));
});

await test('a password shorter than the policy is refused', async () => {
  service = 'clear';
  const refused = await registerWith('fourteen-chars', 'short@notes.invalid');
  assert.equal(refused.ok, false);
  assert.equal(await userExists('short@notes.invalid'), false);
});

await test('an outage of the service accepts the password and says so', async () => {
  service = 'down';
  const before = unavailable;
  const made = await registerWith(
    'a passphrase of the first account',
    'first@notes.invalid',
  );
  assert.equal(made.ok, true);
  assert.equal(unavailable, before + 1);
});

await test('the refusal of the library reads as the one problem code', () => {
  assert.equal(authProblemCode(400, 'PASSWORD_BREACHED'), 'password_breached');
  assert.equal(authProblemCode(400, null), 'invalid_request');
  assert.equal(authProblemCode(401, 'OTHER'), 'unauthenticated');
});

await auth.close();
await pool.end();
await identity.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
