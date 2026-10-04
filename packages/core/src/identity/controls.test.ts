import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyControlsChange,
  maxAccountLimitBytes,
  maxRemoveAfterDays,
  newAccountSettingsHold,
  type AccountControls,
} from './controls.ts';

const active: AccountControls = {
  revision: 4,
  standing: 'active',
  removalAt: null,
  limitBytes: 1000n,
  textLimitBytes: null,
  publishedTransferLimitBytes: null,
  downloadLimitBytes: null,
  features: { teams: true, collaboration: true },
};

const locked: AccountControls = {
  ...active,
  standing: 'locked',
  removalAt: '2026-11-04T00:00:00.000Z',
};

await test('a change keeps every control that it does not name', () => {
  const changed = applyControlsChange(active, {
    revision: 4,
    textLimitBytes: 500n,
    features: { teams: false },
  });
  assert.deepEqual(changed, {
    ok: true,
    value: {
      ...active,
      textLimitBytes: 500n,
      features: { teams: false, collaboration: true },
    },
  });
  // A null limit is no limit.
  const unlimited = applyControlsChange(
    { ...active, downloadLimitBytes: 20n },
    { revision: 4, downloadLimitBytes: null },
  );
  assert.ok(unlimited.ok);
  assert.equal(unlimited.value.downloadLimitBytes, null);
});

await test('a change made from an old revision is refused', () => {
  assert.deepEqual(
    applyControlsChange(active, { revision: 3, standing: 'locked' }),
    { ok: false, error: { code: 'controls_changed', fileIds: [] } },
  );
});

await test('a locked account keeps its removal time, and active clears it', () => {
  const lock = applyControlsChange(active, {
    revision: 4,
    standing: 'locked',
    removalAt: '2026-11-04T00:00:00Z',
  });
  assert.ok(lock.ok);
  assert.equal(lock.value.removalAt, '2026-11-04T00:00:00.000Z');
  // A limit changes and the standing stays, so the time stays too.
  const limit = applyControlsChange(locked, { revision: 4, limitBytes: 9n });
  assert.ok(limit.ok);
  assert.equal(limit.value.removalAt, locked.removalAt);
  // Setting the standing to active clears the removal time (record 0201).
  const unlock = applyControlsChange(locked, {
    revision: 4,
    standing: 'active',
  });
  assert.ok(unlock.ok);
  assert.equal(unlock.value.standing, 'active');
  assert.equal(unlock.value.removalAt, null);
});

await test('only a locked account takes a removal time', () => {
  const refused = { ok: false, error: { code: 'forbidden', fileIds: [] } };
  assert.deepEqual(
    applyControlsChange(active, {
      revision: 4,
      removalAt: '2026-11-04T00:00:00Z',
    }),
    refused,
  );
  assert.deepEqual(
    applyControlsChange(locked, {
      revision: 4,
      standing: 'active',
      removalAt: '2026-11-04T00:00:00Z',
    }),
    refused,
  );
  assert.deepEqual(
    applyControlsChange(locked, { revision: 4, removalAt: 'tomorrow' }),
    refused,
  );
  assert.deepEqual(
    applyControlsChange(active, { revision: 4, standing: 'paused' }),
    refused,
  );
});

await test('a limit stays inside the bounds of a JSON number', () => {
  const refused = { ok: false, error: { code: 'forbidden', fileIds: [] } };
  assert.deepEqual(
    applyControlsChange(active, { revision: 4, limitBytes: 0n }),
    refused,
  );
  assert.deepEqual(
    applyControlsChange(active, {
      revision: 4,
      textLimitBytes: maxAccountLimitBytes + 1n,
    }),
    refused,
  );
  assert.ok(
    applyControlsChange(active, {
      revision: 4,
      publishedTransferLimitBytes: maxAccountLimitBytes,
    }).ok,
  );
});

await test('a new account takes a removal time only when it starts locked', () => {
  const day = 24 * 60 * 60;
  assert.equal(
    newAccountSettingsHold({
      limitBytes: 1n,
      standing: 'active',
      removeAfterSeconds: null,
    }),
    true,
  );
  assert.equal(
    newAccountSettingsHold({
      limitBytes: 1n,
      standing: 'locked',
      removeAfterSeconds: 30 * day,
    }),
    true,
  );
  assert.equal(
    newAccountSettingsHold({
      limitBytes: 1n,
      standing: 'active',
      removeAfterSeconds: 30 * day,
    }),
    false,
  );
  assert.equal(
    newAccountSettingsHold({
      limitBytes: 1n,
      standing: 'locked',
      removeAfterSeconds: (maxRemoveAfterDays + 1) * day,
    }),
    false,
  );
  assert.equal(
    newAccountSettingsHold({
      limitBytes: 0n,
      standing: 'active',
      removeAfterSeconds: null,
    }),
    false,
  );
});
