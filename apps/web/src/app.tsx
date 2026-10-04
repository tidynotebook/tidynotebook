/**
 * Application composition of the notesapp web client.
 *
 * This module wires the maintained pieces together: the generated HTTP
 * client, the IndexedDB local store, the foreground sync engine, and the
 * theme registry. Feature screens consume the providers below and call
 * generated operations directly; there is no second network layer here.
 */
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  connectSyncNotices,
  getAccount,
  getSyncProtocol,
  listWorkspaces,
  syncNoticesProtocol,
  updatePreferences,
  type Account,
  type Preferences,
  type Workspace,
} from '@notesapp/api-client';
import {
  defaultSpellCheck,
  generateUUID,
  isThemeFamilyId,
} from '@notesapp/core';
import { openLocalStore } from '@notesapp/storage-browser';
import {
  createSyncEngine,
  timerSchedule,
  type LocalStore,
  type SyncNotice,
} from '@notesapp/sync';
import {
  appearanceStorageKey,
  applyThemeToDocument,
  defaultThemeFamilyId,
  parseAppearanceChoice,
  resolveAppearance,
  themeFamilyStorageKey,
  themeFor,
  themeOfFamily,
  type Appearance,
  type AppearanceChoice,
  type Theme,
  type ThemeFamily,
} from '@notesapp/ui';
import {
  importedPaletteStorageKey,
  inlineImportedFamily,
  keptImportedFamily,
} from './lib/first-paint.ts';
import {
  cachedThemes,
  chooseableFamilies,
  familyAmong,
  importedFamilies,
  isImportedFamilyId,
} from './lib/imported-themes.ts';
import { createFocusPass } from './lib/focus-pass.ts';
import { displayNoteName } from './lib/note-name.ts';
import {
  chooseWorkspace,
  isMemberOf,
  parseCachedWorkspaces,
  workspaceChoiceKey,
  workspaceListKey,
} from './lib/workspace-choice.ts';
import {
  problemCode,
  problemSentence,
  problemStatus,
} from './lib/problem-text.ts';
import {
  noticeReadsQueue,
  startingSyncState,
  syncQueueOf,
  syncStateOfNotice,
  syncStateOfQueue,
  syncStateOnline,
  type SyncQueue,
  type SyncState,
} from './lib/sync-state.ts';
import { subscribeToSystemTheme, systemPrefersDark } from './platform.ts';
import { webLogger } from './logging.ts';
import { describeStorageFailure, signOutKeepingWork } from './pwa/lifecycle.ts';
import { createSyncSession, type SyncSession } from './pwa/sync-session.ts';
import {
  startTabNotices,
  type TabChannel,
  type TabNotices,
} from './pwa/notices.ts';

/**
 * Turns a generated failure into one plain sentence for the person.
 *
 * The sentence never carries a problem code, a status number, a note
 * identifier, or note content. The code goes to the browser console, where
 * it is available for a report without reaching the screen.
 */
export function problemMessage(error: unknown): string {
  const knownCode = problemCode(error);
  const knownStatus = problemStatus(error);
  if (knownCode !== null)
    webLogger.emit('web.problem', { problemCode: knownCode });
  return problemSentence(knownCode, knownStatus);
}

/** Where the session stands. */
export type SessionStatus = 'loading' | 'signed-in' | 'signed-out';

/** The signed-in account, or why there is none yet. */
export type SessionValue = {
  readonly status: SessionStatus;
  readonly account: Account | null;
  readonly error: string | null;
  readonly refresh: () => void;
  readonly signOut: () => void;
  /**
   * Takes the settings that the account answered after a write, so every
   * screen reads them at once and the next start reads them offline.
   */
  readonly adoptPreferences: (preferences: Preferences) => void;
  /** Applies a saved display name to the avatar and the cached account. */
  readonly adoptProfileName: (name: string) => void;
};

const SessionContext = createContext<SessionValue>({
  status: 'loading',
  account: null,
  error: null,
  refresh: () => {},
  signOut: () => {},
  adoptPreferences: () => {},
  adoptProfileName: () => {},
});

const cachedAccountKey = 'notesapp.cached-account';
const syncWorkerKey = 'notesapp.sync-worker';

/**
 * Reads one member of an unknown stored value.
 *
 * Only own enumerable members count, so an inherited member of a value that
 * another page of this origin wrote cannot pass a check.
 */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  const record: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  return record[key];
}

/**
 * The controls of a cached account, read again from browser storage.
 *
 * Only the standing and the removal time change what this device shows, so
 * the other members take the values of an installation that sets nothing.
 */
function cachedControls(value: unknown, limit: unknown): Account['controls'] {
  const removalAt = readProperty(value, 'removalAt');
  const revision = readProperty(value, 'revision');
  return {
    revision:
      typeof revision === 'number' && Number.isSafeInteger(revision)
        ? revision
        : 1,
    standing:
      readProperty(value, 'standing') === 'locked' ? 'locked' : 'active',
    removalAt: typeof removalAt === 'string' ? removalAt : null,
    limitBytes: typeof limit === 'number' ? limit : 0,
    textLimitBytes: null,
    publishedTransferLimitBytes: null,
    downloadLimitBytes: null,
    features: { teams: true, collaboration: true },
  };
}

/** Reads only a previously validated account shape from browser storage. */
function readCachedAccount(): Account | null {
  try {
    const source = window.localStorage.getItem(cachedAccountKey);
    if (source === null) return null;
    const value: unknown = JSON.parse(source);
    if (value === null || typeof value !== 'object') return null;
    const row: Record<string, unknown> = Object.fromEntries(
      Object.entries(value),
    );
    const appearance = readProperty(row['preferences'], 'appearance');
    const themeFamily = readProperty(row['preferences'], 'themeFamily');
    const spellCheck = readProperty(row['preferences'], 'spellCheck');
    if (
      typeof row['accountId'] !== 'string' ||
      !['system', 'light', 'dark'].includes(String(appearance))
    )
      return null;
    const email = row['email'];
    const name = row['name'];
    if (email !== undefined && email !== null && typeof email !== 'string')
      return null;
    if (name !== undefined && name !== null && typeof name !== 'string')
      return null;
    // An account cached by an earlier release holds no installation role and
    // no storage. It reads as a member with unknown usage until the server
    // answers, so no administrator screen opens from a stale cache.
    const role = row['installationRole'];
    const used = readProperty(row['storage'], 'usedBytes');
    const limit = readProperty(row['storage'], 'limitBytes');
    return {
      accountId: row['accountId'],
      email: email ?? null,
      name: name ?? null,
      installationRole: role === 'administrator' ? 'administrator' : 'member',
      storage: {
        usedBytes: typeof used === 'number' ? used : 0,
        limitBytes: typeof limit === 'number' ? limit : 0,
      },
      preferences: {
        appearance:
          appearance === 'light' || appearance === 'dark'
            ? appearance
            : 'system',
        themeFamily:
          typeof themeFamily === 'string' && themeFamily !== ''
            ? themeFamily
            : defaultThemeFamilyId,
        // An account cached by an earlier release holds no spell check.
        spellCheck:
          typeof spellCheck === 'boolean' ? spellCheck : defaultSpellCheck,
        // Each cached theme passes the reader of a theme file again (0143).
        themes: cachedThemes(readProperty(row['preferences'], 'themes')),
      },
      // An account cached by an earlier release holds no consent state. The
      // next read of the account answers it (record 0120).
      consentRequired: row['consentRequired'] === true,
      // An account cached by an earlier release holds no controls. It reads
      // as active with no new limit until the server answers (record 0189),
      // and a cached locked account stays locked.
      controls: cachedControls(row['controls'], limit),
      accountPortal: row['accountPortal'] === true,
    };
  } catch {
    return null;
  }
}

function rememberAccount(account: Account | null): void {
  try {
    if (account === null) window.localStorage.removeItem(cachedAccountKey);
    else window.localStorage.setItem(cachedAccountKey, JSON.stringify(account));
  } catch {
    // The live session remains usable when browser preference storage fails.
  }
}

/** Keeps one lease owner through reloads, but not across independent tabs. */
function syncWorkerId(): string {
  try {
    const stored = window.sessionStorage.getItem(syncWorkerKey);
    if (stored !== null && stored !== '') return stored;
    const created = generateUUID();
    window.sessionStorage.setItem(syncWorkerKey, created);
    return created;
  } catch {
    return generateUUID();
  }
}

const SyncSessionContext = createContext<SyncSession | null>(null);

/** The notices of this tab and its account, or `null` before both exist. */
const NoticesContext = createContext<TabNotices | null>(null);

/** One channel between the tabs of this browser profile. */
function browserChannel(name: string): TabChannel {
  // A browser without the channel serves only its own tab, as before.
  if (typeof BroadcastChannel === 'undefined')
    return { post: () => {}, onMessage: () => {}, close: () => {} };
  const channel = new BroadcastChannel(name);
  return {
    post: (message) => {
      channel.postMessage(message);
    },
    onMessage: (listener) => {
      channel.onmessage = (event: MessageEvent<unknown>): void => {
        listener(event.data);
      };
    },
    close: () => {
      channel.close();
    },
  };
}

/** Whether this server offers the notice stream now (record 0130). */
async function noticesOffered(): Promise<boolean> {
  const answer = await getSyncProtocol();
  // A server that predates the member, and one that offers another
  // subprotocol, leave this tab on its poll interval.
  return (answer.data?.notificationProtocols ?? []).includes(
    syncNoticesProtocol,
  );
}

/**
 * Runs the notices of this tab for one account (record 0130).
 *
 * The notices hold the sender lease of the tab, so the engines of the tab
 * start only once they exist, and the lease is given back when the account
 * changes, the tab closes, or an update stops the sync session.
 */
function useTabNotices(
  store: LocalStore | null,
  accountId: string | null,
  syncSession: SyncSession,
): TabNotices | null {
  const [notices, setNotices] = useState<TabNotices | null>(null);
  useEffect(() => {
    if (store === null || accountId === null) {
      setNotices(null);
      return;
    }
    const tab = startTabNotices({
      store,
      accountId,
      tabId: syncSession.ownerId,
      channel: browserChannel,
      offered: noticesOffered,
      connect: (handlers) =>
        connectSyncNotices(window.location.origin, handlers),
      schedule: timerSchedule,
      clock: Date.now,
      random: Math.random,
    });
    let stopped: Promise<void> | null = null;
    const stop = (): Promise<void> => {
      stopped ??= tab.stop();
      return stopped;
    };
    let finish: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const unregister = syncSession.register({
      stop: () => {
        void stop().then(finish, finish);
      },
      finished,
    });
    // A closed tab gives the lease back at once, so another tab takes over
    // without waiting for the lease to expire.
    const onHide = (): void => {
      void stop();
    };
    window.addEventListener('pagehide', onHide);
    setNotices(tab);
    return () => {
      window.removeEventListener('pagehide', onHide);
      unregister();
      void stop().then(finish, finish);
      setNotices(null);
    };
  }, [store, accountId, syncSession]);
  return notices;
}

/** Reads the shared sync identity and running engines of this browser tab. */
export function useSyncSession(): SyncSession {
  const session = useContext(SyncSessionContext);
  if (session === null)
    throw new Error('The sync session provider is not available.');
  return session;
}

/** Reads the current session value. */
export function useSession(): SessionValue {
  return useContext(SessionContext);
}

/** Loads the account once and reloads it whenever `generation` changes. */
function useSessionLoader(generation: number): {
  readonly status: SessionStatus;
  readonly account: Account | null;
  readonly error: string | null;
  readonly adoptPreferences: (preferences: Preferences) => void;
  readonly adoptProfileName: (name: string) => void;
} {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setStatus('loading');
      setError(null);
      const result = await getAccount();
      if (cancelled) return;
      if (result.error !== undefined || result.data === undefined) {
        const responseStatus = result.response?.status ?? 0;
        if (responseStatus === 401) {
          rememberAccount(null);
          setAccount(null);
          setStatus('signed-out');
          return;
        }
        const cached = readCachedAccount();
        if (
          cached !== null &&
          (responseStatus === 0 || responseStatus >= 500)
        ) {
          setAccount(cached);
          setStatus('signed-in');
          setError('The account is offline. Local notes remain available.');
          return;
        }
        setAccount(null);
        setStatus('signed-out');
        setError(problemMessage(result.error));
        return;
      }
      rememberAccount(result.data);
      setAccount(result.data);
      setStatus('signed-in');
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [generation]);

  const adoptPreferences = useCallback((preferences: Preferences): void => {
    setAccount((current) =>
      current === null ? null : { ...current, preferences },
    );
  }, []);

  const adoptProfileName = useCallback((name: string): void => {
    setAccount((current) => (current === null ? null : { ...current, name }));
  }, []);

  // The cached account follows the settings that a write returned, so a start
  // with no connection reads the settings of the last write.
  useEffect(() => {
    if (status === 'signed-in' && account !== null) rememberAccount(account);
  }, [status, account]);

  return { status, account, error, adoptPreferences, adoptProfileName };
}

/**
 * Whether the editor checks the spelling of a note (record 0103).
 *
 * The setting follows the account. It reads the cached account when there is
 * no connection, and the default before any account arrives.
 */
export function useSpellCheck(): boolean {
  return (
    useContext(SessionContext).account?.preferences.spellCheck ??
    defaultSpellCheck
  );
}

/** Where the workspaces of this account stand. */
export type WorkspaceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready';
      /**
       * The workspace this device chose.
       *
       * It is where the root address goes, and nothing else. The workspace a
       * screen is showing is the one in its address.
       */
      readonly workspaceId: string;
      /** Every workspace of the account, as the switcher lists them. */
      readonly workspaces: readonly Workspace[];
      /**
       * How many times this list has been settled.
       *
       * A caller that asks for the list again has to know whether the answer
       * it is reading arrived before or after its question. Comparing this
       * number is exact, where comparing the contents is a guess.
       */
      readonly revision: number;
    };

/** The workspaces of the account and the ways the list changes. */
export type WorkspaceValue = {
  readonly state: WorkspaceState;
  /** Asks the server for the list again. */
  readonly reload: () => void;
  /**
   * Records one workspace of the account as the choice of this device.
   *
   * The address is the one thing that says which workspace is open, so this
   * is called from exactly one place: the membership check that every
   * workspace route passes through. A screen that wants another workspace
   * navigates to it and the address does the rest. Two writers of this fact
   * would race, and one of them would win by accident.
   *
   * A workspace the account does not hold is ignored, so a stale address
   * cannot move the choice (record 0049).
   */
  readonly remember: (workspaceId: string) => void;
  /**
   * Takes a workspace that the server has just created into the list.
   *
   * The create operation answers with the whole workspace, so throwing that
   * answer away and asking for the list again would only make the caller wait
   * for something it already holds, and would leave a window in which the
   * address names a workspace this device does not know. The list is a cache
   * of a server fact, and this is that fact.
   */
  readonly adopt: (workspace: Workspace) => void;
  /** Drops a workspace that the server has just deleted, for the same reason. */
  readonly forget: (workspaceId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceValue>({
  state: { status: 'loading' },
  reload: () => {},
  remember: () => {},
  adopt: () => {},
  forget: () => {},
});

/**
 * Reads the workspaces of the signed-in account.
 *
 * Every screen that needs a workspace reads it here. The list operation runs
 * once for the session instead of once for every screen that mounts.
 */
export function useWorkspace(): WorkspaceValue {
  return useContext(WorkspaceContext);
}

/** Reads one local settings value, for a start with no connection. */
function readStored(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null || stored === '' ? null : stored;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The live workspace stays usable when cache storage fails.
  }
}

/**
 * Loads the workspaces of the signed-in account and the one to open.
 *
 * `chooseWorkspace` decides which one that is: the choice of this device, then
 * the personal workspace, then the first the server named. A network failure
 * falls back to the cached list of this account, which keeps the switcher and
 * the offline notes reachable after a reload. An empty answer from a server
 * that did answer is a failed read and not an empty account, because record
 * 0051 stops an account from reaching that state.
 */
function useWorkspaceLoader(
  status: SessionStatus,
  accountId: string | null,
  generation: number,
): Omit<WorkspaceValue, 'reload'> {
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' });

  useEffect(() => {
    if (status !== 'signed-in' || accountId === null) {
      setState({ status: 'loading' });
      return;
    }
    const activeAccount = accountId;
    let cancelled = false;

    /** Settles on one list, whether it came from the server or the cache. */
    const settle = (workspaces: readonly Workspace[]): void => {
      const chosen = chooseWorkspace(
        workspaces,
        readStored(workspaceChoiceKey(activeAccount)),
      );
      if (chosen === null) {
        setState({
          status: 'error',
          message: 'Your notes did not open. Try again.',
        });
        return;
      }
      writeStored(workspaceChoiceKey(activeAccount), chosen.workspaceId);
      setState((current) => ({
        status: 'ready',
        workspaceId: chosen.workspaceId,
        workspaces,
        revision: (current.status === 'ready' ? current.revision : 0) + 1,
      }));
    };

    async function load(): Promise<void> {
      setState({ status: 'loading' });
      const result = await listWorkspaces();
      if (cancelled) return;
      if (result.error !== undefined || result.data === undefined) {
        const cached = parseCachedWorkspaces(
          readStored(workspaceListKey(activeAccount)),
        );
        const responseStatus = result.response?.status ?? 0;
        if (
          cached.length > 0 &&
          (responseStatus === 0 || responseStatus >= 500)
        )
          settle(cached);
        else
          setState({ status: 'error', message: problemMessage(result.error) });
        return;
      }
      const workspaces = result.data.workspaces;
      writeStored(workspaceListKey(activeAccount), JSON.stringify(workspaces));
      settle(workspaces);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, accountId, generation]);

  const remember = useCallback(
    (workspaceId: string): void => {
      if (accountId === null) return;
      setState((current) => {
        // A workspace the account does not hold never becomes the choice, so
        // one check answers both the switcher and a stale address.
        if (
          current.status !== 'ready' ||
          !isMemberOf(current.workspaces, workspaceId)
        )
          return current;
        // The same choice answers the same state. A new object here would be
        // a new value for every consumer, and a caller that records the
        // address on each render would never settle.
        if (current.workspaceId === workspaceId) return current;
        writeStored(workspaceChoiceKey(accountId), workspaceId);
        return { ...current, workspaceId };
      });
    },
    [accountId],
  );

  /** Replaces the list with one the caller derived from a server answer. */
  const replaceList = useCallback(
    (
      change: (workspaces: readonly Workspace[]) => readonly Workspace[],
    ): void => {
      if (accountId === null) return;
      setState((current) => {
        if (current.status !== 'ready') return current;
        const workspaces = change(current.workspaces);
        if (workspaces === current.workspaces) return current;
        const chosen = chooseWorkspace(
          workspaces,
          readStored(workspaceChoiceKey(accountId)),
        );
        if (chosen === null)
          return {
            status: 'error',
            message: 'Your notes did not open. Try again.',
          };
        writeStored(workspaceListKey(accountId), JSON.stringify(workspaces));
        writeStored(workspaceChoiceKey(accountId), chosen.workspaceId);
        return {
          status: 'ready',
          workspaceId: chosen.workspaceId,
          workspaces,
          // The list changed, so a caller waiting on an answer has one.
          revision: current.revision + 1,
        };
      });
    },
    [accountId],
  );

  const adopt = useCallback(
    (workspace: Workspace): void => {
      replaceList((workspaces) =>
        isMemberOf(workspaces, workspace.workspaceId)
          ? workspaces
          : [...workspaces, workspace],
      );
    },
    [replaceList],
  );

  const forget = useCallback(
    (workspaceId: string): void => {
      replaceList((workspaces) =>
        isMemberOf(workspaces, workspaceId)
          ? workspaces.filter((one) => one.workspaceId !== workspaceId)
          : workspaces,
      );
    },
    [replaceList],
  );

  return { state, remember, adopt, forget };
}

/** What the sync engine of the open workspace reports and accepts. */
export type SyncValue = {
  /** Where sync stands, as a typed value the view selects copy from. */
  readonly state: SyncState;
  /** The note the state speaks about, when the local list knew its name. */
  readonly noteName: string | null;
  /** Asks the engine for a pass without waiting for its interval. */
  readonly requestSync: () => void;
};

/** The local store of one server origin, once it is open. */
export type StoreValue = {
  readonly origin: string;
  readonly store: LocalStore | null;
  readonly error: string | null;
};

const StoreContext = createContext<StoreValue>({
  origin: '',
  store: null,
  error: null,
});

/** Reads the local store value. */
export function useLocalStore(): StoreValue {
  return useContext(StoreContext);
}

/** Opens the IndexedDB store of the page origin once. */
function useStoreLoader(origin: string): StoreValue {
  const [store, setStore] = useState<LocalStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function open(): Promise<void> {
      try {
        const opened = await openLocalStore(origin);
        if (!cancelled) setStore(opened);
        else await opened.close();
      } catch (failure: unknown) {
        // The person reads one sentence about the cause and what to do, and
        // never the notice of the storage engine.
        if (!cancelled) setError(describeStorageFailure(failure));
      }
    }
    void open();
    return () => {
      cancelled = true;
    };
  }, [origin]);

  return useMemo(() => ({ origin, store, error }), [origin, store, error]);
}

/** The appearance choice, the theme family, and the palette in force. */
export type ThemeValue = {
  readonly choice: AppearanceChoice;
  readonly resolved: Appearance;
  /** The identifier of the chosen family, for example `tokyo-night`. */
  readonly familyId: string;
  /** Every family to choose: the registry, then the imported (0143). */
  readonly families: readonly ThemeFamily[];
  /** The palette that the document renders with right now. */
  readonly theme: Theme;
  readonly setChoice: (choice: AppearanceChoice) => void;
  readonly setFamily: (familyId: string) => void;
  /** Why the choice did not reach the account, when that happened. */
  readonly syncError: string | null;
};

const startingTheme = themeFor(defaultThemeFamilyId, 'dark');

const ThemeContext = createContext<ThemeValue>({
  choice: 'system',
  resolved: 'dark',
  familyId: startingTheme.family,
  families: chooseableFamilies([]),
  theme: startingTheme,
  setChoice: () => {},
  setFamily: () => {},
  syncError: null,
});

/** Reads the theme value. */
export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** Reads one local settings value without trusting its shape. */
function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Reads a stored family identifier by its shape alone.
 *
 * An imported theme arrives with the account after the first render, so the
 * registry cannot decide yet. A family that names nothing paints the default
 * family, and the effective family is decided when the families are known.
 */
function parseFamilySetting(value: string | null | undefined): string {
  return typeof value === 'string' && isThemeFamilyId(value)
    ? value
    : defaultThemeFamilyId;
}

/**
 * Owns the appearance choice and the theme family.
 *
 * Both are stored locally first so the next paint is already correct, then
 * synced to the account in the background without delaying the local change.
 * A failed sync keeps the local choice and reports it; it never rolls the
 * visible theme back. A device that has never chosen adopts the settings of
 * the account, so a second device opens in the palette of the first.
 */
function useThemeLoader(stored: Preferences | null): ThemeValue {
  const [choice, setChoiceState] = useState<AppearanceChoice>(() =>
    parseAppearanceChoice(readSetting(appearanceStorageKey)),
  );
  const [storedFamilyId, setFamilyState] = useState<string>(() =>
    parseFamilySetting(readSetting(themeFamilyStorageKey)),
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);
  const [syncError, setSyncError] = useState<string | null>(null);
  const resolved = resolveAppearance(choice, prefersDark);
  // Until the account answers, the imported theme that this device chose
  // stands in for the themes of the account, so the page keeps the palette of
  // the first paint (record 0143).
  const [kept] = useState<ThemeFamily | null>(() =>
    keptImportedFamily(
      readSetting(importedPaletteStorageKey),
      parseFamilySetting(readSetting(themeFamilyStorageKey)),
    ),
  );
  const families = useMemo(
    () =>
      chooseableFamilies(
        stored === null
          ? kept === null
            ? []
            : [kept]
          : importedFamilies(stored.themes),
      ),
    [stored, kept],
  );
  const family = familyAmong(families, storedFamilyId);
  const familyId = family.id;
  const theme = themeOfFamily(family, resolved);

  // The script of the first paint reads the chosen imported theme from this
  // device, because the account arrives after it (record 0143).
  useEffect(() => {
    try {
      if (isImportedFamilyId(family.id))
        window.localStorage.setItem(
          importedPaletteStorageKey,
          inlineImportedFamily(family),
        );
      else window.localStorage.removeItem(importedPaletteStorageKey);
    } catch {
      // The palette still applies below. Only the next first paint differs.
    }
  }, [family]);

  useEffect(() => {
    return subscribeToSystemTheme(setPrefersDark);
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  // The account settings arrive after the first paint. They apply only when
  // this device never chose, so a local choice is never overwritten by an
  // older one from the account.
  useEffect(() => {
    if (stored === null) return;
    if (readSetting(appearanceStorageKey) === null)
      setChoiceState(parseAppearanceChoice(stored.appearance));
    if (readSetting(themeFamilyStorageKey) === null)
      setFamilyState(parseFamilySetting(stored.themeFamily));
  }, [stored]);

  const store = useCallback(
    (nextChoice: AppearanceChoice, nextFamily: string): boolean => {
      try {
        window.localStorage.setItem(appearanceStorageKey, nextChoice);
        window.localStorage.setItem(themeFamilyStorageKey, nextFamily);
        return true;
      } catch {
        setSyncError('The theme could not be stored on this device.');
        return false;
      }
    },
    [],
  );

  const publish = useCallback(
    (nextChoice: AppearanceChoice, nextFamily: string): void => {
      if (!store(nextChoice, nextFamily)) return;
      async function sync(): Promise<void> {
        const result = await updatePreferences({
          body: { appearance: nextChoice, themeFamily: nextFamily },
        });
        if (result.error !== undefined)
          setSyncError(
            'The theme is set on this device but not on your account yet.',
          );
        else setSyncError(null);
      }
      void sync();
    },
    [store],
  );

  const setChoice = useCallback(
    (next: AppearanceChoice) => {
      setChoiceState(next);
      publish(next, familyId);
    },
    [publish, familyId],
  );

  const setFamily = useCallback(
    (next: string) => {
      const known = familyAmong(families, next).id;
      setFamilyState(known);
      publish(choice, known);
    },
    [publish, choice, families],
  );

  return useMemo(
    () => ({
      choice,
      resolved,
      familyId,
      families,
      theme,
      setChoice,
      setFamily,
      syncError,
    }),
    [
      choice,
      resolved,
      familyId,
      families,
      theme,
      setChoice,
      setFamily,
      syncError,
    ],
  );
}

/**
 * Runs the foreground sync engine of the workspace the person is reading.
 *
 * Returns the typed sync state. The engine only announces changes, so the
 * returned state stays until the next announcement. The view selects the
 * sentence from the state; no screen reads engine prose.
 *
 * This is the one engine that speaks to the person. A workspace that is not
 * open drains through `useBackgroundSync` below and says nothing.
 */
export function useWorkspaceSync(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string | null,
): SyncValue {
  const [state, setState] = useState<SyncState>(startingSyncState);
  const [noteName, setNoteName] = useState<string | null>(null);
  const syncSession = useSyncSession();
  const notices = useContext(NoticesContext);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    if (
      store === null ||
      accountId === null ||
      workspaceId === null ||
      notices === null
    ) {
      setState(startingSyncState);
      setNoteName(null);
      return;
    }
    const activeStore = store;
    const activeAccount = accountId;
    const activeWorkspace = workspaceId;
    const controller = new AbortController();
    // The last queue this hook read. A notice states its state through it at
    // once, so a send of one note never reads as "everything is saved" for
    // a moment while a parked save still waits.
    let queue: SyncQueue | null = null;
    const onNotice = (notice: SyncNotice): void => {
      // A paused session cannot send for this account. The lease goes to a
      // tab that can, so a tab of another account is not kept waiting.
      if (notice.kind === 'paused') void notices.suspend();
      const next = syncStateOfNotice(notice);
      if (next !== null) {
        setState(queue === null ? next : syncStateOfQueue(next, queue));
        setNoteName(
          next.kind === 'delete-refused' ? displayNoteName(next.path) : null,
        );
      }
      // A send, a refusal, a pull, and a session that serves the engine again
      // each change the queue or prove the connection, and nothing else may
      // announce for a while, so the queue states where the work stands.
      if (noticeReadsQueue(notice)) readQueue();
    };
    const engine = createSyncEngine(store, accountId, workspaceId, {
      announce: onNotice,
      ownerId: syncSession.ownerId,
      lease: notices.gate,
      interval: notices.interval,
    });
    const requestSync = (): void => {
      engine.requestSync();
    };
    wake.current = requestSync;
    // A notice of this workspace wakes this engine, and the other tabs learn
    // that this tab reads it.
    const unregisterWake = notices.register(workspaceId, requestSync);
    notices.open(workspaceId);
    /**
     * Reports what the queue of this device holds right now.
     *
     * The engine announces only what it did, so a device with nothing to
     * send never reports anything. The queue fills that gap and keeps a
     * quiet state honest: a queued save means a send is in progress, a
     * parked save waits for the person, and an empty queue means everything
     * reached the server.
     */
    const readQueue = (): void => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setState({ kind: 'waiting' });
        return;
      }
      void activeStore
        .pending(activeAccount, activeWorkspace)
        .then((entries) => {
          if (controller.signal.aborted) return;
          queue = syncQueueOf(entries);
          const read = queue;
          setState((current) => syncStateOfQueue(current, read));
        })
        .catch(() => {
          // A queue that cannot be read changes nothing the person needs to
          // act on; the engine reports a real failure on its own.
        });
    };
    const unsubscribe = store.subscribe((change) => {
      if (
        change.accountId === accountId &&
        change.workspaceId === workspaceId &&
        change.kind === 'queue'
      ) {
        readQueue();
        requestSync();
      }
    });
    const onOnline = (): void => {
      setState(syncStateOnline);
      readQueue();
      requestSync();
    };
    const onOffline = (): void => {
      setState({ kind: 'waiting' });
    };
    // A tab that comes back to the screen asks for a pass. `focus` alone is
    // not enough: a browser gives a tab that becomes visible again only the
    // visibility event, so a person who returns to the tab would otherwise
    // wait for the safety interval. One return often sends both events, and a
    // person who moves between two windows returns again soon, so the bound in
    // `lib/focus-pass.ts` holds the ask to one pass for each quiet period.
    const focusPass = createFocusPass();
    const onReturn = (): void => {
      if (focusPass.ask(Date.now())) requestSync();
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') onReturn();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onVisible);
    readQueue();
    const running = engine.run(controller.signal);
    const unregister = syncSession.register({
      stop: () => {
        controller.abort();
        engine.stop();
      },
      finished: running,
    });
    void running.catch(() => {
      setState({ kind: 'stopped' });
    });
    return () => {
      unregisterWake();
      notices.open(null);
      unregister();
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onVisible);
      controller.abort();
      engine.stop();
      wake.current = () => {};
    };
  }, [store, accountId, workspaceId, syncSession, notices]);

  const requestSync = useCallback((): void => {
    wake.current();
  }, []);
  return useMemo(
    () => ({ state, noteName, requestSync }),
    [state, noteName, requestSync],
  );
}

/**
 * Drains every workspace of the account that still holds queued work.
 *
 * A save is durable when it reaches the local store and it reaches the server
 * when the engine of its workspace sends it. A person who writes in one
 * workspace and switches to another must not leave that save on the device,
 * so record 0050 keeps an engine running for every workspace with a queue
 * until the queue drains.
 *
 * The open workspace is excluded here, because `useWorkspaceSync` already
 * serves it. That is the one rule this hook has to hold: two engines on one
 * workspace in one tab would both submit its queue. The exclusion is done in
 * one place, over the same identifier the shell opens, so no caller can forget
 * it.
 *
 * A background engine is quiet. It announces nothing to the person, because
 * the sidebar speaks about the workspace that is open.
 */
export function useBackgroundSync(
  store: LocalStore | null,
  accountId: string | null,
  openWorkspaceId: string | null,
  syncSession: SyncSession,
  notices: TabNotices | null,
): void {
  const [queued, setQueued] = useState<readonly string[]>([]);
  const [served, setServed] = useState<readonly string[]>([]);

  // The workspaces that other tabs read, which this tab serves while it
  // holds the lease (record 0130).
  useEffect(() => {
    if (notices === null) {
      setServed([]);
      return;
    }
    setServed(notices.served());
    return notices.onServed(() => {
      setServed(notices.served());
    });
  }, [notices]);

  useEffect(() => {
    notices?.queued(queued);
  }, [notices, queued]);

  // Which workspaces hold work. The local store publishes a queue change on
  // every enqueue and every acknowledgment, so the set follows the queue
  // without a poll of its own.
  useEffect(() => {
    if (store === null || accountId === null) {
      setQueued([]);
      return;
    }
    const activeStore = store;
    const activeAccount = accountId;
    let cancelled = false;
    const read = (): void => {
      void activeStore
        .queuedWorkspaces(activeAccount)
        .then((workspaces) => {
          if (cancelled) return;
          // The identity of the array decides whether the engines below are
          // torn down, so an unchanged set keeps the running engines alive.
          setQueued((current) =>
            current.length === workspaces.length &&
            current.every((id) => workspaces.includes(id))
              ? current
              : workspaces,
          );
        })
        .catch(() => {
          // A queue that cannot be read changes nothing the person can act
          // on. The open workspace reports a real storage failure already.
        });
    };
    const unsubscribe = activeStore.subscribe((change) => {
      if (change.accountId === activeAccount && change.kind === 'queue') read();
    });
    read();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store, accountId]);

  const background = useMemo(
    () =>
      [...new Set([...queued, ...served])].filter(
        (workspaceId) => workspaceId !== openWorkspaceId,
      ),
    [queued, served, openWorkspaceId],
  );
  // The joined key and not the array, so a re-read that answers the same set
  // does not stop and start every engine.
  const backgroundKey = background.join(' ');

  useEffect(() => {
    if (
      store === null ||
      accountId === null ||
      notices === null ||
      backgroundKey === ''
    )
      return;
    const controller = new AbortController();
    const runs = backgroundKey.split(' ').map((workspaceId) => {
      const engine = createSyncEngine(store, accountId, workspaceId, {
        // A background engine says nothing. The person is reading another
        // workspace, and a sentence about this one would name a note they
        // cannot see.
        announce: () => {},
        ownerId: syncSession.ownerId,
        lease: notices.gate,
        interval: notices.interval,
      });
      const unregisterWake = notices.register(workspaceId, () => {
        engine.requestSync();
      });
      const finished = engine
        .run(controller.signal)
        .catch(() => {
          // The workspace keeps its queue and the next pass tries again. The
          // work is durable in the local store either way.
        })
        .finally(unregisterWake);
      return { engine, finished };
    });
    const unregister = syncSession.register({
      stop: () => {
        controller.abort();
        for (const run of runs) run.engine.stop();
      },
      finished: Promise.all(runs.map((run) => run.finished)).then(
        () => undefined,
      ),
    });
    return () => {
      unregister();
      controller.abort();
      for (const run of runs) run.engine.stop();
    };
  }, [store, accountId, backgroundKey, syncSession, notices]);
}

/**
 * Deletes the idle data of every other account when an account signs in.
 *
 * One browser profile serves the account of its session (record 0113). The
 * partitions of an absent account that hold no work leave the device, and a
 * partition with work waits out of view for its own account. Only an account
 * that the server confirmed counts: a start with no connection reads the
 * cached account, and the cookie of the browser may name another one.
 */
export function useIdleAccountReset(
  store: LocalStore | null,
  confirmedAccountId: string | null,
): void {
  useEffect(() => {
    if (store === null || confirmedAccountId === null) return;
    void store.clearIdleAccounts(confirmedAccountId).catch(() => {
      // The data stays until the next sign-in tries again. A failed reset
      // takes nothing from the person who is signed in.
    });
  }, [store, confirmedAccountId]);
}

const SyncContext = createContext<SyncValue>({
  state: startingSyncState,
  noteName: null,
  requestSync: () => {},
});

/** Reads the sync state of the open notes area. */
export function useSyncState(): SyncValue {
  return useContext(SyncContext);
}

/**
 * The ask for a pass alone. It never changes, so a screen that only asks,
 * such as the open note, renders nothing when the state of sync changes
 * (record 0175).
 */
const SyncRequestContext = createContext<() => void>(() => {});

/** Publishes the sync state of the open workspace to the screens below. */
export function SyncProvider({
  value,
  children,
}: {
  readonly value: SyncValue;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <SyncContext.Provider value={value}>
      <SyncRequestContext.Provider value={value.requestSync}>
        {children}
      </SyncRequestContext.Provider>
    </SyncContext.Provider>
  );
}

/**
 * Asks the sync engine for a pass now.
 *
 * A screen calls this after it changed workspace state through the server, so
 * the local cache follows at once instead of at the next safety interval.
 */
export function useRequestSync(): () => void {
  return useContext(SyncRequestContext);
}

/**
 * Provides session, workspace, store, and theme to the whole application.
 *
 * The `key` of the `SessionScope` below is the account ID: when the account
 * changes, every screen remounts and no private state leaks across accounts.
 */
export function AppProviders({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const origin = useMemo(() => window.location.origin, []);
  const syncSession = useMemo(() => createSyncSession(syncWorkerId()), []);
  const storeValue = useStoreLoader(origin);
  const [generation, setGeneration] = useState(0);
  const session = useSessionLoader(generation);
  const theme = useThemeLoader(session.account?.preferences ?? null);
  const [workspaceGeneration, setWorkspaceGeneration] = useState(0);
  const {
    state: workspaceState,
    remember: rememberWorkspace,
    adopt: adoptWorkspace,
    forget: forgetWorkspace,
  } = useWorkspaceLoader(
    session.status,
    session.account?.accountId ?? null,
    workspaceGeneration,
  );

  // Record 0050. The drain sits here and not in the shell, so a workspace that
  // still holds queued work keeps sending while the person reads another
  // workspace, and while they are on a screen that has no shell at all.
  const notices = useTabNotices(
    storeValue.store,
    session.account?.accountId ?? null,
    syncSession,
  );
  useBackgroundSync(
    storeValue.store,
    session.account?.accountId ?? null,
    workspaceState.status === 'ready' ? workspaceState.workspaceId : null,
    syncSession,
    notices,
  );
  useIdleAccountReset(
    storeValue.store,
    session.status === 'signed-in' && session.error === null
      ? (session.account?.accountId ?? null)
      : null,
  );

  const refresh = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  // Stable, because a caller reads it in an effect. A new function on every
  // render would make that effect run on every render.
  const reloadWorkspaces = useCallback(() => {
    setWorkspaceGeneration((current) => current + 1);
  }, []);

  const signedOutStore = storeValue.store;
  const doSignOut = useCallback(() => {
    async function end(): Promise<void> {
      rememberAccount(null);
      await signOutKeepingWork(signedOutStore);
      refresh();
    }
    void end();
  }, [refresh, signedOutStore]);

  const sessionValue = useMemo<SessionValue>(
    () => ({
      status: session.status,
      account: session.account,
      error: session.error,
      refresh,
      signOut: doSignOut,
      adoptPreferences: session.adoptPreferences,
      adoptProfileName: session.adoptProfileName,
    }),
    [session, refresh, doSignOut],
  );

  const workspaceValue = useMemo<WorkspaceValue>(
    () => ({
      state: workspaceState,
      reload: reloadWorkspaces,
      remember: rememberWorkspace,
      adopt: adoptWorkspace,
      forget: forgetWorkspace,
    }),
    [
      workspaceState,
      reloadWorkspaces,
      rememberWorkspace,
      adoptWorkspace,
      forgetWorkspace,
    ],
  );

  const themeValue = useMemo<ThemeValue>(() => theme, [theme]);

  return (
    <ThemeContext.Provider value={themeValue}>
      <StoreContext.Provider value={storeValue}>
        <SessionContext.Provider value={sessionValue}>
          <WorkspaceContext.Provider value={workspaceValue}>
            <SyncSessionContext.Provider value={syncSession}>
              <NoticesContext.Provider value={notices}>
                <SessionScope
                  accountKey={session.account?.accountId ?? 'signed-out'}
                >
                  {children}
                </SessionScope>
              </NoticesContext.Provider>
            </SyncSessionContext.Provider>
          </WorkspaceContext.Provider>
        </SessionContext.Provider>
      </StoreContext.Provider>
    </ThemeContext.Provider>
  );
}

/**
 * Remounts its children whenever the signed-in account changes.
 *
 * The key rides on a fragment, so the application tree gets a new identity
 * without a node in the layout. React compares the key of the one child it
 * holds: a new account gives a new key, so React drops the whole tree below
 * and builds it again. Every store, cache, and screen state of the account
 * that left goes with it.
 */
function SessionScope({
  accountKey,
  children,
}: {
  readonly accountKey: string;
  readonly children: ReactNode;
}): ReactNode {
  return <Fragment key={accountKey}>{children}</Fragment>;
}
