import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';
import {
  checkWorkspaceSeatPreview,
  defaultAccountLimitBytes,
  ok,
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
  type SqlFailure,
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

function invite(actor: Actor, email: string, space = workspaceId) {
  const id = randomUUID();
  return identity.collaboration(actor, space, (tx) =>
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

async function waitForBlocked(
  session: TestSession,
  pid: number,
  blockerPid: number,
) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] = await session.query<{ waiting: boolean }>(
      'select $2::integer = any(pg_blocking_pids($1)) as waiting',
      [pid, blockerPid],
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
      try {
        await changeSwitch(control, ownerId, true);
      } finally {
        await control.close();
      }
    }
  });

  await test('invite creation and acceptance wait for an uncommitted change to the owner switch', async () => {
    const control = await openSession(db.migrationUrl);
    const sessions = [control];
    try {
      const creator = await openSession(db.runtimeUrl, ownerId);
      sessions.push(creator);
      const accepter = await openSession(db.runtimeUrl, guestId);
      sessions.push(accepter);
      const pending = await invite(admin, 'guest@example.test');
      assert.ok('invitationId' in pending);
      const [[controlling], [creating], [accepting]] = await Promise.all([
        control.query<{ pid: number }>('select pg_backend_pid() as pid'),
        creator.query<{ pid: number }>('select pg_backend_pid() as pid'),
        accepter.query<{ pid: number }>('select pg_backend_pid() as pid'),
      ]);
      assert.ok(controlling && creating && accepting);
      const blockerPid = controlling.pid;
      async function checkWrite(pid: number, write: () => Promise<SqlFailure>) {
        await changeSwitch(control, ownerId, true);
        await control.query('begin');
        await changeSwitch(control, ownerId, false);
        const result = write().then(
          (outcome) => ({ outcome }),
          (error: unknown) => ({ error }),
        );
        await waitForBlocked(control, pid, blockerPid);
        await control.query('commit');
        const done = await result;
        if ('error' in done) throw done.error;
        assert.equal(done.outcome.code, 'NA005');
      }

      const id = randomUUID();
      await checkWrite(creating.pid, () =>
        creator.failure(
          'select * from notesapp_create_workspace_invite($1, $2, $3, $4, $5, $6)',
          [
            otherOwned,
            id,
            'race@example.test',
            'viewer',
            createHash('sha256').update(id).digest('hex'),
            'sealed',
          ],
        ),
      );
      await checkWrite(accepting.pid, () =>
        accepter.failure(
          'select * from notesapp_answer_workspace_invite($1, true)',
          [pending.invitationId],
        ),
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
      try {
        await control.query('rollback');
        await changeSwitch(control, ownerId, true);
      } finally {
        await Promise.all(sessions.map((session) => session.close()));
      }
    }
  });

  await test('seat reservations share the owner limit across workspaces and membership events count the workspaces left', async () => {
    const buyer = randomUUID();
    const member = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    await seedWorkspace(db, first, [{ accountId: buyer, role: 'owner' }]);
    await seedWorkspace(db, second, [{ accountId: buyer, role: 'owner' }]);
    await seedWorkspace(db, randomUUID(), [
      { accountId: member, role: 'owner' },
    ]);
    await addAddress(buyer, 'buyer@example.test');
    await addAddress(member, 'seat@example.test');
    const buyerOf = (space: string) => memberActor(buyer, space);
    const memberOf = (space: string) => memberActor(member, space);
    const limit = async (memberLimit: number) => {
      await identity.operator(async (tx) => {
        const account = await tx.account(buyer, '2026-11');
        assert.ok(account);
        assert.equal(
          await tx.setControls(buyer, account.controls.revision, {
            ...account.controls,
            memberLimit,
          }),
          'written',
        );
        assert.equal(
          (await tx.account(buyer, '2026-11'))?.controls.memberLimit,
          memberLimit,
        );
      });
    };
    const seatPreview = (emails: readonly string[] = []) =>
      identity.collaboration(buyerOf(first), first, (tx) =>
        tx.seatPreview(emails, false),
      );
    await limit(1);
    const refused = await workspaceCollaboration(
      identity,
      buyerOf(first),
      first,
      'invite',
      async (tx) => {
        const checked = checkWorkspaceSeatPreview(
          await tx.seatPreview(['a@example.test', 'b@example.test'], true),
        );
        return checked.ok ? ok('unexpected') : checked;
      },
    );
    assert.deepEqual(refused, {
      ok: false,
      error: { code: 'member_limit', fileIds: [], freePlaces: 1 },
    });
    const race = await Promise.all(
      [first, second].map((space, index) =>
        workspaceInvitationWrite(() =>
          invite(buyerOf(space), `seat-race-${index}@example.test`, space),
        ),
      ),
    );
    assert.equal(race.filter((entry) => entry.ok).length, 1);
    assert.deepEqual(
      race.find((entry) => !entry.ok),
      {
        ok: false,
        error: { code: 'member_limit', fileIds: [], freePlaces: 0 },
      },
    );
    assert.deepEqual((await seatPreview()).seats, {
      memberLimit: 1,
      membersUsed: 0,
      pendingInvites: 1,
      freePlaces: 0,
    });
    const createdSpace = race[0]?.ok ? first : second;
    const winner = race.find((entry) => entry.ok);
    assert.ok(winner?.ok && 'invitationId' in winner.value);
    const winningInvite = winner.value.invitationId;
    await identity.collaboration(buyerOf(createdSpace), createdSpace, (tx) =>
      tx.adminInvite(winningInvite, true),
    );
    const invitedFirst = await invite(
      buyerOf(first),
      'seat@example.test',
      first,
    );
    const invitedSecond = await invite(
      buyerOf(second),
      'seat@example.test',
      second,
    );
    assert.ok(
      'invitationId' in invitedFirst && 'invitationId' in invitedSecond,
    );
    const firstId = invitedFirst.invitationId;
    const secondId = invitedSecond.invitationId;
    assert.equal(
      (await seatPreview(['seat@example.test', 'seat@example.test']))
        .additionalPlaces,
      0,
    );
    assert.equal((await seatPreview()).seats?.pendingInvites, 1);
    const accept = (id: string) =>
      workspaceInvitationWrite(() =>
        identity.collaboration(testActor(member, []), null, (tx) =>
          tx.answerInvite(id, true),
        ),
      );
    await limit(0);
    assert.deepEqual(await accept(firstId), {
      ok: false,
      error: { code: 'member_limit', fileIds: [], freePlaces: 0 },
    });
    const pending = await identity.collaboration(
      testActor(member, []),
      null,
      (tx) => tx.invites(null),
    );
    assert.deepEqual(
      new Set(pending.map((entry) => entry.invitationId)),
      new Set([firstId, secondId]),
    );
    await limit(1);
    for (const id of [firstId, secondId]) {
      const joined = await accept(id);
      assert.ok(joined.ok && joined.value?.role === 'editor');
    }
    assert.deepEqual((await seatPreview()).seats, {
      memberLimit: 1,
      membersUsed: 1,
      pendingInvites: 0,
      freePlaces: 0,
    });
    assert.equal(
      await identity.collaboration(buyerOf(first), first, (tx) =>
        tx.changeMember(member, 'viewer', false),
      ),
      'ok',
    );
    assert.equal(
      await identity.collaboration(buyerOf(first), first, (tx) =>
        tx.changeMember(member, null, false),
      ),
      'ok',
    );
    assert.equal(
      await identity.collaboration(memberOf(second), second, (tx) =>
        tx.changeMember(member, null, true),
      ),
      'ok',
    );
    const again = await invite(buyerOf(first), 'seat@example.test', first);
    assert.ok('invitationId' in again);
    assert.ok((await accept(again.invitationId)).ok);
    assert.equal(await identity.operator((tx) => tx.remove(member)), 'removed');
    const feed = await identity.operator((tx) => tx.events(0, 500));
    assert.deepEqual(
      feed
        .filter((event) => event.memberAccountId === member)
        .map((event) => [
          event.kind,
          event.ownerAccountId,
          event.workspaceId,
          event.ownerWorkspaceMemberships,
        ]),
      [
        ['workspace_member_added', buyer, first, 1],
        ['workspace_member_added', buyer, second, 2],
        ['workspace_member_removed', buyer, first, 1],
        ['workspace_member_removed', buyer, second, 0],
        ['workspace_member_added', buyer, first, 1],
        ['workspace_member_removed', buyer, first, 0],
      ],
    );
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
