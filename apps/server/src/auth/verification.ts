/**
 * The token of a verification link of open registration (record 0114).
 *
 * The link names one identity user and the instant that it stops. The server
 * signs both with HMAC-SHA256 under a key that HKDF derives from the secret of
 * the server, so nobody can write a token for another user or a later
 * instant. The token names the identity user and not the address: a second
 * sign-up for a pending address replaces its identity user, so every link of
 * the replaced sign-up opens nothing, including a link that went to the
 * address because somebody else signed up with it.
 *
 * The token also carries the versions of the legal documents that the person
 * accepted at the sign-up (record 0120), so the account stores that consent
 * when the link makes it.
 */
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { ConsentVersions } from '@notesapp/core';

/** The version mark of a token, so a later scheme can sit beside it. */
const tokenVersion = 'v1';

/** The purpose that the key derivation binds, so no other key equals it. */
const keyPurpose = 'notesapp address verification';

/** What a valid token names. */
export type VerificationClaim = {
  readonly authUserId: string;
  /** The versions that the person accepted at the sign-up, or `null`. */
  readonly consent: ConsentVersions | null;
};

/** Issues and reads the tokens of verification links. */
export type VerificationTokens = {
  /** The token of one identity user, which stops at `expiresAt`. */
  issue(
    authUserId: string,
    expiresAt: Date,
    consent: ConsentVersions | null,
  ): string;
  /** What a valid token names, or `null` for any other value. */
  read(token: string, now: Date): VerificationClaim | null;
};

/** The consent part of a token: the two versions, or a dash for none. */
function consentPart(consent: ConsentVersions | null): string {
  if (consent === null) return '-';
  return Buffer.from(
    JSON.stringify([consent.termsVersion, consent.privacyVersion]),
  ).toString('base64url');
}

/** The consent of a signed part, or `null` for none. */
function consentOf(part: string): ConsentVersions | null {
  if (part === '-') return null;
  const value: unknown = JSON.parse(
    Buffer.from(part, 'base64url').toString('utf8'),
  );
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'string' ||
    typeof value[1] !== 'string'
  )
    return null;
  return { termsVersion: value[0], privacyVersion: value[1] };
}

/** Builds the tokens of one server secret. */
export function createVerificationTokens(secret: string): VerificationTokens {
  const key = Buffer.from(
    hkdfSync('sha256', secret, 'notesapp', keyPurpose, 32),
  );
  const sign = (body: string): string =>
    createHmac('sha256', key).update(body).digest('base64url');
  return {
    issue(authUserId, expiresAt, consent) {
      const body = `${tokenVersion}.${Buffer.from(authUserId).toString('base64url')}.${String(Math.floor(expiresAt.getTime() / 1000))}.${consentPart(consent)}`;
      return `${body}.${sign(body)}`;
    },
    read(token, now) {
      const parts = token.split('.');
      if (parts.length !== 5) return null;
      const [version, user, expiry, consent, signature] = parts;
      if (
        version !== tokenVersion ||
        user === undefined ||
        expiry === undefined ||
        consent === undefined ||
        signature === undefined ||
        !/^\d{1,12}$/.test(expiry)
      )
        return null;
      const expected = Buffer.from(
        sign(`${version}.${user}.${expiry}.${consent}`),
      );
      const given = Buffer.from(signature);
      if (given.length !== expected.length || !timingSafeEqual(given, expected))
        return null;
      if (Number(expiry) * 1000 <= now.getTime()) return null;
      const authUserId = Buffer.from(user, 'base64url').toString('utf8');
      return authUserId === ''
        ? null
        : { authUserId, consent: consentOf(consent) };
    },
  };
}
