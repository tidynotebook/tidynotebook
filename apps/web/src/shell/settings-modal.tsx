/**
 * Settings as a modal over the current page (issue 517, item 5).
 *
 * The frame mounts {@link SettingsModalHost} once. It reads the `settings`
 * search parameter of the address, so any page of the workspace can show
 * Settings and the page under it stays mounted, with its scroll, caret and
 * unsaved state. Opening adds one history entry, so Back closes the modal.
 * Close removes the parameter: it goes back when this tab opened the modal,
 * and replaces the address when a link or a reload opened it.
 *
 * The body of the modal loads when it first opens, in its own suspense
 * boundary, so the page under it never shows a loading state and the first
 * screen of the frame reads none of it (record 0177).
 *
 * The old Settings routes render `LegacySettingsRedirect` of
 * `legacy-settings.tsx`, which opens the modal over the last page of the
 * workspace in this tab that this host records.
 */
import { lazy, Suspense, useCallback, useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  isSettingsRoute,
  lastRouteKey,
  searchWithSettings,
  settingsValueOf,
} from '../lib/settings-address.ts';
import { initialOf } from '../lib/initial.ts';
import { useSession } from '../app.tsx';

/** Loads the old Settings routes, which the frame chunk owns. */
export function loadLegacySettings() {
  return import('./legacy-settings.tsx');
}

const SettingsModal = lazy(async () => ({
  default: (await import('../features/accounts/account-settings.tsx'))
    .SettingsModal,
}));

/** The history state that marks an entry this tab added to open Settings. */
const openedHere = 'settingsOpenedHere';

/** The element that opened Settings, so Close gives the focus back to it. */
let opener: HTMLElement | null = null;

/** A copy of a history state as a plain record, or an empty one. */
function stateRecord(state: unknown): Record<string, unknown> {
  return state !== null && typeof state === 'object'
    ? Object.fromEntries(Object.entries(state))
    : {};
}

/** Writes one value of the session storage of this tab, when it can. */
function writeTab(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // A tab with no storage opens old Settings links over All notes.
  }
}

/**
 * Opens Settings over the current page at one section.
 *
 * `page` is the address of a section, or an empty string for the section
 * list. `from` is the control to focus when Settings closes; without it the
 * element that has the focus now takes it back.
 */
export function useOpenSettings(): (
  page?: string,
  from?: HTMLElement | null,
) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const state: unknown = location.state;
  return useCallback(
    (page = '', from?: HTMLElement | null): void => {
      const active = document.activeElement;
      opener =
        from ??
        (active instanceof HTMLElement && active !== document.body
          ? active
          : null);
      const open = settingsValueOf(location.search) !== null;
      void navigate(
        {
          pathname: location.pathname,
          search: searchWithSettings(location.search, page),
          hash: location.hash,
        },
        {
          // A section change inside the open modal replaces its entry, so
          // Back closes Settings and does not walk through its sections.
          replace: open,
          state: open ? state : { ...stateRecord(state), [openedHere]: true },
        },
      );
    },
    [navigate, location, state],
  );
}

/** The modal of Settings when the address asks for it, and nothing else. */
export function SettingsModalHost({
  workspaceId,
}: {
  readonly workspaceId: string;
}): ReactNode {
  const location = useLocation();
  const navigate = useNavigate();
  const account = useSession().account;
  const value = settingsValueOf(location.search);
  const state: unknown = location.state;

  // The last page of the workspace in this tab, where an old Settings link
  // opens the modal. The open section is not a part of it.
  useEffect(() => {
    if (isSettingsRoute(location.pathname)) return;
    writeTab(
      lastRouteKey(workspaceId),
      `${location.pathname}${searchWithSettings(location.search, null)}`,
    );
  }, [workspaceId, location.pathname, location.search]);

  /** Opens one section in place, or closes Settings for `null`. */
  const show = useCallback(
    (page: string | null): void => {
      if (page === null && stateRecord(state)[openedHere] === true) {
        void navigate(-1);
        return;
      }
      void navigate(
        {
          pathname: location.pathname,
          search: searchWithSettings(location.search, page),
          hash: location.hash,
        },
        { replace: true, state },
      );
    },
    [navigate, location, state],
  );

  // A modal that this tab opened gives the focus back to its opener. An old
  // link or a reload has none, and the dialog keeps the focus it found.
  const returnFocus = useCallback((): void => {
    const target = opener;
    opener = null;
    target?.focus();
  }, []);

  if (value === null) return null;
  return (
    <Suspense fallback={null}>
      <SettingsModal
        workspaceId={workspaceId}
        initial={initialOf(account?.name ?? account?.email ?? '')}
        value={value}
        onChoose={show}
        onClose={() => {
          show(null);
        }}
        returnFocus={opener?.isConnected === true ? returnFocus : undefined}
      />
    </Suspense>
  );
}
