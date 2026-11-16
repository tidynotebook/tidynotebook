/**
 * The binding of one live note document to one editor view (record 0082).
 *
 * The CodeMirror binding reads the live Yjs text and the local undo manager
 * through the private bridge of `packages/note-document`. It gives its own
 * input a transaction origin that the undo manager tracks, so remote work and
 * repair never enter local undo.
 *
 * Remote work reaches the document through this binding and never through the
 * session directly, because an update that lands during an IME composition
 * would move the text under the composing range and lose the composed
 * characters. The gate below holds that work while the view composes and
 * applies it at composition end. The held work stays one merged update, so a
 * long composition cannot grow an unbounded queue.
 *
 * One session has one binding, and the binding ends with the view: `release`
 * applies whatever it still holds and stops holding anything else. The
 * session itself belongs to the caller that opened the note.
 */
import {
  Annotation,
  EditorState,
  type Extension,
  type Transaction,
} from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import {
  documentStateVector,
  encodeDocumentDelta,
  mergeDocumentUpdates,
  openDocumentSession,
  readDocumentText,
  replaceDocumentText,
  startDocument,
  stateVectorCovers,
  type DocumentResult,
  type DocumentSession,
} from '@notesapp/note-document';
import { documentHistory } from './history-controls.ts';
import { editorBinding } from '@notesapp/note-document/editor-bridge';
import {
  yCollab,
  ySyncAnnotation,
  yUndoManagerKeymap,
} from 'y-codemirror.next';

/** Where remote work waits while the view composes. */
export type RemoteWorkGate = {
  /**
   * Applies accepted remote work, or holds it until the composition ends.
   *
   * `applied` states that the document took the work. `held` states that the
   * document takes it as soon as the composition ends.
   */
  applyRemote(update: Uint8Array): DocumentResult<'applied' | 'held'>;
  /** States that a composition started, so work waits from now on. */
  compositionStarted(): void;
  /** States that the composition ended and applies the work it held. */
  compositionEnded(): void;
  /** Applies held work and stops holding. The session stays open. */
  release(): void;
};

/** The gate that decides when remote work reaches one open document. */
export function remoteWorkGate(session: DocumentSession): RemoteWorkGate {
  let composing = false;
  let held: Uint8Array | null = null;

  const flush = (): void => {
    const pending = held;
    held = null;
    // A refusal leaves the document exactly as it was. The next snapshot
    // repairs a device that cannot take the work.
    if (pending !== null) session.applyRemote(pending);
  };

  return {
    applyRemote(update: Uint8Array): DocumentResult<'applied' | 'held'> {
      if (composing) {
        held = held === null ? update : mergeDocumentUpdates([held, update]);
        return { ok: true, value: 'held' };
      }
      const applied = session.applyRemote(update);
      if (!applied.ok) return applied;
      return { ok: true, value: 'applied' };
    },
    compositionStarted(): void {
      composing = true;
    },
    compositionEnded(): void {
      composing = false;
      flush();
    },
    release(): void {
      composing = false;
      flush();
    },
  };
}

/** Marks a transaction that an undo or a redo of the person wrote. */
const historyStep = Annotation.define<true>();

/**
 * Whether one transaction carries work that came from the document.
 *
 * The binding annotates every transaction that it writes into the view, so a
 * remote change and a repair are told apart from the input of the person.
 * Neither schedules a save of this device and neither enters local undo. An
 * undo and a redo also reach the view through the document, but they are
 * input of the person, so they save like a keystroke (issue 221).
 */
export function isRemoteTransaction(transaction: Transaction): boolean {
  return (
    transaction.annotation(ySyncAnnotation) !== undefined &&
    transaction.annotation(historyStep) === undefined
  );
}

/** Whether one view update carries work that came from the document. */
export function isRemoteChange(update: ViewUpdate): boolean {
  return update.transactions.some(isRemoteTransaction);
}

/** One live document joined to one view. */
export type DocumentBinding = RemoteWorkGate & {
  /** The extensions that join the view to the document. */
  readonly extension: Extension;
};

/** Joins one session to one view and states how remote work reaches it. */
export function bindDocument(session: DocumentSession): DocumentBinding {
  const binding = editorBinding(session);
  const gate = remoteWorkGate(session);
  let composing = false;
  return {
    ...gate,
    extension: [
      documentHistory.of({
        canUndo: () => binding.undoManager.canUndo(),
        canRedo: () => binding.undoManager.canRedo(),
        undo: () => binding.undoManager.undo() !== null,
        redo: () => binding.undoManager.redo() !== null,
        watch: (listener) => {
          const events = [
            'stack-item-added',
            'stack-item-popped',
            'stack-item-updated',
            'stack-cleared',
          ] as const;
          for (const event of events) binding.undoManager.on(event, listener);
          return () => {
            for (const event of events)
              binding.undoManager.off(event, listener);
          };
        },
      }),
      yCollab(binding.text, null, { undoManager: binding.undoManager }),
      // Yjs holds the local undo of a bound editor, so the keys of the
      // shortcuts list run the undo manager rather than the CodeMirror
      // history that a plain editor keeps.
      keymap.of(yUndoManagerKeymap),
      // The step of the undo manager writes the view while it runs, so the
      // transaction it writes is marked as input of the person here.
      EditorState.transactionExtender.of((transaction) =>
        binding.historyRuns() &&
        transaction.annotation(ySyncAnnotation) !== undefined
          ? { annotations: historyStep.of(true) }
          : null,
      ),
      EditorView.domEventHandlers({
        compositionstart: (): boolean => {
          composing = true;
          gate.compositionStarted();
          return false;
        },
        compositionend: (): boolean => {
          composing = false;
          gate.compositionEnded();
          return false;
        },
      }),
      // A composition can also end without the DOM event, for example when
      // the view loses focus, so every update reads the state of the view.
      EditorView.updateListener.of((update): void => {
        if (composing && !update.view.composing) {
          composing = false;
          gate.compositionEnded();
        }
      }),
    ],
  };
}

/** The local work of one session that no store took yet. */
export type HeldLocalWork = {
  /** Runs on every change of the person. */
  readonly listen: (listener: () => void) => () => void;
  /** The held work as one update, or `null`, and holds nothing after it. */
  readonly take: () => Uint8Array | null;
  /** Stops holding and stops every listener. */
  readonly stop: () => void;
};

/**
 * Holds the updates of the person on one session until a screen takes them
 * (record 0175). Remote work and repair are never held: the store already
 * has them. The updates merge on take, so the keys of one frame are one write.
 */
export function holdLocalWork(session: DocumentSession): HeldLocalWork {
  let held: Uint8Array[] = [];
  const listeners = new Set<() => void>();
  const stopHolding = session.subscribe((change) => {
    if (change.origin !== 'local') return;
    held.push(change.update);
    for (const listener of [...listeners]) listener();
  });
  return {
    listen: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    take: () => {
      const taken = held;
      held = [];
      if (taken.length === 0) return null;
      return taken.length === 1
        ? (taken[0] ?? null)
        : mergeDocumentUpdates(taken);
    },
    stop: () => {
      stopHolding();
      listeners.clear();
      held = [];
    },
  };
}

/**
 * Whether a stored document holds every change that a state vector names.
 *
 * The screen keeps the vector of the work that the store took. A stored
 * document that lacks part of it lost work of the open note, for example to
 * a snapshot that replaced the row, and the screen writes its whole document
 * again (record 0181). A state vector does not count a deletion, so the
 * answer speaks only of the insertions.
 */
export function documentHolds(stored: Uint8Array, vector: Uint8Array): boolean {
  return stateVectorCovers(documentStateVector(stored), vector);
}

/** One open note, joined to one view, as a screen uses it. */
export type BoundNote = {
  /** The extensions that join the view to the document. */
  readonly extension: Extension;
  /**
   * The work that the open wrote beyond the stored document, or `null`.
   *
   * A note with no stored document, such as a duplicate, starts its document
   * here, and a stored document that lacks the text of a draft gets that
   * text here. The screen writes this work to the store before any save. A
   * store that never took it starts a document of its own at the save, and
   * the join that follows shows the text twice.
   */
  readonly startWork: Uint8Array | null;
  /** The text of the note now, which is the text of the view. */
  text(): string;
  /**
   * The whole live document as work, which merges into any copy of it.
   *
   * The screen writes it after a local write failed, so the store holds
   * every change of this view again before a save freezes the store.
   */
  work(): Uint8Array;
  /**
   * The state vector of the open document. A draft states it, so the open
   * of the note can tell that its document holds the work of the draft
   * (record 0175).
   */
  stateVector(): Uint8Array;
  /**
   * Joins the document that this device stores into the open note.
   *
   * The screen calls this when the store reports a change. Only the work the
   * open note lacks is applied, so a call that brings nothing new changes
   * nothing.
   */
  join(stored: Uint8Array): void;
  /**
   * Runs on every change of the person. The work waits here until the screen
   * takes it, which it does once for each frame (record 0175).
   */
  onLocalWork(listener: () => void): () => void;
  /**
   * The work of the person since the last take, as one update, or `null`
   * when there is none. The screen appends it to the store on the next
   * frame and before every save.
   */
  takeLocalWork(): Uint8Array | null;
  /**
   * Releases the binding and ends the note. Every later call throws, except
   * `reopen`. The screen takes the local work that waits before it.
   */
  release(): void;
  /**
   * The note opened again from the state it held at its release, or this
   * note while it is open.
   *
   * React mounts the effects of a screen twice in development: it mounts,
   * cleans up and mounts again with the same values. The clean up releases
   * the note, so the second mount opens it again. The new note holds every
   * change of the released one and has no start work, so nothing is written
   * twice, and the undo history starts again.
   */
  reopen(): BoundNote;
};

/**
 * Opens one note for editing, from the document that this device stores.
 *
 * `text` is the text the screen shows. A device whose stored document does
 * not hold that text yet, because an earlier release kept a text draft or
 * the note is new, gets the difference as `startWork`, so nothing a person
 * wrote is lost and the store holds the one document this open started.
 */
export function openBoundNote(
  stored: Uint8Array | null,
  text: string,
): BoundNote {
  const bytes = stored ?? startDocument('');
  const written =
    readDocumentText(bytes) === text ? null : replaceDocumentText(bytes, text);
  const opened =
    written !== null && written.ok ? written.value.document : bytes;
  const session = openDocumentSession(opened);
  const binding = bindDocument(session);
  const localWork = holdLocalWork(session);
  // The whole document at the release, which `reopen` opens again.
  let released: Uint8Array | null = null;
  const note: BoundNote = {
    startWork:
      opened === bytes
        ? null
        : encodeDocumentDelta(opened, documentStateVector(bytes)),
    extension: binding.extension,
    text: () => session.text(),
    work: () => session.encode(),
    stateVector: () => session.stateVector(),
    join(document: Uint8Array): void {
      binding.applyRemote(encodeDocumentDelta(document, session.stateVector()));
    },
    onLocalWork: localWork.listen,
    takeLocalWork: localWork.take,
    release(): void {
      if (released !== null) return;
      localWork.stop();
      // Remote work that a composition held joins the document first.
      binding.release();
      released = session.encode();
      session.destroy();
    },
    reopen(): BoundNote {
      return released === null
        ? note
        : openBoundNote(released, readDocumentText(released));
    },
  };
  return note;
}
