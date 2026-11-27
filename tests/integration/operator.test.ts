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
import { setImmediate } from 'node:timers/promises';
import {
  acceptWorkspaceInvite,
  configureClient,
  createInvitation,
  createOwner,
  createWorkspace,
  createWorkspaceInvites,
  findOperatorAccount,
  getAccount,
  listOperatorAccountEvents,
  listWorkspaceMembers,
  listWorkspaces,
  openAccountPortal,
  readOperatorAccount,
  readOperatorAccountSeats,
  readOperatorTotals,
  redeemAccountHandoff,
  registerAccount,
  removeOperatorAccount,
  setOperatorAccountControls,
} from '@notesapp/api-client';
import {
  createApp,
  loadProtectedEnvironment,
  loadServerConfig,
} from '@notesapp/server';
import {
  openIdentityStore,
  readOnlyTransactionCode,
} from '@notesapp/storage-server';
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
// The secret reaches this server through its file, as Compose gives it, and
// the limited server below through its variable, as a platform with no file
// gives it (record 0207).
const app = await createApp(
  loadServerConfig(
    await loadProtectedEnvironment({
      ...baseEnvironment,
      NOTESAPP_OPERATOR_TOKEN_FILE: tokenFile,
      NOTESAPP_ACCOUNT_PORTAL_URL: portal,
    }),
  ),
);
await app.listen({ host: '127.0.0.1', port: 0 });
const offApp = await createApp(loadServerConfig(baseEnvironment));
await offApp.listen({ host: '127.0.0.1', port: 0 });
// The bound of failed tokens, with a limit that a check can reach.
const limitedApp = await createApp(
  loadServerConfig({
    ...baseEnvironment,
    NOTESAPP_RATE_LIMIT_MAX: '10',
    NOTESAPP_OPERATOR_TOKEN: operatorToken,
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
async function member(
  signal: AbortSignal | null = null,
  name?: string,
): Promise<{
  email: string;
  headers: { origin: string; cookie: string };
  accountId: string;
}> {
  const email = `member-${randomUUID()}@notes.invalid`;
  const made = await createInvitation({
    headers: admin,
    body: { email },
    signal,
  });
  const token = new URL(made.data?.link ?? 'http://x/').hash.slice(1);
  const registered = await registerAccount({
    headers: origin,
    body: {
      invitation: token,
      password: 'member-password-123456',
      ...(name === undefined ? {} : { name }),
    },
    signal,
  });
  assert.equal(responseOf(registered.response).status, 201);
  const headers = {
    ...origin,
    cookie: cookieHeader(
      responseOf(registered.response).headers.getSetCookie(),
    ),
  };
  const account = await getAccount({ headers, signal });
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
    readOperatorAccountSeats({
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
    'role',
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

await test('find, read and control writes answer the installation role', async () => {
  const someone = await member();
  const owner = await getAccount({ headers: admin });
  for (const account of [
    { accountId: someone.accountId, email: someone.email, role: 'member' },
    {
      accountId: owner.data?.accountId ?? '',
      email: 'owner@notes.invalid',
      role: 'administrator',
    },
  ]) {
    const found = await findOperatorAccount({
      headers: operator,
      query: { address: account.email },
    });
    assert.equal(found.error, undefined, JSON.stringify(found.error));
    assert.equal(found.data?.role, account.role);
    const read = await readOperatorAccount({
      headers: operator,
      path: { accountId: account.accountId },
    });
    assert.equal(read.error, undefined, JSON.stringify(read.error));
    assert.equal(read.data?.role, account.role);
    const written = await setOperatorAccountControls({
      headers: operator,
      path: { accountId: account.accountId },
      body: {
        revision: read.data?.controls.revision ?? 0,
        features: { teams: true, collaboration: true },
      },
    });
    assert.equal(written.error, undefined, JSON.stringify(written.error));
    assert.equal(written.data?.role, account.role);
    assert.equal(written.data?.controls.standing, 'active');
  }
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
  assert.equal(codeOf(refused.error), 'forbidden');
  const after = await readOperatorAccount({
    headers: operator,
    path: { accountId },
  });
  assert.equal(after.error, undefined, JSON.stringify(after.error));
  assert.deepEqual(after.data?.controls, read.data?.controls);
  assert.equal(after.data?.controls.standing, 'active');
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

/** Follows the served feed until the member calls end and the feed is empty. */
async function memberEvents(
  cursor: number,
  makeMember = member,
  readPage = async (after: number, signal: AbortSignal) => {
    const page = await listOperatorAccountEvents({
      headers: operator,
      query: { after, limit: 3 },
      signal,
    });
    assert.equal(responseOf(page.response).status, 200);
    assert.ok(page.data);
    return page.data;
  },
) {
  const seen: { cursor: number; accountId: string; kind: string }[] = [];
  let writing = true;
  const signal = AbortSignal.timeout(10_000);
  // A reader follows the cursor while accounts are made at the same time. A
  // cursor that a later commit could pass would leave a hole in what it saw.
  const reader = (async () => {
    for (let pages = 0; pages < 1000; pages += 1) {
      signal.throwIfAborted();
      const page = await readPage(cursor, signal);
      for (const event of page.events) seen.push(event);
      cursor = page.cursor;
      if (!writing && page.events.length === 0) return;
    }
    throw new Error('The event reader did not reach the end of the feed.');
  })();
  // Handle a reader failure at once. Its cleanup must not replace a member
  // failure, but a successful writer must still report a failed reader.
  const stoppedReader = reader.catch(() => {});
  const writers = Array.from({ length: 6 }, () => makeMember(signal));
  let made;
  try {
    made = await Promise.all(writers);
  } finally {
    writing = false;
    await Promise.allSettled(writers);
    await stoppedReader;
  }
  await reader;
  return { made, seen };
}

await test('a rejected member call waits for pending members and keeps the first failure', async () => {
  const failure = new Error('The first member call failed.');
  const laterFailure = new Error('The pending member call also failed.');
  const pending = Promise.withResolvers<void>();
  let calls = 0;
  let activeMembers = 0;
  let exited = false;
  const result = memberEvents(
    0,
    async () => {
      const index = calls++;
      if (index === 0) throw failure;
      if (index === 1) {
        activeMembers += 1;
        try {
          await pending.promise;
          throw laterFailure;
        } finally {
          activeMembers -= 1;
        }
      }
      return { email: '', headers: { origin: '', cookie: '' }, accountId: '' };
    },
    (cursor) => Promise.resolve({ cursor, events: [] }),
  ).then(
    () => {
      exited = true;
      return undefined;
    },
    (error: unknown) => {
      exited = true;
      return error;
    },
  );
  try {
    await setImmediate();
    assert.equal(calls, 6);
    assert.equal(activeMembers, 1);
    assert.equal(exited, false);
    pending.resolve();
    assert.equal(await result, failure);
    assert.equal(activeMembers, 0);
  } finally {
    // Release the pending member even when the old cleanup fails this check.
    pending.resolve();
    await result;
  }
});

for (const readerFails of [false, true]) {
  await test(`a rejected member call stops the event reader and keeps its failure (${readerFails ? 'failed read' : 'empty feed'})`, async () => {
    const failure = new Error('One member call failed.');
    const firstRead = Promise.withResolvers<void>();
    let calls = 0;
    let reads = 0;
    let activeReads = 0;
    await assert.rejects(
      memberEvents(
        0,
        async () => {
          const index = calls++;
          await firstRead.promise;
          if (index === 3) throw failure;
          return {
            email: '',
            headers: { origin: '', cookie: '' },
            accountId: '',
          };
        },
        async (cursor) => {
          reads += 1;
          // This guard also stops the old reader when the regression fails.
          if (reads > 8) throw new Error('The reader still runs.');
          activeReads += 1;
          try {
            firstRead.resolve();
            await setImmediate();
            if (readerFails) throw new Error('The read also failed.');
            return { cursor, events: [] };
          } finally {
            activeReads -= 1;
          }
        },
      ),
      (error: unknown) => error === failure,
    );
    assert.equal(calls, 6);
    assert.equal(activeReads, 0);
    assert.equal(reads, 1);
  });
}

await test('an event reader that never reaches an empty page fails at its bound', async () => {
  let reads = 0;
  await assert.rejects(
    memberEvents(
      0,
      () =>
        Promise.resolve({
          email: '',
          headers: { origin: '', cookie: '' },
          accountId: '',
        }),
      (cursor) => {
        reads += 1;
        // An unbounded old reader must also end when this regression fails.
        if (reads > 1000) throw new Error('The reader passed its bound.');
        return Promise.resolve({
          cursor: cursor + 1,
          events: [
            {
              cursor: cursor + 1,
              accountId: '',
              kind: 'made' as const,
              occurredAt: '',
            },
          ],
        });
      },
    ),
    { message: 'The event reader did not reach the end of the feed.' },
  );
  assert.equal(reads, 1000);
});

await test('the event cursor misses no event', async () => {
  const start = await listOperatorAccountEvents({
    headers: operator,
    query: { after: 0, limit: 500 },
  });
  const { made, seen } = await memberEvents(start.data?.cursor ?? 0);
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
      // This installation has no mail, so an invitation shows its link and
      // no message proves the address: the account is made, not verified.
      ['made'],
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
  // and the answer of a wrong token turns to the attempt limit.
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
  // The right token still passes, so wrong tokens from an address that the
  // service shares never lock the service out.
  const allowed = await readOperatorAccount({
    baseUrl: limitedUrl,
    headers: operator,
    path: { accountId: someone.accountId },
  });
  assert.equal(responseOf(allowed.response).status, 200);
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

await test('seat usage counts distinct members and open reservations across the owner workspaces', async () => {
  const owner = await member();
  const casey = await member(null, 'Casey');
  const sam = await member(null, 'Sam');
  const first = await createWorkspace({
    headers: owner.headers,
    body: { name: 'First shared workspace' },
  });
  assert.ok(first.data, JSON.stringify(first.error));
  const second = await createWorkspace({
    headers: owner.headers,
    body: { name: 'Second shared workspace' },
  });
  assert.ok(second.data, JSON.stringify(second.error));
  const firstId = first.data.workspaceId;
  const secondId = second.data.workspaceId;

  async function invite(workspaceId: string, email: string) {
    const result = await createWorkspaceInvites({
      path: { workspaceId },
      headers: owner.headers,
      body: { emails: [email], role: 'editor' },
    });
    const invitationId = result.data?.results[0]?.invitationId;
    assert.ok(invitationId, JSON.stringify(result.error));
    return invitationId;
  }

  for (const [workspaceId, person] of [
    [firstId, casey],
    [secondId, casey],
    [secondId, sam],
  ] as const) {
    const accepted = await acceptWorkspaceInvite({
      path: { invitationId: await invite(workspaceId, person.email) },
      headers: person.headers,
    });
    assert.ok(accepted.data, JSON.stringify(accepted.error));
  }

  const reservedEmail = 'reserved@notes.invalid';
  const early = await invite(firstId, reservedEmail);
  const late = await invite(secondId, reservedEmail);
  const expired = await invite(firstId, 'expired@notes.invalid');
  await invite(firstId, sam.email);

  const earliestJoin = '2025-01-01T00:00:00.000Z';
  const laterJoin = '2025-01-02T00:00:00.000Z';
  const expiry = new Date(Date.now() + 86_400_000).toISOString();
  const laterExpiry = new Date(Date.now() + 172_800_000).toISOString();
  const seed = await openSession(database.migrationUrl);
  try {
    await seed.query(
      'UPDATE memberships SET created_at = $1 WHERE workspace_id = $2 AND account_id = $3',
      [earliestJoin, secondId, casey.accountId],
    );
    await seed.query(
      'UPDATE memberships SET created_at = $1 WHERE workspace_id = $2 AND account_id = $3',
      [laterJoin, secondId, sam.accountId],
    );
    await seed.query(
      `UPDATE workspace_invitations SET expires_at = CASE id
         WHEN $1 THEN $2::timestamptz WHEN $3 THEN $4::timestamptz
         ELSE now() - interval '1 hour' END
         WHERE id IN ($1, $3, $5)`,
      [early, expiry, late, laterExpiry, expired],
    );
  } finally {
    await seed.close();
  }

  const path = { accountId: owner.accountId };
  const expected = {
    memberLimit: null,
    membersUsed: 2,
    pendingInvites: 1,
    members: [
      {
        accountId: casey.accountId,
        email: casey.email,
        name: 'Casey',
        since: earliestJoin,
      },
      {
        accountId: sam.accountId,
        email: sam.email,
        name: 'Sam',
        since: laterJoin,
      },
    ],
    invites: [
      { email: reservedEmail, expiresAt: expiry, workspaceId: firstId },
    ],
  };
  const unlimited = await readOperatorAccountSeats({ path, headers: operator });
  assert.equal(
    responseOf(unlimited.response).status,
    200,
    JSON.stringify(unlimited.error),
  );
  assert.deepEqual(unlimited.data, expected);

  const controls = await readOperatorAccount({ path, headers: operator });
  assert.ok(controls.data, JSON.stringify(controls.error));
  const limited = await setOperatorAccountControls({
    path,
    headers: operator,
    body: { revision: controls.data.controls.revision, memberLimit: 5 },
  });
  assert.ok(limited.data, JSON.stringify(limited.error));
  const usage = await readOperatorAccountSeats({ path, headers: operator });
  assert.equal(
    responseOf(usage.response).status,
    200,
    JSON.stringify(usage.error),
  );
  assert.deepEqual(usage.data, { ...expected, memberLimit: 5 });
  const roster = await listWorkspaceMembers({
    headers: owner.headers,
    path: { workspaceId: firstId },
  });
  assert.deepEqual(roster.data?.seats, {
    memberLimit: 5,
    membersUsed: expected.membersUsed,
    pendingInvites: expected.pendingInvites,
    freePlaces: 2,
  });
  const unauthenticated = await readOperatorAccountSeats({
    path,
    headers: owner.headers,
  });
  assert.equal(responseOf(unauthenticated.response).status, 401);
});

await test('seat usage distinguishes an account without workspaces from a missing account', async () => {
  const accountId = randomUUID();
  const seed = await openSession(database.migrationUrl);
  try {
    await seed.query(
      'INSERT INTO accounts (id, member_limit, limit_bytes) VALUES ($1, 4, 1048576)',
      [accountId],
    );
  } finally {
    await seed.close();
  }
  const empty = await readOperatorAccountSeats({
    path: { accountId },
    headers: operator,
  });
  assert.equal(
    responseOf(empty.response).status,
    200,
    JSON.stringify(empty.error),
  );
  assert.deepEqual(empty.data, {
    memberLimit: 4,
    membersUsed: 0,
    pendingInvites: 0,
    members: [],
    invites: [],
  });
  const missing = await readOperatorAccountSeats({
    path: { accountId: randomUUID() },
    headers: operator,
  });
  assert.equal(responseOf(missing.response).status, 404);
  assert.equal(codeOf(missing.error), 'not_found');
});

await test('the owner identity used for the operator seat read cannot write', async () => {
  const owner = await member();
  const seed = await openSession(database.migrationUrl);
  const store = openIdentityStore(database.runtimeUrl);
  try {
    const [original] = await seed.query<{ definition: string }>(
      "SELECT pg_get_functiondef('notesapp_workspace_seat_preview(uuid,text[],boolean)'::regprocedure) AS definition",
    );
    assert.ok(original);
    try {
      await seed.query(`
        CREATE OR REPLACE FUNCTION public.notesapp_workspace_seat_preview(
          p_workspace uuid, p_emails text[], p_lock boolean
        ) RETURNS TABLE(member_limit integer, members_used integer, pending_invites integer, additional_places integer)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
        BEGIN
          UPDATE public.accounts SET member_limit = 8 WHERE id = public.notesapp_current_account();
          RETURN QUERY SELECT 8, 0, 0, 0;
        END $$`);
      await assert.rejects(store.operatorSeatUsage(owner.accountId), {
        code: readOnlyTransactionCode,
      });
    } finally {
      await seed.query(original.definition);
    }
    const usage = await store.operatorSeatUsage(owner.accountId);
    assert.equal(usage?.memberLimit, null);
  } finally {
    await Promise.all([store.close(), seed.close()]);
  }
});

await app.close();
await offApp.close();
await limitedApp.close();
await database.destroy();
await rm(directory, { recursive: true, force: true });
