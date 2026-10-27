/**
 * The address of the Settings modal (issue 517, item 5).
 *
 * The frame reads and writes the `settings` search parameter on every page,
 * so this module holds only that and stays small. The list of pages lives in
 * `settings-routes.ts`, which loads with the modal.
 */
import { queryValue, queryWith } from './address-query.ts';

/** The search parameter that holds the open section of Settings. */
export const settingsParam = 'settings';

/**
 * The value of the `settings` parameter, or `null` when Settings is closed.
 *
 * An empty value is the section list. The modal reads an old page as its new
 * page, and any other value as the first page.
 */
export function settingsValueOf(search: string): string | null {
  return queryValue(search, settingsParam);
}

/** The search of an address with Settings open at one page, or closed. */
export function searchWithSettings(
  search: string,
  page: string | null,
): string {
  return queryWith(search, settingsParam, page);
}

/** Whether a path is an old Settings route of the frame. */
export function isSettingsRoute(pathname: string): boolean {
  return /^\/w\/[^/]+\/settings(\/|$)/.test(pathname);
}

/** The key of the last page of one workspace in this tab. */
export function lastRouteKey(workspaceId: string): string {
  return `notesapp.last-route.${workspaceId}`;
}
