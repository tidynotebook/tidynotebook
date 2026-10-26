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

const removalAt = '2026-10-30T23:30:00-02:00';
const origin = 'https://notes.example.com';
const link = 'https://notes.example.com/page#secret-token';

const messages = [
  invitationMessage({ to: 'a@example.com', origin, link, lifetimeHours: 168 }),
  verificationMessage({ to: 'a@example.com', origin, link, lifetimeHours: 24 }),
  signUpAttemptMessage({ to: 'a@example.com', origin }),
  passwordResetMessage({ to: 'a@example.com', origin, link, lifetimeHours: 1 }),
  passwordChangedMessage({
    to: 'a@example.com',
    origin,
    changedAt: '2026-10-23T14:05:00Z',
  }),
  removalNoticeMessage({
    to: 'a@example.com',
    origin,
    removalAt,
    days: 30,
    portal: true,
  }),
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
    removalAt,
    days: 30,
    portal: true,
  });
  assert.equal(
    thirty.subject,
    'Your account on tidy notebook at notes.example.com will be deleted in 30 days',
  );
  assert.match(thirty.text, /On 31 October 2026 the account and all its notes/);
  assert.ok(thirty.html.includes('On\u00a031\u00a0October\u00a02026'));
  assert.match(thirty.text, /open Billing/);
  assert.ok(thirty.text.split('\n').includes(`${origin}/login`));
  assert.match(thirty.text, /sign in and select Export my notes/);
  assert.doesNotMatch(
    thirty.text,
    /Settings|Export (?:all notes|this workspace)/,
  );
  const seven = removalNoticeMessage({
    to: 'a@example.com',
    origin,
    removalAt,
    days: 7,
    portal: false,
  });
  assert.match(seven.subject, /will be deleted in 7 days$/);
  assert.match(seven.text, /ask your administrator/);
  assert.doesNotMatch(seven.text, /billing|portal/);
  const one = removalNoticeMessage({
    to: 'a@example.com',
    origin,
    removalAt,
    days: 1,
    portal: false,
  });
  assert.match(one.subject, /will be deleted in 1 day$/);
});

await test('every email matches its HTML and text golden files', async () => {
  const { readFile } = await import('node:fs/promises');
  const { emailExamples } = await import('./fixtures/email-examples.ts');
  for (const { name, message } of emailExamples) {
    assert.equal(
      message.html,
      await readFile(
        new URL(`./fixtures/emails/${name}.html.golden`, import.meta.url),
        'utf8',
      ),
      name,
    );
    assert.equal(
      message.text,
      await readFile(
        new URL(`./fixtures/emails/${name}.txt`, import.meta.url),
        'utf8',
      ),
      name,
    );
    assert.match(message.html, /<html lang="en"/);
    assert.equal((message.html.match(/<h1\b/g) ?? []).length, 1, name);
    assert.doesNotMatch(message.html, /<script\b|<link\b|url\(/i);
    assert.match(message.text, /This is an automated email/);
    assert.doesNotMatch(message.text, /Button not working|this page/);
    assert.match(message.html, /src="cid:notebook-light@notesapp"/);
    assert.match(message.html, /src="cid:notebook-dark@notesapp"/);
    assert.equal(message.inlineImages?.length, 2);
    assert.deepEqual(
      [...message.html.matchAll(/src="([^"]+)"/g)].map((match) => match[1]),
      ['cid:notebook-light@notesapp', 'cid:notebook-dark@notesapp'],
    );
    assert.match(message.text, /For help, contact/);
    const links = [...message.html.matchAll(/href="([^"]+)"/g)];
    assert.ok(links.length >= 2, name);
    for (const [, link] of links) {
      const decoded = (link ?? '').replaceAll('&amp;', '&');
      assert.ok(
        message.text.split('\n').includes(decoded),
        `${name}: ${decoded}`,
      );
    }
  }
});

await test('an available inviter name is escaped and an empty name uses the general invitation', () => {
  const named = invitationMessage({
    to: 'a@example.test',
    origin,
    link,
    lifetimeHours: 24,
    inviterName: '<img src=x onerror=alert(1)> & Alex',
  });
  assert.doesNotMatch(named.html, /<img src=x/);
  assert.match(named.html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; Alex/);
  assert.match(named.text, /<img src=x onerror=alert\(1\)> & Alex invited you/);
  const unnamed = invitationMessage({
    to: 'a@example.test',
    origin,
    link,
    lifetimeHours: 24,
    inviterName: '   ',
  });
  assert.match(unnamed.text, /You're invited to create an account/);
});

await test('billing removal support uses the configured URL or the provider fallback', () => {
  const base = {
    to: 'a@example.test',
    origin,
    days: 7,
    removalAt,
    portal: true,
  };
  const fallback = removalNoticeMessage(base);
  assert.match(fallback.text, /For help, contact support at your provider/);
  assert.doesNotMatch(fallback.html, /installation administrator/);
  const supportUrl =
    'https://support.example.test/help?topic=account&from=email';
  const configured = removalNoticeMessage({ ...base, supportUrl });
  assert.match(configured.html, />contact\u00a0support<\/a>/);
  assert.doesNotMatch(configured.html, />https:\/\/support/);
  assert.ok(configured.text.split('\n').includes(supportUrl));
});

await test('password change time is recorded in UTC and kept together in HTML', () => {
  const message = passwordChangedMessage({
    to: 'a@example.test',
    origin,
    changedAt: '2026-10-24T00:05:00+10:00',
  });
  assert.match(message.text, /was changed on 23 October 2026 at 14:05 UTC\./);
  assert.ok(
    message.html.includes(
      '23\u00a0October\u00a02026\u00a0at\u00a014:05\u00a0UTC',
    ),
  );
  assert.doesNotMatch(message.text, /tell your administrator/);
  assert.ok(message.html.includes('tidy\u00a0notebook'));
  assert.doesNotMatch(message.text, /\u00a0/);
  assert.doesNotMatch(message.subject, /\u00a0/);
});
