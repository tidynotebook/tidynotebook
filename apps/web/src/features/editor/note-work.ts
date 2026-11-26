/**
 * The writes of one open editor to this device (records 0022, 0133, 0175,
 * 0181).
 *
 * A key reaches the disk one frame after it reaches the editor: each frame
 * appends the work of its keys to the document of the note, with no decode
 * of the document. A hidden tab and the end of the screen append at once,
 * because a hidden tab runs no frame.
 *
 * After a failed append the editor appends nothing more: the work waits in
 * the editor, and the next version writes the whole document first, which
 * holds every change. A read of the stored document that lacks a change the
 * store took, as after a snapshot that replaced the row, has the same result.
 * An append that started before the failure was known can build on the work
 * that failed, and the store leaves it out until the whole document arrives.
 *
 * The draft is recovery data and follows after a pause. It states the state
 * vector of the document only after the store took every change that the
 * vector names, because a state vector does not count a deletion.
 *
 * A version freezes the stored document, so it writes the work first and
 * claims only the changes whose work it wrote. A key that arrives while it
 * runs gets a version of its own. A version that writes no draft, because it
 * failed or wrote nothing, asks for the draft at once: the draft write that
 * waited was cancelled for it.
 *
 * The ports are injected, so a unit test drives the store and the frames.
 */
import type { Draft, LocalChange, QueueEntry } from '@notesapp/sync';

/** What the writes of one editor need. */
export type NoteWorkPorts = {
  /** The work of the person since the last take, or `null`. */
  readonly takeWork: () => Uint8Array | null;
  /** The whole open document as work, after a write of the work failed. */
  readonly wholeWork: () => Uint8Array;
  /** The state vector of the open document, or `null` when it is closed. */
  readonly stateVector: () => Uint8Array | null;
  /** Whether a stored document holds every change that a vector names. */
  readonly holds: (stored: Uint8Array, vector: Uint8Array) => boolean;
  /** How many changes the person made, which counts names as well. */
  readonly sequence: () => number;
  /** The draft that the store would write now, with no vector. */
  readonly draft: (deleted: boolean) => Draft;
  /** The write of the start of the document, which every write follows. */
  readonly started: () => Promise<void>;
  readonly append: (work: Uint8Array) => Promise<void>;
  readonly merge: (work: Uint8Array) => Promise<void>;
  readonly saveDraft: (draft: Draft) => Promise<void>;
  readonly checkpoint: (draft: Draft) => Promise<QueueEntry | null>;
  /** Asks for a draft write now, outside a version. */
  readonly draftOwed: () => void;
  /** Runs `run` on the next frame and answers how to cancel it. */
  readonly frame: (run: () => void) => () => void;
};

/** What one version did. */
export type VersionOutcome =
  | {
      readonly kind: 'written';
      readonly entry: QueueEntry | null;
      readonly draft: Draft;
    }
  | { readonly kind: 'failed'; readonly failure: unknown };

/** The writes of one open editor. */
export type NoteWork = {
  /** States a change of the person. Its work goes on the next frame. */
  readonly changed: () => void;
  /** Appends the work that waits now. Settles with every append so far. */
  readonly flush: () => Promise<void>;
  /** Writes the draft after the work that it names. Throws a store failure. */
  readonly writeDraft: (deleted: boolean) => Promise<Draft>;
  /** Writes the work and freezes a version of the document. */
  readonly version: () => Promise<VersionOutcome>;
  /** The sequence of the last version, or `null` before the first. */
  readonly versionedSequence: () => number | null;
  /** Whether a write of the work failed and no whole write repaired it. */
  readonly lost: () => boolean;
  /**
   * The state vector of the changes that the store took, or `null` before
   * the first. A read of the stored document takes it before it starts.
   */
  readonly takenMark: () => Uint8Array | null;
  /**
   * States the stored document that a read found, which started after
   * `mark` was taken. A document that lacks a change of the mark lost work
   * of this editor, so the next version writes the whole document.
   */
  readonly readStored: (stored: Uint8Array, mark: Uint8Array | null) => void;
  /** States that the store holds none of this work: a new generation. */
  readonly storeLacksWork: () => void;
  /** Cancels the frame that waits. The work stays for a later flush. */
  readonly stop: () => void;
  readonly frozen: () => boolean;
  readonly freeze: () => void;
  readonly saveForAccess: (
    deleted: boolean,
    checkpoint: Promise<unknown> | null,
  ) => Promise<void>;
};

/** Builds the writes of one open editor. */
export function createNoteWork(ports: NoteWorkPorts): NoteWork {
  let appends: Promise<void> = Promise.resolve();
  // Each loss of work counts once, and a whole write repairs every loss
  // that it saw begin. A loss that begins while that write runs stays.
  let losses = 0;
  let repaired = 0;
  const isLost = (): boolean => losses > repaired;
  let taken: Uint8Array | null = null;
  let cancelFrame: (() => void) | null = null;
  let versioned: number | null = null;
  let frozen = false;
  const drafts = new Set<Promise<unknown>>();

  /** Takes the work that waits and appends it. Settles with every append. */
  const flush = (): Promise<void> => {
    cancelFrame?.();
    cancelFrame = null;
    // After a loss the work waits in the editor, because it can build on
    // the work that the store lacks. The whole document of the next version
    // holds it, and the next take after that writes it again, which changes
    // nothing that the store already holds.
    if (frozen || isLost()) return appends;
    const work = ports.takeWork();
    if (work === null) return appends;
    // The vector names this work and every change before it.
    const vector = ports.stateVector();
    const lossesBefore = losses;
    // The append starts at once, so the key is on the disk one frame after
    // it reached the editor (record 0175). The store runs the appends in
    // the order they start.
    const written = ports
      .started()
      .then(() => ports.append(work))
      .then(
        () => {
          if (vector !== null && losses === lossesBefore) taken = vector;
        },
        () => {
          // A version would freeze a document without this work. The next
          // version writes the whole document first, which merges in every
          // missing change.
          losses += 1;
        },
      );
    appends = Promise.all([appends, written]).then(() => undefined);
    return appends;
  };

  const freeze = (): void => {
    cancelFrame?.();
    cancelFrame = null;
    frozen = true;
  };
  return {
    frozen: () => frozen,
    freeze,
    async saveForAccess(deleted, checkpoint) {
      const flushed = flush();
      freeze();
      const draft = ports.draft(deleted);
      const vector = ports.stateVector();
      await Promise.allSettled([flushed, checkpoint, ...drafts]);
      await ports.saveDraft(
        isLost() || vector === null
          ? draft
          : { ...draft, documentVector: vector },
      );
    },
    changed: () => {
      if (frozen || cancelFrame !== null) return;
      cancelFrame = ports.frame(() => {
        cancelFrame = null;
        void flush();
      });
    },
    flush,
    writeDraft(deleted) {
      // The text and the vector come from one moment, after the take, so
      // the appends that the draft waits for hold every change it names.
      const settled = flush();
      const draft = ports.draft(deleted);
      const vector = ports.stateVector();
      if (frozen) return Promise.resolve(draft);
      const writing = settled.then(async () => {
        const stated =
          isLost() || vector === null
            ? draft
            : { ...draft, documentVector: vector };
        await ports.saveDraft(stated);
        return stated;
      });
      drafts.add(writing);
      const forget = (): void => {
        drafts.delete(writing);
      };
      void writing.then(forget, forget);
      return writing;
    },
    version: async () => {
      const settled = flush();
      let claimed = ports.sequence();
      const vector = ports.stateVector();
      // The whole document of a known loss is read now, while the document
      // is open: the end of the screen releases it before the write runs.
      const known = isLost()
        ? { whole: ports.wholeWork(), losses, sequence: ports.sequence() }
        : null;
      await settled;
      await ports.started();
      if (isLost()) {
        try {
          const repair = known ?? {
            whole: ports.wholeWork(),
            losses,
            sequence: ports.sequence(),
          };
          await ports.merge(repair.whole);
          repaired = Math.max(repaired, repair.losses);
          // The whole document holds every change up to its read, so this
          // version claims them.
          claimed = repair.sequence;
        } catch (failure: unknown) {
          ports.draftOwed();
          return { kind: 'failed', failure };
        }
      }
      // A key that arrived while the work was written is in the buffer and
      // not in the stored document, so the draft states no vector for it.
      const draft = ports.draft(false);
      const stated =
        ports.sequence() === claimed && vector !== null && !isLost()
          ? { ...draft, documentVector: vector }
          : draft;
      try {
        const entry = await ports.checkpoint(stated);
        versioned = claimed;
        // A checkpoint that wrote no version wrote no draft either.
        if (entry === null) ports.draftOwed();
        return { kind: 'written', entry, draft: stated };
      } catch (failure: unknown) {
        ports.draftOwed();
        return { kind: 'failed', failure };
      }
    },
    versionedSequence: () => versioned,
    lost: isLost,
    takenMark: () => taken,
    readStored: (stored, mark) => {
      if (mark !== null && !ports.holds(stored, mark)) losses += 1;
    },
    storeLacksWork: () => {
      losses += 1;
    },
    stop: () => {
      cancelFrame?.();
      cancelFrame = null;
    },
  };
}

/**
 * What the open editor of `workingCopyId` reads after a store change.
 *
 * The work that this editor wrote is in its document already, so its own
 * document change asks for nothing. The work of every other writer joins
 * the document, also of another editor of the same note in this tab, which
 * a mark of the tab alone skipped (record 0175). A draft never touches the
 * document, so it asks only for the save state.
 */
export function readAfterChange(
  change: LocalChange,
  workingCopyId: string,
): 'none' | 'state' | 'join' {
  if (change.kind === 'document')
    return change.writer === workingCopyId ? 'none' : 'join';
  return change.kind === 'draft' ? 'state' : 'join';
}
