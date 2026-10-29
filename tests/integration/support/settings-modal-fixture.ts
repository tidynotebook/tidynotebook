/**
 * The application context of the Settings modal for a test with no server.
 * The modal, its sections, the router state and the sign-out check stay the
 * built application code; only the hooks of `app.tsx` are replaced.
 */
import { themeFamilies } from '@notesapp/ui';

/** What the modal asked of the application. */
export const calls: {
  signOut: number;
  choices: string[];
  families: string[];
} = { signOut: 0, choices: [], families: [] };

/** The saves that wait on this device, or a read that fails. */
let waiting: readonly unknown[] | Error = [];

/** Sets what the store answers for the waiting saves. */
export function setWaiting(next: readonly unknown[] | Error): void {
  waiting = next;
}

const account = {
  accountId: 'account-1',
  name: 'Mira Patel',
  email: 'mira@example.com',
  accountPortal: false,
  mcpAuthorization: false,
  installationRole: 'member',
  storage: { usedBytes: 12_000_000, limitBytes: 5_000_000_000 },
  month: {
    endsAt: '2026-11-01T00:00:00.000Z',
    downloadsPaused: false,
    uploadsPaused: false,
    publishedTransferBytes: 0,
    downloadedBytes: 0,
  },
  controls: { publishedTransferLimitBytes: null, downloadLimitBytes: null },
};

/** Change the role only in this isolated DOM fixture. */
export function setAdministrator(enabled: boolean): void {
  account.installationRole = enabled ? 'administrator' : 'member';
}
const session = {
  status: 'signed-in',
  account,
  error: null,
  refresh: () => {},
  recheck: () => {},
  signOut: () => {
    calls.signOut += 1;
  },
  adoptPreferences: () => {},
  adoptProfileName: () => {},
};

export function useSession() {
  return session;
}

const store = {
  origin: 'http://localhost',
  store: {
    pending: async () => {
      if (waiting instanceof Error) throw waiting;
      return waiting;
    },
  },
  error: null,
};

export function useLocalStore() {
  return store;
}

export function useRequestSync() {
  return () => {};
}

export function useSpellCheck() {
  return true;
}

const workspace = {
  state: {
    status: 'ready',
    workspaceId: 'one',
    workspaces: [{ workspaceId: 'one', name: 'Personal' }],
  },
  reload: () => {},
};

export function useWorkspace() {
  return workspace;
}

const theme = {
  choice: 'system',
  resolved: 'light',
  familyId: 'default',
  families: themeFamilies,
  setChoice: (choice: string) => {
    calls.choices.push(choice);
  },
  setFamily: (family: string) => {
    calls.families.push(family);
  },
  syncError: null,
};

export function useTheme() {
  return theme;
}

export function problemMessage(): string {
  return 'Something went wrong.';
}

let apiKeys: {
  keyId: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: null;
}[] = [];
let refuseCreation = false;
/** Isolate the keys used by the Settings action tests. */
export function resetApiKeys(): void {
  apiKeys = [];
  refuseCreation = false;
}
/** Exercise a server refusal without losing the typed form. */
export function refuseApiKeyCreation(value: boolean): void {
  refuseCreation = value;
}
export async function listApiKeys() {
  return { data: { keys: apiKeys } };
}
export async function createApiKey({
  body,
}: {
  readonly body: { readonly name: string };
}) {
  if (refuseCreation) return { error: { code: 'unavailable' } };
  const key = {
    keyId: crypto.randomUUID(),
    name: body.name,
    createdAt: '2026-10-28T08:00:00.000Z',
    expiresAt: '2027-01-26T08:00:00.000Z',
    lastUsedAt: null,
  };
  apiKeys = [key, ...apiKeys];
  return { data: { key, token: `tnk_${'a'.repeat(43)}` } };
}
export async function revokeApiKey({
  path,
}: {
  readonly path: { readonly keyId: string };
}) {
  apiKeys = apiKeys.filter((key) => key.keyId !== path.keyId);
  return { data: { removed: true } };
}

export { updatePreferences, updateProfile } from '@notesapp/api-client';
const currentSession: import('@notesapp/api-client').AccountSession = {
  sessionId: 'current-session',
  current: true,
  userAgent: 'Firefox/100 Linux',
  createdAt: '2026-10-28T00:00:00.000Z',
  lastActiveAt: '2026-10-28T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
};
let sessions: import('@notesapp/api-client').AccountSession[] = [
  currentSession,
];
export const sessionWrites: string[] = [];
export function setSessions(next: typeof sessions = [currentSession]): void {
  sessions = next;
  sessionWrites.length = 0;
}
export async function listSessions() {
  return { data: { sessions } };
}
export async function revokeOtherSessions() {
  sessionWrites.push('others');
  const revoked = sessions.filter((session) => !session.current).length;
  sessions = sessions.filter((session) => session.current);
  return { data: { revoked } };
}
export async function revokeSession({
  path,
}: {
  readonly path: { readonly sessionId: string };
}) {
  sessionWrites.push(path.sessionId);
  sessions = sessions.filter((session) => session.sessionId !== path.sessionId);
  return { data: { removed: true } };
}
