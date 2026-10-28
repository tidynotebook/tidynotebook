/**
 * The screen of a route boundary (record 0161).
 *
 * The router renders it in place of a page whose render failed. The page
 * boundary draws it in the outlet of the workspace frame, so the sidebar and
 * the header stay. The application boundary draws it with no frame.
 *
 * `lib/route-error.ts` decides the words, the second action and the log
 * fields, so this component only draws them: the title, one sentence, Reload
 * as the one primary action, and a link to the notes of the workspace when
 * that is another page. The failure goes to the log once for each error.
 */
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useParams, useRouteError } from 'react-router';
import { Button, buttonClassName, Page, PageHeader } from '@notesapp/ui';
import {
  openNotesLabel,
  reloadLabel,
  routeErrorLog,
  routeErrorScreen,
  type RouteErrorScope,
} from '../lib/route-error.ts';
import { AuthFrame } from '../features/accounts/accounts.tsx';
import { webLogger } from '../logging.ts';
import { useDocumentTitle } from './document-title.ts';

/** What a boundary shows in place of the page that failed. */
export function RouteError({
  scope,
}: {
  readonly scope: RouteErrorScope;
}): ReactNode {
  const error = useRouteError();
  const location = useLocation();
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : null;
  const screen = routeErrorScreen({
    scope,
    error,
    pathname: location.pathname,
    workspaceId,
  });
  useDocumentTitle(screen.title);

  useEffect(() => {
    webLogger.emit('web.render_failed', routeErrorLog(scope, error));
  }, [scope, error]);

  const actions = (
    <>
      <Button
        onClick={(): void => {
          window.location.reload();
        }}
      >
        {reloadLabel}
      </Button>
      {screen.notesPath === null ? null : (
        <Link
          className={buttonClassName({ variant: 'secondary' })}
          to={screen.notesPath}
        >
          {openNotesLabel}
        </Link>
      )}
    </>
  );
  return scope === 'application' ? (
    <AuthFrame title={screen.title}>
      <p className="mb-5 mt-0 text-help text-muted">{screen.description}</p>
      <div className="flex flex-wrap gap-cluster">{actions}</div>
    </AuthFrame>
  ) : (
    <Page>
      <PageHeader
        title={screen.title}
        description={screen.description}
        actions={actions}
      />
    </Page>
  );
}
