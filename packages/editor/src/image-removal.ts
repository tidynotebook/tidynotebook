import {
  StateEffect,
  StateField,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { editingTransaction } from './commands.ts';

type ImageReference = {
  readonly from: number;
  readonly to: number;
  readonly source: string;
};
const selectImage = StateEffect.define<ImageReference | null>();

/** Keep the selected occurrence separate from every other use of its attachment. */
export const imageRemovalTarget = StateField.define<ImageReference | null>({
  create: () => null,
  update: (target, transaction) => {
    for (const effect of transaction.effects)
      if (effect.is(selectImage)) return effect.value;
    if (target === null) return null;
    if (transaction.changes.touchesRange(target.from, target.to)) return null;
    return {
      ...target,
      from: transaction.changes.mapPos(target.from, 1),
      to: transaction.changes.mapPos(target.to, -1),
    };
  },
});

/** Select the syntax node at the pressed widget, including indented block images. */
export function imageReferenceAt(
  state: EditorState,
  position: number,
  source: string,
): ImageReference | null {
  let found: ImageReference | null = null;
  syntaxTree(state).iterate({
    from: position,
    to: state.doc.lineAt(position).to,
    enter: (node) => {
      if (found !== null || node.name !== 'Image' || node.from < position)
        return;
      if (
        state.doc.sliceString(position, node.from).trim() !== '' ||
        state.doc.sliceString(node.from, node.to) !== source
      )
        return;
      found = { from: node.from, to: node.to, source };
    },
  });
  return found;
}

export function removeImageSpec(state: EditorState): TransactionSpec | null {
  const target = state.field(imageRemovalTarget, false);
  if (
    state.readOnly ||
    target === null ||
    target === undefined ||
    state.doc.sliceString(target.from, target.to) !== target.source
  )
    return null;
  return editingTransaction({
    changes: { from: target.from, to: target.to, insert: '' },
    selection: { anchor: target.from },
    effects: selectImage.of(null),
  });
}

/** The viewer gets one guarded action, never an attachment deletion command. */
export function prepareImageRemoval(
  view: Pick<EditorView, 'state' | 'composing'> & {
    readonly dispatch: (spec: TransactionSpec) => void;
  },
  position: number,
  source: string,
): (() => boolean) | undefined {
  if (view.state.readOnly) return undefined;
  const target = imageReferenceAt(view.state, position, source);
  if (target === null) return undefined;
  view.dispatch({ effects: selectImage.of(target) });
  return () => {
    if (view.composing) return false;
    const spec = removeImageSpec(view.state);
    if (spec === null) return false;
    view.dispatch(spec);
    return true;
  };
}
