/**
 * The private editor bridge (record 0082).
 *
 * The CodeMirror binding needs the live Yjs text and an undo manager, so this
 * entry returns Yjs types, and only `packages/editor` may import it
 * (`tools/check-boundaries.mjs`). The entry loads no CodeMirror code.
 *
 * The undo manager tracks no origin of its own. The binding adds the origin
 * of its local input, so remote work and repair never enter local undo.
 */
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
export {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { noteTextRoot } from './document.ts';
import { liveDocumentOf, type DocumentSession } from './session.ts';

/** The live Yjs values that one editor view binds to. */
export type EditorBinding = {
  readonly text: Y.Text;
  readonly awareness: Awareness;
  readonly clientId: () => number;
  readonly undoManager: Y.UndoManager;
  /**
   * Whether the undo manager runs a step now.
   *
   * An undo and a redo write the text through Yjs, so the view receives them
   * as document work. They are still input of the person, and the binding
   * reads this to keep them out of remote work.
   */
  readonly historyRuns: () => boolean;
};

/** The one binding of each session, so a view never gets a second undo. */
const bindings = new WeakMap<DocumentSession, EditorBinding>();

/**
 * The live text and the local undo manager of one session.
 *
 * One session has one binding. The session releases the undo manager when it
 * ends, so no view keeps an undo reference into a released document.
 */
export function editorBinding(session: DocumentSession): EditorBinding {
  const existing = bindings.get(session);
  if (existing !== undefined) return existing;
  const doc = liveDocumentOf(session);
  const text = doc.getText(noteTextRoot);
  const undoManager = new Y.UndoManager(text, {
    trackedOrigins: new Set(),
  });
  // Yjs calls the observers of a transaction between these two events, so
  // the step runs while its transaction is open. An observer that reads the
  // change of its event opens a nested transaction with no origin, so each
  // open transaction keeps its own mark.
  const open: boolean[] = [];
  const start = (transaction: Y.Transaction): void => {
    open.push(transaction.origin === undoManager);
  };
  const end = (): void => {
    open.pop();
  };
  doc.on('beforeTransaction', start);
  doc.on('afterTransaction', end);
  const awareness = new Awareness(doc);
  const binding: EditorBinding = {
    awareness,
    clientId: () => doc.clientID,
    text,
    undoManager,
    historyRuns: () => open.includes(true),
  };
  bindings.set(session, binding);
  session.onDestroy(() => {
    doc.off('beforeTransaction', start);
    doc.off('afterTransaction', end);
    awareness.destroy();
    undoManager.destroy();
    bindings.delete(session);
  });
  return binding;
}
