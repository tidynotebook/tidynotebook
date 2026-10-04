/** Checks of the authentication fragment of the contract. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { authContractPaths } from './auth-contract.ts';

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The statuses that one operation of the fragment declares, by its id. */
function statusesOf(id: string): string[] {
  for (const item of Object.values(authContractPaths())) {
    if (!isRecord(item)) continue;
    for (const operation of Object.values(item)) {
      if (!isRecord(operation) || operation['operationId'] !== id) continue;
      const responses = operation['responses'];
      return isRecord(responses) ? Object.keys(responses) : [];
    }
  }
  throw new Error(`The fragment holds no operation ${id}.`);
}

await test('only the change of a profile refuses a locked account', () => {
  // A locked account keeps the identity operations and nothing else
  // (record 0201). The change of a display name is not one of them, so the
  // adapter answers it with 423 and the fragment declares that answer.
  assert.ok(statusesOf('updateProfile').includes('423'));
  for (const kept of [
    'signInWithPassword',
    'signOut',
    'getAuthSession',
    'requestPasswordReset',
    'resetPassword',
  ])
    assert.ok(!statusesOf(kept).includes('423'), kept);
});
