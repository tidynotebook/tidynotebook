/**
 * Rules of the installation matrix and of the administration use cases.
 *
 * The tests run against an in-memory store, so they check the rules and not
 * a database. `tests/integration/accounts.test.ts` checks that the database
 * refuses the same calls when the use cases are bypassed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyActor, type Actor } from './actor.ts';
import {
  createInvitation,
  dismissReport,
  listAccounts,
  listInvitations,
  listReports,
  readRegistrationPolicy,
  removeAccount,
  removeOwnAccount,
  revokeInvitation,
  setRegistrationPolicy,
  takeDownReportedLink,
  updateAccount,
} from './administration.ts';
import {
  leavesNoAdministrator,
  mayAdminister,
  type AccountStanding,
  type InstallationAction,
  type RegistrationPolicy,
} from './installation.ts';
import type {
  AccountRecord,
  InstallationStore,
  InstallationTransaction,
  InvitationRecord,
  LinkReportRecord,
} from './ports.ts';
import { maxAccountLimitBytes } from './registration.ts';
import {
  emptyInstallationSettings,
  readInstallationSettings,
  removeMailSettings,
  setLegalDocument,
  setMailSettings,
  type StoredInstallationSettings,
  type StoredLegalDocument,
} from './installation-settings.ts';

const ada = '11111111-1111-4111-8111-111111111111';
const bea = '22222222-2222-4222-8222-222222222222';
const cai = '33333333-3333-4333-8333-333333333333';
const digest = 'a'.repeat(64);
// No published origin: record 0191 opens an installation without one.
const ready = {
  mail: true,
  legalDocuments: true,
  mailUsable: () => true,
};

function actorFor(accountId: string): Actor {
  const created = verifyActor(accountId, []);
  if (!created.ok) throw new Error('the test actor was rejected');
  return created.value;
}

/** An in-memory installation that records what a use case changed. */
type FakeInstallation = InstallationStore & {
  readonly accounts: Map<string, AccountRecord>;
  readonly removed: string[];
  readonly invitations: Map<string, InvitationRecord>;
  readonly reports: Map<string, LinkReportRecord>;
  policy: RegistrationPolicy;
  settings: StoredInstallationSettings;
  transactions: number;
};

/**
 * The check of the account row: an administrator is active at every write,
 * so a write that shows a locked administrator throws, as the database does.
 */
function holdsAdministratorActive(record: AccountRecord): AccountRecord {
  if (record.role === 'administrator' && record.controls.standing === 'locked')
    throw new Error('accounts_administrator_active_check');
  return record;
}

function createStore(seed: readonly AccountStanding[]): FakeInstallation {
  const accounts = new Map<string, AccountRecord>(
    seed.map((standing) => [
      standing.accountId,
      {
        accountId: standing.accountId,
        email: `${standing.accountId.slice(0, 4)}@example.test`,
        name: null,
        role: standing.role,
        state: standing.state,
        createdAt: '2026-09-26T10:00:00.000Z',
        lastActiveAt: null,
        usedBytes: 0n,
        limitBytes: 100n,
        controls: {
          revision: 1,
          standing: 'active',
          removalAt: null,
          limitBytes: 100n,
          textLimitBytes: null,
          publishedTransferLimitBytes: null,
          downloadLimitBytes: null,
          features: { teams: true, collaboration: true },
        },
      },
    ]),
  );
  const invitations = new Map<string, InvitationRecord>();
  const reports = new Map<string, LinkReportRecord>();
  const store: FakeInstallation = {
    accounts,
    removed: [],
    invitations,
    reports,
    policy: 'invitation',
    settings: emptyInstallationSettings,
    transactions: 0,
    installation<T>(
      _actor: Actor,
      run: (tx: InstallationTransaction) => Promise<T>,
    ): Promise<T> {
      store.transactions += 1;
      return run({
        standing: (accountId) => {
          const found = accounts.get(accountId);
          return Promise.resolve(
            found === undefined
              ? null
              : { accountId, role: found.role, state: found.state },
          );
        },
        enabledAdministrators: () =>
          Promise.resolve(
            [...accounts.values()].filter(
              (record) =>
                record.role === 'administrator' && record.state === 'enabled',
            ).length,
          ),
        accounts: () => Promise.resolve([...accounts.values()]),
        setRole: (accountId, role) => {
          const found = accounts.get(accountId);
          if (found !== undefined)
            accounts.set(
              accountId,
              holdsAdministratorActive({
                ...found,
                role,
                // The database raises the revision with the role.
                controls: {
                  ...found.controls,
                  revision: found.controls.revision + 1,
                },
              }),
            );
          return Promise.resolve();
        },
        setState: (accountId, state) => {
          const found = accounts.get(accountId);
          if (found !== undefined) accounts.set(accountId, { ...found, state });
          return Promise.resolve();
        },
        setLimit: (accountId, limitBytes) => {
          const found = accounts.get(accountId);
          if (found !== undefined)
            accounts.set(accountId, {
              ...found,
              limitBytes,
              controls: {
                ...found.controls,
                limitBytes,
                revision: found.controls.revision + 1,
              },
            });
          return Promise.resolve();
        },
        setControls: (accountId, revision, controls) => {
          const found = accounts.get(accountId);
          if (found === undefined) return Promise.resolve('missing' as const);
          if (found.controls.revision !== revision)
            return Promise.resolve('changed' as const);
          accounts.set(
            accountId,
            holdsAdministratorActive({
              ...found,
              limitBytes: controls.limitBytes,
              controls: { ...controls, revision: revision + 1 },
            }),
          );
          return Promise.resolve('written' as const);
        },
        remove: (accountId) => {
          accounts.delete(accountId);
          store.removed.push(accountId);
          return Promise.resolve();
        },
        invitations: () => Promise.resolve([...invitations.values()]),
        invite: (invitation) => {
          if (
            [...accounts.values()].some(
              (record) => record.email === invitation.email,
            )
          )
            return Promise.resolve(null);
          const record: InvitationRecord = {
            invitationId: invitation.invitationId,
            email: invitation.email,
            createdAt: '2026-09-26T10:00:00.000Z',
            expiresAt: invitation.expiresAt,
            mailed: invitation.mailed,
          };
          invitations.set(invitation.invitationId, record);
          return Promise.resolve(record);
        },
        revokeInvitation: (invitationId) =>
          Promise.resolve(invitations.delete(invitationId)),
        reports: () => Promise.resolve([...reports.values()]),
        dismissReport: (reportId) => Promise.resolve(reports.delete(reportId)),
        takeDown: (reportId) => {
          const found = reports.get(reportId);
          if (found === undefined) return Promise.resolve(false);
          for (const [id, report] of reports)
            if (report.publicationId === found.publicationId)
              reports.delete(id);
          return Promise.resolve(true);
        },
        registrationPolicy: () => Promise.resolve(store.policy),
        setRegistrationPolicy: (policy) => {
          store.policy = policy;
          return Promise.resolve();
        },
        settings: () => Promise.resolve(store.settings),
        setMailSettings: (mail) => {
          store.settings = { ...store.settings, mail };
          return Promise.resolve();
        },
        setLegalDocument: (name, document) => {
          store.settings =
            name === 'terms'
              ? { ...store.settings, terms: document }
              : { ...store.settings, privacy: document };
          return Promise.resolve();
        },
      });
    },
  };
  return store;
}

const admin = (accountId: string): AccountStanding => ({
  accountId,
  role: 'administrator',
  state: 'enabled',
});
const member = (accountId: string): AccountStanding => ({
  accountId,
  role: 'member',
  state: 'enabled',
});

await test('an administrator takes every action and a member takes none', () => {
  const actions: readonly InstallationAction[] = [
    'list-accounts',
    'invite',
    'revoke-invitation',
    'change-state',
    'remove-account',
    'change-role',
    'change-limit',
    'change-controls',
    'change-policy',
    'change-settings',
    'list-reports',
    'close-report',
    'take-down',
  ];
  for (const action of actions) {
    assert.equal(mayAdminister(admin(ada), action), true, action);
    assert.equal(mayAdminister(member(ada), action), false, action);
    assert.equal(
      mayAdminister({ ...admin(ada), state: 'disabled' }, action),
      false,
      action,
    );
    assert.equal(mayAdminister(null, action), false, action);
  }
});

await test('only the last enabled administrator is protected', () => {
  assert.equal(leavesNoAdministrator(admin(ada), member(ada), 1), true);
  assert.equal(leavesNoAdministrator(admin(ada), null, 1), true);
  assert.equal(
    leavesNoAdministrator(admin(ada), { ...admin(ada), state: 'disabled' }, 1),
    true,
  );
  assert.equal(leavesNoAdministrator(admin(ada), member(ada), 2), false);
  assert.equal(leavesNoAdministrator(admin(ada), admin(ada), 1), false);
  assert.equal(leavesNoAdministrator(member(ada), null, 0), false);
});

await test('an administrator lists the accounts and a member is refused', async () => {
  const store = createStore([admin(ada), member(bea)]);
  const listed = await listAccounts(store, actorFor(ada));
  assert.ok(listed.ok);
  assert.deepEqual(
    listed.value.map((record) => record.accountId),
    [ada, bea],
  );
  const refused = await listAccounts(store, actorFor(bea));
  assert.deepEqual(refused, {
    ok: false,
    error: { code: 'forbidden', fileIds: [] },
  });
});

await test('an administrator promotes, disables and limits another account', async () => {
  const store = createStore([admin(ada), member(bea)]);
  const changed = await updateAccount(store, actorFor(ada), bea, {
    role: 'administrator',
    state: 'disabled',
    limitBytes: 42n,
  });
  assert.ok(changed.ok);
  assert.equal(changed.value.role, 'administrator');
  assert.equal(changed.value.state, 'disabled');
  assert.equal(changed.value.limitBytes, 42n);
});

await test('an administrator locks a member with the revision that it read', async () => {
  const store = createStore([admin(ada), member(bea)]);
  const locked = await updateAccount(store, actorFor(ada), bea, {
    controls: {
      revision: 1,
      standing: 'locked',
      removalAt: '2030-01-01T00:00:00Z',
      textLimitBytes: 50n,
    },
  });
  assert.ok(locked.ok);
  assert.equal(locked.value.controls.standing, 'locked');
  assert.equal(locked.value.controls.textLimitBytes, 50n);
  assert.equal(locked.value.controls.revision, 2);
  // A second write that read the first revision changes nothing.
  assert.deepEqual(
    await updateAccount(store, actorFor(ada), bea, {
      controls: { revision: 1, standing: 'active' },
    }),
    { ok: false, error: { code: 'controls_changed', fileIds: [] } },
  );
  assert.equal(store.accounts.get(bea)?.controls.standing, 'locked');
  // A locked member becomes an administrator only once it is active.
  assert.deepEqual(
    await updateAccount(store, actorFor(ada), bea, { role: 'administrator' }),
    { ok: false, error: { code: 'forbidden', fileIds: [] } },
  );
  const unlocked = await updateAccount(store, actorFor(ada), bea, {
    controls: { revision: 2, standing: 'active' },
  });
  assert.ok(unlocked.ok);
  assert.equal(unlocked.value.controls.removalAt, null);
});

await test('one change demotes and locks, or unlocks and promotes, in an order the database takes', async () => {
  const store = createStore([admin(ada), admin(bea)]);
  // A demotion writes the role first, so no write shows a locked
  // administrator.
  const demoted = await updateAccount(store, actorFor(ada), bea, {
    role: 'member',
    controls: { revision: 1, standing: 'locked' },
  });
  assert.ok(demoted.ok);
  assert.equal(demoted.value.role, 'member');
  assert.equal(demoted.value.controls.standing, 'locked');
  // A promotion activates the account first.
  const promoted = await updateAccount(store, actorFor(ada), bea, {
    role: 'administrator',
    controls: { revision: demoted.value.controls.revision, standing: 'active' },
  });
  assert.ok(promoted.ok);
  assert.equal(promoted.value.role, 'administrator');
  assert.equal(promoted.value.controls.standing, 'active');
});

await test('an administrator is never locked, and one change names the limit once', async () => {
  const store = createStore([admin(ada), admin(bea)]);
  assert.deepEqual(
    await updateAccount(store, actorFor(ada), bea, {
      controls: { revision: 1, standing: 'locked' },
    }),
    { ok: false, error: { code: 'forbidden', fileIds: [] } },
  );
  assert.deepEqual(
    await updateAccount(store, actorFor(ada), bea, {
      limitBytes: 10n,
      controls: { revision: 1, limitBytes: 20n },
    }),
    { ok: false, error: { code: 'forbidden', fileIds: [] } },
  );
  assert.equal(store.accounts.get(bea)?.controls.revision, 1);
});

await test('a change of an account is refused whole when one part is not allowed', async () => {
  const store = createStore([admin(ada), member(bea)]);
  // Each change below pairs a valid disable with one part that is refused,
  // so the account stays enabled only when nothing of the change landed.
  for (const change of [
    { role: 'owner', state: 'disabled' },
    { state: 'paused' },
    { limitBytes: 0n, state: 'disabled' },
    { limitBytes: maxAccountLimitBytes + 1n, state: 'disabled' },
    {},
  ]) {
    const refused = await updateAccount(store, actorFor(ada), bea, change);
    assert.equal(refused.ok, false, Object.keys(change).join(' '));
  }
  assert.equal(store.accounts.get(bea)?.state, 'enabled');
  const byMember = await updateAccount(store, actorFor(bea), ada, {
    state: 'disabled',
  });
  assert.deepEqual(byMember, {
    ok: false,
    error: { code: 'forbidden', fileIds: [] },
  });
  const unknown = await updateAccount(store, actorFor(ada), cai, {
    state: 'disabled',
  });
  assert.deepEqual(unknown, {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
});

await test('the last enabled administrator cannot be demoted, disabled or removed', async () => {
  const store = createStore([admin(ada), member(bea)]);
  const last = {
    ok: false,
    error: { code: 'last_administrator', fileIds: [] },
  };
  assert.deepEqual(
    await updateAccount(store, actorFor(ada), ada, { role: 'member' }),
    last,
  );
  assert.deepEqual(
    await updateAccount(store, actorFor(ada), ada, { state: 'disabled' }),
    last,
  );
  assert.deepEqual(await removeOwnAccount(store, actorFor(ada)), last);
  assert.equal(store.accounts.get(ada)?.role, 'administrator');
  // With a second administrator the same changes are allowed.
  await updateAccount(store, actorFor(ada), bea, { role: 'administrator' });
  const demoted = await updateAccount(store, actorFor(ada), ada, {
    role: 'member',
  });
  assert.ok(demoted.ok);
});

await test('an administrator removes another account but not their own here', async () => {
  const store = createStore([admin(ada), member(bea)]);
  assert.deepEqual(await removeAccount(store, actorFor(ada), ada), {
    ok: false,
    error: { code: 'forbidden', fileIds: [] },
  });
  assert.deepEqual(await removeAccount(store, actorFor(bea), ada), {
    ok: false,
    error: { code: 'forbidden', fileIds: [] },
  });
  assert.deepEqual(await removeAccount(store, actorFor(ada), cai), {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
  assert.deepEqual(await removeAccount(store, actorFor(ada), bea), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(store.removed, [bea]);
});

await test('a member removes their own account and a disabled one cannot', async () => {
  const store = createStore([
    admin(ada),
    member(bea),
    { accountId: cai, role: 'member', state: 'disabled' },
  ]);
  assert.deepEqual(await removeOwnAccount(store, actorFor(bea)), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await removeOwnAccount(store, actorFor(cai)), {
    ok: false,
    error: { code: 'forbidden', fileIds: [] },
  });
  assert.deepEqual(store.removed, [bea]);
});

await test('an invitation binds one written address and refuses an existing one', async () => {
  const store = createStore([admin(ada), member(bea)]);
  const invitation = {
    invitationId: '44444444-4444-4444-8444-444444444444',
    tokenDigest: digest,
    email: '  New.Person@Example.TEST ',
    expiresAt: '2026-10-03T10:00:00.000Z',
    mailed: false,
  };
  const made = await createInvitation(store, actorFor(ada), invitation);
  assert.ok(made.ok);
  assert.equal(made.value.email, 'new.person@example.test');
  const existing = await createInvitation(store, actorFor(ada), {
    ...invitation,
    email: `${bea.slice(0, 4)}@example.test`,
  });
  assert.deepEqual(existing, {
    ok: false,
    error: { code: 'account_exists', fileIds: [] },
  });
  for (const bad of [
    { ...invitation, email: 'no-at-sign' },
    { ...invitation, tokenDigest: 'short' },
  ])
    assert.equal((await createInvitation(store, actorFor(ada), bad)).ok, false);
  assert.equal(
    (await createInvitation(store, actorFor(bea), invitation)).ok,
    false,
  );
  const listed = await listInvitations(
    store,
    actorFor(ada),
    new Date('2026-10-04T10:00:00.000Z'),
  );
  assert.ok(listed.ok);
  assert.deepEqual(
    listed.value.map((entry) => entry.state),
    ['expired'],
  );
  assert.deepEqual(
    await revokeInvitation(store, actorFor(ada), invitation.invitationId),
    { ok: true, value: undefined },
  );
  assert.deepEqual(
    await revokeInvitation(store, actorFor(ada), invitation.invitationId),
    { ok: false, error: { code: 'not_found', fileIds: [] } },
  );
});

await test('the open policy needs every part and a member changes nothing', async () => {
  const store = createStore([admin(ada), member(bea)]);
  for (const readiness of [
    { ...ready, mail: false },
    { ...ready, legalDocuments: false },
  ])
    assert.deepEqual(
      await setRegistrationPolicy(store, actorFor(ada), 'open', readiness),
      {
        ok: false,
        error: { code: 'open_registration_unavailable', fileIds: [] },
      },
    );
  assert.equal(store.policy, 'invitation');
  assert.deepEqual(
    await setRegistrationPolicy(store, actorFor(bea), 'open', ready),
    { ok: false, error: { code: 'forbidden', fileIds: [] } },
  );
  assert.deepEqual(
    await setRegistrationPolicy(store, actorFor(ada), 'approval', ready),
    { ok: false, error: { code: 'forbidden', fileIds: [] } },
  );
  assert.deepEqual(
    await setRegistrationPolicy(store, actorFor(ada), 'open', ready),
    { ok: true, value: 'open' },
  );
  assert.deepEqual(await readRegistrationPolicy(store, actorFor(ada)), {
    ok: true,
    value: 'open',
  });
  assert.equal((await readRegistrationPolicy(store, actorFor(bea))).ok, false);
});

const none = {
  mail: false,
  legalDocuments: false,
  mailUsable: () => true,
};
const sealed = { kind: 'set' as const, sealed: 'sealed' };
const noPassword = { kind: 'set' as const, sealed: null };
const keep = { kind: 'keep' as const };
const mailOf = {
  host: 'smtp.example.test',
  port: 587,
  security: 'starttls' as const,
  username: 'notes',
  sender: 'Notes <no-reply@example.test>',
};
const terms: StoredLegalDocument = {
  kind: 'text',
  text: '# Terms',
  version: '1',
};
const privacy: StoredLegalDocument = {
  kind: 'address',
  url: 'https://example.test/privacy',
  version: '1',
};

await test('the open policy reads the parts that the administrator set', async () => {
  const store = createStore([admin(ada)]);
  assert.equal(
    (await setRegistrationPolicy(store, actorFor(ada), 'open', none)).ok,
    false,
  );
  assert.equal(
    (await setMailSettings(store, actorFor(ada), mailOf, sealed, none)).ok,
    true,
  );
  await setLegalDocument(store, actorFor(ada), 'terms', terms, none);
  // One document is not enough: the documents apply when both exist.
  assert.deepEqual(
    await setRegistrationPolicy(store, actorFor(ada), 'open', none),
    {
      ok: false,
      error: { code: 'open_registration_unavailable', fileIds: [] },
    },
  );
  await setLegalDocument(store, actorFor(ada), 'privacy', privacy, none);
  assert.deepEqual(
    await setRegistrationPolicy(store, actorFor(ada), 'open', none),
    { ok: true, value: 'open' },
  );
});

await test('a stored transport that the server cannot open is no mail', async () => {
  // The server secret changed, so the sealed password opens no more.
  const lost = { ...none, mailUsable: () => false };
  const store = createStore([admin(ada)]);
  await setMailSettings(store, actorFor(ada), mailOf, sealed, lost);
  await setLegalDocument(store, actorFor(ada), 'terms', terms, lost);
  await setLegalDocument(store, actorFor(ada), 'privacy', privacy, lost);
  assert.deepEqual(
    await setRegistrationPolicy(store, actorFor(ada), 'open', lost),
    {
      ok: false,
      error: { code: 'open_registration_unavailable', fileIds: [] },
    },
  );
  assert.equal(store.policy, 'invitation');
});

await test('a removal that open registration needs is refused', async () => {
  const store = createStore([admin(ada)]);
  await setMailSettings(store, actorFor(ada), mailOf, sealed, none);
  await setLegalDocument(store, actorFor(ada), 'terms', terms, none);
  await setLegalDocument(store, actorFor(ada), 'privacy', privacy, none);
  await setRegistrationPolicy(store, actorFor(ada), 'open', none);
  const required = {
    ok: false,
    error: { code: 'setting_required', fileIds: [] },
  };
  assert.deepEqual(
    await removeMailSettings(store, actorFor(ada), none),
    required,
  );
  assert.deepEqual(
    await setLegalDocument(store, actorFor(ada), 'privacy', null, none),
    required,
  );
  assert.notEqual(store.settings.mail, null);
  assert.notEqual(store.settings.privacy, null);
  await setRegistrationPolicy(store, actorFor(ada), 'invitation', none);
  assert.equal((await removeMailSettings(store, actorFor(ada), none)).ok, true);
  assert.equal(store.settings.mail, null);
});

await test('a group that the environment sets is locked', async () => {
  const store = createStore([admin(ada)]);
  const locked = { ok: false, error: { code: 'setting_locked', fileIds: [] } };
  const environment = { ...ready };
  assert.deepEqual(
    await setMailSettings(
      store,
      actorFor(ada),
      mailOf,
      noPassword,
      environment,
    ),
    locked,
  );
  assert.deepEqual(
    await removeMailSettings(store, actorFor(ada), environment),
    locked,
  );
  assert.deepEqual(
    await setLegalDocument(store, actorFor(ada), 'terms', terms, environment),
    locked,
  );
  assert.deepEqual(store.settings, emptyInstallationSettings);
});

await test('a kept password stays only with its user name', async () => {
  const store = createStore([admin(ada)]);
  await setMailSettings(store, actorFor(ada), mailOf, sealed, none);
  await setMailSettings(store, actorFor(ada), mailOf, keep, none);
  assert.equal(store.settings.mail?.passwordSealed, 'sealed');
  // A new user name does not take the password of the old one.
  assert.deepEqual(
    await setMailSettings(
      store,
      actorFor(ada),
      { ...mailOf, username: 'someone-else' },
      keep,
      none,
    ),
    { ok: false, error: { code: 'mail_password_required', fileIds: [] } },
  );
  assert.equal(store.settings.mail?.username, 'notes');
  await setMailSettings(
    store,
    actorFor(ada),
    { ...mailOf, username: null },
    keep,
    none,
  );
  assert.equal(store.settings.mail?.passwordSealed, null);
});

await test('a user name with no password, new or kept, is refused', async () => {
  const store = createStore([admin(ada)]);
  assert.deepEqual(
    await setMailSettings(store, actorFor(ada), mailOf, keep, none),
    { ok: false, error: { code: 'mail_password_required', fileIds: [] } },
  );
  assert.deepEqual(
    await setMailSettings(store, actorFor(ada), mailOf, noPassword, none),
    { ok: false, error: { code: 'mail_password_required', fileIds: [] } },
  );
  assert.equal(store.settings.mail, null);
  // A server with no sign-in needs none.
  assert.equal(
    (
      await setMailSettings(
        store,
        actorFor(ada),
        { ...mailOf, username: null },
        noPassword,
        none,
      )
    ).ok,
    true,
  );
});

await test('a member reads and changes no setting', async () => {
  const store = createStore([admin(ada), member(bea)]);
  const forbidden = { ok: false, error: { code: 'forbidden', fileIds: [] } };
  assert.deepEqual(
    await readInstallationSettings(store, actorFor(bea)),
    forbidden,
  );
  assert.deepEqual(
    await setMailSettings(store, actorFor(bea), mailOf, noPassword, none),
    forbidden,
  );
  assert.deepEqual(
    await setLegalDocument(store, actorFor(bea), 'terms', terms, none),
    forbidden,
  );
});

await test('an administrator reads, closes and acts on a report and a member cannot', async () => {
  const store = createStore([admin(ada), member(bea)]);
  const report = (
    reportId: string,
    publicationId: string,
  ): LinkReportRecord => ({
    reportId,
    publicationId,
    reason: 'phishing',
    note: null,
    sealedAddress: null,
    linkState: 'live',
    createdAt: '2026-09-27T10:00:00.000Z',
  });
  const link = '33333333-3333-4333-8333-333333333333';
  const other = '44444444-4444-4444-8444-444444444444';
  store.reports.set('r1', report('r1', link));
  store.reports.set('r2', report('r2', link));
  store.reports.set('r3', report('r3', other));
  for (const refused of [
    await listReports(store, actorFor(bea)),
    await dismissReport(store, actorFor(bea), 'r3'),
    await takeDownReportedLink(store, actorFor(bea), 'r1'),
  ])
    assert.deepEqual(refused, {
      ok: false,
      error: { code: 'forbidden', fileIds: [] },
    });
  assert.equal(store.reports.size, 3);
  const listed = await listReports(store, actorFor(ada));
  assert.equal(listed.ok && listed.value.length, 3);
  assert.deepEqual(await takeDownReportedLink(store, actorFor(ada), 'r1'), {
    ok: true,
    value: undefined,
  });
  // Every open report of the taken down link closes, and the other stays.
  assert.deepEqual([...store.reports.keys()], ['r3']);
  assert.deepEqual(await dismissReport(store, actorFor(ada), 'r3'), {
    ok: true,
    value: undefined,
  });
  assert.deepEqual(await takeDownReportedLink(store, actorFor(ada), 'r3'), {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
  assert.deepEqual(await dismissReport(store, actorFor(ada), 'r3'), {
    ok: false,
    error: { code: 'not_found', fileIds: [] },
  });
});
