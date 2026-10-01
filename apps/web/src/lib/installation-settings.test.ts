import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blankFields,
  blanksOf,
  legalDescription,
  legalDocumentFact,
  legalRemovedText,
  legalSavedText,
  mailDescription,
  mailFacts,
  mailFormChanged,
  mailFailureReasonOf,
  mailFailureText,
  mailPortOf,
  mailSecurityOf,
  portAfterSecurity,
  textToSave,
  unfinishedText,
} from './installation-settings.ts';

const none = {
  source: 'none' as const,
  host: null,
  port: null,
  security: null,
  username: null,
  sender: null,
  passwordStored: false,
};

await test('the mail section says where its server comes from', () => {
  assert.match(mailDescription(none), /sends no mail/);
  assert.match(
    mailDescription({ ...none, source: 'environment' }),
    /environment/,
  );
  assert.match(
    mailDescription({ ...none, source: 'application' }),
    /go through/,
  );
});

await test('the facts of a mail server name the host, the port and the sender', () => {
  const mail = {
    source: 'application' as const,
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls' as const,
    username: 'notes',
    sender: 'Notes <a@example.com>',
    passwordStored: true,
  };
  assert.deepEqual(mailFacts(mail), [
    'smtp.example.com, port 587',
    'From Notes <a@example.com>',
  ]);
  assert.deepEqual(
    mailFacts({ ...mail, passwordStored: false }).at(-1),
    'The password must be entered again',
  );
  assert.deepEqual(
    mailFacts({
      ...none,
      source: 'environment',
      host: 'smtp.env',
      sender: 'x@y.z',
    }),
    ['smtp.env', 'From x@y.z'],
  );
  assert.deepEqual(mailFacts(none), []);
});

await test('a port follows the security mode until the person types one', () => {
  assert.equal(portAfterSecurity('587', 'starttls', 'tls'), '465');
  assert.equal(portAfterSecurity('', 'starttls', 'none'), '25');
  assert.equal(portAfterSecurity('2525', 'starttls', 'tls'), '2525');
  assert.equal(mailPortOf(' 465 '), 465);
  assert.equal(mailPortOf('0'), null);
  assert.equal(mailPortOf('70000'), null);
  assert.equal(mailPortOf('25a'), null);
  assert.equal(mailSecurityOf('tls'), 'tls');
  assert.equal(mailSecurityOf('ssl'), null);
});

await test('each kind of failure has its own sentence and no code', () => {
  const reasons = [
    'unavailable',
    'connection',
    'authentication',
    'security',
    'sender',
    'other',
    null,
  ];
  const sentences = reasons.map((reason) => mailFailureText(reason));
  assert.equal(new Set(sentences).size, reasons.length - 1);
  for (const sentence of sentences)
    assert.doesNotMatch(sentence, /_|E[A-Z]{3,}/);
  assert.equal(
    mailFailureReasonOf({ code: 'mail_failed', reason: 'connection' }),
    'connection',
  );
  assert.equal(mailFailureReasonOf({ code: 'mail_failed' }), null);
  assert.equal(mailFailureReasonOf(null), null);
});

await test('the legal section names what is missing', () => {
  const document = {
    kind: 'text' as const,
    url: 'https://n.example/legal/terms',
    version: '1',
  };
  assert.match(
    legalDescription({ source: 'none', terms: null, privacy: null }),
    /Add the terms/,
  );
  assert.match(
    legalDescription({ source: 'application', terms: document, privacy: null }),
    /other document/,
  );
  assert.match(
    legalDescription({
      source: 'application',
      terms: document,
      privacy: document,
    }),
    /accepts both/,
  );
  assert.match(
    legalDescription({
      source: 'environment',
      terms: document,
      privacy: document,
    }),
    /environment/,
  );
  assert.equal(legalDocumentFact(null), 'Not added');
  assert.equal(legalDocumentFact(document), 'Version 1, on this server');
  assert.equal(
    legalDocumentFact({
      kind: 'address',
      url: 'https://law.example.com/terms',
      version: '2',
    }),
    'Version 2, at law.example.com',
  );
});

await test('each blank of a text is one field in sentence case', () => {
  assert.deepEqual(
    blankFields(
      'A {{operator name}} and {{operator name}} in {{jurisdiction}}.',
    ),
    [
      { blank: '{{operator name}}', label: 'Operator name', wide: false },
      { blank: '{{jurisdiction}}', label: 'Jurisdiction', wide: false },
    ],
  );
  assert.equal(
    textToSave('By {{operator name}} and {{operator name}} in {{place}}', {
      '{{operator name}}': 'Ada',
    }),
    'By Ada and Ada in {{place}}',
  );
  // A label of a sentence takes the whole row.
  assert.equal(
    blankFields(
      '{{whether the service is free, or its price and how a person pays}}',
    )[0]?.wide,
    true,
  );
  assert.deepEqual(blanksOf({ blanks: ['{{a}}', 3] }), ['{{a}}']);
  assert.deepEqual(blanksOf({}), []);
  assert.equal(
    unfinishedText(['{{a}}']),
    'Fill the last blank of the template before you save.',
  );
  assert.equal(
    unfinishedText(['{{a}}', '{{b}}']),
    'Fill the 2 blanks of the template before you save.',
  );
});

await test('the mail form has work only when a field differs', () => {
  const saved = {
    host: 'smtp.example.com',
    security: 'starttls' as const,
    port: '587',
    username: 'notes',
    password: '',
    sender: 'a@example.com',
  };
  assert.equal(mailFormChanged(saved, saved), false);
  assert.equal(
    mailFormChanged(saved, { ...saved, host: ' smtp.example.com ' }),
    false,
  );
  assert.equal(mailFormChanged(saved, { ...saved, port: '465' }), true);
  assert.equal(mailFormChanged(saved, { ...saved, security: 'tls' }), true);
  // A typed password is a change, since the saved one is never shown.
  assert.equal(mailFormChanged(saved, { ...saved, password: 'x' }), true);
});

await test('each document takes its own verb', () => {
  assert.equal(legalSavedText('terms'), 'The terms are saved.');
  assert.equal(
    legalSavedText('privacy notice'),
    'The privacy notice is saved.',
  );
  assert.match(legalRemovedText('terms'), /^The terms are removed\./);
  assert.match(
    legalRemovedText('privacy notice'),
    /^The privacy notice is removed\./,
  );
});
