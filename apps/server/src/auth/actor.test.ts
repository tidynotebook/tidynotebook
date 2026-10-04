import assert from 'node:assert/strict';
import test from 'node:test';
import { accountForSession, bearerToken, sameSecret } from './actor.ts';

await test('a session resolves to the account that the store serves', async () => {
  const asked: string[] = [];
  const account = await accountForSession(
    {
      sessionAccount: (authUserId) => {
        asked.push(authUserId);
        return Promise.resolve('existing-account');
      },
    },
    'linked-auth-user',
  );
  assert.equal(account, 'existing-account');
  assert.deepEqual(asked, ['linked-auth-user']);
});

await test('an unlinked, disabled or removed identity resolves to nothing', async () => {
  // The store answers null for each of the three, and the resolver makes no
  // account of its own (records 0108 and 0111).
  const account = await accountForSession(
    { sessionAccount: () => Promise.resolve(null) },
    'unlinked-auth-user',
  );
  assert.equal(account, null);
});

await test('the operator token is read from a bearer header and nothing else', () => {
  assert.equal(bearerToken(`Bearer ${'a'.repeat(40)}`), 'a'.repeat(40));
  assert.equal(bearerToken(undefined), null);
  assert.equal(bearerToken(['Bearer abc']), null);
  assert.equal(bearerToken('Basic abc'), null);
  assert.equal(bearerToken('bearer abc'), null);
  assert.equal(bearerToken('Bearer a b'), null);
  assert.equal(bearerToken('Bearer '), null);
});

await test('the operator token compares whole and refuses a prefix', () => {
  const secret = 'operator-secret-'.repeat(3);
  assert.equal(sameSecret(secret, secret), true);
  assert.equal(sameSecret(secret.slice(0, -1), secret), false);
  assert.equal(sameSecret(`${secret}x`, secret), false);
  assert.equal(sameSecret('', secret), false);
});
