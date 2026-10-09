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
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import {
  acceptLegalDocuments,
  createOwner,
  listWorkspaces,
  type LegalDocuments,
  getSetupStatus,
  signInWithPassword,
} from '@notesapp/api-client';
import { RemoveOwnAccountDialog } from './remove-account-dialog.tsx';
import {
  AppMarkIcon,
  Button,
  buttonClassName,
  Card,
  Checkbox,
  DownloadIcon,
  LoadingState,
  Notice,
  Page,
  pageGutter,
  SignOutIcon,
  TextField,
} from '@notesapp/ui';
import { actionIcon } from '../../shell/action-icons.tsx';
import { deleteGlyph } from '../../lib/delete-label.ts';
import { problemMessage, useLocalStore, useSession } from '../../app.tsx';
import { problemCode, problemStatus } from '../../lib/problem-text.ts';
import { forgotPasswordRoute, signUpRoute } from '../../lib/accounts.ts';
import { consentTo, waitsForConsent } from '../../lib/legal.ts';
import { isLocked, lockedSentences } from '../../lib/locked.ts';
import { portalHome } from '../../lib/portal.ts';
import { returnOf } from '../../lib/sign-in-return.ts';
import { useOpenPortal } from './open-portal.ts';
import { useNow } from '../../shell/now.ts';
import { LegalLinks } from './legal-links.tsx';

import { passwordProblem, passwordRule } from '../../lib/password-policy.ts';

import { downloadAll, transferFailureMessage } from '../export/export.ts';

import { useDocumentTitle } from '../../shell/document-title.ts';
import { productName } from '@notesapp/core';

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
  // A locked account signs in to one screen (record 0201).
  if (isLocked(session.account)) return <LockedPage />;
  return children;
}

/**
 * Downloads the archive of each workspace that the account owns.
 *
 * A person who does not accept the terms, and a locked account, can still
 * take the notes out (records 0120 and 0201).
 */
async function exportOwnedWorkspaces(): Promise<void> {
  const listed = await listWorkspaces();
  for (const workspace of listed.data?.workspaces ?? [])
    if (workspace.role === 'owner') await downloadAll(workspace.workspaceId);
}

/**
 * The one screen of a locked account (record 0201).
 *
 * When the installation names an account portal, the one filled action opens
 * it, and the portal unlocks the account. The person can also export the
 * notes, remove the account, or sign out. The stream of the account says
 * when it changes, and the screen reads it again then and when the person
 * comes back to the tab, so an unlock opens the application with no reload.
 */
function LockedPage(): ReactNode {
  const session = useSession();
  const store = useLocalStore();
  const now = useNow();
  const portal = useOpenPortal();
  const [working, setWorking] = useState(false);
  const [exportError, setExportError] = useState('');
  const [removing, setRemoving] = useState(false);
  const busy = working || portal.busy;
  // One message for one cause: each action clears the message of the other.
  const error = portal.error === '' ? exportError : portal.error;
  useDocumentTitle('Your account is locked');

  // The stream says when the account changes. A return to the tab reads it
  // again too, for a browser whose stream is closed, and a removed account
  // or an ended session goes to sign-in.
  const recheck = session.recheck;
  useEffect(() => {
    const check = (): void => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [recheck]);

  const account = session.account;
  if (account === null) return <Navigate to="/login" replace />;

  const exportNotes = async (): Promise<void> => {
    setWorking(true);
    setExportError('');
    portal.reset();
    try {
      await exportOwnedWorkspaces();
    } catch (failure: unknown) {
      setExportError(transferFailureMessage(failure));
    } finally {
      setWorking(false);
    }
  };

  return (
    <AuthFrame title="Your account is locked">
      {lockedSentences(account, now).map((sentence) => (
        <p key={sentence} className="mb-3 mt-0 text-control text-muted">
          {sentence}
        </p>
      ))}
      {error === '' ? null : (
        <Notice className="mb-4" tone="problem" message={error} />
      )}
      {account.accountPortal ? (
        <Button
          className="mt-2 w-full"
          disabled={busy}
          onClick={() => {
            setExportError('');
            void portal.open(portalHome);
          }}
        >
          Open billing
        </Button>
      ) : null}
      <p className="mb-2 mt-5 text-control text-muted">
        You can export your notes or remove your account.
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
          icon={actionIcon(deleteGlyph)}
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
      await exportOwnedWorkspaces();
    } catch (failure: unknown) {
      setError(transferFailureMessage(failure));
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
            <LegalLinks className="mb-5" documents={documents} />
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
              icon={actionIcon(deleteGlyph)}
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
      /** Whether a person can reset a password by mail (record 0141). */
      readonly passwordReset: boolean;
      /** The terms and the privacy notice, or `null` (record 0120). */
      readonly legalDocuments: LegalDocuments | null;
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
  // Where sign-in goes back to: a path of this origin, or the root.
  const back = returnOf(useLocation().search);
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
        passwordReset: result.data.passwordReset,
        legalDocuments: result.data.legalDocuments,
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
    void navigate(back);
  }

  if (session.status === 'signed-in') return <Navigate to={back} replace />;

  const title = setup ? 'Create your account' : 'Sign in';
  const documents = status.kind === 'ready' ? status.legalDocuments : null;
  return (
    <AuthFrame
      title={status.kind === 'loading' ? productName : title}
      footer={
        documents === null ? null : (
          <LegalLinks className="justify-center" documents={documents} />
        )
      }
    >
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
          {status.kind === 'ready' && !setup && status.passwordReset ? (
            <Link
              className={`mt-3 w-full ${buttonClassName({ variant: 'ghost' })}`}
              to={forgotPasswordRoute}
            >
              Forgot password
            </Link>
          ) : null}
          {status.kind === 'ready' && !setup && status.openRegistration ? (
            <Link
              className={`mt-1 w-full ${buttonClassName({ variant: 'ghost' })}`}
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
 * on the chrome plane (decisions 0062 and 0064). Sign in, first-run setup,
 * the acceptance of an invitation and the reset of a password use it. The
 * footer sits under the panel, where sign in shows the legal documents.
 */
export function AuthFrame({
  title,
  children,
  footer,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
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
        <span>{productName}</span>
      </div>
      <Card className="w-full max-w-sm sm:p-6">
        <h1 className="mb-2 mt-0 text-xl font-semibold tracking-heading text-strong">
          {title}
        </h1>
        {children}
      </Card>
      {footer === undefined || footer === null ? null : (
        <footer className="mt-5 w-full max-w-sm">{footer}</footer>
      )}
    </div>
  );
}
