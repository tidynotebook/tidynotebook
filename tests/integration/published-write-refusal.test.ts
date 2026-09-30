/**
 * Every write of the contract, sent with a published token and no session.
 *
 * This is plan 007 item 44, and it is the check that decision 0031 exists for.
 * A published link hands a stranger two secrets, the token of the address and
 * the reading ticket of an unlocked link, and neither one may reach a write.
 * The four refusals of 0031 sit in four layers, so a hole in one of them is
 * invisible from inside that layer. This file looks from outside: it takes the
 * write operations from the contract registry, sends every one of them with
 * both reader secrets in every place a credential travels, and then proves
 * that the note, its history, the file list and the link list are unchanged.
 *
 * **The drive reads the contract, not a list.** `operations` of
 * `@notesapp/api-contract` is the one registry of the boundary, so a write
 * operation that a later change adds is driven here on the day it lands. An
 * operation that declares a session is expected to refuse; the three kinds
 * that declare none are named below with the reason each one may, and the
 * lists are compared exactly, so a new public write fails this file until
 * somebody decides which kind it is.
 *
 * **The drive uses `app.inject()`.** A generated operation cannot be built
 * from the registry at run time, and building one call per operation by hand
 * is the sample that this item refuses. `tests/AGENTS.md` names `app.inject()`
 * as the way to send a request that no generated operation can express, and
 * every call of the owner in this file still goes through the generated
 * client.
 *
 * Start the service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import assert from 'node:assert/strict';
import { firstSave } from './support/documents.ts';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createFile,
  createPublishedLink,
  getFile,
  getPublishedPage,
  listFiles,
  listHistory,
  listPublishedLinks,
  listWorkspaces,
  signInWithPassword,
  unlockPublishedLink,
} from '@notesapp/api-client';
import { operations, type OperationEntry } from '@notesapp/api-contract';
import { bootstrapOwner, createApp, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase } from './support/database.ts';

/** The HTTP response of a generated call, or a clear test failure. */
function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

/** Reads one property of an unknown value without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

/** The stable application error code of a refused injected request. */
function problemCodeOf(body: string): string {
  const parsed: unknown = JSON.parse(body);
  const code = readProperty(parsed, 'code');
  return typeof code === 'string' ? code : '';
}

/** Turns the Set-Cookie values of an answer into a Cookie request header. */
function cookieHeader(values: readonly string[]): string {
  return values
    .map((entry) => (entry.split(';')[0] ?? '').trim())
    .filter((entry) => entry !== '' && !entry.endsWith('='))
    .join('; ');
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-write-refusal-'));
const config = loadServerConfig({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'write-refusal-secret-value-0123456789abcd',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '10000',
  NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS: '5000',
});

const ownerEmail = 'write-refusal-owner@notes.invalid';
const ownerPassword = 'a-strong-write-refusal-password';
await bootstrapOwner({
  config,
  email: ownerEmail,
  name: 'RefusalOwner',
  password: ownerPassword,
});

// The whole composition, because the first-run setup handler is one of the
// writes that this file drives, and the shared test server replaces it.
const app = await createApp(config);
await app.listen({ host: '127.0.0.1', port: 0 });
const address = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('The test server did not bind a TCP port.');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);

const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email: ownerEmail, password: ownerPassword },
});
const cookie = cookieHeader(
  responseOf(signedIn.response).headers.getSetCookie(),
);
assert.ok(cookie.length > 0, 'the test needs a session cookie');

/** The headers of the browser of the owner. A write also names the origin. */
function owner(): Record<string, string> {
  return { origin: 'http://127.0.0.1', cookie };
}

const listed = await listWorkspaces({ headers: owner() });
const workspaceId = listed.data?.workspaces[0]?.workspaceId ?? '';
assert.match(workspaceId, /^[0-9a-f-]{36}$/);

const noteText = '# The report\n\nThe published words.\n';
const noteId = randomUUID();
const created = await createFile({
  headers: owner(),
  path: { workspaceId },
  body: {
    fileId: noteId,
    revisionId: randomUUID(),
    path: 'notes/report/first.md',
    document: firstSave(noteText),
    mutationId: randomUUID(),
    deviceId: 'write-refusal-device',
  },
});
assert.equal(created.error, undefined, JSON.stringify(created.error));

// The link carries a password, so the reader of this file holds both secrets
// of decision 0046: the token of the address and a live reading ticket.
const linkPassword = 'a-strong-link-password';
const link = await createPublishedLink({
  headers: owner(),
  path: { workspaceId },
  body: {
    scope: { kind: 'folder', path: 'notes/report' },
    password: linkPassword,
  },
});
const token = link.data?.token ?? '';
const publicationId = link.data?.link.publicationId ?? '';
assert.match(token, /^[A-Za-z0-9_-]{22,}$/);

const unlocked = await unlockPublishedLink({
  path: { token },
  body: { password: linkPassword },
});
const ticket = unlocked.data?.ticket ?? '';
assert.match(ticket, /^[A-Za-z0-9_-]{22,}$/);

/** The state of the workspace that no reader may move. */
async function stateOfTheWorkspace(): Promise<string> {
  const [file, files, history, links, page] = await Promise.all([
    getFile({ headers: owner(), path: { workspaceId, fileId: noteId } }),
    listFiles({ headers: owner(), path: { workspaceId } }),
    listHistory({ headers: owner(), path: { workspaceId, fileId: noteId } }),
    listPublishedLinks({ headers: owner(), path: { workspaceId } }),
    getPublishedPage({ path: { token }, query: { ticket, note: noteId } }),
  ]);
  return JSON.stringify({
    text: file.data?.head?.text,
    revisionId: file.data?.head?.revisionId,
    path: file.data?.path,
    files: files.data?.files.map((entry) => entry.path),
    versions: history.data?.revisions.length,
    links: links.data?.links.map((entry) => entry.publicationId),
    page: String(page.data ?? ''),
  });
}

const before = await stateOfTheWorkspace();
assert.ok(before.includes('The published words.'), 'the reader reads the note');

/** Whether this operation changes the state of the server. */
function isWrite(operation: OperationEntry): boolean {
  return (
    operation.method === 'post' ||
    operation.method === 'put' ||
    operation.method === 'patch' ||
    operation.method === 'delete'
  );
}

const writes = operations.filter(isWrite);

/**
 * The writes of the reader boundary.
 *
 * Each takes a token because a reader has no account. None writes a note:
 * decision 0031 gives the reader path a port with read methods only and a
 * read-only transaction. The one row that the unlock writes is a ticket, and
 * the one row that a report writes is a report (record 0119).
 */
const readerWrites = [
  'openPublishedPage',
  'unlockPublishedLink',
  'reportPublishedLink',
];

/**
 * The writes of the account path, which the protocol library serves.
 *
 * They carry no contract handler and no identity hook, because each one is a
 * credential check itself. A published token is not a credential of that path,
 * and the test below proves that it never becomes one.
 */
const protocolWrites = [
  'requestPasswordReset',
  'resetPassword',
  'signInWithPassword',
  'signOut',
  'updateProfile',
];

/**
 * The public writes that make an account (records 0108 and 0114). Each takes
 * its own secret or its own address, a first run, an invitation token, an
 * open sign-up or its verification token, and none reads a session.
 */
const setupWrites = [
  'createOwner',
  'readInvitation',
  'registerAccount',
  'signUpAccount',
  'verifyAddress',
];

/** The value of each path parameter, so every address names a real thing. */
const pathValues: Readonly<Record<string, string>> = {
  workspaceId,
  fileId: noteId,
  publicationId,
  objectId: randomUUID(),
  accountId: randomUUID(),
  invitationId: randomUUID(),
  sessionId: randomUUID(),
  themeId: randomUUID(),
  reportId: randomUUID(),
  token,
};

/** The address of one operation, with a real value in every segment. */
function addressOf(operation: OperationEntry): string {
  return operation.path.replaceAll(/\{(\w+)\}/g, (_whole, name: string) => {
    const value = pathValues[name];
    assert.ok(value !== undefined, `no test value for the parameter ${name}`);
    return encodeURIComponent(value);
  });
}

/** The injected method of one write, without a type assertion. */
function methodOf(
  operation: OperationEntry,
): 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
  if (operation.method === 'post') return 'POST';
  if (operation.method === 'put') return 'PUT';
  if (operation.method === 'patch') return 'PATCH';
  if (operation.method === 'delete') return 'DELETE';
  throw new Error(`${operation.id} is not a write.`);
}

/** Whether one operation declares the reading ticket of decision 0046. */
function takesTicket(operation: OperationEntry): boolean {
  return operation.parameters.some(
    (parameter) =>
      parameter.location === 'query' && parameter.name === 'ticket',
  );
}

/**
 * The request of a reader who holds both secrets and no session.
 *
 * The token sits in the session cookie and in an authorization header,
 * because those are the two places a caller could hope that a credential is
 * read. Both secrets also sit in a cookie of their own, so no name of a
 * cookie is a way in either. The ticket travels in the query only where the
 * operation declares it, which is the one home decision 0046 gives it; an
 * undeclared query is a request that the boundary refuses for its shape, and
 * this file wants the refusal that the identity of the caller earns.
 */
function readerAttempt(operation: OperationEntry): {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers: Record<string, string>;
} {
  const query = takesTicket(operation)
    ? `?ticket=${encodeURIComponent(ticket)}`
    : '';
  return {
    method: methodOf(operation),
    url: `${addressOf(operation)}${query}`,
    headers: {
      host: '127.0.0.1',
      origin: 'http://127.0.0.1',
      cookie: `notesapp_session=${token}; token=${token}; ticket=${ticket}`,
      authorization: `Bearer ${token}`,
    },
  };
}

await test('every write of the contract is guarded or named here', () => {
  const open = writes
    .filter((operation) => operation.security.length === 0)
    .map((operation) => operation.id)
    .sort();
  assert.deepEqual(
    open,
    [...readerWrites, ...protocolWrites, ...setupWrites].sort(),
  );
  const guarded = writes.filter((operation) => operation.security.length > 0);
  // The writes that change a note are in the guarded set, so a filter that
  // stopped matching cannot leave this file driving an empty list.
  for (const id of [
    'commitChangeset',
    'createFile',
    'deleteFile',
    'purgeFiles',
    'restoreFile',
    'restoreRevision',
    'updateFile',
  ])
    assert.ok(
      guarded.some((operation) => operation.id === id),
      id,
    );
  // No write of the reader prefix declares a session, and no write that
  // declares one sits under that prefix. The two halves cannot swap.
  for (const operation of guarded)
    assert.ok(!operation.path.startsWith('/published/'), operation.id);
});

await test('every guarded write refuses a published token with no session', async () => {
  const guarded = writes.filter((operation) => operation.security.length > 0);
  for (const operation of guarded) {
    const response = await app.inject(readerAttempt(operation));
    assert.equal(response.statusCode, 401, operation.id);
    assert.equal(problemCodeOf(response.body), 'unauthenticated', operation.id);
    // The refusal names no note, no link and neither secret.
    assert.ok(!response.body.includes(token), operation.id);
    assert.ok(!response.body.includes(ticket), operation.id);
  }
});

await test('the writes of the reader boundary write no note', async () => {
  for (const id of readerWrites) {
    const operation = operations.find((entry) => entry.id === id);
    assert.ok(operation !== undefined, id);
    // Each one takes a password, in the media type that it declares. The
    // password is wrong, because a reader who guesses is the caller that this
    // pair of operations exists to refuse.
    const mediaType = operation.request.bodyMediaType ?? 'application/json';
    // A report takes a reason instead of a password.
    const payload =
      id === 'reportPublishedLink'
        ? 'reason=spam&note=the+wrong+password'
        : mediaType === 'application/json'
          ? JSON.stringify({ password: 'the wrong password' })
          : 'password=the+wrong+password';
    const attempt = readerAttempt(operation);
    const response = await app.inject({
      ...attempt,
      headers: { ...attempt.headers, 'content-type': mediaType },
      payload,
    });
    // The page answers a page and the unlock answers the one refusal, and
    // neither answer holds a name of the owner or of the workspace.
    assert.ok(
      response.statusCode === 200 || response.statusCode === 404,
      `${id} answered ${String(response.statusCode)}`,
    );
    assert.ok(!response.body.includes(ownerEmail), id);
    assert.ok(!response.body.includes(workspaceId), id);
  }
});

await test('the setup write refuses once the owner exists', async () => {
  const operation = operations.find((entry) => entry.id === 'createOwner');
  assert.ok(operation !== undefined);
  const response = await app.inject({
    ...readerAttempt(operation),
    headers: {
      ...readerAttempt(operation).headers,
      'content-type': 'application/json',
    },
    payload: JSON.stringify({
      email: 'reader@notes.invalid',
      password: 'a-strong-reader-password',
    }),
  });
  assert.equal(response.statusCode, 403);
  assert.equal(problemCodeOf(response.body), 'forbidden');
});

await test('the account path gives a published token no session', async () => {
  for (const id of protocolWrites) {
    const operation = operations.find((entry) => entry.id === id);
    assert.ok(operation !== undefined, id);
    const response = await app.inject({
      ...readerAttempt(operation),
      headers: {
        ...readerAttempt(operation).headers,
        'content-type': 'application/json',
      },
      payload: JSON.stringify(id === 'updateProfile' ? { name: 'Reader' } : {}),
    });
    if (id === 'updateProfile') {
      assert.equal(response.statusCode, 401);
      assert.equal(problemCodeOf(response.body), 'unauthenticated');
    }
  }
  // Whatever each of those answered, the token is still not a session: the
  // guarded read of the owner refuses it exactly as it did before.
  const guarded = operations.find((entry) => entry.id === 'listFiles');
  assert.ok(guarded !== undefined);
  const response = await app.inject({
    method: 'GET',
    url: addressOf(guarded),
    headers: {
      host: '127.0.0.1',
      cookie: `notesapp_session=${token}`,
      authorization: `Bearer ${token}`,
    },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(problemCodeOf(response.body), 'unauthenticated');
});

await test('the note and every list of the workspace are unchanged', async () => {
  const after = await stateOfTheWorkspace();
  assert.equal(after, before);
});

await app.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
