/**
 * Rules of the mail settings, the legal documents and their templates
 * (record 0148). The use cases are proved in `administration.test.ts`, over
 * the fake installation of that file.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blankLabel,
  documentAddress,
  fillBlanks,
  mailHost,
  mailSender,
  maxLegalTextBytes,
  readLegalDocument,
  readMailSettings,
  senderAddress,
  settingsReadiness,
  templateBlanks,
  utf8Length,
} from './installation-settings.ts';
import { legalTemplate } from './legal-templates.ts';

await test('a mail host is a host name and nothing else', () => {
  assert.equal(mailHost(' SMTP.Example.com '), 'smtp.example.com');
  assert.equal(mailHost('[2001:db8::1]'), '[2001:db8::1]');
  for (const refused of [
    '',
    'smtps://smtp.example.com',
    'smtp.example.com:465',
    'smtp example.com',
    'smtp.example.com/path',
    '-smtp.example.com',
    `${'a'.repeat(254)}`,
  ])
    assert.equal(mailHost(refused), null, refused);
});

await test('a sender is an address, or a name and an address', () => {
  assert.equal(mailSender('No-Reply@Example.com'), 'no-reply@example.com');
  assert.equal(
    mailSender(' Notes  <No-Reply@Example.com> '),
    'Notes <no-reply@example.com>',
  );
  assert.equal(mailSender('<no-reply@example.com>'), 'no-reply@example.com');
  assert.equal(
    mailSender('"tidy notebook" <no-reply@example.com>'),
    'tidy notebook <no-reply@example.com>',
  );
  for (const refused of [
    'nobody',
    'Notes <nobody>',
    'Notes "x" <a@example.com>',
    'Notes\r\nBcc: a@example.com <a@example.com>',
    'a b@example.com',
  ])
    assert.equal(mailSender(refused), null, refused);
  assert.equal(senderAddress('Notes <a@example.com>'), 'a@example.com');
  assert.equal(senderAddress('a@example.com'), 'a@example.com');
});

await test('the mail settings name their first invalid field', () => {
  const input = {
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls',
    username: 'notes',
    password: 'secret',
    sender: 'a@example.com',
  };
  const read = readMailSettings(input);
  assert.deepEqual(read, {
    ok: true,
    value: {
      host: 'smtp.example.com',
      port: 587,
      security: 'starttls',
      username: 'notes',
      password: 'secret',
      sender: 'a@example.com',
    },
  });
  assert.deepEqual(readMailSettings({ ...input, host: 'a b' }), {
    ok: false,
    problem: 'host',
  });
  assert.deepEqual(readMailSettings({ ...input, port: 0 }), {
    ok: false,
    problem: 'port',
  });
  assert.deepEqual(readMailSettings({ ...input, security: 'ssl' }), {
    ok: false,
    problem: 'security',
  });
  assert.deepEqual(readMailSettings({ ...input, sender: 'x' }), {
    ok: false,
    problem: 'sender',
  });
  // A credential past its bound is refused, never cut. An emoji counts as
  // one character, as the contract counts it.
  const emoji = '\u{1F600}';
  const long = readMailSettings({ ...input, password: emoji.repeat(600) });
  assert.equal(long.ok && long.value.password, emoji.repeat(600));
  assert.deepEqual(
    readMailSettings({ ...input, password: emoji.repeat(1025) }),
    {
      ok: false,
      problem: 'password',
    },
  );
  assert.deepEqual(readMailSettings({ ...input, username: 'u'.repeat(321) }), {
    ok: false,
    problem: 'username',
  });
  assert.equal(
    mailSender(`${emoji.repeat(300)} <a@example.com>`) !== null,
    true,
  );
  // The database stores no zero character, so the boundary refuses one.
  assert.deepEqual(readMailSettings({ ...input, password: 'a\u0000b' }), {
    ok: false,
    problem: 'password',
  });
  assert.equal(mailSender('a\u0000@example.com'), null);
  // A server with no sign-in keeps no password.
  const anonymous = readMailSettings({ ...input, username: ' ' });
  assert.equal(anonymous.ok && anonymous.value.username, null);
  assert.equal(anonymous.ok && anonymous.value.password, null);
});

await test('a legal document is a finished text or a full address', () => {
  assert.deepEqual(
    readLegalDocument({
      kind: 'text',
      text: '# Terms',
      url: null,
      version: ' 2 ',
    }),
    { ok: true, value: { kind: 'text', text: '# Terms', version: '2' } },
  );
  assert.deepEqual(
    readLegalDocument({
      kind: 'text',
      text: 'By {{operator name}} at {{operator name}} in {{jurisdiction}}',
      url: null,
      version: '1',
    }),
    {
      ok: false,
      problem: {
        kind: 'unfinished',
        blanks: ['{{operator name}}', '{{jurisdiction}}'],
      },
    },
  );
  assert.deepEqual(
    readLegalDocument({
      kind: 'address',
      text: null,
      url: 'https://example.com/terms',
      version: '1',
    }),
    {
      ok: true,
      value: {
        kind: 'address',
        url: 'https://example.com/terms',
        version: '1',
      },
    },
  );
  const invalid = { ok: false, problem: { kind: 'invalid' } };
  for (const input of [
    { kind: 'text', text: '  ', url: null, version: '1' },
    { kind: 'text', text: 'x', url: null, version: '' },
    { kind: 'text', text: 'x', url: null, version: 'v'.repeat(65) },
    { kind: 'text', text: 'x', url: null, version: '\u{1F600}'.repeat(65) },
    { kind: 'address', text: null, url: 'javascript:alert(1)', version: '1' },
    { kind: 'address', text: null, url: '/legal/terms', version: '1' },
    { kind: 'file', text: 'x', url: null, version: '1' },
    { kind: 'text', text: 'a\u0000b', url: null, version: '1' },
    { kind: 'text', text: 'x', url: null, version: '1\u0000' },
  ])
    assert.deepEqual(readLegalDocument(input), invalid, input.kind);
  assert.equal(documentAddress('ftp://example.com'), null);
  // A version counts code points, as the contract counts it.
  const emojiVersion = '\u{1F600}'.repeat(40);
  assert.deepEqual(
    readLegalDocument({
      kind: 'text',
      text: 'x',
      url: null,
      version: emojiVersion,
    }),
    { ok: true, value: { kind: 'text', text: 'x', version: emojiVersion } },
  );
  // A text past the bound in bytes names its size, which the contract cannot.
  assert.deepEqual(
    readLegalDocument({
      kind: 'text',
      text: '\u20AC'.repeat(100_000),
      url: null,
      version: '1',
    }),
    { ok: false, problem: { kind: 'too_large' } },
  );
  assert.deepEqual(
    readLegalDocument({
      kind: 'text',
      text: 'a'.repeat(maxLegalTextBytes + 1),
      url: null,
      version: '1',
    }),
    { ok: false, problem: { kind: 'too_large' } },
  );
});

await test('a blank is a field and its value replaces each copy', () => {
  const text = 'A {{name}} and {{name}} at {{place}}.';
  assert.deepEqual(templateBlanks(text), ['{{name}}', '{{place}}']);
  assert.equal(blankLabel('{{ operator name }}'), 'operator name');
  assert.equal(
    fillBlanks(text, { '{{name}}': ' Ada ', '{{place}}': '' }),
    'A Ada and Ada at {{place}}.',
  );
});

await test('the length of a text counts the bytes of UTF-8', () => {
  assert.equal(utf8Length('a'), 1);
  assert.equal(utf8Length('é'), 2);
  assert.equal(utf8Length('€'), 3);
  assert.equal(utf8Length('😀'), 4);
});

await test('the readiness takes either source of each part', () => {
  const empty = { mail: null, terms: null, privacy: null };
  const environment = {
    mail: false,
    legalDocuments: false,
    mailUsable: () => true,
  };
  assert.deepEqual(settingsReadiness(environment, empty), {
    mail: false,
    legalDocuments: false,
  });
  // A stored transport counts only while the server can open it.
  const mail = {
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls' as const,
    username: 'notes',
    passwordSealed: 'v1.sealed',
    sender: 'a@example.com',
  };
  assert.equal(settingsReadiness(environment, { ...empty, mail }).mail, true);
  assert.equal(
    settingsReadiness(
      { ...environment, mailUsable: () => false },
      { ...empty, mail },
    ).mail,
    false,
  );
  assert.deepEqual(
    settingsReadiness(
      { ...environment, mail: true, legalDocuments: true },
      empty,
    ),
    { mail: true, legalDocuments: true },
  );
  const document = { kind: 'text' as const, text: 'x', version: '1' };
  assert.equal(
    settingsReadiness(environment, { ...empty, terms: document })
      .legalDocuments,
    false,
  );
  assert.equal(
    settingsReadiness(environment, {
      ...empty,
      terms: document,
      privacy: document,
    }).legalDocuments,
    true,
  );
});

await test('a template fills the facts of the server and keeps the other blanks', () => {
  const facts = {
    serviceAddress: 'notes.example.com',
    pendingHours: 48,
    breachCheck: true,
  };
  const privacy = legalTemplate('privacy', facts);
  const terms = legalTemplate('terms', facts);
  assert.match(privacy, /^# Privacy notice\n/);
  assert.match(terms, /^# Terms\n/);
  assert.match(privacy, /tidy notebook at notes\.example\.com/);
  assert.match(terms, /tidy notebook at notes\.example\.com/);
  assert.match(privacy, /goes after 48 hours/);
  assert.match(privacy, /Have I Been Pwned/);
  assert.doesNotMatch(
    legalTemplate('privacy', { ...facts, breachCheck: false }),
    /Have I Been Pwned/,
  );
  for (const text of [privacy, terms]) {
    assert.ok(templateBlanks(text).includes('{{operator name}}'));
    assert.ok(!templateBlanks(text).includes('{{service address}}'));
    // Every blank is a short label that a field can carry.
    for (const blank of templateBlanks(text))
      assert.ok(blankLabel(blank).length <= 100, blank);
  }
  assert.ok(!templateBlanks(privacy).includes('{{pending sign-up hours}}'));
  // The page states the version, so no template names one.
  for (const text of [privacy, terms])
    assert.ok(!templateBlanks(text).includes('{{version}}'));
});
