/**
 * The calm sync line of the sidebar footer.
 *
 * The footer tells a person whether their work is on the server. Typing
 * makes short pending periods all the time, and a line that followed each
 * of them flipped on every keystroke. So a short wait on a healthy
 * connection keeps the visible text, and "Waiting to upload" appears only
 * after `syncWaitGraceMs`. A lost connection shows at once, and a real
 * problem shows at once with its own line and the attention dot.
 *
 * This decides only what the footer shows. Save, sync, the sign-out warning
 * and the unload guard read the pending facts themselves, at once.
 */
import { syncProblemLine } from './save-status-words.ts';
import { syncDot, type SyncDot, type SyncState } from './sync-state.ts';

/** How long work may wait for the server before the footer says so. */
export const syncWaitGraceMs = 4000;

/** The facts the footer reads, all of them existing save facts. */
export type CalmSyncFacts = {
  readonly state: SyncState;
  readonly online: boolean;
  /** A write of the open note to this device failed. */
  readonly failed: boolean;
  /** The open note holds work that the server does not have yet. */
  readonly pending: boolean;
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
  return facts.pending || facts.state.kind !== 'in-step';
}

/**
 * The footer view for these facts, after `waited` milliseconds of pending
 * work, or `null` milliseconds when nothing waits.
 */
export function calmSyncView(
  facts: CalmSyncFacts,
  waited: number | null,
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
  if (syncWorkPending(facts) && waited !== null && waited >= syncWaitGraceMs)
    return { line: waitingLine, dot: 'pending' };
  return { line: syncedLine, dot: 'pending' };
}

/**
 * Follows the facts over time and reports each change of the view once.
 *
 * The wait starts when work starts to wait and ends when the server has it.
 * More typing inside one wait does not start the wait again, so a person who
 * types for a long time on a slow connection does see "Waiting to upload".
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
  let since: number | null = syncWorkPending(initial) ? Date.now() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let shown = calmSyncView(facts, 0);

  const emit = (): void => {
    const next = calmSyncView(
      facts,
      since === null ? null : Date.now() - since,
    );
    if (next.line === shown.line && next.dot === shown.dot) return;
    shown = next;
    onChange(next);
  };
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const arm = (): void => {
    if (since === null || timer !== null) return;
    const left = Math.max(0, since + syncWaitGraceMs - Date.now());
    timer = setTimeout(() => {
      timer = null;
      emit();
    }, left);
  };
  arm();

  return {
    view: () => shown,
    update: (next) => {
      facts = next;
      if (!syncWorkPending(next)) {
        since = null;
        clear();
      } else if (since === null) {
        since = Date.now();
      }
      arm();
      emit();
    },
    dispose: clear,
  };
}
