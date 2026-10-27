import { settingsSections, type SettingsSectionKey } from './page-sections.ts';

/** Each topic has one address. Legacy sections remain valid entry points. */
export const settingsPages = [
  {
    path: 'appearance',
    title: 'Appearance',
    group: 'General',
    sections: ['appearance'],
    help: 'System follows your device.',
  },
  {
    path: 'spelling',
    title: 'Spelling',
    group: 'General',
    sections: ['spelling'],
    help: '',
  },
  {
    path: 'daily-notes',
    title: 'Daily notes',
    group: 'Notes',
    sections: ['daily-notes'],
    help: '',
  },
  {
    path: 'templates',
    title: 'Templates',
    group: 'Notes',
    sections: ['templates'],
    help: 'Notes in this folder show in "Use template".',
  },
  {
    path: 'offline',
    title: 'Offline',
    group: 'Notes',
    sections: ['offline'],
    help: 'Notes are always on this device. Choose what else to keep.',
  },
  {
    path: 'export-import',
    title: 'Export and import',
    group: 'Notes',
    sections: ['export', 'import'],
    help: '',
  },
  {
    path: 'profile',
    title: 'Profile and email',
    group: 'Account',
    sections: ['profile', 'account', 'remove-account'],
    help: '',
  },
  {
    path: 'billing',
    title: 'Plan and billing',
    group: 'Account',
    sections: ['billing'],
    help: '',
  },
  {
    path: 'devices',
    title: 'Devices',
    group: 'Account',
    sections: ['sessions'],
    help: 'Signed in to your account.',
  },
  {
    path: 'api-keys-apps',
    title: 'API keys and apps',
    group: 'Account',
    sections: ['api-keys', 'connected-apps'],
    help: '',
  },
  {
    path: 'sign-out',
    title: 'Sign out',
    group: 'Account',
    sections: ['sign-out'],
    help: '',
  },
] as const satisfies readonly {
  readonly path: string;
  readonly title: string;
  readonly group: string;
  readonly sections: readonly SettingsSectionKey[];
  readonly help: string;
}[];

/** Redirect all old section anchors, including the merged topics. */
export function settingsPageForAnchor(hash: string): string | null {
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
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
