import assert from 'node:assert/strict';
import test from 'node:test';
import { hasEmailProblem } from './email-problem.ts';
await test('only a server email field issue belongs to the email field', () => {
  assert.equal(hasEmailProblem({ issues: [{ path: '/email' }] }), true);
  assert.equal(hasEmailProblem({ issues: [{ path: '/body/email' }] }), true);
  for (const value of [
    null,
    {},
    { issues: [{ path: '/password' }] },
    { issues: [null] },
    { issues: 'email' },
  ])
    assert.equal(hasEmailProblem(value), false);
});
