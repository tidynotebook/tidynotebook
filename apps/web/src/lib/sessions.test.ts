import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountSession } from '@notesapp/api-client';
import {
  deviceName,
  otherSessionsEndedText,
  sessionFacts,
} from './sessions.ts';

const now = Date.parse('2026-09-27T12:00:00.000Z');

function session(extra: Partial<AccountSession> = {}): AccountSession {
  return {
    sessionId: 'session-1',
    current: false,
    userAgent: null,
    createdAt: '2026-09-20T12:00:00.000Z',
    lastActiveAt: '2026-09-27T10:00:00.000Z',
    expiresAt: '2026-10-20T12:00:00.000Z',
    ...extra,
  };
}

await test('a user agent reads as a browser on a system', () => {
  assert.equal(
    deviceName(
      'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
    ),
    'Firefox on Linux',
  );
  assert.equal(
    deviceName(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    ),
    'Safari on macOS',
  );
  assert.equal(
    deviceName(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
    ),
    'Edge on Windows',
  );
  assert.equal(
    deviceName(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1',
    ),
    'Chrome on iPhone',
  );
  assert.equal(
    deviceName(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
    ),
    'Chrome on Android',
  );
});

await test('a user agent that names less reads as less, and never as its text', () => {
  assert.equal(deviceName('Firefox/130.0'), 'Firefox');
  assert.equal(
    deviceName('Something (Windows NT 10.0)'),
    'A browser on Windows',
  );
  assert.equal(deviceName('curl/8.9.1'), 'An unknown device');
  assert.equal(deviceName(''), 'An unknown device');
  assert.equal(deviceName(null), 'An unknown device');
});

await test('the current session says this device and the others their last use', () => {
  assert.deepEqual(sessionFacts(session({ current: true }), now), [
    'This device',
    'Signed in 7 days ago',
  ]);
  assert.deepEqual(sessionFacts(session(), now), [
    'Active 2 hours ago',
    'Signed in 7 days ago',
  ]);
});

await test('the notice after the other sessions end counts with a whole phrase', () => {
  assert.equal(otherSessionsEndedText(0), 'No other device was signed in.');
  assert.equal(otherSessionsEndedText(1), '1 other device is signed out.');
  assert.equal(otherSessionsEndedText(3), '3 other devices are signed out.');
});
