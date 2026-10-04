/**
 * Storage ports for accounts and workspaces.
 *
 * The core owns these interfaces; the server storage package implements them.
 * They stay free of a database driver and an HTTP framework, so the rules in
 * `service.ts` can be tested with a plain in-memory double.
 *
 * There are two entry points, because the two kinds of change need different
 * locks. An account scoped change touches one account and creates a workspace
 * that no other transaction can see yet. A workspace scoped change takes the
 * same workspace lock as a content write, so the two have a defined order.
 */
import type { Actor, Role } from '../identity/actor.ts';
import type { InstallationRole } from '../identity/installation.ts';
import type { AccountControls } from '../identity/controls.ts';
import type { ConsentRecord, ConsentVersions } from '../identity/legal.ts';

/** The three appearance choices that an account can store. */
export type AppearanceChoice = 'system' | 'light' | 'dark';

/**
 * Settings that follow an account to every device.
 *
 * `themeFamily` names a palette family of the client theme registry. The
 * server keeps the identifier as an opaque slug: the registry lives in the
 * browser package, and a server that knew the palette names would have to be
 * released again for every new theme. `spellCheck` states whether the editor
 * asks the browser to check the spelling of a note (record 0103).
 */
export type Preferences = {
  readonly appearance: AppearanceChoice;
  readonly themeFamily: string;
  readonly spellCheck: boolean;
};

/**
 * The colours of one palette of an imported theme, by the token names of the
 * client theme registry (record 0143).
 *
 * The server keeps them as data. The contract checks that each one is a hex
 * colour, and the client checks their contrast before it paints them.
 */
export type ImportedPalette = {
  readonly tokens: Readonly<Record<string, string>>;
  readonly syntax: Readonly<Record<string, string>>;
};

/** One theme that an account imported, with one palette or two. */
export type ImportedTheme = {
  readonly themeId: string;
  readonly name: string;
  readonly light: ImportedPalette | null;
  readonly dark: ImportedPalette | null;
};

/** A theme to import, before it is checked. */
export type ThemeImport = {
  readonly name: string;
  readonly light: ImportedPalette | null;
  readonly dark: ImportedPalette | null;
};

/** The stored settings of an account with the themes it imported. */
export type AccountSettings = Preferences & {
  readonly themes: readonly ImportedTheme[];
};

/**
 * The settings that one write changes, before they are checked.
 *
 * A member that is absent keeps its stored value, so each setting is written
 * alone and a write never carries a stale value of another (record 0103). A
 * member reaches this package from a request body, so the appearance can be
 * a text that the union does not hold. A caller states what it read and
 * `updatePreferences` decides, instead of claiming a shape that nothing
 * proved.
 */
export type PreferencesChange = {
  readonly appearance?: string | undefined;
  readonly themeFamily?: string | undefined;
  readonly spellCheck?: boolean | undefined;
};

/** What an account reads about itself besides its settings. */
export type AccountOwnStanding = {
  readonly role: InstallationRole;
  readonly usedBytes: bigint;
  readonly limitBytes: bigint;
  /**
   * The controls of the account (record 0189). A locked account reads them
   * too, because the one screen that it opens names them (record 0201).
   */
  readonly controls: AccountControls;
};

/** One session of an account, as the account sees it. It holds no token. */
export type SessionRecord = {
  readonly sessionId: string;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly expiresAt: string;
};

/** One workspace as its member sees it. */
export type WorkspaceSummary = {
  readonly workspaceId: string;
  readonly name: string;
  /** The role of the reading account in this workspace. */
  readonly role: Role;
  /** True for the workspace that was created with the account. */
  readonly personal: boolean;
};

/**
 * Reads and writes that belong to one account.
 *
 * Every call is bound to the actor that opened the transaction. There is no
 * account argument, so a use case cannot read another account's rows by
 * mistake.
 */
export type AccountTransaction = {
  /** Every workspace of the account, with the account's role in each. */
  workspaces(): Promise<readonly WorkspaceSummary[]>;
  /** The current role of the account in each of its workspaces. */
  memberships(): Promise<readonly { workspaceId: string; role: Role }[]>;
  /** The stored settings of the account. */
  preferences(): Promise<Preferences>;
  /**
   * The installation role of the account, the bytes that the workspaces it
   * owns use, and its limit (records 0109, 0112).
   */
  standing(): Promise<AccountOwnStanding>;
  /** Every session of the account that has not expired (record 0122). */
  sessions(): Promise<readonly SessionRecord[]>;
  /** Ends one session of the account. Answers `false` for no such session. */
  revokeSession(sessionId: string): Promise<boolean>;
  /** Ends every session of the account but one, and answers how many. */
  revokeOtherSessions(keepSessionId: string): Promise<number>;
  /** Replaces the stored settings of the account with a checked value. */
  savePreferences(preferences: Preferences): Promise<void>;
  /** The themes that the account imported, oldest first (record 0143). */
  themes(): Promise<readonly ImportedTheme[]>;
  /**
   * The stored settings and the imported themes of the account, read in one
   * statement. A statement reads one snapshot, so a delete of a theme that
   * commits during the read never leaves the answer naming that theme.
   */
  settings(): Promise<AccountSettings>;
  /**
   * Takes the lock of the settings of the account, so two writes of its
   * themes read the count one after the other.
   */
  lockSettings(): Promise<void>;
  /** Keeps one checked theme for the account. */
  addTheme(theme: ImportedTheme): Promise<void>;
  /**
   * Removes one theme of the account, and answers `false` when it has none
   * of that identifier. A theme family that names the theme goes back to the
   * default family in the same write, so no setting names a removed theme.
   */
  removeTheme(themeId: string): Promise<boolean>;
  /** The legal documents that the account accepted, or `null` (0120). */
  consent(): Promise<ConsentRecord | null>;
  /** Stores the consent of the account to two versions, with the time. */
  recordConsent(versions: ConsentVersions): Promise<void>;
  /**
   * Creates a workspace whose only member is the account, as its owner.
   *
   * The call takes the same workspace lock as every other write of that
   * workspace, so the first membership record is ordered with the rest.
   */
  createWorkspace(input: {
    readonly workspaceId: string;
    readonly name: string;
  }): Promise<void>;
  /** Takes the workspace lock inside this transaction. */
  lockWorkspace(workspaceId: string): Promise<void>;
  /** Appends one incremental membership record under the workspace lock. */
  recordMembershipChange(
    workspaceId: string,
    input: { readonly accountId: string; readonly removed: boolean },
  ): Promise<void>;
};

/**
 * Reads and writes of one workspace, under the workspace lock.
 *
 * The lock is the same one that a content write takes, so a workspace change
 * and a content write of one workspace cannot interleave.
 */
export type WorkspaceAdminTransaction = {
  /** The name of the workspace and whether it is a personal one. */
  describe(): Promise<{ name: string; personal: boolean } | null>;
  /** The current role of one account, or `null` for a stranger. */
  role(accountId: string): Promise<Role | null>;
  /**
   * How many workspaces the account of this transaction belongs to.
   *
   * The count is read inside the transaction that deletes a workspace, under
   * the lock that transaction already holds, so two tabs that each delete one
   * of the last two workspaces cannot both pass the check.
   */
  accountWorkspaceCount(): Promise<number>;
  /** Renames the workspace. */
  rename(name: string): Promise<void>;
  /** Deletes the workspace and every record that belongs to it. */
  destroy(): Promise<void>;
  /**
   * Appends one audit record to the account trail of the actor.
   *
   * The trail is not scoped by a workspace, so the record of a deletion
   * survives even when the deleted workspace was the actor's last one. The
   * deleted workspace identifier is the content free target.
   */
  auditAccount(input: { readonly action: string }): Promise<void>;
  /** Appends one incremental change record under the workspace lock. */
  recordMembershipChange(input: {
    readonly accountId: string;
    readonly removed: boolean;
  }): Promise<void>;
};

/** Opens the transactions that the account and workspace use cases need. */
export type WorkspaceAdminStore = {
  /** Runs `run` in one transaction bound to the actor's account. */
  account<T>(
    actor: Actor,
    run: (tx: AccountTransaction) => Promise<T>,
  ): Promise<T>;
  /**
   * Runs `run` in one transaction that holds the workspace lock. The call
   * fails with `WorkspaceUnavailableError` when the workspace does not exist
   * or the actor cannot see it.
   */
  workspace<T>(
    actor: Actor,
    workspaceId: string,
    run: (tx: WorkspaceAdminTransaction) => Promise<T>,
  ): Promise<T>;
};
