import {
  Form,
  Stack,
  Inset,
  Button,
  buttonClassName,
  Checkbox,
  LoadingState,
  Notice,
  ReadOnlyField,
  TextField,
} from '@notesapp/ui';

/**
 * The page that accepts an invitation (record 0108).
 *
 * The link of an invitation opens this page with the token in the fragment,
 * so no server log holds it. The page reads the address that the invitation
 * binds, shows it, and asks for a name and a password. The person cannot
 * change the address. A used, revoked, expired or unknown invitation reads
 * the same, and the page offers sign in instead.
 *
 * The account starts its session when it exists, so the page opens the notes
 * of the new account at once.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  getSetupStatus,
  readInvitation,
  registerAccount,
  type LegalDocuments,
} from '@notesapp/api-client';

import { problemMessage, useSession } from '../../app.tsx';
import { invitationTokenOf } from '../../lib/accounts.ts';
import { passwordProblem, passwordRule } from '../../lib/password-policy.ts';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { consentTo } from '../../lib/legal.ts';
import { trialOffer } from '../../lib/trial.ts';
import { AuthFrame } from './accounts.tsx';
import { ConsentLabel } from './legal-links.tsx';

/** The one sentence of an invitation that opens nothing. */
const invalidInvitation = 'This invitation is not valid. Ask for a new one.';

/** How far the read of the invitation got. */
type InvitationState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unreachable'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly trialSeconds: number | null;
      readonly token: string;
      readonly email: string;
      /** The terms and the privacy notice, or `null` (record 0120). */
      readonly documents: LegalDocuments | null;
    };

/** The page that an invitation link opens. */
export function InvitationPage(): ReactNode {
  const location = useLocation();
  const [state, setState] = useState<InvitationState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useDocumentTitle('Accept the invitation');

  useEffect(() => {
    const token = invitationTokenOf(location.hash);
    if (token === null) {
      setState({ kind: 'invalid' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    // The terms and the privacy notice come with the setup status, so the
    // form links both and asks for consent when the installation names them.
    void Promise.all([
      readInvitation({ body: { invitation: token } }),
      getSetupStatus(),
    ]).then(([result, setup]) => {
      if (cancelled) return;
      if (result.data !== undefined && setup.data !== undefined) {
        setState({
          kind: 'ready',
          trialSeconds: setup.data.newAccountTrialSeconds,
          token,
          email: result.data.email,
          documents: setup.data.legalDocuments,
        });
        return;
      }
      if (result.data !== undefined) {
        setState({ kind: 'unreachable', message: problemMessage(setup.error) });
        return;
      }
      const status = result.response?.status ?? 0;
      setState(
        status === 403
          ? { kind: 'invalid' }
          : { kind: 'unreachable', message: problemMessage(result.error) },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [location.hash, attempt]);

  return (
    <AuthFrame title="Make your account">
      {state.kind === 'loading' ? (
        <LoadingState label="The invitation is loading." />
      ) : state.kind === 'invalid' ? (
        <Stack gap={3} as="div">
          <Notice tone="problem" message={invalidInvitation} />
          <Link
            className={buttonClassName({ variant: 'secondary' })}
            to="/login"
          >
            Go to sign in
          </Link>
        </Stack>
      ) : state.kind === 'unreachable' ? (
        <Stack gap={3} as="div">
          <Notice tone="problem" message={state.message} />
          <Button
            onClick={() => {
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
        </Stack>
      ) : (
        <AcceptForm
          token={state.token}
          email={state.email}
          documents={state.documents}
          trialSeconds={state.trialSeconds}
        />
      )}
    </AuthFrame>
  );
}

/** The fields that make the account of one valid invitation. */
function AcceptForm({
  token,
  email,
  documents,
  trialSeconds,
}: {
  readonly token: string;
  readonly email: string;
  readonly documents: LegalDocuments | null;
  readonly trialSeconds: number | null;
}): ReactNode {
  const session = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reveal, setReveal] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const submit = async (): Promise<void> => {
    setFieldError('');
    const problem = passwordProblem(password);
    if (problem !== null) {
      setFieldError(problem);
      return;
    }
    if (confirmation !== password) {
      setFieldError('The two passwords are not the same.');
      return;
    }
    if (documents !== null && !accepted) {
      setError('Accept the terms and the privacy notice to make an account.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await registerAccount({
      body: {
        invitation: token,
        password,
        ...(name.trim() === '' ? {} : { name: name.trim() }),
        ...(documents === null ? {} : { consent: consentTo(documents) }),
      },
    });
    setBusy(false);
    if (result.data === undefined) {
      setError(
        (result.response?.status ?? 0) === 403
          ? invalidInvitation
          : problemMessage(result.error),
      );
      return;
    }
    session.refresh();
    void navigate('/');
  };

  return (
    <>
      <Inset as="p" className="text-secondary text-muted">
        You have an invitation to this installation. Choose a password, and your
        account and its own notes are ready.
      </Inset>
      {trialOffer(trialSeconds) === null ? null : (
        <Notice message={trialOffer(trialSeconds) ?? ''} />
      )}
      <Form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <ReadOnlyField
          id="invite-address"
          label="Email address"
          value={email}
        />
        <TextField
          id="invite-name"
          label="Your name"
          value={name}
          autoComplete="name"
          hint="An administrator of this installation sees it. You can leave it empty."
          autoFocus
          onChange={setName}
        />
        <TextField
          id="invite-password"
          label="Password"
          value={password}
          inputType={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          hint={passwordRule}
          required
          error={fieldError}
          onChange={setPassword}
        />
        <TextField
          id="invite-password-again"
          label="Password again"
          value={confirmation}
          inputType={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          required
          onChange={setConfirmation}
        />
        <Inset as="div">
          <Checkbox
            id="invite-reveal"
            label="Show the password"
            checked={reveal}
            onChange={setReveal}
          />
        </Inset>
        {documents === null ? null : (
          <Inset as="div">
            <Checkbox
              id="invite-consent"
              label={<ConsentLabel documents={documents} />}
              checked={accepted}
              onChange={setAccepted}
            />
          </Inset>
        )}
        {error === '' ? null : <Notice tone="problem" message={error} />}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Making your account' : 'Make account'}
        </Button>
      </Form>
    </>
  );
}
