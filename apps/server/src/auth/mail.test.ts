import assert from 'node:assert/strict';
import test from 'node:test';
import {
  budgetedTransport,
  envelopeOf,
  mailFailureReason,
  MailUnavailableError,
  noMailer,
  transportOptions,
  type Mailer,
  type MailMessage,
} from './mail.ts';

const message: MailMessage = {
  to: 'a@example.com',
  subject: 'Subject',
  text: 'Text\n',
};

await test('every message states that a program wrote it', () => {
  assert.deepEqual(envelopeOf('NotesApp <no-reply@example.com>', message), {
    from: 'NotesApp <no-reply@example.com>',
    to: 'a@example.com',
    subject: 'Subject',
    text: 'Text\n',
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    },
  });
});

await test('a budgeted transport sends while the address has budget', async () => {
  const sent: MailMessage[] = [];
  const sendInner = (next: MailMessage): Promise<void> => {
    sent.push(next);
    return Promise.resolve();
  };
  const inner: Mailer = {
    available: () => Promise.resolve(true),
    current: () => Promise.resolve({ send: sendInner }),
    send: sendInner,
  };
  const asked: string[] = [];
  let left = 2;
  const transport = budgetedTransport(inner, (address) => {
    asked.push(address);
    left -= 1;
    return Promise.resolve(left >= 0);
  });
  assert.equal(await transport.available(), true);
  for (let attempt = 0; attempt < 3; attempt += 1)
    await transport.send(message);
  // The third message is over the budget, and it goes nowhere in silence.
  assert.equal(sent.length, 2);
  assert.deepEqual(asked, ['a@example.com', 'a@example.com', 'a@example.com']);
  // The transport of one operation keeps the budget too.
  const taken = await transport.current();
  await taken?.send(message);
  assert.equal(sent.length, 2);
  const none = budgetedTransport(noMailer, () => Promise.resolve(true));
  assert.equal(await none.current(), null);
  assert.equal(await none.available(), false);
  await assert.rejects(none.send(message), MailUnavailableError);
});

await test('each security mode of the settings reaches the transport', () => {
  const mail = {
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls' as const,
    username: 'notes',
    password: 'secret',
    sender: 'a@example.com',
  };
  assert.deepEqual(transportOptions(mail), {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    requireTLS: true,
    ignoreTLS: false,
    auth: { user: 'notes', pass: 'secret' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  const tls = transportOptions({ ...mail, security: 'tls', port: 465 });
  assert.equal(tls.secure, true);
  assert.equal(tls.requireTLS, false);
  const plain = transportOptions({
    ...mail,
    security: 'none',
    username: null,
    password: null,
    host: '[2001:db8::1]',
  });
  assert.equal(plain.ignoreTLS, true);
  assert.equal(plain.auth, undefined);
  assert.equal(plain.host, '2001:db8::1');
});

await test('a failure names only its kind', () => {
  assert.equal(mailFailureReason(new MailUnavailableError()), 'unavailable');
  assert.equal(mailFailureReason({ code: 'EAUTH' }), 'authentication');
  assert.equal(mailFailureReason({ responseCode: 535 }), 'authentication');
  assert.equal(mailFailureReason({ code: 'ETLS' }), 'security');
  assert.equal(
    mailFailureReason({ code: 'ESOCKET', message: 'wrong version number' }),
    'security',
  );
  assert.equal(
    mailFailureReason({ code: 'ESOCKET', message: 'reset' }),
    'connection',
  );
  assert.equal(mailFailureReason({ code: 'ECONNECTION' }), 'connection');
  assert.equal(mailFailureReason({ code: 'EENVELOPE' }), 'sender');
  assert.equal(mailFailureReason(new Error('x')), 'other');
  // The library throws an Error, whose message is not enumerable.
  const certificate = Object.assign(new Error('certificate has expired'), {
    code: 'ESOCKET',
  });
  assert.equal(mailFailureReason(certificate), 'security');
  assert.equal(mailFailureReason('x'), 'other');
});
