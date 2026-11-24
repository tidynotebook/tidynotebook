/**
 * The foreground sync state machine.
 *
 * One run of the engine repeats the revision exchange of the design:
 *
 * 1. Hold the single worker lease, renewing it every cycle, or read the gate
 *    of the lease keeper that holds it for the tab (record 0130). Another tab
 *    with a live lease keeps this run from starting; an expired lease is
 *    taken over. Tab messages only announce these states.
 * 2. Verify the session and the workspace membership before touching data.
 *    An expired session pauses the run with drafts kept. A session of
 *    another account pauses the run too, because one browser profile holds
 *    one session cookie and the queue of this account must not go up with
 *    the cookie of another (record 0113). A lost membership stops reads and
 *    writes. A downgrade to viewer suspends writes while permitted reads
 *    continue, and resumes them when the role is restored.
 * 3. Read the sync protocol versions that the server serves. A client that
 *    does not fit sends nothing and pulls nothing, keeps every draft and
 *    queued save, and announces the misfit once (record 0086).
 * 4. Submit the queued mutations in parent order through `pushQueue`, which
 *    freezes each mutation on first send, batches unsent chains atomically,
 *    branches on stale heads, and preserves anything the server refuses.
 * 5. Pull the server state through `pullPages`: stage a snapshot, fetch its
 *    immutable revisions, activate only when complete, then consume ordered
 *    changes until an empty page. A dirty working copy is never replaced.
 * 6. Wait for the poll interval and repeat until the abort signal fires.
 *
 * Every application HTTP call below is a direct import of a generated
 * operation function. There is no handwritten transport: this module only
 * maps domain records to generated bodies and generated answers back to
 * domain outcomes.
 */
import { base64, bytesOfBase64 } from './bytes.ts';
import {
  commitChangeset,
  getAccount,
  getChanges,
  getMutationReceipt,
  getRevision,
  getSnapshotPage,
  getSnapshotRevisions,
  getSyncProtocol,
  startSnapshot,
  observeResponseProgress,
  type AcceptedChangeset as GeneratedAccepted,
} from '@notesapp/api-client';
import {
  generateUUID,
  requestDigest,
  syncProtocolVersion,
  type AcceptedChangeset,
  type ChangesetInput,
  type ContentRef,
} from '@notesapp/core';
import type { LocalStore } from './local-port.ts';
import { acquireWorkerLease, releaseWorkerLease } from './lease.ts';
import { isLocalStorageError } from './local-port.ts';
import {
  SyncFailedError,
  pushQueue,
  sendWithRetry,
  transportFailedCode,
  type PushOutcome,
  type QueueNetwork,
  type ServiceOutcome,
  type SyncContext,
  type SyncNotice,
} from './queue.ts';
import {
  pagesPerTurn,
  pullNew,
  pullPages,
  type SnapshotNetwork,
} from './snapshot.ts';
import {
  protocolFit,
  servedProtocolOfProblem,
  type ProtocolFit,
} from './protocol.ts';
import { toProblem } from './problem.ts';

/** The generated body of one submitted revision. */
function toRevisionBody(revision: ChangesetInput['revisions'][number]): {
  readonly revisionId: string;
  readonly fileId: string;
  readonly parents: string[];
  readonly path: string;
  readonly deleted: boolean;
  readonly content: ReturnType<typeof toContentBody>;
  readonly clientTime: string;
  readonly message: string | null;
  readonly restoredFrom: string | null;
} {
  const content = toContentBody(revision.content);
  return {
    revisionId: revision.id,
    fileId: revision.fileId,
    parents: [...revision.parents],
    path: revision.path,
    deleted: revision.deleted,
    content,
    clientTime: revision.clientTime,
    message: revision.message,
    restoredFrom: revision.restoredFrom,
  };
}

/**
 * The generated body of one content reference.
 *
 * A note carries the work of its save, its generation, and the complete state
 * that this device had seen. The server derives the text, so no save carries
 * text (record 0081). An attachment names finalized bytes as before.
 */
function toContentBody(content: ContentRef):
  | {
      readonly kind: 'markdown';
      readonly document: {
        readonly update: string | null;
        readonly epoch: number;
        readonly observed: string;
      };
    }
  | {
      readonly kind: 'attachment';
      readonly digest: string;
      readonly attachmentObjectId: string;
    } {
  if (content.kind === 'markdown') {
    const save = content.document;
    return {
      kind: 'markdown',
      document: {
        update: save.work.kind === 'update' ? base64(save.work.update) : null,
        epoch: save.epoch,
        observed: base64(save.observed ?? new Uint8Array()),
      },
    };
  }
  return {
    kind: 'attachment',
    digest: content.digest,
    attachmentObjectId: content.objectId,
  };
}

/**
 * What the engine needs from the network besides queue and snapshot reads.
 *
 * The session check runs before every cycle. A failed write followed by a
 * working read means a viewer downgrade; a failed read means lost access.
 */
export type SessionNetwork = {
  verifySession(
    signal: AbortSignal,
  ): Promise<ServiceOutcome<{ readonly accountId: string }>>;
};

/**
 * The capability read that runs before every push and pull.
 *
 * A failed read keeps its problem, because a legacy server is recognized by
 * the problem it answers for an unknown path.
 */
export type ProtocolNetwork = {
  syncProtocol(signal: AbortSignal): Promise<
    ServiceOutcome<{
      readonly versions: readonly number[];
      readonly snapshotRevisionBatches?: boolean;
    }>
  >;
};

/** Every network operation the engine runs, for injection in tests. */
export type EngineOperations = QueueNetwork &
  SnapshotNetwork &
  SessionNetwork &
  ProtocolNetwork;

/**
 * What one session check found.
 *
 * `other-account` means that the session of this browser belongs to another
 * account than the engine serves. `deferred` means that the check did not
 * reach an answer, and a later cycle asks again.
 */
type SessionCheck =
  'ok' | 'paused' | 'other-account' | 'access-lost' | 'deferred';

/** The session state that the engine announces when it changes. */
type SessionState = Exclude<SessionCheck, 'deferred'>;

/** Options of one engine. Everything except the store has a default. */
export type EngineOptions = {
  /** The worker identity recorded in the lease. A fresh ID by default. */
  readonly ownerId?: string;
  /** Extra headers of every request, for example the session cookie. */
  readonly headers?: () => Record<string, string>;
  /** Milliseconds since the Unix epoch. Defaults to the system clock. */
  readonly clock?: () => number;
  /** Randomness for backoff jitter. Defaults to `Math.random`. */
  readonly random?: () => number;
  /** Client generated identifiers. Defaults to `generateUUID`. */
  readonly id?: () => string;
  /** Abortable wait. Defaults to a timer. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Idle time between cycles. The design's value is 15 seconds. */
  readonly pollIntervalMs?: number;
  /** How long one acquired lease lasts. Defaults to 30 seconds. */
  readonly leaseTtlMs?: number;
  /** Receives every state change announcement. Silent by default. */
  readonly announce?: (notice: SyncNotice) => void;
  /** Injected operations. The generated client by default. */
  readonly operations?: EngineOperations;
  /**
   * The lease of the tab. By default the engine takes, renews and releases
   * the lease itself. The notice coordinator passes the gate of its lease
   * keeper instead, so an engine that stops releases nothing (record 0130).
   */
  readonly lease?: LeaseGate;
  /**
   * The rest between two passes, read before each rest. The coordinator
   * lengthens it while a notice set is accepted. `pollIntervalMs` by default.
   */
  readonly interval?: () => number;
};

/** Whether this tab may send now, and what the end of a run gives back. */
export type LeaseGate = {
  /** Takes or renews the lease, or reads it, and answers whether it holds. */
  readonly hold: () => Promise<boolean>;
  /** Runs once when the engine ends. */
  readonly release: () => Promise<void>;
};

/** One foreground sync engine. */
export type SyncEngine = {
  /**
   * Runs sync cycles until the signal aborts.
   *
   * Waits and retries when another worker holds the lease, and always
   * releases an acquired lease before returning. A follower therefore takes
   * over without a reload when the active tab closes.
   */
  run(signal: AbortSignal): Promise<void>;
  /** Requests a new pass without waiting for the safety interval. */
  requestSync(): void;
  /** Stops a running engine and releases its lease. */
  stop(): void;
};

/** Waits out a delay, or rejects with an abort failure when stopped. */
function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The sync run stopped.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('The sync run stopped.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Creates the foreground sync engine of one account and workspace.
 *
 * Local attachment bytes due for upload are handled by preservation: this
 * device has no local attachment creation flow yet, so a queued revision
 * that names an attachment submits like any other revision, and a missing
 * object answer preserves the entry instead of dropping it. Upload before
 * submit becomes possible once checkpoints can create attachment content.
 */
export function createSyncEngine(
  local: LocalStore,
  accountId: string,
  workspaceId: string,
  options: EngineOptions = {},
): SyncEngine {
  const clock = options.clock ?? Date.now;
  const random = options.random ?? Math.random;
  const newId = options.id ?? ((): string => generateUUID());
  const sleep = options.sleep ?? defaultSleep;
  const pollIntervalMs = options.pollIntervalMs ?? 15_000;
  const leaseTtlMs = options.leaseTtlMs ?? 30_000;
  const announce = options.announce ?? ((): void => {});
  const interval = options.interval ?? ((): number => pollIntervalMs);
  const extraHeaders = options.headers ?? ((): Record<string, string> => ({}));
  const operations =
    options.operations ?? createOperations(workspaceId, extraHeaders);
  const internal = new AbortController();
  let wakeRequested = false;
  let wake: (() => void) | null = null;
  let connectionPending = true;
  const report = (notice: SyncNotice): void => {
    if (notice.kind === 'retry') connectionPending = true;
    announce(notice);
  };

  /**
   * One session verification: whether the session serves this engine, or why
   * it does not.
   *
   * A session of another account is not a failure of the server. The person
   * of this engine signs in again and the queue goes up then, so the queue
   * stays where it is and nothing goes to recovery (record 0113).
   */
  async function verifyOnce(signal: AbortSignal): Promise<SessionCheck> {
    let outcome: ServiceOutcome<{ readonly accountId: string }> | null;
    try {
      outcome = await sendWithRetry(
        {
          signal,
          sleep,
          random,
          id: newId,
          announce: report,
          watchResponse: observeResponseProgress,
        },
        (attempt) => operations.verifySession(attempt),
      );
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      return 'deferred';
    }
    if (outcome === null) return 'deferred';
    if (outcome.ok)
      return outcome.value.accountId === accountId ? 'ok' : 'other-account';
    if (outcome.problem.status === 401) return 'paused';
    if (
      outcome.problem.status === 408 ||
      outcome.problem.status === 429 ||
      outcome.problem.status >= 500
    )
      return 'deferred';
    return 'access-lost';
  }

  /**
   * Why the server refused a read or a write of this workspace.
   *
   * Another account can sign in on this browser between the session check and
   * the request, and the refusal then names the other account and not a lost
   * membership. The session is read again, so the person reads that cause at
   * once and not after the next pass.
   */
  async function refusalCause(signal: AbortSignal): Promise<SessionState> {
    const check = await verifyOnce(signal);
    return check === 'paused' || check === 'other-account'
      ? check
      : 'access-lost';
  }

  /**
   * Reads how this client stands against the server, or `null` when the read
   * failed in transport and a later cycle asks again.
   *
   * A failure that names no legacy server is not a protocol answer, so it
   * stops the cycle as an unexpected answer and sends nothing.
   */
  async function readProtocolFit(
    ctx: SyncContext,
  ): Promise<{ fit: ProtocolFit; snapshotRevisionBatches: boolean } | null> {
    const outcome = await sendWithRetry(ctx, (signal) =>
      operations.syncProtocol(signal),
    );
    if (outcome === null) return null;
    if (outcome.ok)
      return {
        fit: protocolFit(syncProtocolVersion, {
          kind: 'served',
          versions: outcome.value.versions,
        }),
        snapshotRevisionBatches: outcome.value.snapshotRevisionBatches === true,
      };
    const served = servedProtocolOfProblem(outcome.problem);
    if (served === null)
      throw new SyncFailedError(outcome.problem.code, outcome.problem.status);
    return {
      fit: protocolFit(syncProtocolVersion, served),
      snapshotRevisionBatches: false,
    };
  }

  /** Waits out a delay; returns `false` when the run stopped meanwhile. */
  async function rest(ms: number, signal: AbortSignal): Promise<boolean> {
    if (wakeRequested) {
      wakeRequested = false;
      return true;
    }
    // The sleep takes a signal of its own, so a wake that wins the race stops
    // the timer and takes the abort listener off the run signal. The sleep
    // used to run on to its own end: the web application asks for a pass on
    // every change of the queue, so a long writing session held one live
    // timer and one live listener for each early wake.
    const own = new AbortController();
    const stopEarly = (): void => {
      own.abort();
    };
    // A signal that already aborted fires no listener, so the run signal is
    // read as well as listened to. Without that read the sleep would wait on
    // a signal that never aborts and the run would never return.
    if (signal.aborted) own.abort();
    else signal.addEventListener('abort', stopEarly, { once: true });
    const sleeping = sleep(ms, own.signal);
    // The loser of the race rejects when `own` aborts below, and nothing
    // awaits it by then.
    sleeping.catch(() => undefined);
    try {
      await Promise.race([
        sleeping,
        new Promise<void>((resolve) => {
          wake = resolve;
        }),
      ]);
      wake = null;
      wakeRequested = false;
      return true;
    } catch (error: unknown) {
      if (signal.aborted) return false;
      throw error;
    } finally {
      own.abort();
      signal.removeEventListener('abort', stopEarly);
    }
  }

  /** A failed pass uses the polling rest even with a live notice stream. */
  function retryRest(signal: AbortSignal): Promise<boolean> {
    return rest(Math.min(interval(), pollIntervalMs), signal);
  }

  /**
   * Whether a save waits while a pull runs: a wake came, and the queue of
   * this workspace holds work. A wake for a notice alone lets the pull read
   * on, so a backlog still drains in long turns.
   */
  async function saveWaits(): Promise<boolean> {
    if (!wakeRequested) return false;
    try {
      return (await local.pending(accountId, workspaceId)).some(
        (entry) => entry.state !== 'conflict',
      );
    } catch {
      return false;
    }
  }

  async function loop(signal: AbortSignal): Promise<void> {
    const ownerId = options.ownerId ?? newId();
    const lease: LeaseGate = options.lease ?? {
      hold: () =>
        acquireWorkerLease(local, { ownerId, ttlMs: leaseTtlMs, clock }),
      release: () => releaseWorkerLease(local, ownerId),
    };
    let held = false;
    while (!held) {
      if (signal.aborted) return;
      held = await lease.hold();
      if (held) break;
      announce({ kind: 'lease-held' });
      if (!(await rest(Math.min(interval(), leaseTtlMs), signal))) return;
    }
    try {
      let lastSession: SessionState = 'ok';
      const noteSession = (state: SessionState): void => {
        if (state === lastSession) return;
        lastSession = state;
        // A session that serves this engine again is news too. The person
        // read that sync waits, and nothing else may announce for a while.
        if (state === 'ok') {
          announce({ kind: 'resumed' });
          return;
        }
        announce(
          state === 'paused'
            ? { kind: 'paused', reason: 'session' }
            : state === 'other-account'
              ? { kind: 'paused', reason: 'other-account' }
              : { kind: 'access-lost' },
        );
      };
      let lastFit: ProtocolFit = 'compatible';
      const noteFit = (fit: ProtocolFit): void => {
        if (fit === lastFit) return;
        lastFit = fit;
        announce({ kind: 'protocol', fit });
      };
      let lastCycleError = '';
      const noteCycleError = (code: string): void => {
        if (code === lastCycleError) return;
        lastCycleError = code;
        announce({ kind: 'cycle-error', code });
      };
      let session = await verifyOnce(signal);
      while (session !== 'ok') {
        if (signal.aborted) return;
        if (session === 'deferred') {
          if (!(await retryRest(signal))) return;
        } else {
          noteSession(session);
          if (!(await rest(interval(), signal))) return;
        }
        session = await verifyOnce(signal);
      }
      let lost = false;
      for (;;) {
        if (signal.aborted) return;
        const renewed = await lease.hold();
        if (!renewed) {
          if (!lost) announce({ kind: 'lease-lost' });
          lost = true;
          // Another tab took a lease that this engine took itself, so the run
          // ends as it always did. The keeper of a gate can take the lease
          // back for the tab, so an engine on a gate waits for it (record
          // 0130).
          if (options.lease === undefined) return;
          if (!(await rest(Math.min(interval(), leaseTtlMs), signal))) return;
          continue;
        }
        lost = false;
        // The protocol read of this pass ends with the pass when the session
        // check stops it early.
        const pass = new AbortController();
        const endPass = (): void => {
          pass.abort();
        };
        signal.addEventListener('abort', endPass, { once: true });
        try {
          const ctx: SyncContext = {
            owner: ownerId,
            signal: pass.signal,
            sleep,
            random,
            id: newId,
            announce: report,
            watchResponse: observeResponseProgress,
          };
          // The session and the protocol are read at the same time, which
          // saves one round trip before a save (record 0176). Nothing is
          // sent before both answered, so a session of another account and
          // a client that does not fit still send nothing (records 0086,
          // 0113).
          const protocolRead = readProtocolFit(ctx).then(
            (fit) => ({ read: true as const, fit }),
            (error: unknown) => ({ read: false as const, error }),
          );
          const check = await verifyOnce(signal);
          if (check === 'paused' || check === 'other-account') {
            endPass();
            noteSession(check);
            if (!(await rest(interval(), signal))) return;
            continue;
          }
          if (check !== 'ok') {
            endPass();
            if (check === 'deferred') {
              if (!(await retryRest(signal))) return;
            } else {
              noteSession('access-lost');
              if (!(await rest(interval(), signal))) return;
            }
            continue;
          }
          noteSession('ok');
          const protocol = await protocolRead;
          if (!protocol.read) throw protocol.error;
          const readProtocol = protocol.fit;
          if (readProtocol === null) {
            if (!(await retryRest(signal))) return;
            continue;
          }
          const { fit, snapshotRevisionBatches } = readProtocol;
          noteFit(fit);
          if (fit !== 'compatible') {
            if (!(await rest(interval(), signal))) return;
            continue;
          }
          // A refused precondition makes the queue read the server again
          // before it decides what to do with the refused mutation.
          const network: SnapshotNetwork = {
            ...operations,
            revisionBatch: snapshotRevisionBatches
              ? operations.revisionBatch
              : undefined,
          };
          const pull = (): Promise<PushOutcome> =>
            pullNew(local, accountId, workspaceId, network, ctx);
          const pushed = await pushQueue(
            local,
            accountId,
            workspaceId,
            operations,
            ctx,
            pull,
          );
          if (pushed === 'paused') {
            noteSession('paused');
            if (!(await rest(interval(), signal))) return;
            continue;
          }
          if (pushed === 'access-lost') {
            noteSession(await refusalCause(signal));
            if (!(await rest(interval(), signal))) return;
            continue;
          }
          if (pushed === 'deferred') {
            if (!(await retryRest(signal))) return;
            continue;
          }
          // One pass reads until an empty page proves the end of the feed. A
          // turn that ends before that proof asks for the next pass at once,
          // so a backlog drains after one wake with no later notice.
          const read = await pullPages(
            local,
            accountId,
            workspaceId,
            network,
            ctx,
            pagesPerTurn,
            saveWaits,
          );
          const pulled = read.outcome;
          if (read.more) wakeRequested = true;
          if (pulled === 'paused') {
            noteSession('paused');
          } else if (pulled === 'access-lost') {
            noteSession(await refusalCause(signal));
          } else if (pulled === 'done') {
            lastCycleError = '';
            // An empty feed proves recovery too. It changes no file, so the
            // pull emits no notice of its own and a quiet device would keep
            // the lost-connection sentence with no browser online event.
            if (connectionPending) {
              connectionPending = false;
              announce({ kind: 'connected' });
            }
          }
          if (
            !(await (pulled === 'deferred'
              ? retryRest(signal)
              : rest(interval(), signal)))
          )
            return;
        } catch (error: unknown) {
          if (signal.aborted) return;
          if (error instanceof SyncFailedError) {
            if (error.code === transportFailedCode) connectionPending = true;
            noteCycleError(error.code);
          } else if (isLocalStorageError(error))
            noteCycleError(`local-${error.kind}`);
          else throw error;
          if (!(await retryRest(signal))) return;
        } finally {
          endPass();
          signal.removeEventListener('abort', endPass);
        }
      }
    } finally {
      await lease.release();
    }
  }

  return {
    run(signal: AbortSignal): Promise<void> {
      if (signal.aborted || internal.signal.aborted) return Promise.resolve();
      const onExternalAbort = (): void => {
        internal.abort();
      };
      signal.addEventListener('abort', onExternalAbort, { once: true });
      return loop(internal.signal)
        .catch((error: unknown) => {
          if (!internal.signal.aborted) throw error;
        })
        .finally(() => {
          signal.removeEventListener('abort', onExternalAbort);
        });
    },
    requestSync(): void {
      if (internal.signal.aborted) return;
      wakeRequested = true;
      const resume = wake;
      wake = null;
      resume?.();
    },
    stop(): void {
      internal.abort();
      const resume = wake;
      wake = null;
      resume?.();
    },
  };
}

/**
 * Builds the default operations from the generated client.
 *
 * Every function below calls one generated operation with the workspace it
 * was built for. Bodies are mapped from domain records to generated shapes;
 * request digests cover exactly the body that is sent, so a retry repeats
 * the same bytes the digest names.
 */
function createOperations(
  workspaceId: string,
  extraHeaders: () => Record<string, string>,
): EngineOperations {
  return {
    async prepareCommit(input: ChangesetInput): Promise<string> {
      return requestDigest(
        'commitChangeset',
        { workspaceId },
        toChangesetBody(input),
      );
    },
    async commit(
      input: ChangesetInput,
      signal: AbortSignal,
    ): Promise<ServiceOutcome<AcceptedChangeset>> {
      const body = toChangesetBody(input);
      const sent = await commitChangeset({
        headers: extraHeaders(),
        path: { workspaceId },
        body,
        signal,
      });
      if (sent.error !== undefined || sent.data === undefined)
        return { ok: false, problem: toProblem(sent.error, sent.response) };
      return { ok: true, value: toAccepted(sent.data) };
    },
    async mutationReceipt(mutationId, digest, signal) {
      const sent = await getMutationReceipt({
        headers: extraHeaders(),
        path: { workspaceId, mutationId },
        query: { digest },
        signal,
      });
      if (sent.error !== undefined || sent.data === undefined)
        return {
          ok: false as const,
          problem: toProblem(sent.error, sent.response),
        };
      return {
        ok: true as const,
        value: {
          status: sent.data.status,
          accepted:
            sent.data.accepted === null ? null : toAccepted(sent.data.accepted),
        },
      };
    },
    async start(signal: AbortSignal) {
      const sent = await startSnapshot({
        headers: extraHeaders(),
        path: { workspaceId },
        body: { syncVersion: syncProtocolVersion },
        signal,
      });
      if (sent.error !== undefined || sent.data === undefined)
        return {
          ok: false as const,
          problem: toProblem(sent.error, sent.response),
        };
      return {
        ok: true as const,
        value: {
          token: sent.data.token,
          cursor: sent.data.cursor,
          itemCount: sent.data.itemCount,
        },
      };
    },
    async page(token, position, signal) {
      const sent = await getSnapshotPage({
        headers: extraHeaders(),
        path: { workspaceId, token },
        query: { position },
        signal,
      });
      if (sent.error !== undefined || sent.data === undefined)
        return {
          ok: false as const,
          problem: toProblem(sent.error, sent.response),
        };
      return {
        ok: true as const,
        value: {
          token: sent.data.token,
          cursor: sent.data.cursor,
          items: sent.data.items.map((item) => ({
            fileId: item.fileId,
            revisionId: item.revisionId,
            path: item.path,
            fileKind: item.kind,
            deleted: item.deleted,
          })),
          nextPosition: sent.data.nextPosition,
        },
      };
    },
    async revision(revisionId, signal) {
      const sent = await getRevision({
        headers: extraHeaders(),
        path: { workspaceId, revisionId },
        signal,
      });
      if (sent.error !== undefined || sent.data === undefined)
        return {
          ok: false as const,
          problem: toProblem(sent.error, sent.response),
        };
      return {
        ok: true as const,
        value: {
          fileId: sent.data.fileId,
          revisionId: sent.data.revisionId,
          path: sent.data.path,
          fileKind: sent.data.kind,
          deleted: sent.data.deleted,
          digest: sent.data.digest,
          text: sent.data.text,
          document: sent.data.document,
          epoch: sent.data.epoch,
          serverTime: sent.data.serverTime,
        },
      };
    },
    async revisionBatch(revisionIds, signal) {
      const sent = await getSnapshotRevisions({
        headers: extraHeaders(),
        path: { workspaceId },
        query: { ids: revisionIds.join(',') },
        signal,
      });
      if (sent.error !== undefined || sent.data === undefined)
        return { ok: false, problem: toProblem(sent.error, sent.response) };
      return {
        ok: true,
        value: sent.data.revisions.map(({ kind, ...revision }) => ({
          ...revision,
          fileKind: kind,
        })),
      };
    },
    async changes(cursor, signal) {
      const sent = await getChanges({
        headers: extraHeaders(),
        path: { workspaceId },
        query: { cursor },
        signal,
      });
      if (sent.error !== undefined || sent.data === undefined)
        return {
          ok: false as const,
          problem: toProblem(sent.error, sent.response),
        };
      return {
        ok: true as const,
        value: {
          // The feed states everything a reader needs: the accepted work of a
          // note, a whole document at a new generation, a note that the
          // workspace removed for good, or a membership change that only
          // moves the cursor (record 0081).
          changes: sent.data.changes.map((change) => {
            if (change.kind === 'purge')
              return { file: null, purgedFileId: change.fileId };
            if (change.kind === 'membership')
              return { file: null, purgedFileId: null };
            const document =
              change.kind === 'document'
                ? {
                    kind: 'document' as const,
                    bytes: bytesOfBase64(change.document),
                    epoch: change.epoch,
                  }
                : change.update === null || change.epoch === null
                  ? null
                  : {
                      kind: 'update' as const,
                      bytes: bytesOfBase64(change.update),
                      epoch: change.epoch,
                    };
            return {
              file: {
                fileId: change.fileId,
                revisionId: change.revisionId,
                path: change.path,
                fileKind:
                  change.kind === 'update' && change.kindOfFile === 'attachment'
                    ? ('attachment' as const)
                    : ('note' as const),
                deleted: change.deleted,
                digest: change.digest,
                document,
                text: null,
              },
              purgedFileId: null,
            };
          }),
          nextCursor: sent.data.nextCursor,
        },
      };
    },
    async syncProtocol(signal: AbortSignal) {
      const sent = await getSyncProtocol({ headers: extraHeaders(), signal });
      if (sent.error !== undefined || sent.data === undefined)
        return {
          ok: false as const,
          problem: toProblem(sent.error, sent.response),
        };
      return {
        ok: true as const,
        value: {
          versions: sent.data.versions,
          snapshotRevisionBatches: sent.data.snapshotRevisionBatches === true,
        },
      };
    },
    async verifySession(signal: AbortSignal) {
      const sent = await getAccount({ headers: extraHeaders(), signal });
      if (sent.error !== undefined || sent.data === undefined)
        return {
          ok: false as const,
          problem: toProblem(sent.error, sent.response),
        };
      return { ok: true as const, value: { accountId: sent.data.accountId } };
    },
  };
}

/** The domain shape of one accepted changeset that the server answered. */
function toAccepted(data: GeneratedAccepted): AcceptedChangeset {
  return {
    mutationId: data.mutationId,
    revisionIds: [...data.revisionIds],
    cursor: data.cursor,
    revisions: data.revisions.map((revision) => ({
      epoch: revision.epoch,
      acceptedState:
        revision.acceptedState === null || revision.acceptedState === undefined
          ? null
          : bytesOfBase64(revision.acceptedState),
      merged: revision.merged,
      revisionId: revision.revisionId,
      fileId: revision.fileId,
      parents: [...revision.parents],
      path: revision.path,
      deleted: revision.deleted,
      digest: revision.digest,
      size: revision.size,
      actorAccountId: revision.actorAccountId,
      serverTime: revision.serverTime,
      message: revision.message,
    })),
    superseded: data.superseded.map((entry) => ({
      fileId: entry.fileId,
      previousHeadRevisionId: entry.previousHeadRevisionId,
      acceptedRevisionId: entry.acceptedRevisionId,
    })),
  };
}

/** The generated body of one atomic changeset. */
function toChangesetBody(input: ChangesetInput): {
  readonly mutationId: string;
  readonly deviceId: string;
  readonly expectedHeads: Record<string, string | null>;
  readonly revisions: ReturnType<typeof toRevisionBody>[];
} {
  return {
    mutationId: input.mutationId,
    deviceId: input.deviceId,
    expectedHeads: { ...input.expectedHeads },
    revisions: input.revisions.map(toRevisionBody),
  };
}
