/** Rules of registration and of an invitation (record 0108). */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { RegistrationRequest, RegistrationStore } from './ports.ts';
import {
  defaultAccountLimitBytes,
  invitationExpiry,
  invitationState,
  normalizeEmail,
  openRegistrationMissing,
  openSignUpAction,
  readInvitation,
  registerAccount,
} from './registration.ts';

const digest = 'b'.repeat(64);

function request(
  ground: RegistrationRequest['ground'],
  limitBytes = defaultAccountLimitBytes,
): RegistrationRequest {
  return {
    authUserId: 'user-1',
    ground,
    accountId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    workspaceName: 'Personal',
    newAccount: { limitBytes, standing: 'active', removeAfterSeconds: null },
  };
}

function storeAnswering(
  account: string | null,
  address: string | null = null,
): RegistrationStore & { readonly calls: RegistrationRequest[] } {
  const calls: RegistrationRequest[] = [];
  return {
    calls,
    register: (input) => {
      calls.push(input);
      return Promise.resolve(account);
    },
    invitationAddress: () => Promise.resolve(address),
    registrationPolicy: () => Promise.resolve('open'),
  };
}

await test('an address has one written form', () => {
  assert.equal(normalizeEmail(' Ada@Example.TEST '), 'ada@example.test');
  for (const bad of ['', 'a', 'no-at', '@example.test', 'ada@', 'a@b@c'])
    assert.equal(normalizeEmail(bad), null, bad);
  assert.equal(normalizeEmail(`${'a'.repeat(320)}@x`), null);
});

await test('an invitation expires after its lifetime', () => {
  const now = new Date('2026-09-26T10:00:00.000Z');
  const expiresAt = invitationExpiry(now, 24);
  assert.equal(expiresAt, '2026-09-27T10:00:00.000Z');
  assert.equal(invitationState({ expiresAt }, now), 'pending');
  assert.equal(
    invitationState({ expiresAt }, new Date('2026-09-27T10:00:00.000Z')),
    'expired',
  );
});

await test('a registration that the store refuses answers one code per ground', async () => {
  const refused = storeAnswering(null);
  assert.deepEqual(
    await registerAccount(
      refused,
      request({ kind: 'invitation', tokenDigest: digest }),
    ),
    { ok: false, error: { code: 'invitation_invalid', fileIds: [] } },
  );
  assert.deepEqual(
    await registerAccount(refused, request({ kind: 'first-run' })),
    { ok: false, error: { code: 'forbidden', fileIds: [] } },
  );
  // The open ground fails only when the policy stopped being open.
  assert.deepEqual(await registerAccount(refused, request({ kind: 'open' })), {
    ok: false,
    error: { code: 'registration_closed', fileIds: [] },
  });
  const made = storeAnswering('11111111-1111-4111-8111-111111111111');
  assert.deepEqual(
    await registerAccount(
      made,
      request({ kind: 'invitation', tokenDigest: digest }),
    ),
    { ok: true, value: '11111111-1111-4111-8111-111111111111' },
  );
});

await test('a malformed digest or limit never reaches the store', async () => {
  const store = storeAnswering('11111111-1111-4111-8111-111111111111');
  assert.equal(
    (
      await registerAccount(
        store,
        request({ kind: 'invitation', tokenDigest: 'nope' }),
      )
    ).ok,
    false,
  );
  assert.equal(
    (await registerAccount(store, request({ kind: 'first-run' }, 0n))).ok,
    false,
  );
  assert.equal(store.calls.length, 0);
  assert.deepEqual(await readInvitation(store, 'nope'), {
    ok: false,
    error: { code: 'invitation_invalid', fileIds: [] },
  });
});

await test('a valid invitation answers its address', async () => {
  assert.deepEqual(
    await readInvitation(storeAnswering(null, 'ada@example.test'), digest),
    { ok: true, value: 'ada@example.test' },
  );
  assert.deepEqual(await readInvitation(storeAnswering(null), digest), {
    ok: false,
    error: { code: 'invitation_invalid', fileIds: [] },
  });
});

await test('open registration names each part it lacks', () => {
  assert.deepEqual(
    openRegistrationMissing({ mail: false, legalDocuments: false }),
    ['mail', 'legal-documents'],
  );
  assert.deepEqual(
    openRegistrationMissing({ mail: true, legalDocuments: false }),
    ['legal-documents'],
  );
  assert.deepEqual(
    openRegistrationMissing({ mail: false, legalDocuments: true }),
    ['mail'],
  );
});

await test('open registration needs no published origin', () => {
  // Record 0191: with no published origin, the application origin serves
  // the reader path, so mail and the legal documents are all that open
  // registration needs.
  assert.deepEqual(
    openRegistrationMissing({ mail: true, legalDocuments: true }),
    [],
  );
});

await test('an open sign-up makes, replaces or notifies, and never keeps a stranger', () => {
  assert.equal(openSignUpAction(null), 'create');
  // An identity user that no account links is pending, so a new sign-up
  // replaces it with its password (record 0114).
  assert.equal(openSignUpAction({ linked: false }), 'replace');
  assert.equal(openSignUpAction({ linked: true }), 'notify');
});
