/**
 * PostgreSQL implementation of the account, workspace and installation ports.
 *
 * A membership change takes the same advisory workspace lock as a content
 * write, so the two have a defined order. The lock key is the workspace
 * identifier, exactly as in `workspace-store/transaction.ts`, so the two pools
 * contend on the same lock.
 *
 * The runtime role holds no right to insert a workspace, an account, or
 * another account's membership row. Those writes go through the reviewed
 * SECURITY DEFINER functions of the migrations, which check the caller's role
 * themselves. The rules in `@notesapp/core` are the first control; those
 * functions and the row policies are the second.
 *
 * Every lock follows the one order of record 0112: the installation lock,
 * then the workspace locks, then the account locks. An installation
 * transaction takes the installation lock first. A workspace transaction takes
 * its workspace lock first, and a database function takes the account lock
 * after it.
 */
import { randomUUID } from 'node:crypto';
import {
  installationSettingsOf,
  type InstallationSettingsRow,
} from './installation-settings-row.ts';
import type {
  AccountControls,
  ControlStanding,
  AccountEvent,
  AccountEventKind,
  ControlsWrite,
  OperatorAccountRecord,
  OperatorRemoval,
  OperatorStore,
  OperatorTotals,
  OperatorTransaction,
  RemovalCandidate,
  RemovalStore,
  AccountOwnStanding,
  AccountSettings,
  AccountRecord,
  AccountStanding,
  AccountState,
  AccountTransaction,
  Actor,
  AppearanceChoice,
  ConsentRecord,
  ConsentVersions,
  ImportedPalette,
  ImportedTheme,
  InstallationRole,
  InstallationSettingsReader,
  InstallationStore,
  InstallationTransaction,
  InvitationRecord,
  LinkReportRecord,
  NewInvitation,
  Preferences,
  RegistrationPolicy,
  RegistrationStore,
  Role,
  SessionRecord,
  StoredInstallationSettings,
  StoredLegalDocument,
  StoredMailSettings,
  WorkspaceAdminStore,
  WorkspaceAdminTransaction,
  WorkspaceSummary,
} from '@notesapp/core';
import {
  accountStates,
  defaultSpellCheck,
  importedFamilyOf,
  installationRoles,
  isThemeFamilyId,
  OperationalError,
  registrationPolicies,
  reportReasons,
  reportedLinkStates,
} from '@notesapp/core';
import pg from 'pg';
import {
  accountControlsColumns,
  accountControlsOf,
  controlsParameters,
  storedStanding,
  type AccountControlsRow,
} from './account-controls-row.ts';
import { openPool, poolSizes } from './pool.ts';
import {
  defaultConnectionTimeoutMs,
  WorkspaceUnavailableError,
} from './workspace-store/index.ts';
import { postgresFailure } from './workspace-store/errors.ts';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const roles: readonly Role[] = ['owner'];

/**
 * The family a row without a stored choice renders with.
 *
 * This is the third statement of the same fact. The client registry states it
 * in `defaultThemeFamilyId`, the `theme_family` column of `schema.ts` states
 * it as its default, and this constant answers a row that predates the column.
 * The three cannot read each other, because the server holds the family as an
 * opaque slug and never a colour (record 0016), so they move together
 * (record 0056).
 */
const defaultThemeFamily = 'default';
const appearances: readonly AppearanceChoice[] = ['system', 'light', 'dark'];

function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}

function isAppearance(value: string): value is AppearanceChoice {
  return appearances.some((appearance) => appearance === value);
}

/** Rejects an identifier that is not a UUID before it reaches SQL. */
function assertUuid(value: string, what: string): void {
  if (!uuidPattern.test(value)) {
    throw new OperationalError(
      'unexpected',
      `notesapp: ${what} is not a UUID; the transport must validate it.`,
    );
  }
}

/** The string members of one stored colour group, or `null` for no group. */
function colourGroupOf(value: unknown): Record<string, string> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const colours: Record<string, string> = {};
  for (const [name, colour] of Object.entries(value)) {
    if (typeof colour !== 'string') return null;
    colours[name] = colour;
  }
  return colours;
}

/** Narrows one stored palette. A palette that is present must be whole. */
function paletteOf(value: unknown): ImportedPalette | null {
  if (value === undefined) return null;
  const members =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? new Map(Object.entries(value))
      : null;
  const tokens = colourGroupOf(members?.get('tokens'));
  const syntax = colourGroupOf(members?.get('syntax'));
  if (tokens === null || syntax === null)
    throw new OperationalError(
      'unexpected',
      'notesapp: an imported theme row holds a palette of another shape.',
    );
  return { tokens, syntax };
}

/** Narrows one theme of the JSON list of `settings()`. */
function themeRowOf(entry: unknown): {
  id: string;
  name: string;
  palettes: unknown;
} {
  const members =
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? new Map<string, unknown>(Object.entries(entry))
      : new Map<string, unknown>();
  const id = members.get('id');
  const name = members.get('name');
  if (typeof id !== 'string' || typeof name !== 'string')
    throw new OperationalError(
      'unexpected',
      'notesapp: an imported theme row holds no identifier or no name.',
    );
  return { id, name, palettes: members.get('palettes') };
}

/** Narrows the stored palettes of one imported theme (record 0143). */
function importedThemeOf(row: {
  id: string;
  name: string;
  palettes: unknown;
}): ImportedTheme {
  const palettes =
    row.palettes !== null &&
    typeof row.palettes === 'object' &&
    !Array.isArray(row.palettes)
      ? new Map(Object.entries(row.palettes))
      : new Map<string, unknown>();
  return {
    themeId: row.id,
    name: row.name,
    light: paletteOf(palettes.get('light')),
    dark: paletteOf(palettes.get('dark')),
  };
}

/** Narrows a stored installation role. An unexpected value is a defect. */
function asInstallationRole(value: string): InstallationRole {
  const known = installationRoles.find((role) => role === value);
  if (known === undefined)
    throw new OperationalError(
      'unexpected',
      'notesapp: an account row holds an unknown installation role.',
    );
  return known;
}

/** Narrows a stored account state. An unexpected value is a defect. */
function asAccountState(value: string): AccountState {
  const known = accountStates.find((state) => state === value);
  if (known === undefined)
    throw new OperationalError(
      'unexpected',
      'notesapp: an account row holds an unknown state.',
    );
  return known;
}

/** The kinds of an account event, in the order of the enum. */
const eventKinds: readonly AccountEventKind[] = ['made', 'verified', 'removed'];

/** Narrows a stored event kind. An unexpected value is a defect. */
function asEventKind(value: string): AccountEventKind {
  const known = eventKinds.find((kind) => kind === value);
  if (known === undefined)
    throw new OperationalError(
      'unexpected',
      'notesapp: an account event holds an unknown kind.',
    );
  return known;
}

/** Narrows a stored registration policy. An unexpected value is a defect. */
/** The one read of the settings row (record 0148). */
async function readInstallationSettings(
  client: pg.PoolClient,
): Promise<StoredInstallationSettings> {
  const rows = await client.query<InstallationSettingsRow>(
    'select * from notesapp_installation_settings()',
  );
  const row = rows.rows[0];
  if (row === undefined)
    throw new OperationalError(
      'unexpected',
      'notesapp: the installation has no settings row.',
    );
  return installationSettingsOf(row);
}

function asRegistrationPolicy(value: string): RegistrationPolicy {
  const known = registrationPolicies.find((policy) => policy === value);
  if (known === undefined)
    throw new OperationalError(
      'unexpected',
      'notesapp: the settings hold an unknown registration policy.',
    );
  return known;
}

/** Narrows the stored reason and link state of a report. */
function asReportFacts(
  reason: string,
  linkState: string,
): Pick<LinkReportRecord, 'reason' | 'linkState'> {
  const knownReason = reportReasons.find((known) => known === reason);
  const knownState = reportedLinkStates.find((known) => known === linkState);
  if (knownReason === undefined || knownState === undefined)
    throw new OperationalError(
      'unexpected',
      'notesapp: a report row holds an unknown reason or link state.',
    );
  return { reason: knownReason, linkState: knownState };
}

/** An instant that the driver read, as an ISO 8601 text. */
function isoOf(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/** Narrows a stored role string. An unexpected value is a defect. */
function asRole(value: string): Role {
  if (!isRole(value)) {
    throw new OperationalError(
      'unexpected',
      'notesapp: a membership row holds an unknown role.',
    );
  }
  return value;
}

/**
 * Narrows a stored appearance string. An unexpected value falls back to
 * system, so a row written by another release still renders.
 */
function asAppearance(value: string): AppearanceChoice {
  return isAppearance(value) ? value : 'system';
}

/**
 * Narrows a stored theme family string.
 *
 * The palette registry lives in the browser package, so the store checks the
 * slug shape only and lets the client fall back when it does not know the
 * family.
 */
function asThemeFamily(value: string): string {
  return isThemeFamilyId(value) ? value : defaultThemeFamily;
}

/** An identity store and the calls that a process needs to manage its pool. */
export type IdentityStoreHandle = WorkspaceAdminStore &
  InstallationStore &
  InstallationSettingsReader &
  RegistrationStore &
  OperatorStore &
  RemovalStore & {
    /** The account of a Better Auth user, or `null` when none is linked. */
    accountOf(authUserId: string): Promise<string | null>;
    /**
     * The account that a session of a Better Auth user serves: an enabled
     * account that is not removed, or `null` (record 0111). The actor resolver
     * and the session create hook both ask this, so a disabled account gets no
     * actor and no new session.
     */
    sessionAccount(authUserId: string): Promise<string | null>;
    /**
     * The account that a session serves and its standing, or `null` for the
     * same accounts as `sessionAccount` (records 0111 and 0201). The actor
     * resolver reads it, so a locked account keeps only its list.
     */
    sessionStanding(authUserId: string): Promise<SessionStanding | null>;
    /**
     * The workspaces that one notice stream may still hear about, or `null`
     * when its session ended or expired, or no longer serves an enabled
     * account (record 0129). Nothing caches the answer.
     */
    noticeAccess(
      sessionId: string,
      accountId: string,
    ): Promise<readonly string[] | null>;
    /**
     * Stores one invitation of the operator command `pnpm account:invite`.
     * Answers `null` when an account already signs in with the address.
     */
    operatorInvite(invitation: NewInvitation): Promise<InvitationRecord | null>;
    /**
     * Makes the account of one address an enabled administrator, for the
     * operator command `pnpm account:promote` (record 0110). Answers the
     * account, or `null` when no account signs in with the address.
     */
    operatorPromote(email: string): Promise<string | null>;
    /** The current role of one account in each of its workspaces. */
    memberships(
      accountId: string,
    ): Promise<readonly { workspaceId: string; role: Role }[]>;
    /** Whether any application account exists. The bootstrap command uses it. */
    hasAccount(): Promise<boolean>;
    /**
     * Removes each identity user that nobody verified before `cutoff` and
     * that no account links, and answers how many (record 0114). The hourly
     * run calls it, so a pending sign-up that expired leaves nothing.
     */
    removePendingIdentities(cutoff: Date): Promise<number>;
    /**
     * Marks one challenge of the proof of work used, and answers whether this
     * call was the first use (record 0115).
     */
    useChallenge(digest: string, expiresAt: Date): Promise<boolean>;
    /** Removes the used challenges that expired before `cutoff`. */
    pruneChallenges(cutoff: Date): Promise<number>;
    /**
     * Appends one content free record to the audit trail of an account. The
     * operator recovery command uses it.
     */
    recordAccountAudit(accountId: string, action: string): Promise<void>;
    /**
     * Removes an account that a sign-up attempt created and never used.
     *
     * The call is bound to that account: the database function refuses every
     * account that is not the identity of the transaction, so one account can
     * never remove another. It also refuses when any retained record still names
     * the account, when it belongs to a workspace that is not its own personal
     * one, or when that workspace holds anything at all. The answer is then
     * false rather than a failure.
     */
    discardAccount(authUserId: string): Promise<boolean>;
    /** Closes every pooled connection. */
    close(): Promise<void>;
  };

/** The account of a session and its standing (record 0201). */
export type SessionStanding = {
  readonly accountId: string;
  readonly standing: ControlStanding;
};

/** Options of one identity store pool. */
export type IdentityStoreOptions = {
  /** Maximum pooled connections. */
  readonly poolSize?: number;
};

/** Opens the account and workspace administration store. */
export function openIdentityStore(
  databaseUrl: string,
  options: IdentityStoreOptions = {},
): IdentityStoreHandle {
  const pool = openPool({
    connectionString: databaseUrl,
    max: options.poolSize ?? poolSizes.identity,
    // Every pool of this server takes the same bound. A pool with no bound
    // waits for a free slot and for the connection itself without end, so one
    // unreachable database turns into a queue of held request slots.
    connectionTimeoutMillis: defaultConnectionTimeoutMs,
  });

  /** Runs one transaction with the account identity of the actor. */
  async function inTransaction<T>(
    accountId: string | null,
    workspaceId: string | null,
    run: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: pg.PoolClient;
    try {
      client = await pool.connect();
    } catch {
      // The driver's own message repeats the host, the port, and the role of
      // the connection URL, so it is replaced rather than wrapped.
      throw new OperationalError(
        'unavailable',
        'notesapp: the identity store is not reachable.',
      );
    }
    try {
      await client.query('begin');
      try {
        if (accountId !== null) {
          await client.query(
            "select set_config('notesapp.account_id', $1, true)",
            [accountId],
          );
        }
        if (workspaceId !== null) {
          await client.query(
            'select pg_advisory_xact_lock(hashtext($1::text)::bigint)',
            [workspaceId],
          );
        }
        const value = await run(client);
        await client.query('commit');
        return value;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch {
          // The connection is already unusable; report the first failure.
        }
        throw error;
      }
    } finally {
      client.release();
    }
  }

  /** Takes the advisory lock that every write of one workspace shares. */
  async function lockWorkspace(
    client: pg.PoolClient,
    workspaceId: string,
  ): Promise<void> {
    assertUuid(workspaceId, 'the workspace');
    await client.query(
      'select pg_advisory_xact_lock(hashtext($1::text)::bigint)',
      [workspaceId],
    );
  }

  /** Appends one content free record to the audit trail of one account. */
  async function writeAccountAudit(
    client: pg.PoolClient,
    accountId: string,
    input: {
      readonly action: string;
      readonly targetKind: string;
      readonly targetId: string | null;
    },
  ): Promise<void> {
    await client.query(
      `insert into account_audit_events
         (id, account_id, action, target_kind, target_id)
       values ($1, $2, $3, $4, $5)`,
      [randomUUID(), accountId, input.action, input.targetKind, input.targetId],
    );
  }

  /** Appends one incremental membership record under the workspace lock. */
  async function writeMembershipChange(
    client: pg.PoolClient,
    workspaceId: string,
    input: { readonly accountId: string; readonly removed: boolean },
  ): Promise<void> {
    const allocated = await client.query<{ cursor: string }>(
      'select notesapp_next_cursor($1) as cursor',
      [workspaceId],
    );
    const cursor = allocated.rows[0]?.cursor;
    if (cursor === undefined) {
      throw new OperationalError(
        'unexpected',
        'notesapp: the workspace cursor was not allocated.',
      );
    }
    await client.query(
      `insert into sync_changes
         (workspace_id, cursor, entity_kind, entity_id, deleted)
       values ($1, $2::bigint, 'membership', $3, $4)`,
      [workspaceId, cursor, input.accountId, input.removed],
    );
  }

  function accountTransaction(
    client: pg.PoolClient,
    accountId: string,
  ): AccountTransaction {
    return {
      async workspaces(): Promise<readonly WorkspaceSummary[]> {
        const rows = await client.query<{
          id: string;
          name: string;
          personal: boolean;
          role: string;
        }>(
          `select w.id, w.name, w.personal, m.role::text as role
             from memberships m
             join workspaces w on w.id = m.workspace_id
            where m.account_id = $1
            order by w.personal desc, w.name asc, w.id asc`,
          [accountId],
        );
        return rows.rows.map((row) => ({
          workspaceId: row.id,
          name: row.name,
          personal: row.personal,
          role: asRole(row.role),
        }));
      },

      async memberships() {
        const rows = await client.query<{ workspace_id: string; role: string }>(
          `select workspace_id, role::text as role
             from memberships where account_id = $1 order by workspace_id`,
          [accountId],
        );
        return rows.rows.map((row) => ({
          workspaceId: row.workspace_id,
          role: asRole(row.role),
        }));
      },

      async preferences(): Promise<Preferences> {
        const rows = await client.query<{
          theme: string;
          theme_family: string;
          spell_check: boolean;
        }>(
          `select theme, theme_family, spell_check from account_preferences
             where account_id = $1`,
          [accountId],
        );
        const row = rows.rows[0];
        return {
          appearance: asAppearance(row?.theme ?? 'system'),
          themeFamily: asThemeFamily(row?.theme_family ?? defaultThemeFamily),
          spellCheck: row?.spell_check ?? defaultSpellCheck,
        };
      },

      async standing(): Promise<AccountOwnStanding> {
        const rows = await client.query<
          AccountControlsRow & {
            installation_role: string;
            used_bytes: string;
          }
        >(
          `select a.installation_role::text as installation_role,
                  ${accountControlsColumns},
                  coalesce((select sum(u.bytes_used)
                              from workspace_usage u
                              join memberships m on m.workspace_id = u.workspace_id
                             where m.account_id = a.id and m.role = 'owner'),
                           0)::text as used_bytes
             from accounts a where a.id = $1`,
          [accountId],
        );
        const row = rows.rows[0];
        if (row === undefined)
          throw new OperationalError(
            'unexpected',
            'notesapp: the account of the transaction has no row.',
          );
        return {
          role: asInstallationRole(row.installation_role),
          usedBytes: BigInt(row.used_bytes),
          limitBytes: BigInt(row.limit_bytes),
          controls: accountControlsOf(row),
        };
      },

      async sessions(): Promise<readonly SessionRecord[]> {
        const rows = await client.query<{
          session_id: string;
          user_agent: string | null;
          created_at: Date;
          last_active_at: Date;
          expires_at: Date;
        }>('select * from notesapp_account_sessions()');
        return rows.rows.map((row) => ({
          sessionId: row.session_id,
          userAgent: row.user_agent,
          createdAt: isoOf(row.created_at),
          lastActiveAt: isoOf(row.last_active_at),
          expiresAt: isoOf(row.expires_at),
        }));
      },

      async revokeSession(sessionId: string): Promise<boolean> {
        const rows = await client.query<{ revoked: boolean }>(
          'select notesapp_revoke_session($1) as revoked',
          [sessionId],
        );
        return rows.rows[0]?.revoked ?? false;
      },

      async revokeOtherSessions(keepSessionId: string): Promise<number> {
        const rows = await client.query<{ ended: number }>(
          'select notesapp_revoke_other_sessions($1) as ended',
          [keepSessionId],
        );
        return rows.rows[0]?.ended ?? 0;
      },

      async openHandoff(tokenDigest: string): Promise<void> {
        if (!/^[0-9a-f]{64}$/.test(tokenDigest))
          throw new OperationalError(
            'unexpected',
            'notesapp: a handoff is stored as a digest.',
          );
        await client.query('select notesapp_open_handoff($1)', [tokenDigest]);
      },

      async consent(): Promise<ConsentRecord | null> {
        const rows = await client.query<{
          terms_version: string;
          privacy_version: string;
          accepted_at: Date;
        }>(
          `select terms_version, privacy_version, accepted_at
             from account_consents where account_id = $1`,
          [accountId],
        );
        const row = rows.rows[0];
        return row === undefined
          ? null
          : {
              termsVersion: row.terms_version,
              privacyVersion: row.privacy_version,
              acceptedAt: isoOf(row.accepted_at),
            };
      },

      async recordConsent(versions: ConsentVersions): Promise<void> {
        await client.query(
          `insert into account_consents
             (account_id, terms_version, privacy_version, accepted_at)
             values ($1, $2, $3, now())
           on conflict (account_id)
             do update set terms_version = excluded.terms_version,
                           privacy_version = excluded.privacy_version,
                           accepted_at = now()`,
          [accountId, versions.termsVersion, versions.privacyVersion],
        );
      },

      async themes(): Promise<readonly ImportedTheme[]> {
        const rows = await client.query<{
          id: string;
          name: string;
          palettes: unknown;
        }>(
          `select id, name, palettes from account_themes
             where account_id = $1 order by created_at, id`,
          [accountId],
        );
        return rows.rows.map(importedThemeOf);
      },

      async settings(): Promise<AccountSettings> {
        // One statement reads one snapshot, so a theme that a delete removes
        // during the read is gone from the list and from the family alike.
        const rows = await client.query<{
          theme: string | null;
          theme_family: string | null;
          spell_check: boolean | null;
          themes: unknown;
        }>(
          `select p.theme, p.theme_family, p.spell_check,
                  coalesce((select json_agg(json_build_object(
                                     'id', t.id, 'name', t.name, 'palettes', t.palettes)
                                   order by t.created_at, t.id)
                              from account_themes t where t.account_id = $1),
                           '[]'::json) as themes
             from (select $1::uuid as account_id) a
             left join account_preferences p on p.account_id = a.account_id`,
          [accountId],
        );
        const row = rows.rows[0];
        const themes = Array.isArray(row?.themes) ? row.themes : [];
        return {
          appearance: asAppearance(row?.theme ?? 'system'),
          themeFamily: asThemeFamily(row?.theme_family ?? defaultThemeFamily),
          spellCheck: row?.spell_check ?? defaultSpellCheck,
          themes: themes.map((entry: unknown) =>
            importedThemeOf(themeRowOf(entry)),
          ),
        };
      },

      async lockSettings(): Promise<void> {
        // A theme hangs from the settings row, so the row exists before the
        // first theme, and its lock orders two writes of one account.
        await client.query(
          `insert into account_preferences (account_id) values ($1)
             on conflict (account_id) do nothing`,
          [accountId],
        );
        await client.query(
          'select account_id from account_preferences where account_id = $1 for update',
          [accountId],
        );
      },

      async addTheme(theme: ImportedTheme): Promise<void> {
        assertUuid(theme.themeId, 'the theme');
        const palettes: Record<string, ImportedPalette> = {};
        if (theme.light !== null) palettes['light'] = theme.light;
        if (theme.dark !== null) palettes['dark'] = theme.dark;
        await client.query(
          `insert into account_themes (id, account_id, name, palettes)
             values ($1, $2, $3, $4::jsonb)`,
          [theme.themeId, accountId, theme.name, JSON.stringify(palettes)],
        );
      },

      async removeTheme(themeId: string): Promise<boolean> {
        assertUuid(themeId, 'the theme');
        const removed = await client.query(
          'delete from account_themes where id = $1 and account_id = $2',
          [themeId, accountId],
        );
        if (removed.rowCount !== 1) return false;
        // A setting that names the family of the theme takes the column
        // default, the one default family.
        await client.query(
          `update account_preferences set theme_family = default, updated_at = now()
             where account_id = $1 and theme_family = $2`,
          [accountId, importedFamilyOf(themeId)],
        );
        return true;
      },

      async savePreferences(preferences: Preferences): Promise<void> {
        await client.query(
          `insert into account_preferences
             (account_id, theme, theme_family, spell_check, updated_at)
             values ($1, $2, $3, $4, now())
           on conflict (account_id)
             do update set theme = excluded.theme,
                           theme_family = excluded.theme_family,
                           spell_check = excluded.spell_check,
                           updated_at = now()`,
          [
            accountId,
            preferences.appearance,
            preferences.themeFamily,
            preferences.spellCheck,
          ],
        );
      },

      async createWorkspace(input): Promise<void> {
        assertUuid(input.workspaceId, 'the workspace');
        // The new workspace takes the same lock as every other write of that
        // workspace, so its first membership record and its first cursor are
        // allocated in the same order as a later change.
        await lockWorkspace(client, input.workspaceId);
        await client.query('select notesapp_create_workspace($1, $2)', [
          input.workspaceId,
          input.name,
        ]);
      },

      async lockWorkspace(workspaceId: string): Promise<void> {
        await lockWorkspace(client, workspaceId);
      },

      async recordMembershipChange(workspaceId: string, input): Promise<void> {
        assertUuid(workspaceId, 'the workspace');
        await writeMembershipChange(client, workspaceId, input);
      },
    };
  }

  function workspaceTransaction(
    client: pg.PoolClient,
    accountId: string,
    workspaceId: string,
  ): WorkspaceAdminTransaction {
    return {
      async describe(): Promise<{ name: string; personal: boolean } | null> {
        const rows = await client.query<{ name: string; personal: boolean }>(
          'select name, personal from workspaces where id = $1',
          [workspaceId],
        );
        const row = rows.rows[0];
        return row === undefined
          ? null
          : { name: row.name, personal: row.personal };
      },

      async role(account: string): Promise<Role | null> {
        assertUuid(account, 'the account');
        const rows = await client.query<{ role: string }>(
          `select role::text as role from memberships
            where workspace_id = $1 and account_id = $2`,
          [workspaceId, account],
        );
        const value = rows.rows[0]?.role;
        return value === undefined ? null : asRole(value);
      },

      async accountWorkspaceCount(): Promise<number> {
        // The account comes from the transaction and never from a request, so
        // one account cannot ask how many workspaces another one holds.
        const rows = await client.query<{ held: string }>(
          'select count(*)::text as held from memberships where account_id = $1',
          [accountId],
        );
        return Number(rows.rows[0]?.held ?? '0');
      },

      async rename(name: string): Promise<void> {
        await client.query('update workspaces set name = $2 where id = $1', [
          workspaceId,
          name,
        ]);
      },

      async destroy(): Promise<void> {
        await client.query('select notesapp_delete_workspace($1)', [
          workspaceId,
        ]);
      },

      async auditAccount(input): Promise<void> {
        // Deleting a workspace removes every row of it, so the record of that
        // deletion goes to the account trail, which no workspace owns.
        await writeAccountAudit(client, accountId, {
          action: input.action,
          targetKind: 'workspace',
          targetId: workspaceId,
        });
      },

      async recordMembershipChange(input): Promise<void> {
        await writeMembershipChange(client, workspaceId, input);
      },
    };
  }

  /**
   * One account with its controls and its usage of one month, for an
   * administrator or the operator, or `null`.
   */
  async function readAccountControls(
    client: pg.PoolClient,
    accountId: string,
    month: string,
  ): Promise<OperatorAccountRecord | null> {
    const rows = await client.query<
      AccountControlsRow & {
        account_id: string;
        email: string | null;
        installation_role: string;
        state: string;
        created_at: Date;
        used_bytes: string;
        text_bytes: string;
        published_transfer_bytes: string;
        download_bytes: string;
      }
    >(
      `select c.account_id, c.email, c.installation_role, c.state,
              c.created_at, c.standing,
              c.removal_at, c.limit_bytes::text as limit_bytes,
              c.text_limit_bytes::text as text_limit_bytes,
              c.published_transfer_limit_bytes::text
                as published_transfer_limit_bytes,
              c.download_limit_bytes::text as download_limit_bytes,
              c.teams, c.collaboration,
              c.controls_revision::text as controls_revision,
              c.used_bytes::text as used_bytes,
              c.text_bytes::text as text_bytes,
              c.published_transfer_bytes::text as published_transfer_bytes,
              c.download_bytes::text as download_bytes
         from notesapp_account_controls($1, $2::date) c`,
      [accountId, `${month}-01`],
    );
    const row = rows.rows[0];
    if (row === undefined) return null;
    return {
      accountId: row.account_id,
      email: row.email,
      role: asInstallationRole(row.installation_role),
      state: asAccountState(row.state),
      createdAt: isoOf(row.created_at),
      controls: accountControlsOf(row),
      usage: {
        usedBytes: BigInt(row.used_bytes),
        textBytes: BigInt(row.text_bytes),
        month,
        publishedTransferBytes: BigInt(row.published_transfer_bytes),
        downloadBytes: BigInt(row.download_bytes),
      },
    };
  }

  /**
   * Writes every control of one account with the revision that the writer
   * read. The function refuses a caller that is neither an administrator nor
   * the operator.
   */
  async function writeControls(
    client: pg.PoolClient,
    accountId: string,
    revision: number,
    controls: AccountControls,
  ): Promise<ControlsWrite> {
    const rows = await client.query<{ outcome: string }>(
      `select notesapp_set_account_controls($1, $2::bigint,
         $3::account_standing, $4::timestamptz, $5::bigint, $6::bigint,
         $7::bigint, $8::bigint, $9, $10) as outcome`,
      [accountId, ...controlsParameters(revision, controls)],
    );
    const outcome = rows.rows[0]?.outcome;
    if (outcome === 'written' || outcome === 'changed' || outcome === 'missing')
      return outcome;
    throw new OperationalError(
      'unexpected',
      'notesapp: the write of the controls answered no known outcome.',
    );
  }

  /** The reads and writes of the operator API (record 0190). */
  function operatorTransaction(client: pg.PoolClient): OperatorTransaction {
    return {
      async findAccount(email: string): Promise<string | null> {
        const rows = await client.query<{ account: string | null }>(
          'select notesapp_operator_find_account($1) as account',
          [email],
        );
        return rows.rows[0]?.account ?? null;
      },

      async account(
        accountId: string,
        month: string,
      ): Promise<OperatorAccountRecord | null> {
        assertUuid(accountId, 'the account');
        return readAccountControls(client, accountId, month);
      },

      async setControls(accountId, revision, controls) {
        assertUuid(accountId, 'the account');
        return writeControls(client, accountId, revision, controls);
      },

      async remove(accountId: string): Promise<OperatorRemoval> {
        assertUuid(accountId, 'the account');
        // The refusal of the last administrator and of an unknown account
        // are answers, so the statement runs in a savepoint and the
        // transaction stays usable after it.
        await client.query('savepoint operator_removal');
        try {
          await client.query('select notesapp_remove_account($1)', [accountId]);
          await client.query('release savepoint operator_removal');
          return 'removed';
        } catch (error: unknown) {
          await client.query('rollback to savepoint operator_removal');
          const failure = postgresFailure(error);
          if (failure?.code === 'NA002') return 'last_administrator';
          if (failure?.code === 'P0002') return 'missing';
          throw error;
        }
      },

      async totals(month: string): Promise<OperatorTotals> {
        const rows = await client.query<{
          published_transfer_bytes: string;
          download_bytes: string;
          object_writes: string;
          object_reads: string;
        }>(
          `select published_transfer_bytes::text as published_transfer_bytes,
                  download_bytes::text as download_bytes,
                  object_writes::text as object_writes,
                  object_reads::text as object_reads
             from notesapp_operator_totals($1::date)`,
          [`${month}-01`],
        );
        const row = rows.rows[0];
        return {
          month,
          publishedTransferBytes: BigInt(row?.published_transfer_bytes ?? '0'),
          downloadBytes: BigInt(row?.download_bytes ?? '0'),
          objectWrites: BigInt(row?.object_writes ?? '0'),
          objectReads: BigInt(row?.object_reads ?? '0'),
        };
      },

      async events(
        after: number,
        limit: number,
      ): Promise<readonly AccountEvent[]> {
        const rows = await client.query<{
          cursor: string;
          account_id: string;
          kind: string;
          occurred_at: Date;
        }>(
          `select cursor::text as cursor, account_id, kind, occurred_at
             from notesapp_operator_account_events($1::bigint, $2)`,
          [String(after), limit],
        );
        return rows.rows.map((row) => ({
          cursor: Number(row.cursor),
          accountId: row.account_id,
          kind: asEventKind(row.kind),
          occurredAt: isoOf(row.occurred_at),
        }));
      },

      async redeemHandoff(tokenDigest: string) {
        const rows = await client.query<{
          account_id: string;
          email: string | null;
        }>('select account_id, email from notesapp_redeem_handoff($1)', [
          tokenDigest,
        ]);
        const row = rows.rows[0];
        return row === undefined
          ? null
          : { accountId: row.account_id, email: row.email };
      },
    };
  }

  function installationTransaction(
    client: pg.PoolClient,
  ): InstallationTransaction {
    return {
      async standing(accountId: string): Promise<AccountStanding | null> {
        assertUuid(accountId, 'the account');
        const rows = await client.query<{
          installation_role: string;
          state: string;
        }>(
          'select installation_role, state from notesapp_account_standing($1)',
          [accountId],
        );
        const row = rows.rows[0];
        return row === undefined
          ? null
          : {
              accountId,
              role: asInstallationRole(row.installation_role),
              state: asAccountState(row.state),
            };
      },

      async enabledAdministrators(): Promise<number> {
        const rows = await client.query<{ held: number }>(
          'select notesapp_enabled_administrators() as held',
        );
        return rows.rows[0]?.held ?? 0;
      },

      async accounts(): Promise<readonly AccountRecord[]> {
        const rows = await client.query<
          AccountControlsRow & {
            account_id: string;
            email: string | null;
            name: string | null;
            installation_role: string;
            state: string;
            created_at: Date;
            last_active_at: Date | null;
            used_bytes: string;
          }
        >(
          `select account_id, email, name, installation_role, state,
                  created_at, last_active_at, used_bytes::text as used_bytes,
                  limit_bytes::text as limit_bytes, standing, removal_at,
                  text_limit_bytes::text as text_limit_bytes,
                  published_transfer_limit_bytes::text
                    as published_transfer_limit_bytes,
                  download_limit_bytes::text as download_limit_bytes,
                  teams, collaboration,
                  controls_revision::text as controls_revision
             from notesapp_list_accounts()`,
        );
        return rows.rows.map((row) => ({
          accountId: row.account_id,
          email: row.email,
          name: row.name,
          role: asInstallationRole(row.installation_role),
          state: asAccountState(row.state),
          createdAt: isoOf(row.created_at),
          lastActiveAt:
            row.last_active_at === null ? null : isoOf(row.last_active_at),
          usedBytes: BigInt(row.used_bytes),
          limitBytes: BigInt(row.limit_bytes),
          controls: accountControlsOf(row),
        }));
      },

      async setRole(accountId: string, role: InstallationRole): Promise<void> {
        assertUuid(accountId, 'the account');
        await client.query(
          'select notesapp_set_installation_role($1, $2::installation_role)',
          [accountId, role],
        );
      },

      async setState(accountId: string, state: AccountState): Promise<void> {
        assertUuid(accountId, 'the account');
        await client.query(
          'select notesapp_set_account_state($1, $2::account_state)',
          [accountId, state],
        );
      },

      async setLimit(accountId: string, limitBytes: bigint): Promise<void> {
        assertUuid(accountId, 'the account');
        await client.query(
          'select notesapp_set_account_limit($1, $2::bigint)',
          [accountId, limitBytes.toString()],
        );
      },

      async setControls(accountId, revision, controls) {
        assertUuid(accountId, 'the account');
        return writeControls(client, accountId, revision, controls);
      },

      async remove(accountId: string): Promise<void> {
        assertUuid(accountId, 'the account');
        await client.query('select notesapp_remove_account($1)', [accountId]);
      },

      async invitations(): Promise<readonly InvitationRecord[]> {
        const rows = await client.query<{
          invitation_id: string;
          email: string;
          created_at: Date;
          expires_at: Date;
          mailed: boolean;
        }>('select * from notesapp_list_invitations()');
        return rows.rows.map((row) => ({
          invitationId: row.invitation_id,
          email: row.email,
          createdAt: isoOf(row.created_at),
          expiresAt: isoOf(row.expires_at),
          mailed: row.mailed,
        }));
      },

      invite(invitation: NewInvitation): Promise<InvitationRecord | null> {
        return writeInvitation(client, invitation);
      },

      async revokeInvitation(invitationId: string): Promise<boolean> {
        assertUuid(invitationId, 'the invitation');
        const rows = await client.query<{ revoked: boolean }>(
          'select notesapp_revoke_invitation($1) as revoked',
          [invitationId],
        );
        return rows.rows[0]?.revoked ?? false;
      },

      async reports(): Promise<readonly LinkReportRecord[]> {
        const rows = await client.query<{
          report_id: string;
          publication_id: string;
          reason: string;
          note: string | null;
          sealed_address: string | null;
          link_state: string;
          created_at: Date;
        }>('select * from notesapp_list_reports()');
        return rows.rows.map((row) => ({
          reportId: row.report_id,
          publicationId: row.publication_id,
          ...asReportFacts(row.reason, row.link_state),
          note: row.note,
          sealedAddress: row.sealed_address,
          createdAt: isoOf(row.created_at),
        }));
      },

      async dismissReport(reportId: string): Promise<boolean> {
        assertUuid(reportId, 'the report');
        const rows = await client.query<{ closed: boolean }>(
          'select notesapp_dismiss_report($1) as closed',
          [reportId],
        );
        return rows.rows[0]?.closed ?? false;
      },

      async takeDown(reportId: string): Promise<boolean> {
        assertUuid(reportId, 'the report');
        const rows = await client.query<{ taken: boolean }>(
          'select notesapp_take_down_publication($1) as taken',
          [reportId],
        );
        return rows.rows[0]?.taken ?? false;
      },

      async registrationPolicy(): Promise<RegistrationPolicy> {
        const rows = await client.query<{ policy: string }>(
          'select notesapp_registration_policy()::text as policy',
        );
        return asRegistrationPolicy(rows.rows[0]?.policy ?? 'invitation');
      },

      async setRegistrationPolicy(policy: RegistrationPolicy): Promise<void> {
        await client.query(
          'select notesapp_set_registration_policy($1::registration_policy)',
          [policy],
        );
      },

      settings(): Promise<StoredInstallationSettings> {
        return readInstallationSettings(client);
      },

      async setMailSettings(mail: StoredMailSettings | null): Promise<void> {
        await client.query(
          'select notesapp_set_mail_settings($1, $2, $3::mail_security, $4, $5, $6)',
          [
            mail?.host ?? null,
            mail?.port ?? null,
            mail?.security ?? null,
            mail?.username ?? null,
            mail?.passwordSealed ?? null,
            mail?.sender ?? null,
          ],
        );
      },

      async setLegalDocument(
        name: 'terms' | 'privacy',
        document: StoredLegalDocument | null,
      ): Promise<void> {
        await client.query(
          'select notesapp_set_legal_document($1, $2::legal_document_kind, $3, $4, $5)',
          [
            name,
            document?.kind ?? null,
            document?.kind === 'text' ? document.text : null,
            document?.kind === 'address' ? document.url : null,
            document?.version ?? null,
          ],
        );
      },
    };
  }

  /** Stores one invitation through the one checked function. */
  async function writeInvitation(
    client: pg.PoolClient,
    invitation: NewInvitation,
  ): Promise<InvitationRecord | null> {
    assertUuid(invitation.invitationId, 'the invitation');
    const rows = await client.query<{ created_at: Date | null }>(
      'select notesapp_invite($1, $2, $3, $4::timestamptz, $5) as created_at',
      [
        invitation.invitationId,
        invitation.tokenDigest,
        invitation.email,
        invitation.expiresAt,
        invitation.mailed,
      ],
    );
    const made = rows.rows[0]?.created_at ?? null;
    if (made === null) return null;
    return {
      invitationId: invitation.invitationId,
      email: invitation.email,
      createdAt: isoOf(made),
      expiresAt: isoOf(invitation.expiresAt),
      mailed: invitation.mailed,
    };
  }

  /**
   * Runs one transaction of an operator command.
   *
   * The transaction sets no account and sets the operator setting, which the
   * operator functions read. See `notesapp_is_operator` in the migrations for
   * what that guard is and is not.
   */
  function asOperator<T>(
    run: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return inTransaction(null, null, async (client) => {
      await client.query("select set_config('notesapp.operator', 'on', true)");
      return run(client);
    });
  }

  return {
    installation<T>(
      actor: Actor,
      run: (tx: InstallationTransaction) => Promise<T>,
    ): Promise<T> {
      assertUuid(actor.accountId, 'the actor account');
      return inTransaction(actor.accountId, null, async (client) => {
        // The first lock of the one order, before anything is read, so the
        // standing and the count that the use case reads are the ones its
        // change acts on.
        await client.query('select notesapp_lock_installation()');
        return run(installationTransaction(client));
      });
    },

    async register(request): Promise<string | null> {
      assertUuid(request.accountId, 'the account');
      assertUuid(request.workspaceId, 'the workspace');
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ account: string | null }>(
          `select notesapp_register_account($1, $2, $3, $4, $5, $6, $7::bigint,
             $8::account_standing, $9::bigint) as account`,
          [
            request.authUserId,
            request.ground.kind,
            request.ground.kind === 'invitation'
              ? request.ground.tokenDigest
              : null,
            request.accountId,
            request.workspaceId,
            request.workspaceName,
            request.newAccount.limitBytes.toString(),
            request.newAccount.standing,
            request.newAccount.removeAfterSeconds === null
              ? null
              : String(request.newAccount.removeAfterSeconds),
          ],
        );
        return rows.rows[0]?.account ?? null;
      });
    },

    async invitationAddress(tokenDigest: string): Promise<string | null> {
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ email: string | null }>(
          'select notesapp_invitation_address($1) as email',
          [tokenDigest],
        );
        return rows.rows[0]?.email ?? null;
      });
    },

    async sessionAccount(authUserId: string): Promise<string | null> {
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ account: string | null }>(
          'select notesapp_session_account($1) as account',
          [authUserId],
        );
        return rows.rows[0]?.account ?? null;
      });
    },

    async sessionStanding(authUserId: string): Promise<SessionStanding | null> {
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{
          account_id: string;
          standing: string;
        }>('select account_id, standing from notesapp_session_standing($1)', [
          authUserId,
        ]);
        const row = rows.rows[0];
        return row === undefined
          ? null
          : {
              accountId: row.account_id,
              standing: storedStanding(row.standing),
            };
      });
    },

    async noticeAccess(
      sessionId: string,
      accountId: string,
    ): Promise<readonly string[] | null> {
      assertUuid(accountId, 'the account');
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ workspaces: string[] | null }>(
          'select notesapp_notice_access($1, $2) as workspaces',
          [sessionId, accountId],
        );
        return rows.rows[0]?.workspaces ?? null;
      });
    },

    operatorInvite(
      invitation: NewInvitation,
    ): Promise<InvitationRecord | null> {
      return asOperator((client) => writeInvitation(client, invitation));
    },

    async removalCandidates(
      horizon: Date,
    ): Promise<readonly RemovalCandidate[]> {
      return asOperator(async (client) => {
        const rows = await client.query<{
          account_id: string;
          email: string | null;
          removal_at: Date;
          removal_notices: number;
        }>(
          `select account_id, email, removal_at, removal_notices
             from notesapp_removal_candidates($1)`,
          [horizon],
        );
        return rows.rows.map((row) => ({
          accountId: row.account_id,
          email: row.email,
          removalAt: isoOf(row.removal_at),
          notices: row.removal_notices,
        }));
      });
    },

    async removeDueAccount(accountId: string): Promise<boolean> {
      assertUuid(accountId, 'the account');
      return asOperator(async (client) => {
        const rows = await client.query<{ removed: boolean }>(
          'select notesapp_remove_due_account($1) as removed',
          [accountId],
        );
        return rows.rows[0]?.removed ?? false;
      });
    },

    async markRemovalNotice(
      accountId: string,
      notices: number,
      removalAt: string,
    ): Promise<boolean> {
      assertUuid(accountId, 'the account');
      return asOperator(async (client) => {
        const rows = await client.query<{ marked: boolean }>(
          'select notesapp_mark_removal_notice($1, $2, $3) as marked',
          [accountId, notices, removalAt],
        );
        return rows.rows[0]?.marked ?? false;
      });
    },

    operator<T>(run: (tx: OperatorTransaction) => Promise<T>): Promise<T> {
      return asOperator((client) => run(operatorTransaction(client)));
    },

    operatorPromote(email: string): Promise<string | null> {
      return asOperator(async (client) => {
        const rows = await client.query<{ account: string | null }>(
          'select notesapp_operator_promote($1) as account',
          [email],
        );
        return rows.rows[0]?.account ?? null;
      });
    },

    account<T>(
      actor: Actor,
      run: (tx: AccountTransaction) => Promise<T>,
    ): Promise<T> {
      assertUuid(actor.accountId, 'the actor account');
      return inTransaction(actor.accountId, null, (client) =>
        run(accountTransaction(client, actor.accountId)),
      );
    },

    workspace<T>(
      actor: Actor,
      workspaceId: string,
      run: (tx: WorkspaceAdminTransaction) => Promise<T>,
    ): Promise<T> {
      assertUuid(actor.accountId, 'the actor account');
      assertUuid(workspaceId, 'the workspace');
      return inTransaction(actor.accountId, workspaceId, async (client) => {
        const seen = await client.query(
          'select id from workspaces where id = $1',
          [workspaceId],
        );
        if (seen.rowCount === 0)
          throw new WorkspaceUnavailableError(workspaceId);
        return run(workspaceTransaction(client, actor.accountId, workspaceId));
      });
    },

    async accountOf(authUserId: string): Promise<string | null> {
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ account: string | null }>(
          'select notesapp_account_of($1) as account',
          [authUserId],
        );
        return rows.rows[0]?.account ?? null;
      });
    },

    async memberships(accountId: string) {
      assertUuid(accountId, 'the account');
      return inTransaction(accountId, null, async (client) => {
        const rows = await client.query<{ workspace_id: string; role: string }>(
          `select workspace_id, role::text as role
             from memberships where account_id = $1 order by workspace_id`,
          [accountId],
        );
        return rows.rows.map((row) => ({
          workspaceId: row.workspace_id,
          role: asRole(row.role),
        }));
      });
    },

    async useChallenge(digest: string, expiresAt: Date): Promise<boolean> {
      if (!/^[0-9a-f]{64}$/.test(digest))
        throw new OperationalError(
          'unexpected',
          'notesapp: a used challenge is stored as a digest.',
        );
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ first: boolean }>(
          'select notesapp_use_challenge($1, $2) as first',
          [digest, expiresAt],
        );
        return rows.rows[0]?.first ?? false;
      });
    },

    async pruneChallenges(cutoff: Date): Promise<number> {
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ removed: number }>(
          'select notesapp_prune_challenges($1) as removed',
          [cutoff],
        );
        return rows.rows[0]?.removed ?? 0;
      });
    },

    async removePendingIdentities(cutoff: Date): Promise<number> {
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ removed: number }>(
          'select notesapp_remove_pending_identities($1) as removed',
          [cutoff],
        );
        return rows.rows[0]?.removed ?? 0;
      });
    },

    async registrationPolicy(): Promise<RegistrationPolicy> {
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ policy: string }>(
          'select notesapp_registration_policy()::text as policy',
        );
        return asRegistrationPolicy(rows.rows[0]?.policy ?? '');
      });
    },

    async installationSettings(): Promise<StoredInstallationSettings> {
      return inTransaction(null, null, readInstallationSettings);
    },

    async hasAccount(): Promise<boolean> {
      return inTransaction(null, null, async (client) => {
        const rows = await client.query<{ present: boolean }>(
          'select notesapp_has_account() as present',
        );
        return rows.rows[0]?.present ?? false;
      });
    },

    async recordAccountAudit(accountId: string, action: string): Promise<void> {
      assertUuid(accountId, 'the account');
      await inTransaction(accountId, null, (client) =>
        writeAccountAudit(client, accountId, {
          action,
          targetKind: 'account',
          targetId: accountId,
        }),
      );
    },

    async discardAccount(authUserId: string): Promise<boolean> {
      // The function is bound to the account of the transaction, so the
      // identity is set to the account that is being removed. An identity free
      // call would be refused, which is what stops one account from removing
      // another.
      const accountId = await this.accountOf(authUserId);
      if (accountId === null) return false;
      return inTransaction(accountId, null, async (client) => {
        const rows = await client.query<{ discarded: boolean }>(
          'select notesapp_discard_account($1) as discarded',
          [authUserId],
        );
        return rows.rows[0]?.discarded ?? false;
      });
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
