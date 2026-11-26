/**
 * Unit tests for the history, restore, and purge services.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  verifyActor,
  type Action,
  type Actor,
  type Role,
} from '../identity/actor.ts';
import { contentDigest } from '../files/digest.ts';
import { listHistory, restoreRevision } from './service.ts';
import { previewPurge, purgeFiles } from './purge.ts';
import { maxFilesPerChangeset } from '../files/commit.ts';
import {
  ok,
  type AcceptedChangeset,
  type AcceptedInput,
  type AcceptedRevision,
  type Result,
} from '../files/model.ts';
import type {
  DeletedFilePage,
  DocumentService,
  FilePage,
  FileRecord,
  HistoryPage,
  HistoryRevision,
  MutationReceipt,
  PageRequest,
  PurgePreview,
  PurgedFilesResult,
  RevisionRecord,
  WorkspaceStore,
  WorkspaceTransaction,
} from '../files/ports.ts';

/** A document service over plain text, as the domain tests use it. */
const documentService: DocumentService = {
  start: (text: string) => new TextEncoder().encode(text),
  apply: (_document: Uint8Array, update: Uint8Array) =>
    ok({
      bytes: update,
      text: new TextDecoder().decode(update),
      state: update,
    }),
  editRanges: () => {
    throw new Error('Range edits are not used here.');
  },
  replaceText: (_document: Uint8Array, text: string) =>
    ok({
      bytes: new TextEncoder().encode(text),
      text,
      state: new TextEncoder().encode(text),
    }),
  // No text of these tests holds a task box, so nothing is kept apart.
  keepWrittenCharacter: (_before: Uint8Array, after: Uint8Array) =>
    ok({
      bytes: after,
      text: new TextDecoder().decode(after),
      state: after,
    }),
  observe: (document: Uint8Array) => document,
  stateVector: (document: Uint8Array) => document,
  delta: (document: Uint8Array) => document,
  readText: (document: Uint8Array) => new TextDecoder().decode(document),
  covers: () => ok(true),
};

const workspaceId = 'w0000000-0000-4000-8000-000000000001';
const ownerId = 'a0000000-0000-4000-8000-000000000001';
const writerId = 'a0000000-0000-4000-8000-000000000002';
const strangerId = 'a0000000-0000-4000-8000-000000000003';

function buildActor(accountId: string, role: Role | null): Actor {
  const actions: Action[] =
    role === 'owner' ? ['read', 'history', 'write', 'purge'] : [];
  const built = verifyActor(accountId, [{ workspaceId, actions }]);
  if (!built.ok) throw new Error('Actor creation failed');
  return built.value;
}

class FakeWorkspace {
  readonly roles = new Map<string, Role>();
  readonly files = new Map<string, FileRecord>();
  readonly revisions = new Map<string, RevisionRecord>();
  /** The document of each note, which a restore edits. */
  readonly documents = new Map<string, { bytes: Uint8Array; epoch: number }>();
  readonly receipts = new Map<string, MutationReceipt>();
  readonly purged = new Set<string>();
  readonly history: HistoryRevision[] = [];

  constructor() {
    this.roles.set(ownerId, 'owner');
    this.roles.set(writerId, 'owner');
  }
}

function fakeStore(state: FakeWorkspace): WorkspaceStore {
  const tx: WorkspaceTransaction = {
    search: () => Promise.resolve([]),
    dailyNoteSettings: () => Promise.resolve(null),
    saveDailyNoteSettings: () => Promise.resolve(),
    templateSettings: () => Promise.resolve(null),
    saveTemplateSettings: () => Promise.resolve(),
    backlinks: () => Promise.resolve([]),
    isAcceptedRevision: () => Promise.resolve(false),
    documents: (fileIds: readonly string[]) =>
      Promise.resolve(
        new Map(
          fileIds.flatMap((fileId) => {
            const document = state.documents.get(fileId);
            return document === undefined ? [] : [[fileId, document] as const];
          }),
        ),
      ),
    role: (id: string) => Promise.resolve(state.roles.get(id) ?? null),
    receipt: (mutationId: string, id: string) =>
      Promise.resolve(state.receipts.get(`${id}:${mutationId}`) ?? null),
    heads: (fileIds: readonly string[]) =>
      Promise.resolve(
        new Map(
          fileIds.map((fileId) => [
            fileId,
            state.files.get(fileId)?.headRevisionId ?? null,
          ]),
        ),
      ),
    headStates: (fileIds: readonly string[]) =>
      Promise.resolve(
        new Map(
          fileIds.flatMap((fileId) => {
            const file = state.files.get(fileId);
            if (file === undefined || file.headRevisionId === null) return [];
            return [
              [
                fileId,
                {
                  revisionId: file.headRevisionId,
                  path: file.path,
                  deleted: file.deleted,
                },
              ] as const,
            ];
          }),
        ),
      ),
    revisionPaths: (ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const rev = state.revisions.get(id);
            return rev === undefined ? [] : [[id, rev.path] as const];
          }),
        ),
      ),
    parents: (ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const rev = state.revisions.get(id);
            return rev === undefined ? [] : [[id, rev.fileId]];
          }),
        ),
      ),
    purgedFiles: (fileIds: readonly string[]) =>
      Promise.resolve(fileIds.filter((fileId) => state.purged.has(fileId))),
    listFiles: (_page: PageRequest): Promise<FilePage> =>
      Promise.resolve({
        files: [...state.files.values()].filter((f) => !f.deleted),
        nextCursor: null,
      }),
    listDeletedFiles: (page: PageRequest): Promise<DeletedFilePage> =>
      Promise.resolve({
        files: [...state.files.values()]
          .filter((file) => file.deleted && file.headRevisionId !== null)
          .slice(0, page.limit)
          .map((file) => ({
            fileId: file.fileId,
            path: file.path,
            kind: file.kind,
            headRevisionId: file.headRevisionId ?? '',
            createdAt: file.createdAt,
            deletedAt: file.updatedAt,
          })),
        nextCursor: null,
      }),
    takenPaths: (paths: readonly string[]) =>
      Promise.resolve(
        paths.filter((path) =>
          [...state.files.values()].some(
            (file) => !file.deleted && file.path === path,
          ),
        ),
      ),
    file: (fileId: string) => Promise.resolve(state.files.get(fileId) ?? null),
    snapshotRevisions: () => Promise.resolve(null),
    revision: (revisionId: string) =>
      Promise.resolve(state.revisions.get(revisionId) ?? null),
    accept: (
      writer: Actor,
      input: AcceptedInput,
      _digest: string,
    ): Promise<Result<AcceptedChangeset>> => {
      const acceptedRev = input.revisions.map((r) => {
        state.revisions.set(r.id, {
          revisionId: r.id,
          fileId: r.fileId,
          path: r.path,
          kind: r.content.kind === 'markdown' ? 'note' : 'attachment',
          deleted: r.deleted,
          parents: [...r.parents],
          digest: r.content.digest,
          size: r.content.kind === 'markdown' ? r.content.text.length : 100,
          text: r.content.kind === 'markdown' ? r.content.text : null,
          objectId: r.content.kind === 'attachment' ? r.content.objectId : null,
          message: r.message,
          restoredFrom: r.restoredFrom,
          clientTime: r.clientTime,
          serverTime: new Date().toISOString(),
          document:
            input.documents.find((document) => document.fileId === r.fileId)
              ?.bytes ?? null,
          epoch:
            input.documents.find((document) => document.fileId === r.fileId)
              ?.epoch ?? null,
          merged: input.documents.some(
            (document) => document.fileId === r.fileId && document.merged,
          ),
        });
        state.files.set(r.fileId, {
          fileId: r.fileId,
          path: r.path,
          kind: r.content.kind === 'markdown' ? 'note' : 'attachment',
          headRevisionId: r.id,
          deleted: r.deleted,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        const accepted: AcceptedRevision = {
          revisionId: r.id,
          fileId: r.fileId,
          parents: [...r.parents],
          path: r.path,
          deleted: r.deleted,
          digest: r.content.digest,
          size: r.content.kind === 'markdown' ? r.content.text.length : 100,
          actorAccountId: writer.accountId,
          serverTime: new Date().toISOString(),
          message: r.message,
          epoch:
            input.documents.find((document) => document.fileId === r.fileId)
              ?.epoch ?? null,
          acceptedState:
            input.documents.find((document) => document.fileId === r.fileId)
              ?.state ?? null,
          merged: input.documents.some(
            (document) => document.fileId === r.fileId && document.merged,
          ),
        };
        return accepted;
      });
      return Promise.resolve(
        ok({
          mutationId: input.mutationId,
          revisionIds: acceptedRev.map((r) => r.revisionId),
          cursor: '1',
          revisions: acceptedRev,
          superseded: [],
        }),
      );
    },
    onFilesDeleted: (_fileIds: readonly string[]) => Promise.resolve(),
    listHistory: (fileId: string, _page: PageRequest): Promise<HistoryPage> =>
      Promise.resolve({
        revisions: state.history.filter((h) => h.fileId === fileId),
        nextCursor: null,
      }),
    previewPurge: (fileIds: readonly string[]): Promise<Result<PurgePreview>> =>
      Promise.resolve(
        ok({
          fileIds: [...fileIds],
          revisionIds: [],
          contentDigests: [],
          attachmentObjectIds: [],
          blockingReferences: [],
          dependentRevisionCount: 0,
          reclaimableBytes: fileIds.length * 512,
          canPurge: true,
        }),
      ),
    purgeFiles: (
      _actor: Actor,
      mutationId: string,
      fileIds: readonly string[],
      _digest: string,
    ): Promise<Result<PurgedFilesResult>> => {
      for (const fileId of fileIds) {
        state.files.delete(fileId);
        state.purged.add(fileId);
      }
      return Promise.resolve(
        ok({
          mutationId,
          purgedFileIds: [...fileIds],
          purgedRevisionIds: [],
          reclaimedBytes: fileIds.length * 512,
        }),
      );
    },
    startSnapshot: () => Promise.reject(new Error('no snapshot in this test')),
    snapshotPage: () => Promise.resolve(null),
    syncChanges: () =>
      Promise.resolve({ changes: [], highWater: '0', oldestRetained: null }),
  };

  return {
    documents: documentService,
    transact: <T>(
      _actor: Actor,
      _wsId: string,
      fn: (t: WorkspaceTransaction) => Promise<T>,
    ) => fn(tx),
  };
}

await test('listHistory: rejects stranger or non-member', async () => {
  const state = new FakeWorkspace();
  const store = fakeStore(state);
  const stranger = buildActor(strangerId, null);

  const res = await listHistory(store, stranger, workspaceId, 'f1');
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'forbidden');
});

await test('listHistory: rejects purged file with purged error', async () => {
  const state = new FakeWorkspace();
  state.purged.add('f1');
  const store = fakeStore(state);
  const user = buildActor(ownerId, 'owner');

  const res = await listHistory(store, user, workspaceId, 'f1');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'purged');
    assert.deepEqual(res.error.fileIds, ['f1']);
  }
});

await test('listHistory: returns history page for existing file', async () => {
  const state = new FakeWorkspace();
  state.files.set('f1', {
    fileId: 'f1',
    path: 'note.md',
    kind: 'note',
    headRevisionId: 'r1',
    deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  state.history.push({
    revisionId: 'r1',
    fileId: 'f1',
    path: 'note.md',
    deleted: false,
    parents: [],
    digest: 'abc',
    size: 10,
    actorAccountId: ownerId,
    clientTime: new Date().toISOString(),
    serverTime: new Date().toISOString(),
    message: 'Initial',
    isCheckpoint: true,
    checkpointName: 'Initial',
    restoredFrom: null,
    text: 'content',
    objectId: null,
    merged: false,
  });
  const store = fakeStore(state);
  const user = buildActor(ownerId, 'owner');

  const res = await listHistory(store, user, workspaceId, 'f1');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.revisions.length, 1);
    assert.equal(res.value.revisions[0]?.isCheckpoint, true);
    assert.equal(res.value.revisions[0]?.checkpointName, 'Initial');
  }
});

await test('restoreRevision: creates child revision referencing historic revision without rewriting history', async () => {
  const state = new FakeWorkspace();
  const text0 = 'version zero';
  const digest0 = await contentDigest(text0);

  state.files.set('f1', {
    fileId: 'f1',
    path: 'note.md',
    kind: 'note',
    headRevisionId: 'r2',
    deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  state.revisions.set('r0', {
    revisionId: 'r0',
    fileId: 'f1',
    path: 'old-path.md',
    kind: 'note',
    deleted: false,
    parents: [],
    digest: digest0,
    size: text0.length,
    text: text0,
    objectId: null,
    message: 'Initial',
    restoredFrom: null,
    clientTime: new Date().toISOString(),
    serverTime: new Date().toISOString(),
    epoch: 1,
    merged: false,
    document: null,
  });
  state.revisions.set('r2', {
    revisionId: 'r2',
    fileId: 'f1',
    path: 'note.md',
    kind: 'note',
    deleted: false,
    parents: ['r1'],
    digest: 'xyz',
    size: 3,
    text: 'bad',
    objectId: null,
    message: 'Current',
    restoredFrom: null,
    clientTime: new Date().toISOString(),
    serverTime: new Date().toISOString(),
    epoch: 1,
    merged: false,
    document: null,
  });

  const store = fakeStore(state);
  const user = buildActor(writerId, 'owner');

  const res = await restoreRevision(
    store,
    user,
    {
      workspaceId,
      fileId: 'f1',
      targetRevisionId: 'r0',
      expectedHead: 'r2',
      revisionId: 'r3',
      ids: {
        mutationId: 'm-restore',
        deviceId: 'd1',
        clientTime: new Date().toISOString(),
      },
    },
    'req-restore',
  );

  assert.equal(res.ok, true);
  const restoredRev = state.revisions.get('r3');
  assert.ok(restoredRev);
  assert.equal(restoredRev.restoredFrom, 'r0');
  assert.equal(restoredRev.digest, digest0);
  assert.deepEqual(restoredRev.parents, ['r2']);
  assert.equal(state.files.get('f1')?.headRevisionId, 'r3');
});

await test('purge: rejects an account that is not a member', async () => {
  const state = new FakeWorkspace();
  const store = fakeStore(state);
  const stranger = buildActor(strangerId, null);

  const previewRes = await previewPurge(store, stranger, workspaceId, ['f1']);
  assert.equal(previewRes.ok, false);
  if (!previewRes.ok) assert.equal(previewRes.error.code, 'forbidden');

  const purgeRes = await purgeFiles(
    store,
    stranger,
    workspaceId,
    ['f1'],
    'm-p',
    'req-p',
  );
  assert.equal(purgeRes.ok, false);
  if (!purgeRes.ok) assert.equal(purgeRes.error.code, 'forbidden');
});

await test('purge: owner can purge files successfully and writes purge markers', async () => {
  const state = new FakeWorkspace();
  state.files.set('f1', {
    fileId: 'f1',
    path: '/note.md',
    kind: 'note',
    headRevisionId: 'r1',
    deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const store = fakeStore(state);
  const owner = buildActor(ownerId, 'owner');

  const purgeRes = await purgeFiles(
    store,
    owner,
    workspaceId,
    ['f1'],
    'm-purge',
    'req-purge',
  );
  assert.equal(purgeRes.ok, true);
  if (purgeRes.ok) {
    assert.deepEqual(purgeRes.value.purgedFileIds, ['f1']);
  }
  assert.equal(state.files.has('f1'), false);
  assert.equal(state.purged.has('f1'), true);
});

await test('purge: refuses more files than one commit may hold', async () => {
  const state = new FakeWorkspace();
  const store = fakeStore(state);
  const owner = buildActor(ownerId, 'owner');
  const fileIds = Array.from(
    { length: maxFilesPerChangeset + 1 },
    (_, index) => `f${String(index)}`,
  );

  const refused = await purgeFiles(
    store,
    owner,
    workspaceId,
    fileIds,
    'm-too-many',
    'req-too-many',
  );
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error.code, 'too_many_files');

  const accepted = await purgeFiles(
    store,
    owner,
    workspaceId,
    fileIds.slice(0, maxFilesPerChangeset),
    'm-at-limit',
    'req-at-limit',
  );
  assert.equal(accepted.ok, true);
});
