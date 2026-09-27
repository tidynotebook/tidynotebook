import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isReportReason,
  maxReportNoteLength,
  reportNote,
  reportReasons,
} from './report.ts';

await test('a reason is one of the fixed list and nothing else', () => {
  for (const reason of reportReasons)
    assert.equal(isReportReason(reason), true);
  assert.equal(isReportReason('Phishing'), false);
  assert.equal(isReportReason(''), false);
  assert.equal(isReportReason('other '), false);
});

await test('a note of only space is no note, and a long note keeps its start', () => {
  assert.equal(reportNote(null), null);
  assert.equal(reportNote(''), null);
  assert.equal(reportNote('  \n '), null);
  assert.equal(
    reportNote('  It asks for my bank password. '),
    'It asks for my bank password.',
  );
  const long = 'é'.repeat(maxReportNoteLength + 5);
  assert.equal(Array.from(reportNote(long) ?? '').length, maxReportNoteLength);
});
