/**
 * The pages of the Settings modal and the addresses that open it (issue 517).
 *
 * Settings is a modal over the current page, never a page of its own. The
 * address keeps the page under it and names the open section in the
 * `settings` search parameter, so Back closes the modal and a link opens it.
 * An empty value is the section list of a phone, which a wide screen shows
 * beside the first section.
 *
 * The old routes and section anchors still open the modal: each one leads to
 * a page of this list, or to the first page when it names none.
 */
import { isSettingsRoute, searchWithSettings } from './settings-address.ts';
import { settingsSections, type SettingsSectionKey } from './page-sections.ts';

/** The groups of the modal sidebar, in order. */
export const settingsPageGroups = ['General', 'Workspace', 'Account'] as const;

/** One group of the modal sidebar. */
export type SettingsPageGroup = (typeof settingsPageGroups)[number];

/**
 * Each topic has one address. `scope` is the one short line under the title.
 * A page of the Workspace group writes the workspace name before its scope.
 */
export const settingsPages = [
  {
    path: 'appearance',
    title: 'Appearance and editor',
    group: 'General',
    sections: ['appearance', 'spelling'],
    scope: 'Follows your account to every device. Changes apply at once.',
  },
  {
    path: 'offline',
    title: 'Offline',
    group: 'General',
    sections: ['offline'],
    scope: 'This device only. Notes are always kept on this device.',
  },
  {
    path: 'daily-notes',
    title: 'Daily notes',
    group: 'Workspace',
    sections: ['daily-notes'],
    scope:
      'workspace, on every device. The calendar in the sidebar opens a day.',
  },
  {
    path: 'templates',
    title: 'Templates',
    group: 'Workspace',
    sections: ['templates'],
    scope: 'workspace, on every device.',
  },
  {
    path: 'export-import',
    title: 'Export and import',
    group: 'Workspace',
    sections: ['export', 'import'],
    scope: 'workspace.',
  },
  {
    path: 'account',
    title: 'Account',
    group: 'Account',
    sections: ['profile', 'account', 'remove-account'],
    scope: 'Your account owns every note in your workspaces.',
  },
  {
    path: 'billing',
    title: 'Plan and billing',
    group: 'Account',
    sections: ['billing'],
    scope: 'Your plan, payment method and invoices.',
  },
  {
    path: 'devices',
    title: 'Devices',
    group: 'Account',
    sections: ['sessions'],
    scope: 'Signed in to your account.',
  },
  {
    path: 'api-keys-apps',
    title: 'API keys and apps',
    group: 'Account',
    sections: ['api-keys', 'connected-apps'],
    scope: 'Each key has all your current access.',
  },
] as const satisfies readonly {
  readonly path: string;
  readonly title: string;
  readonly group: SettingsPageGroup;
  readonly sections: readonly SettingsSectionKey[];
  readonly scope: string;
}[];

/** One page of Settings. */
export type SettingsPage = (typeof settingsPages)[number];

/** The address of one page of Settings. */
export type SettingsPagePath = SettingsPage['path'];

/**
 * The old page addresses that are now a part of another page.
 *
 * Spelling is a row of Appearance and editor (item 7), Profile and email is
 * Account, and Sign out is in the account menu. Devices states that, so the
 * old Sign out address opens it.
 */
const legacyPages: Readonly<Record<string, SettingsPagePath>> = {
  spelling: 'appearance',
  profile: 'account',
  'sign-out': 'devices',
};

/** The old anchors whose section left Settings. */
const legacyAnchors: Readonly<Record<string, SettingsPagePath>> = {
  'signout-heading': 'devices',
};

/** The page that an address names, or `null` when it names none of them. */
export function settingsPageOf(path: string): SettingsPagePath | null {
  const page = settingsPages.find((item) => item.path === path);
  return page?.path ?? legacyPages[path] ?? null;
}

/** Redirect all old section anchors, including the merged topics. */
export function settingsPageForAnchor(hash: string): SettingsPagePath | null {
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  const legacy = legacyAnchors[id];
  if (legacy !== undefined) return legacy;
  const section = settingsSections.find((item) => item.id === id);
  if (section === undefined) return null;
  return (
    settingsPages.find((page) =>
      page.sections.some((key) => key === section.key),
    )?.path ?? null
  );
}

/** Server capabilities control the same rows as before. */
export function visibleSettingsPages(account: {
  readonly accountPortal: boolean;
  readonly mcpAuthorization?: boolean;
}) {
  return settingsPages
    .filter((page) => page.path !== 'billing' || account.accountPortal)
    .map((page) => ({
      ...page,
      title:
        page.path === 'api-keys-apps' && account.mcpAuthorization !== true
          ? 'API keys'
          : page.title,
      sections: page.sections.filter(
        (key) => key !== 'connected-apps' || account.mcpAuthorization === true,
      ),
    }));
}

/**
 * Where an old Settings address opens the modal (issue 517, item 5).
 *
 * The modal opens over the last page of the workspace in this tab, or over
 * All notes when there is none. The last page never is a Settings route,
 * and a value from another workspace never counts.
 */
export function legacySettingsTarget({
  workspaceId,
  lastRoute,
  settingsPage,
  hash,
}: {
  readonly workspaceId: string;
  readonly lastRoute: string | null;
  readonly settingsPage: string | undefined;
  readonly hash: string;
}): string {
  const home = `/w/${workspaceId}`;
  const base =
    lastRoute !== null &&
    (lastRoute === home ||
      lastRoute.startsWith(`${home}/`) ||
      lastRoute.startsWith(`${home}?`)) &&
    !isSettingsRoute(lastRoute.split('?')[0] ?? '')
      ? lastRoute
      : home;
  const [path = home, search = ''] = base.split('?');
  const page =
    settingsPageForAnchor(hash) ??
    (settingsPage === undefined
      ? ''
      : (settingsPageOf(settingsPage) ?? settingsPages[0].path));
  return `${path}${searchWithSettings(search, page)}`;
}
