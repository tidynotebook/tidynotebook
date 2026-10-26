import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { runHistoryAction, type EditorView } from '@notesapp/editor';
import { Button, CloseIcon, Toast } from '@notesapp/ui';

/** Offer the existing editor Undo only while this removal is still latest. */
export function useImageUndo(viewRef: RefObject<EditorView | null>): {
  readonly clear: () => void;
  readonly removed: () => void;
  readonly toast: ReactNode;
} {
  const [notice, setNotice] = useState<{ readonly run: () => void } | null>(
    null,
  );
  const current = useRef<{ readonly run: () => void } | null>(null);
  const clear = useCallback((): void => {
    if (current.current === null) return;
    current.current = null;
    setNotice(null);
  }, []);
  const removed = useCallback((): void => {
    const view = viewRef.current;
    if (view === null) return;
    const after = view.state.doc;
    const next = {
      run: (): void => {
        if (viewRef.current === view && view.state.doc === after)
          runHistoryAction(view, 'undo');
        clear();
      },
    };
    current.current = next;
    setNotice(next);
  }, [viewRef, clear]);
  return {
    clear,
    removed,
    toast:
      notice === null ? null : (
        <Toast message="Image removed from note.">
          <Button variant="secondary" size="sm" onClick={notice.run}>
            Undo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            label="Close message"
            icon={<CloseIcon />}
            onClick={clear}
          />
        </Toast>
      ),
  };
}
