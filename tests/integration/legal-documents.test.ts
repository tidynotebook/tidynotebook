/**
 * The legal documents that an account accepts, through the served
 * composition (records 0114 and 0120).
 *
 * The installation names its terms and its privacy notice, a mail transport
 * of this test and a published origin, so it has every part that open
 * registration needs. Each check reads what a person gets and what the
 * account stored.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  acceptLegalDocuments,
  configureClient,
  createOwner,
  getAccount,
  getSetupStatus,
  getSignUpChallenge,
  signInWithPassword,
  signUpAccount,
  updateInstallation,
  verifyAddress,
} from '@notesapp/api-client';
import { leadingZeroBits, proofInput } from '@notesapp/core';
import {
  createApp,
  loadServerConfig,
  type MailMessage,
} from '@notesapp/server';
import { createDisposableDatabase, openSession } from './support/database.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

function memberOf(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

function cookieHeader(values: readonly string[]): string {
  return values
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-legal-test-'));

/** The environment of a server that names one version of the terms. */
function environment(termsVersion: string): Record<string, string> {
  return {
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_PUBLISHED_ORIGIN: 'http://pages.test',
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: 'legal-documents-test-secret-0123456789',
    NOTESAPP_LOG_LEVEL: 'silent',
    NOTESAPP_MAX_BODY_BYTES: '1048576',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_RATE_LIMIT_MAX: '10000',
    NOTESAPP_BREACH_CHECK: 'off',
    NOTESAPP_SIGNUP_DIFFICULTY: '8',
    NOTESAPP_TERMS_URL: 'https://example.test/terms',
    NOTESAPP_TERMS_VERSION: termsVersion,
    NOTESAPP_PRIVACY_URL: 'https://example.test/privacy',
    NOTESAPP_PRIVACY_VERSION: 'p1',
  };
}

const sent: MailMessage[] = [];
const mail = {
  send: (message: MailMessage): Promise<void> => {
    sent.push(message);
    return Promise.resolve();
  },
};

/** Starts one server and points the generated client at it. */
async function serve(termsVersion: string) {
  const app = await createApp(loadServerConfig(environment(termsVersion)), {
    mail,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address: string | AddressInfo | null = app.server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server did not bind a TCP port.');
  configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
  return app;
}

let app = await serve('t1');
const origin = { origin: 'http://127.0.0.1' };
const created = await createOwner({
  headers: origin,
  body: { email: 'owner@notes.invalid', password: 'owner-password-123456' },
});
assert.equal(responseOf(created.response).status, 201);
const owner = {
  ...origin,
  cookie: cookieHeader(responseOf(created.response).headers.getSetCookie()),
};

/** The consent that one account stored, read as the database owner. */
async function storedConsent(accountId: string): Promise<unknown[]> {
  const session = await openSession(database.migrationUrl);
  try {
    return await session.query(
      'select terms_version, privacy_version from account_consents where account_id = $1',
      [accountId],
    );
  } finally {
    await session.close();
  }
}

/** A proof of work for one sign-up. */
async function proof(): Promise<{ challenge: string; solution: string }> {
  const issued = await getSignUpChallenge({ headers: origin });
  assert.ok(issued.data !== undefined, JSON.stringify(issued.error));
  for (let counter = 0; ; counter += 1) {
    const solution = counter.toString(36);
    const digest = createHash('sha256')
      .update(proofInput(issued.data.value, solution))
      .digest();
    if (leadingZeroBits(digest) >= issued.data.difficulty)
      return { challenge: issued.data.challenge, solution };
  }
}

await test('the installation names both documents to a stranger', async () => {
  const status = await getSetupStatus();
  assert.deepEqual(status.data?.legalDocuments, {
    terms: { url: 'https://example.test/terms', version: 't1' },
    privacy: { url: 'https://example.test/privacy', version: 'p1' },
  });
});

await test('an account accepts the current versions, and the version is stored', async () => {
  const account = await getAccount({ headers: owner });
  assert.equal(account.data?.consentRequired, true);
  const stale = await acceptLegalDocuments({
    headers: owner,
    body: { termsVersion: 't0', privacyVersion: 'p1' },
  });
  assert.equal(responseOf(stale.response).status, 409);
  assert.equal(memberOf(stale.error, 'code'), 'consent_required');
  const accepted = await acceptLegalDocuments({
    headers: owner,
    body: { termsVersion: 't1', privacyVersion: 'p1' },
  });
  assert.equal(responseOf(accepted.response).status, 200);
  assert.equal(
    (await getAccount({ headers: owner })).data?.consentRequired,
    false,
  );
  assert.deepEqual(await storedConsent(account.data?.accountId ?? ''), [
    { terms_version: 't1', privacy_version: 'p1' },
  ]);
});

await test('an installation with every part opens registration', async () => {
  const opened = await updateInstallation({
    headers: owner,
    body: { registrationPolicy: 'open' },
  });
  assert.equal(opened.error, undefined, JSON.stringify(opened.error));
  assert.equal(opened.data?.registrationPolicy, 'open');
});

await test('a sign-up needs consent, and the new account keeps it', async () => {
  const email = `consent-${randomUUID()}@notes.invalid`;
  const password = 'consent-password-12345';
  const refused = await signUpAccount({
    headers: origin,
    body: { email, password, proof: await proof() },
  });
  assert.equal(responseOf(refused.response).status, 409);
  assert.equal(memberOf(refused.error, 'code'), 'consent_required');
  assert.equal(sent.filter((message) => message.to === email).length, 0);
  const taken = await signUpAccount({
    headers: origin,
    body: {
      email,
      password,
      proof: await proof(),
      consent: { termsVersion: 't1', privacyVersion: 'p1' },
    },
  });
  assert.equal(responseOf(taken.response).status, 202);
  const link = sent
    .filter((message) => message.to === email)
    .flatMap((message) => message.text.split('\n'))
    .find((line) => line.includes('/verify#'));
  const verified = await verifyAddress({
    headers: origin,
    body: { token: new URL(link ?? 'http://x/').hash.slice(1) },
  });
  assert.equal(responseOf(verified.response).status, 200);
  const signed = await signInWithPassword({
    headers: origin,
    body: { email, password },
  });
  const headers = {
    ...origin,
    cookie: cookieHeader(responseOf(signed.response).headers.getSetCookie()),
  };
  const account = await getAccount({ headers });
  assert.equal(account.data?.consentRequired, false);
  assert.deepEqual(await storedConsent(account.data?.accountId ?? ''), [
    { terms_version: 't1', privacy_version: 'p1' },
  ]);
});

await test('a raised version asks for consent again before the application opens', async () => {
  await app.close();
  app = await serve('t2');
  const account = await getAccount({ headers: owner });
  assert.equal(account.data?.consentRequired, true);
  const accepted = await acceptLegalDocuments({
    headers: owner,
    body: { termsVersion: 't2', privacyVersion: 'p1' },
  });
  assert.equal(responseOf(accepted.response).status, 200);
  assert.equal(
    (await getAccount({ headers: owner })).data?.consentRequired,
    false,
  );
});

await app.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
