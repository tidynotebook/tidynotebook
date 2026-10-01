import assert from 'node:assert/strict';
import test from 'node:test';
import { createAddressSeal, createMailPasswordSeal } from './seal.ts';

const secret = 'report-seal-test-secret-0123456789abcdef';
const token = 'Zx9_published-token-value-0123456789abcdefg';
const address = `https://pages.example.net/published/${token}`;

await test('a sealed address opens with the same secret and holds no token', () => {
  const seal = createAddressSeal(secret);
  const sealed = seal.seal(address);
  assert.ok(!sealed.includes(token));
  assert.ok(!sealed.includes('published'));
  assert.equal(seal.open(sealed), address);
  // Each seal draws a new nonce, so two reports of one link differ.
  assert.notEqual(seal.seal(address), sealed);
});

await test('another secret, a changed value or another shape opens nothing', () => {
  const sealed = createAddressSeal(secret).seal(address);
  assert.equal(createAddressSeal(`${secret}-changed`).open(sealed), null);
  const seal = createAddressSeal(secret);
  // A character in the middle carries six data bits. The last one can carry
  // padding bits only, and a change of those gives the same bytes.
  const middle = Math.floor(sealed.length / 2);
  const changed = sealed[middle] === 'A' ? 'B' : 'A';
  assert.equal(
    seal.open(
      `${sealed.slice(0, middle)}${changed}${sealed.slice(middle + 1)}`,
    ),
    null,
  );
  assert.equal(seal.open(`v2.${sealed.slice(3)}`), null);
  assert.equal(seal.open('v1.'), null);
  assert.equal(seal.open(''), null);
});

await test('a key of one purpose opens no value of another', () => {
  const password = createMailPasswordSeal(secret).seal('mail-password');
  assert.ok(!password.includes('mail-password'));
  assert.equal(createMailPasswordSeal(secret).open(password), 'mail-password');
  assert.equal(createAddressSeal(secret).open(password), null);
  assert.equal(
    createMailPasswordSeal(secret).open(
      createAddressSeal(secret).seal(address),
    ),
    null,
  );
});
