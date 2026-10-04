/**
 * A locked account through the served composition (records 0189, 0190 and
 * 0201).
 *
 * The installation starts every new account locked with a removal time, as
 * the cloud does. A new account signs in, keeps only its list of operations,
 * opens the portal through the handoff, and becomes active through a control
 * write of the operator. Each check reads what the person gets.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createFile,
  createInvitation,
  createOwner,
  createPublishedLink,
  createWorkspace,
  exportWorkspace,
  getAccount,
  getPublishedPage,
  inspectWorkspaceExport,
  listFiles,
  listSessions,
  listWorkspaces,
  openAccountPortal,
  readOperatorAccount,
  redeemAccountHandoff,
  registerAccount,
  removeOwnAccount,
  setOperatorAccountControls,
  updatePreferences,
  updateProfile,
} from '@notesapp/api-client';
import { createApp, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase } from './support/database.ts';
import { firstSave, useDocumentHeaders } from './support/documents.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

/** The stable application error code of a failed generated call. */
function codeOf(error: unknown): unknown {
  if (error === null || typeof error !== 'object') return undefined;
  return Object.fromEntries(Object.entries(error))['code'];
}

function cookieHeader(values: readonly string[]): string {
  return values
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

const database = await createDisposableDatabase();
const directory = await mkdtemp(join(tmpdir(), 'notesapp-locked-test-'));
const tokenFile = join(directory, 'operator_token');
const operatorToken = `operator-${randomUUID()}-${randomUUID()}`;
await writeFile(tokenFile, operatorToken);
const app = await createApp(
  loadServerConfig({
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: directory,
    NOTESAPP_AUTH_SECRET: 'locked-account-test-secret-0123456789',
    NOTESAPP_LOG_LEVEL: 'silent',
    NOTESAPP_MAX_BODY_BYTES: '8388608',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_RATE_LIMIT_MAX: '10000',
    NOTESAPP_NEW_ACCOUNT_STANDING: 'locked',
    NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER: '30d',
    NOTESAPP_OPERATOR_TOKEN_FILE: tokenFile,
    NOTESAPP_ACCOUNT_PORTAL_URL: 'https://billing.example.test',
  }),
);
await app.listen({ host: '127.0.0.1', port: 0 });
const address: string | AddressInfo | null = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('The test server did not bind a TCP port.');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
const origin = { origin: 'http://127.0.0.1' };
const operator = { authorization: `Bearer ${operatorToken}` };

const created = await createOwner({
  headers: origin,
  body: { email: 'owner@notes.invalid', password: 'owner-password-123456' },
});
assert.equal(responseOf(created.response).status, 201);
const admin = {
  ...origin,
  cookie: cookieHeader(responseOf(created.response).headers.getSetCookie()),
};

/** Invites and registers one new account, and answers its session. */
async function newAccount(): Promise<{
  email: string;
  password: string;
  headers: { origin: string; cookie: string };
  accountId: string;
}> {
  const email = `new-${randomUUID()}@notes.invalid`;
  const password = 'new-account-password-123';
  const made = await createInvitation({ headers: admin, body: { email } });
  const token = new URL(made.data?.link ?? 'http://x/').hash.slice(1);
  const registered = await registerAccount({
    headers: origin,
    body: { invitation: token, password },
  });
  assert.equal(responseOf(registered.response).status, 201);
  const headers = {
    ...origin,
    cookie: cookieHeader(
      responseOf(registered.response).headers.getSetCookie(),
    ),
  };
  const account = await getAccount({ headers });
  assert.equal(account.error, undefined, JSON.stringify(account.error));
  return { email, password, headers, accountId: account.data?.accountId ?? '' };
}

/** The personal workspace of an account, which a locked account reads. */
async function personalWorkspace(headers: {
  origin: string;
  cookie: string;
}): Promise<string> {
  const listed = await listWorkspaces({ headers });
  const found = listed.data?.workspaces.find((entry) => entry.personal);
  assert.ok(found !== undefined, JSON.stringify(listed.error));
  return found.workspaceId;
}

/** Sets the standing of one account through the operator API. */
async function setStanding(
  accountId: string,
  standing: 'active' | 'locked',
): Promise<void> {
  const read = await readOperatorAccount({
    headers: operator,
    path: { accountId },
  });
  const written = await setOperatorAccountControls({
    headers: operator,
    path: { accountId },
    body: { revision: read.data?.controls.revision ?? 0, standing },
  });
  assert.equal(written.error, undefined, JSON.stringify(written.error));
}

await test('the first account administers the installation and is never locked', async () => {
  const owner = await getAccount({ headers: admin });
  assert.equal(owner.data?.controls.standing, 'active');
  assert.equal(owner.data?.controls.removalAt, null);
});

await test('a new locked account goes through the handoff and is unlocked by a control write', async () => {
  const person = await newAccount();
  const account = await getAccount({ headers: person.headers });
  assert.equal(account.data?.controls.standing, 'locked');
  assert.equal(account.data?.accountPortal, true);
  const removal = Date.parse(account.data?.controls.removalAt ?? '');
  const days = (removal - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(days > 29.9 && days <= 30, String(days));
  // Every operation outside the list answers account_locked.
  const workspaceId = await personalWorkspace(person.headers);
  const files = await listFiles({
    headers: person.headers,
    path: { workspaceId },
  });
  assert.equal(responseOf(files.response).status, 423);
  assert.equal(codeOf(files.error), 'account_locked');
  const made = await createWorkspace({
    headers: person.headers,
    body: { name: 'Second' },
  });
  assert.equal(responseOf(made.response).status, 423);
  const preferences = await updatePreferences({
    headers: person.headers,
    body: { appearance: 'dark' },
  });
  assert.equal(responseOf(preferences.response).status, 423);
  const profile = await updateProfile({
    headers: person.headers,
    body: { name: 'Locked person' },
  });
  assert.equal(responseOf(profile.response).status, 423);
  assert.equal(codeOf(profile.error), 'account_locked');
  // The sessions of the account are on its list.
  const sessions = await listSessions({ headers: person.headers });
  assert.equal(responseOf(sessions.response).status, 200);
  // The handoff: the portal learns the account and unlocks it.
  const opened = await openAccountPortal({
    headers: person.headers,
    body: { path: '/' },
  });
  assert.equal(opened.error, undefined, JSON.stringify(opened.error));
  const token =
    new URL(opened.data?.url ?? 'http://x/').searchParams.get('token') ?? '';
  const redeemed = await redeemAccountHandoff({
    headers: operator,
    body: { token },
  });
  assert.deepEqual(redeemed.data, {
    accountId: person.accountId,
    email: person.email,
  });
  await setStanding(person.accountId, 'active');
  const after = await getAccount({ headers: person.headers });
  assert.equal(after.data?.controls.standing, 'active');
  // Active clears the removal time (record 0201).
  assert.equal(after.data?.controls.removalAt, null);
  const filesAfter = await listFiles({
    headers: person.headers,
    path: { workspaceId },
  });
  assert.equal(responseOf(filesAfter.response).status, 200);
  const second = await createWorkspace({
    headers: person.headers,
    body: { name: 'Second' },
  });
  assert.equal(responseOf(second.response).status, 201);
});

await test('a locked account exports its notes and removes itself', async () => {
  const person = await newAccount();
  const workspaceId = await personalWorkspace(person.headers);
  const inspected = await inspectWorkspaceExport({
    headers: person.headers,
    path: { workspaceId },
  });
  assert.equal(responseOf(inspected.response).status, 200);
  const archive = await exportWorkspace({
    headers: person.headers,
    path: { workspaceId },
  });
  assert.equal(responseOf(archive.response).status, 200);
  assert.equal(
    responseOf(archive.response).headers.get('content-type'),
    'application/zip',
  );
  const removed = await removeOwnAccount({
    headers: person.headers,
    body: { password: person.password },
  });
  assert.equal(removed.error, undefined, JSON.stringify(removed.error));
  const gone = await getAccount({ headers: person.headers });
  assert.equal(responseOf(gone.response).status, 401);
});

await test('the links of a locked account show the closed page until it is active', async () => {
  const person = await newAccount();
  await setStanding(person.accountId, 'active');
  const workspaceId = await personalWorkspace(person.headers);
  useDocumentHeaders(person.headers);
  const fileId = randomUUID();
  const note = await createFile({
    headers: person.headers,
    path: { workspaceId },
    body: {
      fileId,
      path: 'Published.md',
      document: firstSave('# Published\n'),
      revisionId: randomUUID(),
      mutationId: randomUUID(),
      deviceId: 'locked-test',
    },
  });
  assert.equal(note.error, undefined, JSON.stringify(note.error));
  const link = await createPublishedLink({
    headers: person.headers,
    path: { workspaceId },
    body: { scope: { kind: 'note', fileId } },
  });
  const token = link.data?.token ?? '';
  const read = async (): Promise<string> =>
    String((await getPublishedPage({ path: { token } })).data ?? '');
  assert.ok(!(await read()).includes('This link is not available.'));
  await setStanding(person.accountId, 'locked');
  assert.ok((await read()).includes('This link is not available.'));
  await setStanding(person.accountId, 'active');
  assert.ok(!(await read()).includes('This link is not available.'));
});

await app.close();
await database.destroy();
await rm(directory, { recursive: true, force: true });
