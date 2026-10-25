import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { noteMarkdown } from './language.ts';
import {
  imageReferenceAt,
  imageRemovalTarget,
  prepareImageRemoval,
} from './image-removal.ts';

await test('only the selected repeated reference is removed and removal can be undone', () => {
  const source = '![Map](https://example.invalid/map.png)';
  const original = `${source}\n\n${source}\n`;
  let state = EditorState.create({
    doc: original,
    extensions: [noteMarkdown(), imageRemovalTarget, history()],
  });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch: (spec: TransactionSpec) => {
      state = state.update(spec).state;
    },
  };
  const remove = prepareImageRemoval(view, source.length + 2, source);
  assert.ok(remove !== undefined);
  view.dispatch({ changes: { from: 0, insert: 'Before\n' } });
  assert.equal(remove(), true);
  assert.equal(state.doc.toString(), `Before\n${source}\n\n\n`);
  const removed = state.doc.toString();
  assert.equal(remove(), false);
  assert.equal(
    undo({
      state,
      dispatch: (transaction) => {
        state = transaction.state;
      },
    }),
    true,
  );
  assert.equal(state.doc.toString(), `Before\n${original}`);
  assert.equal(
    redo({
      state,
      dispatch: (transaction) => {
        state = transaction.state;
      },
    }),
    true,
  );
  assert.equal(state.doc.toString(), removed);
});

await test('changed references and read-only notes refuse removal', () => {
  const source = '![Map](https://example.invalid/map.png)';
  let state = EditorState.create({
    doc: source,
    extensions: [noteMarkdown(), imageRemovalTarget],
  });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch: (spec: TransactionSpec) => {
      state = state.update(spec).state;
    },
  };
  const remove = prepareImageRemoval(view, 0, source);
  assert.ok(remove !== undefined);
  view.dispatch({ changes: { from: 2, to: 5, insert: 'New' } });
  assert.equal(remove(), false);
  state = EditorState.create({
    doc: source,
    extensions: [
      noteMarkdown(),
      imageRemovalTarget,
      EditorState.readOnly.of(true),
    ],
  });
  assert.equal(prepareImageRemoval(view, 0, source), undefined);
  assert.equal(imageReferenceAt(state, 0, 'wrong image'), null);
});
