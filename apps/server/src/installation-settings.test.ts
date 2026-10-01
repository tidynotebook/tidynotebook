/**
 * The decider of the mail transport and of the legal documents (record
 * 0148): the environment wins, the stored row applies otherwise, and the
 * password stays sealed until a message goes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoredInstallationSettings } from '@notesapp/core';
import { emptyInstallationSettings } from '@notesapp/core';
import { loadServerConfig } from './config.ts';
import { createInstallationSettings } from './installation-settings.ts';
import { createMailPasswordSeal } from './auth/seal.ts';
import {
  MailUnavailableError,
  type ApplicationMail,
  type MailMessage,
} from './auth/mail.ts';

const secret = 'installation-settings-test-secret-0123456789';
const base = {
  NOTESAPP_ORIGIN: 'https://notes.example.com',
  NOTESAPP_DATABASE_URL: 'postgres://app:app@127.0.0.1:5432/notesapp',
  NOTESAPP_AUTH_DATABASE_URL: 'postgres://auth:auth@127.0.0.1:5432/notesapp',
  NOTESAPP_STORAGE_ROOT: '/var/lib/notesapp',
  NOTESAPP_AUTH_SECRET: secret,
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
};
const seal = createMailPasswordSeal(secret);
const message: MailMessage = { to: 'a@example.com', subject: 's', text: 't' };

/** A decider over one row, and the transports it built. */
function decider(
  row: StoredInstallationSettings,
  overrides: Readonly<Record<string, string>> = {},
  environmentMail: { send: (m: MailMessage) => Promise<void> } | null = null,
) {
  const connected: ApplicationMail[] = [];
  const sent: MailMessage[] = [];
  const settings = createInstallationSettings({
    config: loadServerConfig({ ...base, ...overrides }),
    reader: { installationSettings: () => Promise.resolve(row) },
    environmentMail,
    environmentTexts: { terms: null, privacy: null },
    passwordSeal: seal,
    connect: (mail) => {
      connected.push(mail);
      return {
        send: (next) => {
          sent.push(next);
          return Promise.resolve();
        },
      };
    },
  });
  return { settings, connected, sent };
}

const stored: StoredInstallationSettings = {
  ...emptyInstallationSettings,
  mail: {
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls',
    username: 'notes',
    passwordSealed: seal.seal('mail-password'),
    sender: 'Notes <no-reply@example.com>',
  },
};

await test('no setting is no transport', async () => {
  const { settings } = decider(emptyInstallationSettings);
  assert.equal(await settings.mailer.available(), false);
  await assert.rejects(settings.mailer.send(message), MailUnavailableError);
  assert.equal((await settings.mailView()).source, 'none');
});

await test('the stored transport opens its password at the message', async () => {
  const { settings, connected, sent } = decider(stored);
  assert.equal(await settings.mailer.available(), true);
  await settings.mailer.send(message);
  assert.equal(connected.at(-1)?.password, 'mail-password');
  assert.deepEqual(sent, [message]);
  const view = await settings.mailView();
  assert.deepEqual(view, {
    source: 'application',
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls',
    username: 'notes',
    sender: 'Notes <no-reply@example.com>',
    passwordStored: true,
  });
  assert.ok(!JSON.stringify(view).includes('mail-password'));
});

await test('the transport of one operation stays through a change of the row', async () => {
  let row: StoredInstallationSettings = stored;
  const sent: MailMessage[] = [];
  const settings = createInstallationSettings({
    config: loadServerConfig(base),
    reader: { installationSettings: () => Promise.resolve(row) },
    environmentMail: null,
    environmentTexts: { terms: null, privacy: null },
    passwordSeal: seal,
    connect: () => ({
      send: (next) => {
        sent.push(next);
        return Promise.resolve();
      },
    }),
  });
  const transport = await settings.mailer.current();
  assert.notEqual(transport, null);
  // Another administrator removes the mail before the message goes.
  row = emptyInstallationSettings;
  await transport?.send(message);
  assert.deepEqual(sent, [message]);
  assert.equal(await settings.mailer.current(), null);
});

await test('a password that this key cannot open is no transport', async () => {
  const sealedElsewhere = createMailPasswordSeal(`${secret}-old`).seal('x');
  const mail = stored.mail;
  assert.notEqual(mail, null);
  if (mail === null) return;
  const { settings } = decider({
    ...stored,
    mail: { ...mail, passwordSealed: sealedElsewhere },
  });
  assert.equal(await settings.mailer.available(), false);
  assert.equal((await settings.mailView()).passwordStored, false);
});

await test('the environment wins over the stored row and is locked', async () => {
  const sent: MailMessage[] = [];
  const { settings, connected } = decider(
    stored,
    {
      NOTESAPP_SMTP_URL: 'smtps://user:secret@smtp.env.example:465',
      NOTESAPP_MAIL_FROM: 'Env <env@example.com>',
    },
    {
      send: (next) => {
        sent.push(next);
        return Promise.resolve();
      },
    },
  );
  assert.equal(settings.environment.mail, true);
  await settings.mailer.send(message);
  assert.equal(connected.length, 0);
  assert.equal(sent.length, 1);
  const view = await settings.mailView();
  assert.equal(view.source, 'environment');
  assert.equal(view.host, 'smtp.env.example');
  assert.equal(view.port, 465);
  assert.equal(view.security, 'tls');
  assert.equal(view.username, 'user');
  assert.equal(view.sender, 'Env <env@example.com>');
  assert.ok(!JSON.stringify(view).includes('secret'));
});

await test('the documents apply when both exist and a text is served at once', async () => {
  const terms = { kind: 'text' as const, text: '# Terms', version: 't1' };
  const one = decider({ ...emptyInstallationSettings, terms });
  const partial = await one.settings.legal();
  assert.equal(partial.source, 'application');
  assert.equal(partial.documents, null);
  assert.equal(partial.texts.terms, '# Terms');
  const both = decider({
    ...emptyInstallationSettings,
    terms,
    privacy: {
      kind: 'address',
      url: 'https://example.com/privacy',
      version: 'p1',
    },
  });
  const legal = await both.settings.legal();
  assert.deepEqual(legal.documents, {
    terms: { url: 'https://notes.example.com/legal/terms', version: 't1' },
    privacy: { url: 'https://example.com/privacy', version: 'p1' },
  });
  assert.equal(legal.texts.privacy, null);
  assert.equal(
    (await decider(emptyInstallationSettings).settings.legal()).source,
    'none',
  );
});

await test('documents that the environment names win', async () => {
  const { settings } = decider(
    {
      ...emptyInstallationSettings,
      terms: { kind: 'text', text: '# Stored', version: 's' },
    },
    {
      NOTESAPP_TERMS_URL: 'https://example.com/terms',
      NOTESAPP_TERMS_VERSION: 'e1',
      NOTESAPP_PRIVACY_URL: 'https://example.com/privacy',
      NOTESAPP_PRIVACY_VERSION: 'e2',
    },
  );
  const legal = await settings.legal();
  assert.equal(legal.source, 'environment');
  assert.equal(settings.environment.legalDocuments, true);
  assert.equal(legal.documents?.terms.version, 'e1');
  assert.equal(legal.texts.terms, null);
});

await test('a template takes the host of the origin', () => {
  const { settings } = decider(emptyInstallationSettings);
  assert.match(settings.template('terms'), /NotesApp at notes\.example\.com/);
  assert.match(settings.template('privacy'), /NotesApp at notes\.example\.com/);
});
