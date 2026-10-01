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
  { key: 'profile', id: 'profile-heading', title: 'Profile' },
  { key: 'appearance', id: 'theme-heading', title: 'Appearance' },
  { key: 'spelling', id: 'spelling-heading', title: 'Spelling' },
  { key: 'daily-notes', id: 'daily-notes-heading', title: 'Daily notes' },
  { key: 'offline', id: 'offline-heading', title: 'Available offline' },
  { key: 'export', id: 'export-heading', title: 'Export' },
  { key: 'import', id: 'import-heading', title: 'Import' },
  { key: 'account', id: 'account-heading', title: 'Account' },
  { key: 'sessions', id: 'sessions-heading', title: 'Sessions' },
  { key: 'sign-out', id: 'signout-heading', title: 'Sign out' },
  {
    key: 'remove-account',
    id: 'remove-account-heading',
    title: 'Remove account',
  },
] as const;

/** The name of one section of Settings. */
export type SettingsSectionKey = (typeof settingsSections)[number]['key'];

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
