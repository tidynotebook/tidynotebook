import assert from 'node:assert/strict';
import test from 'node:test';
import { createAddressSeal } from './report-seal.ts';

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
  const last = sealed.at(-1) === 'A' ? 'B' : 'A';
  assert.equal(seal.open(`${sealed.slice(0, -1)}${last}`), null);
  assert.equal(seal.open(`v2.${sealed.slice(3)}`), null);
  assert.equal(seal.open('v1.'), null);
  assert.equal(seal.open(''), null);
});
