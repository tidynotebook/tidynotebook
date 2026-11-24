/** Welcome completion handles failures returned by the real commit path. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyActor } from '../identity/actor.ts';
import { fail, ok, type DomainErrorCode } from '../files/model.ts';
import { createFileChangeset, workspaceText } from '../files/operations.ts';
import type { DocumentService, WorkspaceTransaction } from '../files/ports.ts';
import {
  completeWelcomeNote,
  type WelcomeNoteStore,
  type WelcomeNoteTransaction,
} from './welcome-note.ts';

const accountId = 'a0000000-0000-4000-8000-000000000001';
const workspaceId = 'b0000000-0000-4000-8000-000000000001';
const verified = verifyActor(accountId, [
  { workspaceId, actions: ['read', 'write'] },
]);
if (!verified.ok) throw new Error('The test actor is invalid.');
const actor = verified.value;
const input = createFileChangeset({
  workspaceId,
  fileId: 'c0000000-0000-4000-8000-000000000001',
  revisionId: 'd0000000-0000-4000-8000-000000000001',
  path: 'Welcome to tidy notebook.md',
  content: workspaceText('Welcome.', 1),
  message: null,
  ids: {
    mutationId: 'e0000000-0000-4000-8000-000000000001',
    deviceId: 'f0000000-0000-4000-8000-000000000001',
    clientTime: '2026-10-23T00:00:00.000Z',
  },
});

/** Rejects calls outside the new-note commit path. */
function unused(): never {
  throw new Error('This operation must not run in a welcome note test.');
}

/** Only new text is needed to reach the transaction's accept method. */
const documents: DocumentService = {
  start: (text) => new TextEncoder().encode(text),
  replaceText: (_before, text) => {
    const bytes = new TextEncoder().encode(text);
    return ok({ bytes, text, state: bytes });
  },
  observe: (bytes) => bytes,
  stateVector: (bytes) => bytes,
  delta: (bytes) => bytes,
  apply: unused,
  editRanges: unused,
  keepWrittenCharacter: unused,
  readText: unused,
  covers: unused,
};

type State = NonNullable<Awaited<ReturnType<WelcomeNoteTransaction['state']>>>;

/** The welcome probe sees no note; the content write accepts or refuses it. */
function fakeStore(code: DomainErrorCode | null, state: Partial<State> = {}) {
  const recorded: (DomainErrorCode | 'unexpected' | null)[] = [];
  let commits = 0;
  let writes = 0;
  const transaction: WorkspaceTransaction = {
    role: () => Promise.resolve('owner'),
    receipt: () => Promise.resolve(null),
    purgedFiles: () => Promise.resolve([]),
    headStates: () => Promise.resolve(new Map()),
    documents: () => Promise.resolve(new Map()),
    async accept(writer, accepted) {
      writes += 1;
      if (code !== null) return fail(code);
      return ok({
        mutationId: accepted.mutationId,
        revisionIds: accepted.revisions.map((revision) => revision.id),
        cursor: '1',
        revisions: accepted.revisions.map((revision) => ({
          revisionId: revision.id,
          fileId: revision.fileId,
          parents: revision.parents,
          path: revision.path,
          deleted: revision.deleted,
          digest: revision.content.digest,
          size:
            revision.content.kind === 'markdown'
              ? new TextEncoder().encode(revision.content.text).byteLength
              : 0,
          actorAccountId: writer.accountId,
          serverTime: '2026-10-23T00:00:00.000Z',
          message: revision.message,
          acceptedState:
            accepted.documents.find(
              (document) => document.fileId === revision.fileId,
            )?.state ?? null,
          merged: false,
          epoch:
            accepted.documents.find(
              (document) => document.fileId === revision.fileId,
            )?.epoch ?? null,
        })),
        superseded: [],
      });
    },
    heads: unused,
    revisionPaths: () => Promise.resolve(new Map()),
    parents: unused,
    listFiles: unused,
    listDeletedFiles: unused,
    takenPaths: unused,
    file: unused,
    dailyNoteSettings: unused,
    saveDailyNoteSettings: unused,
    templateSettings: unused,
    saveTemplateSettings: unused,
    snapshotRevisions: () => Promise.resolve(null),
    revision: unused,
    search: unused,
    backlinks: unused,
    isAcceptedRevision: unused,
    onFilesDeleted: unused,
    listHistory: unused,
    previewPurge: unused,
    purgeFiles: unused,
    startSnapshot: unused,
    snapshotPage: unused,
    syncChanges: unused,
  };
  const store: WelcomeNoteStore = {
    pendingWelcomeNote: () => Promise.resolve(true),
    async welcomeNote(boundActor, boundWorkspace, run) {
      assert.equal(boundActor, actor);
      assert.equal(boundWorkspace, workspaceId);
      return run({
        async state(path) {
          assert.equal(path, 'Welcome to tidy notebook.md');
          return {
            completed: false,
            existing: false,
            retryReady: true,
            standing: 'active',
            ...state,
          };
        },
        content: {
          documents,
          async transact(commitActor, commitWorkspace, commit) {
            assert.equal(commitActor, actor);
            assert.equal(commitWorkspace, workspaceId);
            commits += 1;
            return commit(transaction);
          },
        },
        async record(value) {
          recorded.push(value);
        },
      });
    },
  };
  return { store, recorded, commits: () => commits, writes: () => writes };
}

await test('an accepted commit creates the welcome note and completes its record', async () => {
  const fake = fakeStore(null);
  const result = await completeWelcomeNote(fake.store, actor, input, 'digest');
  assert.deepEqual(result, ok('created'));
  assert.deepEqual(fake.recorded, [null]);
  assert.equal(fake.commits(), 1);
  assert.equal(fake.writes(), 1);
});

for (const code of ['path_conflict', 'purged'] as const) {
  await test(`${code} from the commit completes the welcome record`, async () => {
    const fake = fakeStore(code);
    const result = await completeWelcomeNote(
      fake.store,
      actor,
      input,
      'digest',
    );
    assert.deepEqual(result, ok('completed'));
    assert.deepEqual(fake.recorded, [null]);
    assert.equal(fake.commits(), 1);
    assert.equal(
      fake.writes(),
      1,
      'the failure came from accept, not the welcome probe',
    );
  });
}

for (const state of [{ retryReady: false }, { standing: 'locked' }] as const) {
  await test(`${'standing' in state ? 'locked standing' : 'retry backoff'} leaves the welcome pending without a commit`, async () => {
    const fake = fakeStore('quota', state);
    const result = await completeWelcomeNote(
      fake.store,
      actor,
      input,
      'digest',
    );
    assert.deepEqual(result, ok('pending'));
    assert.deepEqual(fake.recorded, []);
    assert.equal(fake.commits(), 0);
    assert.equal(fake.writes(), 0);
  });
}

for (const code of [
  'quota',
  'account_locked',
  'invalid_content',
  'forbidden',
] as const) {
  await test(`${code} from the commit records the exact refusal and leaves the welcome pending`, async () => {
    const fake = fakeStore(code);
    const result = await completeWelcomeNote(
      fake.store,
      actor,
      input,
      'digest',
    );
    assert.deepEqual(result, fail(code));
    assert.deepEqual(fake.recorded, [code]);
    assert.equal(fake.commits(), 1);
    assert.equal(fake.writes(), 1);
  });
}
