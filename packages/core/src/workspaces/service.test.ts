/**
 * Rules of the account and workspace use cases.
 *
 * The tests run against an in-memory store, so they check the rules and not a
 * database. The storage integration tests check the same rules again under the
 * runtime database role.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyActor, type Actor, type Role } from '../identity/actor.ts';
import {
  acceptLegalDocuments,
  readConsent,
  type ConsentRecord,
  type LegalDocuments,
} from '../identity/legal.ts';
import type {
  AccountTransaction,
  Preferences,
  WorkspaceAdminStore,
  WorkspaceAdminTransaction,
  WorkspaceSummary,
} from './ports.ts';
import {
  defaultSpellCheck,
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  sessionGrants,
  isThemeFamilyId,
  updatePreferences,
  updateWorkspace,
} from './service.ts';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const space = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Builds a verified actor with every action of the owner in a workspace. */
function actorFor(accountId: string, ...workspaceIds: string[]): Actor {
  const granted = workspaceIds.length === 0 ? [space] : workspaceIds;
  const created = verifyActor(
    accountId,
    granted.map((workspaceId) => ({
      workspaceId,
      actions: ['read', 'history', 'write', 'purge'],
    })),
  );
  if (!created.ok) throw new Error('the test actor was rejected');
  return created.value;
}

/** One workspace of the in-memory store. */
type Space = {
  name: string;
  personal: boolean;
  members: Map<string, Role>;
  changes: { accountId: string; removed: boolean }[];
  destroyed: boolean;
  locked: boolean;
};

/** An in-memory store that records what a use case asked it to do. */
type FakeStore = WorkspaceAdminStore & {
  readonly spaces: Map<string, Space>;
  readonly accountAudit: Map<string, string[]>;
  readonly preferences: Map<string, Preferences>;
  readonly consents: Map<string, ConsentRecord>;
  space(id: string): Space;
  seed(id: string, members: readonly (readonly [string, Role])[]): void;
  memberships(accountId: string): { workspaceId: string; role: Role }[];
};

/** Builds one in-memory store. */
function createFakeStore(): FakeStore {
  const spaces = new Map<string, Space>();
  const accountAudit = new Map<string, string[]>();
  const preferences = new Map<string, Preferences>();
  const consents = new Map<string, ConsentRecord>();

  const space = (id: string): Space => {
    const found = spaces.get(id);
    if (found === undefined) throw new Error(`no workspace ${id}`);
    return found;
  };

  const seed = (
    id: string,
    members: readonly (readonly [string, Role])[],
  ): void => {
    spaces.set(id, {
      name: `workspace ${id.slice(0, 4)}`,
      personal: false,
      members: new Map(members.map(([account, role]) => [account, role])),
      changes: [],
      destroyed: false,
      locked: false,
    });
  };

  const memberships = (
    accountId: string,
  ): { workspaceId: string; role: Role }[] =>
    [...spaces.entries()].flatMap(([workspaceId, value]) => {
      const role = value.members.get(accountId);
      return role === undefined ? [] : [{ workspaceId, role }];
    });

  const account = <T>(
    actor: Actor,
    run: (tx: AccountTransaction) => Promise<T>,
  ): Promise<T> => {
    const tx: AccountTransaction = {
      workspaces: (): Promise<readonly WorkspaceSummary[]> =>
        Promise.resolve(
          memberships(actor.accountId).map((entry) => ({
            workspaceId: entry.workspaceId,
            name: space(entry.workspaceId).name,
            role: entry.role,
            personal: space(entry.workspaceId).personal,
          })),
        ),
      memberships: () => Promise.resolve(memberships(actor.accountId)),
      standing: () =>
        Promise.resolve({ role: 'member', usedBytes: 0n, limitBytes: 1n }),
      sessions: () => Promise.resolve([]),
      revokeSession: () => Promise.resolve(false),
      revokeOtherSessions: () => Promise.resolve(0),
      preferences: () =>
        Promise.resolve(
          preferences.get(actor.accountId) ?? {
            appearance: 'system',
            themeFamily: 'tokyo-night',
            spellCheck: defaultSpellCheck,
          },
        ),
      savePreferences: (value: Preferences) => {
        preferences.set(actor.accountId, value);
        return Promise.resolve();
      },
      consent: () => Promise.resolve(consents.get(actor.accountId) ?? null),
      recordConsent: (versions) => {
        consents.set(actor.accountId, {
          ...versions,
          acceptedAt: '2026-09-27T12:00:00.000Z',
        });
        return Promise.resolve();
      },
      createWorkspace: (input) => {
        seed(input.workspaceId, [[actor.accountId, 'owner']]);
        space(input.workspaceId).name = input.name;
        space(input.workspaceId).locked = true;
        return Promise.resolve();
      },
      lockWorkspace: (workspaceId: string) => {
        space(workspaceId).locked = true;
        return Promise.resolve();
      },
      recordMembershipChange: (workspaceId: string, input) => {
        space(workspaceId).changes.push(input);
        return Promise.resolve();
      },
    };
    return run(tx);
  };

  const workspace = <T>(
    actor: Actor,
    workspaceId: string,
    run: (tx: WorkspaceAdminTransaction) => Promise<T>,
  ): Promise<T> => {
    const value = space(workspaceId);
    const tx: WorkspaceAdminTransaction = {
      describe: () =>
        Promise.resolve({ name: value.name, personal: value.personal }),
      role: (accountId: string) =>
        Promise.resolve(value.members.get(accountId) ?? null),
      accountWorkspaceCount: () =>
        Promise.resolve(memberships(actor.accountId).length),
      rename: (name: string) => {
        value.name = name;
        return Promise.resolve();
      },
      destroy: () => {
        value.destroyed = true;
        spaces.delete(workspaceId);
        return Promise.resolve();
      },
      auditAccount: (input) => {
        const trail = accountAudit.get(actor.accountId) ?? [];
        trail.push(input.action);
        accountAudit.set(actor.accountId, trail);
        return Promise.resolve();
      },
      recordMembershipChange: (input) => {
        value.changes.push(input);
        return Promise.resolve();
      },
    };
    return run(tx);
  };

  return {
    spaces,
    accountAudit,
    preferences,
    consents,
    space,
    seed,
    memberships,
    account,
    workspace,
  };
}

await test('an account that is not a member cannot rename a workspace', async () => {
  const store = createFakeStore();
  store.seed(space, [[alice, 'owner']]);
  const result = await updateWorkspace(store, actorFor(bob), space, 'renamed');
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error.code, 'forbidden');
  assert.equal(store.space(space).name.startsWith('workspace'), true);
});

await test('the owner renames a workspace', async () => {
  const store = createFakeStore();
  store.seed(space, [[alice, 'owner']]);
  const result = await updateWorkspace(
    store,
    actorFor(alice),
    space,
    'renamed',
  );
  assert.equal(result.ok, true);
  assert.equal(store.space(space).name, 'renamed');
});

await test('only the owner deletes a workspace', async () => {
  const store = createFakeStore();
  store.seed(space, [[alice, 'owner']]);
  store.seed(other, [[alice, 'owner']]);
  const denied = await deleteWorkspace(store, actorFor(bob), space);
  assert.equal(denied.ok, false);
  const allowed = await deleteWorkspace(store, actorFor(alice), space);
  assert.equal(allowed.ok, true);
  assert.equal(store.spaces.has(space), false);
  // The record of the deletion survives in the account trail, which is not
  // scoped by a workspace, so it is there even when the deleted workspace was
  // the only place the record could have gone.
  assert.deepEqual(store.accountAudit.get(alice), ['workspace.delete']);
});

await test('an account does not delete its last workspace', async () => {
  const store = createFakeStore();
  store.seed(space, [[alice, 'owner']]);
  const refused = await deleteWorkspace(store, actorFor(alice), space);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok ? '' : refused.error.code, 'forbidden');
  assert.equal(store.spaces.has(space), true);
  assert.equal(store.space(space).destroyed, false);
  // The refusal leaves no trail either, because nothing happened.
  assert.equal(store.accountAudit.get(alice), undefined);
});

await test('the last workspace rule counts this account only', async () => {
  const store = createFakeStore();
  store.seed(space, [[alice, 'owner']]);
  store.seed(other, [[bob, 'owner']]);
  // Bob holds a second workspace, so two workspaces exist. Alice still holds
  // one, and the rule reads her memberships and not the workspace table.
  const refused = await deleteWorkspace(store, actorFor(alice), space);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok ? '' : refused.error.code, 'forbidden');
  assert.equal(store.spaces.has(space), true);
});

await test('the personal workspace is not protected while another exists', async () => {
  const store = createFakeStore();
  store.seed(space, [[alice, 'owner']]);
  store.seed(other, [[alice, 'owner']]);
  store.space(space).personal = true;
  const alsoOther = actorFor(alice, space, other);
  const removed = await deleteWorkspace(store, alsoOther, space);
  assert.equal(removed.ok, true);
  assert.equal(store.spaces.has(space), false);
  const renamed = await updateWorkspace(store, alsoOther, other, 'work');
  assert.equal(renamed.ok, true);
});

await test('an account sees only its own workspaces', async () => {
  const store = createFakeStore();
  store.seed(space, [[alice, 'owner']]);
  store.seed(other, [[bob, 'owner']]);
  const result = await listWorkspaces(store, actorFor(alice));
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok ? result.value.map((entry) => entry.workspaceId) : [],
    [space],
  );
});

await test('a created workspace has its creator as owner', async () => {
  const store = createFakeStore();
  const created = await createWorkspace(store, actorFor(alice, other), {
    workspaceId: space,
    name: 'notes',
  });
  assert.equal(created.ok, true);
  assert.equal(store.space(space).members.get(alice), 'owner');
  assert.equal(store.space(space).locked, true);
  assert.deepEqual(store.space(space).changes, [
    { accountId: alice, removed: false },
  ]);
});

await test('an appearance outside the union is rejected', async () => {
  const store = createFakeStore();
  const bad = await updatePreferences(store, actorFor(alice), {
    appearance: 'neon',
    themeFamily: 'nord',
  });
  assert.equal(bad.ok, false);
  const good = await updatePreferences(store, actorFor(alice), {
    appearance: 'dark',
    themeFamily: 'nord',
  });
  assert.equal(good.ok, true);
  assert.deepEqual(store.preferences.get(alice), {
    appearance: 'dark',
    themeFamily: 'nord',
    spellCheck: true,
  });
});

await test('a change keeps every setting that it does not name', async () => {
  const store = createFakeStore();
  const off = await updatePreferences(store, actorFor(alice), {
    spellCheck: false,
  });
  assert.equal(off.ok, true);
  assert.deepEqual(store.preferences.get(alice), {
    appearance: 'system',
    themeFamily: 'tokyo-night',
    spellCheck: false,
  });
  // A theme write that does not know the spell check leaves it off.
  const theme = await updatePreferences(store, actorFor(alice), {
    appearance: 'light',
    themeFamily: 'nord',
  });
  assert.equal(theme.ok, true);
  assert.deepEqual(store.preferences.get(alice), {
    appearance: 'light',
    themeFamily: 'nord',
    spellCheck: false,
  });
  const on = await updatePreferences(store, actorFor(alice), {
    spellCheck: true,
  });
  assert.equal(on.ok, true);
  assert.deepEqual(store.preferences.get(alice), {
    appearance: 'light',
    themeFamily: 'nord',
    spellCheck: true,
  });
});

await test('a refused member stores no other member', async () => {
  const store = createFakeStore();
  const result = await updatePreferences(store, actorFor(alice), {
    appearance: 'neon',
    spellCheck: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error.code, 'forbidden');
  assert.equal(store.preferences.get(alice), undefined);
});

await test('a theme family that is not a slug is rejected', async () => {
  const store = createFakeStore();
  for (const themeFamily of [
    '',
    'Tokyo Night',
    'tokyo_night',
    '-nord',
    'a'.repeat(41),
  ]) {
    const result = await updatePreferences(store, actorFor(alice), {
      appearance: 'dark',
      themeFamily,
    });
    assert.equal(result.ok, false, themeFamily);
  }
  assert.equal(store.preferences.get(alice), undefined);
  assert.ok(isThemeFamilyId('rose-pine'));
  assert.ok(isThemeFamilyId('one'));
});

await test('session grants follow the current role', () => {
  assert.deepEqual(sessionGrants([{ workspaceId: space, role: 'owner' }]), [
    { workspaceId: space, actions: ['read', 'history', 'write', 'purge'] },
  ]);
});

await test('consent names the current versions and is stored with its time', async () => {
  const store = createFakeStore();
  const actor = actorFor(alice);
  const documents: LegalDocuments = {
    terms: { url: 'https://example.test/terms', version: '2' },
    privacy: { url: 'https://example.test/privacy', version: '5' },
  };
  assert.deepEqual(await readConsent(store, actor), { ok: true, value: null });
  // A page that showed an older version records nothing.
  assert.deepEqual(
    await acceptLegalDocuments(store, actor, documents, {
      termsVersion: '1',
      privacyVersion: '5',
    }),
    { ok: false, error: { code: 'consent_required', fileIds: [] } },
  );
  assert.deepEqual(
    await acceptLegalDocuments(store, actor, null, {
      termsVersion: '2',
      privacyVersion: '5',
    }),
    { ok: false, error: { code: 'consent_required', fileIds: [] } },
  );
  assert.equal(store.consents.size, 0);
  assert.deepEqual(
    await acceptLegalDocuments(store, actor, documents, {
      termsVersion: '2',
      privacyVersion: '5',
    }),
    { ok: true, value: undefined },
  );
  assert.deepEqual(await readConsent(store, actor), {
    ok: true,
    value: {
      termsVersion: '2',
      privacyVersion: '5',
      acceptedAt: '2026-09-27T12:00:00.000Z',
    },
  });
});
