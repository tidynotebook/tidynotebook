import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installationHost,
  invitationMessage,
  lifetimeWords,
  passwordChangedMessage,
  passwordResetMessage,
  removalNoticeMessage,
  signUpAttemptMessage,
  verificationMessage,
} from './messages.ts';

const origin = 'https://notes.example.com';
const link = 'https://notes.example.com/page#secret-token';

const messages = [
  invitationMessage({ to: 'a@example.com', origin, link, lifetimeHours: 168 }),
  verificationMessage({ to: 'a@example.com', origin, link, lifetimeHours: 24 }),
  signUpAttemptMessage({ to: 'a@example.com', origin }),
  passwordResetMessage({ to: 'a@example.com', origin, link, lifetimeHours: 1 }),
  passwordChangedMessage({ to: 'a@example.com', origin }),
  removalNoticeMessage({ to: 'a@example.com', origin, days: 30, portal: true }),
];

await test('a life in hours reads as a whole phrase with its count', () => {
  assert.equal(lifetimeWords(1), '1 hour');
  assert.equal(lifetimeWords(5), '5 hours');
  assert.equal(lifetimeWords(24), '1 day');
  assert.equal(lifetimeWords(168), '7 days');
  assert.equal(lifetimeWords(36), '36 hours');
});

await test('every message names the product and the installation', () => {
  assert.equal(installationHost('http://127.0.0.1:3000'), '127.0.0.1:3000');
  for (const message of messages) {
    assert.equal(message.to, 'a@example.com');
    assert.match(message.subject, /tidy notebook at notes\.example\.com/);
    assert.match(message.text, /tidy notebook at notes\.example\.com/);
    // The signature follows the delimiter of RFC 3676, so a mail program can
    // fold it away.
    assert.match(
      message.text,
      /\n-- \ntidy notebook at notes\.example\.com\n$/,
    );
    // No secret of a link reaches a subject, which a mailbox list shows.
    assert.equal(message.subject.includes('secret-token'), false);
    assert.equal(/[–—]/.test(message.text), false);
  }
});

await test('a link stands alone on its line, with its life', () => {
  const [invitation, verification, , reset] = messages;
  for (const message of [invitation, verification, reset])
    assert.ok(message?.text.split('\n').includes(link));
  assert.match(invitation?.text ?? '', /works once, for 7 days\./);
  assert.match(verification?.text ?? '', /works for 1 day\./);
  assert.match(reset?.text ?? '', /works once, for 1 hour\./);
});

await test('a message that changes nothing says what to do next', () => {
  const [, , attempt, , changed] = messages;
  assert.ok(
    attempt?.text.split('\n').includes('https://notes.example.com/login'),
  );
  assert.match(attempt?.text ?? '', /select Forgot password/);
  assert.ok(
    changed?.text
      .split('\n')
      .includes('https://notes.example.com/forgot-password'),
  );
});

await test('the mail before a removal names the time, the way to keep the account and the export', () => {
  const thirty = removalNoticeMessage({
    to: 'a@example.com',
    origin,
    days: 30,
    portal: true,
  });
  assert.equal(
    thirty.subject,
    'Your account on tidy notebook at notes.example.com is deleted in 30 days',
  );
  assert.match(thirty.text, /In 30 days, the account and every note/);
  assert.match(thirty.text, /open billing/);
  assert.ok(thirty.text.split('\n').includes(`${origin}/login`));
  assert.match(thirty.text, /select Export my notes/);
  const seven = removalNoticeMessage({
    to: 'a@example.com',
    origin,
    days: 7,
    portal: false,
  });
  assert.match(seven.subject, /is deleted in 7 days$/);
  assert.match(seven.text, /ask the administrator/);
  assert.doesNotMatch(seven.text, /billing|portal/);
  const one = removalNoticeMessage({
    to: 'a@example.com',
    origin,
    days: 1,
    portal: false,
  });
  assert.match(one.subject, /is deleted in 1 day$/);
});
