import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maxPasswordLength,
  minPasswordLength,
  optionalPasswordProblem,
  passwordProblem,
  passwordRule,
} from './password-policy.ts';

await test('the stated rule names the length that the check enforces', () => {
  assert.equal(passwordRule, 'Use at least 15 characters.');
  assert.ok(passwordRule.includes(String(minPasswordLength)));
});

await test('a password of the shortest accepted length passes', () => {
  assert.equal(passwordProblem('a'.repeat(minPasswordLength)), null);
});

await test('one character short is refused in the words of the rule', () => {
  assert.equal(
    passwordProblem('a'.repeat(minPasswordLength - 1)),
    'This password is too short.',
  );
});

await test('an empty password is refused where a password is needed', () => {
  assert.equal(passwordProblem(''), 'This password is too short.');
});

await test('a password of the longest accepted length passes', () => {
  assert.equal(passwordProblem('a'.repeat(maxPasswordLength)), null);
});

await test('one character too long is refused and names no code', () => {
  const problem = passwordProblem('a'.repeat(maxPasswordLength + 1));
  assert.equal(problem, 'This password is too long.');
});

await test('an empty optional password means no password and passes', () => {
  assert.equal(optionalPasswordProblem(''), null);
});

await test('an optional password keeps every other rule', () => {
  assert.equal(optionalPasswordProblem('short'), 'This password is too short.');
  assert.equal(
    optionalPasswordProblem('a'.repeat(maxPasswordLength + 1)),
    'This password is too long.',
  );
  assert.equal(optionalPasswordProblem('correct horse battery'), null);
});
