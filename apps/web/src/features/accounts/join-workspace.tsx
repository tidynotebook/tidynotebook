import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { joinedWorkspaceState } from '../../shell/workspace-joined.tsx';
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
  getSetupStatus,
  readWorkspaceInvite,
  type LegalDocuments,
  type PendingWorkspaceInvite,
} from '@notesapp/api-client';
import {
  Button,
  Inline,
  LoadingState,
  Notice,
  Stack,
  buttonClassName,
} from '@notesapp/ui';
import { problemMessage, useSession, useWorkspace } from '../../app.tsx';
import { signInAddress } from '../../lib/sign-in-return.ts';
import { invitationTokenOf } from '../../lib/accounts.ts';
import { AuthFrame } from './auth-frame.tsx';
import { AcceptForm } from './invitation.tsx';

const returnToken = 'notesapp:workspace-invite-return';

type JoinState =
  | { readonly kind: 'loading' | 'invalid' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly invite: PendingWorkspaceInvite;
      readonly documents: LegalDocuments | null;
      readonly trial: number | null;
    };

function savedToken(): string | null {
  try {
    return sessionStorage.getItem(returnToken);
  } catch {
    return null;
  }
}

function clearToken(): void {
  try {
    sessionStorage.removeItem(returnToken);
  } catch {
    /* A tab can block storage. */
  }
}

function keepToken(token: string): void {
  try {
    sessionStorage.setItem(returnToken, token);
  } catch {
    /* The original link still works. */
  }
}

export function JoinWorkspacePage(): ReactNode {
  const session = useSession();
  const workspace = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const incomingToken = invitationTokenOf(location.hash);
  const [retainedToken, setRetainedToken] = useState(savedToken);
  const token = incomingToken ?? retainedToken;
  const [state, setState] = useState<JoinState>({ kind: 'loading' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (incomingToken !== null) {
      keepToken(incomingToken);
      setRetainedToken(incomingToken);
    }
    if (location.hash !== '') void navigate('/join', { replace: true });
  }, [incomingToken, location.hash, navigate]);

  useEffect(() => {
    if (token === null) {
      setState({ kind: 'invalid' });
      return;
    }
    let active = true;
    void Promise.all([
      readWorkspaceInvite({ body: { invitation: token } }),
      getSetupStatus(),
    ])
      .then(([link, setup]) => {
        if (!active) return;
        if (link.data !== undefined && setup.data !== undefined) {
          setState({
            kind: 'ready',
            invite: link.data,
            documents: setup.data.legalDocuments,
            trial: setup.data.newAccountTrialSeconds,
          });
        } else if (link.response?.status === 403) {
          clearToken();
          setState({ kind: 'invalid' });
        } else {
          setState({
            kind: 'error',
            message: problemMessage(link.error ?? setup.error),
          });
        }
      })
      .catch(() => {
        if (active)
          setState({
            kind: 'error',
            message: 'The invitation could not load.',
          });
      });
    return () => {
      active = false;
    };
  }, [token]);

  function goToSignIn(): void {
    void navigate(signInAddress('/join'), {
      state: { email: state.kind === 'ready' ? state.invite.email : '' },
    });
  }

  useEffect(() => {
    if (switching && session.status === 'signed-out') {
      void navigate(signInAddress('/join'), {
        state: { email: state.kind === 'ready' ? state.invite.email : '' },
      });
    }
  }, [switching, session.status, state, navigate]);

  async function respond(
    invite: PendingWorkspaceInvite,
    accept: boolean,
  ): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const args = { path: { invitationId: invite.invitationId } };
      const result = accept
        ? await acceptWorkspaceInvite(args)
        : await declineWorkspaceInvite(args);
      if (result.data === undefined) {
        setError(problemMessage(result.error));
        return;
      }
      clearToken();
      workspace.reload();
      if (accept)
        void navigate(`/w/${invite.workspaceId}`, {
          state: joinedWorkspaceState(invite),
        });
      else void navigate('/');
    } catch {
      setError('The response could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'loading' || session.status === 'loading')
    return (
      <AuthFrame title="Workspace invitation">
        <LoadingState label="Loading invitation" />
      </AuthFrame>
    );
  if (state.kind === 'error')
    return (
      <AuthFrame title="Workspace invitation">
        <Notice tone="problem" message={state.message} />
      </AuthFrame>
    );
  if (state.kind !== 'ready' || token === null)
    return (
      <AuthFrame title="This invite no longer works">
        <Notice message="It expired, someone revoked it, or someone used it. Ask for a new invite." />
        <Link className={buttonClassName({ variant: 'primary' })} to="/">
          Go to my notes
        </Link>
      </AuthFrame>
    );

  const { invite } = state;
  const role =
    invite.role === 'admin'
      ? 'Admin'
      : invite.role === 'editor'
        ? 'Editor'
        : 'Viewer';
  const title = `Join ${invite.workspaceName}`;
  const details = `${invite.inviterName ?? 'A workspace member'} invited you as ${role}.`;
  const permissions = {
    admin: 'You can read and edit notes and manage members in this workspace.',
    editor: 'You can read and edit the notes in this workspace.',
    viewer: 'You can read the notes and their history in this workspace.',
  }[invite.role];
  if (session.account === null)
    return (
      <AuthFrame title={title}>
        <Stack gap={4}>
          <Notice message={details} />
          <p className="text-secondary text-muted">{permissions}</p>
          <AcceptForm
            token={token}
            email={invite.email}
            documents={state.documents}
            trialSeconds={state.trial}
            workspace={{
              id: invite.workspaceId,
              name: invite.workspaceName,
              role: invite.role,
              onAccepted: clearToken,
            }}
          />
          <Inline gap={1} justify="center">
            <span className="text-secondary text-muted">Have an account?</span>
            <Button variant="ghost" size="compact" onClick={goToSignIn}>
              Sign in
            </Button>
          </Inline>
        </Stack>
      </AuthFrame>
    );

  if (session.account.email?.toLowerCase() !== invite.email)
    return (
      <AuthFrame title="This invite is for another email">
        <Notice
          message={`The invite is for ${invite.email}. You are signed in as ${session.account.email ?? 'another account'}.`}
        />
        <Button
          variant="primary"
          onClick={() => {
            setSwitching(true);
            session.signOut();
          }}
        >
          Sign out and continue
        </Button>
        <Link className={buttonClassName({ variant: 'secondary' })} to="/">
          Go to my notes
        </Link>
      </AuthFrame>
    );

  return (
    <AuthFrame title={title}>
      <Stack gap={4}>
        <Notice message={details} />
        {error === '' ? null : <Notice tone="problem" message={error} />}
        <Inline gap={2}>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              void respond(invite, true);
            }}
          >
            Accept and open
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void respond(invite, false);
            }}
          >
            Decline
          </Button>
        </Inline>
      </Stack>
    </AuthFrame>
  );
}
