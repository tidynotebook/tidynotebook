/**
 * The rules of the daily note settings, over an in-memory transaction.
 *
 * `tests/integration/daily-notes.test.ts` holds the same rules again against
 * PostgreSQL and its row policy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyActor, type Actor, type Role } from '../identity/actor.ts';
import type {
  FileRecord,
  WorkspaceStore,
  WorkspaceTransaction,
} from '../files/ports.ts';
import { defaultDailyNoteSettings, type DailyNoteSettings } from './model.ts';
import { defaultDailyNoteLayout } from './path.ts';
import {
  isTemplateNote,
  readDailyNoteSettings,
  updateDailyNoteSettings,
} from './settings.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const alice = '11111111-1111-4111-8111-111111111111';
const templateId = '33333333-3333-4333-8333-333333333333';

/** A live note, which is what a template has to be. */
const liveNote: FileRecord = {
  fileId: templateId,
  path: 'Templates/Day.md',
  kind: 'note',
  headRevisionId: '44444444-4444-4444-8444-444444444444',
  deleted: false,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
};

function actorFor(
  accountId: string,
  actions: readonly ('read' | 'write')[],
): Actor {
  const built = verifyActor(accountId, [
    { workspaceId, actions: [...actions] },
  ]);
  if (!built.ok) throw new Error('The test actor was rejected.');
  return built.value;
}

/** A call that these use cases must never make. */
function unused(): Promise<never> {
  return Promise.reject(new Error('The use case called an unrelated method.'));
}

/** One workspace in memory, with the settings of each account. */
function fakeStore(files: readonly FileRecord[]): WorkspaceStore & {
  readonly stored: Map<string, DailyNoteSettings>;
  readonly roles: Map<string, Role>;
  readonly readOnly: boolean[];
} {
  const stored = new Map<string, DailyNoteSettings>();
  const roles = new Map<string, Role>([[alice, 'owner']]);
  const readOnly: boolean[] = [];
  const transaction = (actor: Actor): WorkspaceTransaction => ({
    role: (accountId) => Promise.resolve(roles.get(accountId) ?? null),
    file: (fileId) =>
      Promise.resolve(files.find((file) => file.fileId === fileId) ?? null),
    dailyNoteSettings: () =>
      Promise.resolve(stored.get(actor.accountId) ?? null),
    saveDailyNoteSettings: (settings) => {
      stored.set(actor.accountId, settings);
      return Promise.resolve();
    },
    templateSettings: unused,
    saveTemplateSettings: unused,
    receipt: unused,
    documents: unused,
    heads: unused,
    headStates: unused,
    revisionPaths: unused,
    parents: unused,
    purgedFiles: unused,
    listFiles: unused,
    listDeletedFiles: unused,
    takenPaths: unused,
    snapshotRevisions: () => Promise.resolve(null),
    revision: unused,
    search: unused,
    backlinks: unused,
    isAcceptedRevision: unused,
    accept: unused,
    onFilesDeleted: unused,
    listHistory: unused,
    previewPurge: unused,
    purgeFiles: unused,
    startSnapshot: unused,
    snapshotPage: unused,
    syncChanges: unused,
  });
  return {
    stored,
    roles,
    readOnly,
    documents: {
      start: () => new Uint8Array(),
      apply: () => {
        throw new Error('unused');
      },
      editRanges: () => {
        throw new Error('Range edits are not used here.');
      },
      replaceText: () => {
        throw new Error('unused');
      },
      keepWrittenCharacter: () => {
        throw new Error('unused');
      },
      observe: () => new Uint8Array(),
      stateVector: () => new Uint8Array(),
      delta: () => new Uint8Array(),
      readText: () => '',
      covers: () => {
        throw new Error('unused');
      },
    },
    transact: (actor, scope, run, options) => {
      assert.equal(scope, workspaceId);
      readOnly.push(options?.readOnly === true);
      return run(transaction(actor));
    },
  };
}

await test('a member who stored nothing reads the defaults', async () => {
  const store = fakeStore([]);
  const read = await readDailyNoteSettings(
    store,
    actorFor(alice, ['read']),
    workspaceId,
  );
  assert.deepEqual(read, { ok: true, value: defaultDailyNoteSettings });
  // A read takes no write lock.
  assert.deepEqual(store.readOnly, [true]);
});

await test('a member stores a live note as the template and reads it back', async () => {
  const store = fakeStore([liveNote]);
  const actor = actorFor(alice, ['read']);
  const settings = {
    templateFileId: templateId,
    openOnStart: true,
    ...defaultDailyNoteLayout,
  };
  assert.deepEqual(
    await updateDailyNoteSettings(store, actor, workspaceId, settings),
    { ok: true, value: settings },
  );
  assert.deepEqual(await readDailyNoteSettings(store, actor, workspaceId), {
    ok: true,
    value: settings,
  });
});

await test('no template is a valid choice', async () => {
  const store = fakeStore([]);
  const settings = {
    templateFileId: null,
    openOnStart: true,
    ...defaultDailyNoteLayout,
  };
  assert.deepEqual(
    await updateDailyNoteSettings(
      store,
      actorFor(alice, ['read']),
      workspaceId,
      settings,
    ),
    { ok: true, value: settings },
  );
});

await test('a template that is not a live note is not found and nothing is stored', async () => {
  const cases: readonly (readonly FileRecord[])[] = [
    [],
    [{ ...liveNote, deleted: true }],
    [{ ...liveNote, kind: 'attachment' }],
    [{ ...liveNote, headRevisionId: null }],
  ];
  for (const files of cases) {
    const store = fakeStore(files);
    const result = await updateDailyNoteSettings(
      store,
      actorFor(alice, ['read']),
      workspaceId,
      {
        templateFileId: templateId,
        openOnStart: true,
        ...defaultDailyNoteLayout,
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'not_found');
      assert.deepEqual(result.error.fileIds, [templateId]);
    }
    assert.equal(store.stored.size, 0);
  }
});

await test('a stranger and an actor with no read grant are refused', async () => {
  const stranger = '22222222-2222-4222-8222-222222222222';
  const store = fakeStore([liveNote]);
  const settings = {
    templateFileId: null,
    openOnStart: true,
    ...defaultDailyNoteLayout,
  };
  for (const actor of [actorFor(stranger, ['read']), actorFor(alice, [])]) {
    const read = await readDailyNoteSettings(store, actor, workspaceId);
    assert.equal(read.ok ? null : read.error.code, 'forbidden');
    const write = await updateDailyNoteSettings(
      store,
      actor,
      workspaceId,
      settings,
    );
    assert.equal(write.ok ? null : write.error.code, 'forbidden');
  }
  assert.equal(store.stored.size, 0);
});

await test('only a live note can be a template', () => {
  assert.equal(isTemplateNote(liveNote), true);
  assert.equal(isTemplateNote(null), false);
  assert.equal(isTemplateNote({ ...liveNote, deleted: true }), false);
  assert.equal(isTemplateNote({ ...liveNote, kind: 'attachment' }), false);
  assert.equal(isTemplateNote({ ...liveNote, headRevisionId: null }), false);
});

await test('a layout that cannot name every date is an invalid path', async () => {
  const store = fakeStore([liveNote]);
  for (const layout of [
    { folder: 'Journal', format: 'MM-DD' },
    { folder: '/Journal', format: 'YYYY-MM-DD' },
    { folder: 'Journal', format: 'YYYY//MM-DD' },
  ]) {
    const result = await updateDailyNoteSettings(
      store,
      actorFor(alice, ['read']),
      workspaceId,
      { templateFileId: null, openOnStart: true, ...layout },
    );
    assert.equal(result.ok ? null : result.error.code, 'invalid_path');
  }
  assert.equal(store.stored.size, 0);
});

await test('a member stores a folder and a name format of their own', async () => {
  const store = fakeStore([]);
  const settings = {
    templateFileId: null,
    openOnStart: false,
    folder: '',
    format: 'YYYY/MM/YYYY-MM-DD dddd',
  };
  assert.deepEqual(
    await updateDailyNoteSettings(
      store,
      actorFor(alice, ['read']),
      workspaceId,
      settings,
    ),
    { ok: true, value: settings },
  );
});
