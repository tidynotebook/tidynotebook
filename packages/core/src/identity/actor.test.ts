/**
 * Role and grant decisions.
 *
 * The tests cover every role and action pair, a grant that is missing while
 * the role permits the action, a grant that names another workspace, and the
 * run time checks of `verifyActor`. One role is left, so the matrix is small,
 * but the intersection of the role and the verified grant is still the rule.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionsForRole,
  authorize,
  verifyActor,
  type Action,
  type Actor,
  type Role,
  type StoredGrant,
} from './actor.ts';

const workspace = 'workspace-1';
const other = 'workspace-2';
const roles: readonly Role[] = ['owner', 'admin', 'editor', 'viewer'];
const actions: readonly Action[] = [
  'read',
  'history',
  'write',
  'purge',
  'publish',
  'manage_members',
];
const permitted: Readonly<Record<Role, readonly Action[]>> = {
  owner: ['read', 'history', 'write', 'purge', 'publish', 'manage_members'],
  admin: ['read', 'history', 'write', 'purge', 'publish', 'manage_members'],
  editor: ['read', 'history', 'write'],
  viewer: ['read', 'history'],
};

/**
 * The role texts that a stored row could hold and the union does not.
 *
 * Each of them names a role of an earlier release or of a product that this
 * one is not. The tests below read them as text, because the union holds
 * none of them and nothing may claim that it does.
 */
const storedRolesOutsideTheUnion: readonly string[] = ['superuser', ''];

/** The verified actor, or a test failure when the input was rejected. */
function actorOf(accountId: string, grants: readonly StoredGrant[]): Actor {
  const result = verifyActor(accountId, grants);
  assert.equal(result.ok, true, 'expected the actor to be verified');
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

/** An actor whose verified grants cover every action in one workspace. */
function fullActor(workspaceId: string = workspace): Actor {
  return actorOf('account-1', [{ workspaceId, actions }]);
}

await test('the role matrix decides every role and action pair', () => {
  for (const role of roles) {
    for (const action of actions) {
      const result = authorize(fullActor(), workspace, role, action);
      const expected = permitted[role].includes(action);
      assert.equal(
        result.ok,
        expected,
        `${role} and ${action} must be ${String(expected)}`,
      );
      if (!result.ok) {
        assert.equal(result.error.code, 'forbidden');
        assert.deepEqual(result.error.fileIds, []);
      }
    }
  }
});

await test('a missing grant denies an action that the role permits', () => {
  const actor = actorOf('account-1', [
    { workspaceId: workspace, actions: ['read', 'history'] },
  ]);
  assert.equal(authorize(actor, workspace, 'owner', 'read').ok, true);
  const denied = authorize(actor, workspace, 'owner', 'write');
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, 'forbidden');
});

await test('an actor without any grant is denied', () => {
  const actor = actorOf('account-1', []);
  assert.equal(authorize(actor, workspace, 'owner', 'read').ok, false);
});

await test('a grant for another workspace does not apply', () => {
  const actor = fullActor(other);
  assert.equal(authorize(actor, other, 'owner', 'write').ok, true);
  assert.equal(authorize(actor, workspace, 'owner', 'write').ok, false);
});

await test('a role outside the union permits no action', () => {
  // A stored row can hold a role text that the union no longer contains. The
  // lookup must answer with no action instead of failing, so every decision
  // that reads it becomes a denial.
  for (const role of storedRolesOutsideTheUnion) {
    assert.deepEqual([...actionsForRole(role)], [], role);
  }
  assert.deepEqual([...actionsForRole('owner')], [...permitted.owner]);
});

await test('a grant cannot widen what the role permits', () => {
  // The decision is the intersection. A grant that carries an action the role
  // does not permit still denies it, because the role is read first.
  const actor = fullActor();
  for (const action of actions)
    assert.equal(
      authorize(actor, workspace, 'owner', action).ok,
      permitted.owner.includes(action),
      action,
    );
});

await test('a verified actor copies the grants it was given', () => {
  const grants: { workspaceId: string; actions: Action[] }[] = [
    { workspaceId: workspace, actions: ['read'] },
  ];
  const actor = actorOf('account-1', grants);
  grants[0]?.actions.push('purge');
  assert.equal(authorize(actor, workspace, 'owner', 'purge').ok, false);
  assert.equal(actor.accountId, 'account-1');
});

await test('an empty account identifier is rejected', () => {
  const result = verifyActor('', [{ workspaceId: workspace, actions: [] }]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'forbidden');
    assert.deepEqual(result.error.fileIds, []);
  }
});

await test('an empty workspace identifier is rejected', () => {
  const result = verifyActor('account-1', [
    { workspaceId: '', actions: ['read'] },
  ]);
  assert.equal(result.ok, false);
});

await test('an unknown action rejects the whole actor', () => {
  // A stored token scope can hold a string that the union no longer contains.
  // Nothing is dropped silently: a partly understood scope must not become a
  // smaller scope that then looks verified.
  const result = verifyActor('account-1', [
    { workspaceId: workspace, actions: ['read', 'administer'] },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'forbidden');
});

await test('a verified actor keeps only the actions it was given', () => {
  const result = verifyActor('account-1', [
    { workspaceId: workspace, actions: ['read', 'history'] },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.value.grants.map((grant) => [...grant.actions]),
    [['read', 'history']],
  );
});
