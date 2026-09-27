import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyActor, type Actor } from './actor.ts';
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from './sessions.ts';
import type {
  AccountTransaction,
  SessionRecord,
  WorkspaceAdminStore,
} from '../workspaces/ports.ts';

function actorFor(accountId: string): Actor {
  const made = verifyActor(accountId, []);
  if (!made.ok) throw new Error('the test actor was rejected');
  return made.value;
}

function session(id: string, lastActiveAt: string): SessionRecord {
  return {
    sessionId: id,
    userAgent: null,
    createdAt: '2026-09-27T08:00:00.000Z',
    lastActiveAt,
    expiresAt: '2026-10-04T08:00:00.000Z',
  };
}

/** A store of one account whose sessions a use case reads and ends. */
function storeWith(sessions: SessionRecord[]): WorkspaceAdminStore & {
  readonly held: SessionRecord[];
} {
  const held = [...sessions];
  const fail = (): never => {
    throw new Error('not used');
  };
  const tx: Pick<
    AccountTransaction,
    'sessions' | 'revokeSession' | 'revokeOtherSessions'
  > = {
    sessions: () => Promise.resolve([...held]),
    revokeSession: (id) => {
      const index = held.findIndex((entry) => entry.sessionId === id);
      if (index === -1) return Promise.resolve(false);
      held.splice(index, 1);
      return Promise.resolve(true);
    },
    revokeOtherSessions: (keep) => {
      const before = held.length;
      const kept = held.filter((entry) => entry.sessionId === keep);
      held.splice(0, held.length, ...kept);
      return Promise.resolve(before - held.length);
    },
  };
  return {
    held,
    account: (_actor, run) =>
      run({
        ...tx,
        workspaces: fail,
        memberships: fail,
        preferences: fail,
        standing: fail,
        savePreferences: fail,
        consent: fail,
        recordConsent: fail,
        createWorkspace: fail,
        lockWorkspace: fail,
        recordMembershipChange: fail,
      }),
    workspace: fail,
  };
}

const actor = actorFor('11111111-1111-4111-8111-111111111111');

await test('the current session comes first, then the most recently used', async () => {
  const store = storeWith([
    session('old', '2026-09-27T09:00:00.000Z'),
    session('mine', '2026-09-27T08:30:00.000Z'),
    session('new', '2026-09-27T10:00:00.000Z'),
  ]);
  const listed = await listSessions(store, actor, 'mine');
  assert.ok(listed.ok);
  assert.deepEqual(
    listed.value.map((entry) => [entry.sessionId, entry.current]),
    [
      ['mine', true],
      ['new', false],
      ['old', false],
    ],
  );
});

await test('one session ends, and an unknown one answers not found', async () => {
  const store = storeWith([session('a', '2026-09-27T09:00:00.000Z')]);
  assert.deepEqual(await revokeSession(store, actor, 'a'), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await revokeSession(store, actor, 'a'), {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
});

await test('every other session ends and the current one stays', async () => {
  const store = storeWith([
    session('mine', '2026-09-27T09:00:00.000Z'),
    session('b', '2026-09-27T09:00:00.000Z'),
    session('c', '2026-09-27T09:00:00.000Z'),
  ]);
  assert.deepEqual(await revokeOtherSessions(store, actor, 'mine'), {
    ok: true,
    value: 2,
  });
  assert.deepEqual(
    store.held.map((entry) => entry.sessionId),
    ['mine'],
  );
});
