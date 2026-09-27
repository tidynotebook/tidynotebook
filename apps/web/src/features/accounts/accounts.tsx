/**
 * Account screens: first-run setup, login, and settings.
 *
 * The sign in screen and the setup screen are the two screens that carry the
 * wordmark, which is a monochrome mark and the product name (decisions 0062
 * and 0064). Both are one centred column on the chrome plane with one raised
 * panel, so a first run meets a neutral surface and the one filled control on
 * it is the one action.
 *
 * Settings is the one place for the profile, the palette, the spell check,
 * offline availability, and sign-out. It is a page of the workspace frame (record
 * 0091), so the breadcrumb and the sidebar are the way back, and the
 * sections that act on one workspace act on the workspace of the address.
 * It reads as sections and not as a stack of cards: each section states its
 * name and its sentence in a column of its own and holds its controls beside
 * them, and a hairline separates one from the next. Theme changes apply
 * locally first and sync in the background through the provider in
 * `app.tsx`.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import {
  acceptLegalDocuments,
  type AccountSession,
  createOwner,
  listWorkspaces,
  type LegalDocuments,
  getSetupStatus,
  listSessions,
  removeOwnAccount,
  revokeOtherSessions,
  revokeSession,
  signInWithPassword,
  updatePreferences,
} from '@notesapp/api-client';
import type { LocalStore } from '@notesapp/sync';
import {
  type AppearanceChoice,
  AppMarkIcon,
  Button,
  buttonClassName,
  Dialog,
  DialogBody,
  DialogFooter,
  Card,
  Checkbox,
  CheckIcon,
  ListRow,
  ComputerIcon,
  DownloadIcon,
  LoadingState,
  MoonIcon,
  Notice,
  Page,
  pageGutter,
  PageHeader,
  SignOutIcon,
  SunIcon,
  TextField,
  TrashIcon,
  UsersIcon,
  themeFamilies,
  themeOfFamily,
  transitionSurface,
  UploadIcon,
} from '@notesapp/ui';
import {
  problemMessage,
  useLocalStore,
  useSession,
  useSpellCheck,
  useTheme,
  useRequestSync,
} from '../../app.tsx';
import { problemCode, problemStatus } from '../../lib/problem-text.ts';
import { signUpRoute, storageLine } from '../../lib/accounts.ts';
import { consentTo, waitsForConsent } from '../../lib/legal.ts';
import {
  deviceName,
  otherSessionsEndedText,
  sessionFacts,
} from '../../lib/sessions.ts';
import { passwordProblem, passwordRule } from '../../lib/password-policy.ts';
import {
  signOut as endSession,
  revokeSessionViaClient,
} from '../../pwa/lifecycle.ts';
import { downloadAll, importAll } from '../export/export.ts';
import { DailyNoteSettingsFields } from '../daily-notes/daily-note-settings.tsx';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { useNow } from '../../shell/now.ts';

/** The title of the settings page, which is also its breadcrumb part. */
export const settingsTitle = 'Settings';

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
        <LoadingState label="Your account is loading." />
      </Page>
    );
  }
  if (session.status === 'signed-out' || session.account === null) {
    return <Navigate to="/login" replace />;
  }
  // The application opens after consent to the current legal documents
  // (record 0120).
  if (waitsForConsent(session.account)) return <ConsentPage />;
  return children;
}

/** How far the read of the legal documents got. */
type DocumentsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly documents: LegalDocuments | null };

/**
 * The step that asks for consent again after the operator raised a version
 * of the terms or of the privacy notice (record 0120).
 *
 * The one filled action accepts. A person who does not accept can export
 * their notes, remove their account, or sign out, and the application stays
 * closed until they accept.
 */
function ConsentPage(): ReactNode {
  const session = useSession();
  const store = useLocalStore();
  const [state, setState] = useState<DocumentsState>({ kind: 'loading' });
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  useDocumentTitle('Accept the terms');

  useEffect(() => {
    let cancelled = false;
    void getSetupStatus().then((result) => {
      if (cancelled) return;
      setState(
        result.data === undefined
          ? { kind: 'failed', message: problemMessage(result.error) }
          : { kind: 'ready', documents: result.data.legalDocuments },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  const account = session.account;
  if (account === null) return <Navigate to="/login" replace />;
  const documents = state.kind === 'ready' ? state.documents : null;

  const accept = async (): Promise<void> => {
    if (documents === null) return;
    setBusy(true);
    setError('');
    const result = await acceptLegalDocuments({ body: consentTo(documents) });
    setBusy(false);
    if (result.error !== undefined) {
      setError(problemMessage(result.error));
      // A version that changed while the person read reads again.
      setGeneration((value) => value + 1);
      return;
    }
    session.refresh();
  };

  const exportNotes = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const listed = await listWorkspaces();
      for (const workspace of listed.data?.workspaces ?? [])
        if (workspace.role === 'owner')
          await downloadAll(workspace.workspaceId);
    } catch (failure: unknown) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Accept the terms">
      {state.kind === 'loading' ? (
        <LoadingState label="The terms are loading." />
      ) : state.kind === 'failed' ? (
        <div className="mt-4 space-y-3">
          <Notice tone="problem" message={state.message} />
          <Button
            onClick={() => {
              setGeneration((value) => value + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-3 mt-0 text-control text-muted">
            Read the terms and the privacy notice of this service, then accept
            them to open your notes. A new version asks you again.
          </p>
          {documents === null ? null : (
            <p className="mb-5 mt-0 flex flex-wrap gap-cluster text-control">
              <a
                className="text-accent underline"
                href={documents.terms.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms
              </a>
              <a
                className="text-accent underline"
                href={documents.privacy.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy notice
              </a>
            </p>
          )}
          {error === '' ? null : (
            <Notice className="mb-4" tone="problem" message={error} />
          )}
          <Button
            className="w-full"
            disabled={busy || documents === null}
            onClick={() => {
              void accept();
            }}
          >
            {busy ? 'Saving your answer' : 'Accept and continue'}
          </Button>
          <p className="mb-2 mt-5 text-control text-muted">
            If you do not accept them, you can export your notes and remove your
            account.
          </p>
          <div className="flex flex-wrap gap-cluster">
            <Button
              variant="secondary"
              icon={<DownloadIcon />}
              disabled={busy}
              onClick={() => {
                void exportNotes();
              }}
            >
              Export my notes
            </Button>
            <Button
              variant="secondary"
              tone="danger"
              icon={<TrashIcon />}
              disabled={busy}
              onClick={() => {
                setRemoving(true);
              }}
            >
              Remove my account
            </Button>
            <Button
              variant="ghost"
              icon={<SignOutIcon />}
              disabled={busy}
              onClick={() => {
                session.signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </>
      )}
      {removing ? (
        <RemoveOwnAccountDialog
          store={store.store}
          accountId={account.accountId}
          onClose={() => {
            setRemoving(false);
          }}
          onRemoved={() => {
            session.refresh();
          }}
        />
      ) : null}
    </AuthFrame>
  );
}

/** How far the setup status call got. */
type SetupStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unreachable'; readonly message: string }
  /** True when the owner account of this installation already exists. */
  | {
      readonly kind: 'ready';
      readonly initialized: boolean;
      /** Whether a person can ask for an account (record 0114). */
      readonly openRegistration: boolean;
    };

/**
 * First-run setup and email and password sign in.
 *
 * One screen serves both, and it says which one it is: setup states that it
 * creates the first account of the installation, its administrator, and asks
 * for the password twice, sign in asks for it once. The password rule is under the
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
      setStatus({
        kind: 'ready',
        initialized: result.data.initialized,
        openRegistration: result.data.openRegistration,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const setup = status.kind === 'ready' && !status.initialized;

  async function submitPassword(): Promise<void> {
    setFieldError('');
    const problem = setup ? passwordProblem(password) : null;
    if (problem !== null) {
      setFieldError(problem);
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
      const code = problemCode(result.error);
      const httpStatus = result.response?.status ?? problemStatus(result.error);
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
    <AuthFrame title={status.kind === 'loading' ? 'Notesapp' : title}>
      {status.kind === 'loading' ? (
        <LoadingState label="The sign-in screen is loading." />
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
              ? 'This installation has no account yet. What you enter here becomes the first account. It administers the installation and invites other people.'
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
            <div className="mb-4">
              <Checkbox
                id="login-reveal"
                label="Show the password"
                checked={reveal}
                onChange={setReveal}
              />
            </div>
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
          {status.kind === 'ready' && !setup && status.openRegistration ? (
            <Link
              className={`mt-3 w-full ${buttonClassName({ variant: 'ghost' })}`}
              to={signUpRoute}
            >
              Create an account
            </Link>
          ) : null}
        </>
      )}
    </AuthFrame>
  );
}

/**
 * The frame of a screen before a session: the wordmark over one raised panel
 * on the chrome plane (decisions 0062 and 0064). Sign in, first-run setup and
 * the acceptance of an invitation use it.
 */
export function AuthFrame({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div
      className={`flex min-h-dvh flex-col items-center justify-center bg-surface ${pageGutter} py-10`}
    >
      <div className="mb-5 flex items-center gap-2.5 text-ui font-semibold text-strong">
        <span
          className="inline-flex size-7 items-center justify-center rounded-md bg-active text-strong"
          aria-hidden="true"
        >
          <AppMarkIcon />
        </span>
        <span>Notesapp</span>
      </div>
      <Card className="w-full max-w-sm sm:p-6">
        <h1 className="mb-2 mt-0 text-xl font-semibold tracking-heading text-strong">
          {title}
        </h1>
        {children}
      </Card>
    </div>
  );
}

/** The three appearance choices, with the icon that names each of them. */
const appearanceChoices: readonly {
  readonly value: AppearanceChoice;
  readonly label: string;
  readonly icon: ReactNode;
}[] = [
  { value: 'system', label: 'System', icon: <ComputerIcon /> },
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
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
      className="inline-flex overflow-hidden rounded-sm border border-edge-line"
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
 * One section of the settings screen.
 *
 * A section is not a card. From the medium width it is two columns: the name
 * of the section and its sentence on the left, the controls on the right, so
 * a person scans the names of every section in one pass. A hairline separates
 * one section from the next, which is the one place a rule is drawn here,
 * because a person counts the sections of a list they scroll (decision 0063).
 */
function SettingsSection({
  title,
  titleId,
  description,
  children,
}: {
  readonly title: string;
  readonly titleId: string;
  readonly description?: string | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section
      className="border-t border-edge-subtle py-6"
      aria-labelledby={titleId}
    >
      <div className="md:grid md:grid-cols-3 md:gap-group">
        <div className="md:col-span-1">
          <h2 className="m-0 text-ui font-semibold text-strong" id={titleId}>
            {title}
          </h2>
          {description === undefined ? null : (
            <p className="mb-0 mt-1 text-control text-muted">{description}</p>
          )}
        </div>
        <div className="mt-3 min-w-0 md:col-span-2 md:mt-0">{children}</div>
      </div>
    </section>
  );
}

/**
 * Appearance settings: local first, synced without delaying the change.
 *
 * The appearance choices are a segmented control: one radio group in one
 * track, so the whole set is visible, the arrow keys move through it and the
 * choice in force is the raised segment. The theme families are radio buttons
 * as well, one chip each, and the chosen chip takes the strong edge and a
 * ring of the same colour and never the accent fill (decision 0062). A
 * selection applies at once, which is why the swatch of every family shows
 * the variant of the appearance in force.
 *
 * Both groups carry their focus treatment with `focus-within`, because the
 * radio a person reaches is visually hidden and the label around it is what
 * they see. `focus-visible` on the label would never match.
 */
export function ThemeSettings(): ReactNode {
  const theme = useTheme();
  return (
    <SettingsSection
      title="Appearance"
      titleId="theme-heading"
      description="System follows the device. The choice applies at once on this device and goes to your account in the background."
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="sr-only">Appearance</legend>
        <div className="inline-flex rounded-md border border-edge-subtle bg-surface p-0.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          {appearanceChoices.map((choice) => {
            const chosen = theme.choice === choice.value;
            return (
              <label
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-control ${transitionSurface} md:min-h-7 ${
                  chosen
                    ? 'bg-card font-medium text-strong shadow-raised'
                    : 'text-muted hover:text-strong'
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
        <legend className="mb-2 p-0 text-control font-medium text-strong">
          Theme
        </legend>
        <div className="flex flex-wrap gap-cluster">
          {themeFamilies.map((family) => {
            const chosen = theme.familyId === family.id;
            return (
              <label
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-card px-2.5 text-control text-strong ${transitionSurface} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus md:min-h-8 ${
                  chosen
                    ? 'border-strong ring-1 ring-strong'
                    : 'border-edge-line hover:bg-hover'
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
                {chosen ? (
                  <span className="inline-flex items-center" aria-hidden="true">
                    <CheckIcon />
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>
      {theme.syncError === null ? null : (
        <Notice className="mt-4" tone="problem" message={theme.syncError} />
      )}
    </SettingsSection>
  );
}

/**
 * The spell check of the editor (record 0103).
 *
 * The box shows the choice at once and the account stores it in the
 * background. The editor reads the stored value, so a write that fails puts
 * the box back and says so, and the two never disagree. Only the answer to
 * the last change counts, so two quick changes end on the second one.
 */
function SpellCheckSettings(): ReactNode {
  const session = useSession();
  const stored = useSpellCheck();
  const [pending, setPending] = useState<boolean | null>(null);
  const [problem, setProblem] = useState('');
  const lastChange = useRef(0);

  function change(next: boolean): void {
    lastChange.current += 1;
    const current = lastChange.current;
    setPending(next);
    setProblem('');
    async function write(): Promise<void> {
      try {
        const result = await updatePreferences({ body: { spellCheck: next } });
        if (current !== lastChange.current) return;
        if (result.data === undefined)
          setProblem('The spell check did not change. Try again.');
        else session.adoptPreferences(result.data);
      } catch {
        if (current === lastChange.current)
          setProblem('The spell check did not change. Try again.');
      }
      if (current === lastChange.current) setPending(null);
    }
    void write();
  }

  return (
    <SettingsSection
      title="Spelling"
      titleId="spelling-heading"
      description="Your browser marks the words that it does not know in a note. It does not check code or addresses. The settings of your browser choose the languages."
    >
      <Checkbox
        id="spell-check"
        label="Check spelling"
        checked={pending ?? stored}
        onChange={change}
      />
      {problem === '' ? null : (
        <Notice className="mt-4" tone="problem" message={problem} />
      )}
    </SettingsSection>
  );
}

/** What is kept on this device for use without a connection. */
type OfflineChoices = {
  readonly images: boolean;
  readonly history: boolean;
};

/**
 * What this device can say about the saves that never reached the server.
 *
 * A read that did not answer is not a count of zero (record 0038). The card
 * says that it cannot tell, and it offers the action that keeps the work.
 */
type PendingSaves =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly count: number };

/** Whether this device could state what it keeps for offline use. */
type OfflineStatus = 'loading' | 'ready' | 'failed';

/**
 * Reads and writes what this device keeps for offline use.
 *
 * Notes are always kept. Images and older versions are larger, so each one
 * is a choice. A choice is on when every known item of that kind is already
 * kept, which is what the store records.
 *
 * A read that fails is not a pair of choices that are off (record 0038). The
 * status says that the read failed, so the card can name the failure instead
 * of showing two boxes that state something false about this device.
 */
function useOfflineChoices(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string | null,
): {
  readonly choices: OfflineChoices;
  readonly status: OfflineStatus;
  readonly setChoice: (kind: keyof OfflineChoices, keep: boolean) => void;
} {
  const [choices, setChoices] = useState<OfflineChoices>({
    images: false,
    history: false,
  });
  const [status, setStatus] = useState<OfflineStatus>('loading');
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (store === null || accountId === null || workspaceId === null) {
      setStatus('loading');
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
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
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

  return { choices, status, setChoice };
}

/** How far the list of sessions got. */
type SessionsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly sessions: readonly AccountSession[] };

/**
 * The devices that are signed in to this account (record 0122).
 *
 * The current device is first and has no action here, because the Sign out
 * section ends it. Each other device has its own Sign out, for a lost phone,
 * and one action ends every other device, for a password that somebody else
 * may know. Only the identifier of a session leaves the server, never its
 * token.
 */
function SessionsSettings(): ReactNode {
  const now = useNow();
  const [state, setState] = useState<SessionsState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    readonly tone: 'info' | 'problem';
    readonly message: string;
  } | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listSessions().then((result) => {
      if (cancelled) return;
      if (result.error !== undefined || result.data === undefined) {
        setState({ kind: 'failed', message: problemMessage(result.error) });
        return;
      }
      setState({ kind: 'ready', sessions: result.data.sessions });
    });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  /** Runs one change, states its result, and reads the list again. */
  function change(
    run: () => Promise<{ readonly error?: unknown; readonly done: string }>,
  ): void {
    setBusy(true);
    setNotice(null);
    void run()
      .then((result) => {
        setNotice(
          result.error === undefined
            ? { tone: 'info', message: result.done }
            : { tone: 'problem', message: problemMessage(result.error) },
        );
      })
      .finally(() => {
        setBusy(false);
        setGeneration((value) => value + 1);
      });
  }

  const others =
    state.kind === 'ready'
      ? state.sessions.filter((session) => !session.current).length
      : 0;

  return (
    <SettingsSection
      title="Sessions"
      titleId="sessions-heading"
      description="These devices are signed in to your account. Sign out a device that you do not use or do not know."
    >
      {notice === null ? null : (
        <Notice className="mb-3" tone={notice.tone} message={notice.message} />
      )}
      {state.kind === 'failed' ? (
        <Notice tone="problem" message={state.message} />
      ) : state.kind === 'loading' ? (
        <LoadingState
          shape="list"
          rows={2}
          label="The signed in devices are loading."
        />
      ) : (
        <>
          <ul className="m-0 list-none p-0">
            {state.sessions.map((session) => {
              const name = deviceName(session.userAgent);
              return (
                <ListRow key={session.sessionId} className="flex-wrap">
                  <span
                    className="inline-flex shrink-0 items-center text-muted"
                    aria-hidden="true"
                  >
                    <ComputerIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-ui text-strong">{name}</p>
                    <p className="m-0 flex flex-wrap gap-cluster text-control text-muted">
                      {sessionFacts(session, now).map((fact) => (
                        <span key={fact}>{fact}</span>
                      ))}
                    </p>
                  </div>
                  {session.current ? null : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      label={`Sign out ${name}`}
                      onClick={() => {
                        change(async () => ({
                          error: (
                            await revokeSession({
                              path: { sessionId: session.sessionId },
                            })
                          ).error,
                          done: `${name} is signed out.`,
                        }));
                      }}
                    >
                      Sign out
                    </Button>
                  )}
                </ListRow>
              );
            })}
          </ul>
          {others === 0 ? null : (
            <Button
              className="mt-3"
              variant="secondary"
              icon={<SignOutIcon />}
              disabled={busy}
              onClick={() => {
                change(async () => {
                  const ended = await revokeOtherSessions();
                  return {
                    error: ended.error,
                    done: otherSessionsEndedText(ended.data?.revoked ?? 0),
                  };
                });
              }}
            >
              Sign out every other device
            </Button>
          )}
        </>
      )}
    </SettingsSection>
  );
}

/** Account page: profile, theme, offline availability, and sign-out. */
export function AccountSettingsPage(): ReactNode {
  const session = useSession();
  const store = useLocalStore();
  const params = useParams();
  const [pending, setPending] = useState<PendingSaves>({ kind: 'loading' });
  const [signOutError, setSignOutError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [removing, setRemoving] = useState(false);
  const importInput = useRef<HTMLInputElement | null>(null);
  const requestSync = useRequestSync();
  const account = session.account;
  const accountId = account?.accountId ?? null;
  // The address names the workspace, as it does for every page of the frame.
  // The frame only renders this once the account holds that workspace.
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : null;
  const offline = useOfflineChoices(store.store, accountId, workspaceId);
  useDocumentTitle(settingsTitle);

  useEffect(() => {
    if (store.store === null || accountId === null || workspaceId === null) {
      setPending({ kind: 'loading' });
      return;
    }
    const activeStore = store.store;
    let cancelled = false;
    void activeStore
      .pending(accountId, workspaceId)
      .then((queue) => {
        if (!cancelled) setPending({ kind: 'ready', count: queue.length });
      })
      .catch(() => {
        if (!cancelled) setPending({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [store.store, accountId, workspaceId]);

  if (account === null) return <Navigate to="/login" replace />;
  // Only a count that arrived can offer the action that removes work. An
  // unknown count keeps the safe action alone (record 0038).
  const unsent = pending.kind === 'ready' && pending.count > 0;

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
      <PageHeader title={settingsTitle} />
      <div>
        <ThemeSettings />

        <SpellCheckSettings />

        <SettingsSection
          title="Daily notes"
          titleId="daily-notes-heading"
          description="Each day has one note, and the calendar in the sidebar opens it. These settings apply to this workspace and follow you to every device."
        >
          <DailyNoteSettingsFields />
        </SettingsSection>

        <SettingsSection
          title="Available offline"
          titleId="offline-heading"
          description="Your notes are always kept on this device. Images and older versions take more space, so you choose whether to keep them too."
        >
          {offline.status === 'failed' ? (
            <Notice
              tone="problem"
              message="This device cannot say what it keeps offline. Open Settings again to read it."
            />
          ) : offline.status === 'loading' ? (
            // A choice that nothing has read yet is not a choice that is off
            // (record 0038), and the `Checkbox` primitive states no waiting
            // state, so the section shows the shape of the two rows instead.
            <LoadingState
              shape="list"
              rows={2}
              label="What this device keeps offline is loading."
            />
          ) : (
            <div className="flex flex-col">
              <Checkbox
                id="offline-images"
                label="Keep images on this device"
                checked={offline.choices.images}
                onChange={(keep) => {
                  offline.setChoice('images', keep);
                }}
              />
              <Checkbox
                id="offline-history"
                label="Keep older versions on this device"
                checked={offline.choices.history}
                onChange={(keep) => {
                  offline.setChoice('history', keep);
                }}
              />
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          title="Export"
          titleId="export-heading"
          description="Download every note and image as a zip. The files keep their folders and need no application to be read again."
        >
          {exportError === '' ? null : (
            <Notice className="mb-3" tone="problem" message={exportError} />
          )}
          <Button
            variant="secondary"
            icon={<DownloadIcon />}
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
        </SettingsSection>

        <SettingsSection
          title="Import"
          titleId="import-heading"
          description="Import a zip of Markdown files and images. The files keep their paths and links."
        >
          {importNotice === '' ? null : (
            <Notice className="mb-3" tone="info" message={importNotice} />
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
          <Button
            variant="secondary"
            icon={<UploadIcon />}
            disabled={importing || workspaceId === null}
            onClick={() => importInput.current?.click()}
          >
            {importing ? 'Importing files' : 'Import workspace'}
          </Button>
        </SettingsSection>

        <SettingsSection
          title="Account"
          titleId="profile-heading"
          description="Your account owns every note in your workspaces. No other account can read them."
        >
          <p className="m-0 text-ui text-strong">
            {account.email ?? 'No address linked'}
          </p>
          {storageLine(account.storage) === '' ? null : (
            <p className="mb-0 mt-1 text-control text-muted">
              {storageLine(account.storage)}
            </p>
          )}
          {account.installationRole === 'administrator' &&
          workspaceId !== null ? (
            <Link
              className={`mt-3 ${buttonClassName({ variant: 'secondary' })}`}
              to={`/w/${workspaceId}/accounts`}
            >
              <span className="inline-flex items-center" aria-hidden="true">
                <UsersIcon />
              </span>
              <span>Manage accounts</span>
            </Link>
          ) : null}
        </SettingsSection>

        <SessionsSettings />

        <SettingsSection
          title="Sign out"
          titleId="signout-heading"
          description={
            pending.kind === 'loading'
              ? undefined
              : unsent
                ? 'Some saves have not reached the server yet. Keep them on this device for the next sign-in, or remove them now.'
                : pending.kind === 'failed'
                  ? 'This device cannot say what is still waiting to reach the server. Sign out keeps your work on this device.'
                  : 'Every save on this device reached the server.'
          }
        >
          {signOutError === '' ? null : (
            <Notice className="mb-3" tone="problem" message={signOutError} />
          )}
          <div className="flex flex-wrap gap-cluster">
            <Button
              variant="secondary"
              icon={<SignOutIcon />}
              onClick={() => {
                endSignOut(false);
              }}
            >
              {unsent ? 'Sign out and keep them' : 'Sign out on this device'}
            </Button>
            {unsent ? (
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
        </SettingsSection>

        <SettingsSection
          title="Remove account"
          titleId="remove-account-heading"
          description="This removes your account and every note in your workspaces for good. Export your notes first if you want to keep them."
        >
          <Button
            variant="secondary"
            tone="danger"
            icon={<TrashIcon />}
            onClick={() => {
              setRemoving(true);
            }}
          >
            Remove my account
          </Button>
        </SettingsSection>
      </div>
      {removing ? (
        <RemoveOwnAccountDialog
          store={store.store}
          accountId={account.accountId}
          onClose={() => {
            setRemoving(false);
          }}
          onRemoved={() => {
            session.refresh();
          }}
        />
      ) : null}
    </Page>
  );
}

/**
 * The dialog that removes the account of the person (record 0111).
 *
 * The person gives the password again, so a session that somebody else holds
 * cannot remove the account. After the removal this device keeps nothing of
 * the account: its queued work cannot reach the server any more.
 */
function RemoveOwnAccountDialog({
  store,
  accountId,
  onClose,
  onRemoved,
}: {
  readonly store: LocalStore | null;
  readonly accountId: string;
  readonly onClose: () => void;
  readonly onRemoved: () => void;
}): ReactNode {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError('');
    const result = await removeOwnAccount({ body: { password } });
    if (result.data === undefined) {
      setBusy(false);
      setError(
        problemCode(result.error) === 'forbidden'
          ? 'That password is not the password of this account.'
          : problemMessage(result.error),
      );
      return;
    }
    // The refresh reads no account any more, and the loader then forgets
    // the account that this device cached.
    try {
      await store?.clearPrivateData(accountId);
    } catch {
      // The account is gone on the server. What stays here is out of view
      // of every other account, and the next sign-in deletes it.
    }
    onRemoved();
  };

  return (
    <Dialog
      open
      title="Remove your account?"
      titleId="remove-own-account-title"
      width="small"
      onClose={onClose}
    >
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <DialogBody>
          <p className="mb-4 mt-0 text-ui text-strong">
            Your account and every note in your workspaces go for good. You are
            signed out on every device.
          </p>
          <TextField
            id="remove-own-password"
            label="Password"
            value={password}
            inputType="password"
            autoComplete="current-password"
            required
            autoFocus
            error={error}
            onChange={setPassword}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={busy || password === ''}
          >
            {busy ? 'Removing your account' : 'Remove account'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
