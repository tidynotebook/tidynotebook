/**
 * The rules of `commitChangeset`, against an in-memory workspace.
 *
 * The fake store below keeps the parts of accepted state that the use case
 * reads and writes. It performs no permission check and no path uniqueness
 * check of its own, so every outcome here comes from the use case. The
 * PostgreSQL rules that only storage can enforce are covered by the storage
 * integration tests instead.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyActor, type Actor, type Role } from '../identity/actor.ts';
import { commitChangeset, maxFilesPerChangeset } from './commit.ts';
import { contentDigest } from './digest.ts';
import type {
  AcceptedChangeset,
  AcceptedInput,
  ChangesetInput,
  ContentRef,
  DomainErrorCode,
  Result,
  RevisionInput,
  SupersededHead,
} from './model.ts';
import { fail, ok } from './model.ts';
import type {
  AppliedDocument,
  DeletedFilePage,
  DocumentService,
  FilePage,
  FileRecord,
  MutationReceipt,
  PageRequest,
  RevisionRecord,
  WorkspaceStore,
  WorkspaceTransaction,
} from './ports.ts';

const workspaceId = 'w0000000-0000-4000-8000-000000000001';
const accountId = 'a0000000-0000-4000-8000-000000000001';

/** A verified actor with the given actions in the test workspace. */
function actorWith(actions: readonly ('read' | 'write')[]): Actor {
  const built = verifyActor(accountId, [{ workspaceId, actions }]);
  if (!built.ok) throw new Error('the test actor was rejected');
  return built.value;
}

/** One stored revision of the fake workspace. */
type StoredRevision = RevisionRecord;

/** The accepted state that the use case reads. */
class FakeWorkspace {
  readonly roles = new Map<string, Role>();
  readonly files = new Map<string, FileRecord>();
  readonly revisions = new Map<string, StoredRevision>();
  readonly receipts = new Map<string, MutationReceipt>();
  readonly purged = new Set<string>();
  /** Every call of `onFilesDeleted`, so a test can prove that it ran. */
  readonly deletions: string[][] = [];
  /** Every changeset that reached `accept`. */
  readonly accepted: AcceptedInput[] = [];
  /** The document of each note, as the fake service encodes it. */
  readonly documents = new Map<string, { bytes: Uint8Array; epoch: number }>();
  cursor = 0;
  /** A domain failure that the next `accept` returns instead of writing. */
  refuse: Result<AcceptedChangeset> | null = null;
}

/** Builds the store port over one fake workspace. */
function fakeStore(state: FakeWorkspace): WorkspaceStore {
  const transaction: WorkspaceTransaction = {
    search: () => Promise.resolve([]),
    dailyNoteSettings: () => Promise.resolve(null),
    saveDailyNoteSettings: () => Promise.resolve(),
    templateSettings: () => Promise.resolve(null),
    saveTemplateSettings: () => Promise.resolve(),
    backlinks: () => Promise.resolve([]),
    isAcceptedRevision: () => Promise.resolve(false),
    role: (id: string) => Promise.resolve(state.roles.get(id) ?? null),
    receipt: (mutationId: string, id: string) =>
      Promise.resolve(state.receipts.get(`${id}:${mutationId}`) ?? null),
    documents: (fileIds: readonly string[]) =>
      Promise.resolve(
        new Map(
          fileIds.flatMap((fileId) => {
            const document = state.documents.get(fileId);
            return document === undefined ? [] : [[fileId, document] as const];
          }),
        ),
      ),
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
            const revision = state.revisions.get(id);
            return revision === undefined ? [] : [[id, revision.path] as const];
          }),
        ),
      ),
    parents: (ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const revision = state.revisions.get(id);
            return revision === undefined ? [] : [[id, revision.fileId]];
          }),
        ),
      ),
    purgedFiles: (fileIds: readonly string[]) =>
      Promise.resolve(fileIds.filter((fileId) => state.purged.has(fileId))),
    listFiles: (page: PageRequest): Promise<FilePage> =>
      Promise.resolve({
        files: [...state.files.values()]
          .filter((file) => !file.deleted)
          .slice(0, page.limit),
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
      digest: string,
      superseded: readonly SupersededHead[] = [],
    ): Promise<Result<AcceptedChangeset>> => {
      if (state.refuse !== null) return Promise.resolve(state.refuse);
      state.accepted.push(input);
      state.cursor += 1;
      // The documents of the changeset commit with its revisions, so a later
      // save in the same test reads what this one accepted.
      for (const document of input.documents)
        state.documents.set(document.fileId, {
          bytes: document.bytes,
          epoch: document.epoch,
        });
      for (const revision of input.revisions) {
        state.revisions.set(revision.id, {
          revisionId: revision.id,
          fileId: revision.fileId,
          path: revision.path,
          kind: revision.content.kind === 'markdown' ? 'note' : 'attachment',
          deleted: revision.deleted,
          parents: [...revision.parents],
          digest: revision.content.digest,
          size:
            revision.content.kind === 'markdown'
              ? revision.content.text.length
              : 0,
          text:
            revision.content.kind === 'markdown' ? revision.content.text : null,
          objectId:
            revision.content.kind === 'attachment'
              ? revision.content.objectId
              : null,
          message: revision.message,
          restoredFrom: revision.restoredFrom,
          clientTime: revision.clientTime,
          serverTime: '2026-09-06T10:00:00.000Z',
          document:
            input.documents.find(
              (document) => document.fileId === revision.fileId,
            )?.bytes ?? null,
          epoch:
            input.documents.find(
              (document) => document.fileId === revision.fileId,
            )?.epoch ?? null,
          merged: input.documents.some(
            (document) =>
              document.fileId === revision.fileId && document.merged,
          ),
        });
        state.files.set(revision.fileId, {
          fileId: revision.fileId,
          path: revision.path,
          kind: revision.content.kind === 'markdown' ? 'note' : 'attachment',
          headRevisionId: revision.id,
          deleted: revision.deleted,
          createdAt: '2026-09-06T10:00:00.000Z',
          updatedAt: '2026-09-06T10:00:00.000Z',
        });
      }
      const outcome: AcceptedChangeset = {
        mutationId: input.mutationId,
        revisionIds: input.revisions.map((revision) => revision.id),
        cursor: String(state.cursor),
        revisions: input.revisions.map((revision) => ({
          revisionId: revision.id,
          fileId: revision.fileId,
          parents: [...revision.parents],
          path: revision.path,
          deleted: revision.deleted,
          digest: revision.content.digest,
          size:
            revision.content.kind === 'markdown'
              ? revision.content.text.length
              : 0,
          actorAccountId: writer.accountId,
          serverTime: '2026-09-06T10:00:00.000Z',
          message: revision.message,
          epoch:
            input.documents.find(
              (document) => document.fileId === revision.fileId,
            )?.epoch ?? null,
          acceptedState:
            input.documents.find(
              (document) => document.fileId === revision.fileId,
            )?.state ?? null,
          merged: input.documents.some(
            (document) =>
              document.fileId === revision.fileId && document.merged,
          ),
        })),
        superseded: superseded.map((entry) => ({ ...entry })),
      };
      state.receipts.set(`${writer.accountId}:${input.mutationId}`, {
        digest,
        outcome,
      });
      return Promise.resolve(ok(outcome));
    },
    onFilesDeleted: (fileIds: readonly string[]) => {
      state.deletions.push([...fileIds]);
      return Promise.resolve();
    },
    listHistory: () => Promise.resolve({ revisions: [], nextCursor: null }),
    previewPurge: () =>
      Promise.resolve(
        ok({
          fileIds: [],
          revisionIds: [],
          contentDigests: [],
          attachmentObjectIds: [],
          blockingReferences: [],
          dependentRevisionCount: 0,
          reclaimableBytes: 0,
          canPurge: true,
        }),
      ),
    purgeFiles: () =>
      Promise.resolve(
        ok({
          mutationId: '',
          purgedFileIds: [],
          purgedRevisionIds: [],
          reclaimedBytes: 0,
        }),
      ),
    startSnapshot: () => Promise.reject(new Error('no snapshot in this test')),
    snapshotPage: () => Promise.resolve(null),
    syncChanges: () =>
      Promise.resolve({ changes: [], highWater: '0', oldestRetained: null }),
  };
  return {
    documents: documentService,
    transact: <T>(
      _actor: Actor,
      _workspaceId: string,
      run: (tx: WorkspaceTransaction) => Promise<T>,
    ): Promise<T> => run(transaction),
  };
}

/** A commit reads all head state once while it holds the workspace lock. */
function singleHeadReadStore(
  store: WorkspaceStore,
  reads: string[][],
): WorkspaceStore {
  return {
    ...store,
    transact: (writer, scope, run, options) =>
      store.transact(
        writer,
        scope,
        (tx) => {
          let read = false;
          return run({
            ...tx,
            headStates: (fileIds) => {
              assert.equal(
                read,
                false,
                'a commit repeats its locked head read',
              );
              read = true;
              reads.push([...fileIds]);
              return tx.headStates(fileIds);
            },
          });
        },
        options,
      ),
  };
}

/** A workspace whose single member holds the given role. */
function workspaceWith(role: Role): FakeWorkspace {
  const state = new FakeWorkspace();
  state.roles.set(accountId, role);
  return state;
}

let counter = 0;

/** A distinct identifier for a test record. */
function id(prefix: string): string {
  counter += 1;
  return `${prefix}0000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

/**
 * The bytes of one text, as the fake document service encodes a document.
 *
 * The encoding keeps every code unit, including a lone surrogate, so a test
 * can prove that the workspace refuses text that is not well formed.
 */
const bytesOf = (text: string): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(text));

/** The text of one encoded document. */
function textOf(bytes: Uint8Array): string {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return typeof value === 'string' ? value : '';
}

/**
 * The text work of one save.
 *
 * The fake document service below holds a document as the bytes of its text,
 * and an update as the whole text that the save produces. `seen` is the text
 * that the device had when it saved, so a test states unseen work by giving a
 * `seen` that differs from the stored text.
 */
function content(text: string, seen = text, epoch = 1): ContentRef {
  return {
    kind: 'markdown',
    document: {
      work: { kind: 'update', update: bytesOf(text) },
      epoch,
      observed: bytesOf(seen),
    },
  };
}

/** A save that carries no text work, which is how a deletion states its state. */
function seenOnly(seen: string, epoch = 1): ContentRef {
  return {
    kind: 'markdown',
    document: { work: { kind: 'none' }, epoch, observed: bytesOf(seen) },
  };
}

/**
 * A document service over plain text.
 *
 * It keeps the shape of the real one: an update applies to a document, the
 * observed state of a document is its own bytes, and coverage is whether the
 * device had seen exactly the stored document. The real merge behaviour is
 * proved in `packages/note-document` and in the integration suite.
 */
let documentRefusal: DomainErrorCode | null = null;

const documentService: DocumentService = {
  start: (text: string) => bytesOf(text),
  apply: (_document: Uint8Array, update: Uint8Array) => {
    if (documentRefusal !== null) return fail(documentRefusal);
    const text = textOf(update);
    const applied: AppliedDocument = {
      bytes: update,
      text,
      state: update,
    };
    return ok(applied);
  },
  editRanges: () => {
    throw new Error('Range edits are not used here.');
  },
  replaceText: (_document: Uint8Array, text: string) =>
    ok({ bytes: bytesOf(text), text, state: bytesOf(text) }),
  // No text of these tests holds a task box, so nothing is kept apart.
  keepWrittenCharacter: (_before: Uint8Array, after: Uint8Array) =>
    ok({ bytes: after, text: textOf(after), state: after }),
  observe: (document: Uint8Array) => document,
  stateVector: (document: Uint8Array) => document,
  delta: (document: Uint8Array) => document,
  readText: (document: Uint8Array) => textOf(document),
  covers: (observed: Uint8Array, document: Uint8Array) =>
    ok(
      observed.byteLength === document.byteLength &&
        observed.every((value, index) => value === document[index]),
    ),
};

/** One revision with test defaults. */
async function revision(
  seed: Partial<RevisionInput> & { fileId: string; path: string },
): Promise<RevisionInput> {
  return {
    id: seed.id ?? id('r'),
    fileId: seed.fileId,
    parents: seed.parents ?? [],
    path: seed.path,
    deleted: seed.deleted ?? false,
    content: seed.content ?? content(`# ${seed.path}\n`),
    clientTime: seed.clientTime ?? '2026-09-06T10:00:00.000Z',
    message: seed.message ?? null,
    restoredFrom: seed.restoredFrom ?? null,
  };
}

/** One changeset with test defaults. */
function changeset(
  revisions: readonly RevisionInput[],
  overrides: Partial<ChangesetInput> = {},
): ChangesetInput {
  return {
    workspaceId,
    mutationId: overrides.mutationId ?? id('m'),
    deviceId: overrides.deviceId ?? 'device-1',
    expectedHeads:
      overrides.expectedHeads ??
      Object.fromEntries(revisions.map((entry) => [entry.fileId, null])),
    revisions,
  };
}

/** The accepted outcome, or a clear failure. */
function accepted(result: Result<AcceptedChangeset>): AcceptedChangeset {
  if (!result.ok)
    assert.fail(`the changeset was rejected: ${result.error.code}`);
  return result.value;
}

/** The domain failure, or a clear failure. */
function rejected(result: Result<AcceptedChangeset>): {
  code: string;
  fileIds: readonly string[];
} {
  if (result.ok) assert.fail('the changeset was accepted');
  return result.error;
}

await test('an editor creates a file and the head advances', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const first = await revision({ fileId: id('f'), path: 'notes/one.md' });
  const outcome = accepted(
    await commitChangeset(store, actor, changeset([first]), 'digest-1'),
  );
  assert.deepEqual(outcome.revisionIds, [first.id]);
  assert.equal(state.files.get(first.fileId)?.headRevisionId, first.id);
  assert.equal(state.deletions.length, 0);
});

await test('a replay with the same digest returns the stored outcome after the head moved', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  const input = changeset([first]);
  const outcome = accepted(
    await commitChangeset(store, actor, input, 'digest-1'),
  );

  // Another device advances the head before the retry arrives.
  const second = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([second], { expectedHeads: { [fileId]: first.id } }),
      'digest-2',
    ),
  );

  const replay = accepted(
    await commitChangeset(store, actor, input, 'digest-1'),
  );
  assert.deepEqual(replay, outcome);
  // The replay wrote nothing: the head still names the newer revision.
  assert.equal(state.files.get(fileId)?.headRevisionId, second.id);
  assert.equal(state.accepted.length, 2);
});

await test('the same mutation identity with another body is refused', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const input = changeset([await revision({ fileId, path: 'notes/one.md' })]);
  accepted(await commitChangeset(store, actor, input, 'digest-1'));
  const changed = {
    ...input,
    revisions: [await revision({ fileId, path: 'notes/other.md' })],
  };
  const failure = rejected(
    await commitChangeset(store, actor, changed, 'digest-other'),
  );
  assert.equal(failure.code, 'mutation_reused');
  assert.deepEqual(failure.fileIds, [fileId]);
  assert.equal(state.accepted.length, 1);
});

await test('a stale save is rebased onto the current head', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const second = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([second], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );
  const stale = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
  });
  const result = accepted(
    await commitChangeset(
      store,
      actor,
      changeset([stale], { expectedHeads: { [fileId]: first.id } }),
      'd-3',
    ),
  );
  assert.deepEqual(result.revisions[0]?.parents, [second.id]);
  assert.deepEqual(state.revisions.get(stale.id)?.parents, [second.id]);
  assert.equal(state.files.get(fileId)?.headRevisionId, stale.id);
  // The later save still wins, and the answer says which head it passed, so
  // the client can tell the person where the other text went.
  assert.deepEqual(result.superseded, [
    {
      fileId,
      previousHeadRevisionId: second.id,
      acceptedRevisionId: stale.id,
    },
  ]);
});

await test('a save on the current head reports no superseded head', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  const result = accepted(
    await commitChangeset(store, actor, changeset([first]), 'd-1'),
  );
  assert.deepEqual(result.superseded, []);
});

await test('strict preconditions accept current heads and keep receipt replay', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/strict.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const next = await revision({
    fileId,
    path: first.path,
    parents: [first.id],
  });
  const input = changeset([next], { expectedHeads: { [fileId]: first.id } });
  const outcome = accepted(
    await commitChangeset(store, actor, input, 'd-2', 'strict'),
  );
  assert.deepEqual(outcome.superseded, []);
  assert.deepEqual(outcome.revisions[0]?.parents, [first.id]);
  // The head now differs from the precondition, but this mutation is a replay.
  assert.deepEqual(
    accepted(await commitChangeset(store, actor, input, 'd-2', 'strict')),
    outcome,
  );
  assert.equal(state.accepted.length, 2);
  assert.equal(
    rejected(await commitChangeset(store, actor, input, 'other', 'strict'))
      .code,
    'mutation_reused',
  );
});

await test('strict preconditions refuse a moved head before document work or any write', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const left = await revision({ fileId: id('f'), path: 'notes/left.md' });
  const right = await revision({ fileId: id('f'), path: 'notes/right.md' });
  accepted(
    await commitChangeset(store, actor, changeset([left, right]), 'd-1'),
  );
  const current = await revision({
    fileId: right.fileId,
    path: right.path,
    parents: [right.id],
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([current], { expectedHeads: { [right.fileId]: right.id } }),
      'd-2',
    ),
  );
  const revisions = [
    await revision({
      fileId: left.fileId,
      path: left.path,
      parents: [left.id],
    }),
    await revision({
      fileId: right.fileId,
      path: right.path,
      parents: [right.id],
    }),
  ];
  const input = changeset(revisions, {
    expectedHeads: { [left.fileId]: left.id, [right.fileId]: right.id },
  });
  const before = structuredClone(state);
  let documentReads = 0;
  const guarded: WorkspaceStore = {
    ...store,
    transact: (writer, scope, run, options) =>
      store.transact(
        writer,
        scope,
        (tx) =>
          run({
            ...tx,
            documents: (fileIds) => {
              documentReads += 1;
              return tx.documents(fileIds);
            },
          }),
        options,
      ),
  };
  const failure = rejected(
    await commitChangeset(guarded, actor, input, 'd-3', 'strict'),
  );
  assert.deepEqual(failure, { code: 'stale_head', fileIds: [right.fileId] });
  assert.equal(documentReads, 0);
  assert.deepEqual(structuredClone(state), before);
});

await test('text work brings a note back from Trash', async () => {
  // Record 0083. The edit is the later write, and the tombstone kept the
  // document behind it, so the work applies and the note returns.
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const startText = '# notes/one.md\n';
  const tombstone = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    deleted: true,
    content: seenOnly(startText),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([tombstone], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );

  // The other device still holds the note and saves text it typed before the
  // deletion reached it.
  const stale = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    content: content('# typed offline\n', startText),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([stale], { expectedHeads: { [fileId]: first.id } }),
      'd-3',
    ),
  );
  assert.equal(state.files.get(fileId)?.headRevisionId, stale.id);
  assert.equal(state.files.get(fileId)?.deleted, false);
  assert.equal(state.revisions.get(stale.id)?.text, '# typed offline\n');
});

await test('a save with no text work leaves a note in Trash', async () => {
  // A rename carries no text work, so it is not the edit that record 0083
  // brings back. The note stays where the person put it.
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const startText = '# notes/one.md\n';
  const tombstone = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    deleted: true,
    content: seenOnly(startText),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([tombstone], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );
  const renamed = await revision({
    fileId,
    path: 'notes/renamed.md',
    parents: [first.id],
    content: seenOnly(startText),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([renamed], { expectedHeads: { [fileId]: first.id } }),
      'd-3',
    ),
  );
  assert.equal(state.files.get(fileId)?.deleted, true);
});

await test('a duplicate of accepted work never leaves Trash', async () => {
  // The update repeats work that the document already holds, so it adds
  // nothing and the note stays in Trash (record 0083).
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const startText = '# notes/one.md\n';
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const tombstone = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    deleted: true,
    content: seenOnly(startText),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([tombstone], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );
  const repeat = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    content: content(startText, startText),
  });
  const reads: string[][] = [];
  accepted(
    await commitChangeset(
      singleHeadReadStore(store, reads),
      actor,
      changeset([repeat], { expectedHeads: { [fileId]: first.id } }),
      'd-3',
    ),
  );
  assert.deepEqual(reads, [[fileId]]);
  assert.equal(state.files.get(fileId)?.deleted, true);
});

await test('a delete that would hide unseen text is refused', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const startText = '# notes/one.md\n';
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const newer = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    content: content('# text that must survive\n', startText),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([newer], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );

  // The delete states the state of the first revision, so it never saw the
  // newer text. Accepting it would remove text that the person never read.
  const staleDelete = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    deleted: true,
    content: seenOnly(startText),
  });
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([staleDelete], { expectedHeads: { [fileId]: first.id } }),
      'd-3',
    ),
  );
  assert.equal(failure.code, 'unseen_work');
  assert.deepEqual(failure.fileIds, [fileId]);
  assert.equal(state.files.get(fileId)?.headRevisionId, newer.id);
  assert.equal(state.files.get(fileId)?.deleted, false);
  assert.equal(state.deletions.length, 0);
});

await test('a delete of text the device has seen is accepted', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const tombstone = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    deleted: true,
    content: seenOnly('# notes/one.md\n'),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([tombstone], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );
  assert.equal(state.files.get(fileId)?.deleted, true);
  assert.deepEqual(state.deletions, [[fileId]]);
});

await test('a stale save after a rename elsewhere keeps the new name', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const renamed = await revision({
    fileId,
    path: 'notes/renamed.md',
    parents: [first.id],
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([renamed], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );

  // The other device saves text under the name it read. The path is content,
  // so keeping the submitted path would undo the rename.
  const stale = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    content: content('# later text\n'),
  });
  const reads: string[][] = [];
  const result = accepted(
    await commitChangeset(
      singleHeadReadStore(store, reads),
      actor,
      changeset([stale], { expectedHeads: { [fileId]: first.id } }),
      'd-3',
    ),
  );
  assert.deepEqual(reads, [[fileId]]);
  assert.equal(result.revisions[0]?.path, 'notes/renamed.md');
  assert.equal(state.files.get(fileId)?.path, 'notes/renamed.md');
  assert.equal(state.revisions.get(stale.id)?.path, 'notes/renamed.md');
});

await test('one locked head read serves all files and revisions of a changeset', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const first = await revision({
    fileId: id('f'),
    path: 'notes/first.md',
    content: content('first body'),
  });
  const second = await revision({
    fileId: id('f'),
    path: 'notes/second.md',
    content: content('second body'),
  });
  accepted(
    await commitChangeset(store, actor, changeset([first, second]), 'seed'),
  );
  const one = await revision({
    fileId: first.fileId,
    path: first.path,
    parents: [first.id],
    content: content('first edit', 'first body'),
  });
  const next = await revision({
    fileId: first.fileId,
    path: first.path,
    parents: [one.id],
    content: content('next edit', 'first edit'),
  });
  const two = await revision({
    fileId: second.fileId,
    path: second.path,
    parents: [second.id],
    content: content('second edit', 'second body'),
  });
  const created = await revision({
    fileId: id('f'),
    path: 'notes/created.md',
    content: content('new body'),
  });
  const reads: string[][] = [];
  const outcome = accepted(
    await commitChangeset(
      singleHeadReadStore(store, reads),
      actor,
      changeset([two, one, next, created], {
        expectedHeads: {
          [first.fileId]: first.id,
          [second.fileId]: second.id,
          [created.fileId]: null,
        },
      }),
      'all-files',
    ),
  );
  assert.deepEqual(reads, [
    [first.fileId, second.fileId, created.fileId].sort(),
  ]);
  assert.deepEqual(outcome.revisionIds, [two.id, one.id, next.id, created.id]);
  assert.equal(state.files.get(first.fileId)?.headRevisionId, next.id);
  assert.equal(state.files.get(second.fileId)?.headRevisionId, two.id);
  assert.equal(state.files.get(created.fileId)?.headRevisionId, created.id);
  assert.equal(state.revisions.get(next.id)?.text, 'next edit');
  assert.equal(state.revisions.get(two.id)?.text, 'second edit');
  assert.equal(state.revisions.get(created.id)?.text, 'new body');
  assert.deepEqual(state.revisions.get(next.id)?.parents, [one.id]);
});

await test('a stale save that renames the file wins its own rename', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const elsewhere = await revision({
    fileId,
    path: 'notes/from-other-device.md',
    parents: [first.id],
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([elsewhere], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );

  // This save renamed the note itself: its path differs from the path of the
  // head it saw, so the rename of this save is the newer decision.
  const staleRename = await revision({
    fileId,
    path: 'notes/chosen-here.md',
    parents: [first.id],
  });
  const result = accepted(
    await commitChangeset(
      store,
      actor,
      changeset([staleRename], { expectedHeads: { [fileId]: first.id } }),
      'd-3',
    ),
  );
  assert.equal(result.revisions[0]?.path, 'notes/chosen-here.md');
  assert.equal(state.files.get(fileId)?.path, 'notes/chosen-here.md');
});

await test('a duplicate create is not rebased into an update', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));

  const duplicate = await revision({ fileId, path: 'notes/two.md' });
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([duplicate], { expectedHeads: { [fileId]: null } }),
      'd-2',
    ),
  );
  assert.equal(failure.code, 'stale_head');
  assert.deepEqual(failure.fileIds, [fileId]);
  assert.equal(state.files.get(fileId)?.headRevisionId, first.id);
  assert.equal(state.accepted.length, 1);
});

await test('a changeset without a precondition for a changed file is refused', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const first = await revision({ fileId: id('f'), path: 'notes/one.md' });
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([first], { expectedHeads: {} }),
      'd-1',
    ),
  );
  assert.equal(failure.code, 'invalid_graph');
  assert.deepEqual(failure.fileIds, [first.fileId]);
});

await test('a precondition for a file that the changeset does not change is refused', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const first = await revision({ fileId: id('f'), path: 'notes/one.md' });
  const other = id('f');
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([first], {
        expectedHeads: { [first.fileId]: null, [other]: null },
      }),
      'd-1',
    ),
  );
  assert.equal(failure.code, 'invalid_graph');
  assert.deepEqual(failure.fileIds, [other]);
});

await test('a purged file identifier can never be written again', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  state.purged.add(fileId);
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([await revision({ fileId, path: 'notes/gone.md' })]),
      'd-1',
    ),
  );
  assert.equal(failure.code, 'purged');
  assert.deepEqual(failure.fileIds, [fileId]);
  assert.equal(state.accepted.length, 0);
});

await test('an account without a membership is refused', async () => {
  const state = new FakeWorkspace();
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([await revision({ fileId: id('f'), path: 'notes/one.md' })]),
      'd-1',
    ),
  );
  assert.equal(failure.code, 'forbidden');
  assert.deepEqual(failure.fileIds, []);
});

await test('a narrow grant cannot widen the role', async () => {
  // The role permits the write, but the verified grant of the request does
  // not, so the intersection of the two refuses it.
  const owner = workspaceWith('owner');
  const narrow = rejected(
    await commitChangeset(
      fakeStore(owner),
      actorWith(['read']),
      changeset([await revision({ fileId: id('f'), path: 'notes/one.md' })]),
      'd-1',
    ),
  );
  assert.equal(narrow.code, 'forbidden');
  assert.equal(owner.accepted.length, 0);
});

await test('the accepted text and its digest come from the document', async () => {
  // A save carries work, not text, so a client can no longer state a digest
  // that names other bytes. The workspace derives both (record 0081).
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const written = await revision({
    fileId,
    path: 'notes/one.md',
    content: content('# one\n'),
  });
  const result = accepted(
    await commitChangeset(store, actor, changeset([written]), 'd-1'),
  );
  assert.equal(state.revisions.get(written.id)?.text, '# one\n');
  assert.equal(result.revisions[0]?.digest, await contentDigest('# one\n'));
});

await test('markdown that is not well formed is refused', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  // A lone surrogate becomes U+FFFD in UTF-8, so the stored bytes would differ
  // from the submitted string and the digest could never match again.
  const broken = '# \ud800\n';
  const fileId = id('f');
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([
        await revision({
          fileId,
          path: 'notes/broken.md',
          content: content(broken),
        }),
      ]),
      'd-1',
    ),
  );
  assert.equal(failure.code, 'invalid_content');
  assert.deepEqual(failure.fileIds, [fileId]);
  assert.equal(state.accepted.length, 0);
});

await test('a tombstone stores no text, whatever it carries', async () => {
  // The document of the note keeps the text, and History keeps the revision
  // before the tombstone. The tombstone itself adds no bytes, which is what
  // the quota reserve of a deletion depends on.
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const tombstone = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    deleted: true,
    content: seenOnly('# notes/one.md\n'),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([tombstone], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );
  assert.equal(state.revisions.get(tombstone.id)?.text, '');
  assert.equal(state.revisions.get(first.id)?.text, '# notes/one.md\n');
});

await test('a path outside the rules is refused before any write', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  for (const path of ['../escape.md', 'notes/one.txt', '/notes/one.md']) {
    const failure = rejected(
      await commitChangeset(
        store,
        actor,
        changeset([await revision({ fileId: id('f'), path })]),
        'd-1',
      ),
    );
    assert.equal(failure.code, 'invalid_path', path);
  }
  assert.equal(state.accepted.length, 0);
});

await test('an accepted path is stored in its normalized form', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([await revision({ fileId, path: 'notes/cafe\u0301.md' })]),
      'd-1',
    ),
  );
  assert.equal(state.files.get(fileId)?.path, 'notes/caf\u00e9.md');
});

await test('a rename and a content change travel in one revision', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const moved = await revision({
    fileId,
    path: 'archive/one.md',
    parents: [first.id],
    content: content('# moved and edited\n'),
  });
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset([moved], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );
  const file = state.files.get(fileId);
  assert.equal(file?.path, 'archive/one.md');
  assert.equal(state.revisions.get(moved.id)?.text, '# moved and edited\n');
});

await test('two files swap their paths in one changeset', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const left = id('f');
  const right = id('f');
  const first = await revision({ fileId: left, path: 'a.md' });
  const second = await revision({ fileId: right, path: 'b.md' });
  accepted(
    await commitChangeset(store, actor, changeset([first, second]), 'd-1'),
  );
  const swapped = accepted(
    await commitChangeset(
      store,
      actor,
      changeset(
        [
          await revision({ fileId: left, path: 'b.md', parents: [first.id] }),
          await revision({ fileId: right, path: 'a.md', parents: [second.id] }),
        ],
        { expectedHeads: { [left]: first.id, [right]: second.id } },
      ),
      'd-2',
    ),
  );
  assert.equal(swapped.revisionIds.length, 2);
  assert.equal(state.files.get(left)?.path, 'b.md');
  assert.equal(state.files.get(right)?.path, 'a.md');
});

await test('a tombstone deletes the file and removes its side records', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  accepted(
    await commitChangeset(
      store,
      actor,
      changeset(
        [
          await revision({
            fileId,
            path: 'notes/one.md',
            parents: [first.id],
            deleted: true,
            content: seenOnly('# notes/one.md\n'),
          }),
        ],
        { expectedHeads: { [fileId]: first.id } },
      ),
      'd-2',
    ),
  );
  assert.equal(state.files.get(fileId)?.deleted, true);
  assert.deepEqual(state.deletions, [[fileId]]);
});

await test('side records are removed only when the write succeeded', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  state.refuse = fail<AcceptedChangeset>('path_conflict', ['x']);
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([
        await revision({
          fileId: id('f'),
          path: 'notes/one.md',
          deleted: true,
          content: content(''),
        }),
      ]),
      'd-1',
    ),
  );
  assert.equal(failure.code, 'path_conflict');
  assert.deepEqual(state.deletions, []);
});

await test('a changeset over the file limit is refused before any query', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const revisions: RevisionInput[] = [];
  for (let index = 0; index <= maxFilesPerChangeset; index += 1) {
    revisions.push(
      await revision({ fileId: id('f'), path: `notes/${String(index)}.md` }),
    );
  }
  const failure = rejected(
    await commitChangeset(store, actor, changeset(revisions), 'd-1'),
  );
  assert.equal(failure.code, 'too_many_files');
  assert.equal(failure.fileIds.length, maxFilesPerChangeset + 1);
  assert.equal(state.accepted.length, 0);
  // The same submission without the last file is accepted.
  const fitting = revisions.slice(0, maxFilesPerChangeset);
  accepted(await commitChangeset(store, actor, changeset(fitting), 'd-2'));
  assert.equal(state.accepted.length, 1);
});

await test('an empty changeset is refused', async () => {
  const state = workspaceWith('owner');
  const failure = rejected(
    await commitChangeset(
      fakeStore(state),
      actorWith(['read', 'write']),
      changeset([]),
      'd-1',
    ),
  );
  assert.equal(failure.code, 'invalid_graph');
});

await test('a second root for an existing file is refused', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  // A root revision names no parent, and the expected head is the stored one.
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([await revision({ fileId, path: 'notes/one.md' })], {
        expectedHeads: { [fileId]: first.id },
      }),
      'd-2',
    ),
  );
  assert.equal(failure.code, 'invalid_graph');
});

await test('a save of another generation is refused', async () => {
  // Record 0084. Identities of one generation say nothing about another, so
  // the workspace refuses the save instead of guessing where the work goes.
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const later = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    content: content('# next\n', '# notes/one.md\n', 2),
  });
  const failure = rejected(
    await commitChangeset(
      store,
      actor,
      changeset([later], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );
  assert.equal(failure.code, 'epoch_mismatch');
  assert.deepEqual(failure.fileIds, [fileId]);
  assert.equal(state.accepted.length, 1);
});

await test('a save that joins unseen work is marked merged', async () => {
  // Record 0081. The mark comes from complete observed state: this device had
  // not seen the text that the workspace holds, so its save joined it.
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const startText = '# notes/one.md\n';
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  const fromAnother = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [first.id],
    content: content('# from the phone\n', startText),
  });
  const seen = accepted(
    await commitChangeset(
      store,
      actor,
      changeset([fromAnother], { expectedHeads: { [fileId]: first.id } }),
      'd-2',
    ),
  );
  assert.equal(seen.revisions[0]?.merged, false);

  const offline = await revision({
    fileId,
    path: 'notes/one.md',
    parents: [fromAnother.id],
    content: content('# from the laptop\n', startText),
  });
  const merged = accepted(
    await commitChangeset(
      store,
      actor,
      changeset([offline], { expectedHeads: { [fileId]: fromAnother.id } }),
      'd-3',
    ),
  );
  assert.equal(merged.revisions[0]?.merged, true);
});

await test('a refused update leaves the accepted state unchanged', async () => {
  const state = workspaceWith('owner');
  const store = fakeStore(state);
  const actor = actorWith(['read', 'write']);
  const fileId = id('f');
  const first = await revision({ fileId, path: 'notes/one.md' });
  accepted(await commitChangeset(store, actor, changeset([first]), 'd-1'));
  documentRefusal = 'document_dependency_missing';
  try {
    const failure = rejected(
      await commitChangeset(
        store,
        actor,
        changeset(
          [
            await revision({
              fileId,
              path: 'notes/one.md',
              parents: [first.id],
            }),
          ],
          { expectedHeads: { [fileId]: first.id } },
        ),
        'd-2',
      ),
    );
    assert.equal(failure.code, 'document_dependency_missing');
  } finally {
    documentRefusal = null;
  }
  assert.equal(state.accepted.length, 1);
  assert.equal(state.files.get(fileId)?.headRevisionId, first.id);
});
