import assert from 'node:assert/strict';
import test from 'node:test';
import { hintStatement, markedWorkspaces } from './sync-hints.ts';

const first = '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
const second = '1a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';

await test('a mark names each workspace once, in order', () => {
  assert.deepEqual(markedWorkspaces(`${second},${first},${second}`), [
    first,
    second,
  ]);
  assert.deepEqual(markedWorkspaces(''), []);
  assert.deepEqual(markedWorkspaces(null), []);
  assert.deepEqual(markedWorkspaces(undefined), []);
});

await test('a value that is not an identifier never reaches the hint text', () => {
  assert.deepEqual(
    markedWorkspaces(`${first},'); drop table files; --,NOT-A-UUID`),
    [first],
  );
  const statement = hintStatement([first, "x'); drop table files; --"]);
  assert.ok(!statement.includes('drop table'));
  assert.ok(statement.includes(`('w:${first}')`));
});

await test('the hints go in one transaction that does not wait for its flush', () => {
  const statement = hintStatement([first, second]);
  assert.match(statement, /^begin; set local synchronous_commit to off; /);
  assert.match(statement, /pg_notify\('notesapp_sync', hint\)/);
  assert.match(statement, /; commit$/);
});
