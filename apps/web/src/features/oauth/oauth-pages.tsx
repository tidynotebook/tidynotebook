/** The OAuth pages keep the provider's signed query through sign-in (0226). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { getOAuthClient, giveOAuthConsent } from '@notesapp/api-client';
import { buttonClassName, LoadingState, Notice } from '@notesapp/ui';
import { useSession } from '../../app.tsx';
import {
  oauthAcceptedScope,
  oauthConsentFacts,
  oauthConsentRoute,
  oauthFailureMessage,
  oauthInvalidMessage,
  oauthPageStep,
  oauthRequest,
  type OAuthAccess,
  type OAuthConsentFacts,
  type OAuthPageStep,
  type OAuthRequest,
} from '../../lib/oauth-consent.ts';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { OAuthConsentView } from './consent-view.tsx';
import { AuthFrame, LoginPage } from '../accounts/accounts.tsx';

function OAuthMessage({ message }: { readonly message: string }): ReactNode {
  return (
    <AuthFrame title="Access to your notes">
      <Notice tone="problem" message={message} />
      <Link to="/" className={buttonClassName({ variant: 'secondary' })}>
        Open your account
      </Link>
    </AuthFrame>
  );
}

function OAuthLoading(): ReactNode {
  return (
    <AuthFrame title="Access to your notes">
      <LoadingState label="The access request is loading." />
    </AuthFrame>
  );
}

/** The states before either page can use the provider. */
function beforeRequest(
  step: Exclude<OAuthPageStep, { readonly kind: 'ready' }>,
): ReactNode {
  if (step.kind === 'sign-in') return <Navigate to={step.address} replace />;
  if (step.kind === 'wait') return <OAuthLoading />;
  return (
    <OAuthMessage
      message={step.kind === 'locked' ? step.message : oauthInvalidMessage}
    />
  );
}

/** The provider sends every request that needs a fresh password sign-in here. */
export function OAuthSignInPage(): ReactNode {
  const request = oauthRequest(useLocation().search);
  useDocumentTitle('Sign in');
  return request === null ? (
    <OAuthMessage message={oauthInvalidMessage} />
  ) : (
    <LoginPage key={request.query} oauthQuery={request.query} />
  );
}

export function OAuthConsentPage(): ReactNode {
  const step = oauthPageStep(
    useSession(),
    oauthConsentRoute,
    useLocation().search,
  );
  useDocumentTitle('Allow access to your notes');
  return step.kind === 'ready' ? (
    <OAuthConsentRequest key={step.request.query} request={step.request} />
  ) : (
    beforeRequest(step)
  );
}

type ClientRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly facts: OAuthConsentFacts };

function OAuthConsentRequest({
  request,
}: {
  readonly request: OAuthRequest;
}): ReactNode {
  const [read, setRead] = useState<ClientRead>({ kind: 'loading' });
  const [access, setAccess] = useState<OAuthAccess>('read');
  const [busy, setBusy] = useState(false);
  const answering = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void getOAuthClient({ query: { client_id: request.clientId } }).then(
      (answer) => {
        if (cancelled) return;
        const facts =
          answer.data === undefined
            ? null
            : oauthConsentFacts(request, answer.data);
        setRead(
          facts === null
            ? {
                kind: 'failed',
                message: oauthFailureMessage(
                  answer.error,
                  answer.response?.status ?? 0,
                ),
              }
            : { kind: 'ready', facts },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request]);

  const answer = async (accept: boolean): Promise<void> => {
    if (answering.current) return;
    answering.current = true;
    setBusy(true);
    setError('');
    const result = await giveOAuthConsent({
      body: {
        accept,
        oauth_query: request.query,
        ...(accept ? { scope: oauthAcceptedScope(request, access) } : {}),
      },
    });
    if (result.data !== undefined) window.location.assign(result.data.url);
    else
      setError(oauthFailureMessage(result.error, result.response?.status ?? 0));
    answering.current = false;
    setBusy(false);
  };
  if (read.kind === 'loading') return <OAuthLoading />;
  if (read.kind === 'failed') return <OAuthMessage message={read.message} />;
  return (
    <OAuthConsentView
      facts={read.facts}
      access={access}
      busy={busy}
      error={error}
      onAccess={setAccess}
      onAnswer={(accept) => {
        void answer(accept);
      }}
    />
  );
}
