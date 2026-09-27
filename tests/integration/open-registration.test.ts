/**
 * Open registration with a verified address, through the served composition
 * (record 0114).
 *
 * The server sends every message to a transport of this test, so each check
 * reads what an address receives: the verification link, the message to the
 * owner of a known address, or nothing over the limit. Each check also reads
 * what a person gets: the status, the body, and whether a sign-in works.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createOwner,
  getAccount,
  getSetupStatus,
  getSignUpChallenge,
  signInWithPassword,
  signUpAccount,
  updateInstallation,
  verifyAddress,
} from '@notesapp/api-client';
import {
  defaultAccountLimitBytes,
  leadingZeroBits,
  proofInput,
} from '@notesapp/core';
import {
  createApp,
  createAuth,
  loadServerConfig,
  type MailMessage,
} from '@notesapp/server';
import {
  authRole,
  createDocumentService,
  createTestDatabase,
  dropTestDatabase,
  migrationsFolder,
  openIdentityStore,
  runMigrations,
  runtimeRole,
  testAuthPassword,
  testRuntimePassword,
  withCredentials,
} from '@notesapp/storage-server';
import {
  createDisposableDatabase,
  openSession,
  testServerUrl,
} from './support/database.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

function problemCode(error: unknown): unknown {
  return memberOf(error, 'code');
}

/** One member of an unknown value, without asserting its shape. */
function memberOf(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

function cookieHeader(values: readonly string[]): string {
  return values
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

/** The environment of a server over one database. */
function environment(
  runtimeUrl: string,
  authUrl: string,
  storageRoot: string,
): Record<string, string> {
  return {
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_DATABASE_URL: runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: 'open-registration-test-secret-0123456789',
    NOTESAPP_LOG_LEVEL: 'silent',
    NOTESAPP_MAX_BODY_BYTES: '1048576',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_RATE_LIMIT_MAX: '10000',
    NOTESAPP_BREACH_CHECK: 'off',
    // The least difficulty, so each sign-up of this test costs little.
    NOTESAPP_SIGNUP_DIFFICULTY: '8',
  };
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-open-test-'));
const config = loadServerConfig(
  environment(database.runtimeUrl, database.authUrl, storageRoot),
);
const sent: MailMessage[] = [];
const app = await createApp(config, {
  mail: {
    send: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  },
});
await app.listen({ host: '127.0.0.1', port: 0 });
const address: string | AddressInfo | null = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('The test server did not bind a TCP port.');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
const origin = { origin: 'http://127.0.0.1' };

const ownerEmail = 'owner@notes.invalid';
const ownerPassword = 'owner-password-123456';
const created = await createOwner({
  headers: origin,
  body: { email: ownerEmail, password: ownerPassword },
});
assert.equal(responseOf(created.response).status, 201);
const owner = {
  ...origin,
  cookie: cookieHeader(responseOf(created.response).headers.getSetCookie()),
};

/** Sets the registration policy as the operator of the database would. */
async function setPolicy(policy: 'open' | 'invitation'): Promise<void> {
  const session = await openSession(database.migrationUrl);
  try {
    await session.query(
      'update installation_settings set registration_policy = $1',
      [policy],
    );
  } finally {
    await session.close();
  }
}

/** The messages that one address received. */
function mailsTo(email: string): MailMessage[] {
  return sent.filter((message) => message.to === email);
}

/** The token of the last verification link that one address received. */
function lastToken(email: string): string {
  const link = mailsTo(email)
    .flatMap((message) => message.text.split('\n'))
    .filter((line) => line.startsWith('http://127.0.0.1/verify#'))
    .at(-1);
  assert.ok(link !== undefined, `no verification link reached ${email}`);
  return new URL(link).hash.slice(1);
}

/** Whether a sign-in with one address and password starts a session. */
async function signsIn(email: string, password: string): Promise<boolean> {
  const signed = await signInWithPassword({
    headers: origin,
    body: { email, password },
  });
  return responseOf(signed.response).status === 200;
}

/** Solves one challenge the way a browser does. */
function solve(value: string, difficulty: number): string {
  for (let counter = 0; ; counter += 1) {
    const solution = counter.toString(36);
    const digest = createHash('sha256')
      .update(proofInput(value, solution))
      .digest();
    if (leadingZeroBits(digest) >= difficulty) return solution;
  }
}

/** A proof of work for one sign-up (record 0115). */
async function proof(): Promise<{ challenge: string; solution: string }> {
  const issued = await getSignUpChallenge({ headers: origin });
  assert.ok(issued.data !== undefined, JSON.stringify(issued.error));
  return {
    challenge: issued.data.challenge,
    solution: solve(issued.data.value, issued.data.difficulty),
  };
}

async function signUp(email: string, password: string) {
  return signUpAccount({
    headers: origin,
    body: { email, password, proof: await proof() },
  });
}

await test('a sign-up is refused while the policy is not open', async () => {
  const status = await getSetupStatus();
  assert.equal(status.data?.openRegistration, false);
  const closed = await getSignUpChallenge({ headers: origin });
  assert.equal(responseOf(closed.response).status, 403);
  assert.equal(problemCode(closed.error), 'registration_closed');
  const refused = await signUpAccount({
    headers: origin,
    body: {
      email: 'early@notes.invalid',
      password: 'early-password-12345',
      proof: { challenge: 'v1.a.8.1.b', solution: '0' },
    },
  });
  assert.equal(responseOf(refused.response).status, 403);
  assert.equal(problemCode(refused.error), 'registration_closed');
  assert.equal(mailsTo('early@notes.invalid').length, 0);
  await setPolicy('open');
  assert.equal((await getSetupStatus()).data?.openRegistration, true);
});

await test('a known and a new address get the same status and body', async () => {
  const fresh = `fresh-${randomUUID()}@notes.invalid`;
  const known = await signUp(ownerEmail, 'another-password-12345');
  const unknown = await signUp(fresh, 'fresh-password-123456');
  assert.equal(responseOf(known.response).status, 202);
  assert.equal(responseOf(unknown.response).status, 202);
  assert.deepEqual(known.data, unknown.data);
  assert.deepEqual(known.data, { accepted: true });
  // The owner of the known address reads about the attempt, and the new
  // address gets its link.
  const [notice] = mailsTo(ownerEmail);
  assert.ok(notice?.text.includes('already has an account'));
  assert.ok(!notice?.text.includes('/verify#'));
  lastToken(fresh);
  // The known account keeps its password.
  assert.equal(await signsIn(ownerEmail, ownerPassword), true);
  assert.equal(await signsIn(ownerEmail, 'another-password-12345'), false);
});

await test('a pending account cannot sign in, and its link makes the account', async () => {
  const email = `pending-${randomUUID()}@notes.invalid`;
  const password = 'pending-password-12345';
  assert.equal(
    responseOf((await signUp(email, password)).response).status,
    202,
  );
  assert.equal(await signsIn(email, password), false);
  const verified = await verifyAddress({
    headers: origin,
    body: { token: lastToken(email) },
  });
  assert.equal(verified.error, undefined, JSON.stringify(verified.error));
  assert.deepEqual(verified.data, { email });
  // A second use of the link answers the same account and makes nothing.
  const again = await verifyAddress({
    headers: origin,
    body: { token: lastToken(email) },
  });
  assert.deepEqual(again.data, { email });
  const signed = await signInWithPassword({
    headers: origin,
    body: { email, password },
  });
  assert.equal(responseOf(signed.response).status, 200);
  const account = await getAccount({
    headers: {
      ...origin,
      cookie: cookieHeader(responseOf(signed.response).headers.getSetCookie()),
    },
  });
  assert.equal(account.data?.email, email);
  assert.equal(account.data?.installationRole, 'member');
  assert.equal(
    account.data?.storage.limitBytes,
    Number(defaultAccountLimitBytes),
  );
});

await test('a second sign-up for a pending address replaces it and its password', async () => {
  const email = `taken-${randomUUID()}@notes.invalid`;
  await signUp(email, 'stranger-password-1234');
  const strangerToken = lastToken(email);
  await signUp(email, 'owner-of-address-12345');
  const ownerToken = lastToken(email);
  assert.notEqual(strangerToken, ownerToken);
  // The link of the first sign-up opens nothing now.
  const stale = await verifyAddress({
    headers: origin,
    body: { token: strangerToken },
  });
  assert.equal(responseOf(stale.response).status, 403);
  assert.equal(problemCode(stale.error), 'verification_invalid');
  const verified = await verifyAddress({
    headers: origin,
    body: { token: ownerToken },
  });
  assert.equal(responseOf(verified.response).status, 200);
  assert.equal(await signsIn(email, 'stranger-password-1234'), false);
  assert.equal(await signsIn(email, 'owner-of-address-12345'), true);
});

await test('a used challenge makes no second account, and a forged one none', async () => {
  const used = await proof();
  const first = `first-${randomUUID()}@notes.invalid`;
  const second = `second-${randomUUID()}@notes.invalid`;
  const once = await signUpAccount({
    headers: origin,
    body: { email: first, password: 'first-password-123456', proof: used },
  });
  assert.equal(responseOf(once.response).status, 202);
  const twice = await signUpAccount({
    headers: origin,
    body: { email: second, password: 'second-password-12345', proof: used },
  });
  assert.equal(responseOf(twice.response).status, 403);
  assert.equal(problemCode(twice.error), 'proof_invalid');
  assert.equal(mailsTo(second).length, 0);
  const issued = await getSignUpChallenge({ headers: origin });
  const value = issued.data?.value ?? '';
  // The same solution under a challenge that this server did not sign.
  const forged = (issued.data?.challenge ?? '').replace(/\.[^.]+$/, '.AAAA');
  const refused = await signUpAccount({
    headers: origin,
    body: {
      email: second,
      password: 'second-password-12345',
      proof: { challenge: forged, solution: solve(value, 8) },
    },
  });
  assert.equal(problemCode(refused.error), 'proof_invalid');
  assert.equal(mailsTo(second).length, 0);
});

await test('a forged or unknown link opens nothing', async () => {
  for (const token of ['v1.abc.123.def', 'nothing', 'A'.repeat(64)]) {
    const refused = await verifyAddress({ headers: origin, body: { token } });
    assert.equal(responseOf(refused.response).status, 403, token);
    assert.equal(problemCode(refused.error), 'verification_invalid', token);
  }
});

await test('one address takes at most three messages in an hour', async () => {
  const email = `flood-${randomUUID()}@notes.invalid`;
  for (let index = 0; index < 6; index += 1)
    assert.equal(
      responseOf(
        (await signUp(email, `flood-password-${String(index)}0000`)).response,
      ).status,
      202,
    );
  assert.equal(mailsTo(email).length, 3);
});

await test('the hourly run removes a pending account that nobody verified', async () => {
  const email = `expired-${randomUUID()}@notes.invalid`;
  await signUp(email, 'expired-password-12345');
  const identity = openIdentityStore(database.runtimeUrl, { poolSize: 1 });
  const session = await openSession(database.migrationUrl);
  try {
    const users = (): Promise<{ email: string }[]> =>
      session.query<{ email: string }>(
        'select email from auth_user where email = $1',
        [email],
      );
    assert.equal((await users()).length, 1);
    // A cutoff before the sign-up keeps it.
    await identity.removePendingIdentities(new Date(Date.now() - 3_600_000));
    assert.equal((await users()).length, 1);
    const removed = await identity.removePendingIdentities(
      new Date(Date.now() + 1000),
    );
    assert.ok(removed >= 1);
    assert.equal((await users()).length, 0);
    // A verified account is never removed.
    const kept = await session.query<{ email: string }>(
      'select email from auth_user where email = $1',
      [ownerEmail],
    );
    assert.equal(kept.length, 1);
  } finally {
    await session.close();
    await identity.close();
  }
});

await test('the open policy needs every part it names', async () => {
  // This installation has mail, but no published origin and no legal
  // documents, so an administrator cannot open it (record 0114).
  await setPolicy('invitation');
  const refused = await updateInstallation({
    headers: owner,
    body: { registrationPolicy: 'open' },
  });
  assert.equal(responseOf(refused.response).status, 422);
  assert.equal(problemCode(refused.error), 'open_registration_unavailable');
});

await test('an upgraded installation still signs in its existing accounts', async () => {
  // Stop before this migration, and make an account the way the release
  // before it did: a sign-up that never proved its address.
  const earlier = await mkdtemp(join(tmpdir(), 'notesapp-migrations-'));
  const serverUrl = testServerUrl();
  const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const migrationUrl = await createTestDatabase(serverUrl, name);
  const root = await mkdtemp(join(tmpdir(), 'notesapp-upgrade-'));
  try {
    await cp(migrationsFolder(), earlier, { recursive: true });
    const journalPath = join(earlier, 'meta', '_journal.json');
    const journal: unknown = JSON.parse(await readFile(journalPath, 'utf8'));
    const entries = readEntries(journal);
    const upTo = entries.findIndex(
      (entry) => entry === '0016_pending_accounts',
    );
    assert.ok(upTo > 0, 'the journal names migration 0016');
    await writeFile(
      journalPath,
      JSON.stringify(withEntries(journal, upTo)),
      'utf8',
    );
    const run = {
      documents: createDocumentService(),
      databaseUrl: migrationUrl,
      runtimePassword: testRuntimePassword,
      authPassword: testAuthPassword,
    };
    await runMigrations({ ...run, migrationsFolder: earlier });
    const upgraded = loadServerConfig(
      environment(
        withCredentials(migrationUrl, runtimeRole, testRuntimePassword),
        withCredentials(migrationUrl, authRole, testAuthPassword),
        root,
      ),
    );
    const identity = openIdentityStore(upgraded.databaseUrl, { poolSize: 1 });
    const auth = createAuth(upgraded, {
      mail: null,
      allowSignUp: true,
      sessionAllowed: async (id) =>
        (await identity.sessionAccount(id)) !== null,
    });
    try {
      const email = 'kept@notes.invalid';
      const password = 'kept-password-1234567';
      const made: unknown = await auth.auth.api.signUpEmail({
        body: { email, name: email, password },
      });
      const userId = memberOf(memberOf(made, 'user'), 'id');
      assert.ok(typeof userId === 'string');
      const account = await identity.register({
        authUserId: userId,
        ground: { kind: 'first-run' },
        accountId: randomUUID(),
        workspaceId: randomUUID(),
        workspaceName: 'Personal',
        limitBytes: defaultAccountLimitBytes,
      });
      assert.ok(account !== null);
      const signIn = async (): Promise<number> => {
        const response: unknown = await auth.auth.api.signInEmail({
          body: { email, password },
          asResponse: true,
        });
        return response instanceof Response ? response.status : 0;
      };
      // Before the migration the address counts as unproved.
      assert.notEqual(await signIn(), 200);
      await runMigrations(run);
      assert.equal(await signIn(), 200);
    } finally {
      await auth.close();
      await identity.close();
    }
  } finally {
    await dropTestDatabase(serverUrl, name);
    await rm(earlier, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

/** The tags of the journal entries, in order. */
function readEntries(journal: unknown): string[] {
  if (journal === null || typeof journal !== 'object') return [];
  const entries: unknown = Object.fromEntries(Object.entries(journal))[
    'entries'
  ];
  if (!Array.isArray(entries)) return [];
  return entries.map((entry: unknown) => {
    if (entry === null || typeof entry !== 'object') return '';
    const tag: unknown = Object.fromEntries(Object.entries(entry))['tag'];
    return typeof tag === 'string' ? tag : '';
  });
}

/** The journal with its first `count` entries only. */
function withEntries(journal: unknown, count: number): unknown {
  if (journal === null || typeof journal !== 'object') return journal;
  const record: Record<string, unknown> = Object.fromEntries(
    Object.entries(journal),
  );
  const entries = record['entries'];
  return {
    ...record,
    entries: Array.isArray(entries) ? entries.slice(0, count) : [],
  };
}

await app.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
