/**
 * Web application routes.
 *
 * The one workspace of the account keeps its identifier in the address, so a
 * note link stays stable, but no screen names the workspace. Session
 * protection wraps every private route. Login and first-run setup use one
 * public page, and the link of an invitation opens the other.
 *
 * Every page a signed in person opens is a child of the workspace frame, so
 * each has the sidebar and the breadcrumb (record 0091). Each child names its
 * page in its `handle`, which is how the frame names the last breadcrumb part.
 * An address that names no workspace, the root address among them, opens the
 * same path under the chosen workspace, and that step has no sidebar.
 */
import { lazy, Suspense, type ReactNode } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { LoadingState, Page } from '@notesapp/ui';
import {
  AccountSettingsPage,
  LoginPage,
  RequireSession,
} from './features/accounts/accounts.tsx';
import type { FrameHandle } from './lib/breadcrumb.ts';
import {
  invitationRoute,
  signUpRoute,
  verificationRoute,
} from './lib/accounts.ts';
const Shell = lazy(async () => ({
  default: (await import('./shell/shell.tsx')).Shell,
}));
const NoteView = lazy(async () => ({
  default: (await import('./features/notes/note-view.tsx')).NoteView,
}));
const NotesHomeView = lazy(async () => ({
  default: (await import('./features/notes/notes-home.tsx')).NotesHomeView,
}));
const WorkspaceHome = lazy(async () => ({
  default: (await import('./shell/workspaces.tsx')).WorkspaceHome,
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
const PublishedLinksView = lazy(async () => ({
  default: (await import('./features/publishing/published-links.tsx'))
    .PublishedLinksView,
}));
const NotFoundView = lazy(async () => ({
  default: (await import('./shell/not-found.tsx')).NotFoundView,
}));

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

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // The page that an invitation link opens. It needs no session, and the
  // server writes the same path into every link.
  { path: invitationRoute, element: deferred(<InvitationPage />) },
  // Open registration (record 0114). The server writes the verification path
  // into every link.
  { path: signUpRoute, element: deferred(<SignUpPage />) },
  { path: verificationRoute, element: deferred(<VerifyPage />) },
  {
    path: '/w/:workspaceId',
    element: <RequireSession>{deferred(<Shell />)}</RequireSession>,
    children: [
      {
        index: true,
        element: deferred(<NotesHomeView />),
        handle: page('notes'),
      },
      {
        path: 'notes/:fileId',
        element: deferred(<NoteView />),
        handle: page('note'),
      },
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
        element: <AccountSettingsPage />,
        handle: page('settings'),
      },
      {
        path: '*',
        element: deferred(<NotFoundView />),
        handle: page('not-found'),
      },
    ],
  },
  // The root address, `/settings` from before record 0091 and every unknown
  // address name no workspace. Each one opens under the chosen workspace.
  {
    path: '*',
    element: <RequireSession>{deferred(<WorkspaceHome />)}</RequireSession>,
  },
]);

/** The routed application. */
export function AppRouter(): ReactNode {
  return <RouterProvider router={router} />;
}
