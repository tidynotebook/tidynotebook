/**
 * A person lists and ends the sessions of their own account, through the
 * served composition (record 0122).
 *
 * Each check reads what a person gets: the listed devices, whether an ended
 * session still works, and that no answer carries a session token.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createInvitation,
  createOwner,
  getAccount,
  listSessions,
  registerAccount,
  revokeOtherSessions,
  revokeSession,
  signInWithPassword,
} from '@notesapp/api-client';
import { createApp, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase, openSession } from './support/database.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

function cookieHeader(values: readonly string[]): string {
  return values
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-sessions-test-'));
const config = loadServerConfig({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'sessions-test-secret-0123456789abcdef',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
  NOTESAPP_RATE_LIMIT_MAX: '10000',
});
const app = await createApp(config);
await app.listen({ host: '127.0.0.1', port: 0 });
const address: string | AddressInfo | null = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('The test server did not bind a TCP port.');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
const origin = { origin: 'http://127.0.0.1' };

/** Signs in from one device and answers its request headers. */
async function signIn(
  email: string,
  password: string,
  device: string,
): Promise<{ origin: string; cookie: string; 'user-agent': string }> {
  const signed = await signInWithPassword({
    headers: { ...origin, 'user-agent': device },
    body: { email, password },
  });
  assert.equal(responseOf(signed.response).status, 200);
  return {
    ...origin,
    'user-agent': device,
    cookie: cookieHeader(responseOf(signed.response).headers.getSetCookie()),
  };
}

/** The status of a call that needs a session. */
async function accountStatus(headers: Record<string, string>): Promise<number> {
  return responseOf((await getAccount({ headers })).response).status;
}

/** Every session token of the identity store. */
async function storedTokens(): Promise<string[]> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ token: string }>(
      'select token from auth_session',
    );
    return rows.map((row) => row.token);
  } finally {
    await session.close();
  }
}

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

/** Invites and registers a second person, and answers the address. */
async function secondPerson(password: string): Promise<string> {
  const email = `second-${randomUUID()}@notes.invalid`;
  const made = await createInvitation({ headers: owner, body: { email } });
  const token = new URL(made.data?.link ?? 'http://x/').hash.slice(1);
  const registered = await registerAccount({
    headers: origin,
    body: { invitation: token, password },
  });
  assert.equal(responseOf(registered.response).status, 201);
  return email;
}

await test('every session of the account is listed and the current one is marked', async () => {
  const laptop = await signIn(ownerEmail, ownerPassword, 'Laptop browser');
  const phone = await signIn(ownerEmail, ownerPassword, 'Phone browser');
  const listed = await listSessions({ headers: laptop });
  assert.equal(listed.error, undefined, JSON.stringify(listed.error));
  const sessions = listed.data?.sessions ?? [];
  // The first session, the laptop and the phone.
  assert.equal(sessions.length, 3);
  assert.equal(sessions[0]?.current, true);
  assert.equal(sessions[0]?.userAgent, 'Laptop browser');
  assert.deepEqual(
    sessions.map((session) => session.current),
    [true, false, false],
  );
  assert.ok(sessions.some((session) => session.userAgent === 'Phone browser'));
  const fromPhone = await listSessions({ headers: phone });
  assert.equal(fromPhone.data?.sessions[0]?.userAgent, 'Phone browser');
});

await test('an ended session no longer works and the others still do', async () => {
  const laptop = await signIn(ownerEmail, ownerPassword, 'Lost laptop');
  const desk = await signIn(ownerEmail, ownerPassword, 'Desk browser');
  const listed = await listSessions({ headers: desk });
  const lost = listed.data?.sessions.find(
    (session) => session.userAgent === 'Lost laptop',
  );
  assert.ok(lost !== undefined);
  assert.equal(await accountStatus(laptop), 200);
  const ended = await revokeSession({
    headers: desk,
    path: { sessionId: lost.sessionId },
  });
  assert.equal(responseOf(ended.response).status, 200);
  assert.equal(await accountStatus(laptop), 401);
  assert.equal(await accountStatus(desk), 200);
  // The same session again answers not found.
  const again = await revokeSession({
    headers: desk,
    path: { sessionId: lost.sessionId },
  });
  assert.equal(responseOf(again.response).status, 404);
});

await test('another account cannot end or see a session of this account', async () => {
  const password = 'second-password-123456';
  const email = await secondPerson(password);
  const second = await signIn(email, password, 'Second browser');
  const target = await signIn(ownerEmail, ownerPassword, 'Target browser');
  const ownerList = await listSessions({ headers: target });
  const targetId = ownerList.data?.sessions[0]?.sessionId ?? '';
  const secondList = await listSessions({ headers: second });
  assert.ok(
    (secondList.data?.sessions ?? []).every(
      (session) => session.sessionId !== targetId,
    ),
  );
  const refused = await revokeSession({
    headers: second,
    path: { sessionId: targetId },
  });
  assert.equal(responseOf(refused.response).status, 404);
  assert.equal(await accountStatus(target), 200);
});

await test('sign out every other device keeps only the current session', async () => {
  const kept = await signIn(ownerEmail, ownerPassword, 'Kept browser');
  const other = await signIn(ownerEmail, ownerPassword, 'Other browser');
  const before = (await listSessions({ headers: kept })).data?.sessions ?? [];
  assert.ok(before.length > 1);
  const revoked = await revokeOtherSessions({ headers: kept });
  assert.equal(revoked.data?.revoked, before.length - 1);
  assert.equal(await accountStatus(other), 401);
  assert.equal(await accountStatus(owner), 401);
  const after = await listSessions({ headers: kept });
  assert.deepEqual(
    after.data?.sessions.map((session) => session.current),
    [true],
  );
});

await test('no answer carries a session token', async () => {
  const device = await signIn(ownerEmail, ownerPassword, 'Token browser');
  const answer = await listSessions({ headers: device });
  // The client parsed the whole body, so its text is the answer.
  const text = JSON.stringify(answer.data);
  const tokens = await storedTokens();
  assert.ok(tokens.length > 0);
  for (const token of tokens) assert.ok(!text.includes(token), 'a token');
  const others = await revokeOtherSessions({ headers: device });
  const othersText = JSON.stringify(others.data);
  for (const token of tokens) assert.ok(!othersText.includes(token));
});

await app.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
