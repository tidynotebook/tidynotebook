import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EditorState,
  type EditorStateConfig,
  type TransactionSpec,
} from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { noteMarkdown, parsedWhole } from './language.ts';
import {
  imageReferenceAt,
  imageRemovalTarget,
  prepareImageRemoval,
} from './image-removal.ts';

/** Publish the complete parse before tests inspect image syntax. */
function completeState(config: EditorStateConfig): EditorState {
  return parsedWhole(EditorState.create(config));
}

await test('only the selected repeated reference is removed and removal can be undone', () => {
  const source = '![Map](https://example.invalid/map.png)';
  const original = `${source}\n\n${source}\n`;
  let state = completeState({
    doc: original,
    extensions: [
      noteMarkdown({ headless: true }),
      imageRemovalTarget,
      history(),
    ],
  });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch: (spec: TransactionSpec) => {
      state = parsedWhole(state.update(spec).state);
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
  let state = completeState({
    doc: source,
    extensions: [noteMarkdown({ headless: true }), imageRemovalTarget],
  });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch: (spec: TransactionSpec) => {
      state = parsedWhole(state.update(spec).state);
    },
  };
  const remove = prepareImageRemoval(view, 0, source);
  assert.ok(remove !== undefined);
  view.dispatch({ changes: { from: 2, to: 5, insert: 'New' } });
  assert.equal(remove(), false);
  state = completeState({
    doc: source,
    extensions: [
      noteMarkdown({ headless: true }),
      imageRemovalTarget,
      EditorState.readOnly.of(true),
    ],
  });
  assert.equal(prepareImageRemoval(view, 0, source), undefined);
  assert.equal(imageReferenceAt(state, 0, 'wrong image'), null);
});

await test('a mapped reference that becomes code is not removed', () => {
  const source = '![Map](https://example.invalid/map.png)';
  const prefix = 'Before\n\n';
  let state = completeState({
    doc: `${prefix}${source}\n`,
    extensions: [noteMarkdown({ headless: true }), imageRemovalTarget],
  });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch: (spec: TransactionSpec) => {
      state = parsedWhole(state.update(spec).state);
    },
  };
  const remove = prepareImageRemoval(view, prefix.length, source);
  assert.ok(remove !== undefined);
  view.dispatch({ changes: { from: 0, insert: '```\n' } });
  const code = state.doc.toString();
  assert.equal(remove(), false);
  assert.equal(state.doc.toString(), code);
});
