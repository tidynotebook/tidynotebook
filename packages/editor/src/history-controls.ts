import {
  Compartment,
  Facet,
  StateEffect,
  type EditorState,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
/** The bound document supplies its existing local undo manager here. */
export type DocumentHistory = {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): boolean;
  redo(): boolean;
  watch(listener: () => void): () => void;
};
export const documentHistory = Facet.define<
  DocumentHistory,
  DocumentHistory | null
>({ combine: (values) => values[0] ?? null });

/** Availability of the bound document's local history. */
export type EditorHistoryState = {
  readonly undo: boolean;
  readonly redo: boolean;
};
export type HistoryAction = 'undo' | 'redo';

export function editorHistoryState(state: EditorState): EditorHistoryState {
  const history = state.facet(documentHistory);
  return {
    undo: !state.readOnly && (history?.canUndo() ?? false),
    redo: !state.readOnly && (history?.canRedo() ?? false),
  };
}

/** Runs the same manager as the keyboard shortcuts and preserves its selection. */
export function runHistoryAction(
  view: Pick<EditorView, 'state' | 'composing' | 'focus'>,
  action: HistoryAction,
): boolean {
  if (view.composing || !editorHistoryState(view.state)[action]) return false;
  const history = view.state.facet(documentHistory);
  if (history === null) return false;
  const changed = action === 'undo' ? history.undo() : history.redo();
  view.focus();
  return changed;
}

/** Stack events occur after the manager changes, including after remote edits. */
export function watchEditorHistory(
  view: EditorView,
  notify: (state: EditorHistoryState) => void,
): () => void {
  const update = (): void => notify(editorHistoryState(view.state));
  const availability = new Compartment();
  view.dispatch({
    effects: StateEffect.appendConfig.of(
      availability.of(
        EditorView.updateListener.of((change) => {
          if (change.startState.readOnly !== change.state.readOnly) update();
        }),
      ),
    ),
  });
  const stop = view.state.facet(documentHistory)?.watch(update);
  update();
  return () => {
    stop?.();
    view.dispatch({ effects: availability.reconfigure([]) });
  };
}
