/**
 * The sections of each page that lists them in its side region.
 *
 * A page of two or more sections lists them under "On this page" (decision
 * 0137). Each list here is the one source of its page: the page renders its
 * sections in the order of the list and reads the title and the heading of
 * each section from it, so the page and its list cannot disagree.
 */
import type { PageSection } from '@notesapp/ui';
import type { NoteGroup } from './note-groups.ts';

/** The sections of Settings, in page order. */
export const settingsSections = [
  { key: 'appearance', id: 'theme-heading', title: 'Appearance' },
  { key: 'spelling', id: 'spelling-heading', title: 'Spelling' },
  { key: 'daily-notes', id: 'daily-notes-heading', title: 'Daily notes' },
  { key: 'templates', id: 'templates-heading', title: 'Templates' },
  { key: 'offline', id: 'offline-heading', title: 'Offline' },
  { key: 'export', id: 'export-heading', title: 'Export' },
  { key: 'import', id: 'import-heading', title: 'Import' },
  { key: 'profile', id: 'profile-heading', title: 'Profile' },
  { key: 'account', id: 'account-heading', title: 'Account' },
  { key: 'billing', id: 'billing-heading', title: 'Billing' },
  { key: 'api-keys', id: 'api-keys-heading', title: 'API keys' },
  {
    key: 'connected-apps',
    id: 'connected-apps-heading',
    title: 'Connected apps',
  },
  { key: 'sessions', id: 'sessions-heading', title: 'Devices' },
  {
    key: 'remove-account',
    id: 'remove-account-heading',
    title: 'Delete account',
  },
] as const;

/** The name of one section of Settings. */
export type SettingsSectionKey = (typeof settingsSections)[number]['key'];

/** Related controls stay together, with deletion in its own region. */
export const settingsGroups: readonly {
  readonly title: string;
  readonly keys: readonly SettingsSectionKey[];
}[] = [
  { title: 'Appearance', keys: ['appearance'] },
  { title: 'Writing', keys: ['spelling', 'daily-notes', 'templates'] },
  { title: 'Data', keys: ['offline', 'export', 'import'] },
  {
    title: 'Account',
    keys: [
      'profile',
      'account',
      'billing',
      'api-keys',
      'connected-apps',
      'sessions',
    ],
  },
  { title: 'Danger zone', keys: ['remove-account'] },
];

/** One section of Settings, with its name. */
export type SettingsSection = (typeof settingsSections)[number];

/**
 * The sections of Settings that one account shows, in page order.
 *
 * Billing opens the account portal of the operator, so it shows only when
 * the installation names one (record 0211). The page and its side list both
 * read this list, so a hidden section is in neither.
 */
export function visibleSettingsSections(account: {
  readonly accountPortal: boolean;
  readonly mcpAuthorization?: boolean;
}): readonly SettingsSection[] {
  return settingsSections.filter(
    (section) =>
      (section.key !== 'billing' || account.accountPortal) &&
      (section.key !== 'connected-apps' || account.mcpAuthorization === true),
  );
}

/** The sections of the page that manages the accounts, in page order. */
export const administrationSections = [
  {
    key: 'registration',
    id: 'registration-heading',
    title: 'Who can make an account',
  },
  { key: 'mail', id: 'mail-heading', title: 'Mail' },
  { key: 'legal', id: 'legal-heading', title: 'Legal documents' },
  {
    key: 'reports',
    id: 'reports-heading',
    title: 'Reports of published links',
  },
  { key: 'invitations', id: 'invitations-heading', title: 'Invitations' },
  { key: 'accounts', id: 'accounts-heading', title: 'Accounts' },
] as const;

/** The name of one section of the page that manages the accounts. */
export type AdministrationSectionKey =
  (typeof administrationSections)[number]['key'];

/** One section of a fixed list, by its name. */
export function sectionOf<Key extends string>(
  sections: readonly (PageSection & { readonly key: Key })[],
  key: Key,
): PageSection {
  const section = sections.find((entry) => entry.key === key);
  if (section === undefined) throw new Error(`No section is named ${key}.`);
  return { id: section.id, title: section.title };
}

/**
 * The identifier of the heading of one group of All notes.
 *
 * The label is a phrase, for example `Earlier this week`, and an identifier
 * holds no space, so the words join with a hyphen.
 */
export function noteGroupHeadingId(label: string): string {
  return `group-${label.trim().toLowerCase().split(/\s+/).join('-')}`;
}

/** The sections of All notes: one for each group, in page order. */
export function noteGroupSections(
  groups: readonly NoteGroup[],
): readonly PageSection[] {
  return groups.map((group) => ({
    id: noteGroupHeadingId(group.label),
    title: group.label,
  }));
}
