/**
 * Sync engine unit tests.
 *
 * Every test injects a fake `LocalStore` and stubbed network operations, so
 * nothing here touches the network and the generated client is never
 * imported. The integration suite in `tests/integration/sync.test.ts` runs
 * the same engine against the real client and a disposable server.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  syncProtocolVersion,
  type AcceptedChangeset,
  type ChangesetInput,
  type SupersededHead,
} from '@notesapp/core';
import {
  LocalStorageError,
  type Draft,
  type FileSaveSnapshot,
  type HeldPath,
  type LegacyReceipt,
  type LegacySave,
  type LocalAcceptedFile,
  type LocalConflict,
  type LocalFileSummary,
  type LocalStore,
  type NoteDocument,
  type QueueEntry,
  type RecoveryInput,
  type RecoveryRecord,
  type RemoteChange,
  type SnapshotRevision,
} from './local-port.ts';
import { acquireWorkerLease, releaseWorkerLease } from './lease.ts';
import {
  backoffDelay,
  pushQueue,
  type CommitResult,
  type Problem,
  type PushOutcome,
  type QueueNetwork,
  type SyncContext,
  type SyncNotice,
} from './queue.ts';
import {
  pullNew,
  snapshotFetchConcurrency,
  type SnapshotNetwork,
} from './snapshot.ts';
import { createSyncEngine, type EngineOperations } from './engine.ts';

const accountId = 'account-1';
const workspaceId = 'workspace-1';

/** One staged snapshot of the fake store. */
type Staged = {
  readonly accountId: string;
  readonly workspaceId: string;
  readonly revisionIds: string[];
  readonly cursor: string;
  readonly items: Map<string, SnapshotRevision>;
  state: 'staging' | 'complete' | 'active';
};

/** An in-memory `LocalStore` with controllable time. */
class FakeStore implements LocalStore {
  readonly serverOrigin = 'https://notes.test';
  readonly deviceId = 'device-test';
  nowMs = 1_000_000;
  entries = new Map<string, QueueEntry>();
  order: string[] = [];
  acks: AcceptedChangeset[] = [];
  discarded: string[] = [];
  forgotten: string[] = [];
  acceptedHeads = new Map<string, string | null>();
  cursors = new Map<string, string>();
  staged = new Map<string, Staged>();
  lease: { ownerId: string; expiresAt: number } | null = null;
  drafts = new Map<string, Draft>();
  rebased: string[] = [];
  recovery: RecoveryRecord[] = [];
  recoverySeq = 1;
  markers = new Set<string>();
  applied: {
    readonly changes: readonly RemoteChange[];
    readonly nextCursor: string;
  }[] = [];

  private key(account: string, workspace: string): string {
    return `${account}/${workspace}`;
  }

  /** The frozen text of each local revision, as a checkpoint holds it. */
  readonly revisionTexts = new Map<string, string>();

  readRevisionText(
    _account: string,
    _workspace: string,
    revisionId: string,
  ): Promise<string | null> {
    return Promise.resolve(this.revisionTexts.get(revisionId) ?? null);
  }

  /** The document of each note, as this fake device holds it. */
  readonly noteDocuments = new Map<string, Uint8Array>();

  readNoteDocument(
    _account: string,
    _workspace: string,
    fileId: string,
  ): Promise<NoteDocument | null> {
    const bytes = this.noteDocuments.get(fileId);
    return Promise.resolve(bytes === undefined ? null : { bytes, epoch: 1 });
  }

  appendNoteWork(
    _account: string,
    _workspace: string,
    fileId: string,
    _epoch: number,
    update: Uint8Array,
  ): Promise<void> {
    this.noteDocuments.set(fileId, update);
    return Promise.resolve();
  }

  mergeNoteWork(
    _account: string,
    _workspace: string,
    fileId: string,
    _epoch: number,
    update: Uint8Array,
  ): Promise<NoteDocument> {
    this.noteDocuments.set(fileId, update);
    return Promise.resolve({ bytes: update, epoch: 1 });
  }

  subscribe(): () => void {
    return () => {};
  }

  enqueue(entry: QueueEntry): void {
    // The fake writes the text of a save as its update, so the frozen text of
    // each revision is what a checkpoint of this device would hold.
    for (const revision of entry.input.revisions)
      if (
        revision.content.kind === 'markdown' &&
        revision.content.document.work.kind === 'update'
      )
        this.revisionTexts.set(
          revision.id,
          new TextDecoder().decode(revision.content.document.work.update),
        );
    this.entries.set(entry.input.mutationId, entry);
    this.order.push(entry.input.mutationId);
  }

  queued(): QueueEntry | null {
    const id = this.order[0];
    if (id === undefined) return null;
    return this.entries.get(id) ?? null;
  }

  async saveDraft(draft: Draft): Promise<void> {
    this.drafts.set(draft.workingCopyId, draft);
  }

  readDraft(
    account: string,
    workspace: string,
    workingCopyId: string,
  ): Promise<Draft | null> {
    const draft = this.drafts.get(workingCopyId) ?? null;
    if (
      draft === null ||
      draft.accountId !== account ||
      draft.workspaceId !== workspace
    )
      return Promise.resolve(null);
    return Promise.resolve(draft);
  }

  checkpoint(draft: Draft, message: string | null): Promise<QueueEntry | null> {
    this.revisionTexts.set(`rev-${draft.workingCopyId}`, draft.text);
    const entry: QueueEntry = {
      accountId: draft.accountId,
      input: {
        workspaceId: draft.workspaceId,
        mutationId: `checkpoint-${draft.workingCopyId}`,
        deviceId: this.deviceId,
        expectedHeads: { [draft.fileId]: draft.baseRevisionId },
        revisions: [
          {
            id: `revision-${draft.workingCopyId}`,
            fileId: draft.fileId,
            parents:
              draft.baseRevisionId === null ? [] : [draft.baseRevisionId],
            path: draft.path,
            deleted: draft.deleted,
            content: {
              kind: 'markdown',
              document: {
                work: {
                  kind: 'update',
                  update: new TextEncoder().encode(draft.text),
                },
                epoch: 1,
                observed: new Uint8Array(),
              },
            },
            clientTime: new Date(this.nowMs).toISOString(),
            message,
            restoredFrom: null,
          },
        ],
      },
      state: 'pending',
      digest: null,
      errorCode: null,
    };
    this.enqueue(entry);
    return Promise.resolve(entry);
  }

  /** The engine never caches a read of a screen. */
  cacheServerNote(): Promise<void> {
    throw new Error('the engine must not cache a note of the server');
  }

  /** The engine runs no whole-file action, so both stop the test at once. */
  moveFiles(): Promise<readonly QueueEntry[]> {
    throw new Error('the engine must not move a file');
  }

  trashFiles(): Promise<readonly QueueEntry[]> {
    throw new Error('the engine must not trash a file');
  }

  rebaseDraft(
    _account: string,
    _workspace: string,
    workingCopyId: string,
  ): Promise<void> {
    this.rebased.push(workingCopyId);
    return Promise.resolve();
  }

  dropDraft(
    _account: string,
    _workspace: string,
    workingCopyId: string,
  ): Promise<void> {
    this.drafts.delete(workingCopyId);
    return Promise.resolve();
  }

  pending(account: string, workspace: string): Promise<readonly QueueEntry[]> {
    const found: QueueEntry[] = [];
    for (const id of this.order) {
      const entry = this.entries.get(id);
      if (
        entry !== undefined &&
        entry.accountId === account &&
        entry.input.workspaceId === workspace
      )
        found.push(entry);
    }
    return Promise.resolve(found);
  }

  queuedWorkspaces(account: string): Promise<readonly string[]> {
    const found = new Set<string>();
    for (const entry of this.entries.values())
      if (entry.accountId === account) found.add(entry.input.workspaceId);
    return Promise.resolve([...found]);
  }

  markSending(
    _account: string,
    mutationId: string,
    digest: string,
  ): Promise<void> {
    const entry = this.entries.get(mutationId);
    if (entry !== undefined)
      this.entries.set(mutationId, {
        ...entry,
        state: 'sending',
        digest: entry.digest ?? digest,
      });
    return Promise.resolve();
  }

  markConflict(
    _account: string,
    mutationId: string,
    details?: Parameters<LocalStore['markConflict']>[2],
  ): Promise<void> {
    const entry = this.entries.get(mutationId);
    if (entry !== undefined)
      this.entries.set(mutationId, {
        ...entry,
        state: 'conflict',
        errorCode: details?.errorCode ?? entry.errorCode,
      });
    return Promise.resolve();
  }

  discardQueueEntry(_account: string, mutationId: string): Promise<void> {
    this.discarded.push(mutationId);
    this.entries.delete(mutationId);
    this.order = this.order.filter((id) => id !== mutationId);
    return Promise.resolve();
  }

  parkedWorkHeld(): Promise<number | null> {
    return Promise.resolve(null);
  }

  reparentQueueEntry(
    _account: string,
    mutationId: string,
    expectedHeads: Readonly<Record<string, string | null>>,
  ): Promise<QueueEntry | null> {
    const entry = this.entries.get(mutationId);
    if (entry === undefined || entry.state === 'conflict')
      return Promise.resolve(null);
    const moved: QueueEntry = {
      ...entry,
      state: 'pending',
      digest: null,
      input: {
        ...entry.input,
        expectedHeads: { ...entry.input.expectedHeads, ...expectedHeads },
      },
    };
    this.entries.set(mutationId, moved);
    return Promise.resolve(moved);
  }

  /** Moved saves of release 0.4, and how placement answers (record 0088). */
  legacy: LegacySave[] = [];
  settled: { readonly mutationId: string; readonly receipt: LegacyReceipt }[] =
    [];
  waitingWork = 0;
  applyFailure: LocalStorageError | null = null;

  legacySaves(): Promise<readonly LegacySave[]> {
    return Promise.resolve([...this.legacy]);
  }

  settleLegacySave(
    _account: string,
    mutationId: string,
    receipt: LegacyReceipt,
  ): Promise<void> {
    this.settled.push({ mutationId, receipt });
    this.legacy = this.legacy.flatMap((save) =>
      save.mutationId !== mutationId
        ? [save]
        : receipt.kind === 'absent'
          ? [{ ...save, state: 'pending' as const, digest: null }]
          : [],
    );
    return Promise.resolve();
  }

  placeLegacyWork(): Promise<{ readonly waiting: number }> {
    return Promise.resolve({ waiting: this.waitingWork });
  }

  acknowledge(_account: string, result: AcceptedChangeset): Promise<void> {
    if (!this.entries.has(result.mutationId)) return Promise.resolve();
    this.entries.delete(result.mutationId);
    this.order = this.order.filter((id) => id !== result.mutationId);
    this.acks.push(result);
    return Promise.resolve();
  }

  listCheckpoints(): Promise<readonly []> {
    return Promise.resolve([]);
  }

  recover(): Promise<readonly []> {
    return Promise.resolve([]);
  }

  addRecovery(
    account: string,
    workspace: string,
    entry: RecoveryInput,
  ): Promise<RecoveryRecord> {
    const record: RecoveryRecord = {
      serverOrigin: this.serverOrigin,
      accountId: account,
      workspaceId: workspace,
      recoveryId: entry.recoveryId ?? `recovery-${String(this.recoverySeq++)}`,
      fileId: entry.fileId,
      path: entry.path,
      text: entry.text,
      reason: entry.reason,
      code: entry.code ?? null,
      noteRefusal: entry.noteRefusal ?? null,
      mutationId: entry.mutationId ?? null,
      createdAt: entry.createdAt ?? new Date(this.nowMs).toISOString(),
    };
    this.recovery.push(record);
    return Promise.resolve(record);
  }

  removeRecovery(
    _account: string,
    _workspace: string,
    recoveryId: string,
  ): Promise<void> {
    this.recovery = this.recovery.filter(
      (entry) => entry.recoveryId !== recoveryId,
    );
    return Promise.resolve();
  }

  listReviews(): Promise<readonly []> {
    return Promise.resolve([]);
  }

  clearReview(): Promise<void> {
    return Promise.resolve();
  }

  listAcceptedFiles(): Promise<readonly LocalAcceptedFile[]> {
    return Promise.resolve([]);
  }

  async listHeldPaths(): Promise<readonly HeldPath[]> {
    const files = await this.listLocalFiles();
    return files.map((file) => ({ fileId: file.fileId, path: file.path }));
  }

  listLocalFiles(): Promise<readonly LocalFileSummary[]> {
    return Promise.resolve(
      [...this.drafts.values()].map((draft) => ({
        fileId: draft.fileId,
        path: draft.path,
        kind: 'note' as const,
        deleted: draft.deleted,
        updatedAt: new Date(this.nowMs).toISOString(),
        acceptedHeadRevisionId: null,
        localHeadRevisionId: null,
        localOnly: true,
      })),
    );
  }

  readFileSaveSnapshot(
    _account: string,
    _workspace: string,
    fileId: string,
  ): Promise<FileSaveSnapshot> {
    return Promise.resolve({
      fileId,
      path: null,
      deleted: false,
      latestDraftSequence: null,
      latestMutationId: null,
      queueState: null,
      acceptedHeadRevisionId: this.acceptedHeads.get(fileId) ?? null,
      localHeadRevisionId: null,
      hasUncheckpointedDraft: false,
    });
  }

  listLocalConflicts(): Promise<readonly LocalConflict[]> {
    return Promise.resolve([]);
  }

  readCachedNote(): Promise<null> {
    return Promise.resolve(null);
  }

  listSearchFiles(): Promise<readonly []> {
    return Promise.resolve([]);
  }

  hasContent(): Promise<boolean> {
    return Promise.resolve(false);
  }

  setAttachmentPinned(): Promise<void> {
    return Promise.resolve();
  }

  isAttachmentPinned(): Promise<boolean> {
    return Promise.resolve(false);
  }

  setHistoryPinned(): Promise<void> {
    return Promise.resolve();
  }

  isHistoryPinned(): Promise<boolean> {
    return Promise.resolve(false);
  }

  setSignOutMarker(account: string): Promise<void> {
    this.markers.add(account);
    return Promise.resolve();
  }

  hasSignOutMarker(account: string): Promise<boolean> {
    return Promise.resolve(this.markers.has(account));
  }

  clearSignOutMarker(account: string): Promise<void> {
    this.markers.delete(account);
    return Promise.resolve();
  }

  clearIdleAccounts(): Promise<readonly string[]> {
    return Promise.reject(new Error('the engine never clears other accounts'));
  }

  clearPrivateData(account: string, workspace?: string): Promise<void> {
    if (workspace === undefined) {
      this.entries.clear();
      this.order = [];
      this.drafts.clear();
      this.recovery = this.recovery.filter(
        (entry) => entry.accountId !== account,
      );
      return Promise.resolve();
    }
    for (const [id, entry] of [...this.entries]) {
      if (
        entry.accountId === account &&
        entry.input.workspaceId === workspace
      ) {
        this.entries.delete(id);
        this.order = this.order.filter((kept) => kept !== id);
      }
    }
    for (const [id, draft] of [...this.drafts]) {
      if (draft.accountId === account && draft.workspaceId === workspace)
        this.drafts.delete(id);
    }
    this.recovery = this.recovery.filter(
      (entry) =>
        !(entry.accountId === account && entry.workspaceId === workspace),
    );
    return Promise.resolve();
  }

  acquireLease(ownerId: string, expiresAt: number): Promise<boolean> {
    if (
      this.lease !== null &&
      this.lease.ownerId !== ownerId &&
      this.lease.expiresAt > this.nowMs
    )
      return Promise.resolve(false);
    this.lease = { ownerId, expiresAt };
    return Promise.resolve(true);
  }

  releaseLease(ownerId: string): Promise<void> {
    if (this.lease?.ownerId === ownerId) this.lease = null;
    return Promise.resolve();
  }

  readLeaseState(): Promise<{
    readonly ownerId: string;
    readonly expiresAt: number;
  } | null> {
    return Promise.resolve(this.lease);
  }

  stageSnapshot(
    account: string,
    workspace: string,
    token: string,
    revisionIds: readonly string[],
    cursor: string,
    _owner: string,
  ): Promise<readonly string[]> {
    // As the browser store does, an earlier plan of the workspace gives this
    // one the revisions it stored, and goes (record 0176).
    const items = new Map<string, SnapshotRevision>();
    for (const [earlierToken, earlier] of [...this.staged]) {
      if (
        earlier.state !== 'staging' ||
        earlier.accountId !== account ||
        earlier.workspaceId !== workspace
      )
        continue;
      for (const [id, item] of earlier.items)
        if (revisionIds.includes(id)) items.set(id, { ...item, token });
      if (earlierToken !== token) this.staged.delete(earlierToken);
    }
    this.staged.set(token, {
      accountId: account,
      workspaceId: workspace,
      revisionIds: [...revisionIds],
      cursor,
      items,
      state: 'staging',
    });
    return Promise.resolve(revisionIds.filter((id) => !items.has(id)));
  }

  storeSnapshotRevision(
    _account: string,
    _workspace: string,
    revision: SnapshotRevision,
  ): Promise<void> {
    const staged = this.staged.get(revision.token);
    if (staged === undefined)
      throw new LocalStorageError('corrupt', 'no staged snapshot');
    staged.items.set(revision.revisionId, revision);
    return Promise.resolve();
  }

  activateSnapshot(token: string): Promise<void> {
    const staged = this.staged.get(token);
    if (staged === undefined)
      throw new LocalStorageError('corrupt', 'no staged snapshot');
    for (const id of staged.revisionIds) {
      const item = staged.items.get(id);
      if (item === undefined)
        throw new LocalStorageError('aborted', 'the snapshot is incomplete');
      if (!item.deleted && item.kind === 'note' && item.text === null)
        throw new LocalStorageError('aborted', 'the snapshot is incomplete');
    }
    staged.state = 'active';
    this.cursors.set(
      this.key(staged.accountId, staged.workspaceId),
      staged.cursor,
    );
    return Promise.resolve();
  }

  readCursor(account: string, workspace: string): Promise<string | null> {
    return Promise.resolve(
      this.cursors.get(this.key(account, workspace)) ?? null,
    );
  }

  applyRemoteChanges(
    account: string,
    workspace: string,
    changes: readonly RemoteChange[],
    nextCursor: string,
  ): Promise<void> {
    if (this.applyFailure !== null) {
      const failure = this.applyFailure;
      this.applyFailure = null;
      return Promise.reject(failure);
    }
    this.applied.push({ changes, nextCursor });
    this.cursors.set(this.key(account, workspace), nextCursor);
    return Promise.resolve();
  }

  forgetPurgedFiles(
    _account: string,
    _workspace: string,
    fileIds: readonly string[],
  ): Promise<void> {
    for (const fileId of fileIds) {
      this.forgotten.push(fileId);
      for (const [id, entry] of this.entries)
        if (
          entry.input.revisions.some((revision) => revision.fileId === fileId)
        ) {
          this.entries.delete(id);
          this.order = this.order.filter((queued) => queued !== id);
        }
      this.recovery = this.recovery.filter((entry) => entry.fileId !== fileId);
    }
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

/** A refusal of a failed precondition, as the server answers it. */
const staleHead = (fileId: string): CommitResult => ({
  ok: false as const,
  problem: { status: 412, code: 'stale_head', fileIds: [fileId] },
});

/** One queued mutation of one file, pending by default. */
function queuedEntry(
  fileId: string,
  revisionId: string,
  text: string,
  expectedHead: string | null,
  mutationId: string,
  parents: readonly string[] = [],
): QueueEntry {
  const input: ChangesetInput = {
    workspaceId,
    mutationId,
    deviceId: 'device-test',
    expectedHeads: { [fileId]: expectedHead },
    revisions: [
      {
        id: revisionId,
        fileId,
        parents,
        path: `notes/${fileId}.md`,
        deleted: false,
        content: {
          kind: 'markdown',
          document: {
            work: { kind: 'update', update: new TextEncoder().encode(text) },
            epoch: 1,
            observed: new Uint8Array(),
          },
        },
        clientTime: '2026-09-06T10:00:00.000Z',
        message: null,
        restoredFrom: null,
      },
    ],
  };
  return {
    accountId,
    input,
    state: 'pending',
    digest: null,
    errorCode: null,
  };
}

/** A stubbed network with recorded calls. */
type Stubs = EngineOperations & {
  readonly commitCalls: ChangesetInput[];
};

function stubOperations(behavior: {
  readonly commit?: (input: ChangesetInput) => Promise<CommitResult>;
  readonly start?: SnapshotNetwork['start'];
  readonly page?: SnapshotNetwork['page'];
  readonly revision?: SnapshotNetwork['revision'];
  readonly changes?: SnapshotNetwork['changes'];
  readonly verifySession?: EngineOperations['verifySession'];
  readonly syncProtocol?: EngineOperations['syncProtocol'];
  readonly mutationReceipt?: QueueNetwork['mutationReceipt'];
}): Stubs {
  const commitCalls: ChangesetInput[] = [];
  const queue: QueueNetwork = {
    prepareCommit: (input) => Promise.resolve(`digest-for-${input.mutationId}`),
    commit: (input, _signal) => {
      commitCalls.push(input);
      if (behavior.commit === undefined)
        return Promise.reject(new Error('unexpected commit call'));
      return behavior.commit(input);
    },
    mutationReceipt: (mutationId, digest, signal) => {
      if (behavior.mutationReceipt === undefined)
        return Promise.reject(new Error('unexpected receipt call'));
      return behavior.mutationReceipt(mutationId, digest, signal);
    },
  };
  const snapshot: SnapshotNetwork = {
    start: (_signal) => {
      if (behavior.start === undefined)
        return Promise.reject(new Error('unexpected start call'));
      return behavior.start(_signal);
    },
    page: (token, position, _signal) => {
      if (behavior.page === undefined)
        return Promise.reject(new Error('unexpected page call'));
      return behavior.page(token, position, _signal);
    },
    revision: (revisionId, _signal) => {
      if (behavior.revision === undefined)
        return Promise.reject(new Error('unexpected revision call'));
      return behavior.revision(revisionId, _signal);
    },
    changes: (cursor, _signal) => {
      if (behavior.changes === undefined)
        return Promise.reject(new Error('unexpected changes call'));
      return behavior.changes(cursor, _signal);
    },
  };
  return {
    ...queue,
    ...snapshot,
    verifySession: (_signal) => {
      if (behavior.verifySession === undefined)
        return Promise.resolve({
          ok: true as const,
          value: { accountId },
        });
      return behavior.verifySession(_signal);
    },
    syncProtocol: (_signal) => {
      if (behavior.syncProtocol === undefined)
        return Promise.resolve({
          ok: true as const,
          value: { versions: [syncProtocolVersion] },
        });
      return behavior.syncProtocol(_signal);
    },
    commitCalls,
  };
}

/** A context that records announcements and never waits. */
function testContext(
  notices: SyncNotice[],
  delays: number[],
  signal?: AbortSignal,
): SyncContext {
  let nextId = 0;
  return {
    signal: signal ?? new AbortController().signal,
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
    random: () => 0,
    id: () => {
      nextId += 1;
      return `id-${String(nextId)}`;
    },
    announce: (notice: SyncNotice) => {
      notices.push(notice);
    },
  };
}

/** Waits until a condition holds, failing loudly on timeout. */
async function waitFor(
  condition: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs)
      throw new Error('waitFor timed out before the condition held');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function accepted(
  mutationId: string,
  revisionIds: readonly string[],
  cursor: string,
  superseded: readonly SupersededHead[] = [],
): AcceptedChangeset {
  return {
    mutationId,
    revisionIds: [...revisionIds],
    revisions: [],
    cursor,
    superseded: [...superseded],
  };
}

/** A pull that reports nothing new, for a push that needs no refresh. */
const noPull = (): Promise<PushOutcome> => Promise.resolve('done');

await test('a single entry submits and acknowledges its exact result', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    commit: (input) => {
      assert.equal(input.mutationId, 'mutation-1');
      return Promise.resolve({
        ok: true as const,
        value: accepted('mutation-1', ['rev-a'], '7'),
      });
    },
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    noPull,
  );
  assert.equal(outcome, 'done');
  assert.equal(ops.commitCalls.length, 1);
  assert.deepEqual(store.acks, [accepted('mutation-1', ['rev-a'], '7')]);
  assert.deepEqual((await store.pending(accountId, workspaceId)).length, 0);
  assert.deepEqual(notices, [
    { kind: 'pushed', mutationIds: ['mutation-1'], fileIds: ['file-a'] },
  ]);
});

await test('the digest freezes on first send and the retry repeats the body', async () => {
  const store = new FakeStore();
  const entry = queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1');
  store.enqueue({ ...entry, state: 'sending', digest: 'frozen-1' });
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  let attempts = 0;
  const bodies: ChangesetInput[] = [];
  const ops = stubOperations({
    commit: (input) => {
      attempts += 1;
      bodies.push(input);
      if (attempts === 1)
        return Promise.reject(new Error('the response was lost'));
      return Promise.resolve({
        ok: true as const,
        value: accepted('mutation-1', ['rev-a'], '8'),
      });
    },
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    noPull,
  );
  assert.equal(outcome, 'done');
  assert.equal(attempts, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(store.acks, [accepted('mutation-1', ['rev-a'], '8')]);
  assert.deepEqual(notices, [
    { kind: 'retry', attempt: 1, delayMs: 500 },
    { kind: 'pushed', mutationIds: ['mutation-1'], fileIds: ['file-a'] },
  ]);
});

await test('two offline edits of one file commit as one atomic changeset', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  // The second checkpoint of a working copy names the first as its parent.
  store.enqueue(
    queuedEntry('file-a', 'rev-b', '# A edited\n', null, 'mutation-2', [
      'rev-a',
    ]),
  );
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    commit: (input) =>
      Promise.resolve({
        ok: true as const,
        value: accepted(input.mutationId, ['rev-a', 'rev-b'], '9'),
      }),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    noPull,
  );
  assert.equal(outcome, 'done');
  assert.equal(ops.commitCalls.length, 1);
  const sent = ops.commitCalls[0];
  assert.ok(sent !== undefined);
  assert.deepEqual(
    sent.revisions.map((revision) => revision.id),
    ['rev-a', 'rev-b'],
  );
  assert.deepEqual(sent.expectedHeads, { 'file-a': null });
  assert.deepEqual(
    store.acks.map((ack) => ack.mutationId),
    ['mutation-1', 'mutation-2'],
  );
  assert.deepEqual((await store.pending(accountId, workspaceId)).length, 0);
});

await test('an edit to a remotely deleted note is kept as a recovered note', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'));
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  let pulls = 0;
  const ops = stubOperations({
    commit: () => Promise.resolve(staleHead('file-a')),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    () => {
      pulls += 1;
      return Promise.resolve('done');
    },
  );
  assert.equal(outcome, 'done');
  // The workspace rebases every other stale update, so a refused update of a
  // file that already had a head means the head is now a tombstone.
  assert.equal(pulls, 1);
  assert.equal(store.acks.length, 0);
  // The refused edit is kept as a new note, not parked in a second inbox. The
  // original entry is dropped, and a fresh save carries the text under a
  // "(recovered)" name beside the note it came from.
  assert.equal(store.discarded.includes('mutation-2'), true);
  const kept = store.queued();
  assert.ok(kept !== null);
  const revision = kept.input.revisions[0];
  assert.equal(revision?.deleted, false);
  // The recovered note carries the frozen text of the refused save, which
  // the checkpoint of that save holds (record 0085).
  assert.equal(
    revision?.content.kind === 'markdown'
      ? (store.revisionTexts.get(revision.id) ?? null)
      : null,
    '# B\n',
  );
  assert.equal(revision?.path, 'notes/file-a (recovered).md');
  // Nothing is parked in the recovery area for this case any more.
  assert.equal(store.recovery.length, 0);
  assert.deepEqual(notices, [
    {
      kind: 'preserved',
      mutationId: 'mutation-2',
      code: 'deleted_remotely',
      fileIds: ['file-a'],
    },
  ]);
});

await test('a preserved save writes its text into the recovery area', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'));
  const notices: SyncNotice[] = [];
  const ops = stubOperations({
    commit: () =>
      Promise.resolve({
        ok: false as const,
        problem: { status: 409, code: 'path_conflict', fileIds: ['file-a'] },
      }),
  });
  await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, []),
    noPull,
  );

  // Parking alone would leave the text in a queue row that no screen reads.
  assert.equal(store.recovery.length, 1);
  const kept = store.recovery[0];
  assert.ok(kept !== undefined);
  assert.equal(kept.text, '# B\n');
  assert.equal(kept.path, 'notes/file-a.md');
  assert.equal(kept.fileId, 'file-a');
  assert.equal(kept.reason, 'save_refused');
  assert.equal(kept.code, 'path_conflict');
  assert.equal(kept.mutationId, 'mutation-2');
  assert.equal(kept.workspaceId, workspaceId);
});

await test('a note refused by a limit of the grammar is parked with its cause', async () => {
  // Record 0182. The record kept the one code of every limit, so Needs
  // attention could not name the cause.
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'));
  const ops = stubOperations({
    commit: () =>
      Promise.resolve({
        ok: false as const,
        problem: {
          status: 422,
          code: 'unrenderable_note',
          fileIds: ['file-a'],
          noteRefusal: 'note_too_deep' as const,
        },
      }),
  });
  await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext([], []),
    noPull,
  );
  assert.equal(store.recovery.length, 1);
  assert.equal(store.recovery[0]?.code, 'unrenderable_note');
  assert.equal(store.recovery[0]?.noteRefusal, 'note_too_deep');
});

await test('a refusal code this release does not know is parked too', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'));
  const ops = stubOperations({
    commit: () =>
      Promise.resolve({
        ok: false as const,
        problem: {
          status: 409,
          code: 'a_reason_from_a_newer_server',
          fileIds: ['file-a'],
        },
      }),
  });
  await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext([], []),
    noPull,
  );
  // Parking never depends on knowing the code. The code travels with the
  // record and the interface explains it in general words.
  assert.equal(store.recovery.length, 1);
  assert.equal(store.recovery[0]?.code, 'a_reason_from_a_newer_server');
  assert.equal(store.recovery[0]?.text, '# B\n');
});

await test('permanent file failures are preserved', async () => {
  const problems: readonly Problem[] = [
    { status: 409, code: 'path_conflict', fileIds: ['file-a'] },
  ];
  for (const problem of problems) {
    const store = new FakeStore();
    store.enqueue(
      queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'),
    );
    const notices: SyncNotice[] = [];
    const delays: number[] = [];
    const ops = stubOperations({
      commit: () => Promise.resolve({ ok: false as const, problem }),
    });
    const outcome = await pushQueue(
      store,
      accountId,
      workspaceId,
      ops,
      testContext(notices, delays),
      noPull,
    );
    assert.equal(outcome, 'done');
    const kept = store.queued();
    assert.ok(kept !== null);
    assert.equal(kept.state, 'conflict');
    assert.equal(kept.input.mutationId, 'mutation-2');
    assert.deepEqual(notices, [
      {
        kind: 'preserved',
        mutationId: 'mutation-2',
        code: problem.code,
        fileIds: ['file-a'],
      },
    ]);
  }
});

await test('a purged file is forgotten, not preserved', async () => {
  // The file was permanently deleted, so its queued save can never apply.
  // Parking it, or keeping its text, would put a deleted note in front of the
  // person again, so the local trace is forgotten instead.
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'));
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    commit: () =>
      Promise.resolve({
        ok: false as const,
        problem: { status: 410, code: 'purged', fileIds: ['file-a'] },
      }),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    noPull,
  );
  assert.equal(outcome, 'done');
  assert.equal(store.queued(), null);
  assert.deepEqual(store.forgotten, ['file-a']);
  assert.equal(store.recovery.length, 0);
  assert.deepEqual(notices, []);
});

await test('an invalid graph is preserved after exactly one attempt', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'));
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    commit: () =>
      Promise.resolve({
        ok: false as const,
        problem: { status: 422, code: 'invalid_graph', fileIds: ['file-a'] },
      }),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    noPull,
  );
  assert.equal(outcome, 'done');
  assert.equal(ops.commitCalls.length, 1);
  assert.equal(store.queued()?.state, 'conflict');
  assert.deepEqual(notices, [
    {
      kind: 'preserved',
      mutationId: 'mutation-2',
      code: 'invalid_graph',
      fileIds: ['file-a'],
    },
  ]);
});

await test('an expired session pauses and a lost workspace stops the push', async () => {
  const problems: readonly Problem[] = [
    { status: 401, code: 'unauthorized', fileIds: [] },
    { status: 403, code: 'forbidden', fileIds: [] },
  ];
  for (const problem of problems) {
    const store = new FakeStore();
    store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
    const ops = stubOperations({
      commit: () => Promise.resolve({ ok: false as const, problem }),
    });
    const outcome = await pushQueue(
      store,
      accountId,
      workspaceId,
      ops,
      testContext([], []),
      noPull,
    );
    assert.equal(outcome, problem.status === 401 ? 'paused' : 'access-lost');
    assert.equal(store.acks.length, 0);
    // The digest froze on first send even though the answer refused the
    // write, so a retry repeats the same operation.
    assert.equal(store.queued()?.state, 'sending');
    assert.equal(store.queued()?.digest, 'digest-for-mutation-1');
  }
});

await test('a rebased save announces the head that it superseded', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', 'rev-old', 'm-1'));
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    commit: () =>
      Promise.resolve({
        ok: true as const,
        value: accepted('m-1', ['rev-a'], '9', [
          {
            fileId: 'file-a',
            previousHeadRevisionId: 'rev-other-device',
            acceptedRevisionId: 'rev-a',
          },
        ]),
      }),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    noPull,
  );
  assert.equal(outcome, 'done');
  assert.deepEqual(notices, [
    { kind: 'superseded', fileId: 'file-a', path: 'notes/file-a.md' },
    { kind: 'pushed', mutationIds: ['m-1'], fileIds: ['file-a'] },
  ]);
  assert.deepEqual(store.acks[0]?.superseded, [
    {
      fileId: 'file-a',
      previousHeadRevisionId: 'rev-other-device',
      acceptedRevisionId: 'rev-a',
    },
  ]);
});

await test('a refused deletion is dropped after the changes are pulled', async () => {
  const store = new FakeStore();
  const entry = queuedEntry('file-a', 'rev-a', '', 'rev-old', 'm-1');
  store.enqueue({
    ...entry,
    input: {
      ...entry.input,
      revisions: entry.input.revisions.map((revision) => ({
        ...revision,
        deleted: true,
      })),
    },
  });
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  let pulls = 0;
  const ops = stubOperations({
    commit: () => Promise.resolve(staleHead('file-a')),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    () => {
      pulls += 1;
      return Promise.resolve('done');
    },
  );
  assert.equal(outcome, 'done');
  // The accepted state is read before the entry is judged.
  assert.equal(pulls, 1);
  assert.deepEqual(store.discarded, ['m-1']);
  assert.equal((await store.pending(accountId, workspaceId)).length, 0);
  assert.equal(ops.commitCalls.length, 1);
  assert.deepEqual(notices, [
    { kind: 'delete-refused', fileId: 'file-a', path: 'notes/file-a.md' },
  ]);
});

await test('a refused create is reparented on the accepted head and resent once', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'm-1'));
  store.acceptedHeads.set('file-a', 'rev-from-other-device');
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  let attempts = 0;
  const ops = stubOperations({
    commit: (input) => {
      attempts += 1;
      if (attempts === 1) return Promise.resolve(staleHead('file-a'));
      assert.deepEqual(input.expectedHeads, {
        'file-a': 'rev-from-other-device',
      });
      return Promise.resolve({
        ok: true as const,
        value: accepted('m-1', ['rev-a'], '12'),
      });
    },
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    () => Promise.resolve('done'),
  );
  assert.equal(outcome, 'done');
  assert.equal(ops.commitCalls.length, 2);
  assert.equal((await store.pending(accountId, workspaceId)).length, 0);
  assert.deepEqual(
    store.acks.map((ack) => ack.mutationId),
    ['m-1'],
  );
  assert.deepEqual(notices, [
    { kind: 'pushed', mutationIds: ['m-1'], fileIds: ['file-a'] },
  ]);
});

await test('a resent mutation that is refused again is parked, not resent forever', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'm-1'));
  store.acceptedHeads.set('file-a', 'rev-from-other-device');
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    commit: () => Promise.resolve(staleHead('file-a')),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    () => Promise.resolve('done'),
  );
  assert.equal(outcome, 'done');
  assert.equal(ops.commitCalls.length, 2);
  assert.equal(store.queued()?.state, 'conflict');
});

await test('a refused precondition with an unreachable server defers the recovery', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'm-1'));
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    commit: () => Promise.resolve(staleHead('file-a')),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    () => Promise.resolve('deferred'),
  );
  assert.equal(outcome, 'deferred');
  // The entry keeps its work: nothing is dropped and nothing is parked.
  assert.equal(store.queued()?.state, 'sending');
  assert.equal(store.discarded.length, 0);
  assert.deepEqual(notices, []);
});

await test('transport failures back off with bounded delays and then defer', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    commit: () => Promise.reject(new Error('the network is down')),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
    noPull,
  );
  assert.equal(outcome, 'deferred');
  assert.equal(ops.commitCalls.length, 4);
  assert.deepEqual(delays, [500, 1000, 2000]);
  for (const delay of delays) assert.ok(delay <= 8500);
  assert.equal(store.queued()?.state, 'sending');
});

await test('backoff delays grow exponentially within the cap', async () => {
  assert.equal(
    backoffDelay(0, () => 0),
    500,
  );
  assert.equal(
    backoffDelay(1, () => 0),
    1000,
  );
  assert.equal(
    backoffDelay(2, () => 0),
    2000,
  );
  assert.equal(
    backoffDelay(10, () => 0),
    8000,
  );
  assert.equal(
    backoffDelay(0, () => 0.999),
    999,
  );
  assert.ok(backoffDelay(3, () => 0.5) <= 8500);
});

await test('the first pull stages, fetches, and activates a snapshot', async () => {
  const store = new FakeStore();
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  const ops = stubOperations({
    start: () =>
      Promise.resolve({
        ok: true as const,
        value: { token: 'token-1', cursor: '100', itemCount: 1 },
      }),
    page: (token, position) => {
      assert.equal(token, 'token-1');
      assert.equal(position, 0);
      return Promise.resolve({
        ok: true as const,
        value: {
          token: 'token-1',
          cursor: '100',
          items: [
            {
              fileId: 'file-a',
              revisionId: 'rev-a',
              path: 'notes/a.md',
              fileKind: 'note' as const,
              deleted: false,
            },
          ],
          nextPosition: null,
        },
      });
    },
    revision: (revisionId) => {
      assert.equal(revisionId, 'rev-a');
      return Promise.resolve({
        ok: true as const,
        value: {
          fileId: 'file-a',
          revisionId: 'rev-a',
          path: 'notes/a.md',
          fileKind: 'note' as const,
          deleted: false,
          digest: 'digest-a',
          text: '# A\n',
          // The snapshot carries the whole document of the note, which the
          // device stores as it is (record 0081).
          document: 'AAEC',
          epoch: 1,
          serverTime: '2026-09-06T10:00:00.000Z',
        },
      });
    },
    changes: (cursor) => {
      assert.equal(cursor, '100');
      return Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: '100' },
      });
    },
  });
  const outcome = await pullNew(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
  );
  assert.equal(outcome, 'done');
  assert.equal(await store.readCursor(accountId, workspaceId), '100');
  assert.equal(store.staged.get('token-1')?.state, 'active');
  assert.deepEqual(notices, [{ kind: 'snapshot-activated', count: 1 }]);
});

await test('an expired cursor restarts from a fresh snapshot and keeps the queue', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '0');
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  let starts = 0;
  const ops = stubOperations({
    changes: (cursor) => {
      if (cursor === '0')
        return Promise.resolve({
          ok: false as const,
          problem: { status: 410, code: 'snapshot_required', fileIds: [] },
        });
      return Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      });
    },
    start: () => {
      starts += 1;
      return Promise.resolve({
        ok: true as const,
        value: { token: `token-${String(starts)}`, cursor: '50', itemCount: 0 },
      });
    },
    page: (token) =>
      Promise.resolve({
        ok: true as const,
        value: { token, cursor: '50', items: [], nextPosition: null },
      }),
  });
  const outcome = await pullNew(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
  );
  assert.equal(outcome, 'done');
  assert.equal(starts, 1);
  assert.equal(await store.readCursor(accountId, workspaceId), '50');
  assert.deepEqual(
    notices.filter((notice) => notice.kind === 'snapshot-restart').length,
    1,
  );
  assert.equal(store.queued()?.input.mutationId, 'mutation-1');
});

await test('accepted work that does not fit the document reads a snapshot', async () => {
  // The feed states only the work. A device whose document cannot take it
  // must read a snapshot, which carries the whole document, rather than fail
  // on every cycle while the note shows stale text.
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '3');
  store.applyFailure = new LocalStorageError(
    'stale',
    'the accepted work does not fit this document: missing-dependency',
  );
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  let starts = 0;
  const ops = stubOperations({
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor === '3' ? '4' : cursor },
      }),
    start: () => {
      starts += 1;
      return Promise.resolve({
        ok: true as const,
        value: { token: 'token-gap', cursor: '9', itemCount: 0 },
      });
    },
    page: (token) =>
      Promise.resolve({
        ok: true as const,
        value: { token, cursor: '9', items: [], nextPosition: null },
      }),
  });
  const outcome = await pullNew(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
  );
  assert.equal(outcome, 'done');
  assert.equal(starts, 1);
  assert.deepEqual(
    notices.filter((notice) => notice.kind === 'snapshot-restart'),
    [{ kind: 'snapshot-restart', reason: 'document-gap' }],
  );
});

await test('a moved save that the server accepted settles without a send', async () => {
  // Release 0.4 froze the digest and sent the save, then lost the answer
  // before the upgrade. Record 0084: accepted work is never sent again.
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '3');
  store.legacy = [
    { mutationId: 'mutation-sent', state: 'sending', digest: 'digest-0-4' },
    { mutationId: 'mutation-lost', state: 'sending', digest: 'digest-lost' },
  ];
  const asked: string[] = [];
  const ops = stubOperations({
    mutationReceipt: (mutationId, digest) => {
      asked.push(`${mutationId}:${digest}`);
      return Promise.resolve({
        ok: true as const,
        value:
          mutationId === 'mutation-sent'
            ? {
                status: 'accepted' as const,
                accepted: accepted('mutation-sent', ['rev-sent'], '12'),
              }
            : { status: 'absent' as const, accepted: null },
      });
    },
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext([], []),
    noPull,
  );
  assert.equal(outcome, 'done');
  assert.deepEqual(asked, [
    'mutation-sent:digest-0-4',
    'mutation-lost:digest-lost',
  ]);
  assert.deepEqual(store.settled, [
    {
      mutationId: 'mutation-sent',
      receipt: {
        kind: 'accepted',
        result: accepted('mutation-sent', ['rev-sent'], '12'),
      },
    },
    { mutationId: 'mutation-lost', receipt: { kind: 'absent' } },
  ]);
  assert.equal(ops.commitCalls.length, 0);
});

await test('nothing is sent while earlier work waits for placement', async () => {
  // A save made after the upgrade can build on a moved save, so the queue
  // holds every send until the moved work is placed (record 0088).
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '3');
  store.legacy = [
    { mutationId: 'mutation-old', state: 'pending', digest: null },
  ];
  store.waitingWork = 1;
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-new'));
  const ops = stubOperations({});
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext([], []),
    noPull,
  );
  assert.equal(outcome, 'done');
  assert.equal(ops.commitCalls.length, 0);
  assert.equal(store.queued()?.input.mutationId, 'mutation-new');
});

await test('moved work reads the server before it is placed', async () => {
  // The upgrade removed every cursor, so the documents that placement needs
  // arrive only with the next snapshot.
  const store = new FakeStore();
  store.legacy = [
    { mutationId: 'mutation-old', state: 'pending', digest: null },
  ];
  store.waitingWork = 1;
  let pulls = 0;
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    stubOperations({}),
    testContext([], []),
    () => {
      pulls += 1;
      return Promise.resolve('deferred');
    },
  );
  assert.equal(outcome, 'deferred');
  assert.equal(pulls, 1);
});

await test('moved work that needs no document is placed without the server', async () => {
  // A note that only this device holds needs nothing from the server, so it
  // is placed even when the pull cannot run (record 0088).
  const store = new FakeStore();
  store.legacy = [
    { mutationId: 'mutation-new-note', state: 'pending', digest: null },
  ];
  let pulls = 0;
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    stubOperations({}),
    testContext([], []),
    () => {
      pulls += 1;
      return Promise.resolve('deferred');
    },
  );
  assert.equal(outcome, 'done');
  assert.equal(pulls, 0);
});

await test('a purge in one change page supersedes its missing deletion revision', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '3');
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  let revisionReads = 0;
  const ops = stubOperations({
    changes: (cursor) => {
      assert.equal(cursor, '3');
      return Promise.resolve({
        ok: true as const,
        value: {
          changes: [
            {
              file: {
                fileId: 'file-a',
                revisionId: 'rev-deleted',
                path: 'notes/file-a.md',
                fileKind: 'note' as const,
                deleted: true,
                digest: 'digest-deleted',
                document: null,
                text: null,
              },
              purgedFileId: null,
            },
            { file: null, purgedFileId: 'file-a' },
          ],
          nextCursor: '5',
        },
      });
    },
    revision: () => {
      revisionReads += 1;
      return Promise.resolve({
        ok: false as const,
        problem: { status: 410, code: 'purged', fileIds: ['file-a'] },
      });
    },
  });

  const outcome = await pullNew(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
  );

  assert.equal(outcome, 'done');
  assert.equal(revisionReads, 0);
  assert.deepEqual(store.applied, [
    {
      changes: [{ file: null, purgedFileId: 'file-a' }],
      nextCursor: '5',
    },
  ]);
  assert.deepEqual(notices, [{ kind: 'changes-applied', count: 1 }]);
});

await test('a purged revision mid-download restarts the snapshot once', async () => {
  const store = new FakeStore();
  const notices: SyncNotice[] = [];
  const delays: number[] = [];
  let starts = 0;
  const ops = stubOperations({
    start: () => {
      starts += 1;
      return Promise.resolve({
        ok: true as const,
        value: { token: `token-${String(starts)}`, cursor: '60', itemCount: 1 },
      });
    },
    page: (token) =>
      Promise.resolve({
        ok: true as const,
        value: {
          token,
          cursor: '60',
          items: [
            {
              fileId: 'file-a',
              revisionId: token === 'token-1' ? 'rev-gone' : 'rev-a',
              path: 'notes/a.md',
              fileKind: 'note' as const,
              deleted: false,
            },
          ],
          nextPosition: null,
        },
      }),
    revision: (revisionId) => {
      if (revisionId === 'rev-gone')
        return Promise.resolve({
          ok: false as const,
          problem: { status: 410, code: 'purged', fileIds: ['file-a'] },
        });
      return Promise.resolve({
        ok: true as const,
        value: {
          fileId: 'file-a',
          revisionId: 'rev-a',
          path: 'notes/a.md',
          fileKind: 'note' as const,
          deleted: false,
          digest: 'digest-a',
          text: '# A\n',
          document: 'AAEC',
          epoch: 1,
          serverTime: '2026-09-06T10:00:00.000Z',
        },
      });
    },
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      }),
  });
  const outcome = await pullNew(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, delays),
  );
  assert.equal(outcome, 'done');
  assert.equal(starts, 2);
  assert.equal(await store.readCursor(accountId, workspaceId), '60');
  assert.equal(store.staged.get('token-2')?.state, 'active');
});

await test('a follower takes over and syncs after the leader closes', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '10');
  const first: SyncNotice[] = [];
  const second: SyncNotice[] = [];
  const firstOps = stubOperations({
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      }),
  });
  const firstEngine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-first',
    operations: firstOps,
    announce: (notice) => {
      first.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
    sleep: (ms, signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('stopped', 'AbortError'));
          return;
        }
        setTimeout(resolve, ms);
      }),
  });
  const firstController = new AbortController();
  const firstRunning = firstEngine.run(firstController.signal);
  await waitFor(() => store.lease?.ownerId === 'owner-first');
  const followerOps = stubOperations({
    commit: (input) =>
      Promise.resolve({
        ok: true as const,
        value: accepted(input.mutationId, ['rev-a'], '11'),
      }),
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      }),
  });
  const secondEngine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-second',
    operations: followerOps,
    announce: (notice) => {
      second.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
  });
  const secondController = new AbortController();
  const secondRunning = secondEngine.run(secondController.signal);
  await waitFor(() => second.some((notice) => notice.kind === 'lease-held'));
  firstController.abort();
  await firstRunning;
  await waitFor(() => store.lease?.ownerId === 'owner-second');
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  secondEngine.requestSync();
  await waitFor(() => store.acks.length === 1);
  secondController.abort();
  await secondRunning;
  assert.equal(store.lease, null);
  assert.equal(followerOps.commitCalls.length, 1);
});

await test('an explicit request wakes the engine before its safety interval', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  let pulls = 0;
  const ops = stubOperations({
    changes: (cursor) => {
      pulls += 1;
      return Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      });
    },
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-wake',
    operations: ops,
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: () => new Promise<void>(() => {}),
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => pulls === 1);
  engine.requestSync();
  await waitFor(() => pulls === 2);
  controller.abort();
  engine.stop();
  await running;
  assert.equal(pulls, 2);
});

await test('many requests in one cycle ask for one more pass', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  let pulls = 0;
  let resume: (() => void) | null = null;
  const ops = stubOperations({
    changes: async (cursor) => {
      pulls += 1;
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
      return { ok: true as const, value: { changes: [], nextCursor: cursor } };
    },
  });
  /** Lets the pass that waits on the server finish. */
  async function finishPass(): Promise<void> {
    await waitFor(() => resume !== null);
    const go = resume;
    resume = null;
    if (go === null) throw new Error('The pass held no resume function.');
    go();
  }
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-coalesce',
    operations: ops,
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    // A safety interval that never ends, so only a request starts a pass.
    // It still stops with the run, which lets the engine close at the end.
    sleep: (_ms, signal) =>
      new Promise<void>((_resolve, reject) => {
        const stop = (): void => {
          reject(new DOMException('The sync run stopped.', 'AbortError'));
        };
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      }),
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);

  // The first pass is in flight. Three requests arrive while it runs, which
  // is what a person who moves between windows quickly produces.
  await waitFor(() => pulls === 1);
  engine.requestSync();
  engine.requestSync();
  engine.requestSync();
  await finishPass();

  // The three requests name one more pass between them, not one pass each.
  await waitFor(() => pulls === 2);
  await finishPass();

  // The safety interval never ends in this test, so only a request can start
  // another pass. One does, which proves the engine rests after the second
  // pass and that the count above is the whole answer.
  engine.requestSync();
  await waitFor(() => pulls === 3);
  await finishPass();
  assert.equal(pulls, 3);

  controller.abort();
  engine.stop();
  await running;
});

await test('an expired session pauses the run without sending anything', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  const notices: SyncNotice[] = [];
  const ops = stubOperations({
    verifySession: () =>
      Promise.resolve({
        ok: false as const,
        problem: { status: 401, code: 'unauthorized', fileIds: [] },
      }),
    commit: () => Promise.reject(new Error('nothing may be sent paused')),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-1',
    operations: ops,
    announce: (notice) => {
      notices.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => notices.some((notice) => notice.kind === 'paused'));
  assert.equal(ops.commitCalls.length, 0);
  assert.equal(store.queued()?.state, 'pending');
  controller.abort();
  await running;
  assert.equal(store.lease, null);
});

await test('a session of another account pauses the run and keeps the queue', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  const notices: SyncNotice[] = [];
  let checks = 0;
  const ops = stubOperations({
    // The cookie of the browser names the other account for three checks,
    // then the first account signs in again.
    verifySession: () => {
      checks += 1;
      return Promise.resolve({
        ok: true as const,
        value: { accountId: checks <= 3 ? 'account-2' : accountId },
      });
    },
    commit: (input) =>
      Promise.resolve(
        checks <= 3
          ? {
              ok: false as const,
              problem: { status: 403, code: 'forbidden', fileIds: [] },
            }
          : {
              ok: true as const,
              value: accepted(input.mutationId, ['rev-a'], 'cursor-1'),
            },
      ),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-1',
    operations: ops,
    announce: (notice) => {
      notices.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => notices.some((notice) => notice.kind === 'pushed'));
  controller.abort();
  await running;
  // Nothing went up with the cookie of the other account, the work stayed in
  // the queue and out of recovery, and the person read one cause.
  assert.equal(ops.commitCalls.length, 1);
  assert.equal(store.recovery.length, 0);
  assert.deepEqual(
    notices.filter(
      (notice) => notice.kind === 'paused' || notice.kind === 'access-lost',
    ),
    [{ kind: 'paused', reason: 'other-account' }],
  );
  assert.ok(notices.some((notice) => notice.kind === 'resumed'));
  assert.equal(store.acks.length, 1);
});

await test('a session that returns after a pause resumes and loses no access', async () => {
  const store = new FakeStore();
  const notices: SyncNotice[] = [];
  let checks = 0;
  const ops = stubOperations({
    verifySession: () => {
      checks += 1;
      return Promise.resolve(
        checks === 1
          ? {
              ok: false as const,
              problem: { status: 401, code: 'unauthorized', fileIds: [] },
            }
          : { ok: true as const, value: { accountId } },
      );
    },
    start: () =>
      Promise.resolve({
        ok: true as const,
        value: { token: 'token-1', cursor: 'cursor-1', itemCount: 0 },
      }),
    page: () =>
      Promise.resolve({
        ok: true as const,
        value: {
          token: 'token-1',
          cursor: 'cursor-1',
          items: [],
          nextPosition: null,
        },
      }),
    changes: () =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: 'cursor-1' },
      }),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-1',
    operations: ops,
    announce: (notice) => {
      notices.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => checks >= 3);
  controller.abort();
  await running;
  assert.deepEqual(
    notices
      .filter(
        (notice) =>
          notice.kind === 'paused' ||
          notice.kind === 'access-lost' ||
          notice.kind === 'resumed',
      )
      .map((notice) => notice.kind),
    ['paused', 'resumed'],
  );
});

await test('a refusal after another account signs in names that account', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  const notices: SyncNotice[] = [];
  let checks = 0;
  const ops = stubOperations({
    // The run checks twice before its first send, and both checks pass. The
    // other account signs in before the send, so the send is refused and
    // every later check names the other account.
    verifySession: () => {
      checks += 1;
      return Promise.resolve({
        ok: true as const,
        value: { accountId: checks <= 2 ? accountId : 'account-2' },
      });
    },
    commit: () =>
      Promise.resolve({
        ok: false as const,
        problem: { status: 403, code: 'forbidden', fileIds: [] },
      }),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-1',
    operations: ops,
    announce: (notice) => {
      notices.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => checks >= 5);
  controller.abort();
  await running;
  assert.equal(ops.commitCalls.length, 1);
  assert.equal(store.queued()?.state, 'sending');
  assert.equal(store.recovery.length, 0);
  assert.deepEqual(
    notices.filter(
      (notice) => notice.kind === 'paused' || notice.kind === 'access-lost',
    ),
    [{ kind: 'paused', reason: 'other-account' }],
  );
});

await test('a server with a later protocol gets no push and no pull', async () => {
  // Record 0086. A cached client must not send a format that the server no
  // longer reads, and it must not read a feed it cannot apply.
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  const notices: SyncNotice[] = [];
  let reads = 0;
  const ops = stubOperations({
    syncProtocol: () => {
      reads += 1;
      return Promise.resolve({
        ok: true as const,
        value: { versions: [syncProtocolVersion + 1] },
      });
    },
    commit: () => Promise.reject(new Error('nothing may be sent')),
    start: () => Promise.reject(new Error('nothing may be pulled')),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-1',
    operations: ops,
    announce: (notice) => {
      notices.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  // Three reads prove that the check repeats each cycle, and the notice list
  // below proves that the misfit is said once and not on every cycle.
  await waitFor(() => reads >= 3);
  controller.abort();
  await running;
  assert.equal(ops.commitCalls.length, 0);
  // The save waits with its frozen body, so the next send repeats it.
  assert.notEqual(store.queued(), null);
  assert.notEqual(store.queued()?.state, 'conflict');
  assert.equal(store.recovery.length, 0);
  assert.deepEqual(
    notices.filter((notice) => notice.kind === 'protocol'),
    [{ kind: 'protocol', fit: 'client-behind' }],
  );
  assert.equal(store.lease, null);
});

await test('a server without the protocol operation serves version 1', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  store.cursors.set(`${accountId}/${workspaceId}`, '0');
  const notices: SyncNotice[] = [];
  const ops = stubOperations({
    syncProtocol: () =>
      Promise.resolve({
        ok: false as const,
        problem: { status: 404, code: 'route_not_found', fileIds: [] },
      }),
    commit: (input) =>
      Promise.resolve({
        ok: true as const,
        value: accepted(input.mutationId, ['rev-a'], '1'),
      }),
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      }),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-1',
    operations: ops,
    announce: (notice) => {
      notices.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => ops.commitCalls.length === 1);
  controller.abort();
  await running;
  // Version 1 is the version of this build, so a legacy server fits.
  assert.equal(syncProtocolVersion, 1);
  assert.equal(
    notices.some((notice) => notice.kind === 'protocol'),
    false,
  );
});

await test('a server that rolled back makes the client wait, then resume', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  store.cursors.set(`${accountId}/${workspaceId}`, '0');
  const notices: SyncNotice[] = [];
  let served: readonly number[] = [syncProtocolVersion - 1];
  let reads = 0;
  const ops = stubOperations({
    syncProtocol: () => {
      reads += 1;
      return Promise.resolve({
        ok: true as const,
        value: { versions: served },
      });
    },
    commit: (input) =>
      Promise.resolve({
        ok: true as const,
        value: accepted(input.mutationId, ['rev-a'], '1'),
      }),
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      }),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-1',
    operations: ops,
    announce: (notice) => {
      notices.push(notice);
    },
    pollIntervalMs: 5,
    leaseTtlMs: 60_000,
    random: () => 0,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => reads >= 2);
  assert.equal(ops.commitCalls.length, 0);
  served = [syncProtocolVersion];
  await waitFor(() => ops.commitCalls.length === 1);
  controller.abort();
  await running;
  assert.deepEqual(
    notices.filter((notice) => notice.kind === 'protocol'),
    [
      { kind: 'protocol', fit: 'server-behind' },
      { kind: 'protocol', fit: 'compatible' },
    ],
  );
});

await test('a stop answer of 503 keeps a queued save queued', async () => {
  // Record 0086. A new server stops a client from before the compatibility
  // release with an answer that its engine already handles. A 503 is retried
  // with a bound and then deferred, so the save stays in the queue and never
  // reaches the recovery area. A new refusal code would park it instead; see
  // the test above for an unknown code.
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'));
  const delays: number[] = [];
  const ops = stubOperations({
    commit: () =>
      Promise.resolve({
        ok: false as const,
        problem: {
          status: 503,
          code: 'sync_protocol_unsupported',
          fileIds: [],
        },
      }),
  });
  const outcome = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext([], delays),
    noPull,
  );
  assert.equal(outcome, 'deferred');
  assert.equal(ops.commitCalls.length, 4);
  assert.equal(delays.length, 3);
  assert.notEqual(store.queued(), null);
  assert.notEqual(store.queued()?.state, 'conflict');
  assert.equal(store.recovery.length, 0);
  assert.equal(store.discarded.length, 0);
});

await test('a save refused for a locked account stays queued and goes once it is active', async () => {
  // Record 0201. A locked account keeps a refused save in its queue, as a
  // full account does, because the account can become active again.
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-b', '# B\n', 'rev-a', 'mutation-2'));
  let locked = true;
  const ops = stubOperations({
    commit: () =>
      locked
        ? Promise.resolve({
            ok: false as const,
            problem: { status: 423, code: 'account_locked', fileIds: [] },
          })
        : Promise.resolve({
            ok: true as const,
            value: accepted('mutation-2', ['rev-b'], '8'),
          }),
  });
  const notices: SyncNotice[] = [];
  const refused = await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, []),
    noPull,
  );
  assert.equal(refused, 'done');
  assert.equal(ops.commitCalls.length, 1);
  // The save waits with its frozen body, so the next send repeats it.
  assert.notEqual(store.queued(), null);
  assert.notEqual(store.queued()?.state, 'conflict');
  assert.equal(store.recovery.length, 0);
  assert.equal(store.discarded.length, 0);
  assert.deepEqual(
    notices.filter((notice) => notice.kind === 'preserved'),
    [],
  );
  // The screen hears it, and reads the account again.
  assert.deepEqual(
    notices.filter((notice) => notice.kind === 'account-locked'),
    [{ kind: 'account-locked' }],
  );
  // The account is active again, and the next cycle sends the same save.
  locked = false;
  await pushQueue(
    store,
    accountId,
    workspaceId,
    ops,
    testContext([], []),
    noPull,
  );
  assert.equal(ops.commitCalls.length, 2);
  assert.deepEqual(store.acks, [accepted('mutation-2', ['rev-b'], '8')]);
  assert.equal((await store.pending(accountId, workspaceId)).length, 0);
});

await test('the worker lease is exclusive, renewable, and taken over on expiry', async () => {
  const store = new FakeStore();
  store.nowMs = 1_000_000;
  assert.equal(
    await acquireWorkerLease(store, {
      ownerId: 'owner-a',
      ttlMs: 1000,
      clock: () => store.nowMs,
    }),
    true,
  );
  assert.equal(
    await acquireWorkerLease(store, {
      ownerId: 'owner-b',
      ttlMs: 1000,
      clock: () => store.nowMs,
    }),
    false,
  );
  assert.equal(
    await acquireWorkerLease(store, {
      ownerId: 'owner-a',
      ttlMs: 1000,
      clock: () => store.nowMs,
    }),
    true,
  );
  store.nowMs += 2000;
  assert.equal(
    await acquireWorkerLease(store, {
      ownerId: 'owner-b',
      ttlMs: 1000,
      clock: () => store.nowMs,
    }),
    true,
  );
  await releaseWorkerLease(store, 'owner-a');
  assert.notEqual(store.lease, null);
  await releaseWorkerLease(store, 'owner-b');
  assert.equal(store.lease, null);
});

await test('an early wake stops the sleep that it raced', async () => {
  // The defect this covers: the engine raced its sleep against the wake and
  // kept whichever lost. The web application asks for a pass on every change
  // of the queue, so a long writing session held one live timer and one live
  // abort listener for each early wake.
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  let pulls = 0;
  const ops = stubOperations({
    changes: (cursor) => {
      pulls += 1;
      return Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      });
    },
  });
  /** One sleep of the engine, and whether it was stopped. */
  const sleeps: { stopped: boolean; listeners: number }[] = [];
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-early-wake',
    operations: ops,
    pollIntervalMs: 600_000,
    leaseTtlMs: 1_200_000,
    sleep: (_ms, signal) =>
      new Promise<void>((_resolve, reject) => {
        const record = { stopped: false, listeners: 1 };
        sleeps.push(record);
        const stop = (): void => {
          record.stopped = true;
          record.listeners -= 1;
          reject(new DOMException('The sync run stopped.', 'AbortError'));
        };
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      }),
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => pulls === 1);

  // Three early wakes, which is what a person who writes produces.
  for (let round = 2; round <= 4; round += 1) {
    engine.requestSync();
    await waitFor(() => pulls === round);
  }
  await waitFor(() => sleeps.length >= 3);

  // Every sleep that a wake beat is stopped, so no timer and no listener
  // outlives its own cycle. The last one is still resting.
  const finished = sleeps.slice(0, -1);
  assert.ok(finished.length >= 2);
  for (const record of finished) {
    assert.equal(record.stopped, true);
    assert.equal(record.listeners, 0);
  }

  controller.abort();
  engine.stop();
  await running;
  for (const record of sleeps) assert.equal(record.stopped, true);
});

/** A sleep that never ends by itself and stops with the run. */
function endlessSleep(_ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((_resolve, reject) => {
    const stop = (): void => {
      reject(new DOMException('The sync run stopped.', 'AbortError'));
    };
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
  });
}

/** A feed of membership pages from `from` to `to`, one record each. */
function membershipFeed(
  to: number,
  reads: string[],
): SnapshotNetwork['changes'] {
  return (cursor) => {
    reads.push(cursor);
    const at = Number(cursor);
    if (at >= to)
      return Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      });
    // A membership record only moves the cursor, and it still ends a page
    // that can have a successor.
    return Promise.resolve({
      ok: true as const,
      value: {
        changes: [{ file: null, purgedFileId: null }],
        nextCursor: String(at + 1),
      },
    });
  };
}

await test('one wake drains a backlog of several pages with no later notice', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  const reads: string[] = [];
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-drain',
    operations: stubOperations({ changes: membershipFeed(23, reads) }),
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => reads.length === 4);
  assert.deepEqual(reads, ['20', '21', '22', '23']);
  assert.equal(store.cursors.get(`${accountId}/${workspaceId}`), '23');
  controller.abort();
  engine.stop();
  await running;
});

await test('a long backlog drains in bounded turns without a request', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '0');
  const reads: string[] = [];
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-turns',
    operations: stubOperations({ changes: membershipFeed(25, reads) }),
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => reads.at(-1) === '25');
  assert.equal(reads.length, 26);
  assert.equal(store.cursors.get(`${accountId}/${workspaceId}`), '25');
  controller.abort();
  engine.stop();
  await running;
});

await test('an engine on a lease gate never takes or gives back the lease', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  const reads: string[] = [];
  let holds = 0;
  let releases = 0;
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-gate',
    operations: stubOperations({ changes: membershipFeed(20, reads) }),
    pollIntervalMs: 60_000,
    sleep: endlessSleep,
    lease: {
      hold: () => {
        holds += 1;
        return Promise.resolve(true);
      },
      release: () => {
        releases += 1;
        return Promise.resolve();
      },
    },
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => reads.length === 1);
  controller.abort();
  engine.stop();
  await running;
  assert.ok(holds >= 1);
  assert.equal(releases, 1);
  assert.equal(store.lease, null, 'the engine wrote no lease row');
});

await test('an engine whose gate is closed sends and reads nothing', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  const reads: string[] = [];
  let holds = 0;
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-closed',
    operations: stubOperations({ changes: membershipFeed(21, reads) }),
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
    lease: {
      hold: () => {
        holds += 1;
        return Promise.resolve(holds > 2);
      },
      release: () => Promise.resolve(),
    },
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  // Each wake asks the gate again. The gate opens on its third answer.
  await waitFor(() => holds === 1);
  engine.requestSync();
  await waitFor(() => holds === 2);
  assert.deepEqual(reads, []);
  engine.requestSync();
  await waitFor(() => reads.length === 2);
  controller.abort();
  engine.stop();
  await running;
});

await test('a wake with no new page moves no cursor', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  let reads = 0;
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-quiet',
    operations: stubOperations({
      changes: () => {
        reads += 1;
        return Promise.resolve({
          ok: false as const,
          problem: { status: 503, code: 'shutting_down', fileIds: [] },
        });
      },
    }),
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    // The backoff of a refused read ends at once, and the rest never does.
    sleep: (ms, signal) =>
      ms < 60_000 ? Promise.resolve() : endlessSleep(ms, signal),
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => reads >= 1);
  engine.requestSync();
  await waitFor(() => reads >= 2);
  assert.equal(store.cursors.get(`${accountId}/${workspaceId}`), '20');
  controller.abort();
  engine.stop();
  await running;
});

await test('the interval is read before each rest', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  const rests: number[] = [];
  let long = false;
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-interval',
    operations: stubOperations({ changes: membershipFeed(20, []) }),
    leaseTtlMs: 120_000,
    interval: () => (long ? 300_000 : 15_000),
    sleep: (ms, signal) => {
      rests.push(ms);
      return endlessSleep(ms, signal);
    },
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => rests.length === 1);
  long = true;
  engine.requestSync();
  await waitFor(() => rests.length === 2);
  assert.deepEqual(rests, [15_000, 300_000]);
  controller.abort();
  engine.stop();
  await running;
});

await test('an engine on a gate waits for a lost lease and goes on', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '20');
  const reads: string[] = [];
  let open = true;
  const notices: SyncNotice[] = [];
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-regain',
    operations: stubOperations({ changes: membershipFeed(20, reads) }),
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
    announce: (notice) => notices.push(notice),
    lease: {
      hold: () => Promise.resolve(open),
      release: () => Promise.resolve(),
    },
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  let ended = false;
  void running.then(() => {
    ended = true;
  });
  await waitFor(() => reads.length === 1);
  // Another tab takes the lease: the next pass finds the gate closed.
  open = false;
  engine.requestSync();
  await waitFor(() => notices.some((notice) => notice.kind === 'lease-lost'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(ended, false, 'the run waits for the lease instead of ending');
  // The lease comes back, and a wake starts a pass again.
  open = true;
  engine.requestSync();
  await waitFor(() => reads.length === 2);
  controller.abort();
  engine.stop();
  await running;
});

await test('a save that waits ends a pull turn between two pages', async () => {
  // Record 0176. A turn reads up to ten pages, and a save made during a
  // long backlog waited for the whole turn.
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '0');
  const reads: string[] = [];
  const feed = membershipFeed(25, reads);
  let readsAtCommit: number | null = null;
  let engine: ReturnType<typeof createSyncEngine> | null = null;
  const ops = stubOperations({
    changes: (cursor, signal) => {
      if (cursor === '2') {
        store.enqueue(
          queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-late'),
        );
        engine?.requestSync();
      }
      return feed(cursor, signal);
    },
    commit: () => {
      readsAtCommit = reads.length;
      return Promise.resolve({
        ok: true as const,
        value: accepted('mutation-late', ['rev-a'], '99'),
      });
    },
  });
  engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-yield',
    operations: ops,
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => readsAtCommit !== null);
  // The page of cursor 2 asked for the save, and the turn ended after it.
  assert.equal(readsAtCommit, 3);
  await waitFor(() => reads.at(-1) === '25');
  controller.abort();
  engine.stop();
  await running;
});

await test('a wake for a notice alone lets the pull read its whole turn', async () => {
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '0');
  const reads: string[] = [];
  const feed = membershipFeed(25, reads);
  let engine: ReturnType<typeof createSyncEngine> | null = null;
  let accountReads = 0;
  const ops = stubOperations({
    changes: (cursor, signal) => {
      if (cursor === '2') engine?.requestSync();
      return feed(cursor, signal);
    },
    verifySession: () => {
      accountReads += 1;
      return Promise.resolve({ ok: true as const, value: { accountId } });
    },
  });
  engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-notice',
    operations: ops,
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => reads.at(-1) === '25');
  // Pages 0 to 9 are one turn, 10 to 19 the next, 20 to 25 the last. The
  // first check of the run and one check for each turn read the session.
  assert.equal(accountReads, 4);
  controller.abort();
  engine.stop();
  await running;
});

await test('a pass reads the session and the protocol at the same time', async () => {
  // Record 0176. The two reads one after the other cost one round trip
  // before every save.
  const store = new FakeStore();
  store.cursors.set(`${accountId}/${workspaceId}`, '5');
  let protocolAsked = false;
  let releaseSession: () => void = () => {};
  let sessionChecks = 0;
  const ops = stubOperations({
    verifySession: () => {
      sessionChecks += 1;
      // The first check of the run comes before any pass.
      if (sessionChecks === 1)
        return Promise.resolve({ ok: true as const, value: { accountId } });
      return new Promise((resolve) => {
        releaseSession = () => {
          resolve({ ok: true as const, value: { accountId } });
        };
      });
    },
    syncProtocol: () => {
      protocolAsked = true;
      return Promise.resolve({
        ok: true as const,
        value: { versions: [syncProtocolVersion] },
      });
    },
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      }),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-parallel',
    operations: ops,
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() => sessionChecks === 2);
  await waitFor(() => protocolAsked);
  releaseSession();
  controller.abort();
  engine.stop();
  await running;
});

await test('a pass of another account sends nothing though the protocol answered', async () => {
  const store = new FakeStore();
  store.enqueue(queuedEntry('file-a', 'rev-a', '# A\n', null, 'mutation-1'));
  const notices: SyncNotice[] = [];
  const ops = stubOperations({
    verifySession: () =>
      Promise.resolve({
        ok: true as const,
        value: { accountId: 'account-other' },
      }),
  });
  const engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-other',
    operations: ops,
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
    announce: (notice) => {
      notices.push(notice);
    },
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(() =>
    notices.some(
      (notice) => notice.kind === 'paused' && notice.reason === 'other-account',
    ),
  );
  assert.equal(ops.commitCalls.length, 0);
  assert.equal((await store.pending(accountId, workspaceId)).length, 1);
  controller.abort();
  engine.stop();
  await running;
});

await test('a snapshot reads a few revisions at a time and activates them all', async () => {
  // Record 0176. One revision at a time, a first sync of a thousand notes
  // took most of the time that a save of the device waited.
  const store = new FakeStore();
  const count = 7;
  const ids = Array.from(
    { length: count },
    (_, index) => `rev-${String(index)}`,
  );
  let inFlight = 0;
  let widest = 0;
  const ops = stubOperations({
    start: () =>
      Promise.resolve({
        ok: true as const,
        value: { token: 'token-wide', cursor: '40', itemCount: count },
      }),
    page: () =>
      Promise.resolve({
        ok: true as const,
        value: {
          token: 'token-wide',
          cursor: '40',
          items: ids.map((revisionId, index) => ({
            fileId: `file-${String(index)}`,
            revisionId,
            path: `notes/${String(index)}.md`,
            fileKind: 'note' as const,
            deleted: false,
          })),
          nextPosition: null,
        },
      }),
    revision: async (revisionId) => {
      inFlight += 1;
      widest = Math.max(widest, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      const index = ids.indexOf(revisionId);
      return {
        ok: true as const,
        value: {
          fileId: `file-${String(index)}`,
          revisionId,
          path: `notes/${String(index)}.md`,
          fileKind: 'note' as const,
          deleted: false,
          digest: `digest-${String(index)}`,
          text: `# ${String(index)}\n`,
          document: 'AAEC',
          epoch: 1,
          serverTime: '2026-10-02T10:00:00.000Z',
        },
      };
    },
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      }),
  });
  const notices: SyncNotice[] = [];
  const outcome = await pullNew(
    store,
    accountId,
    workspaceId,
    ops,
    testContext(notices, []),
  );
  assert.equal(outcome, 'done');
  assert.equal(widest, snapshotFetchConcurrency);
  assert.equal(store.staged.get('token-wide')?.state, 'active');
  assert.deepEqual(notices, [{ kind: 'snapshot-activated', count }]);
});

await test('a snapshot that one revision refuses stops every reader', async () => {
  const store = new FakeStore();
  const ids = ['rev-0', 'rev-1', 'rev-2', 'rev-3', 'rev-4', 'rev-5'];
  const asked: string[] = [];
  const ops = stubOperations({
    start: () =>
      Promise.resolve({
        ok: true as const,
        value: { token: 'token-stop', cursor: '41', itemCount: ids.length },
      }),
    page: () =>
      Promise.resolve({
        ok: true as const,
        value: {
          token: 'token-stop',
          cursor: '41',
          items: ids.map((revisionId, index) => ({
            fileId: `file-${String(index)}`,
            revisionId,
            path: `notes/${String(index)}.md`,
            fileKind: 'note' as const,
            deleted: false,
          })),
          nextPosition: null,
        },
      }),
    revision: (revisionId) => {
      asked.push(revisionId);
      return Promise.resolve({
        ok: false as const,
        problem: { status: 401, code: 'unauthorized', fileIds: [] },
      });
    },
  });
  const outcome = await pullNew(
    store,
    accountId,
    workspaceId,
    ops,
    testContext([], []),
  );
  assert.equal(outcome, 'paused');
  assert.equal(asked.length, snapshotFetchConcurrency);
  assert.notEqual(store.staged.get('token-stop')?.state, 'active');
});

await test('a save during a snapshot goes first, and the snapshot reads on', async () => {
  // Record 0176. A save of a device in its first sync waited for the whole
  // snapshot, about 19 s for a thousand notes. Now the reads stop for it, and
  // the next staging keeps every revision that they read.
  const store = new FakeStore();
  const ids = Array.from({ length: 9 }, (_, index) => `rev-${String(index)}`);
  const asked: string[] = [];
  let starts = 0;
  let commitAt: number | null = null;
  let engine: ReturnType<typeof createSyncEngine> | null = null;
  const item = (revisionId: string) => {
    const index = ids.indexOf(revisionId);
    return {
      fileId: `file-${String(index)}`,
      revisionId,
      path: `notes/${String(index)}.md`,
      fileKind: 'note' as const,
      deleted: false,
    };
  };
  const ops = stubOperations({
    start: () => {
      starts += 1;
      const token = `token-${String(starts)}`;
      return Promise.resolve({
        ok: true as const,
        value: { token, cursor: '50', itemCount: ids.length },
      });
    },
    page: (token) =>
      Promise.resolve({
        ok: true as const,
        value: {
          token,
          cursor: '50',
          items: ids.map(item),
          nextPosition: null,
        },
      }),
    revision: async (revisionId) => {
      asked.push(revisionId);
      if (asked.length === 4) {
        store.enqueue(
          queuedEntry('file-new', 'rev-new', '# New\n', null, 'mutation-new'),
        );
        engine?.requestSync();
      }
      await new Promise((resolve) => setImmediate(resolve));
      return {
        ok: true as const,
        value: {
          ...item(revisionId),
          digest: `digest-${revisionId}`,
          text: '# Note\n',
          document: 'AAEC',
          epoch: 1,
          serverTime: '2026-10-02T10:00:00.000Z',
        },
      };
    },
    changes: (cursor) =>
      Promise.resolve({
        ok: true as const,
        value: { changes: [], nextCursor: cursor },
      }),
    commit: () => {
      commitAt = asked.length;
      return Promise.resolve({
        ok: true as const,
        value: accepted('mutation-new', ['rev-new'], '51'),
      });
    },
  });
  engine = createSyncEngine(store, accountId, workspaceId, {
    ownerId: 'owner-snapshot-yield',
    operations: ops,
    pollIntervalMs: 60_000,
    leaseTtlMs: 120_000,
    sleep: endlessSleep,
  });
  const controller = new AbortController();
  const running = engine.run(controller.signal);
  await waitFor(
    () => store.cursors.get(`${accountId}/${workspaceId}`) === '50',
  );
  // The save went before the rest of the snapshot.
  assert.ok(commitAt !== null && commitAt < ids.length, String(commitAt));
  // The second plan read only what the first one had not: no revision twice.
  assert.equal(new Set(asked).size, asked.length);
  assert.equal(asked.length, ids.length);
  assert.equal(starts, 2);
  controller.abort();
  engine.stop();
  await running;
});
