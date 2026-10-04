/**
 * The list of record 0201 against the contract.
 *
 * `packages/core` holds the one list of the operations that a locked account
 * keeps, and it imports no contract. This server is the one package that
 * reads both, so it holds the list to the contract here: a name of the list
 * that the contract does not declare fails, and so does an operation that a
 * session reaches, that the list does not name, and that cannot answer 423.
 * A new operation therefore stays refused for a locked account until the
 * list names it, and the boundary can always answer that refusal.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { operations, responseMediaTypes } from '@notesapp/api-contract';
import { lockedAccountKeeps, lockedAccountOperations } from '@notesapp/core';
import { AccountLockedError } from '../plugins/problem.ts';
import { refuseLocked } from './actor.ts';

/** Whether a session reaches an operation, through the hook or a library. */
function sessionReaches(operation: (typeof operations)[number]): boolean {
  return (
    operation.security.some((requirement) => 'sessionCookie' in requirement) ||
    operation.protocol !== null
  );
}

await test('every operation that the list names is one of the contract', () => {
  for (const id of lockedAccountOperations)
    assert.ok(
      operations.some((operation) => operation.id === id),
      `${id} is not an operation of the contract`,
    );
});

await test('every operation that a locked account loses can answer account_locked', () => {
  const refused = operations.filter(
    (operation) =>
      sessionReaches(operation) && !lockedAccountKeeps(operation.id),
  );
  assert.ok(refused.some((operation) => operation.id === 'commitChangeset'));
  assert.ok(refused.some((operation) => operation.id === 'updateProfile'));
  for (const operation of refused)
    assert.deepEqual(
      responseMediaTypes(operation.id, 423),
      ['application/problem+json'],
      `${operation.id} declares no 423, so a locked account would get a server error`,
    );
});

await test('no operation that a locked account keeps declares account_locked', () => {
  for (const operation of operations) {
    const declares = responseMediaTypes(operation.id, 423).length > 0;
    if (lockedAccountKeeps(operation.id))
      assert.equal(declares, false, operation.id);
    // An operation with no session never meets a locked account.
    if (!sessionReaches(operation)) assert.equal(declares, false, operation.id);
  }
});

await test('a locked account is refused what the list does not name, and nothing else is', () => {
  assert.throws(
    () => refuseLocked('locked', 'commitChangeset'),
    AccountLockedError,
  );
  assert.doesNotThrow(() => refuseLocked('locked', 'exportWorkspace'));
  assert.doesNotThrow(() => refuseLocked('locked', 'openAccountPortal'));
  for (const operation of operations)
    assert.doesNotThrow(() => refuseLocked('active', operation.id));
});
