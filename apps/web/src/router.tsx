/**
 * Web application routes.
 *
 * The one workspace of the account keeps its identifier in the address, so a
 * note link stays stable, but no screen names the workspace. Session
 * protection wraps every private route. Login and first-run setup use one
 * public page, and the link of an invitation opens the other. The route of
 * the account portal needs a session of any standing and checks it itself.
 *
 * Every page a signed in person opens is a child of the workspace frame, so
 * each has the sidebar and the breadcrumb (record 0091). Each child names its
 * page in its `handle`, which is how the frame names the last breadcrumb part.
 * An address that names no workspace, the root address among them, opens the
 * same path under the chosen workspace, and that step has no sidebar.
 *
 * Two boundaries hold a render failure (record 0161). The application
 * boundary is the pathless route above every route. The page boundary is the
 * pathless route that holds every page of the frame, so a failure in a page,
 * the note among them, leaves the sidebar and the header. A new route goes
 * under one of them.
 */
import { lazy, Suspense, type ReactNode } from 'react';
import {
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router';
import { LoadingState, Page } from '@notesapp/ui';
import { RouteError } from './shell/route-error.tsx';
import { LoginPage, RequireSession } from './features/accounts/accounts.tsx';
import type { FrameHandle } from './lib/breadcrumb.ts';
import { createEarlyStart } from './lib/early-start.ts';
import {
  forgotPasswordRoute,
  invitationRoute,
  resetPasswordRoute,
  signUpRoute,
  verificationRoute,
} from './lib/accounts.ts';
import { portalRoute } from './lib/portal.ts';
import { oauthConsentRoute, oauthSignInRoute } from './lib/oauth-consent.ts';
const loadShell = () => import('./shell/shell.tsx');
const loadNoteView = () => import('./features/notes/note-view.tsx');
const loadNotesHome = () => import('./features/notes/notes-home.tsx');
const Shell = lazy(async () => ({ default: (await loadShell()).Shell }));
const NoteView = lazy(async () => ({
  default: (await loadNoteView()).NoteView,
}));
const NotesHomeView = lazy(async () => ({
  default: (await loadNotesHome()).NotesHomeView,
}));
const AccountSettingsPage = lazy(async () => ({
  default: (await import('./features/accounts/account-settings.tsx'))
    .AccountSettingsPage,
}));
const loadWorkspaceHome = () => import('./shell/workspaces.tsx');
const WorkspaceHome = lazy(async () => ({
  default: (await loadWorkspaceHome()).WorkspaceHome,
}));
const HistoryView = lazy(async () => ({
  default: (await import('./features/history/history.tsx')).HistoryView,
}));
const ReviewView = lazy(async () => ({
  default: (await import('./features/review/review.tsx')).ReviewView,
}));
const TrashView = lazy(async () => ({
  default: (await import('./features/trash/trash.tsx')).TrashView,
}));
const AttentionRoute = lazy(async () => ({
  default: (await import('./features/attention/attention.tsx')).AttentionRoute,
}));
const AccountsView = lazy(async () => ({
  default: (await import('./features/accounts/administration.tsx'))
    .AccountsView,
}));
const InvitationPage = lazy(async () => ({
  default: (await import('./features/accounts/invitation.tsx')).InvitationPage,
}));
const SignUpPage = lazy(async () => ({
  default: (await import('./features/accounts/sign-up.tsx')).SignUpPage,
}));
const VerifyPage = lazy(async () => ({
  default: (await import('./features/accounts/sign-up.tsx')).VerifyPage,
}));
const ForgotPasswordPage = lazy(async () => ({
  default: (await import('./features/accounts/password-reset.tsx'))
    .ForgotPasswordPage,
}));
const ResetPasswordPage = lazy(async () => ({
  default: (await import('./features/accounts/password-reset.tsx'))
    .ResetPasswordPage,
}));
const PortalPage = lazy(async () => ({
  default: (await import('./features/accounts/portal.tsx')).PortalPage,
}));
const OAuthConsentPage = lazy(async () => ({
  default: (await import('./features/oauth/oauth-pages.tsx')).OAuthConsentPage,
}));
const OAuthSignInPage = lazy(async () => ({
  default: (await import('./features/oauth/oauth-pages.tsx')).OAuthSignInPage,
}));
const PublishedLinksView = lazy(async () => ({
  default: (await import('./features/publishing/published-links.tsx'))
    .PublishedLinksView,
}));
const NotFoundView = lazy(async () => ({
  default: (await import('./shell/not-found.tsx')).NotFoundView,
}));

/** The routes whose modules the first address starts at once (record 0177). */
const early = createEarlyStart();
const startsEarly = early.mark;

/** Holds a route while its deferred module loads. */
function deferred(element: ReactNode): ReactNode {
  return (
    <Suspense
      fallback={
        <Page>
          <LoadingState label="The screen is loading." />
        </Page>
      }
    >
      {element}
    </Suspense>
  );
}

/** The handle of a child route of the frame, checked against the page list. */
function page(name: FrameHandle['page']): FrameHandle {
  return { page: name };
}

const routes: RouteObject[] = [
  {
    // The application boundary: it holds every route below it.
    errorElement: <RouteError scope="application" />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: oauthSignInRoute, element: deferred(<OAuthSignInPage />) },
      { path: oauthConsentRoute, element: deferred(<OAuthConsentPage />) },
      // The page that an invitation link opens. It needs no session, and the
      // server writes the same path into every link.
      { path: invitationRoute, element: deferred(<InvitationPage />) },
      // Open registration (record 0114). The server writes the verification path
      // into every link.
      { path: signUpRoute, element: deferred(<SignUpPage />) },
      { path: verificationRoute, element: deferred(<VerifyPage />) },
      // A password reset (record 0141). The server writes the reset path into
      // every reset message.
      { path: forgotPasswordRoute, element: deferred(<ForgotPasswordPage />) },
      { path: resetPasswordRoute, element: deferred(<ResetPasswordPage />) },
      // The way back to the account portal (record 0190). A page or a
      // message of the portal links it with a portal path. It takes a
      // session of any standing, so it stays outside the session guard,
      // which shows the locked screen, and it sends a person with no
      // session to sign-in itself.
      { path: portalRoute, element: deferred(<PortalPage />) },
      startsEarly(
        {
          path: '/w/:workspaceId',
          element: <RequireSession>{deferred(<Shell />)}</RequireSession>,
          children: [
            {
              // The page boundary: a page that fails leaves the frame.
              errorElement: <RouteError scope="page" />,
              children: [
                startsEarly(
                  {
                    index: true,
                    element: deferred(<NotesHomeView />),
                    handle: page('notes'),
                  },
                  loadNotesHome,
                ),
                startsEarly(
                  {
                    path: 'notes/:fileId',
                    element: deferred(<NoteView />),
                    handle: page('note'),
                  },
                  loadNoteView,
                ),
                {
                  path: 'notes/:fileId/history',
                  element: deferred(<HistoryView />),
                  handle: page('history'),
                },
                {
                  path: 'notes/:fileId/review',
                  element: deferred(<ReviewView />),
                  handle: page('review'),
                },
                {
                  path: 'folders/*',
                  element: deferred(<NotesHomeView />),
                  handle: page('notes'),
                },
                {
                  path: 'trash',
                  element: deferred(<TrashView />),
                  handle: page('trash'),
                },
                {
                  path: 'published',
                  element: deferred(<PublishedLinksView />),
                  handle: page('published'),
                },
                {
                  path: 'accounts',
                  element: deferred(<AccountsView />),
                  handle: page('accounts'),
                },
                {
                  path: 'attention',
                  element: deferred(<AttentionRoute />),
                  handle: page('attention'),
                },
                {
                  path: 'settings',
                  element: deferred(<AccountSettingsPage />),
                  handle: page('settings'),
                },
                {
                  path: '*',
                  element: deferred(<NotFoundView />),
                  handle: page('not-found'),
                },
              ],
            },
          ],
        },
        loadShell,
      ),
      // The root address, `/settings` from before record 0091 and every unknown
      // address name no workspace. Each one opens under the chosen workspace,
      // so it starts the frame and the home of a workspace as well. The root
      // is the start address of the installed application.
      startsEarly(
        {
          path: '*',
          element: (
            <RequireSession>{deferred(<WorkspaceHome />)}</RequireSession>
          ),
        },
        () => Promise.all([loadWorkspaceHome(), loadShell(), loadNotesHome()]),
      ),
    ],
  },
];

// The first address starts the modules of the routes that it matches.
early.start(routes, window.location.pathname);

const router = createBrowserRouter(routes);

/** The routed application. */
export function AppRouter(): ReactNode {
  return <RouterProvider router={router} />;
}
