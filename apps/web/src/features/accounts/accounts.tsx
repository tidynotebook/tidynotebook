/**
 * Account screens: first-run setup, login, and settings.
 *
 * Settings is the one place for the profile, the palette, offline
 * availability, and sign-out. Theme changes apply locally first and sync in
 * the background through the provider in `app.tsx`.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, useNavigate } from 'react-router';
import {
  createOwner,
  getSetupStatus,
  signInWithPassword,
} from '@notesapp/api-client';
import type { LocalStore } from '@notesapp/sync';
import {
  Button,
  Card,
  CheckIcon,
  ChevronLeftIcon,
  ComputerIcon,
  MoonIcon,
  Notice,
  Page,
  pageGutter,
  PageHeader,
  StatusRegion,
  SunIcon,
  TextField,
  themeFamilies,
  themeOfFamily,
  WorkspaceIcon,
  type AppearanceChoice,
} from '@notesapp/ui';
import {
  problemMessage,
  useLocalStore,
  useSession,
  useTheme,
  useWorkspace,
  useRequestSync,
} from '../../app.tsx';
import {
  signOut as endSession,
  revokeSessionViaClient,
} from '../../pwa/lifecycle.ts';
import { downloadAll, importAll } from '../export/export.ts';

/** Redirects to login when no session exists. */
export function RequireSession({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const session = useSession();
  if (session.status === 'loading') {
    return (
      <Page>
        <StatusRegion message="Checking the session." />
      </Page>
    );
  }
  if (session.status === 'signed-out' || session.account === null) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/** The shortest password the server accepts. */
export const minPasswordLength = 12;

/** The rule of the password field, stated before anything is submitted. */
export const passwordRule = `Use at least ${String(minPasswordLength)} characters.`;

/** How far the setup status call got. */
type SetupStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreachable'; readonly message: string }
  /** True when the owner account of this installation already exists. */
  | { readonly kind: 'ready'; readonly initialized: boolean };

/**
 * First-run setup and email and password sign in.
 *
 * One screen serves both, and it says which one it is: setup states that it
 * creates the single owner account of the installation and asks for the
 * password twice, sign in asks for it once. The password rule is under the
 * field from the start, so nobody learns it from a refusal. A status call
 * that does not answer offers Retry instead of a dead submit button.
 */
export function LoginPage(): ReactNode {
  const session = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SetupStatus>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: 'loading' });
    void getSetupStatus().then((result) => {
      if (cancelled) return;
      if (result.error !== undefined || result.data === undefined) {
        setStatus({
          kind: 'unreachable',
          message: problemMessage(result.error),
        });
        return;
      }
      setStatus({ kind: 'ready', initialized: result.data.initialized });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const setup = status.kind === 'ready' && !status.initialized;

  async function submitPassword(): Promise<void> {
    setFieldError('');
    if (setup && password.length < minPasswordLength) {
      setFieldError('This password is too short.');
      return;
    }
    if (setup && confirmation !== password) {
      setFieldError('The two passwords are not the same.');
      return;
    }
    setBusy(true);
    setError('');
    const result = setup
      ? await createOwner({ body: { email, password } })
      : await signInWithPassword({ body: { email, password } });
    setBusy(false);
    if (result.error !== undefined || result.data === undefined) {
      const code =
        typeof result.error === 'object' &&
        result.error !== null &&
        'code' in result.error
          ? (result.error as { readonly code?: string }).code
          : undefined;
      const httpStatus =
        result.response?.status ??
        (typeof result.error === 'object' &&
        result.error !== null &&
        'status' in result.error
          ? (result.error as { readonly status?: number }).status
          : undefined);
      if (
        httpStatus === 400 ||
        httpStatus === 401 ||
        code === 'unauthenticated' ||
        code === 'invalid_request'
      ) {
        setError(
          setup
            ? 'The account could not be created. Check the address and the password.'
            : 'That address and password do not match an account.',
        );
        return;
      }
      setError(problemMessage(result.error));
      return;
    }
    session.refresh();
    void navigate('/');
  }

  if (session.status === 'signed-in') return <Navigate to="/" replace />;

  const title = setup ? 'Create your account' : 'Sign in';
  return (
    <div
      className={`flex min-h-dvh flex-col items-center justify-center ${pageGutter} py-10`}
    >
      <div className="mb-5 flex items-center gap-2.5 text-lg font-semibold text-strong">
        <span
          className="inline-flex size-8 items-center justify-center rounded-lg bg-accent-fill text-on-accent"
          aria-hidden="true"
        >
          <WorkspaceIcon size={18} />
        </span>
        <span>Notesapp</span>
      </div>
      <div className="w-full max-w-md rounded-xl border border-edge-subtle bg-card p-6 shadow-xl sm:p-8">
        <h1 className="mb-2 mt-0 text-xl font-semibold text-strong">
          {status.kind === 'loading' ? 'Notesapp' : title}
        </h1>
        {status.kind === 'loading' ? (
          <StatusRegion message="Reading the state of this installation." />
        ) : status.kind === 'unreachable' ? (
          <div className="mt-4 space-y-3">
            <Notice tone="problem" message={status.message} />
            <Button
              onClick={() => {
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-5 mt-0 text-control text-muted">
              {setup
                ? 'This installation has no account yet. What you enter here becomes the one owner account, and it owns every note.'
                : 'Enter the address and the password of your account.'}
            </p>
            <form
              onSubmit={(event): void => {
                event.preventDefault();
                void submitPassword();
              }}
            >
              <TextField
                id="login-email"
                label="Email address"
                value={email}
                inputType="email"
                autoComplete={setup ? 'email' : 'username'}
                required
                autoFocus
                onChange={setEmail}
              />
              <TextField
                id="login-password"
                label="Password"
                value={password}
                inputType={reveal ? 'text' : 'password'}
                autoComplete={setup ? 'new-password' : 'current-password'}
                hint={setup ? passwordRule : undefined}
                required
                error={fieldError}
                onChange={setPassword}
              />
              {setup ? (
                <TextField
                  id="login-password-again"
                  label="Password again"
                  value={confirmation}
                  inputType={reveal ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  onChange={setConfirmation}
                />
              ) : null}
              <label className="mb-4 flex min-h-11 items-center gap-cluster text-control text-strong md:min-h-9">
                <input
                  type="checkbox"
                  checked={reveal}
                  onChange={(event): void => {
                    setReveal(event.target.checked);
                  }}
                />
                Show the password
              </label>
              {error === '' ? null : (
                <Notice className="mb-4" tone="problem" message={error} />
              )}
              <Button type="submit" disabled={busy} className="w-full">
                {busy
                  ? setup
                    ? 'Creating your account'
                    : 'Signing in'
                  : setup
                    ? 'Create account'
                    : 'Sign in'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** The three appearance choices, with the icon that names each of them. */
const appearanceChoices: readonly {
  readonly value: AppearanceChoice;
  readonly label: string;
  readonly icon: ReactNode;
}[] = [
  { value: 'system', label: 'System', icon: <ComputerIcon size={14} /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={14} /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={14} /> },
];

/**
 * The four colours that show what one family looks like.
 *
 * The swatch is the page background, the sidebar surface, the accent fill,
 * and the body text of the variant that the current appearance selects, so
 * the preview is exactly what the screen becomes on selection.
 */
function FamilySwatch({ familyId }: { readonly familyId: string }): ReactNode {
  const theme = useTheme();
  const family = themeFamilies.find((entry) => entry.id === familyId);
  if (family === undefined) return null;
  const tokens = themeOfFamily(family, theme.resolved).tokens;
  const colours = [
    tokens.background,
    tokens.surface,
    tokens.accentFill,
    tokens.text,
  ];
  return (
    <span
      aria-hidden="true"
      className="inline-flex overflow-hidden rounded-sm border border-edge"
    >
      {colours.map((colour) => (
        <span
          className="block h-4 w-3"
          key={colour}
          style={{ backgroundColor: colour }}
        />
      ))}
    </span>
  );
}

/**
 * Appearance settings: local first, synced without delaying the change.
 *
 * The appearance choices and the theme families are radio buttons in two
 * groups, so each whole set is visible at once, the arrow keys move through
 * it, and the choice in force is readable without opening anything. A
 * selection applies at once, which is why the swatch of every family shows
 * the variant of the appearance in force.
 */
export function ThemeSettings(): ReactNode {
  const theme = useTheme();
  return (
    <Card title="Appearance" titleId="theme-heading">
      <p className="m-0 text-control text-muted">
        System follows the device. The choice applies at once on this device and
        goes to your account in the background.
      </p>
      <fieldset className="m-0 mt-3 border-0 p-0">
        <legend className="sr-only">Appearance</legend>
        <div className="flex flex-wrap gap-cluster">
          {appearanceChoices.map((choice) => {
            const chosen = theme.choice === choice.value;
            return (
              <label
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-control font-medium motion-safe:transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus md:min-h-9 ${
                  chosen
                    ? 'border-accent-fill bg-accent-fill text-on-accent'
                    : 'border-edge bg-transparent text-strong hover:bg-hover'
                }`}
                key={choice.value}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="theme-choice"
                  value={choice.value}
                  checked={chosen}
                  onChange={(): void => {
                    theme.setChoice(choice.value);
                  }}
                />
                <span className="inline-flex items-center" aria-hidden="true">
                  {choice.icon}
                </span>
                <span>{choice.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="m-0 mt-4 border-0 p-0">
        <legend className="mb-2 p-0 text-control text-muted">Theme</legend>
        <div className="flex flex-wrap gap-cluster">
          {themeFamilies.map((family) => {
            const chosen = theme.familyId === family.id;
            return (
              <label
                className={`inline-flex min-h-11 cursor-pointer items-center gap-cluster rounded-lg border px-3 py-1.5 text-control font-medium motion-safe:transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus md:min-h-9 ${
                  chosen
                    ? 'border-accent-fill bg-hover text-strong'
                    : 'border-edge bg-transparent text-strong hover:bg-hover'
                }`}
                key={family.id}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="theme-family"
                  value={family.id}
                  checked={chosen}
                  onChange={(): void => {
                    theme.setFamily(family.id);
                  }}
                />
                <FamilySwatch familyId={family.id} />
                <span>{family.name}</span>
                {chosen ? <CheckIcon size={14} /> : null}
              </label>
            );
          })}
        </div>
      </fieldset>
      {theme.syncError === null ? null : (
        <p className="m-0 mt-3 text-control text-danger">{theme.syncError}</p>
      )}
    </Card>
  );
}

/** What is kept on this device for use without a connection. */
type OfflineChoices = {
  readonly images: boolean;
  readonly history: boolean;
};

/**
 * Reads and writes what this device keeps for offline use.
 *
 * Notes are always kept. Images and older versions are larger, so each one
 * is a choice. A choice is on when every known item of that kind is already
 * kept, which is what the store records.
 */
function useOfflineChoices(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string | null,
): {
  readonly choices: OfflineChoices;
  readonly ready: boolean;
  readonly setChoice: (kind: keyof OfflineChoices, keep: boolean) => void;
} {
  const [choices, setChoices] = useState<OfflineChoices>({
    images: false,
    history: false,
  });
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (store === null || accountId === null || workspaceId === null) {
      setReady(false);
      return;
    }
    const activeStore = store;
    let cancelled = false;
    async function read(): Promise<void> {
      try {
        const files = await activeStore.listAcceptedFiles(
          accountId ?? '',
          workspaceId ?? '',
        );
        const images = files.filter(
          (file) => file.kind === 'attachment' && !file.deleted,
        );
        const versions = files.filter((file) => !file.deleted);
        let allImages = images.length > 0;
        for (const file of images) {
          if (file.acceptedHeadDigest === null) continue;
          if (
            !(await activeStore.isAttachmentPinned(
              accountId ?? '',
              workspaceId ?? '',
              file.acceptedHeadDigest,
            ))
          ) {
            allImages = false;
            break;
          }
        }
        let allHistory = versions.length > 0;
        for (const file of versions) {
          if (file.acceptedHeadRevisionId === null) continue;
          if (
            !(await activeStore.isHistoryPinned(
              accountId ?? '',
              workspaceId ?? '',
              file.acceptedHeadRevisionId,
            ))
          ) {
            allHistory = false;
            break;
          }
        }
        if (cancelled) return;
        setChoices({ images: allImages, history: allHistory });
        setReady(true);
      } catch {
        if (!cancelled) setReady(false);
      }
    }
    void read();
    return () => {
      cancelled = true;
    };
  }, [store, accountId, workspaceId, generation]);

  const setChoice = useCallback(
    (kind: keyof OfflineChoices, keep: boolean): void => {
      if (store === null || accountId === null || workspaceId === null) return;
      const activeStore = store;
      const activeAccount = accountId;
      const activeWorkspace = workspaceId;
      setChoices((current) => ({ ...current, [kind]: keep }));
      void (async (): Promise<void> => {
        const files = await activeStore.listAcceptedFiles(
          activeAccount,
          activeWorkspace,
        );
        for (const file of files) {
          if (kind === 'images') {
            if (file.kind !== 'attachment' || file.acceptedHeadDigest === null)
              continue;
            await activeStore.setAttachmentPinned(
              activeAccount,
              activeWorkspace,
              file.acceptedHeadDigest,
              keep,
            );
          } else {
            if (file.acceptedHeadRevisionId === null) continue;
            await activeStore.setHistoryPinned(
              activeAccount,
              activeWorkspace,
              file.acceptedHeadRevisionId,
              keep,
            );
          }
        }
        setGeneration((value) => value + 1);
      })();
    },
    [store, accountId, workspaceId],
  );

  return { choices, ready, setChoice };
}

/** Account page: profile, theme, offline availability, and sign-out. */
export function AccountSettingsPage(): ReactNode {
  const session = useSession();
  const store = useLocalStore();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [signOutError, setSignOutError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const importInput = useRef<HTMLInputElement | null>(null);
  const requestSync = useRequestSync();
  const account = session.account;
  const accountId = account?.accountId ?? null;
  const workspaceId =
    workspace.state.status === 'ready' ? workspace.state.workspaceId : null;
  const offline = useOfflineChoices(store.store, accountId, workspaceId);

  useEffect(() => {
    if (store.store === null || accountId === null || workspaceId === null) {
      setPendingCount(null);
      return;
    }
    const activeStore = store.store;
    let cancelled = false;
    void activeStore
      .pending(accountId, workspaceId)
      .then((queue) => {
        if (!cancelled) setPendingCount(queue.length);
      })
      .catch(() => {
        if (!cancelled) setPendingCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [store.store, accountId, workspaceId]);

  if (account === null) return <Navigate to="/login" replace />;
  const pending = pendingCount ?? 0;

  function handleBack(): void {
    if (window.history.length > 1) {
      void navigate(-1);
    } else {
      void navigate('/');
    }
  }

  /**
   * Ends the session on this device.
   *
   * `discard` removes the work that never reached the server. Without it the
   * queued work stays on this device and waits for the next sign-in. Offline
   * sign-out records a marker, so the session is revoked on reconnect before
   * any content comes back.
   */
  function endSignOut(discard: boolean): void {
    setSignOutError('');
    const activeStore = store.store;
    if (!discard || activeStore === null || workspaceId === null) {
      session.signOut();
      return;
    }
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    void endSession(
      activeStore,
      account?.accountId ?? '',
      [workspaceId],
      online,
      true,
      revokeSessionViaClient,
    )
      .then(() => {
        session.refresh();
      })
      .catch((failure: unknown) => {
        setSignOutError(problemMessage(failure));
      });
  }

  return (
    <Page>
      <PageHeader
        title="Settings"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBack}
            label="Back"
            icon={<ChevronLeftIcon size={14} />}
          >
            Back
          </Button>
        }
      />
      <div className="space-y-4">
        <ThemeSettings />

        <Card title="Available offline" titleId="offline-heading">
          <p className="m-0 text-control text-muted">
            Your notes are always kept on this device. Images and older versions
            take more space, so you choose whether to keep them too.
          </p>
          <div className="mt-3 space-y-1">
            <label className="flex min-h-11 items-center gap-cluster text-control text-strong md:min-h-9">
              <input
                type="checkbox"
                checked={offline.choices.images}
                disabled={!offline.ready}
                onChange={(event): void => {
                  offline.setChoice('images', event.target.checked);
                }}
              />
              Keep images on this device
            </label>
            <label className="flex min-h-11 items-center gap-cluster text-control text-strong md:min-h-9">
              <input
                type="checkbox"
                checked={offline.choices.history}
                disabled={!offline.ready}
                onChange={(event): void => {
                  offline.setChoice('history', event.target.checked);
                }}
              />
              Keep older versions on this device
            </label>
          </div>
        </Card>

        <Card title="Export" titleId="export-heading">
          <p className="m-0 text-control text-muted">
            Download every note and image as a zip. The files keep their folders
            and need no application to be read again.
          </p>
          {exportError === '' ? null : (
            <Notice className="mt-3" tone="problem" message={exportError} />
          )}
          <div className="mt-3 flex flex-wrap gap-cluster">
            <Button
              variant="secondary"
              disabled={exporting || workspaceId === null}
              onClick={() => {
                if (workspaceId === null) return;
                setExportError('');
                setExporting(true);
                void downloadAll(workspaceId)
                  .catch((failure: unknown) => {
                    setExportError(problemMessage(failure));
                  })
                  .finally(() => {
                    setExporting(false);
                  });
              }}
            >
              {exporting ? 'Preparing the download' : 'Export all notes'}
            </Button>
          </div>
        </Card>

        <Card title="Import" titleId="import-heading">
          <p className="m-0 text-control text-muted">
            Import a zip of Markdown files and images. The files keep their
            paths and links.
          </p>
          {importNotice === '' ? null : (
            <Notice className="mt-3" tone="info" message={importNotice} />
          )}
          <input
            ref={importInput}
            className="sr-only"
            type="file"
            accept=".zip,application/zip"
            aria-label="Choose a workspace zip archive"
            onChange={(event): void => {
              const file = event.target.files?.[0];
              if (file === undefined || workspaceId === null) return;
              setImporting(true);
              setImportNotice('');
              void importAll(workspaceId, file)
                .then((result) => {
                  setImportNotice(
                    `Imported ${String(result.notes)} ${result.notes === 1 ? 'note' : 'notes'} and ${String(result.attachments)} ${result.attachments === 1 ? 'image' : 'images'}.`,
                  );
                  requestSync();
                })
                .catch((failure: unknown) => {
                  setImportNotice(problemMessage(failure));
                })
                .finally(() => {
                  setImporting(false);
                  event.target.value = '';
                });
            }}
          />
          <div className="mt-3 flex flex-wrap gap-cluster">
            <Button
              variant="secondary"
              disabled={importing || workspaceId === null}
              onClick={() => importInput.current?.click()}
            >
              {importing ? 'Importing files' : 'Import workspace'}
            </Button>
          </div>
        </Card>

        <Card title="Account" titleId="profile-heading">
          <p className="m-0 text-ui text-strong">
            {account.email ?? 'No address linked'}
          </p>
          <p className="mb-0 mt-1 text-control text-muted">
            This installation has one account, and it owns every note.
          </p>
        </Card>

        <Card title="Sign out" titleId="signout-heading">
          {pending > 0 ? (
            <p className="m-0 text-control text-muted">
              Some saves have not reached the server yet. Keep them on this
              device for the next sign-in, or remove them now.
            </p>
          ) : (
            <p className="m-0 text-control text-muted">
              Every save on this device reached the server.
            </p>
          )}
          {signOutError === '' ? null : (
            <Notice className="mt-3" tone="problem" message={signOutError} />
          )}
          <div className="mt-3 flex flex-wrap gap-cluster">
            <Button
              variant="secondary"
              onClick={() => {
                endSignOut(false);
              }}
            >
              {pending > 0
                ? 'Sign out and keep them'
                : 'Sign out on this device'}
            </Button>
            {pending > 0 ? (
              <Button
                variant="danger"
                onClick={() => {
                  endSignOut(true);
                }}
              >
                Sign out and remove them
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    </Page>
  );
}
