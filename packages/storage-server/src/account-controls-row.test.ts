import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountControlsOf,
  controlsParameters,
  type AccountControlsRow,
} from './account-controls-row.ts';

const row: AccountControlsRow = {
  standing: 'locked',
  removal_at: new Date('2026-11-04T00:00:00.000Z'),
  limit_bytes: '10000000000',
  text_limit_bytes: null,
  published_transfer_limit_bytes: '10000000000',
  download_limit_bytes: null,
  teams: false,
  collaboration: true,
  controls_revision: '7',
};

await test('a row reads as the controls, with null as no limit', () => {
  const controls = accountControlsOf(row);
  assert.deepEqual(controls, {
    revision: 7,
    standing: 'locked',
    removalAt: '2026-11-04T00:00:00.000Z',
    limitBytes: 10_000_000_000n,
    textLimitBytes: null,
    publishedTransferLimitBytes: 10_000_000_000n,
    downloadLimitBytes: null,
    features: { teams: false, collaboration: true },
  });
  // The parameters of a write carry the same values back.
  assert.deepEqual(controlsParameters(7, controls), [
    '7',
    'locked',
    '2026-11-04T00:00:00.000Z',
    '10000000000',
    null,
    '10000000000',
    null,
    false,
    true,
  ]);
});

await test('a row with an unknown standing or revision is a defect', () => {
  assert.throws(() => accountControlsOf({ ...row, standing: 'paused' }));
  assert.throws(() => accountControlsOf({ ...row, controls_revision: '0' }));
  assert.throws(() =>
    accountControlsOf({ ...row, controls_revision: '9007199254740993' }),
  );
});
