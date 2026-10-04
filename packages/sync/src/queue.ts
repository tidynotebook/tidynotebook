/**
 * Submission of queued mutations in parent order.
 *
 * The design fixes three rules that this module implements:
 *
 * - A mutation's identity and body freeze on first send. A retry after a lost
 *   answer repeats the same operation instead of writing a second one. The
 *   frozen request digest is recorded through `LocalStore.markSending`, which
 *   keeps the first value it sees.
 * - Checkpoints created offline form chains. The leading run of never-sent
 *   entries is submitted as one atomic changeset under the first mutation
 *   identity, so a file edited twice offline commits both revisions together
 *   instead of conflicting with itself. An entry that was already sent is
 *   always retried alone under its frozen identity.
 * - A permanent server failure is kept locally instead of being dropped or
 *   retried forever. The single-user server rebases a stale save itself. The
 *   entry is parked, and its text is also written into the account-bound
 *   recovery area, so a screen can list it and offer a retry. No later save
 *   builds on a parked one, and a later save that carries all of its work
 *   supersedes it (record 0183, `parked.ts`).
 *
 * This module is transport agnostic: the caller injects `QueueNetwork`, and
 * the engine builds it from the generated client. Unit tests inject stubs.
 */
import type {
  AcceptedChangeset,
  ChangesetInput,
  NoteRefusal,
} from '@notesapp/core';
import { generateUUID } from '@notesapp/core';
import type { Draft, LocalStore, QueueEntry } from './local-port.ts';
import { createNote } from './create-note.ts';
import type { ProtocolFit } from './protocol.ts';

/** A stable service failure: HTTP status, application code, and file IDs. */
export type Problem = {
  readonly status: number;
  readonly code: string;
  readonly fileIds: readonly string[];
  /** The limit of the grammar that refused a note (record 0182). */
  readonly noteRefusal?: NoteRefusal;
};

/** The outcome of one service call: a value or a stable problem. */
export type ServiceOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: Problem };

/** The outcome of one changeset submission. */
export type CommitResult = ServiceOutcome<AcceptedChangeset>;

/**
 * What submission needs from the network.
 *
 * `prepareCommit` computes the request digest of the exact body that `commit`
 * sends, so the queue can freeze it before the first send. Both functions
 * must build byte-identical bodies from the same input.
 */
export type QueueNetwork = {
  prepareCommit(input: ChangesetInput): Promise<string>;
  commit(input: ChangesetInput, signal: AbortSignal): Promise<CommitResult>;
  /**
   * What the server knows about one mutation identity and request digest.
   *
   * The queue reads it before it changes work that an earlier release may
   * already have sent (records 0084, 0088).
   */
  mutationReceipt(
    mutationId: string,
    digest: string,
    signal: AbortSignal,
  ): Promise<
    ServiceOutcome<{
      readonly status: 'accepted' | 'absent' | 'other_request';
      readonly accepted: AcceptedChangeset | null;
    }>
  >;
};

/** A state change the sync run announces. Tab messages only announce. */
export type SyncNotice =
  | {
      readonly kind: 'pushed';
      readonly mutationIds: readonly string[];
      readonly fileIds: readonly string[];
    }
  | {
      readonly kind: 'preserved';
      readonly mutationId: string;
      readonly code: string;
      readonly fileIds: readonly string[];
    }
  | {
      readonly kind: 'superseded';
      readonly fileId: string;
      readonly path: string;
    }
  | {
      readonly kind: 'delete-refused';
      readonly fileId: string;
      readonly path: string;
    }
  | {
      readonly kind: 'retry';
      readonly attempt: number;
      readonly delayMs: number;
    }
  | { readonly kind: 'snapshot-restart'; readonly reason: string }
  | { readonly kind: 'snapshot-activated'; readonly count: number }
  | { readonly kind: 'changes-applied'; readonly count: number }
  /**
   * Sync waits for the person of this engine. `session` means the session
   * ended. `other-account` means another account signed in on this browser,
   * and the queue waits for its own account (record 0113).
   */
  | {
      readonly kind: 'paused';
      readonly reason: 'session' | 'other-account';
    }
  | { readonly kind: 'access-lost' }
  /**
   * The server refused a save because the account is locked (record 0201).
   * The save waits in the queue, and the screen reads the account again.
   */
  | { readonly kind: 'account-locked' }
  /** The session serves this engine again after a pause or a lost access. */
  | { readonly kind: 'resumed' }
  | { readonly kind: 'lease-held' }
  | { readonly kind: 'lease-lost' }
  /**
   * The capability read changed how this client stands against the server.
   * Only a change is announced, so `compatible` follows an earlier misfit.
   */
  | { readonly kind: 'protocol'; readonly fit: ProtocolFit }
  | { readonly kind: 'cycle-error'; readonly code: string };

/** What submission and download need from their environment. */
export type SyncContext = {
  /**
   * The engine that runs this pass, which owns the snapshot it stages, so a
   * staging never removes a plan of another engine (record 0176).
   */
  readonly owner?: string | undefined;
  readonly signal: AbortSignal;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly random: () => number;
  readonly id: () => string;
  readonly announce: (notice: SyncNotice) => void;
};

/**
 * The code of a failure that never reached the server.
 *
 * A request that no server answered has no status, so the engine gives it
 * this code. The interface reads it to tell a lost connection apart from a
 * refusal, because the two need two different sentences and a browser can
 * report that it is online while the connection is already dead.
 */
export const transportFailedCode = 'transport_failed';

/** How one push run ended. `deferred` means transport failed; retry later. */
export type PushOutcome = 'done' | 'deferred' | 'paused' | 'access-lost';

/**
 * Brings the local accepted state up to date.
 *
 * The engine passes its own download run. A refused precondition means that
 * the local view of the accepted heads is old, so the queue reads the server
 * again before it decides what to do with the refused mutation.
 */
export type PullChanges = () => Promise<PushOutcome>;

/**
 * A failure the engine must not swallow into a queue entry.
 *
 * Unexpected service answers and exhausted transports surface here. The
 * engine announces them and backs off; the queued work stays untouched.
 */
export class SyncFailedError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(`notesapp sync failed: ${code}`);
    this.name = 'SyncFailedError';
    this.code = code;
    this.status = status;
  }
}

/**
 * A download that must start over from a fresh snapshot.
 *
 * An expired snapshot token, a purged revision met mid-download, and an
 * expired change cursor all land here. Local work is never part of the
 * restart: staging and activation keep it intact.
 */
export class SnapshotRestartNeeded extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`notesapp snapshot restart: ${reason}`);
    this.name = 'SnapshotRestartNeeded';
    this.reason = reason;
  }
}

/** The base delay of the backoff schedule, in milliseconds. */
export const backoffBaseMs = 500;

/** The largest single backoff delay, in milliseconds. */
export const backoffCapMs = 8000;

/** How many times one service call is attempted before a cycle gives up. */
export const maxAttempts = 4;

/**
 * One bounded exponential backoff delay with jitter.
 *
 * `attempt` counts the failures so far, starting at zero. The delay doubles
 * per attempt from the base, never passes the cap, and carries up to 500 ms
 * of jitter so two devices do not retry in lockstep.
 */
export function backoffDelay(attempt: number, random: () => number): number {
  const grown = backoffBaseMs * 2 ** Math.max(0, attempt);
  return Math.min(backoffCapMs, grown) + Math.floor(random() * 500);
}

/** Whether an HTTP status is worth retrying within one run. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/** Whether a thrown failure is a caller cancellation. */
function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Runs one service call with bounded backoff for transport failures.
 *
 * A retryable HTTP status and a thrown transport failure both wait out a
 * bounded delay and try again. A cancellation propagates at once. Returns
 * `null` when every attempt failed without an answer the caller can act on,
 * so the cycle ends and a later cycle retries.
 */
export async function sendWithRetry<T>(
  ctx: SyncContext,
  run: (signal: AbortSignal) => Promise<ServiceOutcome<T>>,
): Promise<ServiceOutcome<T> | null> {
  for (let attempt = 0; ; attempt += 1) {
    let outcome: ServiceOutcome<T>;
    try {
      outcome = await run(ctx.signal);
    } catch (error: unknown) {
      if (ctx.signal.aborted || isCancellation(error)) throw error;
      if (attempt + 1 >= maxAttempts) return null;
      const delayMs = backoffDelay(attempt, ctx.random);
      ctx.announce({ kind: 'retry', attempt: attempt + 1, delayMs });
      await ctx.sleep(delayMs, ctx.signal);
      continue;
    }
    if (outcome.ok) return outcome;
    if (!isRetryableStatus(outcome.problem.status)) return outcome;
    if (attempt + 1 >= maxAttempts) return null;
    const delayMs = backoffDelay(attempt, ctx.random);
    ctx.announce({ kind: 'retry', attempt: attempt + 1, delayMs });
    await ctx.sleep(delayMs, ctx.signal);
  }
}

/** Whether the server refused a save because the account is locked. */
function isLockedRefusal(problem: Problem): boolean {
  return problem.status === 423 || problem.code === 'account_locked';
}

/** What one failed submission asks the queue to do next. */
type SubmissionAction = 'preserve' | 'leave' | 'paused' | 'access-lost';

/**
 * Classifies one failed submission.
 *
 * A quota failure stays queued for a later cycle because space may appear,
 * and so does the refusal of a locked account, because the account may
 * become active again (record 0201). Anything else the server can never accept is preserved as a conflict so it
 * is neither dropped nor retried forever. A refused precondition reaches
 * `preserve` as well, and `submitSingle` recovers it before it parks the
 * entry.
 */
function submissionAction(problem: Problem): SubmissionAction {
  if (problem.status === 401) return 'paused';
  if (problem.status === 403 || problem.status === 404) return 'access-lost';
  if (problem.status === 413) return 'leave';
  if (isLockedRefusal(problem)) return 'leave';
  return 'preserve';
}

/**
 * Parks one refused mutation and keeps its text where a screen can list it.
 *
 * Parking alone is not enough. A parked entry is never sent again, so its
 * text would live only in an IndexedDB row that nothing reads. The
 * account-bound recovery area is the place the Needs attention list reads,
 * so the person can retry the save, keep the text as a new note, copy it, or
 * discard it on purpose.
 *
 * The server answer code travels with the record, and so does the limit of
 * the grammar that refused a note, so the interface names that cause. The
 * interface maps a known code to one sentence and falls back to a general
 * sentence for a code it does not know, so a new refusal reason needs no
 * change here.
 *
 * The caller announces the notice, because only the caller knows which files
 * the refusal named.
 */
export async function parkRefusedSave(
  local: LocalStore,
  accountId: string,
  entry: QueueEntry,
  code: string,
  noteRefusal: NoteRefusal | null = null,
): Promise<void> {
  const workspaceId = entry.input.workspaceId;
  await local.markConflict(accountId, entry.input.mutationId, {
    errorCode: code,
  });
  for (const revision of entry.input.revisions) {
    if (revision.content.kind !== 'markdown') continue;
    // The save carries work, so its text comes from the checkpoint that
    // froze it. A checkpoint that this device no longer holds keeps nothing
    // to show, and the entry stays parked with its reason.
    const text = await local.readRevisionText(
      accountId,
      workspaceId,
      revision.id,
    );
    if (text === null) continue;
    await local.addRecovery(accountId, workspaceId, {
      fileId: revision.fileId,
      path: revision.path,
      text,
      reason: 'save_refused',
      code,
      noteRefusal,
      mutationId: entry.input.mutationId,
    });
  }
}

/**
 * Announces every head that the server rebased for one submission.
 *
 * The answer of an accepted changeset names the heads that it passed. Each
 * one means that text saved elsewhere is now only in the history of that
 * file, so the person gets one notice per file rather than a silent replace.
 */
function announceSuperseded(
  ctx: SyncContext,
  input: ChangesetInput,
  accepted: AcceptedChangeset,
): void {
  for (const entry of accepted.superseded) {
    const revision =
      accepted.revisions.find(
        (candidate) => candidate.revisionId === entry.acceptedRevisionId,
      ) ??
      input.revisions.find((candidate) => candidate.fileId === entry.fileId);
    ctx.announce({
      kind: 'superseded',
      fileId: entry.fileId,
      path: revision?.path ?? '',
    });
  }
}

/** The path that one queued mutation gave the named file. */
function pathOf(input: ChangesetInput, fileId: string): string {
  const revisions = input.revisions.filter(
    (revision) => revision.fileId === fileId,
  );
  return revisions[revisions.length - 1]?.path ?? '';
}

/** The files of one entry that the server named in its refusal. */
function refusedFiles(entry: QueueEntry, problem: Problem): readonly string[] {
  const own = new Set(entry.input.revisions.map((revision) => revision.fileId));
  const named = problem.fileIds.filter((fileId) => own.has(fileId));
  return named.length > 0 ? named : [...own];
}

/**
 * A free path for a recovered note, beside the note it came from.
 *
 * The path keeps the folder and the `.md` suffix and adds `(recovered)` to the
 * name. When that name is taken, a number is added, so the recovered note never
 * lands on a live note. `taken` holds every path that the server holds or may
 * hold (record 0184), and two paths that differ only in case are one name, as
 * every other free name of the application reads them.
 */
export function recoveredNotePath(
  path: string,
  taken: readonly string[],
): string {
  const held = new Set(taken.map((candidate) => candidate.toLowerCase()));
  const suffix = path.endsWith('.md') ? '.md' : '';
  const stem = path.slice(0, path.length - suffix.length);
  for (let attempt = 1; ; attempt += 1) {
    const label =
      attempt === 1 ? ' (recovered)' : ` (recovered ${String(attempt)})`;
    const candidate = `${stem}${label}${suffix}`;
    if (!held.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Keeps the text of a refused save as a new note.
 *
 * A save is refused for good when the note it edits was deleted on another
 * device. The edit is the later write, so it is kept as a separate note rather
 * than lost or parked in a second inbox. The new note is a normal local save,
 * so the engine sends it like any other.
 */
async function keepAsRecoveredNote(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  path: string,
  text: string,
): Promise<void> {
  const held = await local.listHeldPaths(accountId, workspaceId);
  const taken = held.map((entry) => entry.path);
  const draft: Draft = {
    accountId,
    workspaceId,
    workingCopyId: generateUUID(),
    fileId: generateUUID(),
    baseRevisionId: null,
    text,
    path: recoveredNotePath(path, taken),
    deleted: false,
    sequence: 1,
  };
  await createNote(local, draft);
}

/**
 * Recovers one queued mutation that the server refused with a stale head.
 *
 * The accepted state is read again first, because a refused precondition
 * means the local view of the heads is old. Then the shape of the refusal
 * decides, and each case ends the recovery of this entry:
 *
 * - The mutation deletes the file. The server refuses a stale deletion so
 *   that it cannot remove text that this device never saw. Repeating it can
 *   never help, so the entry and its local tombstone are dropped and the
 *   person is told that the note stays.
 * - The mutation updates a file that already had an accepted head. The
 *   workspace rebases every other stale update, so the only remaining reason
 *   is a head that is now a tombstone. The entry is parked as a conflict with
 *   the reason `deleted_remotely`, so the text is kept for the person to
 *   place again.
 * - Anything else, for example a create that found an existing head. The
 *   precondition moves to the current accepted head and the mutation is sent
 *   once more.
 */
async function recoverStaleHead(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: QueueNetwork,
  ctx: SyncContext,
  pull: PullChanges,
  entry: QueueEntry,
  problem: Problem,
): Promise<PushOutcome> {
  const pulled = await pull();
  if (pulled !== 'done') return pulled;
  const files = refusedFiles(entry, problem);
  const tips = new Map<string, boolean>();
  for (const revision of entry.input.revisions)
    tips.set(revision.fileId, revision.deleted);

  const deletion = files.find((fileId) => tips.get(fileId) === true);
  if (deletion !== undefined) {
    await local.discardQueueEntry(accountId, entry.input.mutationId);
    ctx.announce({
      kind: 'delete-refused',
      fileId: deletion,
      path: pathOf(entry.input, deletion),
    });
    return 'done';
  }

  const updated = files.find(
    (fileId) => (entry.input.expectedHeads[fileId] ?? null) !== null,
  );
  if (updated !== undefined) {
    // The note was deleted on another device, so this edit cannot apply to it.
    // The edit is the later write, so it is kept as a new note rather than
    // parked in a second inbox. A markdown revision carries the text; any other
    // kind holds none to keep.
    const revision = entry.input.revisions.find(
      (candidate) => candidate.fileId === updated,
    );
    if (revision !== undefined && revision.content.kind === 'markdown') {
      const text = await local.readRevisionText(
        accountId,
        workspaceId,
        revision.id,
      );
      if (text !== null)
        await keepAsRecoveredNote(
          local,
          accountId,
          workspaceId,
          revision.path,
          text,
        );
    }
    await local.discardQueueEntry(accountId, entry.input.mutationId);
    ctx.announce({
      kind: 'preserved',
      mutationId: entry.input.mutationId,
      code: 'deleted_remotely',
      fileIds: [...files],
    });
    return 'done';
  }

  const heads: Record<string, string | null> = {};
  for (const fileId of files) {
    const snapshot = await local.readFileSaveSnapshot(
      accountId,
      workspaceId,
      fileId,
    );
    heads[fileId] = snapshot.acceptedHeadRevisionId;
  }
  const moved = await local.reparentQueueEntry(
    accountId,
    entry.input.mutationId,
    heads,
  );
  if (moved === null) return 'done';
  return submitSingle(local, accountId, workspaceId, net, ctx, pull, moved, {
    recoverStale: false,
  });
}

/** The most entries combined into one atomic changeset submission. */
const maxBatchEntries = 100;

/** The most files one combined changeset submission may change. */
const maxBatchFiles = 1000;

/**
 * The leading run of never-sent entries that one changeset can carry.
 *
 * Only `pending` entries combine: a `sending` entry already froze its
 * identity and must be retried alone. Entries after the first gap stay for
 * the next pass, so one poisoned entry cannot pin the whole queue.
 *
 * The revisions of one file in one changeset must form one chain, each naming
 * the one before it (`packages/core/src/files/graph.ts`). Two open tabs of one
 * note are two working copies with a chain each, so the run ends before an
 * entry that would start a second chain for a file. The server refused such a
 * run as a whole, and each save of it then waited for a retry alone.
 */
export function takeBatchable(entries: readonly QueueEntry[]): QueueEntry[] {
  const batch: QueueEntry[] = [];
  let files = new Set<string>();
  /** The last revision of each file in the run. */
  let tips = new Map<string, string>();
  for (const entry of entries) {
    if (entry.state !== 'pending' || batch.length >= maxBatchEntries) break;
    const next = new Set(files);
    const nextTips = new Map(tips);
    let continues = true;
    for (const revision of entry.input.revisions) {
      next.add(revision.fileId);
      const tip = nextTips.get(revision.fileId);
      if (tip !== undefined && !revision.parents.includes(tip))
        continues = false;
      nextTips.set(revision.fileId, revision.id);
    }
    if (next.size > maxBatchFiles || !continues) break;
    files = next;
    tips = nextTips;
    batch.push(entry);
  }
  return batch;
}

/**
 * Places the work of release 0.4, or states why the queue must wait.
 *
 * Record 0084 forbids a change of work that may already have committed, so
 * each moved save that 0.4 sent is settled by its receipt first: an accepted
 * save is never sent again, and an absent one becomes unsent work. The store
 * then places what it can. A note that only this device holds needs nothing
 * from the server. Any other note needs its document, which only a snapshot
 * brings after the upgrade, so the queue reads the server and places again.
 * The answer is `waiting` while any moved work remains, and the caller then
 * sends nothing, because a later save can depend on an earlier one (record
 * 0088).
 */
async function placeEarlierWork(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: QueueNetwork,
  ctx: SyncContext,
  pull: PullChanges,
): Promise<PushOutcome | 'waiting'> {
  const moved = await local.legacySaves(accountId, workspaceId);
  for (const save of moved) {
    if (save.state !== 'sending' || save.digest === null) continue;
    const { digest } = save;
    const answer = await sendWithRetry(ctx, (signal) =>
      net.mutationReceipt(save.mutationId, digest, signal),
    );
    if (answer === null) return 'deferred';
    if (!answer.ok) {
      if (answer.problem.status === 401) return 'paused';
      if (answer.problem.status === 403 || answer.problem.status === 404)
        return 'access-lost';
      throw new SyncFailedError(answer.problem.code, answer.problem.status);
    }
    const { status, accepted } = answer.value;
    await local.settleLegacySave(
      accountId,
      save.mutationId,
      status === 'accepted' && accepted !== null
        ? { kind: 'accepted', result: accepted }
        : status === 'other_request'
          ? { kind: 'other-request' }
          : { kind: 'absent' },
    );
  }
  let placed = await local.placeLegacyWork(accountId, workspaceId);
  if (
    placed.waiting > 0 &&
    (await local.readCursor(accountId, workspaceId)) === null
  ) {
    const pulled = await pull();
    if (pulled !== 'done') return pulled;
    placed = await local.placeLegacyWork(accountId, workspaceId);
  }
  return placed.waiting > 0 ? 'waiting' : 'done';
}

/**
 * Submits every queued mutation of one workspace, in parent order.
 *
 * Returns `paused` when the session expired and `access-lost` when the
 * workspace no longer accepts this account's writes. Both stop the cycle;
 * the engine decides whether reads may continue.
 */
export async function pushQueue(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: QueueNetwork,
  ctx: SyncContext,
  pull: PullChanges,
): Promise<PushOutcome> {
  const placed = await placeEarlierWork(
    local,
    accountId,
    workspaceId,
    net,
    ctx,
    pull,
  );
  if (placed === 'waiting') return 'done';
  if (placed !== 'done') return placed;
  const entries = await local.pending(accountId, workspaceId);
  const work = entries.filter((entry) => entry.state !== 'conflict');
  if (work.length === 0) return 'done';
  const head = work[0];
  if (head === undefined) return 'done';
  if (head.state === 'sending')
    return submitSingle(local, accountId, workspaceId, net, ctx, pull, head);
  const batch = takeBatchable(work);
  if (batch.length <= 1)
    return submitSingle(local, accountId, workspaceId, net, ctx, pull, head);
  return submitBatch(local, accountId, workspaceId, net, ctx, pull, batch);
}

/**
 * Submits the leading pending run as one atomic changeset.
 *
 * The combined body travels under the first mutation identity with the
 * first entry's preconditions per file, and the revisions stay in parent
 * order. When the server accepts, every entry is acknowledged with its exact
 * accepted revision IDs. When the combined write fails for a reason that
 * names no single entry, each entry is submitted alone so the healthy ones
 * still commit and only the true conflict branches.
 */
async function submitBatch(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: QueueNetwork,
  ctx: SyncContext,
  pull: PullChanges,
  batch: readonly QueueEntry[],
): Promise<PushOutcome> {
  const first = batch[0];
  if (first === undefined) return 'done';
  const expectedHeads: Record<string, string | null> = {};
  for (const entry of batch) {
    for (const [fileId, head] of Object.entries(entry.input.expectedHeads)) {
      if (!(fileId in expectedHeads)) expectedHeads[fileId] = head;
    }
  }
  const body: ChangesetInput = {
    workspaceId,
    mutationId: first.input.mutationId,
    deviceId: first.input.deviceId,
    expectedHeads,
    revisions: batch.flatMap((entry) => entry.input.revisions),
  };
  const digest = await net.prepareCommit(body);
  await local.markSending(accountId, first.input.mutationId, digest);
  const outcome = await sendWithRetry(ctx, (signal) =>
    net.commit(body, signal),
  );
  if (outcome === null) return 'deferred';
  if (outcome.ok) {
    let offset = 0;
    for (const entry of batch) {
      const count = entry.input.revisions.length;
      const revisionIds = outcome.value.revisionIds.slice(
        offset,
        offset + count,
      );
      const revisions = outcome.value.revisions.slice(offset, offset + count);
      offset += count;
      await local.acknowledge(accountId, {
        mutationId: entry.input.mutationId,
        revisionIds,
        revisions,
        cursor: outcome.value.cursor,
        superseded: outcome.value.superseded.filter((moved) =>
          entry.input.revisions.some(
            (revision) => revision.fileId === moved.fileId,
          ),
        ),
      });
    }
    announceSuperseded(ctx, body, outcome.value);
    ctx.announce({
      kind: 'pushed',
      mutationIds: batch.map((entry) => entry.input.mutationId),
      fileIds: [
        ...new Set(
          batch.flatMap((entry) =>
            entry.input.revisions.map((revision) => revision.fileId),
          ),
        ),
      ],
    });
    return 'done';
  }
  const action = submissionAction(outcome.problem);
  if (action === 'paused') return 'paused';
  if (action === 'access-lost') return 'access-lost';
  if (isLockedRefusal(outcome.problem))
    ctx.announce({ kind: 'account-locked' });
  if (action === 'leave') return 'done';
  for (const sent of batch) {
    // Each entry is read again, because the answer to the one before it can
    // change it: a parked save moves its unsent children to its own parent,
    // and an accepted save removes the parked saves it carries (record 0183).
    const entries = await local.pending(accountId, workspaceId);
    const entry = entries.find(
      (candidate) => candidate.input.mutationId === sent.input.mutationId,
    );
    if (entry === undefined || entry.state === 'conflict') continue;
    const single = await submitSingle(
      local,
      accountId,
      workspaceId,
      net,
      ctx,
      pull,
      entry,
    );
    if (single !== 'done') return single;
  }
  return 'done';
}

/**
 * Submits one entry under its own identity and acknowledges it exactly.
 *
 * An entry that already froze its digest is retried with the same body, so a
 * lost answer replays the same operation and the server answers from its
 * stored receipt.
 */
async function submitSingle(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  net: QueueNetwork,
  ctx: SyncContext,
  pull: PullChanges,
  entry: QueueEntry,
  options: { readonly recoverStale: boolean } = { recoverStale: true },
): Promise<PushOutcome> {
  const input = entry.input;
  const digest = entry.digest ?? (await net.prepareCommit(input));
  await local.markSending(accountId, input.mutationId, digest);
  const outcome = await sendWithRetry(ctx, (signal) =>
    net.commit(input, signal),
  );
  if (outcome === null) return 'deferred';
  if (outcome.ok) {
    await local.acknowledge(accountId, {
      mutationId: input.mutationId,
      revisionIds: [...outcome.value.revisionIds],
      revisions: [...outcome.value.revisions],
      cursor: outcome.value.cursor,
      superseded: [...outcome.value.superseded],
    });
    announceSuperseded(ctx, input, outcome.value);
    ctx.announce({
      kind: 'pushed',
      mutationIds: [input.mutationId],
      fileIds: [...new Set(input.revisions.map((revision) => revision.fileId))],
    });
    return 'done';
  }
  const action = submissionAction(outcome.problem);
  if (action === 'paused') return 'paused';
  if (action === 'access-lost') return 'access-lost';
  if (isLockedRefusal(outcome.problem))
    ctx.announce({ kind: 'account-locked' });
  if (action === 'leave') return 'done';
  // A purged file is gone on the server for good. Its queued mutation can never
  // apply, and keeping the mutation, or its text as a recovery copy, would put
  // a permanently deleted note in front of the person again. Forget every local
  // trace of the file instead of parking it.
  if (outcome.problem.code === 'purged') {
    await local.forgetPurgedFiles(
      accountId,
      workspaceId,
      refusedFiles(entry, outcome.problem),
    );
    return 'done';
  }
  // A refused precondition is not a permanent failure. The workspace refuses
  // it only where a rebase would remove content, so the client reads the
  // accepted state and decides per case. One recovery per entry per run: a
  // resent mutation is never recovered again in the same pass.
  if (outcome.problem.code === 'stale_head' && options.recoverStale)
    return recoverStaleHead(
      local,
      accountId,
      workspaceId,
      net,
      ctx,
      pull,
      entry,
      outcome.problem,
    );
  await parkRefusedSave(
    local,
    accountId,
    entry,
    outcome.problem.code,
    outcome.problem.noteRefusal ?? null,
  );
  ctx.announce({
    kind: 'preserved',
    mutationId: input.mutationId,
    code: outcome.problem.code,
    fileIds: [...new Set(input.revisions.map((revision) => revision.fileId))],
  });
  return 'done';
}
