import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import {
  acceptWithDocuments,
  commitChangeset,
  type CollaborationStore,
} from '@notesapp/core';
import {
  createDocumentService,
  openIdentityStore,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import {
  encodeNoteSync,
  encodeDocumentDelta,
  documentStateVector,
  observeDocument,
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
  openSession,
  revision,
  seedWorkspace,
} from './support/database.ts';

const db = await createDisposableDatabase();
const identity = openIdentityStore(db.runtimeUrl);
const content = openWorkspaceStore(db.runtimeUrl, createDocumentService());
const workspaceId = randomUUID();
const ownerId = 'a0000000-0000-4000-8000-000000000001';
const editorId = 'a0000000-0000-4000-8000-000000000007';
const viewerId = randomUUID();
const fileId = randomUUID();
const seal = createLiveRelaySeal('integration-only 36-byte room relay key');
let transactions = 0;
let documentReads = 0;
let accessReads = 0;
const store: CollaborationStore = {
  collaboration(actor, workspaceId, run) {
    transactions += 1;
    return identity.collaboration(actor, workspaceId, (tx) =>
      run({
        ...tx,
        liveNote(fileId) {
          documentReads += 1;
          return tx.liveNote(fileId);
        },
      }),
    );
  },
};
const noticeAccess = async (sessionId: string, accountId: string) => {
  accessReads += 1;
  return sessionId === accountId
    ? (await identity.memberships(accountId)).map((entry) => entry.workspaceId)
    : null;
};
const first = createLiveCluster({
  databaseUrl: db.runtimeUrl,
  seal,
  store,
  noticeAccess,
});
const second = createLiveCluster({
  databaseUrl: db.runtimeUrl,
  seal,
  store,
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
  const delta = encodeDocumentDelta(
    edited.value.document,
    documentStateVector(state.bytes),
  );
  const update = encodeNoteSync({ kind: 'update', bytes: delta });
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
    const editorAccess = await identity.collaboration(
      memberActor(editorId, workspaceId),
      workspaceId,
      (tx) => tx.liveNoteAccess(fileId),
    );
    assert.ok(editorAccess);
    assert.match(
      JSON.stringify(entries),
      new RegExp(`"slot":${editorAccess.colorSlot}[,}]`),
    );
    assert.notEqual(
      owner.output.find((frame) => frame['kind'] === 'noteJoined')?.[
        'colorSlot'
      ],
      editorAccess.colorSlot,
    );
    await first.handle(viewer, 'joinNote', viewerRoom);
    assert.equal(
      viewer.output.find((frame) => frame['kind'] === 'noteJoined')?.['role'],
      'viewer',
    );
  });

  await test('message delivery uses the cached role and document for every peer', async () => {
    const updates = 8;
    const count = (peer: typeof owner) =>
      peer.output.filter((entry) => entry['kind'] === 'noteSync').length;
    const oldOwner = count(owner);
    const oldViewer = count(viewer);
    const reads = [transactions, documentReads, accessReads];
    for (let index = 0; index < updates; index += 1)
      await second.handle(editor, 'sendNoteSync', {
        roomId: editorRoom.roomId,
        payload: Buffer.from(update).toString('base64'),
      });
    await waitFor(
      () =>
        count(owner) === oldOwner + updates &&
        count(viewer) === oldViewer + updates,
      'The updates did not reach both recipients.',
    );
    assert.deepEqual([transactions, documentReads, accessReads], reads);
  });

  await test('a live update reaches the peer and its binding supplies checkpoint authorship', async () => {
    await second.handle(editor, 'sendNoteSync', {
      roomId: editorRoom.roomId,
      payload: Buffer.from(update).toString('base64'),
    });
    await waitFor(
      () => owner.output.some((entry) => entry['kind'] === 'noteSync'),
      'The live update did not reach the other gateway.',
    );
    const dependent = revision({
      fileId,
      path: 'Collaboration.md',
      parents: [initial.id],
      content: {
        kind: 'markdown',
        document: {
          epoch: state.epoch,
          observed: observeDocument(state.bytes),
          work: { kind: 'update', update: delta },
        },
      },
    });
    const save = changeset(workspaceId, [dependent], {
      expectedHeads: { [fileId]: initial.id },
    });
    const result = await content.transact(actor, workspaceId, (tx) =>
      acceptWithDocuments(content.documents, tx, actor, save, save.mutationId),
    );
    assert.ok(result.ok, JSON.stringify(result));
    const runtime = await openSession(db.runtimeUrl, ownerId);
    const editorRuntime = await openSession(db.runtimeUrl, editorId);
    try {
      const insert =
        'insert into revision_contributors (workspace_id, revision_id, account_id) values ($1, $2, $3)';
      assert.equal(
        (await runtime.failure(insert, [workspaceId, dependent.id, viewerId]))
          .code,
        '42501',
      );
      assert.equal(
        (
          await editorRuntime.failure(insert, [
            workspaceId,
            dependent.id,
            ownerId,
          ])
        ).code,
        '42501',
      );
    } finally {
      await runtime.close();
      await editorRuntime.close();
    }
    const history = await content.transact(actor, workspaceId, (tx) =>
      tx.listHistory(fileId, { limit: 10, cursor: null }),
    );
    assert.deepEqual(
      history.revisions
        .find((entry) => entry.revisionId === dependent.id)
        ?.contributors?.map((person) => person.accountId),
      [editorId],
    );

    const parallel = revision({
      fileId,
      path: 'Collaboration.md',
      parents: [initial.id],
      content: dependent.content,
    });
    const parallelSave = changeset(workspaceId, [parallel], {
      expectedHeads: { [fileId]: initial.id },
    });
    const editorActor = memberActor(editorId, workspaceId);
    const receipt = await commitChangeset(
      content,
      editorActor,
      parallelSave,
      parallelSave.mutationId,
    );
    assert.ok(receipt.ok, JSON.stringify(receipt));
    const after = await content.transact(actor, workspaceId, (tx) =>
      tx.listHistory(fileId, { limit: 2, cursor: null }),
    );
    assert.deepEqual(
      after.revisions.map((version) => version.revisionId),
      [dependent.id, initial.id],
    );
    assert.equal(after.nextCursor, null);
  });

  await test('access rechecks read document bytes only after a durable head changes', async () => {
    const before = documentReads;
    await first.recheck(owner);
    assert.equal(documentReads, before + 1);
    await first.recheck(viewer);
    await first.recheck(owner);
    assert.equal(documentReads, before + 1);
  });

  await test('a viewer rejoin after downgrade cannot relay text or replace a writer binding', async () => {
    const late = connection(editorId, 'Editor');
    const changed = replaceDocumentText(state.bytes, 'Late client edit.');
    assert.ok(changed.ok);
    const vector = documentStateVector(state.bytes);
    const lateDelta = encodeDocumentDelta(changed.value.document, vector);
    const [clientId] = updateActors(lateDelta, vector).clientIds;
    assert.ok(clientId !== undefined);
    const lateRoom = room(clientId);
    const changeRole = (role: 'viewer' | 'editor') =>
      identity.collaboration(actor, workspaceId, (tx) =>
        tx.changeMember(editorId, role, false),
      );
    try {
      assert.equal(await changeRole('viewer'), 'ok');
      const previous = editor.output.length;
      await second.handle(editor, 'joinNote', editorRoom);
      await waitFor(
        () =>
          editor.output
            .slice(previous)
            .some(
              (frame) =>
                frame['kind'] === 'noteJoined' && frame['role'] === 'viewer',
            ),
        'The open room did not learn of the downgrade.',
      );
      await first.handle(late, 'joinNote', lateRoom);
      await waitFor(
        () => late.output.some((frame) => frame['kind'] === 'noteJoined'),
        'The viewer reload did not join.',
      );
      assert.equal(
        late.output.find((frame) => frame['kind'] === 'noteJoined')?.['role'],
        'viewer',
      );
      const syncCount = () =>
        owner.output.filter((frame) => frame['kind'] === 'noteSync').length;
      const before = syncCount();
      for (const kind of ['state', 'update'] as const) {
        await first.handle(late, 'sendNoteSync', {
          roomId: lateRoom.roomId,
          payload: Buffer.from(
            encodeNoteSync({ kind, bytes: lateDelta }),
          ).toString('base64'),
        });
      }
      await first.handle(late, 'sendNoteSync', {
        roomId: lateRoom.roomId,
        payload: Buffer.from(
          encodeNoteSync({ kind: 'vector', bytes: vector }),
        ).toString('base64'),
      });
      await waitFor(
        () => late.output.some((frame) => frame['kind'] === 'noteSync'),
        'The viewer could not read from the live room.',
      );
      assert.equal(syncCount(), before);
      const database = await openSession(db.migrationUrl);
      try {
        const bindings = await database.query<{ can_write: boolean }>(
          'select can_write from note_client_bindings where workspace_id = $1 and file_id = $2 and client_id = any($3::bigint[]) order by can_write',
          [workspaceId, fileId, [clientId, id]],
        );
        assert.deepEqual(
          bindings.map((entry) => entry.can_write),
          [false, true],
        );
      } finally {
        await database.close();
      }
    } finally {
      first.remove(late);
      assert.equal(await changeRole('editor'), 'ok');
      await second.recheck(editor);
    }
  });

  await test('viewer writes do not reach peers and removal evicts a remote room', async () => {
    const before = owner.output.length;
    await first.handle(viewer, 'sendNoteSync', {
      roomId: viewerRoom.roomId,
      payload: Buffer.from(update).toString('base64'),
    });
    assert.equal(
      owner.output.slice(before).find((frame) => frame['kind'] === 'noteSync'),
      undefined,
    );
    assert.equal(
      await identity.collaboration(actor, workspaceId, (tx) =>
        tx.changeMember(viewerId, 'editor', false),
      ),
      'ok',
    );
    await first.recheck(viewer);
    assert.ok(
      viewer.output.some(
        (frame) =>
          frame['kind'] === 'noteAccess' && frame['access'] === 'editor',
      ),
    );
    const database = await openSession(db.migrationUrl);
    try {
      const binding = await database.query<{ can_write: boolean }>(
        'select can_write from note_client_bindings where workspace_id = $1 and file_id = $2 and client_id = $3',
        [workspaceId, fileId, viewerRoom.clientId],
      );
      assert.equal(binding[0]?.can_write, true);
    } finally {
      await database.close();
    }
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

  await test('room and connection caps refuse joins beyond their limits', async () => {
    const busy = connection(ownerId, 'Busy owner');
    const other = connection(ownerId, 'Other owner');
    const overflow = connection(ownerId, 'Overflow');
    try {
      for (let i = 0; i < liveBounds.roomsPerConnection; i += 1) {
        await first.handle(busy, 'joinNote', room(100 + i));
      }
      assert.equal(
        busy.output.filter((entry) => entry['kind'] === 'noteJoined').length,
        liveBounds.roomsPerConnection,
      );
      await first.handle(busy, 'joinNote', room(200));
      assert.equal(busy.output.at(-1)?.['reason'], 'capacity');
      const alreadyPresent = 2 + liveBounds.roomsPerConnection;
      for (let i = alreadyPresent; i < liveBounds.connectionsPerRoom; i += 1) {
        await first.handle(other, 'joinNote', room(1000 + i));
      }
      await first.handle(overflow, 'joinNote', room(2000));
      assert.equal(overflow.output.at(-1)?.['reason'], 'capacity');
    } finally {
      first.remove(busy);
      first.remove(other);
      first.remove(overflow);
    }
  });

  await test('a sync payload over the decoded byte limit closes just its room', async () => {
    const tooLarge = connection(ownerId, 'Large frame');
    const id = room(3000);
    await first.handle(tooLarge, 'joinNote', id);
    assert.equal(tooLarge.output.at(-1)?.['kind'], 'noteJoined');
    await first.handle(tooLarge, 'sendNoteSync', {
      roomId: id.roomId,
      payload: Buffer.alloc(liveBounds.syncBytes + 1).toString('base64'),
    });
    assert.equal(tooLarge.output.at(-1)?.['reason'], 'invalid_update');
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
