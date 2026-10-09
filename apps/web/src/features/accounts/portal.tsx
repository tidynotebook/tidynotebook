/**
 * The route `/portal`, the way back to the account portal of the operator
 * (records 0190 and 0201).
 *
 * A page or a message of the portal links this route, with the portal path
 * in its query. The route needs a session of any standing, so it sits
 * outside the session guard, which would show the locked screen instead. It
 * sends a person with no session to sign-in, which comes back to it, and it
 * opens the portal through the one handoff of `open-portal.ts`. Every
 * decision of the route is in `lib/portal.ts`.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Button, buttonClassName, LoadingState, Notice } from '@notesapp/ui';
import { useSession } from '../../app.tsx';
import { portalStep } from '../../lib/portal.ts';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { AuthFrame } from './accounts.tsx';
import { useOpenPortal } from './open-portal.ts';

/** The link back to the notes, the way out of every state of the route. */
function BackToNotes(): ReactNode {
  return (
    <Link
      className={`mt-3 w-full ${buttonClassName({ variant: 'secondary' })}`}
      to="/"
    >
      Back to your notes
    </Link>
  );
}

/**
 * The route `/portal`: opens the portal path of its query.
 *
 * The handoff starts once when the route opens. A failure offers Try again
 * and the way back. An installation with no portal says so and offers the
 * way back.
 */
export function PortalPage(): ReactNode {
  const session = useSession();
  const location = useLocation();
  const portal = useOpenPortal();
  const started = useRef(false);
  const step = portalStep(session, location.search);
  const title = step.kind === 'no-portal' ? 'No billing' : 'Billing';
  useDocumentTitle(title);

  const open = portal.open;
  const path = step.kind === 'open' ? step.path : null;
  useEffect(() => {
    if (path === null || started.current) return;
    started.current = true;
    void open(path);
  }, [path, open]);

  if (step.kind === 'sign-in') return <Navigate to={step.address} replace />;
  if (step.kind === 'no-portal')
    return (
      <AuthFrame title={title}>
        <p className="mb-3 mt-0 text-control text-muted">
          This installation has no billing.
        </p>
        <BackToNotes />
      </AuthFrame>
    );
  return (
    <AuthFrame title={title}>
      {portal.error === '' ? (
        <LoadingState label="Billing is opening." />
      ) : (
        <>
          <Notice className="mb-4" tone="problem" message={portal.error} />
          <Button
            className="w-full"
            disabled={portal.busy || path === null}
            onClick={() => {
              if (path !== null) void open(path);
            }}
          >
            Try again
          </Button>
          <BackToNotes />
        </>
      )}
    </AuthFrame>
  );
}
