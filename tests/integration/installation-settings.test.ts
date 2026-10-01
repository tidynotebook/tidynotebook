/**
 * The mail transport and the legal documents that an administrator sets in
 * the application, through the served composition (record 0148).
 *
 * One server has no setting in its environment, so an administrator sets
 * both groups through the generated client. A second server over the same
 * database names both groups in its environment, so each is locked there.
 * Each check reads what a person gets and what the database holds.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createInvitation,
  createOwner,
  getAccount,
  getInstallation,
  getLegalDocumentSettings,
  getSetupStatus,
  getSignUpChallenge,
  registerAccount,
  removeLegalDocument,
  removeMailSettings,
  requestPasswordReset,
  sendTestMessage,
  updateInstallation,
  updateLegalDocument,
  updateMailSettings,
} from '@notesapp/api-client';
import {
  createApp,
  loadServerConfig,
  type ApplicationMail,
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
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-settings-test-'));
const environment = {
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_PUBLISHED_ORIGIN: 'http://pages.test',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'installation-settings-test-secret-0123456789',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
  NOTESAPP_RATE_LIMIT_MAX: '10000',
  NOTESAPP_BREACH_CHECK: 'off',
};

/** What each transport of the stored settings was built with, and sent. */
const connected: ApplicationMail[] = [];
const sent: MailMessage[] = [];
/** A failure that the next message of the stored transport throws. */
let failure: unknown = null;

/** Starts one server and points the generated client at it. */
async function serve(
  extra: Readonly<Record<string, string>> = {},
  mail?: { send: (message: MailMessage) => Promise<void> },
) {
  const served = await createApp(
    loadServerConfig({ ...environment, ...extra }),
    {
      ...(mail === undefined ? {} : { mail }),
      connectMail: (settings) => {
        connected.push(settings);
        return {
          send: (message) => {
            if (failure !== null) return Promise.reject(failure);
            sent.push(message);
            return Promise.resolve();
          },
        };
      },
    },
  );
  await served.listen({ host: '127.0.0.1', port: 0 });
  const address: string | AddressInfo | null = served.server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server did not bind a TCP port.');
  configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
  return { served };
}

let current = await serve();
const origin = { origin: 'http://127.0.0.1' };
const ownerEmail = 'owner@notes.invalid';
const created = await createOwner({
  headers: origin,
  body: { email: ownerEmail, password: 'owner-password-123456' },
});
assert.equal(responseOf(created.response).status, 201);
const owner = {
  ...origin,
  cookie: cookieHeader(responseOf(created.response).headers.getSetCookie()),
};

/** The stored row, read as the database owner. */
async function storedRow(): Promise<Record<string, unknown>> {
  const session = await openSession(database.migrationUrl);
  try {
    const [row] = await session.query<Record<string, unknown>>(
      'select * from installation_settings',
    );
    return row ?? {};
  } finally {
    await session.close();
  }
}

/** The served page of one legal document. */
function legalPage(name: 'terms' | 'privacy') {
  return current.served.inject({
    method: 'GET',
    url: `/legal/${name}`,
    headers: { host: '127.0.0.1' },
  });
}

/** Waits until a condition holds, checking at each turn of the event loop. */
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('The condition never held.');
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

const mailInput = {
  host: 'smtp.example.test',
  port: 587,
  security: 'starttls' as const,
  username: 'notes',
  password: 'mail-password-of-the-test',
  sender: 'Notes <no-reply@example.test>',
};

await test('an installation with no setting sends no mail and asks for no consent', async () => {
  const status = await getSetupStatus();
  assert.equal(status.data?.passwordReset, false);
  assert.equal(status.data?.legalDocuments, null);
  const tested = await sendTestMessage({ headers: owner });
  assert.equal(responseOf(tested.response).status, 422);
  assert.equal(memberOf(tested.error, 'code'), 'mail_failed');
  assert.equal(memberOf(tested.error, 'reason'), 'unavailable');
});

await test('an administrator sets the mail transport and it applies at once', async () => {
  const set = await updateMailSettings({ headers: owner, body: mailInput });
  assert.equal(responseOf(set.response).status, 200, JSON.stringify(set.error));
  assert.deepEqual(set.data?.mail, {
    source: 'application',
    host: 'smtp.example.test',
    port: 587,
    security: 'starttls',
    username: 'notes',
    sender: 'Notes <no-reply@example.test>',
    passwordStored: true,
  });
  assert.equal(set.data?.mailConfigured, true);
  // No answer and no column holds the password.
  assert.ok(!JSON.stringify(set.data).includes(mailInput.password));
  const row = await storedRow();
  assert.ok(!JSON.stringify(row).includes(mailInput.password));
  assert.match(String(row.mail_password_sealed), /^v1\./);
  // The sign-in page offers a reset with no restart.
  assert.equal((await getSetupStatus()).data?.passwordReset, true);
  // An invitation goes by mail, through the stored transport, with the
  // password opened only for the message.
  const email = `mailed-${randomUUID()}@notes.invalid`;
  const invited = await createInvitation({ headers: owner, body: { email } });
  assert.equal(invited.data?.link, null);
  assert.equal(sent.at(-1)?.to, email);
  assert.equal(connected.at(-1)?.password, mailInput.password);
  assert.equal(connected.at(-1)?.host, 'smtp.example.test');
});

await test('a change that leaves out the password keeps it', async () => {
  const set = await updateMailSettings({
    headers: owner,
    body: {
      host: mailInput.host,
      port: 2525,
      security: mailInput.security,
      username: mailInput.username,
      sender: mailInput.sender,
    },
  });
  assert.equal(set.data?.mail.port, 2525);
  assert.equal(set.data?.mail.passwordStored, true);
  await sendTestMessage({ headers: owner });
  assert.equal(connected.at(-1)?.password, mailInput.password);
});

await test('a test message goes to the administrator and a failure names its kind', async () => {
  const tested = await sendTestMessage({ headers: owner });
  assert.equal(responseOf(tested.response).status, 200);
  assert.deepEqual(tested.data, { to: ownerEmail });
  assert.equal(sent.at(-1)?.to, ownerEmail);
  assert.match(sent.at(-1)?.subject ?? '', /^Test message from NotesApp/);
  failure = Object.assign(new Error('535 5.7.8 rejected for notes'), {
    code: 'EAUTH',
    responseCode: 535,
  });
  try {
    const refused = await sendTestMessage({ headers: owner });
    assert.equal(responseOf(refused.response).status, 422);
    assert.equal(memberOf(refused.error, 'reason'), 'authentication');
    // The answer of the mail server reaches nobody.
    assert.ok(!JSON.stringify(refused.error).includes('rejected for'));
  } finally {
    failure = null;
  }
});

await test('a password reset goes through the stored transport', async () => {
  const before = sent.length;
  const asked = await requestPasswordReset({
    headers: origin,
    body: { email: ownerEmail },
  });
  assert.equal(responseOf(asked.response).status, 200);
  await until(() => sent.length === before + 1);
  assert.match(sent.at(-1)?.subject ?? '', /^Reset your password/);
});

await test('a new user name with no password is refused', async () => {
  await removeMailSettings({ headers: owner });
  const refused = await updateMailSettings({
    headers: owner,
    body: {
      host: mailInput.host,
      port: mailInput.port,
      security: mailInput.security,
      username: 'notes',
      sender: mailInput.sender,
    },
  });
  assert.equal(responseOf(refused.response).status, 400);
  assert.equal(memberOf(refused.error, 'code'), 'mail_password_required');
  const restored = await updateMailSettings({
    headers: owner,
    body: mailInput,
  });
  assert.equal(responseOf(restored.response).status, 200);
});

await test('a mail setting that is not one is refused', async () => {
  for (const body of [
    { ...mailInput, host: 'smtps://smtp.example.test' },
    { ...mailInput, sender: 'nobody' },
  ]) {
    const refused = await updateMailSettings({ headers: owner, body });
    assert.equal(responseOf(refused.response).status, 400);
  }
});

await test('the template fills what the server knows and a blank is refused', async () => {
  const read = await getLegalDocumentSettings({
    headers: owner,
    path: { document: 'privacy' },
  });
  assert.equal(read.data?.document, null);
  assert.equal(read.data?.source, 'none');
  const template = read.data?.template ?? '';
  assert.match(template, /NotesApp at 127\.0\.0\.1/);
  // The breach check is off here, so the template names no such service.
  assert.doesNotMatch(template, /Have I Been Pwned/);
  const refused = await updateLegalDocument({
    headers: owner,
    path: { document: 'privacy' },
    body: { kind: 'text', text: template, version: '1' },
  });
  assert.equal(responseOf(refused.response).status, 422);
  assert.equal(memberOf(refused.error, 'code'), 'legal_document_unfinished');
  const blanks = memberOf(refused.error, 'blanks');
  assert.ok(Array.isArray(blanks) && blanks.includes('{{operator name}}'));
});

await test('a document is served at once and both apply together', async () => {
  const terms = await updateLegalDocument({
    headers: owner,
    path: { document: 'terms' },
    body: {
      kind: 'text',
      text: '# Terms\n\nRun by Example Ltd.',
      version: 't1',
    },
  });
  assert.equal(responseOf(terms.response).status, 200);
  assert.deepEqual(terms.data?.legalDocuments, {
    source: 'application',
    terms: {
      kind: 'text',
      url: 'http://127.0.0.1/legal/terms',
      version: 't1',
    },
    privacy: null,
  });
  const page = await legalPage('terms');
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Run by Example Ltd\./);
  // One document is not enough to ask for consent.
  assert.equal((await getSetupStatus()).data?.legalDocuments, null);
  await updateLegalDocument({
    headers: owner,
    path: { document: 'privacy' },
    body: {
      kind: 'address',
      url: 'https://example.test/privacy',
      version: 'p1',
    },
  });
  assert.deepEqual((await getSetupStatus()).data?.legalDocuments, {
    terms: { url: 'http://127.0.0.1/legal/terms', version: 't1' },
    privacy: { url: 'https://example.test/privacy', version: 'p1' },
  });
  assert.equal(
    (await getAccount({ headers: owner })).data?.consentRequired,
    true,
  );
  // A changed text renders again at its next read.
  await updateLegalDocument({
    headers: owner,
    path: { document: 'terms' },
    body: { kind: 'text', text: '# Terms\n\nRun by Other Ltd.', version: 't2' },
  });
  // The page states the text and the version of the same save.
  const changed = (await legalPage('terms')).body;
  assert.match(changed, /Run by Other Ltd\./);
  assert.match(changed, /<span>Version t2<\/span>/);
  await updateLegalDocument({
    headers: owner,
    path: { document: 'terms' },
    body: { kind: 'text', text: '# Terms\n\nRun by Other Ltd.', version: 't1' },
  });
});

await test('a part that open registration needs cannot go while it is open', async () => {
  const opened = await updateInstallation({
    headers: owner,
    body: { registrationPolicy: 'open' },
  });
  assert.equal(
    responseOf(opened.response).status,
    200,
    JSON.stringify(opened.error),
  );
  const mail = await removeMailSettings({ headers: owner });
  assert.equal(responseOf(mail.response).status, 409);
  assert.equal(memberOf(mail.error, 'code'), 'setting_required');
  const document = await removeLegalDocument({
    headers: owner,
    path: { document: 'privacy' },
  });
  assert.equal(memberOf(document.error, 'code'), 'setting_required');
  await updateInstallation({
    headers: owner,
    body: { registrationPolicy: 'invitation' },
  });
  const removed = await removeLegalDocument({
    headers: owner,
    path: { document: 'privacy' },
  });
  assert.equal(responseOf(removed.response).status, 200);
  assert.equal(removed.data?.legalDocuments.privacy, null);
});

await test('a member reads and changes no setting', async () => {
  const email = `member-${randomUUID()}@notes.invalid`;
  // The link of this invitation goes by mail, so it is read from the message.
  await createInvitation({ headers: owner, body: { email } });
  const link = (sent.at(-1)?.text ?? '')
    .split('\n')
    .find((line) => line.startsWith('http://127.0.0.1/'));
  assert.ok(link !== undefined);
  const registered = await registerAccount({
    headers: origin,
    body: {
      invitation: new URL(link).hash.slice(1),
      password: 'member-password-123456',
      consent: { termsVersion: 't1', privacyVersion: 'p1' },
    },
  });
  assert.equal(responseOf(registered.response).status, 201);
  const member = {
    ...origin,
    cookie: cookieHeader(
      responseOf(registered.response).headers.getSetCookie(),
    ),
  };
  for (const answer of [
    await getInstallation({ headers: member }),
    await updateMailSettings({ headers: member, body: mailInput }),
    await sendTestMessage({ headers: member }),
    await getLegalDocumentSettings({
      headers: member,
      path: { document: 'terms' },
    }),
  ])
    assert.equal(responseOf(answer.response).status, 403);
});

await test('the database refuses half a transport', async () => {
  const session = await openSession(database.migrationUrl);
  try {
    await assert.rejects(
      session.query(
        'update installation_settings set mail_host = null, mail_port = 25',
      ),
      /installation_settings_mail_check/,
    );
    await assert.rejects(
      session.query(
        "update installation_settings set terms_kind = null, terms_version = 'x'",
      ),
      /installation_settings_terms_check/,
    );
  } finally {
    await session.close();
  }
});

await test('a stored transport that a new server secret cannot open closes sign-up', async () => {
  await updateLegalDocument({
    headers: owner,
    path: { document: 'privacy' },
    body: {
      kind: 'address',
      url: 'https://example.test/privacy',
      version: 'p1',
    },
  });
  const opened = await updateInstallation({
    headers: owner,
    body: { registrationPolicy: 'open' },
  });
  assert.equal(responseOf(opened.response).status, 200);
  assert.equal((await getSetupStatus()).data?.openRegistration, true);
  // The operator changes the server secret, so the sealed mail password
  // opens no more and no message can go.
  await current.served.close();
  current = await serve({
    NOTESAPP_AUTH_SECRET: 'another-installation-settings-secret-0123456789',
  });
  try {
    const status = await getSetupStatus();
    assert.equal(status.data?.openRegistration, false);
    assert.equal(status.data?.passwordReset, false);
    const challenge = await getSignUpChallenge({ headers: origin });
    assert.equal(responseOf(challenge.response).status, 403);
    assert.equal(memberOf(challenge.error, 'code'), 'registration_closed');
  } finally {
    await current.served.close();
    current = await serve();
  }
  await updateInstallation({
    headers: owner,
    body: { registrationPolicy: 'invitation' },
  });
});

await test('the environment wins and locks each group it sets', async () => {
  await current.served.close();
  const envSent: MailMessage[] = [];
  current = await serve(
    {
      NOTESAPP_TERMS_URL: 'https://example.test/env-terms',
      NOTESAPP_TERMS_VERSION: 'e1',
      NOTESAPP_PRIVACY_URL: 'https://example.test/env-privacy',
      NOTESAPP_PRIVACY_VERSION: 'e2',
    },
    {
      send: (message) => {
        envSent.push(message);
        return Promise.resolve();
      },
    },
  );
  const installation = await getInstallation({ headers: owner });
  assert.equal(installation.data?.mail.source, 'environment');
  assert.equal(installation.data?.legalDocuments.source, 'environment');
  const mail = await updateMailSettings({ headers: owner, body: mailInput });
  assert.equal(responseOf(mail.response).status, 409);
  assert.equal(memberOf(mail.error, 'code'), 'setting_locked');
  const document = await updateLegalDocument({
    headers: owner,
    path: { document: 'terms' },
    body: { kind: 'text', text: '# Terms', version: 'x' },
  });
  assert.equal(memberOf(document.error, 'code'), 'setting_locked');
  // The stored transport is still in the row, and the environment one sends.
  await sendTestMessage({ headers: owner });
  assert.equal(envSent.at(-1)?.to, ownerEmail);
  assert.equal(
    (await getSetupStatus()).data?.legalDocuments?.terms.version,
    'e1',
  );
});

await current.served.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
