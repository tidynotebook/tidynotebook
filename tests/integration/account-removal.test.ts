/**
 * The removal run of locked accounts against the database (record 0201).
 *
 * The run removes a locked account whose removal time has passed, mails the
 * account 30 days and 7 days before, and never removes an active account.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createAccountRemoval,
  noMailer,
  type Mailer,
  type MailMessage,
} from '@notesapp/server';
import { defaultAccountLimitBytes, registerAccount } from '@notesapp/core';
import {
  openCoordination,
  openIdentityStore,
  type IdentityStoreHandle,
} from '@notesapp/storage-server';
import {
  createDisposableDatabase,
  openSession,
  seedWorkspace,
  type TestDatabase,
} from './support/database.ts';

const database: TestDatabase = await createDisposableDatabase();
const identity: IdentityStoreHandle = openIdentityStore(database.runtimeUrl, {
  poolSize: 2,
});
const origin = 'https://notes.example.com';

/** A gate that lets every call run, for a check of one step of the run. */
const everyDay = (): Promise<boolean> => Promise.resolve(true);
const day = 24 * 60 * 60 * 1000;

/** A mailer that keeps each message. */
function capture(): Mailer & { readonly sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  const transport = {
    send: (message: MailMessage): Promise<void> => {
      sent.push(message);
      return Promise.resolve();
    },
  };
  return {
    sent,
    available: () => Promise.resolve(true),
    current: () => Promise.resolve(transport),
    send: transport.send,
  };
}

/** One account with an address and a workspace. */
async function account(): Promise<{ accountId: string; email: string }> {
  const accountId = randomUUID();
  const email = `person-${randomUUID()}@notes.invalid`;
  await seedWorkspace(database, randomUUID(), [{ accountId, role: 'owner' }]);
  const setup = await openSession(database.migrationUrl);
  try {
    const authUserId = `auth-${randomUUID()}`;
    await setup.query(
      `insert into auth_user (id, name, email, email_verified)
       values ($1, 'Person', $2, true)`,
      [authUserId, email],
    );
    await setup.query(
      'insert into account_identities (auth_user_id, account_id) values ($1, $2)',
      [authUserId, accountId],
    );
  } finally {
    await setup.close();
  }
  return { accountId, email };
}

/** Writes the standing and the removal time of one account as the operator. */
async function control(
  accountId: string,
  standing: 'active' | 'locked',
  removalAt: Date | null,
): Promise<void> {
  const written = await identity.operator(async (tx) => {
    const found = await tx.account(accountId, '2026-10');
    assert.ok(found !== null);
    return tx.setControls(accountId, found.controls.revision, {
      ...found.controls,
      standing,
      removalAt: removalAt === null ? null : removalAt.toISOString(),
    });
  });
  assert.equal(written, 'written');
}

/** Whether an account is a tombstone now. */
async function removed(accountId: string): Promise<boolean> {
  const setup = await openSession(database.migrationUrl);
  try {
    const rows = await setup.query<{ gone: boolean }>(
      'select removed_at is not null as gone from accounts where id = $1',
      [accountId],
    );
    return rows[0]?.gone ?? false;
  } finally {
    await setup.close();
  }
}

await test('the run removes a locked account past its time and never an active one', async () => {
  const due = await account();
  const unlocked = await account();
  const later = await account();
  const past = new Date(Date.now() - day);
  await control(due.accountId, 'locked', past);
  await control(unlocked.accountId, 'locked', past);
  // Active again: the removal time is gone with the lock (record 0201).
  await control(unlocked.accountId, 'active', null);
  await control(later.accountId, 'locked', new Date(Date.now() + 60 * day));
  const mailer = capture();
  const run = createAccountRemoval({
    store: identity,
    mailer,
    origin,
    portal: true,
    claimDay: everyDay,
  });
  const result = await run();
  assert.ok(!('skipped' in result));
  assert.equal(result.removed, 1);
  assert.equal(await removed(due.accountId), true);
  assert.equal(await removed(unlocked.accountId), false);
  assert.equal(await removed(later.accountId), false);
  // The database reads the standing again, so an account that is active
  // when the run reaches it stays, whatever the run read before.
  assert.equal(await identity.removeDueAccount(unlocked.accountId), false);
  // The removal is an event of the operator API (record 0190).
  const events = await identity.operator((tx) => tx.events(0, 500));
  assert.ok(
    events.some(
      (event) => event.accountId === due.accountId && event.kind === 'removed',
    ),
  );
});

await test('a mail goes 30 days and 7 days before the removal, and never twice', async () => {
  const person = await account();
  await control(person.accountId, 'locked', new Date(Date.now() + 20 * day));
  const mailer = capture();
  const run = createAccountRemoval({
    store: identity,
    mailer,
    origin,
    portal: false,
    claimDay: everyDay,
  });
  await run();
  const first = mailer.sent.filter((message) => message.to === person.email);
  assert.equal(first.length, 1);
  assert.match(first[0]?.subject ?? '', /is deleted in 20 days$/);
  assert.match(first[0]?.text ?? '', /ask the administrator/);
  await run();
  assert.equal(
    mailer.sent.filter((message) => message.to === person.email).length,
    1,
  );
  // The run comes again 14 days later, a week before the removal.
  await run(new Date(Date.now() + 14 * day));
  const second = mailer.sent.filter((message) => message.to === person.email);
  assert.equal(second.length, 2);
  assert.match(second[1]?.subject ?? '', /is deleted in 6 days$/);
  await run(new Date(Date.now() + 15 * day));
  assert.equal(
    mailer.sent.filter((message) => message.to === person.email).length,
    2,
  );
});

await test('with no mail transport the account is still removed at its time', async () => {
  const person = await account();
  await control(person.accountId, 'locked', new Date(Date.now() - 1000));
  const result = await createAccountRemoval({
    store: identity,
    mailer: noMailer,
    origin,
    portal: true,
    claimDay: everyDay,
  })();
  assert.ok(!('skipped' in result));
  assert.equal(result.removed, 1);
  assert.equal(await removed(person.accountId), true);
});

await test('the run is daily: one claim for each day in UTC', async () => {
  const coordination = openCoordination(database.runtimeUrl);
  try {
    const person = await account();
    await control(person.accountId, 'locked', new Date(Date.now() - 1000));
    const run = createAccountRemoval({
      store: identity,
      mailer: noMailer,
      origin,
      portal: true,
      claimDay: (day) => coordination.claimDailyRun('removals', day),
    });
    const today = new Date();
    assert.deepEqual(Object.keys(await run(today)).sort(), [
      'failed',
      'noticed',
      'removed',
    ]);
    assert.equal(await removed(person.accountId), true);
    // A second call on the same day, from this process or another, runs
    // nothing.
    assert.deepEqual(await run(today), { skipped: 'day' });
    assert.deepEqual(await run(new Date(today.getTime() + 60_000)), {
      skipped: 'day',
    });
    // The next day runs again, and a day before the last claimed one never.
    const tomorrow = new Date(today.getTime() + day);
    assert.ok(!('skipped' in (await run(tomorrow))));
    assert.deepEqual(await run(today), { skipped: 'day' });
  } finally {
    await coordination.close();
  }
});

await test('a removal time that the database gave sends each mail once', async () => {
  // The configuration gives the time of a new locked account, so the
  // database computes it, and the run gives the same time back to record a
  // mail. A time kept finer than a JavaScript date would never match, and
  // the mail would go on every run.
  const email = `new-${randomUUID()}@notes.invalid`;
  const token = randomUUID();
  const digest = createHash('sha256').update(token).digest('hex');
  await identity.operatorInvite({
    invitationId: randomUUID(),
    tokenDigest: digest,
    email,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    mailed: false,
  });
  const authUserId = `auth-${randomUUID()}`;
  const setup = await openSession(database.migrationUrl);
  try {
    await setup.query(
      `insert into auth_user (id, name, email, email_verified)
       values ($1, 'Person', $2, true)`,
      [authUserId, email],
    );
  } finally {
    await setup.close();
  }
  const made = await registerAccount(identity, {
    authUserId,
    ground: { kind: 'invitation', tokenDigest: digest },
    accountId: randomUUID(),
    workspaceId: randomUUID(),
    workspaceName: 'Personal',
    newAccount: {
      limitBytes: defaultAccountLimitBytes,
      standing: 'locked',
      removeAfterSeconds: 20 * 24 * 60 * 60,
    },
  });
  assert.ok(made.ok);
  const mailer = capture();
  const run = createAccountRemoval({
    store: identity,
    mailer,
    origin,
    portal: true,
    claimDay: everyDay,
  });
  await run();
  await run();
  await run();
  assert.equal(mailer.sent.filter((message) => message.to === email).length, 1);
  // A control write that gives the same time back keeps the count of mails.
  const read = await identity.operator((tx) =>
    tx.account(made.value, '2026-10'),
  );
  assert.ok(read !== null);
  const written = await identity.operator((tx) =>
    tx.setControls(made.value, read.controls.revision, read.controls),
  );
  assert.equal(written, 'written');
  await run();
  assert.equal(mailer.sent.filter((message) => message.to === email).length, 1);
});

await identity.close();
await database.destroy();
