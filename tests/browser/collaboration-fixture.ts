import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  configureClient,
  createFile,
  createInvitation,
  createWorkspace,
  createWorkspaceInvites,
  deleteWorkspace,
  getFile,
  listAccounts,
  listFiles,
  listHistory,
  listWorkspaces,
  readWorkspaceInviteLink,
  registerAccount,
  removeAccount,
  revokeInvitation,
  signInWithPassword,
  type WorkspaceInviteRole,
} from '@notesapp/api-client';
import { firstSave } from '../integration/support/documents.ts';

type FixtureHeaders = { origin: string; cookie: string };

/** The disposable installation needs the owner account before the audit. */
export async function collaborationFixture(
  origin: string,
  cleanup: (() => Promise<void>)[],
  suffix: string,
  signupEmail?: string,
) {
  configureClient(origin, undefined);
  const tag = randomUUID().slice(0, 12);
  const owner = `owner-${tag}@example.com`;
  const editor = `editor-${tag}@example.com`;
  const viewer = `viewer-${tag}@example.com`;
  const pendingEmail = signupEmail ?? `pending-${tag}@example.com`;
  const password =
    process.env.UI_AUDIT_PASSWORD ?? 'Workspace notes test 2026!';

  async function signInHeaders(email: string): Promise<FixtureHeaders | null> {
    const result = await signInWithPassword({
      headers: { origin },
      body: { email, password },
    });
    if (result.data === undefined || result.response === undefined) return null;
    const cookie = result.response.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    return { origin, cookie };
  }

  const admin = await signInHeaders('owner@example.com');
  assert.ok(admin, 'Bootstrap the disposable owner account first.');
  const workspaces: string[] = [];
  const accountEmails = new Set([owner, editor, viewer, pendingEmail]);
  let fixtureOwner: FixtureHeaders | null = null;
  let pendingAccountInvite: string | null = null;
  cleanup.push(async () => {
    const failures: unknown[] = [];
    for (const workspaceId of workspaces) {
      try {
        const headers = fixtureOwner;
        assert.ok(headers);
        const result = await deleteWorkspace({
          headers,
          path: { workspaceId },
        });
        assert.equal(result.error, undefined, JSON.stringify(result.error));
      } catch (error) {
        failures.push(error);
      }
    }
    if (pendingAccountInvite !== null) {
      const result = await revokeInvitation({
        headers: admin,
        path: { invitationId: pendingAccountInvite },
      });
      if (result.error !== undefined) failures.push(result.error);
    }
    const accounts = await listAccounts({ headers: admin });
    assert.ok(accounts.data, JSON.stringify(accounts.error));
    for (const account of accounts.data.accounts) {
      if (account.email === null || !accountEmails.has(account.email)) continue;
      try {
        const result: { error?: unknown } = await removeAccount({
          headers: admin,
          path: { accountId: account.accountId },
        });
        assert.equal(result.error, undefined, JSON.stringify(result.error));
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(
        failures,
        'Collaboration fixture cleanup failed.',
      );
  });
  const invitation = await createInvitation({
    headers: admin,
    body: { email: owner },
  });
  assert.ok(invitation.data, JSON.stringify(invitation.error));
  pendingAccountInvite = invitation.data.invitation.invitationId;
  assert.ok(invitation.data.link);
  const registered = await registerAccount({
    headers: { origin },
    body: {
      invitation: new URL(invitation.data.link).hash.slice(1),
      password,
      name: 'Owner',
    },
  });
  assert.ok(registered.data, JSON.stringify(registered.error));
  pendingAccountInvite = null;
  const signedIn = await signInHeaders(owner);
  assert.ok(signedIn);
  const headers: FixtureHeaders = signedIn;
  fixtureOwner = headers;

  async function createFixtureWorkspace(name: string) {
    const result = await createWorkspace({ headers, body: { name } });
    assert.ok(result.data, JSON.stringify(result.error));
    workspaces.push(result.data.workspaceId);
    return result.data;
  }

  const workspace = await createFixtureWorkspace(
    `Collaboration check${suffix}`,
  );
  const { workspaceId, name: workspaceName } = workspace;
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
    const address = new URL(link.data.url);
    return {
      invitationId,
      url: `${origin}${address.pathname}${address.search}${address.hash}`,
    };
  }

  for (const [role, email] of [
    ['editor', editor],
    ['viewer', viewer],
  ] as const) {
    const link = await invite(email, role);
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

  const pending = await invite(pendingEmail, 'editor');
  await invite('another@example.com', 'viewer');
  const forViewer = await createFixtureWorkspace(`Join check${suffix}`);
  const viewerLink = await invite(viewer, 'viewer', forViewer.workspaceId);
  const forEditor = await createFixtureWorkspace(`Switcher check${suffix}`);
  await invite(viewer, 'editor', forEditor.workspaceId);
  const editorHeaders = await signInHeaders(editor);
  assert.ok(editorHeaders);
  const spaces = await listWorkspaces({ headers: editorHeaders });
  assert.ok(spaces.data, JSON.stringify(spaces.error));
  const editorPersonal = spaces.data.workspaces.find((space) => space.personal);
  assert.ok(editorPersonal);

  async function createNote(name: string) {
    const fileId = randomUUID();
    const note = await createFile({
      path,
      headers,
      body: {
        path: `${name}.md`,
        fileId,
        mutationId: randomUUID(),
        revisionId: randomUUID(),
        deviceId: randomUUID(),
        document: firstSave('We are ready to edit this note together.\n'),
      },
    });
    assert.ok(note.data, JSON.stringify(note.error));
    return fileId;
  }
  const fileId = await createNote('Launch plan');
  const notePath = { ...path, fileId };
  const personalPath = { workspaceId: editorPersonal.workspaceId };
  return {
    owner,
    editor,
    viewer,
    password,
    workspaceId,
    workspaceName,
    fileId,
    pendingEmail,
    pendingLink: pending.url,
    viewerLink: viewerLink.url,
    viewerJoinId: forViewer.workspaceId,
    viewerJoinName: forViewer.name,
    viewerSwitcherId: forEditor.workspaceId,
    viewerSwitcherName: forEditor.name,
    editorPersonalId: editorPersonal.workspaceId,
    createNote,
    async readNote() {
      const result = await getFile({
        path: notePath,
        headers,
        query: { content: 'text' },
      });
      assert.ok(result.data, JSON.stringify(result.error));
      return result.data.head?.text;
    },
    async readHistory() {
      const result = await listHistory({ path: notePath, headers });
      assert.ok(result.data, JSON.stringify(result.error));
      return result.data.revisions;
    },
    async addRecoveryOccupant(name: string) {
      const result = await createFile({
        path: personalPath,
        headers: editorHeaders,
        body: {
          path: `From ${workspaceName}/${name}.md`,
          fileId: randomUUID(),
          mutationId: randomUUID(),
          revisionId: randomUUID(),
          deviceId: randomUUID(),
          document: firstSave('This note was already in Personal.'),
        },
      });
      assert.ok(result.data, JSON.stringify(result.error));
    },
    async readRecovery(fileId: string) {
      const result = await getFile({
        path: { ...personalPath, fileId },
        headers: editorHeaders,
        query: { content: 'text' },
      });
      assert.ok(result.data, JSON.stringify(result.error));
      return result.data;
    },
    async recoveryPaths() {
      const result = await listFiles({
        path: personalPath,
        headers: editorHeaders,
        query: { limit: 500 },
      });
      assert.ok(result.data, JSON.stringify(result.error));
      return result.data.files
        .map((file) => file.path)
        .filter((path) => path.startsWith(`From ${workspaceName}/`))
        .sort();
    },
  };
}

export async function clearCollaborationFixtures(
  cleanup: readonly (() => Promise<void>)[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const remove of cleanup) {
    try {
      await remove();
    } catch (failure) {
      failures.push(failure);
    }
  }
  if (failures.length > 0)
    throw new AggregateError(
      failures,
      'Could not remove all collaboration fixtures.',
    );
}
