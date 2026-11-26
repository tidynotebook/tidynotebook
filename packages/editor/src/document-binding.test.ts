import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState } from '@codemirror/state';
import {
  applyDocumentUpdate,
  documentStateVector,
  encodeDocumentDelta,
  openDocumentSession,
  readDocumentText,
  replaceDocumentText,
  startDocument,
  type DocumentSession,
} from '@notesapp/note-document';
import { editorBinding } from '@notesapp/note-document/editor-bridge';
import { ySyncAnnotation, ySyncFacet } from 'y-codemirror.next';
import {
  bindDocument,
  documentHolds,
  holdLocalWork,
  isRemoteTransaction,
  openBoundNote,
  remoteWorkGate,
} from './document-binding.ts';

/** The work that another device would send for one text of a note. */
function otherWork(session: DocumentSession, text: string): Uint8Array {
  const written = replaceDocumentText(session.encode(), text);
  if (!written.ok) throw new Error(written.refusal);
  return encodeDocumentDelta(written.value.document, session.stateVector());
}

await test('the binding builds a state over the live document text', () => {
  const session = openDocumentSession(startDocument('# Note\n'));
  const binding = bindDocument(session);
  const state = EditorState.create({
    doc: session.text(),
    extensions: [binding.extension],
  });
  assert.equal(state.doc.toString(), '# Note\n');
  binding.release();
  session.destroy();
});

await test('remote work reaches the document when nothing composes', () => {
  const session = openDocumentSession(startDocument('# Note\n'));
  const binding = bindDocument(session);
  const applied = binding.applyRemote(otherWork(session, '# Note\nmore\n'));
  assert.equal(applied.ok, true);
  assert.equal(applied.ok ? applied.value : '', 'applied');
  assert.ok(session.text().includes('more'), session.text());
  binding.release();
  session.destroy();
});

await test('remote work waits for the end of a composition', () => {
  const session = openDocumentSession(startDocument('# Note\n'));
  const gate = remoteWorkGate(session);
  gate.compositionStarted();
  const held = gate.applyRemote(otherWork(session, '# Note\nremote\n'));
  assert.equal(held.ok, true);
  assert.equal(held.ok ? held.value : '', 'held');
  assert.equal(session.text(), '# Note\n');

  gate.compositionEnded();
  assert.ok(session.text().includes('remote'), session.text());
  session.destroy();
});

await test('two updates of one composition reach the document together', () => {
  const session = openDocumentSession(startDocument('# Note\n'));
  const gate = remoteWorkGate(session);
  const first = otherWork(session, '# Note\nfirst\n');
  gate.compositionStarted();
  gate.applyRemote(first);
  // The second update follows the first, so the two merge into one and the
  // gate holds one value however long the composition runs.
  gate.applyRemote(
    (() => {
      const after = openDocumentSession(session.encode());
      after.applyRemote(first);
      const work = otherWork(after, '# Note\nfirst\nsecond\n');
      after.destroy();
      return work;
    })(),
  );
  assert.equal(session.text(), '# Note\n');
  gate.compositionEnded();
  const text = session.text();
  assert.ok(text.includes('first'), text);
  assert.ok(text.includes('second'), text);
  session.destroy();
});

await test('a released gate applies the work it still holds', () => {
  const session = openDocumentSession(startDocument('# Note\n'));
  const gate = remoteWorkGate(session);
  gate.compositionStarted();
  gate.applyRemote(otherWork(session, '# Note\nlate\n'));
  gate.release();
  assert.ok(session.text().includes('late'), session.text());
  session.destroy();
});

await test('local undo never takes remote work', () => {
  const session = openDocumentSession(startDocument('# Note\n'));
  const binding = bindDocument(session);
  const state = EditorState.create({
    doc: session.text(),
    extensions: [binding.extension],
  });
  assert.equal(state.doc.toString(), '# Note\n');
  const origins: string[] = [];
  const stop = session.subscribe((change) => origins.push(change.origin));
  binding.applyRemote(otherWork(session, '# Note\nremote\n'));
  stop();
  assert.deepEqual(origins, ['remote']);
  session.destroy();
});

await test('an undo and a redo are input of the person, not remote work', () => {
  const session = openDocumentSession(startDocument('Start'));
  const binding = bindDocument(session);
  let state = EditorState.create({
    doc: session.text(),
    extensions: [binding.extension],
  });
  const { text, undoManager } = editorBinding(session);
  const config = state.facet(ySyncFacet);
  const doc = text.doc;
  if (doc === null) throw new Error('The live text has no document.');

  // The sync plugin of the view writes every Yjs change that it did not make
  // into the view, with its annotation, while Yjs calls the observers. This
  // observer does the same, so the test reads the transaction that the view
  // takes.
  const written: boolean[] = [];
  text.observe((event, transaction) => {
    if (transaction.origin === config) return;
    let position = 0;
    const changes: { from: number; to: number; insert: string }[] = [];
    for (const step of event.delta) {
      if (typeof step.insert === 'string') {
        changes.push({ from: position, to: position, insert: step.insert });
      } else if (step.delete !== undefined) {
        changes.push({
          from: position,
          to: position + step.delete,
          insert: '',
        });
        position += step.delete;
      } else if (step.retain !== undefined) {
        position += step.retain;
      }
    }
    const next = state.update({
      changes,
      annotations: [ySyncAnnotation.of(config)],
    });
    written.push(isRemoteTransaction(next));
    state = next.state;
  });

  // The person types through the view, which writes with the origin that
  // the undo manager tracks.
  undoManager.addTrackedOrigin(config);
  doc.transact(() => text.insert(5, ' typed'), config);
  state = state.update({
    changes: { from: 5, insert: ' typed' },
    annotations: [ySyncAnnotation.of(config)],
  }).state;
  undoManager.stopCapturing();

  undoManager.undo();
  assert.equal(state.doc.toString(), 'Start');
  undoManager.redo();
  assert.equal(state.doc.toString(), 'Start typed');
  binding.applyRemote(otherWork(session, 'Start typed remote'));
  assert.equal(state.doc.toString(), 'Start typed remote');

  assert.deepEqual(written, [false, false, true]);
  binding.release();
  session.destroy();
});

/**
 * What the store holds after it takes one piece of work and then folds the
 * text of the working copy into its document, as a save does.
 */
function storeAfterSave(work: Uint8Array | null, text: string): Uint8Array {
  const before =
    work === null ? null : applyDocumentUpdate(startDocument(''), work);
  if (before !== null && !before.ok) throw new Error(before.refusal);
  // A store with no document starts one from the text of the working copy.
  const bytes = before === null ? startDocument(text) : before.value.document;
  const written = replaceDocumentText(bytes, text);
  if (!written.ok) throw new Error(written.refusal);
  return written.value.document;
}

await test('a note opened from text alone reads its text once after a save', () => {
  // A duplicated note has a text and no document. The open starts the
  // document, and that start is the work the store must take, or the store
  // starts a second document and the join shows the text twice.
  const text = '# Note\n\nCopied text\n';
  const note = openBoundNote(null, text);
  const stored = storeAfterSave(note.startWork, text);
  note.join(stored);
  assert.equal(note.text(), text);
  assert.equal(readDocumentText(stored), text);
  note.release();
});

await test('a note opened over an older document reads its text once after a save', () => {
  const stored = startDocument('# Note\n');
  const text = '# Note\n\nA draft line\n';
  const note = openBoundNote(stored, text);
  const start = note.startWork;
  assert.notEqual(start, null);
  const applied = applyDocumentUpdate(stored, start ?? new Uint8Array());
  if (!applied.ok) throw new Error(applied.refusal);
  const written = replaceDocumentText(applied.value.document, text);
  if (!written.ok) throw new Error(written.refusal);
  note.join(written.value.document);
  assert.equal(note.text(), text);
  note.release();
});

await test('a note opened over its own document states no start work', () => {
  const note = openBoundNote(startDocument('# Note\n'), '# Note\n');
  assert.equal(note.startWork, null);
  note.release();
});

await test('the work of a note brings a store that missed a write up to the view', () => {
  // A local write that fails leaves the store without that change, and the
  // later writes build on it. The whole live document merges into the store
  // and holds every change of the view again.
  const stored = startDocument('- [ ] task\n');
  const note = openBoundNote(stored, '- [ ] task\n');
  const written = replaceDocumentText(stored, '- [x] task\nmore\n');
  if (!written.ok) throw new Error(written.refusal);
  note.join(written.value.document);
  const merged = applyDocumentUpdate(stored, note.work());
  assert.ok(merged.ok);
  assert.equal(readDocumentText(merged.value.document), note.text());
  assert.equal(note.text(), '- [x] task\nmore\n');
  note.release();
});

await test('an open note states the vector of the document that it holds', () => {
  // Record 0175. A draft states this vector, so the open of the note can tell
  // that the stored document holds every change of the draft.
  const stored = startDocument('# Note\n');
  const note = openBoundNote(stored, '# Note\n');
  const written = replaceDocumentText(stored, '# Note\nmore\n');
  if (!written.ok) throw new Error(written.refusal);
  note.join(written.value.document);
  assert.deepEqual(
    note.stateVector(),
    documentStateVector(written.value.document),
  );
  note.release();
});

await test('the work of the person waits until it is taken, as one update', () => {
  // Record 0175. Each key wrote its own update to the store, which decoded
  // the stored document once for each key.
  const stored = startDocument('# Note\n');
  const session = openDocumentSession(stored);
  const held = holdLocalWork(session);
  let heard = 0;
  held.listen(() => {
    heard += 1;
  });
  const text = editorBinding(session).text;
  text.insert(text.length, 'a');
  text.insert(text.length, 'b');
  text.insert(text.length, 'c');
  assert.equal(heard, 3);
  const work = held.take();
  assert.ok(work !== null);
  const merged = applyDocumentUpdate(stored, work);
  assert.ok(merged.ok);
  assert.equal(readDocumentText(merged.value.document), '# Note\nabc');
  assert.equal(held.take(), null);
  held.stop();
  session.destroy();
});

await test('remote work is never held as work of the person', () => {
  const session = openDocumentSession(startDocument('# Note\n'));
  const held = holdLocalWork(session);
  session.applyRemote(otherWork(session, '# Note\nremote\n'));
  assert.equal(held.take(), null);
  held.stop();
  session.destroy();
});

await test('an open note joins a save of another device and a restore exactly', () => {
  // Record 0179. The note screen mounted a new editor when another device
  // moved the head, and the person lost the caret and the scroll. Both moves
  // are work of the same generation, so the one editor joins them.
  const first = startDocument('# Note\nfirst\n');
  const note = openBoundNote(first, '# Note\nfirst\n');
  const saved = replaceDocumentText(first, '# Note\nfirst\nsecond\n');
  if (!saved.ok) throw new Error(saved.refusal);
  note.join(saved.value.document);
  assert.equal(note.text(), '# Note\nfirst\nsecond\n');
  // A restore from History writes the old text into the same document.
  const restored = replaceDocumentText(saved.value.document, '# Note\nfirst\n');
  if (!restored.ok) throw new Error(restored.refusal);
  note.join(restored.value.document);
  assert.equal(note.text(), '# Note\nfirst\n');
  // The same work a second time changes nothing.
  note.join(restored.value.document);
  assert.equal(note.text(), '# Note\nfirst\n');
  note.release();
});

await test('a document of a new generation cannot join, which is why it reopens', () => {
  // Record 0179. The identities of a new generation say nothing about the
  // old ones, so a join would hold the text twice. The screen reads the
  // note again for it instead.
  const note = openBoundNote(startDocument('# Note\n'), '# Note\n');
  note.join(startDocument('# Note\n'));
  assert.notEqual(note.text(), '# Note\n');
  note.release();
});

await test('a stored document holds the work of a vector only with every insertion', () => {
  // Record 0181. A snapshot can replace the stored row with a document that
  // lacks keys the editor appended, and the editor then writes its whole
  // document again.
  const note = openBoundNote(startDocument('one\n'), 'one\n');
  const before = note.work();
  const typed = replaceDocumentText(before, 'one\ntwo\n');
  assert.ok(typed.ok);
  note.join(typed.value.document);
  const vector = note.stateVector();
  assert.equal(documentHolds(note.work(), vector), true);
  assert.equal(documentHolds(before, vector), false);
  // A document with more work than the vector names holds it too.
  const other = replaceDocumentText(note.work(), 'zero\none\ntwo\n');
  assert.ok(other.ok);
  assert.equal(documentHolds(other.value.document, vector), true);
  note.release();
});

await test('a released note opens again with every change and no start work', () => {
  // React mounts the effects of the note screen twice in development. The
  // first clean up released the note, and the second mount bound its view
  // to the ended session: no key reached the store, and each write failed
  // with "The document session has ended."
  const note = openBoundNote(startDocument('one\n'), 'one\ntwo\n');
  assert.notEqual(note.startWork, null);
  assert.equal(note.reopen(), note);
  const other = replaceDocumentText(note.work(), 'zero\none\ntwo\n');
  assert.ok(other.ok);
  note.join(other.value.document);
  const vector = note.stateVector();
  note.release();
  const again = note.reopen();
  assert.notEqual(again, note);
  assert.equal(again.text(), 'zero\none\ntwo\n');
  assert.equal(again.startWork, null);
  assert.equal(documentHolds(again.work(), vector), true);
  assert.equal(again.takeLocalWork(), null);
  // A second release of the ended note changes nothing.
  note.release();
  const second = note.reopen();
  assert.equal(second.text(), 'zero\none\ntwo\n');
  second.release();
  again.release();
});
