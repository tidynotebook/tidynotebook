import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';
import {
  defaultAccountLimitBytes,
  deleteWorkspace,
  listWorkspaces,
  registerAccount,
  workspaceCollaboration,
  workspaceInvitationWrite,
  type Actor,
} from '@notesapp/core';
import { openIdentityStore } from '@notesapp/storage-server';
import {
  createDisposableDatabase,
  memberActor,
  openSession,
  seedWorkspace,
  testActor,
  type TestSession,
} from './support/database.ts';

const db = await createDisposableDatabase();
const identity = openIdentityStore(db.runtimeUrl);
const workspaceId = randomUUID();
const ownerId = randomUUID();
const adminId = randomUUID();
const guestId = randomUUID();
const viewerId = randomUUID();
const guestPersonal = randomUUID();
const otherOwned = randomUUID();

async function addAddress(accountId: string, email: string) {
  const dbSession = await openSession(db.migrationUrl);
  try {
    await dbSession.query(
      `insert into auth_user(id, name, email, email_verified, created_at, updated_at)
      values ($1, $2, $3, true, now(), now())`,
      [accountId, email, email],
    );
    await dbSession.query(
      'insert into account_identities(auth_user_id, account_id) values ($1, $2)',
      [accountId, accountId],
    );
  } finally {
    await dbSession.close();
  }
}

function invite(actor: Actor, email: string) {
  const id = randomUUID();
  return identity.collaboration(actor, workspaceId, (tx) =>
    tx.createInvite({
      invitationId: id,
      email,
      role: 'editor',
      digest: createHash('sha256').update(id).digest('hex'),
      seal: `sealed-${id}`,
    }),
  );
}

const off = { ok: false, error: { code: 'collaboration_off', fileIds: [] } };

async function changeSwitch(
  session: TestSession,
  accountId: string,
  enabled: boolean,
) {
  await session.query(
    'update accounts set collaboration = $2, controls_revision = controls_revision + 1 where id = $1',
    [accountId, enabled],
  );
}

async function waitForBlocked(session: TestSession, pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] = await session.query<{ waiting: boolean }>(
      'select cardinality(pg_blocking_pids($1)) > 0 as waiting',
      [pid],
    );
    if (row?.waiting) return;
    await pause(20);
  }
  assert.fail('The invitation write did not wait for the switch change.');
}

try {
  await seedWorkspace(db, workspaceId, [
    { accountId: ownerId, role: 'owner' },
    { accountId: adminId, role: 'admin' },
    { accountId: viewerId, role: 'viewer' },
  ]);
  await seedWorkspace(db, otherOwned, [{ accountId: ownerId, role: 'owner' }]);
  await seedWorkspace(db, guestPersonal, [
    { accountId: guestId, role: 'owner' },
  ]);
  await addAddress(ownerId, 'owner@example.test');
  await addAddress(adminId, 'admin@example.test');
  await addAddress(guestId, 'guest@example.test');
  await addAddress(viewerId, 'viewer@example.test');

  const owner = memberActor(ownerId, workspaceId);
  const admin = memberActor(adminId, workspaceId);
  const viewer = memberActor(viewerId, workspaceId);
  const guest = testActor(guestId, []);

  await test('the runtime blocks viewer writes and direct membership insertion', async () => {
    const session = await openSession(db.runtimeUrl, viewerId);
    try {
      assert.equal(
        (
          await session.failure(
            'insert into memberships(workspace_id, account_id, role) values ($1, $2, $3)',
            [workspaceId, guestId, 'editor'],
          )
        ).code,
        '42501',
      );
      assert.equal(
        (
          await session.failure(
            "insert into files(workspace_id, id, kind, path, deleted, head_revision_id) values ($1, $2, 'note', 'Test.md', false, null)",
            [workspaceId, randomUUID()],
          )
        ).code,
        '42501',
      );
      assert.deepEqual(
        await session.query('select id from accounts where id = $1', [ownerId]),
        [],
      );
    } finally {
      await session.close();
    }
    await assert.rejects(() => invite(viewer, 'another@example.test'), {
      code: '42501',
    });
    const roster = await identity.collaboration(viewer, workspaceId, (tx) =>
      tx.members(null),
    );
    assert.equal(roster.memberCount, 3);
    assert.equal(
      roster.members.find((m) => m.accountId === adminId)?.email,
      'admin@example.test',
    );
  });

  await test('duplicates return the same pending invite and two accepts make one membership', async () => {
    assert.deepEqual(await invite(admin, 'viewer@example.test'), {
      outcome: 'already_member',
    });
    const first = await invite(admin, 'guest@example.test');
    assert.equal(first.outcome, 'created');
    assert.ok('invitationId' in first);
    const id = first.invitationId;
    assert.deepEqual(await invite(owner, 'guest@example.test'), {
      outcome: 'pending_invite',
      invitationId: id,
    });
    assert.equal(
      await identity.collaboration(viewer, null, (tx) =>
        tx.answerInvite(id, true),
      ),
      null,
    );
    const accept = () =>
      identity.collaboration(guest, null, (tx) => tx.answerInvite(id, true));
    const [a, b] = await Promise.all([accept(), accept()]);
    assert.equal(a?.role, 'editor');
    assert.deepEqual(b, a);
    const before = await identity.collaboration(admin, workspaceId, (tx) =>
      tx.members(null),
    );
    assert.equal(before.memberCount, 4);
    assert.equal(
      await identity.collaboration(admin, workspaceId, (tx) =>
        tx.changeMember(guestId, 'viewer', false),
      ),
      'ok',
    );
    assert.equal((await accept())?.role, 'viewer');
    assert.equal(
      await identity.collaboration(admin, workspaceId, (tx) =>
        tx.changeMember(guestId, null, false),
      ),
      'ok',
    );
    assert.equal(await accept(), null);
  });

  await test('the owner switch pauses new memberships and preserves open invitations and member management', async () => {
    const control = await openSession(db.migrationUrl);
    try {
      await changeSwitch(control, adminId, false);
      await changeSwitch(control, guestId, false);
      const invited = await invite(admin, 'guest@example.test');
      assert.ok('invitationId' in invited);
      const declineId = invited.invitationId;
      const revoke = await invite(owner, 'revoke@example.test');
      assert.ok('invitationId' in revoke);
      const signup = await invite(owner, 'signup@example.test');
      assert.ok('invitationId' in signup);
      const signupId = randomUUID();
      await control.query(
        'insert into auth_user(id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())',
        [signupId, 'New member', 'signup@example.test'],
      );
      const invitationTokenDigest = createHash('sha256')
        .update(signup.invitationId)
        .digest('hex');
      const accept = (accepting: boolean) =>
        workspaceInvitationWrite(() =>
          identity.collaboration(guest, null, (tx) =>
            tx.answerInvite(declineId, accepting),
          ),
        );
      const roster = () =>
        identity.collaboration(admin, workspaceId, (tx) => tx.invites(null));
      await changeSwitch(control, ownerId, false);
      assert.deepEqual(
        await workspaceCollaboration(
          identity,
          admin,
          workspaceId,
          'invite',
          () => {
            assert.fail('An invitation ran while the owner switch was off.');
          },
        ),
        off,
      );
      assert.deepEqual(
        await workspaceInvitationWrite(() => invite(owner, 'off@example.test')),
        off,
      );
      assert.deepEqual(await accept(true), off);
      assert.deepEqual(
        await registerAccount(identity, {
          authUserId: signupId,
          ground: { kind: 'invitation', tokenDigest: invitationTokenDigest },
          accountId: randomUUID(),
          workspaceId: randomUUID(),
          workspaceName: 'Personal',
          newAccount: {
            limitBytes: defaultAccountLimitBytes,
            standing: 'active',
            removeAfterSeconds: null,
          },
        }),
        off,
      );
      assert.equal(await identity.accountOf(signupId), null);
      assert.ok(
        (await roster()).some(
          (entry) =>
            entry.invitationId === declineId && !entry.collaborationEnabled,
        ),
      );
      assert.ok(
        (await roster()).some(
          (entry) => entry.invitationId === signup.invitationId,
        ),
      );
      assert.equal(
        await identity.collaboration(admin, workspaceId, (tx) =>
          tx.changeMember(viewerId, 'editor', false),
        ),
        'ok',
      );
      assert.equal(
        await identity.collaboration(owner, workspaceId, (tx) =>
          tx.changeMember(viewerId, 'viewer', false),
        ),
        'ok',
      );
      assert.equal(
        await identity.collaboration(admin, workspaceId, (tx) =>
          tx.adminInvite(revoke.invitationId, true),
        ),
        'revoked',
      );
      const declined = await accept(false);
      assert.ok(declined.ok && declined.value?.workspaceId === workspaceId);
      assert.deepEqual(
        (await roster()).map((entry) => entry.invitationId),
        [signup.invitationId],
      );
      assert.equal(
        await identity.collaboration(admin, workspaceId, (tx) =>
          tx.adminInvite(signup.invitationId, true),
        ),
        'revoked',
      );
      await changeSwitch(control, ownerId, true);
      const renewed = await invite(admin, 'guest@example.test');
      assert.ok('invitationId' in renewed);
      const joined = await identity.collaboration(guest, null, (tx) =>
        tx.answerInvite(renewed.invitationId, true),
      );
      assert.equal(joined?.role, 'editor');
      await changeSwitch(control, ownerId, false);
      assert.deepEqual(
        await identity.collaboration(guest, null, (tx) =>
          tx.answerInvite(renewed.invitationId, true),
        ),
        joined,
      );
      assert.equal(
        await identity.collaboration(admin, workspaceId, (tx) =>
          tx.changeMember(guestId, null, false),
        ),
        'ok',
      );
    } finally {
      await changeSwitch(control, ownerId, true);
      await control.close();
    }
  });

  await test('invite creation and acceptance wait for an uncommitted change to the owner switch', async () => {
    const control = await openSession(db.migrationUrl);
    const creator = await openSession(db.runtimeUrl, adminId);
    const accepter = await openSession(db.runtimeUrl, guestId);
    try {
      const pending = await invite(admin, 'guest@example.test');
      assert.ok('invitationId' in pending);
      const [creating] = await creator.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      );
      const [accepting] = await accepter.query<{ pid: number }>(
        'select pg_backend_pid() as pid',
      );
      assert.ok(creating && accepting);
      await control.query('begin');
      await changeSwitch(control, ownerId, false);
      const id = randomUUID();
      const created = creator
        .failure(
          'select * from notesapp_create_workspace_invite($1, $2, $3, $4, $5, $6)',
          [
            workspaceId,
            id,
            'race@example.test',
            'viewer',
            createHash('sha256').update(id).digest('hex'),
            'sealed',
          ],
        )
        .catch((error: unknown) => error);
      const accepted = accepter
        .failure('select * from notesapp_answer_workspace_invite($1, true)', [
          pending.invitationId,
        ])
        .catch((error: unknown) => error);
      await Promise.all([
        waitForBlocked(control, creating.pid),
        waitForBlocked(control, accepting.pid),
      ]);
      await control.query('commit');
      for (const outcome of await Promise.all([created, accepted]))
        assert.ok(
          typeof outcome === 'object' &&
            outcome !== null &&
            'code' in outcome &&
            outcome.code === 'NA005',
        );
      const listed = await identity.collaboration(admin, workspaceId, (tx) =>
        tx.invites(null),
      );
      assert.deepEqual(
        listed.map((entry) => entry.invitationId),
        [pending.invitationId],
      );
      assert.equal(
        await identity.collaboration(admin, workspaceId, (tx) =>
          tx.member(guestId),
        ),
        null,
      );
      assert.equal(
        await identity.collaboration(admin, workspaceId, (tx) =>
          tx.adminInvite(pending.invitationId, true),
        ),
        'revoked',
      );
    } finally {
      await control.query('rollback');
      await changeSwitch(control, ownerId, true);
      await Promise.all([control.close(), creator.close(), accepter.close()]);
    }
  });

  await test('expired invites free slots and the workspace holds at most 100 pending', async () => {
    const address = 'again@example.test';
    const old = await invite(admin, address);
    assert.ok('invitationId' in old);
    const maintenance = await openSession(db.migrationUrl);
    try {
      await maintenance.query(
        "update workspace_invitations set expires_at = now() - interval '1 second' where id = $1",
        [old.invitationId],
      );
    } finally {
      await maintenance.close();
    }
    const fresh = await invite(admin, address);
    assert.ok('invitationId' in fresh);
    assert.notEqual(fresh.invitationId, old.invitationId);
    await identity.collaboration(admin, workspaceId, async (tx) => {
      for (let count = 1; count < 100; count += 1) {
        const id = randomUUID();
        const result = await tx.createInvite({
          email: `test-${count}@example.test`,
          invitationId: id,
          role: 'viewer',
          digest: createHash('sha256').update(id).digest('hex'),
          seal: `sealed-${id}`,
        });
        assert.equal(result.outcome, 'created');
      }
      assert.equal((await tx.invites(null)).length, 100);
    });
    assert.deepEqual(await invite(admin, 'one-more@example.test'), {
      outcome: 'pending_limit',
    });
  });

  await test('forced removal and deletion provision Personal for stranded members', async () => {
    const leave = await identity.collaboration(viewer, workspaceId, (tx) =>
      tx.changeMember(viewerId, null, true),
    );
    assert.equal(leave, 'last_workspace');
    assert.equal(
      await identity.collaboration(admin, workspaceId, (tx) =>
        tx.changeMember(ownerId, null, false),
      ),
      'forbidden',
    );
    assert.equal(
      await identity.collaboration(admin, workspaceId, (tx) =>
        tx.changeMember(viewerId, null, false),
      ),
      'ok',
    );
    assert.equal(
      (await identity.memberships(viewerId))[0]?.welcomePending,
      true,
    );
    assert.deepEqual(await listWorkspaces(identity, viewer), {
      ok: true,
      value: [
        {
          workspaceId: (await identity.memberships(viewerId))[0]?.workspaceId,
          name: 'Personal',
          role: 'owner',
          personal: true,
        },
      ],
    });
    assert.deepEqual(await deleteWorkspace(identity, owner, workspaceId), {
      ok: true,
      value: undefined,
    });
    const remaining = await identity.memberships(adminId);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.personal, true);
    assert.equal(remaining[0]?.welcomePending, true);
  });
} finally {
  await identity.close();
  await db.destroy();
}
