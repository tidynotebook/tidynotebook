import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountSummary, Invitation } from '@notesapp/api-client';
import {
  accountActionLabel,
  accountActions,
  accountFacts,
  accountName,
  bytesOfGigabytes,
  enabledAdministrators,
  formatBytes,
  gigabytesOf,
  invitationFacts,
  invitationTokenOf,
  registrationPolicyText,
  missingPartsOf,
  openRegistrationMissingText,
  profileNameProblem,
  storageLine,
  resetTokenOf,
  verificationTokenOf,
} from './accounts.ts';

const now = Date.parse('2026-09-26T12:00:00.000Z');

await test('a profile name needs visible text within the account limit', () => {
  assert.equal(profileNameProblem(' Ada '), null);
  assert.equal(profileNameProblem('   '), 'Enter a name.');
  assert.equal(
    profileNameProblem('a'.repeat(257)),
    'Use a name with no more than 256 characters.',
  );
});

function account(extra: Partial<AccountSummary> = {}): AccountSummary {
  return {
    accountId: '11111111-1111-4111-8111-111111111111',
    email: 'ada@example.test',
    name: 'ada@example.test',
    installationRole: 'member',
    state: 'enabled',
    createdAt: '2026-09-01T12:00:00.000Z',
    lastActiveAt: '2026-09-26T10:00:00.000Z',
    storage: { usedBytes: 1536, limitBytes: 5 * 1024 * 1024 * 1024 },
    controls: {
      revision: 1,
      standing: 'active',
      removalAt: null,
      limitBytes: 5 * 1024 * 1024 * 1024,
      textLimitBytes: null,
      publishedTransferLimitBytes: null,
      downloadLimitBytes: null,
      features: { teams: true, collaboration: true },
    },
    self: false,
    ...extra,
  };
}

await test('a byte count reads in one unit with at most one decimal', () => {
  assert.equal(formatBytes(0), '0 bytes');
  assert.equal(formatBytes(512), '512 bytes');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(15 * 1024 * 1024), '15 MB');
  assert.equal(formatBytes(5 * 1024 * 1024 * 1024), '5 GB');
  assert.equal(formatBytes(-1), '');
});

await test('the storage line is empty when the limit is unknown', () => {
  assert.equal(
    storageLine({ usedBytes: 1536, limitBytes: 5 * 1024 ** 3 }),
    '1.5 KB of 5 GB used',
  );
  assert.equal(storageLine({ usedBytes: 0, limitBytes: 0 }), '');
});

await test('a limit in gigabytes goes both ways and refuses a non-number', () => {
  assert.equal(bytesOfGigabytes('5'), 5 * 1024 ** 3);
  assert.equal(bytesOfGigabytes(' 0,5 '), 0.5 * 1024 ** 3);
  assert.equal(gigabytesOf(5 * 1024 ** 3), '5');
  for (const bad of ['', '0', '-1', 'ten', '1e3', '99999999999'])
    assert.equal(bytesOfGigabytes(bad), null, bad);
});

await test('the token of an invitation comes from the fragment only', () => {
  const token = 'A'.repeat(43);
  assert.equal(invitationTokenOf(`#${token}`), token);
  assert.equal(invitationTokenOf(token), token);
  assert.equal(invitationTokenOf('#short'), null);
  assert.equal(invitationTokenOf(''), null);
  assert.equal(invitationTokenOf(`#${token}x`), null);
});

await test('a name that repeats the address is no name', () => {
  assert.equal(accountName(account()), 'ada@example.test');
  assert.equal(accountName(account({ name: 'Ada' })), 'Ada');
  assert.equal(accountName(account({ name: null, email: null })), 'Account');
});

await test('the facts of a row name the role, the state and the activity', () => {
  assert.deepEqual(accountFacts(account(), now), [
    'Member',
    'Active 2 hours ago',
    '1.5 KB of 5 GB used',
  ]);
  assert.deepEqual(
    accountFacts(
      account({
        self: true,
        installationRole: 'administrator',
        state: 'disabled',
        lastActiveAt: null,
        name: 'Ada',
      }),
      now,
    ),
    [
      'You',
      'Administrator',
      'Disabled',
      'Not signed in',
      '1.5 KB of 5 GB used',
      'ada@example.test',
    ],
  );
  // A locked account says so beside its role (record 0201).
  const base = account();
  assert.deepEqual(
    accountFacts(
      account({
        controls: {
          ...base.controls,
          standing: 'locked',
          removalAt: '2026-10-26T12:00:00.000Z',
        },
      }),
      now,
    ).slice(0, 2),
    ['Member', 'Locked'],
  );
});

await test('the last enabled administrator offers no change that would lose it', () => {
  const last = account({ installationRole: 'administrator', self: true });
  assert.equal(enabledAdministrators([last, account()]), 1);
  assert.deepEqual(accountActions(last, 1), ['change-controls']);
  // With a second administrator the same row offers the changes, and the
  // own account still offers no removal here.
  assert.deepEqual(accountActions(last, 2), [
    'make-member',
    'disable',
    'change-controls',
  ]);
  assert.deepEqual(accountActions(account(), 1), [
    'make-administrator',
    'disable',
    'change-controls',
    'remove',
  ]);
  assert.deepEqual(accountActions(account({ state: 'disabled' }), 1), [
    'make-administrator',
    'enable',
    'change-controls',
    'remove',
  ]);
  for (const action of accountActions(account(), 1))
    assert.match(accountActionLabel(action), /^[A-Z][a-z ]+$/);
});

await test('an invitation row says when it expires and how it travelled', () => {
  const invitation: Invitation = {
    invitationId: '22222222-2222-4222-8222-222222222222',
    email: 'bea@example.test',
    createdAt: '2026-09-26T11:00:00.000Z',
    expiresAt: '2026-09-29T12:00:00.000Z',
    state: 'pending',
    mailed: false,
  };
  assert.deepEqual(invitationFacts(invitation, now), [
    'Expires in 3 days',
    'Link shown once',
  ]);
  assert.deepEqual(
    invitationFacts({ ...invitation, state: 'expired', mailed: true }, now),
    ['Expired', 'Sent by mail'],
  );
});

await test('the registration policy reads as one sentence', () => {
  assert.equal(
    registrationPolicyText('invitation'),
    'Only a person with an invitation can make an account.',
  );
  assert.match(registrationPolicyText('open'), /proves their address/);
});

await test('a verification link reads its token from the fragment only', () => {
  assert.equal(
    verificationTokenOf('#v1.dXNlcg.1790000000.abc_-'),
    'v1.dXNlcg.1790000000.abc_-',
  );
  assert.equal(verificationTokenOf('v1.a.b.c'), 'v1.a.b.c');
  assert.equal(verificationTokenOf(''), null);
  assert.equal(verificationTokenOf('#'), null);
  assert.equal(verificationTokenOf('#a b'), null);
  assert.equal(verificationTokenOf(`#${'a'.repeat(513)}`), null);
});

await test('a refused open policy names each missing part in words', () => {
  assert.equal(
    openRegistrationMissingText(['legal-documents']),
    'Anybody can sign up only when the installation has the terms and the privacy notice. Set up the legal documents on this page.',
  );
  assert.equal(
    openRegistrationMissingText(['mail', 'legal-documents']),
    'Anybody can sign up only when the installation has a mail server and the terms and the privacy notice. Set up the mail server and the legal documents on this page.',
  );
  // Record 0191: open registration needs no address for published pages, so
  // the page never sends the administrator to the operator for one.
  assert.doesNotMatch(
    openRegistrationMissingText(['mail', 'legal-documents']),
    /published|operator/,
  );
});

await test('a refusal names its missing parts, and anything else names none', () => {
  assert.deepEqual(
    missingPartsOf({ code: 'x', missing: ['mail', 3, 'legal-documents'] }),
    ['mail', 'legal-documents'],
  );
  assert.deepEqual(missingPartsOf({ code: 'x' }), []);
  assert.deepEqual(missingPartsOf(null), []);
});

await test('a reset link carries its token in the fragment', () => {
  assert.equal(
    resetTokenOf('#Zk3bV9qLw2Xy7Tn4Rp8Hd1Ms'),
    'Zk3bV9qLw2Xy7Tn4Rp8Hd1Ms',
  );
  assert.equal(resetTokenOf('abc_-123'), 'abc_-123');
  assert.equal(resetTokenOf(''), null);
  assert.equal(resetTokenOf('#'), null);
  assert.equal(resetTokenOf('#a b'), null);
  assert.equal(resetTokenOf(`#${'a'.repeat(513)}`), null);
});
