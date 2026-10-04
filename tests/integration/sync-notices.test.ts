/**
 * The sync notices against a real database and real server instances
 * (records 0124, 0125, 0129).
 *
 * The first part listens on the hint channel itself and proves each feed
 * writer, rollback, receipt replay, the identity hints,
 * and a failed commit. The second part runs two server instances over one
 * database, as two processes of one installation, and proves fan-out, access
 * checks, shared limits, a listener gap, and the stop of a stream.
 *
 * A test that proves that something does not happen waits for a later event
 * instead of a delay. PostgreSQL delivers the notices of two transactions in
 * the order of their commits, so a marker hint that commits after an action
 * arrives after every hint of that action.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  commitChangeset,
  configureClient,
  createFile,
  createOwner,
  createWorkspace,
  deleteWorkspace,
  getAccount,
  getFile,
  getSyncProtocol,
  listHistory,
  listSessions,
  listWorkspaces,
  purgeFiles,
  signInWithPassword,
  revokeSession,
  syncNoticesProtocol,
  updateFile,
} from '@notesapp/api-client';
import {
  createApp,
  loadServerConfig,
  type NoticeBounds,
} from '@notesapp/server';
import {
  deferHintsSetting,
  openSyncListener,
  syncHintsSetting,
  syncListenerName,
  type SyncHint,
} from '@notesapp/storage-server';
import { createDisposableDatabase, openSession } from './support/database.ts';
import {
  firstSave,
  saveForHead,
  useDocumentHeaders,
} from './support/documents.ts';
import { openStream, openTestStream, waitBoundMs } from './support/notices.ts';

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

const origin = 'http://127.0.0.1';
const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-sync-notices-'));
const config = loadServerConfig({
  NOTESAPP_ORIGIN: origin,
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'sync-notices-test-secret-0123456789abcdef',
  NOTESAPP_LOG_LEVEL: 'debug',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
});

/** Every log line that the instances wrote. */
const logLines: string[] = [];

/** One listening instance and the base address that reaches it. */
async function instance(bounds: Partial<NoticeBounds>): Promise<{
  readonly app: Awaited<ReturnType<typeof createApp>>;
  readonly baseUrl: string;
}> {
  const app = await createApp(config, {
    noticeBounds: bounds,
    logStream: {
      write: (line) => {
        logLines.push(line);
      },
    },
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address: string | AddressInfo | null = app.server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server did not bind a TCP port.');
  return { app, baseUrl: `http://127.0.0.1:${String(address.port)}` };
}

// The hints of the channel, as a listener of this test reads them.
const hints: string[] = [];
const hintWaiters: { match: (index: number) => boolean; done: () => void }[] =
  [];
let listening: () => void = () => {};
const listeningNow = new Promise<void>((resolve) => {
  listening = resolve;
});
function hintText(hint: SyncHint): string {
  if (hint.kind === 'workspace') return `w:${hint.workspaceId}`;
  if (hint.kind === 'account') return `a:${hint.accountId}`;
  if (hint.kind === 'session') return `s:${hint.sessionId}`;
  return 'p';
}
const hintListener = openSyncListener(database.runtimeUrl, {
  onHint: (hint) => {
    hints.push(hintText(hint));
    for (const waiter of [...hintWaiters])
      if (waiter.match(hints.length - 1)) {
        hintWaiters.splice(hintWaiters.indexOf(waiter), 1);
        waiter.done();
      }
  },
  onLost: () => {},
  onListening: () => {
    listening();
  },
});
await listeningNow;

/**
 * The hints that one action sent. After the action, the test sends a hint of
 * its own with a unique payload. It commits after the action, so it arrives
 * after every hint of the action, and nothing else can end the capture.
 */
async function hintsOf(action: () => Promise<void>): Promise<string[]> {
  const start = hints.length;
  await action();
  const marker = `s:marker-${randomUUID()}`;
  const waiter = {
    match: (index: number) => hints[index] === marker,
    done: () => {},
  };
  const arrived = new Promise<void>((done) => {
    waiter.done = done;
    hintWaiters.push(waiter);
  });
  const session = await openSession(database.migrationUrl);
  try {
    await session.query("select pg_notify('notesapp_sync', $1)", [marker]);
  } finally {
    await session.close();
  }
  // A hint that a lost listener missed never arrives, so the wait ends with
  // a failure that names it instead of holding the whole suite open.
  let bound: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      arrived,
      new Promise<never>((_, fail) => {
        bound = setTimeout(() => {
          fail(
            new Error(`The marker hint did not arrive in ${waitBoundMs} ms.`),
          );
        }, waitBoundMs);
      }),
    ]);
  } finally {
    clearTimeout(bound);
    const left = hintWaiters.indexOf(waiter);
    if (left !== -1) hintWaiters.splice(left, 1);
  }
  return hints.slice(start, hints.indexOf(marker, start));
}

/** Runs an action and waits until each of its hints has arrived. */
async function settled<T>(action: () => Promise<T>): Promise<T> {
  let result: T | undefined;
  let done = false;
  await hintsOf(async () => {
    result = await action();
    done = true;
  });
  if (!done || result === undefined) throw new Error('The action did not run.');
  return result;
}

const one = await instance({ streamsPerAccount: 2, listenerGraceMs: 5_000 });
const two = await instance({ streamsPerAccount: 2, listenerGraceMs: 5_000 });
configureClient(one.baseUrl, undefined);

const ownerEmail = 'notices-owner@notes.invalid';
const ownerPassword = 'owner-password-123456';
const created = await createOwner({
  headers: { origin },
  body: { email: ownerEmail, password: ownerPassword },
});
assert.equal(responseOf(created.response).status, 201);

/** Signs in once more and answers the request headers of that session. */
async function signIn(): Promise<{ origin: string; cookie: string }> {
  const signed = await signInWithPassword({
    headers: { origin },
    body: { email: ownerEmail, password: ownerPassword },
  });
  assert.equal(responseOf(signed.response).status, 200);
  return {
    origin,
    cookie: cookieHeader(responseOf(signed.response).headers.getSetCookie()),
  };
}

const owner = await signIn();
useDocumentHeaders(owner);
const accountId = (await getAccount({ headers: owner })).data?.accountId ?? '';
const workspaceId =
  (await listWorkspaces({ headers: owner })).data?.workspaces[0]?.workspaceId ??
  '';
assert.match(workspaceId, /^[0-9a-f-]{36}$/);

/** Creates one note and answers its file and revision. */
async function newNote(
  path: string,
  target = one.baseUrl,
): Promise<{ fileId: string; revisionId: string }> {
  const fileId = randomUUID();
  const made = await createFile({
    baseUrl: target,
    headers: owner,
    path: { workspaceId },
    body: {
      fileId,
      path,
      document: firstSave(`# ${path}\n`),
      revisionId: randomUUID(),
      mutationId: randomUUID(),
      deviceId: 'notices-test',
    },
  });
  assert.equal(made.error, undefined, JSON.stringify(made.error));
  return { fileId, revisionId: made.data?.revision.revisionId ?? '' };
}

/** A changeset body that creates `count` notes under one folder. */
function changeset(folder: string, count: number) {
  const clientTime = new Date().toISOString();
  const revisions = Array.from({ length: count }, (_, index) => ({
    revisionId: randomUUID(),
    fileId: randomUUID(),
    parents: [],
    path: `${folder}/note-${String(index)}.md`,
    deleted: false,
    content: {
      kind: 'markdown' as const,
      document: firstSave(`# Note ${String(index)}\n`),
    },
    clientTime,
  }));
  return {
    mutationId: randomUUID(),
    deviceId: 'notices-test',
    expectedHeads: Object.fromEntries(
      revisions.map((revision) => [revision.fileId, null]),
    ),
    revisions,
  };
}

await test('a commit sends its hint with no switch', async () => {
  const sent = await hintsOf(async () => {
    await newNote('always/first.md');
  });
  assert.deepEqual(sent, [`w:${workspaceId}`]);
});

await test('one commit of many files sends one hint of its workspace', async () => {
  const sent = await hintsOf(async () => {
    const committed = await commitChangeset({
      headers: owner,
      path: { workspaceId },
      body: changeset('many', 5),
    });
    assert.equal(committed.error, undefined, JSON.stringify(committed.error));
  });
  assert.deepEqual(sent, [`w:${workspaceId}`]);
});

await test('each feed writer sends a hint of its workspace', async () => {
  const note = await settled(() => newNote('writers/first.md'));
  const hint = [`w:${workspaceId}`];
  assert.deepEqual(
    await hintsOf(async () => {
      await newNote('writers/second.md');
    }),
    hint,
  );
  assert.deepEqual(
    await hintsOf(async () => {
      const updated = await updateFile({
        headers: { ...owner, 'if-match': `"${note.revisionId}"` },
        path: { workspaceId, fileId: note.fileId },
        body: {
          document: await saveForHead(
            workspaceId,
            note.revisionId,
            '# First, again\n',
          ),
          revisionId: randomUUID(),
          mutationId: randomUUID(),
          deviceId: 'notices-test',
        },
      });
      assert.equal(updated.error, undefined, JSON.stringify(updated.error));
    }),
    hint,
  );
  // A purge writes its rows through its own path of the trash repository.
  const doomed = await settled(() => newNote('writers/purged.md'));
  assert.deepEqual(
    await hintsOf(async () => {
      const purged = await purgeFiles({
        headers: owner,
        path: { workspaceId },
        body: { mutationId: randomUUID(), fileIds: [doomed.fileId] },
      });
      assert.equal(purged.error, undefined, JSON.stringify(purged.error));
    }),
    hint,
  );
  // A new workspace writes the membership of its owner through the identity
  // store.
  let fresh = '';
  const sent = await hintsOf(async () => {
    const made = await createWorkspace({
      headers: owner,
      body: { name: 'Second' },
    });
    fresh = made.data?.workspaceId ?? '';
  });
  assert.deepEqual(sent, [`w:${fresh}`]);
  // A SQL function such as the registration writes the feed by itself. The
  // trigger sits on the table, so every writer sends a hint by construction.
  const session = await openSession(database.migrationUrl, accountId);
  try {
    assert.deepEqual(
      await hintsOf(async () => {
        await session.query(
          `insert into sync_changes (workspace_id, cursor, entity_kind, entity_id, deleted)
           values ($1, notesapp_next_cursor($1), 'membership', $2, false)`,
          [workspaceId, accountId],
        );
      }),
      hint,
    );
  } finally {
    await session.close();
  }
});

await test('a rollback, a savepoint rollback and a replay send nothing', async () => {
  const session = await openSession(database.migrationUrl, accountId);
  const insert = `insert into sync_changes (workspace_id, cursor, entity_kind, entity_id, deleted)
    values ($1, notesapp_next_cursor($1), 'membership', $2, false)`;
  try {
    assert.deepEqual(
      await hintsOf(async () => {
        await session.query('begin');
        await session.query(insert, [workspaceId, accountId]);
        await session.query('rollback');
        await session.query('begin');
        await session.query('savepoint nested');
        await session.query(insert, [workspaceId, accountId]);
        await session.query('rollback to savepoint nested');
        await session.query('commit');
      }),
      [],
    );
  } finally {
    await session.close();
  }
  const body = changeset('replayed', 1);
  const first = await settled(() =>
    commitChangeset({
      headers: owner,
      path: { workspaceId },
      body,
    }),
  );
  assert.equal(first.error, undefined, JSON.stringify(first.error));
  assert.deepEqual(
    await hintsOf(async () => {
      const replay = await commitChangeset({
        headers: owner,
        path: { workspaceId },
        body,
      });
      assert.equal(replay.error, undefined, JSON.stringify(replay.error));
      // A commit that a stale head refuses writes nothing either.
      const stale = changeset('replayed', 1);
      const refused = await commitChangeset({
        headers: owner,
        path: { workspaceId },
        body: {
          ...stale,
          revisions: body.revisions.map((revision) => ({
            ...revision,
            revisionId: randomUUID(),
          })),
          mutationId: randomUUID(),
        },
      });
      assert.notEqual(responseOf(refused.response).status, 200);
    }),
    [],
  );
});

await test('a deferring transaction marks its hint and queues no notice', async () => {
  // Record 0144. The unit of work of the store asks the trigger to mark, and
  // it sends the hint itself after its commit. A session that marks and does
  // not send therefore sends nothing, and its mark names the workspace.
  const session = await openSession(database.migrationUrl, accountId);
  try {
    let mark = '';
    assert.deepEqual(
      await hintsOf(async () => {
        await session.query('begin');
        await session.query("select set_config($1, 'on', true)", [
          deferHintsSetting,
        ]);
        await session.query(
          `insert into sync_changes (workspace_id, cursor, entity_kind, entity_id, deleted)
           values ($1, notesapp_next_cursor($1), 'membership', $2, false)`,
          [workspaceId, accountId],
        );
        const rows = await session.query<{ mark: string }>(
          'select current_setting($1, true) as mark',
          [syncHintsSetting],
        );
        mark = rows[0]?.mark ?? '';
        await session.query('commit');
      }),
      [],
    );
    assert.equal(mark, workspaceId);
  } finally {
    await session.close();
  }
  // The same write through the store sends its hint after its commit.
  assert.deepEqual(
    await hintsOf(async () => {
      await newNote('deferred/after-commit.md');
    }),
    [`w:${workspaceId}`],
  );
});

await test('a session end and an account change send their own hints', async () => {
  const extra = await signIn();
  const sessions =
    (await listSessions({ headers: extra })).data?.sessions ?? [];
  const current = sessions.find((session) => session.current)?.sessionId ?? '';
  assert.notEqual(current, '');
  const ended = await hintsOf(async () => {
    const out = await revokeSession({
      headers: owner,
      path: { sessionId: current },
    });
    assert.equal(responseOf(out.response).status, 200);
  });
  assert.deepEqual(ended, [`s:${current}`]);
  // The hint names the session, never its token.
  const token = extra.cookie.split('=')[1] ?? '';
  assert.equal(ended.join().includes(token.split('.')[0] ?? token), false);

  const session = await openSession(database.migrationUrl);
  try {
    assert.deepEqual(
      await hintsOf(async () => {
        await session.query(
          "update accounts set state = 'disabled' where id = $1",
          [accountId],
        );
        await session.query(
          "update accounts set state = 'enabled' where id = $1",
          [accountId],
        );
      }),
      [`a:${accountId}`, `a:${accountId}`],
    );
    // A change of a control raises the revision, so it sends the hint of
    // record 0129 too (record 0189), and the open application reads the
    // account again.
    assert.deepEqual(
      await hintsOf(async () => {
        // The account of this test administers the installation, which is
        // never locked, so a limit changes.
        await session.query(
          'update accounts set text_limit_bytes = 1000000000, controls_revision = controls_revision + 1 where id = $1',
          [accountId],
        );
        await session.query(
          'update accounts set text_limit_bytes = null, controls_revision = controls_revision + 1 where id = $1',
          [accountId],
        );
      }),
      [`a:${accountId}`, `a:${accountId}`],
    );
    // An update that changes neither the state, the removal nor the controls
    // is silent.
    assert.deepEqual(
      await hintsOf(async () => {
        await session.query(
          'update accounts set limit_bytes = limit_bytes where id = $1',
          [accountId],
        );
      }),
      [],
    );
  } finally {
    await session.close();
  }
});

await test('every hint carries an identifier and nothing else', () => {
  for (const hint of hints)
    assert.match(
      hint,
      /^(p|w:[0-9a-f-]{36}|a:[0-9a-f-]{36}|s:[A-Za-z0-9_-]{8,64})$/,
      hint,
    );
});

await test('a commit that fails at its end reports no acceptance and retries', async () => {
  // PostgreSQL queues a notice at commit, and a full queue fails that commit.
  // A deferred trigger that fails at commit takes the same path here, because
  // no test can fill the queue of a shared service.
  const session = await openSession(database.migrationUrl);
  try {
    await session.query(`create function test_fail_at_commit() returns trigger
      language plpgsql as $$ begin raise exception 'the notice queue is full'; end $$`);
    await session.query(`create constraint trigger test_fail_at_commit
      after insert on sync_changes deferrable initially deferred
      for each row execute function test_fail_at_commit()`);
    const body = changeset('queue-full', 1);
    const fileId = body.revisions[0]?.fileId ?? '';
    const failed = await commitChangeset({
      headers: owner,
      path: { workspaceId },
      body,
    });
    assert.ok(responseOf(failed.response).status >= 500);
    const missing = await getFile({
      headers: owner,
      path: { workspaceId, fileId },
    });
    assert.equal(responseOf(missing.response).status, 404);

    await session.query('drop trigger test_fail_at_commit on sync_changes');
    const retried = await commitChangeset({
      headers: owner,
      path: { workspaceId },
      body,
    });
    assert.equal(retried.error, undefined, JSON.stringify(retried.error));
    const history = await listHistory({
      headers: owner,
      path: { workspaceId, fileId },
    });
    assert.equal(history.data?.revisions.length, 1);
  } finally {
    await session.query('drop function if exists test_fail_at_commit()');
    await session.close();
  }
});

/** Waits until an instance offers the stream, which needs its listener. */
async function offered(baseUrl: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    const answer = await getSyncProtocol({ baseUrl });
    if ((answer.data?.notificationProtocols ?? []).length > 0) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`${baseUrl} offered no stream in 20 s.`);
}

await test('both instances offer the stream once they listen', async () => {
  await offered(one.baseUrl);
  await offered(two.baseUrl);
  const answer = await getSyncProtocol({ baseUrl: two.baseUrl });
  assert.deepEqual(answer.data?.notificationProtocols, [syncNoticesProtocol]);
});

await test('an upgrade needs a session, an origin and the subprotocol', async () => {
  const cases: readonly (readonly [
    { cookie?: string; origin?: string },
    string | undefined,
    number,
  ])[] = [
    [{ origin }, undefined, 401],
    [{ cookie: owner.cookie }, undefined, 403],
    [{ cookie: owner.cookie, origin: 'https://evil.invalid' }, undefined, 403],
    [{ cookie: owner.cookie, origin }, 'notesapp.sync.0', 400],
  ];
  for (const [headers, protocol, status] of cases) {
    const upgrade = await openTestStream(one.baseUrl, headers, protocol);
    assert.deepEqual(
      upgrade,
      { opened: false, status },
      JSON.stringify(headers),
    );
  }
});

await test('a commit on one instance wakes a stream on the other', async () => {
  const stream = await openStream(one.baseUrl, owner);
  assert.deepEqual(await stream.waitFor((m) => m.kind === 'ready'), {
    kind: 'ready',
    accountId,
  });
  stream.send({
    kind: 'subscribe',
    generation: 1,
    workspaceIds: [workspaceId],
  });
  await stream.waitFor((m) => m.kind === 'subscribed');
  await newNote('fan-out/note.md', two.baseUrl);
  assert.deepEqual(await stream.waitFor((m) => m.kind === 'changed'), {
    kind: 'changed',
    generation: 1,
    workspaceId,
  });
  stream.close();
  await stream.closed;
});

await test('a workspace outside the account is refused, and a lost one is silent', async () => {
  const stream = await openStream(two.baseUrl, owner);
  stream.send({
    kind: 'subscribe',
    generation: 1,
    workspaceIds: [randomUUID()],
  });
  assert.deepEqual(await stream.waitFor((m) => m.kind === 'refused'), {
    kind: 'refused',
    generation: 1,
    reason: 'forbidden',
  });
  const made = await createWorkspace({
    headers: owner,
    body: { name: 'Lost' },
  });
  const lost = made.data?.workspaceId ?? '';
  stream.send({
    kind: 'subscribe',
    generation: 2,
    workspaceIds: [workspaceId, lost],
  });
  await stream.waitFor((m) => m.kind === 'subscribed');
  // The account loses the workspace, and a late hint for it still arrives.
  const removed = await deleteWorkspace({
    headers: owner,
    path: { workspaceId: lost },
  });
  assert.equal(removed.error, undefined, JSON.stringify(removed.error));
  const session = await openSession(database.migrationUrl);
  try {
    await session.query("select pg_notify('notesapp_sync', $1)", [`w:${lost}`]);
  } finally {
    await session.close();
  }
  await newNote('lost/after.md');
  await stream.waitFor(
    (m) => m.kind === 'changed' && m.workspaceId === workspaceId,
  );
  assert.equal(
    stream.messages.some((m) => m.kind === 'changed' && m.workspaceId === lost),
    false,
  );
  stream.close();
  await stream.closed;
});

await test('a malformed frame stops the stream', async () => {
  const stream = await openStream(one.baseUrl, owner);
  stream.sendRaw('{"kind":"shout"}');
  assert.deepEqual(await stream.waitFor((m) => m.kind === 'stop'), {
    kind: 'stop',
    reason: 'malformed',
  });
  assert.equal(await stream.closed, 1008);
});

await test('an ended session and a disabled account stop their streams', async () => {
  const extra = await signIn();
  const stream = await openStream(two.baseUrl, extra);
  await stream.waitFor((m) => m.kind === 'ready');
  const listed = (await listSessions({ headers: extra })).data?.sessions ?? [];
  const current = listed.find((session) => session.current)?.sessionId ?? '';
  const out = await revokeSession({
    baseUrl: one.baseUrl,
    headers: owner,
    path: { sessionId: current },
  });
  assert.equal(responseOf(out.response).status, 200);
  assert.deepEqual(await stream.waitFor((m) => m.kind === 'stop'), {
    kind: 'stop',
    reason: 'session_ended',
  });
  await stream.closed;

  const next = await openStream(one.baseUrl, owner);
  await next.waitFor((m) => m.kind === 'ready');
  const session = await openSession(database.migrationUrl);
  try {
    await session.query(
      "update accounts set state = 'disabled' where id = $1",
      [accountId],
    );
    assert.deepEqual(await next.waitFor((m) => m.kind === 'stop'), {
      kind: 'stop',
      reason: 'session_ended',
    });
    await next.closed;
  } finally {
    await session.query("update accounts set state = 'enabled' where id = $1", [
      accountId,
    ]);
    await session.close();
  }
});

await test('the stream limit of an account holds across instances', async () => {
  const left = await openStream(one.baseUrl, owner);
  const right = await openStream(two.baseUrl, owner);
  const third = await openTestStream(one.baseUrl, owner);
  assert.deepEqual(third, { opened: false, status: 503 });
  left.close();
  await left.closed;
  // The release is a write of the other instance, so the next open waits for
  // it, and a refusal before it lands is expected.
  const reopening = Date.now();
  for (;;) {
    assert.ok(Date.now() - reopening < 20_000, 'no stream opened in 20 s');
    const again = await openTestStream(two.baseUrl, owner);
    if (again.opened) {
      again.stream.close();
      await again.stream.closed;
      break;
    }
    assert.equal(again.status, 503);
  }
  right.close();
  await right.closed;
  // Each close releases its reservation after the socket ends, so the test
  // waits until no reservation is left before the next one opens a stream.
  const session = await openSession(database.migrationUrl);
  try {
    const started = Date.now();
    for (;;) {
      const rows = await session.query<{ held: number }>(
        'select count(*)::int as held from stream_reservations where expires_at > now()',
      );
      if (rows[0]?.held === 0) break;
      if (Date.now() - started > 20_000)
        throw new Error('A stream reservation stayed after its stream closed.');
    }
  } finally {
    await session.close();
  }
});

/**
 * Ends every listening connection of the channel in the database of this test.
 *
 * The PostgreSQL service is shared by every test file and every worktree, so
 * the query names this database. Without it the test also ended the
 * listeners of other runs, and a run that lost its listener waited for a hint
 * that never came.
 */
async function endListeners(): Promise<void> {
  const session = await openSession(database.migrationUrl);
  try {
    await session.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where application_name = $1 and datname = current_database()',
      [syncListenerName],
    );
  } finally {
    await session.close();
  }
}

await test('the end of the listeners of this test leaves another database alone', async () => {
  // Another test file or another worktree listens on the same service.
  const other = await createDisposableDatabase();
  let lost = false;
  let listening: () => void = () => {};
  const listeningNow = new Promise<void>((resolve) => {
    listening = resolve;
  });
  const listener = openSyncListener(other.runtimeUrl, {
    onHint: () => {},
    onLost: () => {
      lost = true;
    },
    onListening: () => {
      listening();
    },
  });
  try {
    await listeningNow;
    await endListeners();
    const session = await openSession(other.migrationUrl);
    try {
      const rows = await session.query<{ held: number }>(
        'select count(*)::int as held from pg_stat_activity where application_name = $1 and datname = current_database()',
        [syncListenerName],
      );
      assert.equal(rows[0]?.held, 1);
    } finally {
      await session.close();
    }
    assert.equal(lost, false);
  } finally {
    await listener.close();
    await other.destroy();
  }
  // The listeners of this test come back before the next test reads them.
  await offered(one.baseUrl);
  await offered(two.baseUrl);
});

await test('a listener that closes before its connection opens still ends', async () => {
  // The defect this covers: a close while the pool was still opening the
  // connection released nothing, the connection then arrived and was kept, and
  // the end of the pool waited for it for ever. A server that stopped right
  // after it started never stopped.
  const other = await createDisposableDatabase();
  try {
    const listener = openSyncListener(other.runtimeUrl, {
      onHint: () => {},
      onLost: () => {},
      onListening: () => {},
    });
    let timer: NodeJS.Timeout | undefined;
    const ended = await Promise.race([
      listener.close().then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          resolve(false);
        }, waitBoundMs);
      }),
    ]);
    clearTimeout(timer);
    assert.equal(ended, true);
    assert.equal(listener.listening(), false);
  } finally {
    await other.destroy();
  }
});

await test('a short listener gap ends with reconcile', async () => {
  const stream = await openStream(one.baseUrl, owner);
  stream.send({
    kind: 'subscribe',
    generation: 7,
    workspaceIds: [workspaceId],
  });
  await stream.waitFor((m) => m.kind === 'subscribed');
  await endListeners();
  assert.deepEqual(await stream.waitFor((m) => m.kind === 'reconcile'), {
    kind: 'reconcile',
    generation: 7,
  });
  stream.close();
  await stream.closed;
  await offered(one.baseUrl);
  await offered(two.baseUrl);
});

await test('a long listener gap and a drain stop the stream', async () => {
  const three = await instance({ listenerGraceMs: 1 });
  await offered(three.baseUrl);
  const gap = await openStream(three.baseUrl, owner);
  await gap.waitFor((m) => m.kind === 'ready');
  await endListeners();
  assert.deepEqual(await gap.waitFor((m) => m.kind === 'stop'), {
    kind: 'stop',
    reason: 'unavailable',
  });
  await gap.closed;
  await offered(three.baseUrl);
  const drained = await openStream(three.baseUrl, owner);
  await drained.waitFor((m) => m.kind === 'ready');
  const closing = three.app.close();
  assert.deepEqual(await drained.waitFor((m) => m.kind === 'stop'), {
    kind: 'stop',
    reason: 'draining',
  });
  assert.equal(await drained.closed, 1001);
  await closing;
  await offered(one.baseUrl);
});

await test('a notice log line names a reason and no identifier', () => {
  const notices = logLines
    .map((line): unknown => JSON.parse(line))
    .filter(
      (record): record is Record<string, unknown> =>
        record !== null &&
        typeof record === 'object' &&
        String(Object.fromEntries(Object.entries(record)).event).startsWith(
          'notices.',
        ),
    );
  assert.ok(notices.length > 0, 'the instances wrote notice records');
  const allowed = new Set([
    'level',
    'time',
    'pid',
    'hostname',
    'event',
    'reason',
  ]);
  for (const record of notices)
    for (const key of Object.keys(record)) assert.ok(allowed.has(key), key);
  const text = logLines.join('\n');
  const token = owner.cookie.split('=')[1] ?? '';
  assert.equal(text.includes(token), false, 'no session token in any log');
});

// Teardown
await one.app.close();
await two.app.close();
await hintListener.close();
await rm(storageRoot, { recursive: true, force: true });
await database.destroy();
