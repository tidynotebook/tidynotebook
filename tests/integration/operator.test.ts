/**
 * The operator API and the portal handoff, through the served composition
 * (record 0190).
 *
 * One installation runs with an operator token file and an account portal,
 * and a second one on the same database runs with neither. Each check reads
 * what a service of the operator gets: the status, the problem code, and the
 * state that the next read shows.
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
  createInvitation,
  createOwner,
  findOperatorAccount,
  getAccount,
  listOperatorAccountEvents,
  listWorkspaces,
  openAccountPortal,
  readOperatorAccount,
  readOperatorTotals,
  redeemAccountHandoff,
  registerAccount,
  removeOperatorAccount,
  setOperatorAccountControls,
} from '@notesapp/api-client';
import { createApp, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase, openSession } from './support/database.ts';

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
const directory = await mkdtemp(join(tmpdir(), 'notesapp-operator-test-'));
const tokenFile = join(directory, 'operator_token');
const operatorToken = `operator-${randomUUID()}-${randomUUID()}`;
await writeFile(tokenFile, `${operatorToken}\n`);
const portal = 'https://billing.example.test/portal';
const baseEnvironment = {
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: directory,
  NOTESAPP_AUTH_SECRET: 'operator-test-secret-0123456789abcdef',
  NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '8388608',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
  // Each check makes accounts, so the attempt limit stays out of the way.
  NOTESAPP_RATE_LIMIT_MAX: '10000',
};
const app = await createApp(
  loadServerConfig({
    ...baseEnvironment,
    NOTESAPP_OPERATOR_TOKEN_FILE: tokenFile,
    NOTESAPP_ACCOUNT_PORTAL_URL: portal,
  }),
);
await app.listen({ host: '127.0.0.1', port: 0 });
const offApp = await createApp(loadServerConfig(baseEnvironment));
await offApp.listen({ host: '127.0.0.1', port: 0 });
// The bound of failed tokens, with a limit that a check can reach.
const limitedApp = await createApp(
  loadServerConfig({
    ...baseEnvironment,
    NOTESAPP_RATE_LIMIT_MAX: '10',
    NOTESAPP_OPERATOR_TOKEN_FILE: tokenFile,
  }),
);
await limitedApp.listen({ host: '127.0.0.1', port: 0 });

function baseOf(server: typeof app): string {
  const address: string | AddressInfo | null = server.server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server did not bind a TCP port.');
  return `http://127.0.0.1:${String(address.port)}`;
}
const baseUrl = baseOf(app);
const offUrl = baseOf(offApp);
const limitedUrl = baseOf(limitedApp);
configureClient(baseUrl, undefined);
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

/** Invites and registers one member, and answers its session. */
async function member(): Promise<{
  email: string;
  headers: { origin: string; cookie: string };
  accountId: string;
}> {
  const email = `member-${randomUUID()}@notes.invalid`;
  const made = await createInvitation({ headers: admin, body: { email } });
  const token = new URL(made.data?.link ?? 'http://x/').hash.slice(1);
  const registered = await registerAccount({
    headers: origin,
    body: { invitation: token, password: 'member-password-123456' },
  });
  assert.equal(responseOf(registered.response).status, 201);
  const headers = {
    ...origin,
    cookie: cookieHeader(
      responseOf(registered.response).headers.getSetCookie(),
    ),
  };
  const account = await getAccount({ headers });
  return { email, headers, accountId: account.data?.accountId ?? '' };
}

await test('an installation with no token file answers operator_off', async () => {
  const someone = await member();
  const calls = [
    findOperatorAccount({
      baseUrl: offUrl,
      headers: operator,
      query: { address: someone.email },
    }),
    readOperatorAccount({
      baseUrl: offUrl,
      headers: operator,
      path: { accountId: someone.accountId },
    }),
    readOperatorTotals({ baseUrl: offUrl, headers: operator }),
    listOperatorAccountEvents({ baseUrl: offUrl, headers: operator }),
    redeemAccountHandoff({
      baseUrl: offUrl,
      headers: operator,
      body: { token: 'a'.repeat(43) },
    }),
  ];
  for (const call of await Promise.all(calls)) {
    assert.equal(responseOf(call.response).status, 404);
    assert.equal(codeOf(call.error), 'operator_off');
  }
  // The account that the installation has shows no portal either.
  const account = await getAccount({
    baseUrl: offUrl,
    headers: someone.headers,
  });
  assert.equal(account.data?.accountPortal, false);
  const opened = await openAccountPortal({
    baseUrl: offUrl,
    headers: someone.headers,
    body: { path: '/' },
  });
  assert.equal(responseOf(opened.response).status, 404);
});

await test('the operator finds an account and reads its controls and usage', async () => {
  const someone = await member();
  const found = await findOperatorAccount({
    headers: operator,
    query: { address: someone.email.toUpperCase() },
  });
  assert.equal(found.error, undefined, JSON.stringify(found.error));
  assert.equal(found.data?.accountId, someone.accountId);
  assert.equal(found.data?.email, someone.email);
  assert.deepEqual(found.data?.controls.features, {
    teams: true,
    collaboration: true,
  });
  assert.equal(found.data?.controls.standing, 'active');
  assert.equal(found.data?.controls.textLimitBytes, null);
  assert.equal(found.data?.usage.month, new Date().toISOString().slice(0, 7));
  assert.ok((found.data?.usage.textBytes ?? 0) > 0, 'the welcome note');
  // The answer names no workspace, no note and no link of the account.
  assert.deepEqual(Object.keys(found.data ?? {}).sort(), [
    'accountId',
    'controls',
    'createdAt',
    'email',
    'state',
    'usage',
  ]);
  const missing = await findOperatorAccount({
    headers: operator,
    query: { address: 'nobody@notes.invalid' },
  });
  assert.equal(responseOf(missing.response).status, 404);
  assert.equal(codeOf(missing.error), 'not_found');
});

await test('a control write with an old revision answers controls_changed and changes nothing', async () => {
  const someone = await member();
  const read = await readOperatorAccount({
    headers: operator,
    path: { accountId: someone.accountId },
  });
  const revision = read.data?.controls.revision ?? 0;
  const locked = await setOperatorAccountControls({
    headers: operator,
    path: { accountId: someone.accountId },
    body: {
      revision,
      standing: 'locked',
      removalAt: '2030-01-01T00:00:00.000Z',
      textLimitBytes: 2_000_000_000,
    },
  });
  assert.equal(locked.error, undefined, JSON.stringify(locked.error));
  assert.equal(locked.data?.controls.revision, revision + 1);
  assert.equal(locked.data?.controls.standing, 'locked');
  // A retried activation that read the first revision arrives after it.
  const stale = await setOperatorAccountControls({
    headers: operator,
    path: { accountId: someone.accountId },
    body: { revision, standing: 'active' },
  });
  assert.equal(responseOf(stale.response).status, 409);
  assert.equal(codeOf(stale.error), 'controls_changed');
  const after = await readOperatorAccount({
    headers: operator,
    path: { accountId: someone.accountId },
  });
  assert.deepEqual(after.data?.controls, locked.data?.controls);
  // The account reads its own controls too.
  const own = await getAccount({ headers: someone.headers });
  assert.equal(own.data?.controls.standing, 'locked');
});

await test('an administrator is never locked', async () => {
  const owner = await getAccount({ headers: admin });
  const accountId = owner.data?.accountId ?? '';
  const read = await readOperatorAccount({
    headers: operator,
    path: { accountId },
  });
  const refused = await setOperatorAccountControls({
    headers: operator,
    path: { accountId },
    body: { revision: read.data?.controls.revision ?? 0, standing: 'locked' },
  });
  assert.equal(responseOf(refused.response).status, 403);
  // The last administrator is not removed either.
  const removal = await removeOperatorAccount({
    headers: operator,
    path: { accountId },
  });
  assert.equal(responseOf(removal.response).status, 409);
  assert.equal(codeOf(removal.error), 'last_administrator');
});

await test('a handoff works once and expires', async () => {
  const someone = await member();
  const account = await getAccount({ headers: someone.headers });
  assert.equal(account.data?.accountPortal, true);
  const opened = await openAccountPortal({
    headers: someone.headers,
    body: { path: '/plans' },
  });
  assert.equal(opened.error, undefined, JSON.stringify(opened.error));
  const url = new URL(opened.data?.url ?? 'http://x/');
  assert.equal(`${url.origin}${url.pathname}`, `${portal}/plans`);
  const token = url.searchParams.get('token') ?? '';
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  // Only the digest of the token is at rest.
  const setup = await openSession(database.migrationUrl);
  try {
    const stored = await setup.query<{ token_digest: string }>(
      'select token_digest from account_handoffs where account_id = $1',
      [someone.accountId],
    );
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0]?.token_digest, token);
  } finally {
    await setup.close();
  }
  const redeemed = await redeemAccountHandoff({
    headers: operator,
    body: { token },
  });
  assert.deepEqual(redeemed.data, {
    accountId: someone.accountId,
    email: someone.email,
  });
  const again = await redeemAccountHandoff({
    headers: operator,
    body: { token },
  });
  assert.equal(responseOf(again.response).status, 404);
  assert.equal(codeOf(again.error), 'not_found');
  // A second handoff passes its life of 60 seconds before the portal asks.
  const late = await openAccountPortal({
    headers: someone.headers,
    body: { path: '/' },
  });
  const lateToken =
    new URL(late.data?.url ?? 'http://x/').searchParams.get('token') ?? '';
  const expire = await openSession(database.migrationUrl);
  try {
    await expire.query(
      `update account_handoffs set expires_at = now() - interval '1 second'
        where account_id = $1 and used_at is null`,
      [someone.accountId],
    );
  } finally {
    await expire.close();
  }
  const expired = await redeemAccountHandoff({
    headers: operator,
    body: { token: lateToken },
  });
  assert.equal(responseOf(expired.response).status, 404);
  assert.equal(codeOf(expired.error), 'not_found');
});

await test('the event cursor misses no event', async () => {
  const start = await listOperatorAccountEvents({
    headers: operator,
    query: { after: 0, limit: 500 },
  });
  let cursor = start.data?.cursor ?? 0;
  const seen: { cursor: number; accountId: string; kind: string }[] = [];
  let writing = true;
  // A reader follows the cursor while accounts are made at the same time. A
  // cursor that a later commit could pass would leave a hole in what it saw.
  const reader = (async () => {
    for (;;) {
      const page = await listOperatorAccountEvents({
        headers: operator,
        query: { after: cursor, limit: 3 },
      });
      for (const event of page.data?.events ?? []) seen.push(event);
      cursor = page.data?.cursor ?? cursor;
      if (!writing && (page.data?.events.length ?? 0) === 0) return;
    }
  })();
  const made = await Promise.all(Array.from({ length: 6 }, () => member()));
  writing = false;
  await reader;
  const everything = await listOperatorAccountEvents({
    headers: operator,
    query: { after: start.data?.cursor ?? 0, limit: 500 },
  });
  assert.deepEqual(seen, everything.data?.events);
  const cursors = seen.map((event) => event.cursor);
  assert.deepEqual(
    cursors,
    cursors.map((_, index) => (cursors[0] ?? 0) + index),
  );
  for (const someone of made)
    assert.deepEqual(
      seen
        .filter((event) => event.accountId === someone.accountId)
        .map((event) => event.kind),
      ['made', 'verified'],
    );
});

await test('the operator removes an account and the removal is an event', async () => {
  const someone = await member();
  const before = await listOperatorAccountEvents({
    headers: operator,
    query: { after: 0, limit: 500 },
  });
  const removed = await removeOperatorAccount({
    headers: operator,
    path: { accountId: someone.accountId },
  });
  assert.deepEqual(removed.data, { removed: true });
  const read = await readOperatorAccount({
    headers: operator,
    path: { accountId: someone.accountId },
  });
  assert.equal(responseOf(read.response).status, 404);
  const events = await listOperatorAccountEvents({
    headers: operator,
    query: { after: before.data?.cursor ?? 0 },
  });
  assert.deepEqual(
    events.data?.events.map((event) => [event.accountId, event.kind]),
    [[someone.accountId, 'removed']],
  );
});

await test('the totals of a month read zero until a count is written', async () => {
  const totals = await readOperatorTotals({
    headers: operator,
    query: { month: '2026-10' },
  });
  assert.deepEqual(totals.data, {
    month: '2026-10',
    publishedTransferBytes: 0,
    downloadBytes: 0,
    objectWrites: 0,
    objectReads: 0,
  });
  const current = await readOperatorTotals({ headers: operator });
  assert.equal(current.data?.month, new Date().toISOString().slice(0, 7));
});

await test('the operator token reaches no note and a session reaches no operator operation', async () => {
  // The token is no session, so an operation of a workspace refuses it.
  const workspaces = await listWorkspaces({ headers: operator });
  assert.equal(responseOf(workspaces.response).status, 401);
  // A session is no operator token.
  const someone = await member();
  const asPerson = await readOperatorAccount({
    headers: someone.headers,
    path: { accountId: someone.accountId },
  });
  assert.equal(responseOf(asPerson.response).status, 401);
});

await test('an operator operation answers an internal host, and a normal one does not', async () => {
  const internal = await app.inject({
    method: 'GET',
    url: '/api/operator/totals',
    headers: { host: 'core.railway.internal:8080', ...operator },
  });
  assert.equal(internal.statusCode, 200);
  assert.equal(internal.headers['set-cookie'], undefined);
  const normal = await app.inject({
    method: 'GET',
    url: '/api/account',
    headers: { host: 'core.railway.internal:8080' },
  });
  assert.equal(normal.statusCode, 400);
  assert.equal(normal.json<{ code: string }>().code, 'host_not_allowed');
});

await test('a wrong or missing token changes nothing, and the failures are bounded', async () => {
  const someone = await member();
  const read = await readOperatorAccount({
    baseUrl: limitedUrl,
    headers: operator,
    path: { accountId: someone.accountId },
  });
  const revision = read.data?.controls.revision ?? 0;
  for (const headers of [
    {},
    { authorization: 'Bearer wrong-token-of-the-right-shape-0123' },
    { authorization: `Bearer ${operatorToken}x` },
    { authorization: operatorToken },
    { authorization: `Basic ${operatorToken}` },
  ]) {
    const refused = await setOperatorAccountControls({
      baseUrl: limitedUrl,
      headers,
      path: { accountId: someone.accountId },
      body: { revision, standing: 'locked' },
    });
    assert.equal(responseOf(refused.response).status, 401);
  }
  // The counter is the one of the installation, which every process shares,
  // so the failures of the checks above count too. The limit of this
  // installation is ten failures in one window: the next failures reach it,
  // and then even the right token waits.
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const refused = await readOperatorAccount({
      baseUrl: limitedUrl,
      headers: { authorization: 'Bearer another-wrong-token-0123456789' },
      path: { accountId: someone.accountId },
    });
    statuses.push(responseOf(refused.response).status);
  }
  const first429 = statuses.indexOf(429);
  assert.ok(first429 > 0, statuses.join());
  assert.ok(
    statuses.every(
      (status, index) => status === (index < first429 ? 401 : 429),
    ),
    statuses.join(),
  );
  const limited = await readOperatorAccount({
    baseUrl: limitedUrl,
    headers: operator,
    path: { accountId: someone.accountId },
  });
  assert.equal(responseOf(limited.response).status, 429);
  assert.equal(codeOf(limited.error), 'rate_limited');
  // Nothing changed.
  const setup = await openSession(database.migrationUrl);
  try {
    const rows = await setup.query<{ standing: string; revision: string }>(
      `select standing::text as standing, controls_revision::text as revision
         from accounts where id = $1`,
      [someone.accountId],
    );
    assert.deepEqual(rows, [
      { standing: 'active', revision: String(revision) },
    ]);
  } finally {
    await setup.close();
  }
});

await app.close();
await offApp.close();
await limitedApp.close();
await database.destroy();
await rm(directory, { recursive: true, force: true });
