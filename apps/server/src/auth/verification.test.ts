import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationTokens } from './verification.ts';

const secret = 'verification-test-secret-0123456789abcdef';
const now = new Date('2026-09-27T12:00:00.000Z');
const later = new Date('2026-09-28T12:00:00.000Z');

await test('a token names its identity user until it stops', () => {
  const tokens = createVerificationTokens(secret);
  const token = tokens.issue('user-abc', later, null);
  assert.match(token, /^[A-Za-z0-9_.-]+$/);
  assert.deepEqual(tokens.read(token, now), {
    authUserId: 'user-abc',
    consent: null,
  });
  assert.equal(tokens.read(token, later), null);
  // The versions that the person accepted travel under the signature.
  const consent = { termsVersion: '2026-09', privacyVersion: '3' };
  assert.deepEqual(tokens.read(tokens.issue('user-abc', later, consent), now), {
    authUserId: 'user-abc',
    consent,
  });
});

await test('a forged, changed or foreign token names nobody', () => {
  const tokens = createVerificationTokens(secret);
  const token = tokens.issue('user-abc', later, null);
  const [version, user, expiry, consent, signature] = token.split('.');
  const other = Buffer.from('user-xyz').toString('base64url');
  assert.equal(
    tokens.read(`${version}.${other}.${expiry}.${consent}.${signature}`, now),
    null,
  );
  // A consent written in afterwards breaks the signature.
  const written = Buffer.from(JSON.stringify(['1', '1'])).toString('base64url');
  assert.equal(
    tokens.read(`${version}.${user}.${expiry}.${written}.${signature}`, now),
    null,
  );
  assert.equal(
    tokens.read(
      token.replace(`.${expiry}.`, `.${String(Number(expiry) + 3600)}.`),
      now,
    ),
    null,
  );
  assert.equal(
    createVerificationTokens(`${secret}-other`).read(token, now),
    null,
  );
  for (const value of [
    '',
    'v1',
    'v1.a.b',
    `v2.${token.slice(3)}`,
    `${token}.x`,
  ])
    assert.equal(tokens.read(value, now), null, value);
});
