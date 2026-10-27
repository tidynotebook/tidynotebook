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
  storage: { usedBytes: 12 * 1024 ** 2, limitBytes: 5 * 1024 ** 3 },
  month: {
    endsAt: '2026-11-01T00:00:00.000Z',
    downloadsPaused: false,
    uploadsPaused: false,
    publishedTransferBytes: 0,
    downloadedBytes: 0,
  },
  controls: { publishedTransferLimitBytes: null, downloadLimitBytes: null },
};

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
