import assert from 'node:assert/strict';
import test from 'node:test';
import { ok } from '../files/model.ts';
import { verifyActor } from '../identity/actor.ts';
import {
  workspaceCollaboration,
  workspaceInvitationWrite,
  WorkspaceInvitationsOff,
  type CollaborationStore,
} from './collaboration.ts';

function unused(): never {
  throw new Error('This operation is unused.');
}

function store(enabled: boolean): CollaborationStore {
  return {
    collaboration: (_actor, _workspace, run) =>
      run({
        role: () => Promise.resolve('admin'),
        invitationEnabled: () => Promise.resolve(enabled),
        liveNoteAccess: unused,
        liveNote: unused,
        bindNoteClient: unused,
        members: unused,
        changeMember: unused,
        member: unused,
        invites: unused,
        inspectInvite: unused,
        createInvite: unused,
        adminInvite: unused,
        answerInvite: unused,
      }),
  };
}

const actor = verifyActor('admin', [
  { workspaceId: 'workspace', actions: ['manage_members', 'read'] },
]);
assert.ok(actor.ok);
const admin = actor.value;

await test('the owner switch gates invitation creation only', async () => {
  assert.deepEqual(
    await workspaceCollaboration(
      store(false),
      admin,
      'workspace',
      'invite',
      unused,
    ),
    { ok: false, error: { code: 'collaboration_off', fileIds: [] } },
  );
  const run = () => Promise.resolve(ok('allowed'));
  for (const action of ['read', 'manage_members'] as const)
    assert.deepEqual(
      await workspaceCollaboration(
        store(false),
        admin,
        'workspace',
        action,
        run,
      ),
      ok('allowed'),
    );
  assert.deepEqual(
    await workspaceCollaboration(
      store(true),
      admin,
      'workspace',
      'invite',
      run,
    ),
    ok('allowed'),
  );
});

await test('an invitation write reports the owner switch refusal', async () => {
  assert.deepEqual(
    await workspaceInvitationWrite(() =>
      Promise.reject(new WorkspaceInvitationsOff()),
    ),
    { ok: false, error: { code: 'collaboration_off', fileIds: [] } },
  );
  const failure = new Error('Unexpected failure.');
  await assert.rejects(
    workspaceInvitationWrite(() => Promise.reject(failure)),
    failure,
  );
});
