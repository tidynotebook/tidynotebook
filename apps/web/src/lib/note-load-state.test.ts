import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocalCachedNote } from '@notesapp/sync';
import {
  noteLoadStatusFor,
  noteRecoveryFor,
  opensFromDevice,
  type NoteLoadState,
  type NoteLoadStatus,
} from './note-load-state.ts';

const current = {
  accountId: 'account-one',
  workspaceId: 'workspace-one',
  fileId: 'new-note',
};

await test('a new note cannot use the path of the note before it', () => {
  // Issue 143. React can render once with the last loader state before the
  // effect for a changed file starts. That state must not reach the editor.
  const previous: NoteLoadState = {
    identity: {
      accountId: 'account-one',
      workspaceId: 'workspace-one',
      fileId: 'deleted-note',
    },
    status: {
      kind: 'ready',
      path: 'Deleted folder/Old name.md',
      text: 'old text',
      headRevisionId: 'old-revision',
      sequence: 4,
    },
  };

  assert.deepEqual(noteLoadStatusFor(previous, current, null), {
    kind: 'loading',
  });
});

await test('loader state belongs to its account and workspace too', () => {
  const previous: NoteLoadState = {
    identity: {
      accountId: 'other-account',
      workspaceId: 'other-workspace',
      fileId: 'new-note',
    },
    status: { kind: 'deleted', path: 'Old folder/Old note.md' },
  };

  assert.deepEqual(noteLoadStatusFor(previous, current, null), {
    kind: 'loading',
  });
});

await test('the current note can use its completed loader state', () => {
  const ready: NoteLoadState = {
    identity: current,
    status: {
      kind: 'ready',
      path: 'Selected folder/New note.md',
      text: '',
      headRevisionId: null,
      sequence: 0,
    },
  };

  assert.equal(noteLoadStatusFor(ready, current, null), ready.status);
});

await test('a note that this device holds opens with its content', () => {
  // Switching notes showed the loading state for two or three frames,
  // although the device held the next note. The first render of a note now
  // shows what the read of the device answered, so the next note replaces the
  // last one with no placeholder between them.
  const previous: NoteLoadState = {
    identity: { ...current, fileId: 'last-note' },
    status: {
      kind: 'ready',
      path: 'Last note.md',
      text: 'last text',
      headRevisionId: 'last-revision',
      sequence: 2,
    },
  };
  const held: NoteLoadStatus = {
    kind: 'ready',
    path: 'Next note.md',
    text: 'next text',
    headRevisionId: 'next-revision',
    sequence: 0,
    document: { bytes: new Uint8Array([1]), epoch: 1 },
  };

  assert.equal(noteLoadStatusFor(previous, current, held), held);
  const deleted: NoteLoadStatus = { kind: 'deleted', path: 'Next note.md' };
  assert.equal(noteLoadStatusFor(previous, current, deleted), deleted);
});

await test('a note the device cannot open yet shows the loading state', () => {
  const previous: NoteLoadState = {
    identity: { ...current, fileId: 'last-note' },
    status: { kind: 'deleted', path: 'Last note.md' },
  };

  // Only the server read can open it, or the read of the device outlasted
  // the hold. Neither is an empty note (decision 0038).
  assert.deepEqual(noteLoadStatusFor(previous, current, 'server'), {
    kind: 'loading',
  });
  assert.deepEqual(noteLoadStatusFor(previous, current, 'slow'), {
    kind: 'loading',
  });
});

await test('a loader result wins over the read that opened the note', () => {
  // After the open, a restore or a version of another device changes what the
  // loader holds. The screen follows the loader, not the first read.
  const loaded: NoteLoadState = {
    identity: current,
    status: { kind: 'purged' },
  };
  const opened: NoteLoadStatus = { kind: 'deleted', path: 'Next note.md' };

  assert.equal(noteLoadStatusFor(loaded, current, opened), loaded.status);
});

await test('a note of the server opens from the device only with its document', () => {
  // A device that upgraded from release 0.4 holds its notes without their
  // documents until the first snapshot. Such a note opens from the server
  // read, so no editor starts it from Markdown (records 0084, 0088).
  const bytes = new Uint8Array([1, 2, 3]);
  assert.equal(opensFromDevice(bytes, 'revision-1'), true);
  assert.equal(opensFromDevice(null, 'revision-1'), false);
  // A note that only this device holds has no accepted head, even with a
  // local version of release 0.4, and it starts its own document.
  assert.equal(opensFromDevice(null, null), true);
});

await test('recovery choices require a stale draft and its readable accepted revision', () => {
  const draft: LocalCachedNote = {
    fileId: 'note',
    path: 'Note.md',
    text: 'local text',
    deleted: false,
    workingCopyId: 'copy',
    sequence: 2,
    baseRevisionId: 'old-head',
    stale: true,
    acceptedText: 'saved text',
    acceptedPath: 'Note.md',
    acceptedRevisionId: 'new-head',
    document: null,
  };
  assert.deepEqual(noteRecoveryFor(draft), {
    workingCopyId: 'copy',
    draftText: draft.text,
    acceptedText: 'saved text',
    acceptedRevisionId: 'new-head',
  });
  assert.equal(
    noteRecoveryFor({
      ...draft,
      text: 'document text',
      draftText: 'stored text',
    })?.draftText,
    'stored text',
  );
  assert.equal(noteRecoveryFor(null), null);
  assert.equal(noteRecoveryFor({ ...draft, stale: false }), null);
  assert.equal(noteRecoveryFor({ ...draft, deleted: true }), null);
  assert.equal(noteRecoveryFor({ ...draft, workingCopyId: undefined }), null);
  assert.equal(noteRecoveryFor({ ...draft, acceptedText: null }), null);
  assert.equal(noteRecoveryFor({ ...draft, acceptedRevisionId: null }), null);
});
