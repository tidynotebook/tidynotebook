import assert from 'node:assert/strict';
import test from 'node:test';
import {
  administrationSections,
  noteGroupHeadingId,
  noteGroupSections,
  sectionOf,
  settingsSections,
  visibleSettingsSections,
} from './page-sections.ts';
import { groupNotesByRecency } from './note-groups.ts';
import type { NoteSummary } from './note-list.ts';

/** Whether a string is one identifier token that holds no space. */
const isIdToken = (id: string): boolean => /^[a-z][a-z0-9-]*$/.test(id);

await test('each fixed list names each section and each heading once', () => {
  for (const sections of [settingsSections, administrationSections]) {
    const keys = sections.map((section) => section.key);
    const ids = sections.map((section) => section.id);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every(isIdToken));
  }
});

await test('a section of a fixed list reads its title and its heading', () => {
  assert.deepEqual(sectionOf(settingsSections, 'offline'), {
    id: 'offline-heading',
    title: 'Available offline',
  });
  assert.deepEqual(sectionOf(administrationSections, 'reports'), {
    id: 'reports-heading',
    title: 'Reports of published links',
  });
});

await test('Settings shows Billing only when the installation names a portal', () => {
  const keys = (accountPortal: boolean): string[] =>
    visibleSettingsSections({ accountPortal }).map((section) => section.key);
  // Billing opens the portal, so with no portal it would be a dead section.
  assert.ok(!keys(false).includes('billing'));
  assert.deepEqual(
    keys(false),
    settingsSections
      .map((section) => section.key)
      .filter((key) => key !== 'billing'),
  );
  // With a portal, Billing follows Account, and every section stays in order.
  assert.deepEqual(
    keys(true),
    settingsSections.map((section) => section.key),
  );
  assert.equal(
    keys(true).indexOf('billing'),
    keys(true).indexOf('account') + 1,
  );
  assert.deepEqual(sectionOf(settingsSections, 'billing'), {
    id: 'billing-heading',
    title: 'Billing',
  });
});

await test('the heading of a note group is one identifier with no space', () => {
  // The heading of `Earlier this week` read `group-Earlier this week`, which
  // is three identifiers to `aria-labelledby` and none to a link.
  assert.equal(
    noteGroupHeadingId('Earlier this week'),
    'group-earlier-this-week',
  );
  assert.equal(noteGroupHeadingId('Today'), 'group-today');
  assert.ok(isIdToken(noteGroupHeadingId('Earlier this month')));
});

await test('All notes lists one section for each group, in page order', () => {
  const day = 24 * 3_600_000;
  const now = Date.parse('2026-09-30T12:00:00.000Z');
  const note = (fileId: string, ago: number): NoteSummary => ({
    fileId,
    path: `${fileId}.md`,
    createdAt: new Date(now - ago).toISOString(),
    updatedAt: new Date(now - ago).toISOString(),
    localOnly: false,
    unsent: false,
  });
  const groups = groupNotesByRecency(
    [note('a', 3 * day), note('b', 1_000), note('c', 60 * day)],
    now,
  );
  assert.deepEqual(noteGroupSections(groups), [
    { id: 'group-today', title: 'Today' },
    { id: 'group-earlier-this-week', title: 'Earlier this week' },
    { id: 'group-older', title: 'Older' },
  ]);
});
