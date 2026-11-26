import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  acceptWorkspaceInvite,
  configureClient,
  createFile,
  createWorkspace,
  createWorkspaceInvites,
  listWorkspaces,
  readWorkspaceInviteLink,
  registerAccount,
  signInWithPassword,
  type WorkspaceInviteRole,
} from '@notesapp/api-client';
import { firstSave } from '../integration/support/documents.ts';

/** The disposable installation needs the owner account before the audit. */
export async function collaborationFixture(origin: string) {
  configureClient(origin);
  const owner = 'owner@example.com';
  const editor = 'editor@example.com';
  const viewer = 'viewer@example.com';
  const password =
    process.env.UI_AUDIT_PASSWORD ?? 'Workspace notes test 2026!';

  async function signInHeaders(email: string) {
    const result = await signInWithPassword({
      headers: { origin },
      body: { email, password },
    });
    if (result.data === undefined) return null;
    const cookie = result.response.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    return { origin, cookie };
  }

  const headers = await signInHeaders(owner);
  assert.ok(headers, 'Bootstrap the disposable owner account first.');
  const workspace = await createWorkspace({
    headers,
    body: { name: 'Collaboration check' },
  });
  assert.ok(workspace.data, JSON.stringify(workspace.error));
  const { workspaceId, name: workspaceName } = workspace.data;
  const path = { workspaceId };

  async function invite(
    email: string,
    role: WorkspaceInviteRole,
    inviteWorkspaceId = workspaceId,
  ) {
    const invitePath = { workspaceId: inviteWorkspaceId };
    const created = await createWorkspaceInvites({
      path: invitePath,
      headers,
      body: { emails: [email], role },
    });
    assert.ok(created.data, JSON.stringify(created.error));
    const invitationId = created.data.results[0]?.invitationId;
    assert.ok(invitationId);
    const link = await readWorkspaceInviteLink({
      path: { ...invitePath, invitationId },
      headers,
    });
    assert.ok(link.data, JSON.stringify(link.error));
    return { invitationId, url: link.data.url };
  }

  for (const [role, email] of [
    ['editor', editor],
    ['viewer', viewer],
  ] as const) {
    const link = await invite(email, role);
    const current = await signInHeaders(email);
    if (current !== null) {
      const accepted = await acceptWorkspaceInvite({
        path: { invitationId: link.invitationId },
        headers: current,
      });
      assert.ok(accepted.data, JSON.stringify(accepted.error));
    } else {
      const registered = await registerAccount({
        headers: { origin },
        body: {
          invitation: new URL(link.url).hash.slice(1),
          password,
          name: role === 'editor' ? 'Casey Editor' : 'Sam Viewer',
        },
      });
      assert.ok(registered.data, JSON.stringify(registered.error));
    }
  }

  const pending = await invite('pending@example.com', 'editor');
  await invite('another@example.com', 'viewer');
  const forViewer = await createWorkspace({
    headers,
    body: { name: 'Join check' },
  });
  assert.ok(forViewer.data, JSON.stringify(forViewer.error));
  const viewerLink = await invite(viewer, 'viewer', forViewer.data.workspaceId);
  const viewerHeaders = await signInHeaders(viewer);
  assert.ok(viewerHeaders);
  const forEditor = await createWorkspace({
    headers,
    body: { name: 'Switcher check' },
  });
  assert.ok(forEditor.data, JSON.stringify(forEditor.error));
  await invite(viewer, 'editor', forEditor.data.workspaceId);
  const editorHeaders = await signInHeaders(editor);
  assert.ok(editorHeaders);
  const spaces = await listWorkspaces({ headers: editorHeaders });
  assert.ok(spaces.data, JSON.stringify(spaces.error));
  const editorPersonal = spaces.data.workspaces.find((space) => space.personal);
  assert.ok(editorPersonal);

  const fileId = randomUUID();
  const note = await createFile({
    path,
    headers,
    body: {
      path: 'Launch plan.md',
      fileId,
      mutationId: randomUUID(),
      revisionId: randomUUID(),
      deviceId: randomUUID(),
      document: firstSave('We are ready to edit this note together.\n'),
    },
  });
  assert.ok(note.data, JSON.stringify(note.error));
  return {
    owner,
    editor,
    viewer,
    password,
    workspaceId,
    workspaceName,
    fileId,
    pendingLink: pending.url,
    viewerLink: viewerLink.url,
    viewerJoinId: forViewer.data.workspaceId,
    viewerSwitcherId: forEditor.data.workspaceId,
    editorPersonalId: editorPersonal.workspaceId,
  };
}
