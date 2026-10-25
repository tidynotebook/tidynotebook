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
import { mkdtemp, rm } from 'node:fs/promises';
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
  updateLegalDocument,
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
  createVerificationTokens,
  loadServerConfig,
  type MailMessage,
} from '@notesapp/server';
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
import {
  createDisposableDatabase,
  openSession,
  testServerUrl,
} from './support/database.ts';
import {
  migrationsBefore,
  registerFirstAccountOfEarlierRelease,
  writeIssuerAccount,
} from './support/earlier-schema.ts';

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
const config = loadServerConfig({
  ...environment(database.runtimeUrl, database.authUrl, storageRoot),
  NOTESAPP_ACCOUNT_LIMIT_BYTES: '10000000000',
  NOTESAPP_NEW_ACCOUNT_TRIAL_SECONDS: '1209600',
  NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER: '30d',
  NOTESAPP_NEW_ACCOUNT_TEXT_LIMIT_BYTES: '2000000000',
  NOTESAPP_NEW_ACCOUNT_PUBLISHED_TRANSFER_LIMIT_BYTES: '10000000000',
  NOTESAPP_NEW_ACCOUNT_DOWNLOAD_LIMIT_BYTES: '20000000000',
  NOTESAPP_NEW_ACCOUNT_TEAMS: 'false',
  NOTESAPP_NEW_ACCOUNT_COLLABORATION: 'false',
});
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
  assert.ok(
    notice?.text.includes('You already have an account, so nothing changed.'),
  );
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
  const pending = await signInWithPassword({
    headers: origin,
    body: { email, password },
  });
  // The refusal names what the person can do: open the link of the message.
  assert.equal(responseOf(pending.response).status, 403);
  assert.equal(problemCode(pending.error), 'address_unverified');
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
  assert.equal(account.data?.controls.trialState, 'active');
  assert.ok(account.data?.controls.trialEndsAt);
  assert.equal(account.data?.controls.textLimitBytes, 2000000000);
  assert.equal(account.data?.controls.publishedTransferLimitBytes, 10000000000);
  assert.equal(account.data?.controls.downloadLimitBytes, 20000000000);
  assert.deepEqual(account.data?.controls.features, {
    teams: false,
    collaboration: false,
  });
  const setup = await openSession(database.migrationUrl);
  try {
    const timing = await setup.query<{ access: string; removal: string }>(
      `select extract(epoch from trial_ends_at-created_at)::bigint::text as access,
         extract(epoch from trial_removal_at-created_at)::bigint::text as removal
       from accounts where id=$1`,
      [account.data.accountId],
    );
    assert.deepEqual(timing[0], { access: '1209600', removal: '2592000' });
  } finally {
    await setup.close();
  }

  assert.equal(account.data?.storage.limitBytes, 10000000000);
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
  // This installation has mail and no legal documents, so an administrator
  // cannot open it (record 0114).
  await setPolicy('invitation');
  const refused = await updateInstallation({
    headers: owner,
    body: { registrationPolicy: 'open' },
  });
  assert.equal(responseOf(refused.response).status, 422);
  assert.equal(problemCode(refused.error), 'open_registration_unavailable');
  assert.deepEqual(memberOf(refused.error, 'missing'), ['legal-documents']);
});

await test('the open policy opens with no published origin', async () => {
  // Record 0191: mail and the legal documents are enough. This server names
  // no published origin, so the application origin serves the reader path.
  assert.ok(
    config.servedOrigins.every((served) => served.role === 'application'),
  );
  for (const [document, version] of [
    ['terms', 't1'],
    ['privacy', 'p1'],
  ] as const) {
    const stored = await updateLegalDocument({
      headers: owner,
      path: { document },
      body: {
        kind: 'address',
        url: `https://example.test/${document}`,
        version,
      },
    });
    assert.equal(responseOf(stored.response).status, 200);
  }
  const opened = await updateInstallation({
    headers: owner,
    body: { registrationPolicy: 'open' },
  });
  assert.equal(
    responseOf(opened.response).status,
    200,
    JSON.stringify(opened.error),
  );
  assert.equal(opened.data?.registrationPolicy, 'open');
  assert.equal((await getSetupStatus()).data?.openRegistration, true);
  // A stranger signs up, opens the link, and signs in.
  const email = `stranger-${randomUUID()}@notes.invalid`;
  const password = 'stranger-password-12345';
  const asked = await signUpAccount({
    headers: origin,
    body: {
      email,
      password,
      proof: await proof(),
      consent: { termsVersion: 't1', privacyVersion: 'p1' },
    },
  });
  assert.equal(responseOf(asked.response).status, 202);
  const verified = await verifyAddress({
    headers: origin,
    body: { token: lastToken(email) },
  });
  assert.deepEqual(verified.data, { email });
  assert.equal(await signsIn(email, password), true);
});

await test('an upgraded installation still signs in its existing accounts', async () => {
  // Stop before this migration, and make an account the way the release
  // before it did: a sign-up that never proved its address.
  const earlier = await migrationsBefore('0016_pending_accounts');
  const serverUrl = testServerUrl();
  const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const migrationUrl = await createTestDatabase(serverUrl, name);
  const root = await mkdtemp(join(tmpdir(), 'notesapp-upgrade-'));
  try {
    const run = {
      documents: createDocumentService(),
      databaseUrl: migrationUrl,
      runtimePassword: testRuntimePassword,
      authPassword: testAuthPassword,
    };
    await runMigrations({ ...run, migrationsFolder: earlier.folder });
    const upgraded = loadServerConfig(
      environment(
        withCredentials(migrationUrl, runtimeRole, testRuntimePassword),
        withCredentials(migrationUrl, authRole, testAuthPassword),
        root,
      ),
    );
    const identity = openIdentityStore(upgraded.databaseUrl, { poolSize: 1 });
    const auth = await createAuth(upgraded, {
      mail: null,
      allowSignUp: true,
      sessionAllowed: async (id) =>
        (await identity.sessionAccount(id)) !== null,
    });
    const owner = await openSession(migrationUrl);
    try {
      const email = 'kept@notes.invalid';
      const password = 'kept-password-1234567';
      // The library of this release no longer writes the issuer that this
      // schema needs, so the row is written as the release before it did.
      const userId = await writeIssuerAccount(owner, {
        email,
        passwordHash: await (await auth.auth.$context).password.hash(password),
        emailVerified: false,
      });
      const runtime = await openSession(upgraded.databaseUrl);
      try {
        const account = await registerFirstAccountOfEarlierRelease(
          runtime,
          userId,
          defaultAccountLimitBytes,
        );
        assert.ok(account !== null);
      } finally {
        await runtime.close();
      }
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
      await owner.close();
      await auth.close();
      await identity.close();
    }
  } finally {
    await dropTestDatabase(serverUrl, name);
    await earlier.remove();
    await rm(root, { recursive: true, force: true });
  }
});

/** The legal documents were enabled by the earlier installation checks. */
async function signUpForContinuation(email: string, password: string) {
  const result = await signUpAccount({
    headers: origin,
    body: {
      email,
      password,
      proof: await proof(),
      consent: { termsVersion: 't1', privacyVersion: 'p1' },
    },
  });
  assert.equal(result.response?.status, 202, JSON.stringify(result.error));
  return result;
}

/** Session count proves that a replay made no unused second session either. */
async function sessionCount(email: string): Promise<number> {
  const db = await openSession(database.migrationUrl);
  try {
    const result = await db.query<{ count: string }>(
      'select count(*)::text as count from auth_session s join auth_user u on u.id = s.user_id where u.email = $1',
      [email],
    );
    return Number(result[0]?.count ?? '-1');
  } finally {
    await db.close();
  }
}

await test('the signup browser continues once after verification without storing its password', async () => {
  await setPolicy('open');
  const email = `continue-${randomUUID()}@notes.invalid`;
  const signup = await signUpForContinuation(email, 'continue-password-123456');
  const proofCookies = responseOf(signup.response).headers.getSetCookie();
  assert.equal(proofCookies.length, 1);
  assert.match(proofCookies[0] ?? '', /HttpOnly/i);
  assert.match(proofCookies[0] ?? '', /SameSite=Lax/i);
  assert.match(proofCookies[0] ?? '', /Max-Age=900/i);
  const browser = { ...origin, cookie: cookieHeader(proofCookies) };
  assert.equal((await getAccount({ headers: browser })).response?.status, 401);
  assert.equal(await sessionCount(email), 0);
  const verified = await verifyAddress({
    headers: browser,
    body: { token: lastToken(email) },
  });
  assert.deepEqual(verified.data, { email, signedIn: true });
  const sessionCookies = responseOf(verified.response).headers.getSetCookie();
  assert.ok(
    sessionCookies.some((cookie) => cookie.startsWith('notesapp_session=')),
  );
  const account = await getAccount({
    headers: { ...origin, cookie: cookieHeader(sessionCookies) },
  });
  assert.equal(account.data?.email, email);
  assert.equal(await sessionCount(email), 1);
  // Also models an interrupted first response: retaining only the old proof
  // cannot mint another session. Normal password sign-in stays available.
  const replay = await verifyAddress({
    headers: browser,
    body: { token: lastToken(email) },
  });
  assert.deepEqual(replay.data, { email });
  assert.equal(await sessionCount(email), 1);
  assert.equal(await signsIn(email, 'continue-password-123456'), true);
});

await test('concurrent continuation consumes one proof and creates exactly one session', async () => {
  const email = `concurrent-${randomUUID()}@notes.invalid`;
  const signup = await signUpForContinuation(email, 'continue-password-123456');
  const browser = {
    ...origin,
    cookie: cookieHeader(responseOf(signup.response).headers.getSetCookie()),
  };
  const token = lastToken(email);
  // A link on another device proves the address but creates no session there.
  const otherDevice = await verifyAddress({ headers: origin, body: { token } });
  assert.deepEqual(otherDevice.data, { email });
  assert.equal(await sessionCount(email), 0);
  const results = await Promise.all([
    verifyAddress({ headers: browser, body: { token } }),
    verifyAddress({ headers: browser, body: { token } }),
  ]);
  assert.ok(results.every((result) => result.response?.status === 200));
  assert.equal(
    results.filter((result) => result.data?.signedIn === true).length,
    1,
  );
  assert.equal(await sessionCount(email), 1);
});

await test('concurrent first verification also creates only one session', async () => {
  const email = `first-concurrent-${randomUUID()}@notes.invalid`;
  const signup = await signUpForContinuation(email, 'continue-password-123456');
  const browser = {
    ...origin,
    cookie: cookieHeader(responseOf(signup.response).headers.getSetCookie()),
  };
  const token = lastToken(email);
  const results = await Promise.all([
    verifyAddress({ headers: browser, body: { token } }),
    verifyAddress({ headers: browser, body: { token } }),
  ]);
  assert.ok(results.every((result) => result.response?.status === 200));
  assert.equal(
    results.filter((result) => result.data?.signedIn === true).length,
    1,
  );
  assert.equal(await sessionCount(email), 1);
});

await test('continuation is bound to the exact identity and a foreign link cannot consume it', async () => {
  const first = `bound-a-${randomUUID()}@notes.invalid`;
  const second = `bound-b-${randomUUID()}@notes.invalid`;
  const signup = await signUpForContinuation(first, 'continue-password-123456');
  const browser = {
    ...origin,
    cookie: cookieHeader(responseOf(signup.response).headers.getSetCookie()),
  };
  await signUpForContinuation(second, 'continue-password-123456');
  const foreign = await verifyAddress({
    headers: browser,
    body: { token: lastToken(second) },
  });
  assert.deepEqual(foreign.data, { email: second });
  assert.equal(await sessionCount(second), 0);
  const own = await verifyAddress({
    headers: browser,
    body: { token: lastToken(first) },
  });
  assert.deepEqual(own.data, { email: first, signedIn: true });
});

await test('an expired proof still verifies the address and requires password sign-in', async () => {
  const email = `expired-proof-${randomUUID()}@notes.invalid`;
  const signup = await signUpForContinuation(email, 'continue-password-123456');
  const browser = {
    ...origin,
    cookie: cookieHeader(responseOf(signup.response).headers.getSetCookie()),
  };
  const db = await openSession(database.migrationUrl);
  try {
    await db.query(
      "update auth_verification set expires_at = now() - interval '1 second' where identifier like 'notesapp-registration:%' and value = (select id from auth_user where email = $1)",
      [email],
    );
  } finally {
    await db.close();
  }
  const verified = await verifyAddress({
    headers: browser,
    body: { token: lastToken(email) },
  });
  assert.deepEqual(verified.data, { email });
  assert.equal(await sessionCount(email), 0);
});

await test('verification never replaces an existing session and consumes the unused proof', async () => {
  const email = `existing-session-${randomUUID()}@notes.invalid`;
  const signup = await signUpForContinuation(email, 'continue-password-123456');
  const proof = cookieHeader(
    responseOf(signup.response).headers.getSetCookie(),
  );
  const verified = await verifyAddress({
    headers: { ...origin, cookie: `${owner.cookie}; ${proof}` },
    body: { token: lastToken(email) },
  });
  assert.deepEqual(verified.data, { email });
  assert.equal((await getAccount({ headers: owner })).data?.email, ownerEmail);
  assert.equal(await sessionCount(email), 0);
  const replay = await verifyAddress({
    headers: { ...origin, cookie: proof },
    body: { token: lastToken(email) },
  });
  assert.deepEqual(replay.data, { email });
  assert.equal(await sessionCount(email), 0);
});

await test('the normal disabled-account session hook also refuses automatic continuation', async () => {
  const email = `disabled-continue-${randomUUID()}@notes.invalid`;
  const signup = await signUpForContinuation(email, 'continue-password-123456');
  const browser = {
    ...origin,
    cookie: cookieHeader(responseOf(signup.response).headers.getSetCookie()),
  };
  const token = lastToken(email);
  assert.deepEqual(
    (await verifyAddress({ headers: origin, body: { token } })).data,
    { email },
  );
  const db = await openSession(database.migrationUrl);
  try {
    await db.query(
      "update accounts set state = 'disabled' where id = (select account_id from account_identities where auth_user_id = (select id from auth_user where email = $1))",
      [email],
    );
  } finally {
    await db.close();
  }
  const verified = await verifyAddress({ headers: browser, body: { token } });
  assert.deepEqual(verified.data, { email });
  assert.equal(await sessionCount(email), 0);
  const replay = await verifyAddress({ headers: browser, body: { token } });
  assert.deepEqual(replay.data, { email });
  assert.equal(await sessionCount(email), 0);
});

await test('replacement and forged browser proofs cannot continue a different pending signup', async () => {
  const email = `replaced-proof-${randomUUID()}@notes.invalid`;
  const first = await signUpForContinuation(email, 'continue-password-123456');
  const oldToken = lastToken(email);
  const oldBrowser = {
    ...origin,
    cookie: cookieHeader(responseOf(first.response).headers.getSetCookie()),
  };
  const replacement = await signUpForContinuation(
    email,
    'replacement-password-123456',
  );
  const token = lastToken(email);
  assert.equal(
    (await verifyAddress({ headers: oldBrowser, body: { token: oldToken } }))
      .response?.status,
    403,
  );
  const wrongProof = await verifyAddress({
    headers: oldBrowser,
    body: { token },
  });
  assert.deepEqual(wrongProof.data, { email });
  assert.equal(await sessionCount(email), 0);
  const proof = cookieHeader(
    responseOf(replacement.response).headers.getSetCookie(),
  );
  const forged = await verifyAddress({
    headers: { ...origin, cookie: proof.replace(/=.+$/, '=' + 'A'.repeat(43)) },
    body: { token },
  });
  assert.deepEqual(forged.data, { email });
  assert.equal(await sessionCount(email), 0);
  const foreign = await verifyAddress({
    headers: { origin: 'https://foreign.example.test', cookie: proof },
    body: { token },
  });
  assert.equal(foreign.response?.status, 403);
  const verified = await verifyAddress({
    headers: { ...origin, cookie: proof },
    body: { token },
  });
  assert.deepEqual(verified.data, { email, signedIn: true });
});

await test('an expired verification link cannot use a valid browser continuation proof', async () => {
  const email = `expired-link-${randomUUID()}@notes.invalid`;
  const signup = await signUpForContinuation(email, 'continue-password-123456');
  const browser = {
    ...origin,
    cookie: cookieHeader(responseOf(signup.response).headers.getSetCookie()),
  };
  const token = lastToken(email);
  const tokens = createVerificationTokens(config.authSecret);
  const claim = tokens.read(token, new Date());
  assert.ok(claim !== null);
  const expired = tokens.issue(
    claim.authUserId,
    new Date(Date.now() - 1000),
    claim.consent,
  );
  const refused = await verifyAddress({
    headers: browser,
    body: { token: expired },
  });
  assert.equal(refused.response?.status, 403);
  assert.equal(problemCode(refused.error), 'verification_invalid');
  assert.equal(await sessionCount(email), 0);
  const verified = await verifyAddress({ headers: browser, body: { token } });
  assert.deepEqual(verified.data, { email, signedIn: true });
});

await test('a known-account signup keeps equal cookie treatment but grants no continuation', async () => {
  const email = `known-proof-${randomUUID()}@notes.invalid`;
  await signUpForContinuation(email, 'continue-password-123456');
  const token = lastToken(email);
  assert.deepEqual(
    (await verifyAddress({ headers: origin, body: { token } })).data,
    { email },
  );
  const known = await signUpForContinuation(email, 'other-password-1234567');
  const cookies = responseOf(known.response).headers.getSetCookie();
  assert.equal(cookies.length, 1);
  assert.match(cookies[0] ?? '', /HttpOnly/i);
  assert.deepEqual(known.data, { accepted: true });
  const verified = await verifyAddress({
    headers: { ...origin, cookie: cookieHeader(cookies) },
    body: { token },
  });
  assert.deepEqual(verified.data, { email });
  assert.equal(await sessionCount(email), 0);
});

await test('production continuation cookies are secure and internal calls have no public route', async () => {
  const secure = await createAuth(
    loadServerConfig({
      ...environment(database.runtimeUrl, database.authUrl, storageRoot),
      NOTESAPP_ORIGIN: 'https://notes.example.test',
    }),
    { mail: null, allowSignUp: false, sessionAllowed: async () => false },
  );
  try {
    const response = await secure.auth.api.beginRegistrationContinuation({
      asResponse: true,
    });
    const cookie = response.headers.getSetCookie().at(0) ?? '';
    assert.match(cookie, /; Secure/i);
    assert.match(cookie, /; HttpOnly/i);
    assert.match(cookie, /; SameSite=Lax/i);
    assert.match(cookie, /Max-Age=900/i);
  } finally {
    await secure.close();
  }
  for (const path of [
    'beginRegistrationContinuation',
    'completeRegistrationContinuation',
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/auth/${path}`,
      headers: { ...origin, host: '127.0.0.1' },
      payload: {},
    });
    assert.equal(response.statusCode, 404);
  }
});

/** Fail only the optional proof store, inside this test's disposable database. */
async function failContinuationStorage(operation: 'INSERT' | 'DELETE') {
  const db = await openSession(database.migrationUrl);
  try {
    await db.query(`
      create function refuse_registration_continuation() returns trigger
      language plpgsql as $$
      begin
        raise exception 'test continuation storage failure';
      end;
      $$;
    `);
    await db.query(`
      create trigger refuse_registration_continuation
      before ${operation} on auth_verification
      for each row
      when (${operation === 'INSERT' ? 'new' : 'old'}.identifier like 'notesapp-registration:%')
      execute function refuse_registration_continuation();
    `);
  } finally {
    await db.close();
  }
  return async () => {
    const cleanup = await openSession(database.migrationUrl);
    try {
      await cleanup.query(
        'drop trigger refuse_registration_continuation on auth_verification',
      );
      await cleanup.query('drop function refuse_registration_continuation()');
    } finally {
      await cleanup.close();
    }
  };
}

await test('signup still returns accepted when optional proof storage fails', async () => {
  const email = `begin-failed-${randomUUID()}@notes.invalid`;
  const password = 'continue-password-123456';
  const restore = await failContinuationStorage('INSERT');
  try {
    const signup = await signUpForContinuation(email, password);
    assert.deepEqual(signup.data, { accepted: true });
    assert.deepEqual(responseOf(signup.response).headers.getSetCookie(), []);
    assert.equal(await sessionCount(email), 0);
  } finally {
    await restore();
  }
  const verified = await verifyAddress({
    headers: origin,
    body: { token: lastToken(email) },
  });
  assert.equal(verified.response?.status, 200);
  assert.deepEqual(verified.data, { email });
  assert.equal(await signsIn(email, password), true);
});

await test('email verification succeeds without a session when optional proof consumption fails', async () => {
  const email = `complete-failed-${randomUUID()}@notes.invalid`;
  const password = 'continue-password-123456';
  const signup = await signUpForContinuation(email, password);
  const browser = {
    ...origin,
    cookie: cookieHeader(responseOf(signup.response).headers.getSetCookie()),
  };
  const restore = await failContinuationStorage('DELETE');
  try {
    const verified = await verifyAddress({
      headers: browser,
      body: { token: lastToken(email) },
    });
    assert.equal(verified.response?.status, 200);
    assert.deepEqual(verified.data, { email });
    assert.deepEqual(responseOf(verified.response).headers.getSetCookie(), []);
    assert.equal(await sessionCount(email), 0);
  } finally {
    await restore();
  }
  assert.equal(await signsIn(email, password), true);
});

await app.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
