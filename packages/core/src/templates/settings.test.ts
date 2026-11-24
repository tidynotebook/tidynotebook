/**
 * The rules of the template settings, over an in-memory transaction.
 *
 * `tests/integration/template-settings.test.ts` holds the same rules again
 * against PostgreSQL and its row policy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyActor, type Actor, type Role } from '../identity/actor.ts';
import type { WorkspaceStore, WorkspaceTransaction } from '../files/ports.ts';
import {
  defaultTemplateSettings,
  isTemplatePath,
  templateFolderProblem,
  type TemplateSettings,
} from './model.ts';
import { readTemplateSettings, updateTemplateSettings } from './settings.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const alice = '11111111-1111-4111-8111-111111111111';

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
function fakeStore(): WorkspaceStore & {
  readonly stored: Map<string, TemplateSettings>;
  readonly roles: Map<string, Role>;
  readonly readOnly: boolean[];
} {
  const stored = new Map<string, TemplateSettings>();
  const roles = new Map<string, Role>([[alice, 'owner']]);
  const readOnly: boolean[] = [];
  const transaction = (actor: Actor): WorkspaceTransaction => ({
    role: (accountId) => Promise.resolve(roles.get(accountId) ?? null),
    templateSettings: () =>
      Promise.resolve(stored.get(actor.accountId) ?? null),
    saveTemplateSettings: (settings) => {
      stored.set(actor.accountId, settings);
      return Promise.resolve();
    },
    file: unused,
    dailyNoteSettings: unused,
    saveDailyNoteSettings: unused,
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

await test('a member who stored nothing reads the default folder', async () => {
  const store = fakeStore();
  const read = await readTemplateSettings(
    store,
    actorFor(alice, ['read']),
    workspaceId,
  );
  assert.deepEqual(read, { ok: true, value: { folder: 'Templates' } });
  assert.deepEqual(defaultTemplateSettings, { folder: 'Templates' });
  // A read takes no write lock.
  assert.deepEqual(store.readOnly, [true]);
});

await test('a member stores a folder of their own and reads it back', async () => {
  const store = fakeStore();
  const actor = actorFor(alice, ['read']);
  const settings = { folder: 'Work/Templates' };
  assert.deepEqual(
    await updateTemplateSettings(store, actor, workspaceId, settings),
    { ok: true, value: settings },
  );
  assert.deepEqual(await readTemplateSettings(store, actor, workspaceId), {
    ok: true,
    value: settings,
  });
});

await test('a folder that names no folder is an invalid path', async () => {
  const store = fakeStore();
  for (const folder of ['', '/Templates', 'Templates/', 'A//B', ' Templates']) {
    const result = await updateTemplateSettings(
      store,
      actorFor(alice, ['read']),
      workspaceId,
      { folder },
    );
    assert.equal(result.ok ? null : result.error.code, 'invalid_path', folder);
  }
  assert.equal(store.stored.size, 0);
});

await test('a stranger and an actor with no read grant are refused', async () => {
  const stranger = '22222222-2222-4222-8222-222222222222';
  const store = fakeStore();
  for (const actor of [actorFor(stranger, ['read']), actorFor(alice, [])]) {
    const read = await readTemplateSettings(store, actor, workspaceId);
    assert.equal(read.ok ? null : read.error.code, 'forbidden');
    const write = await updateTemplateSettings(store, actor, workspaceId, {
      folder: 'Templates',
    });
    assert.equal(write.ok ? null : write.error.code, 'forbidden');
  }
  assert.equal(store.stored.size, 0);
});

await test('the template folder must name a folder', () => {
  assert.equal(templateFolderProblem('Templates'), null);
  assert.equal(templateFolderProblem('Work/Templates'), null);
  assert.equal(templateFolderProblem(''), 'empty');
  assert.equal(templateFolderProblem('/Templates'), 'folder');
  assert.equal(templateFolderProblem('Templates '), 'folder');
});

await test('a template is a note below the folder, also in a subfolder', () => {
  assert.equal(isTemplatePath('Templates/Groceries.md', 'Templates'), true);
  assert.equal(isTemplatePath('Templates/Home/Weekly.md', 'Templates'), true);
  assert.equal(isTemplatePath('Work/Templates/Day.md', 'Work/Templates'), true);
  // A note beside the folder, or in a folder that only starts like it, is no
  // template.
  assert.equal(isTemplatePath('Groceries.md', 'Templates'), false);
  assert.equal(isTemplatePath('Templates old/Day.md', 'Templates'), false);
  assert.equal(isTemplatePath('TemplatesX/Day.md', 'Templates'), false);
  assert.equal(isTemplatePath('templates/Day.md', 'Templates'), false);
  // The top of the workspace is no template folder.
  assert.equal(isTemplatePath('Groceries.md', ''), false);
});
