import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Page, LoadingState } from '@notesapp/ui';
import { useSession } from '../../app.tsx';
import { waitsForConsent } from '../../lib/legal.ts';
import { isLocked } from '../../lib/locked.ts';
const ConsentPage = lazy(async () => ({
  default: (await import('./accounts.tsx')).ConsentPage,
}));
const LockedPage = lazy(async () => ({
  default: (await import('./accounts.tsx')).LockedPage,
}));
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
  if (waitsForConsent(session.account))
    return (
      <Suspense
        fallback={
          <Page>
            <LoadingState label="Reading the terms" />
          </Page>
        }
      >
        <ConsentPage />
      </Suspense>
    );
  // A locked account signs in to one screen (record 0201).
  if (isLocked(session.account))
    return (
      <Suspense
        fallback={
          <Page>
            <LoadingState label="Reading account access" />
          </Page>
        }
      >
        <LockedPage />
      </Suspense>
    );
  return children;
}
