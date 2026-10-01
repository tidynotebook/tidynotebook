import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installationSettingsOf,
  type InstallationSettingsRow,
} from './installation-settings-row.ts';

const empty: InstallationSettingsRow = {
  mail_host: null,
  mail_port: null,
  mail_security: null,
  mail_username: null,
  mail_password_sealed: null,
  mail_sender: null,
  terms_kind: null,
  terms_text: null,
  terms_url: null,
  terms_version: null,
  privacy_kind: null,
  privacy_text: null,
  privacy_url: null,
  privacy_version: null,
};

await test('an empty row holds no setting', () => {
  assert.deepEqual(installationSettingsOf(empty), {
    mail: null,
    terms: null,
    privacy: null,
  });
});

await test('a whole row reads as each group', () => {
  assert.deepEqual(
    installationSettingsOf({
      ...empty,
      mail_host: 'smtp.example.com',
      mail_port: 465,
      mail_security: 'tls',
      mail_username: 'notes',
      mail_password_sealed: 'v1.sealed',
      mail_sender: 'a@example.com',
      terms_kind: 'text',
      terms_text: '# Terms',
      terms_version: '1',
      privacy_kind: 'address',
      privacy_url: 'https://example.com/privacy',
      privacy_version: '2',
    }),
    {
      mail: {
        host: 'smtp.example.com',
        port: 465,
        security: 'tls',
        username: 'notes',
        passwordSealed: 'v1.sealed',
        sender: 'a@example.com',
      },
      terms: { kind: 'text', text: '# Terms', version: '1' },
      privacy: {
        kind: 'address',
        url: 'https://example.com/privacy',
        version: '2',
      },
    },
  );
});

await test('a half group stops loudly', () => {
  for (const row of [
    { ...empty, mail_host: 'smtp.example.com' },
    {
      ...empty,
      mail_host: 'smtp.example.com',
      mail_port: 25,
      mail_security: 'ssl',
      mail_sender: 'a@example.com',
    },
    { ...empty, terms_kind: 'text', terms_version: '1' },
    { ...empty, privacy_kind: 'address', privacy_url: 'https://x.test' },
    { ...empty, terms_kind: 'file', terms_text: 'x', terms_version: '1' },
  ])
    assert.throws(() => installationSettingsOf(row), /malformed/);
});
