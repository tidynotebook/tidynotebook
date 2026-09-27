/**
 * The pages of open registration (record 0114).
 *
 * The sign-up page asks for an address and a password, and then says to
 * open the link in the message. It says the same for every address, because
 * the server answers the same, so the page never tells a stranger whether an
 * address has an account. The verification page opens the link: it makes the
 * account and offers sign in. The token travels in the fragment, so no server
 * log holds it.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import {
  getSetupStatus,
  getSignUpChallenge,
  signUpAccount,
  verifyAddress,
  type LegalDocuments,
} from '@notesapp/api-client';
import {
  Button,
  buttonClassName,
  Checkbox,
  LoadingState,
  Notice,
  TextField,
} from '@notesapp/ui';
import { problemMessage } from '../../app.tsx';
import { verificationTokenOf } from '../../lib/accounts.ts';
import { problemCode } from '../../lib/problem-text.ts';
import { passwordProblem, passwordRule } from '../../lib/password-policy.ts';
import { solveChallenge } from '../../lib/proof-of-work.ts';
import { consentTo } from '../../lib/legal.ts';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { AuthFrame } from './accounts.tsx';

/** The one sentence of a verification link that opens nothing. */
const invalidLink =
  'This link is not valid any more. Sign up again to get a new link.';

/** The page that asks for an account. */
export function SignUpPage(): ReactNode {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'checking' | 'sending' | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [documents, setDocuments] = useState<LegalDocuments | null>(null);
  const [accepted, setAccepted] = useState(false);
  useDocumentTitle('Create an account');

  // The terms and the privacy notice, when the installation names them
  // (record 0120). The form links both and asks for consent.
  useEffect(() => {
    let cancelled = false;
    void getSetupStatus().then((result) => {
      if (!cancelled) setDocuments(result.data?.legalDocuments ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (): Promise<void> => {
    setFieldError('');
    const problem = passwordProblem(password);
    if (problem !== null) {
      setFieldError(problem);
      return;
    }
    if (documents !== null && !accepted) {
      setError('Accept the terms and the privacy notice to make an account.');
      return;
    }
    setBusy('checking');
    setError('');
    // The browser pays a short proof of work that this server issued, so a
    // script cannot make accounts for free (record 0115).
    const challenge = await getSignUpChallenge();
    if (challenge.data === undefined) {
      setBusy(null);
      setError(problemMessage(challenge.error));
      return;
    }
    const solution = await solveChallenge(
      challenge.data.value,
      challenge.data.difficulty,
    );
    setBusy('sending');
    const result = await signUpAccount({
      body: {
        email: email.trim(),
        password,
        proof: { challenge: challenge.data.challenge, solution },
        ...(documents === null ? {} : { consent: consentTo(documents) }),
      },
    });
    setBusy(null);
    if (result.data === undefined) {
      setError(problemMessage(result.error));
      return;
    }
    setSentTo(email.trim());
  };

  if (sentTo !== null)
    return (
      <AuthFrame title="Open the link in your mail">
        <p className="mb-5 mt-0 text-control text-muted">
          A message goes to {sentTo}. Open the link in it to finish your
          account. Then sign in with your address and your password.
        </p>
        <Link className={buttonClassName({ variant: 'secondary' })} to="/login">
          Go to sign in
        </Link>
      </AuthFrame>
    );

  return (
    <AuthFrame title="Create an account">
      <p className="mb-5 mt-0 text-control text-muted">
        Enter your address and choose a password. A link goes to the address to
        prove that it is yours.
      </p>
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextField
          id="signup-email"
          label="Email address"
          value={email}
          inputType="email"
          autoComplete="email"
          required
          autoFocus
          onChange={setEmail}
        />
        <TextField
          id="signup-password"
          label="Password"
          value={password}
          inputType={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          hint={passwordRule}
          required
          error={fieldError}
          onChange={setPassword}
        />
        <div className="mb-4">
          <Checkbox
            id="signup-reveal"
            label="Show the password"
            checked={reveal}
            onChange={setReveal}
          />
        </div>
        {documents === null ? null : (
          <div className="mb-4">
            <p className="mb-2 mt-0 flex flex-wrap gap-cluster text-control">
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
            <Checkbox
              id="signup-consent"
              label="I accept the terms and the privacy notice"
              checked={accepted}
              onChange={setAccepted}
            />
          </div>
        )}
        {error === '' ? null : (
          <Notice className="mb-4" tone="problem" message={error} />
        )}
        <Button type="submit" disabled={busy !== null} className="w-full">
          {busy === 'checking'
            ? 'Checking this browser'
            : busy === 'sending'
              ? 'Sending the link'
              : 'Create account'}
        </Button>
      </form>
      <Link
        className={`mt-3 w-full ${buttonClassName({ variant: 'ghost' })}`}
        to="/login"
      >
        I have an account
      </Link>
    </AuthFrame>
  );
}

/** How far the verification got. */
type VerifyState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unreachable'; readonly message: string }
  | { readonly kind: 'verified'; readonly email: string };

/** The page that a verification link opens. */
export function VerifyPage(): ReactNode {
  const location = useLocation();
  const [state, setState] = useState<VerifyState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useDocumentTitle('Finish your account');

  useEffect(() => {
    const token = verificationTokenOf(location.hash);
    if (token === null) {
      setState({ kind: 'invalid', message: invalidLink });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    void verifyAddress({ body: { token } }).then((result) => {
      if (cancelled) return;
      if (result.data !== undefined) {
        setState({ kind: 'verified', email: result.data.email });
        return;
      }
      const status = result.response?.status ?? 0;
      setState(
        status === 403
          ? {
              kind: 'invalid',
              message:
                problemCode(result.error) === 'registration_closed'
                  ? problemMessage(result.error)
                  : invalidLink,
            }
          : { kind: 'unreachable', message: problemMessage(result.error) },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [location.hash, attempt]);

  return (
    <AuthFrame
      title={
        state.kind === 'verified'
          ? 'Your account is ready'
          : 'Finish your account'
      }
    >
      {state.kind === 'loading' ? (
        <LoadingState label="The link is loading." />
      ) : state.kind === 'unreachable' ? (
        <div className="mt-4 space-y-3">
          <Notice tone="problem" message={state.message} />
          <Button
            onClick={() => {
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {state.kind === 'invalid' ? (
            <Notice tone="problem" message={state.message} />
          ) : (
            <p className="m-0 text-control text-muted">
              The address {state.email} is proved. Sign in with it and your
              password.
            </p>
          )}
          <Link
            className={buttonClassName({
              variant: state.kind === 'verified' ? 'primary' : 'secondary',
            })}
            to="/login"
          >
            Go to sign in
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}
