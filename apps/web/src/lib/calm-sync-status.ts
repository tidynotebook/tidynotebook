/**
 * The calm sync line of the sidebar footer.
 *
 * The footer tells a person whether their work is on the server. Typing
 * makes short pending periods all the time, and a line that followed each
 * of them flipped on every keystroke. The editor uploads a version only once
 * a person pauses, so the wait counts from the latest edit: "Waiting to
 * upload" appears when work has waited `syncWaitGraceMs` after it, or
 * `syncWaitCapMs` in all. A lost connection shows at once, and a real
 * problem shows at once with its own line and dot.
 *
 * This decides only what the footer shows. Save, sync, the sign-out warning
 * and the unload guard read the pending facts themselves, at once.
 */
import { syncProblemLine } from './save-status-words.ts';
import { syncDot, type SyncDot, type SyncState } from './sync-state.ts';

/** How long work may wait for the server after the latest edit. */
export const syncWaitGraceMs = 4000;

/**
 * How long work may wait for the server in all, so a person who types
 * without a pause for a long time is not told that everything is saved.
 */
export const syncWaitCapMs = 30_000;

/** The facts the footer reads, all of them existing save facts. */
export type CalmSyncFacts = {
  readonly state: SyncState;
  readonly online: boolean;
  /** A write of the open note to this device failed. */
  readonly failed: boolean;
  /** The open note holds work that the server does not have yet. */
  readonly pending: boolean;
  /** A new edit of the open note is not on this device yet. */
  readonly editing: boolean;
};

/**
 * What the footer shows: one line and its dot.
 *
 * A quiet line always takes the muted `pending` dot, so a change between
 * saved and waiting is a change of words alone and never a flash of colour.
 * A problem keeps the dot of its state.
 */
export type CalmSyncView = {
  readonly line: string;
  readonly dot: SyncDot;
};

export const syncedLine = 'All changes saved';
export const waitingLine = 'Waiting to upload';
export const offlineLine = 'Offline. Saved on this device.';

/** Whether work waits for the server on a healthy connection. */
export function syncWorkPending(facts: CalmSyncFacts): boolean {
  return facts.pending || facts.editing || facts.state.kind !== 'in-step';
}

/**
 * The footer view for these facts. `waitedLong` states that pending work
 * has waited past the grace period or the cap.
 */
export function calmSyncView(
  facts: CalmSyncFacts,
  waitedLong: boolean,
): CalmSyncView {
  const problem = syncProblemLine({
    state: facts.state,
    failed: facts.failed,
  });
  if (problem !== null)
    return {
      line: problem,
      dot: facts.failed ? 'attention' : syncDot(facts.state, facts.online),
    };
  if (!facts.online || facts.state.kind === 'waiting')
    return { line: offlineLine, dot: 'pending' };
  if (syncWorkPending(facts) && waitedLong)
    return { line: waitingLine, dot: 'pending' };
  return { line: syncedLine, dot: 'pending' };
}

/**
 * Follows the facts over time and reports each change of the view once.
 *
 * A wait starts when work starts to wait and ends when the server has it.
 * Each new edit inside a wait starts the grace period again, and the cap
 * counts from the start of the wait. Once the footer says that work waits,
 * it keeps saying so until the server has the work.
 */
export function calmSyncTracker(
  initial: CalmSyncFacts,
  onChange: (view: CalmSyncView) => void,
): {
  readonly view: () => CalmSyncView;
  readonly update: (facts: CalmSyncFacts) => void;
  readonly dispose: () => void;
} {
  let facts = initial;
  let started: number | null = syncWorkPending(initial) ? Date.now() : null;
  let lastEdit: number | null = started;
  let waitedLong = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let shown = calmSyncView(facts, false);

  const emit = (): void => {
    if (started !== null && lastEdit !== null) {
      const now = Date.now();
      waitedLong ||=
        now - lastEdit >= syncWaitGraceMs || now - started >= syncWaitCapMs;
    }
    const next = calmSyncView(facts, waitedLong);
    if (next.line === shown.line && next.dot === shown.dot) return;
    shown = next;
    onChange(next);
  };
  const arm = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (started === null || lastEdit === null || waitedLong) return;
    const due = Math.min(lastEdit + syncWaitGraceMs, started + syncWaitCapMs);
    timer = setTimeout(
      () => {
        timer = null;
        emit();
        arm();
      },
      Math.max(0, due - Date.now()),
    );
  };
  arm();

  return {
    view: () => shown,
    update: (next) => {
      facts = next;
      const now = Date.now();
      if (!syncWorkPending(next)) {
        started = null;
        lastEdit = null;
        waitedLong = false;
      } else {
        started ??= now;
        if (next.editing || lastEdit === null) lastEdit = now;
      }
      emit();
      arm();
    },
    dispose: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
