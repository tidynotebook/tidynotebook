import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState } from '@codemirror/state';
import {
  openDocumentSession,
  startDocument,
  replaceDocumentText,
  encodeDocumentDelta,
} from '@notesapp/note-document';
import { editorBinding } from '@notesapp/note-document/editor-bridge';
import { bindDocument } from './document-binding.ts';
import { editorHistoryState, runHistoryAction } from './history-controls.ts';

await test('toolbar history uses local undo and keeps an intervening remote edit', () => {
  const session = openDocumentSession(startDocument('Note\n'));
  const binding = bindDocument(session);
  const state = EditorState.create({
    doc: session.text(),
    extensions: [binding.extension],
  });
  const { text, undoManager } = editorBinding(session);
  const origin = {};
  undoManager.addTrackedOrigin(origin);
  const doc = text.doc;
  assert.ok(doc !== null);
  assert.deepEqual(editorHistoryState(state), { undo: false, redo: false });
  doc.transact(() => text.insert(text.length, 'Local\n'), origin);
  assert.deepEqual(editorHistoryState(state), { undo: true, redo: false });
  const remote = replaceDocumentText(session.encode(), 'Remote\nNote\nLocal\n');
  assert.equal(remote.ok, true);
  if (!remote.ok) return;
  binding.applyRemote(
    encodeDocumentDelta(remote.value.document, session.stateVector()),
  );
  let focused = 0;
  const view = {
    state,
    composing: false,
    focus: () => {
      focused += 1;
    },
  };
  assert.equal(runHistoryAction(view, 'undo'), true);
  assert.equal(session.text(), 'Remote\nNote\n');
  assert.deepEqual(editorHistoryState(state), { undo: false, redo: true });
  assert.equal(runHistoryAction(view, 'redo'), true);
  assert.equal(session.text(), 'Remote\nNote\nLocal\n');
  assert.equal(focused, 2);
  assert.equal(runHistoryAction({ ...view, composing: true }, 'undo'), false);
  const locked = EditorState.create({
    doc: session.text(),
    extensions: [binding.extension, EditorState.readOnly.of(true)],
  });
  assert.deepEqual(editorHistoryState(locked), { undo: false, redo: false });
  assert.equal(runHistoryAction({ ...view, state: locked }, 'undo'), false);
  binding.release();
  session.destroy();
});
