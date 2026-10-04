import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountControls } from '@notesapp/api-client';
import { controlsChangeOf, controlsFormOf } from './account-controls.ts';

const now = Date.parse('2026-10-04T12:00:00.000Z');
const gigabyte = 1024 ** 3;

const active: AccountControls = {
  revision: 3,
  standing: 'active',
  removalAt: null,
  limitBytes: 5 * gigabyte,
  textLimitBytes: null,
  publishedTransferLimitBytes: null,
  downloadLimitBytes: 2 * gigabyte,
  features: { teams: true, collaboration: true },
};

await test('the form shows the stored controls in gigabytes and days', () => {
  assert.deepEqual(controlsFormOf(active, now), {
    standing: 'active',
    removeInDays: '',
    storageGigabytes: '5',
    textGigabytes: '',
    transferGigabytes: '',
    downloadGigabytes: '2',
    teams: true,
    collaboration: true,
  });
  const locked = controlsFormOf(
    { ...active, standing: 'locked', removalAt: '2026-10-11T12:00:00.000Z' },
    now,
  );
  assert.equal(locked.removeInDays, '7');
});

await test('a saved form names the revision that the page read', () => {
  const form = {
    ...controlsFormOf(active, now),
    standing: 'locked' as const,
    removeInDays: '30',
    textGigabytes: '1',
    downloadGigabytes: '',
    teams: false,
  };
  assert.deepEqual(controlsChangeOf(form, active, now), {
    ok: true,
    change: {
      revision: 3,
      standing: 'locked',
      removalAt: '2026-11-03T12:00:00.000Z',
      limitBytes: 5 * gigabyte,
      textLimitBytes: gigabyte,
      publishedTransferLimitBytes: null,
      downloadLimitBytes: null,
      features: { teams: false, collaboration: true },
    },
  });
});

await test('a save that keeps the removal time does not move it', () => {
  const locked: AccountControls = {
    ...active,
    standing: 'locked',
    removalAt: '2026-10-11T12:00:00.000Z',
  };
  const kept = controlsChangeOf(controlsFormOf(locked, now), locked, now);
  assert.ok(kept.ok);
  assert.equal('removalAt' in kept.change, false);
  // Active again: the server clears the time, so the change names none.
  const unlocked = controlsChangeOf(
    { ...controlsFormOf(locked, now), standing: 'active' },
    locked,
    now,
  );
  assert.ok(unlocked.ok);
  assert.equal(unlocked.change.standing, 'active');
  assert.equal('removalAt' in unlocked.change, false);
  // An empty field takes the time away.
  const none = controlsChangeOf(
    { ...controlsFormOf(locked, now), removeInDays: '' },
    locked,
    now,
  );
  assert.ok(none.ok);
  assert.equal(none.change.removalAt, null);
});

await test('a form that a person must correct names its field', () => {
  const form = controlsFormOf(active, now);
  assert.deepEqual(
    controlsChangeOf({ ...form, storageGigabytes: '' }, active, now),
    {
      ok: false,
      problem: {
        field: 'storageGigabytes',
        message: 'Enter a number of gigabytes above zero.',
      },
    },
  );
  const text = controlsChangeOf(
    { ...form, textGigabytes: 'lots' },
    active,
    now,
  );
  assert.equal(text.ok ? '' : text.problem.field, 'textGigabytes');
  const days = controlsChangeOf(
    { ...form, standing: 'locked', removeInDays: '0' },
    active,
    now,
  );
  assert.equal(days.ok ? '' : days.problem.field, 'removeInDays');
});

await test('a save keeps each limit that a person did not change exactly', () => {
  // Two decimals of a gigabyte cannot show these limits exactly. A save of
  // another control must send them back as they are, and a 1 byte limit
  // that shows as 0 must not block the save.
  const odd: AccountControls = {
    ...active,
    limitBytes: 1,
    textLimitBytes: 5 * gigabyte + 12_345,
    publishedTransferLimitBytes: gigabyte + 7,
    downloadLimitBytes: 3,
  };
  const saved = controlsChangeOf(
    { ...controlsFormOf(odd, now), teams: false },
    odd,
    now,
  );
  assert.deepEqual(saved, {
    ok: true,
    change: {
      revision: 3,
      standing: 'active',
      limitBytes: 1,
      textLimitBytes: 5 * gigabyte + 12_345,
      publishedTransferLimitBytes: gigabyte + 7,
      downloadLimitBytes: 3,
      features: { teams: false, collaboration: true },
    },
  });
  // A field that a person edits is read from its text.
  const edited = controlsChangeOf(
    { ...controlsFormOf(odd, now), storageGigabytes: '6', textGigabytes: '' },
    odd,
    now,
  );
  assert.ok(edited.ok);
  assert.equal(edited.change.limitBytes, 6 * gigabyte);
  assert.equal(edited.change.textLimitBytes, null);
  assert.equal(edited.change.downloadLimitBytes, 3);
  // An edited field that shows 0 still needs a correction.
  const zero = controlsChangeOf(
    { ...controlsFormOf(odd, now), transferGigabytes: '0' },
    odd,
    now,
  );
  assert.equal(zero.ok ? '' : zero.problem.field, 'transferGigabytes');
});
