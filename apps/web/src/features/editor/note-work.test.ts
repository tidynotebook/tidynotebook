import assert from 'node:assert/strict';
import test from 'node:test';
import type { Draft, LocalChange } from '@notesapp/sync';
import {
  createNoteWork,
  readAfterChange,
  type NoteWorkPorts,
} from './note-work.ts';

/** A promise and the calls that settle it. */
function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (failure: unknown) => void;
} {
  let resolve = (): void => {};
  let reject = (_failure: unknown): void => {};
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Lets every settled promise run its handlers. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

/**
 * One open editor with a fake store. The document is the list of keys, the
 * store holds the keys that a write took, and a frame runs only when the
 * test asks for it.
 */
class Editor {
  keys: string[] = [];
  held: string[] = [];
  stored: string[] = [];
  appendGate: Promise<void> | null = null;
  appendFails = false;
  mergeGate: Promise<void> | null = null;
  mergeFails = false;
  checkpointFails = false;
  readonly appended: string[][] = [];
  readonly drafts: Draft[] = [];
  readonly versions: string[] = [];
  readonly frames: (() => void)[] = [];
  draftsOwed = 0;
  closed = false;

  readonly ports: NoteWorkPorts = {
    takeWork: () => {
      if (this.held.length === 0) return null;
      const taken = this.held;
      this.held = [];
      return new TextEncoder().encode(taken.join(''));
    },
    wholeWork: () => new TextEncoder().encode(this.keys.join('')),
    stateVector: () =>
      this.closed ? null : new Uint8Array([this.keys.length]),
    // The fake document holds the first keys in order, so it holds a vector
    // when it holds as many keys as the vector counts.
    holds: (stored, vector) =>
      new TextDecoder().decode(stored).length >= (vector[0] ?? 0),
    sequence: () => this.keys.length,
    draft: (deleted) => ({
      accountId: 'account-1',
      workspaceId: 'workspace-1',
      workingCopyId: 'copy-1',
      fileId: 'file-1',
      baseRevisionId: null,
      text: this.keys.join(''),
      path: 'notes/one.md',
      deleted,
      sequence: this.keys.length,
    }),
    started: () => Promise.resolve(),
    append: async (work) => {
      const keys = new TextDecoder().decode(work).split('');
      this.appended.push(keys);
      if (this.appendGate !== null) await this.appendGate;
      if (this.appendFails) throw new Error('quota');
      // Work that the store holds already changes nothing, as in Yjs.
      for (const key of keys)
        if (!this.stored.includes(key)) this.stored.push(key);
    },
    merge: async (work) => {
      if (this.mergeGate !== null) await this.mergeGate;
      if (this.mergeFails) throw new Error('stale');
      this.stored = new TextDecoder().decode(work).split('');
    },
    saveDraft: (draft) => {
      this.drafts.push(draft);
      return Promise.resolve();
    },
    checkpoint: (draft) => {
      if (this.checkpointFails) return Promise.reject(new Error('quota'));
      // The version freezes the stored document, never the draft text.
      this.versions.push(this.stored.join(''));
      void draft;
      return Promise.resolve(null);
    },
    draftOwed: () => {
      this.draftsOwed += 1;
    },
    frame: (run) => {
      this.frames.push(run);
      return () => {
        const index = this.frames.indexOf(run);
        if (index >= 0) this.frames.splice(index, 1);
      };
    },
  };

  readonly work = createNoteWork(this.ports);

  type(key: string): void {
    this.keys.push(key);
    this.held.push(key);
    this.work.changed();
  }

  runFrames(): void {
    const frames = this.frames.splice(0);
    for (const run of frames) run();
  }

  /** The stored document, as a read of the store gives it. */
  storedDocument(): Uint8Array {
    return new TextEncoder().encode(this.stored.join(''));
  }
}

await test('the keys of one frame reach the store in one append', async () => {
  // Record 0175. The editor held its keys in memory for up to a second, so
  // a closed tab, a killed phone browser or a crash lost them.
  const editor = new Editor();
  editor.type('a');
  editor.type('b');
  assert.equal(editor.frames.length, 1);
  editor.runFrames();
  await settle();
  assert.deepEqual(editor.appended, [['a', 'b']]);
  assert.deepEqual(editor.stored, ['a', 'b']);
});

await test('a version claims only the keys whose work it wrote', async () => {
  // A key typed while the work of a version was written was counted by
  // that version, so leaving the note made no second version and the key
  // had none.
  const editor = new Editor();
  editor.type('a');
  const gate = deferred();
  editor.appendGate = gate.promise;
  const first = editor.work.version();
  editor.type('b');
  gate.resolve();
  editor.appendGate = null;
  const outcome = await first;
  assert.equal(outcome.kind, 'written');
  assert.deepEqual(editor.versions, ['a']);
  assert.equal(editor.work.versionedSequence(), 1);
  assert.notEqual(editor.work.versionedSequence(), editor.keys.length);
  // Leaving the note makes the second version, which holds the key.
  await editor.work.version();
  assert.deepEqual(editor.versions, ['a', 'ab']);
  assert.equal(editor.work.versionedSequence(), 2);
});

await test('a version that fails asks for the draft that it cancelled', async () => {
  // The screen cancels the draft write that waits when a version starts,
  // because the version writes the draft itself. A version that failed
  // wrote none, and the text had no recovery copy.
  const editor = new Editor();
  editor.type('a');
  editor.checkpointFails = true;
  const outcome = await editor.work.version();
  assert.equal(outcome.kind, 'failed');
  assert.equal(editor.draftsOwed, 1);
});

await test('a version after a lost append writes the whole document first', async () => {
  const editor = new Editor();
  editor.appendFails = true;
  editor.type('a');
  editor.runFrames();
  await settle();
  assert.equal(editor.work.lost(), true);
  editor.appendFails = false;
  editor.type('b');
  await editor.work.version();
  assert.deepEqual(editor.versions, ['ab']);
  assert.equal(editor.work.lost(), false);
});

await test('a draft states its vector only when the store holds its keys', async () => {
  // Record 0175. The open of a note takes the text of the document when
  // the document covers the vector of the draft, so a vector for a key that
  // no write took would drop that key.
  const editor = new Editor();
  editor.type('a');
  const written = await editor.work.writeDraft(false);
  assert.deepEqual(editor.stored, ['a']);
  assert.deepEqual(written.documentVector, new Uint8Array([1]));
  editor.appendFails = true;
  editor.type('b');
  const lost = await editor.work.writeDraft(false);
  assert.equal(lost.text, 'ab');
  assert.equal(lost.documentVector, undefined);
});

await test('a flush appends at once, with no frame', async () => {
  // A hidden tab runs no frame, so the work of the last frame must go at
  // once when the tab hides, or a closed tab loses it.
  const editor = new Editor();
  editor.type('a');
  await editor.work.flush();
  assert.deepEqual(editor.stored, ['a']);
  assert.equal(editor.frames.length, 0);
});

await test('only the editor that wrote a document change skips it', () => {
  // Record 0175. A mark of the tab made a second editor of the same note in
  // this tab skip the work of the first.
  const change: LocalChange = {
    accountId: 'account-1',
    workspaceId: 'workspace-1',
    fileId: 'file-1',
    kind: 'document',
    writer: 'copy-1',
  };
  assert.equal(readAfterChange(change, 'copy-1'), 'none');
  assert.equal(readAfterChange(change, 'copy-2'), 'join');
  const { writer: _writer, ...unmarked } = change;
  assert.equal(readAfterChange(unmarked, 'copy-1'), 'join');
  assert.equal(
    readAfterChange({ ...change, kind: 'draft' }, 'copy-2'),
    'state',
  );
  assert.equal(readAfterChange({ ...change, kind: 'file' }, 'copy-1'), 'join');
});

await test('no append runs once an append failed', async () => {
  // Record 0181. Every frame appended its work after an append had failed,
  // and that work built on the work that the store lacked. The store could
  // not apply it, and every read of the note failed.
  const editor = new Editor();
  editor.appendFails = true;
  editor.type('a');
  editor.runFrames();
  await settle();
  assert.equal(editor.work.lost(), true);
  editor.appendFails = false;
  // The keys of later frames wait in the editor.
  editor.type('b');
  editor.runFrames();
  await editor.work.flush();
  assert.deepEqual(editor.appended, [['a']]);
  assert.deepEqual(editor.stored, []);
  // The draft keeps the text and states no vector.
  const draft = await editor.work.writeDraft(false);
  assert.equal(draft.text, 'ab');
  assert.equal(draft.documentVector, undefined);
  // The version writes the whole document, so no key is lost.
  await editor.work.version();
  assert.deepEqual(editor.versions, ['ab']);
  assert.equal(editor.work.lost(), false);
  // The work that waited goes with the next take, and appends go on.
  editor.type('c');
  await editor.work.flush();
  assert.deepEqual(editor.appended.at(-1), ['b', 'c']);
  assert.deepEqual(editor.stored, ['a', 'b', 'c']);
});

await test('a key typed while the whole document is written goes after it', async () => {
  const editor = new Editor();
  editor.appendFails = true;
  editor.type('a');
  await editor.work.flush();
  editor.appendFails = false;
  const gate = deferred();
  editor.mergeGate = gate.promise;
  const version = editor.work.version();
  await settle();
  editor.type('b');
  await editor.work.flush();
  gate.resolve();
  editor.mergeGate = null;
  await version;
  assert.deepEqual(editor.stored, ['a']);
  await editor.work.flush();
  assert.deepEqual(editor.stored, ['a', 'b']);
});

await test('a loss that begins while the whole document is written stays', async () => {
  // The write read the whole document before the loss, so it cannot repair
  // it, and the next version writes the whole document again.
  const editor = new Editor();
  editor.appendFails = true;
  editor.type('a');
  await editor.work.flush();
  editor.appendFails = false;
  const gate = deferred();
  editor.mergeGate = gate.promise;
  const version = editor.work.version();
  await settle();
  editor.work.storeLacksWork();
  gate.resolve();
  editor.mergeGate = null;
  await version;
  assert.equal(editor.work.lost(), true);
});

await test('a stored document that lacks the work of the editor gets it again', async () => {
  // Record 0181. A snapshot writes the whole document of the server over
  // the row, which can lack work that this editor appended. The editor did
  // not know, so later keys built on work that the store no longer held.
  const editor = new Editor();
  editor.type('a');
  editor.type('b');
  await editor.work.flush();
  const mark = editor.work.takenMark();
  assert.deepEqual(mark, new Uint8Array([2]));
  // A read that holds the work changes nothing.
  editor.work.readStored(editor.storedDocument(), mark);
  assert.equal(editor.work.lost(), false);
  // The row is replaced with a document that lacks the keys.
  editor.stored = ['a'];
  editor.work.readStored(editor.storedDocument(), mark);
  assert.equal(editor.work.lost(), true);
  await editor.work.version();
  assert.deepEqual(editor.stored, ['a', 'b']);
  assert.deepEqual(editor.versions, ['ab']);
});

await test('work of an old generation waits in the editor and the draft', async () => {
  // Record 0181. A new generation holds none of the work of this editor.
  // The store refuses each write of it, so the version fails and the draft
  // keeps the text for the next open of the note.
  const editor = new Editor();
  editor.type('a');
  await editor.work.flush();
  editor.work.storeLacksWork();
  editor.mergeFails = true;
  editor.type('b');
  await editor.work.flush();
  assert.deepEqual(editor.appended, [['a']]);
  const outcome = await editor.work.version();
  assert.equal(outcome.kind, 'failed');
  assert.deepEqual(editor.versions, []);
  assert.equal(editor.draftsOwed, 1);
  const draft = await editor.work.writeDraft(false);
  assert.equal(draft.text, 'ab');
  assert.equal(draft.documentVector, undefined);
});

await test('access recovery settles pending writes and blocks later draft writes', async () => {
  const editor = new Editor();
  const append = deferred();
  const checkpoint = deferred();
  editor.appendGate = append.promise;
  editor.type('a');
  const draft = editor.work.writeDraft(false);
  const recovery = editor.work.saveForAccess(false, checkpoint.promise);
  assert.equal(editor.work.frozen(), true);
  await editor.work.writeDraft(false);
  assert.deepEqual(editor.drafts, []);
  append.resolve();
  await draft;
  assert.equal(editor.drafts.length, 1);
  checkpoint.resolve();
  await recovery;
  await editor.work.writeDraft(false);
  assert.deepEqual(
    editor.drafts.map((copy) => copy.text),
    ['a', 'a'],
  );
});
