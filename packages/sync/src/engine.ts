/**
 * The foreground sync state machine.
 *
 * One run of the engine repeats the revision exchange of the design:
 *
 * 1. Hold the single worker lease, renewing it every cycle. Another tab with
 *    a live lease keeps this run from starting; an expired lease is taken
 *    over. Tab messages only announce these states.
 * 2. Verify the session and the workspace membership before touching data.
 *    An expired session pauses the run with drafts kept. A lost membership
 *    stops reads and writes. A downgrade to viewer suspends writes while
 *    permitted reads continue, and resumes them when the role is restored.
 * 3. Read the sync protocol versions that the server serves. A client that
 *    does not fit sends nothing and pulls nothing, keeps every draft and
 *    queued save, and announces the misfit once (record 0086).
 * 4. Submit the queued mutations in parent order through `pushQueue`, which
 *    freezes each mutation on first send, batches unsent chains atomically,
 *    branches on stale heads, and preserves anything the server refuses.
 * 5. Pull the server state through `pullNew`: stage a snapshot, fetch its
 *    immutable revisions, activate only when complete, then consume ordered
 *    changes. A dirty working copy is never replaced.
 * 6. Wait for the poll interval and repeat until the abort signal fires.
 *
 * Every application HTTP call below is a direct import of a generated
 * operation function. There is no handwritten transport: this module only
 * maps domain records to generated bodies and generated answers back to
 * domain outcomes.
 */
import {
  commitChangeset,
  getAccount,
  getChanges,
  getRevision,
  getSnapshotPage,
  getSyncProtocol,
  startSnapshot,
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
  type Problem,
  type PushOutcome,
  type QueueNetwork,
  type ServiceOutcome,
  type SyncContext,
  type SyncNotice,
} from './queue.ts';
import { pullNew, type SnapshotNetwork } from './snapshot.ts';
import {
  protocolFit,
  servedProtocolOfProblem,
  type ProtocolFit,
} from './protocol.ts';

/** Reading one unknown property without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

/** The text list of a problem's file IDs, or an empty list. */
function readFileIds(value: unknown): readonly string[] {
  const fileIds = readProperty(value, 'fileIds');
  if (!Array.isArray(fileIds)) return [];
  return fileIds.filter(
    (entry: unknown): entry is string => typeof entry === 'string',
  );
}

/**
 * Maps a generated failure to a stable problem.
 *
 * The client interceptor normalizes failures to problem details, so the
 * code, the status, and the file IDs are read from the error first and from
 * the HTTP answer as a fallback.
 */
function toProblem(error: unknown, response: Response | undefined): Problem {
  const statusRaw = readProperty(error, 'status');
  const status =
    typeof statusRaw === 'number' ? statusRaw : (response?.status ?? 0);
  const codeRaw = readProperty(error, 'code');
  const code =
    typeof codeRaw === 'string' && codeRaw !== ''
      ? codeRaw
      : status === 401
        ? 'unauthorized'
        : status === 0
          ? transportFailedCode
          : 'unexpected_response';
  return { status, code, fileIds: readFileIds(error) };
}

/** The generated body of one submitted revision. */
function toRevisionBody(revision: ChangesetInput['revisions'][number]): {
  readonly revisionId: string;
  readonly fileId: string;
  readonly parents: string[];
  readonly path: string;
  readonly deleted: boolean;
  readonly content: {
    readonly kind: 'markdown' | 'attachment';
    readonly digest: string;
    readonly text?: string;
    readonly attachmentObjectId?: string;
  };
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

/** The generated body of one content reference, without absent members. */
function toContentBody(content: ContentRef): {
  readonly kind: 'markdown' | 'attachment';
  readonly digest: string;
  readonly text?: string;
  readonly attachmentObjectId?: string;
} {
  if (content.kind === 'markdown')
    return { kind: 'markdown', digest: content.digest, text: content.text };
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
  syncProtocol(
    signal: AbortSignal,
  ): Promise<ServiceOutcome<{ readonly versions: readonly number[] }>>;
};

/** Every network operation the engine runs, for injection in tests. */
export type EngineOperations = QueueNetwork &
  SnapshotNetwork &
  SessionNetwork &
  ProtocolNetwork;

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
  const extraHeaders = options.headers ?? ((): Record<string, string> => ({}));
  const operations =
    options.operations ?? createOperations(workspaceId, extraHeaders);
  const internal = new AbortController();
  let wakeRequested = false;
  let wake: (() => void) | null = null;

  /** One session verification: the signed-in account or why it failed. */
  async function verifyOnce(
    signal: AbortSignal,
  ): Promise<'ok' | 'paused' | 'access-lost' | 'deferred'> {
    let outcome: ServiceOutcome<{ readonly accountId: string }>;
    try {
      outcome = await operations.verifySession(signal);
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      return 'deferred';
    }
    if (outcome.ok) return 'ok';
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
   * Reads how this client stands against the server, or `null` when the read
   * failed in transport and a later cycle asks again.
   *
   * A failure that names no legacy server is not a protocol answer, so it
   * stops the cycle as an unexpected answer and sends nothing.
   */
  async function readProtocolFit(
    ctx: SyncContext,
  ): Promise<ProtocolFit | null> {
    const outcome = await sendWithRetry(ctx, (signal) =>
      operations.syncProtocol(signal),
    );
    if (outcome === null) return null;
    if (outcome.ok)
      return protocolFit(syncProtocolVersion, {
        kind: 'served',
        versions: outcome.value.versions,
      });
    const served = servedProtocolOfProblem(outcome.problem);
    if (served === null)
      throw new SyncFailedError(outcome.problem.code, outcome.problem.status);
    return protocolFit(syncProtocolVersion, served);
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

  async function loop(signal: AbortSignal): Promise<void> {
    const ownerId = options.ownerId ?? newId();
    let held = false;
    while (!held) {
      if (signal.aborted) return;
      held = await acquireWorkerLease(local, {
        ownerId,
        ttlMs: leaseTtlMs,
        clock,
      });
      if (held) break;
      announce({ kind: 'lease-held' });
      if (!(await rest(Math.min(pollIntervalMs, leaseTtlMs), signal))) return;
    }
    try {
      let lastSession: 'ok' | 'paused' | 'access-lost' = 'ok';
      const noteSession = (state: 'ok' | 'paused' | 'access-lost'): void => {
        if (state === lastSession) return;
        lastSession = state;
        announce(
          state === 'paused'
            ? { kind: 'paused', reason: 'session' }
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
        noteSession(session === 'paused' ? 'paused' : 'access-lost');
        if (!(await rest(pollIntervalMs, signal))) return;
        session = await verifyOnce(signal);
      }
      for (;;) {
        if (signal.aborted) return;
        const renewed = await acquireWorkerLease(local, {
          ownerId,
          ttlMs: leaseTtlMs,
          clock,
        });
        if (!renewed) {
          announce({ kind: 'lease-lost' });
          return;
        }
        try {
          const check = await verifyOnce(signal);
          if (check === 'paused') {
            noteSession('paused');
            if (!(await rest(pollIntervalMs, signal))) return;
            continue;
          }
          if (check !== 'ok') {
            noteSession('access-lost');
            if (!(await rest(pollIntervalMs, signal))) return;
            continue;
          }
          noteSession('ok');
          const ctx: SyncContext = {
            signal,
            sleep,
            random,
            id: newId,
            announce,
          };
          const fit = await readProtocolFit(ctx);
          if (fit === null) {
            if (!(await rest(pollIntervalMs, signal))) return;
            continue;
          }
          noteFit(fit);
          if (fit !== 'compatible') {
            if (!(await rest(pollIntervalMs, signal))) return;
            continue;
          }
          // A refused precondition makes the queue read the server again
          // before it decides what to do with the refused mutation.
          const pull = (): Promise<PushOutcome> =>
            pullNew(local, accountId, workspaceId, operations, ctx);
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
            if (!(await rest(pollIntervalMs, signal))) return;
            continue;
          }
          if (pushed === 'access-lost') {
            noteSession('access-lost');
            if (!(await rest(pollIntervalMs, signal))) return;
            continue;
          }
          if (pushed === 'deferred') {
            if (!(await rest(pollIntervalMs, signal))) return;
            continue;
          }
          const pulled = await pullNew(
            local,
            accountId,
            workspaceId,
            operations,
            ctx,
          );
          if (pulled === 'paused') {
            noteSession('paused');
          } else if (pulled === 'access-lost') {
            noteSession('access-lost');
          } else {
            lastCycleError = '';
          }
          if (!(await rest(pollIntervalMs, signal))) return;
        } catch (error: unknown) {
          if (signal.aborted) return;
          if (error instanceof DOMException && error.name === 'AbortError')
            return;
          if (error instanceof SyncFailedError) noteCycleError(error.code);
          else if (isLocalStorageError(error))
            noteCycleError(`local-${error.kind}`);
          else throw error;
          if (!(await rest(pollIntervalMs, signal))) return;
        }
      }
    } finally {
      await releaseWorkerLease(local, ownerId);
    }
  }

  return {
    run(signal: AbortSignal): Promise<void> {
      if (signal.aborted || internal.signal.aborted) return Promise.resolve();
      const onExternalAbort = (): void => {
        internal.abort();
      };
      signal.addEventListener('abort', onExternalAbort, { once: true });
      return loop(internal.signal).finally(() => {
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
      return {
        ok: true,
        value: {
          mutationId: sent.data.mutationId,
          revisionIds: [...sent.data.revisionIds],
          cursor: sent.data.cursor,
          revisions: sent.data.revisions.map((revision) => ({
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
          superseded: sent.data.superseded.map((entry) => ({
            fileId: entry.fileId,
            previousHeadRevisionId: entry.previousHeadRevisionId,
            acceptedRevisionId: entry.acceptedRevisionId,
          })),
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
        },
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
          changes: sent.data.changes.map((change) => ({
            file:
              change.entityKind === 'file' && change.revisionId !== null
                ? {
                    fileId: change.entityId,
                    revisionId: change.revisionId,
                  }
                : null,
            // A file record with no revision and the deleted flag set is a
            // purge marker: the revisions of that file no longer exist, so the
            // record states the file itself instead of a revision to read.
            purgedFileId:
              change.entityKind === 'file' &&
              change.revisionId === null &&
              change.deleted
                ? change.entityId
                : null,
          })),
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
      return { ok: true as const, value: { versions: sent.data.versions } };
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
