/**
 * The pages of a password reset (record 0141).
 *
 * The first page asks for the address and then says to open the link in the
 * message. It says the same for every address, because the server answers
 * the same, so the page never tells a stranger whether an address has an
 * account. The second page opens the link: the token travels in the
 * fragment, so no server log holds it, and the page sends it with the new
 * password. The server then ends every session of the account, so the person
 * signs in again with the new password.
 */
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { requestPasswordReset, resetPassword } from '@notesapp/api-client';
import {
  Button,
  buttonClassName,
  Checkbox,
  Notice,
  TextField,
} from '@notesapp/ui';
import { problemMessage, useSession } from '../../app.tsx';
import { forgotPasswordRoute, resetTokenOf } from '../../lib/accounts.ts';
import { problemCode } from '../../lib/problem-text.ts';
import { passwordProblem, passwordRule } from '../../lib/password-policy.ts';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { AuthFrame } from './accounts.tsx';

/** The one sentence of a reset link that opens nothing. */
const invalidLink =
  'This link is not valid any more. Ask for a new link and use it within 1 hour.';

/** The page that asks for a reset message. */
export function ForgotPasswordPage(): ReactNode {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useDocumentTitle('Reset your password');

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError('');
    const result = await requestPasswordReset({
      body: { email: email.trim() },
    });
    setBusy(false);
    if (result.data === undefined) {
      setError(problemMessage(result.error));
      return;
    }
    setSentTo(email.trim());
  };

  if (sentTo !== null)
    return (
      <AuthFrame title="Open the link in your mail">
        <p className="mb-6 mt-0 text-secondary text-muted">
          If {sentTo} has an account, a message with a link goes to it. Open the
          link within 1 hour to choose a new password. If no message comes, look
          in your spam folder, or ask again in a few minutes.
        </p>
        <Link className={buttonClassName({ variant: 'secondary' })} to="/login">
          Go to sign in
        </Link>
      </AuthFrame>
    );

  return (
    <AuthFrame title="Reset your password">
      <p className="mb-6 mt-0 text-secondary text-muted">
        Enter the address of your account. A link to choose a new password goes
        to it.
      </p>
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextField
          id="forgot-email"
          label="Email address"
          value={email}
          inputType="email"
          autoComplete="username"
          required
          autoFocus
          onChange={setEmail}
        />
        {error === '' ? null : (
          <Notice className="mb-4" tone="problem" message={error} />
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Sending the link' : 'Send link'}
        </Button>
      </form>
      <Link
        className={`mt-3 w-full ${buttonClassName({ variant: 'ghost' })}`}
        to="/login"
      >
        Back to sign in
      </Link>
    </AuthFrame>
  );
}

/** The page that a reset link opens. */
export function ResetPasswordPage(): ReactNode {
  const location = useLocation();
  const session = useSession();
  const token = resetTokenOf(location.hash);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reveal, setReveal] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(token === null);
  useDocumentTitle('Choose a new password');

  const submit = async (): Promise<void> => {
    if (token === null) return;
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
    setBusy(true);
    setError('');
    const result = await resetPassword({
      body: { token, newPassword: password },
    });
    setBusy(false);
    if (result.data !== undefined) {
      setDone(true);
      return;
    }
    // A leaked password is a refusal that the person can act on here. Any
    // other refusal of the request means that the link does not work.
    const code = problemCode(result.error);
    if (code === 'password_breached') {
      setFieldError(problemMessage(result.error));
      return;
    }
    if ((result.response?.status ?? 0) === 400) {
      setExpired(true);
      return;
    }
    setError(problemMessage(result.error));
  };

  if (done)
    return (
      <AuthFrame title="Your password changed">
        <p className="mb-6 mt-0 text-secondary text-muted">
          Every device that was signed in is signed out. Sign in with your new
          password.
        </p>
        <Link
          className={buttonClassName({ variant: 'primary' })}
          to="/login"
          onClick={() => {
            // The server ended every session of the account, and this browser
            // can hold one of them. The session is read again on the way out,
            // so sign in shows its form and does not send the person to the
            // notes of a session that ended. A read here, before the person
            // leaves, would remount this page and lose its answer, because a
            // change of account rebuilds the whole tree (record 0113).
            session.refresh();
          }}
        >
          Go to sign in
        </Link>
      </AuthFrame>
    );

  if (expired)
    return (
      <AuthFrame title="Choose a new password">
        <div className="mt-4 space-y-3">
          <Notice tone="problem" message={invalidLink} />
          <Link
            className={buttonClassName({ variant: 'secondary' })}
            to={forgotPasswordRoute}
          >
            Ask for a new link
          </Link>
        </div>
      </AuthFrame>
    );

  return (
    <AuthFrame title="Choose a new password">
      <p className="mb-6 mt-0 text-secondary text-muted">
        Choose a new password for your account. Every device that is signed in
        then signs out.
      </p>
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextField
          id="reset-password"
          label="New password"
          value={password}
          inputType={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          hint={passwordRule}
          required
          autoFocus
          error={fieldError}
          onChange={setPassword}
        />
        <TextField
          id="reset-password-again"
          label="New password again"
          value={confirmation}
          inputType={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          required
          onChange={setConfirmation}
        />
        <div className="mb-4">
          <Checkbox
            id="reset-reveal"
            label="Show the password"
            checked={reveal}
            onChange={setReveal}
          />
        </div>
        {error === '' ? null : (
          <Notice className="mb-4" tone="problem" message={error} />
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Saving your password' : 'Save password'}
        </Button>
      </form>
    </AuthFrame>
  );
}
