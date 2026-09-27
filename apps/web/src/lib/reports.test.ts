import assert from 'node:assert/strict';
import test from 'node:test';
import type { LinkReport } from '@notesapp/api-client';
import {
  canTakeDown,
  reportFacts,
  reportNotice,
  reportReasonWord,
} from './reports.ts';

const now = Date.parse('2026-09-27T12:00:00.000Z');

function report(extra: Partial<LinkReport> = {}): LinkReport {
  return {
    reportId: '11111111-1111-4111-8111-111111111111',
    publicationId: '22222222-2222-4222-8222-222222222222',
    reason: 'phishing',
    note: null,
    address: 'https://pages.example.net/published/token',
    linkState: 'live',
    createdAt: '2026-09-27T10:00:00.000Z',
    ...extra,
  };
}

await test('a report row names its reason in words', () => {
  assert.equal(reportReasonWord('phishing'), 'Phishing or fraud');
  assert.equal(reportReasonWord('other'), 'Other reason');
});

await test('a live report states its time, and a closed link says why', () => {
  assert.deepEqual(reportFacts(report(), now), ['Reported 2 hours ago']);
  assert.deepEqual(reportFacts(report({ linkState: 'taken-down' }), now), [
    'Reported 2 hours ago',
    'Taken down',
  ]);
  assert.deepEqual(
    reportFacts(report({ linkState: 'stopped', address: null }), now),
    [
      'Reported 2 hours ago',
      'The link stopped',
      'The address cannot be opened',
    ],
  );
});

await test('only a live link can be taken down', () => {
  assert.equal(canTakeDown(report()), true);
  assert.equal(canTakeDown(report({ linkState: 'taken-down' })), false);
  assert.equal(canTakeDown(report({ linkState: 'stopped' })), false);
});

await test('each change states what happened and what it did not change', () => {
  assert.match(reportNotice('take-down'), /opens nothing now/);
  assert.match(reportNotice('close'), /link stays/);
});
