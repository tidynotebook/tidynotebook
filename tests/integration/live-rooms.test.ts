import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { acceptWithDocuments } from '@notesapp/core';
import {
  createDocumentService,
  openIdentityStore,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import {
  encodeNoteSync,
  encodeNoteAwareness,
  decodeNoteAwareness,
  updateActors,
  replaceDocumentText,
} from '@notesapp/note-document';
import {
  createLiveCluster,
  liveBounds,
  createLiveRelaySeal,
} from '@notesapp/server';
import {
  changeset,
  createDisposableDatabase,
  memberActor,
  revision,
  seedWorkspace,
} from './support/database.ts';

const db = await createDisposableDatabase();
const identity = openIdentityStore(db.runtimeUrl);
const content = openWorkspaceStore(db.runtimeUrl, createDocumentService());
const workspaceId = randomUUID();
const ownerId = randomUUID();
const editorId = randomUUID();
const viewerId = randomUUID();
const fileId = randomUUID();
const seal = createLiveRelaySeal('integration-only 36-byte room relay key');
const noticeAccess = async (sessionId: string, accountId: string) =>
  sessionId === accountId
    ? (await identity.memberships(accountId)).map((entry) => entry.workspaceId)
    : null;
const first = createLiveCluster({
  databaseUrl: db.runtimeUrl,
  seal,
  store: identity,
  noticeAccess,
});
const second = createLiveCluster({
  databaseUrl: db.runtimeUrl,
  seal,
  store: identity,
  noticeAccess,
});

function connection(accountId: string, name: string) {
  const output: Record<string, unknown>[] = [];
  return {
    accountId,
    sessionId: accountId,
    name,
    output,
    emit: (message: Record<string, unknown>) => {
      output.push(message);
    },
  };
}

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(description);
    await setTimeout(20);
  }
}

try {
  await seedWorkspace(db, workspaceId, [
    { accountId: ownerId, role: 'owner' },
    { accountId: editorId, role: 'editor' },
    { accountId: viewerId, role: 'viewer' },
  ]);
  const actor = memberActor(ownerId, workspaceId);
  const initial = revision({
    fileId,
    path: 'Collaboration.md',
    text: 'Initial text.',
  });
  const input = changeset(workspaceId, [initial]);
  const accepted = await content.transact(actor, workspaceId, (tx) =>
    acceptWithDocuments(content.documents, tx, actor, input, input.mutationId),
  );

  assert.ok(accepted.ok);
  const state = await identity.collaboration(actor, workspaceId, (tx) =>
    tx.liveNote(fileId),
  );
  assert.ok(state !== null);
  const edited = replaceDocumentText(state.bytes, 'Initial text. Editor text.');
  assert.ok(edited.ok);
  const update = encodeNoteSync({
    kind: 'update',
    bytes: edited.value.document,
  });
  const old = new Set(updateActors(state.bytes).clientIds);
  const id = updateActors(edited.value.document).clientIds.find(
    (current) => !old.has(current),
  );
  assert.ok(id !== undefined);
  const owner = connection(ownerId, 'Owner');
  const editor = connection(editorId, 'Editor');
  const viewer = connection(viewerId, 'Viewer');
  const room = (clientId: number) => ({
    roomId: randomUUID(),
    workspaceId,
    fileId,
    epoch: state.epoch,
    clientId,
  });
  const ownerRoom = room(6);
  const editorRoom = room(id);
  const viewerRoom = room(7);
  first.start();
  second.start();
  await waitFor(
    () => first.ready() && second.ready(),
    'The relay listeners did not start.',
  );

  await test('admission and awareness cross gateway boundaries with verified identity', async () => {
    await first.handle(owner, 'joinNote', ownerRoom);
    await second.handle(editor, 'joinNote', editorRoom);
    await waitFor(
      () => editor.output.some((entry) => entry['kind'] === 'noteJoined'),
      'The remote room did not join.',
    );
    const payload = Buffer.from(
      encodeNoteAwareness([
        {
          clientId: id,
          clock: 1,
          state: {
            accountId: ownerId,
            displayName: 'An invented name',
            idle: true,
          },
        },
      ]),
    ).toString('base64');
    await second.handle(editor, 'sendNoteAwareness', {
      roomId: editorRoom.roomId,
      payload,
    });
    await waitFor(
      () => owner.output.some((entry) => entry['kind'] === 'noteAwareness'),
      'Awareness did not reach the owner.',
    );
    const frame = owner.output.find(
      (entry) => entry['kind'] === 'noteAwareness',
    );
    assert.equal(typeof frame?.['payload'], 'string');
    const entries = decodeNoteAwareness(
      Buffer.from(String(frame?.['payload']), 'base64'),
      1,
    );
    assert.match(JSON.stringify(entries), /"displayName":"Editor"/);
    assert.doesNotMatch(JSON.stringify(entries), /An invented name/);
    await first.handle(viewer, 'joinNote', viewerRoom);
    assert.equal(
      viewer.output.find((frame) => frame['kind'] === 'noteJoined')?.['role'],
      'viewer',
    );
  });

  await test('viewer writes do not reach peers and removal evicts a remote room', async () => {
    await first.handle(viewer, 'sendNoteSync', {
      roomId: viewerRoom.roomId,
      payload: Buffer.from(update).toString('base64'),
    });
    assert.equal(
      owner.output.find((frame) => frame['kind'] === 'noteSync'),
      undefined,
    );
    assert.equal(
      await identity.collaboration(actor, workspaceId, (tx) =>
        tx.changeMember(editorId, null, false),
      ),
      'ok',
    );
    await second.recheck(editor);
    await waitFor(
      () =>
        editor.output.some(
          (entry) =>
            entry['kind'] === 'noteAccess' && entry['access'] === 'removed',
        ),
      'The removed editor kept a live room.',
    );
  });

  await test('awareness frames over the decoded byte limit close the note room', async () => {
    await first.handle(viewer, 'sendNoteAwareness', {
      roomId: viewerRoom.roomId,
      payload: Buffer.alloc(liveBounds.awarenessBytes + 1).toString('base64'),
    });
    assert.ok(
      viewer.output.some(
        (frame) =>
          frame['kind'] === 'noteStopped' &&
          frame['reason'] === 'invalid_update',
      ),
    );
  });
} finally {
  await Promise.all([first.close(), second.close()]);
  await Promise.all([identity.close(), content.close()]);
  await db.destroy();
}
