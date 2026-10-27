/**
 * The old Settings routes (issue 517, item 5).
 *
 * `/w/:id/settings`, `/w/:id/settings/:page` and the old section anchors open
 * the Settings modal over the last page of the workspace in this tab, which
 * `settings-modal.tsx` records, or over All notes when there is none. The
 * route loads this module only when an old address opens.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { lastRouteKey } from '../lib/settings-address.ts';
import { legacySettingsTarget } from '../lib/settings-routes.ts';

/** Reads one value of the session storage of this tab, or `null`. */
function readTab(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** An old Settings route: the modal over the last page of the workspace. */
export function LegacySettingsRedirect(): ReactNode {
  const params = useParams();
  const location = useLocation();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : '';
  return (
    <Navigate
      replace
      to={legacySettingsTarget({
        workspaceId,
        lastRoute: readTab(lastRouteKey(workspaceId)),
        settingsPage: params.settingsPage,
        hash: location.hash,
      })}
    />
  );
}
