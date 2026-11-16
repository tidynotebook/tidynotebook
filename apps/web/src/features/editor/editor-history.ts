import { useCallback, useState, type RefObject } from 'react';
import {
  runHistoryAction,
  watchEditorHistory,
  type EditorHistoryState,
  type EditorView,
  type HistoryAction,
} from '@notesapp/editor';

/** Connect the toolbar to the one editor's local undo manager. */
export function useEditorHistory(viewRef: RefObject<EditorView | null>): {
  readonly state: EditorHistoryState;
  readonly run: (action: HistoryAction) => void;
  readonly watch: (view: EditorView) => () => void;
} {
  const [state, setState] = useState<EditorHistoryState>({
    undo: false,
    redo: false,
  });
  const run = useCallback(
    (action: HistoryAction): void => {
      const view = viewRef.current;
      if (view !== null) runHistoryAction(view, action);
    },
    [viewRef],
  );
  const watch = useCallback(
    (view: EditorView): (() => void) =>
      watchEditorHistory(view, (next) => {
        setState((current) =>
          current.undo === next.undo && current.redo === next.redo
            ? current
            : next,
        );
      }),
    [],
  );
  return { state, run, watch };
}
