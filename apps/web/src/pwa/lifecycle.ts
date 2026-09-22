/**
 * Installed application lifecycle of notesapp.
 *
 * This module owns the rules that the design states for the PWA lifecycle
 * and for access changes. It performs no network traffic itself except
 * through the generated client: session revocation calls the generated
 * `signOut` operation, and every other step reads or writes the local store.
 * There is no Background Sync path; the foreground tab drives sync.
 *
 * - Offline readiness needs stored Markdown and stored application assets.
 *   Attachment completeness is reported separately and never blocks editing.
 * - Persistent storage is requested where supported. A denial or an
 *   eviction stops the claim of persistence instead of discarding drafts.
 * - An update across every open tab lives in `update.ts` (record 0086).
 * - Online sign-out settles or explicitly discards pending work, then
 *   revokes the session and clears private data. Offline sign-out needs an
 *   explicit discard, clears private data, and records a marker that
 *   reconnect completes by revoking first and clearing the marker after.
 */
import { signOut as signOutRequest } from '@notesapp/api-client';
import {
  blockedUpgradeInstructions,
  isBlockedUpgradeError,
} from '@notesapp/storage-browser';
import {
  isLocalStorageError,
  type LocalStore,
  type RecoveryReason,
  type RecoveryRecord,
} from '@notesapp/sync';

/** What offline launch of one workspace needs. */
export type OfflineReadiness = {
  /** Every required Markdown body of the active workspace is stored. */
  readonly markdownComplete: boolean;
  /** The shell, editor, fonts, math, and diagram modules are cached. */
  readonly appAssetsComplete: boolean;
  /** Every referenced attachment chosen for offline use is stored. */
  readonly attachmentsComplete: boolean;
};

/**
 * Whether one workspace is ready for offline work.
 *
 * Markdown and application assets are required. Attachment completeness is
 * a separate status and never blocks readiness.
 */
export function isReadyOffline(state: OfflineReadiness): boolean {
  return state.markdownComplete && state.appAssetsComplete;
}

/** One download position with its percent and completion flag. */
export type DownloadProgress = {
  readonly downloaded: number;
  readonly total: number;
  readonly percent: number;
  readonly complete: boolean;
};

/**
 * Summarizes one download position.
 *
 * A total of zero means there is nothing to fetch, so the download is
 * complete at 100 percent rather than divided by zero.
 */
export function downloadProgress(
  downloaded: number,
  total: number,
): DownloadProgress {
  const safeDownloaded = Math.max(0, Math.floor(downloaded));
  const safeTotal = Math.max(0, Math.floor(total));
  if (safeTotal === 0)
    return { downloaded: 0, total: 0, percent: 100, complete: true };
  const clamped = Math.min(safeDownloaded, safeTotal);
  return {
    downloaded: clamped,
    total: safeTotal,
    percent: Math.round((clamped / safeTotal) * 100),
    complete: clamped >= safeTotal,
  };
}

/** The outcome of a persistent storage request. */
export type PersistenceRequest = 'granted' | 'denied' | 'unsupported';

/**
 * Asks the browser to retain local data across eviction pressure.
 *
 * A denial does not discard drafts: the caller keeps the in-memory buffer
 * with clipboard access and stops claiming durable offline editing.
 */
export function requestPersistentStorage(): Promise<PersistenceRequest> {
  if (
    typeof navigator === 'undefined' ||
    navigator.storage === undefined ||
    typeof navigator.storage.persist !== 'function'
  )
    return Promise.resolve('unsupported');
  return navigator.storage
    .persist()
    .then((granted) => (granted ? 'granted' : 'denied'))
    .catch(() => 'denied');
}

/** The message shown when persistence is denied or storage is evicted. */
export function persistenceDenialMessage(): string {
  return (
    'This browser refused persistent storage, so offline work is not durable here. ' +
    'Keep this tab open, copy important text with the clipboard, and free device space. ' +
    'No draft is discarded by this warning.'
  );
}

/**
 * Turns a local failure into one readable sentence for a status region.
 *
 * The message names the problem only, never note content.
 */
export function describeStorageFailure(error: unknown): string {
  if (!isLocalStorageError(error)) return 'Local storage failed unexpectedly.';
  if (error.kind === 'quota')
    return 'Local storage is full. Free device space; drafts stay in memory.';
  if (error.kind === 'unavailable') return persistenceDenialMessage();
  if (error.kind === 'corrupt' && isBlockedUpgradeError(error))
    return blockedUpgradeInstructions;
  if (error.kind === 'corrupt')
    return 'Stored data is unreadable. Keep this tab open and copy important text.';
  return 'A local write did not commit. The draft stays in memory for retry.';
}

/** Why a sign-out cannot continue yet. */
export class SignOutBlockedError extends Error {
  readonly code: 'needs-discard';

  constructor(code: 'needs-discard', detail: string) {
    super(detail);
    this.name = 'SignOutBlockedError';
    this.code = code;
  }
}

/**
 * Registers the installed worker after the document finishes loading.
 *
 * Registration starts the install, and the install fetches every entry of the
 * precache manifest. A browser opens six connections to one host, so a
 * precache that starts while the document still loads takes the connections
 * that the document needs for its own modules, and the screen waits behind the
 * worker. The `load` event is the point where the document has what it asked
 * for, so the worker starts there and the person sees the screen first. See
 * [decision 0044](../../../../docs/decisions/0044-the-worker-stays-out-of-the-first-load.md).
 *
 * Safe to call where no worker is supported and where there is no document.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined') return;
  const container = navigator.serviceWorker;
  if (container === undefined) return;
  const register = (): void => {
    void container.register('/service-worker.js').catch(() => undefined);
  };
  if (typeof window === 'undefined' || document.readyState === 'complete') {
    register();
    return;
  }
  window.addEventListener('load', register, { once: true });
}

/** Revokes the server session through the generated client. */
export function revokeSessionViaClient(): Promise<void> {
  return signOutRequest({ body: {} }).then(() => undefined);
}

/** Counts the queued mutations of several workspaces. */
async function pendingCount(
  store: LocalStore,
  accountId: string,
  workspaceIds: readonly string[],
): Promise<number> {
  let total = 0;
  for (const workspaceId of workspaceIds)
    total += (await store.pending(accountId, workspaceId)).length;
  return total;
}

/**
 * Signs out one account.
 *
 * Online sign-out needs settled work or an explicit discard, then revokes
 * the session through the generated client and clears private local data.
 * Offline sign-out needs an explicit discard, clears private local data,
 * and records a sign-out marker because the HttpOnly session cannot be
 * revoked without a connection.
 */
export async function signOut(
  store: LocalStore,
  accountId: string,
  workspaceIds: readonly string[],
  online: boolean,
  discardPending: boolean,
  revokeSession: () => Promise<void> = revokeSessionViaClient,
): Promise<void> {
  const pending = await pendingCount(store, accountId, workspaceIds);
  if (pending > 0 && !discardPending)
    throw new SignOutBlockedError(
      'needs-discard',
      'Pending changes wait on this device. Settle them online or discard them explicitly.',
    );
  if (!online) {
    await store.clearPrivateData(accountId);
    await store.setSignOutMarker(accountId);
    return;
  }
  await revokeSession();
  await store.clearPrivateData(accountId);
  await store.clearSignOutMarker(accountId);
}

/**
 * Completes a pending offline sign-out on reconnect.
 *
 * Revocation runs through the generated client before anything is
 * restored, and the marker is cleared only after revocation succeeds, so a
 * failed revocation retries on the next reconnect. Returns `true` when a
 * marker was processed.
 */
export async function completePendingSignOut(
  store: LocalStore,
  accountId: string,
  revokeSession: () => Promise<void> = revokeSessionViaClient,
): Promise<boolean> {
  if (!(await store.hasSignOutMarker(accountId))) return false;
  await revokeSession();
  await store.clearSignOutMarker(accountId);
  return true;
}

/**
 * Copies queued pending work into the account-bound recovery area.
 *
 * Used when a purge or a sign-out leaves local work that the server can no
 * longer accept. The queue itself is kept, so a later retry can still submit
 * it; the recovery copy is the clipboard source and the explicit-removal
 * target. Returns the copied count.
 */
export async function copyPendingToRecovery(
  store: LocalStore,
  accountId: string,
  workspaceId: string,
  reason: RecoveryReason,
): Promise<number> {
  const queued = await store.pending(accountId, workspaceId);
  let copied = 0;
  for (const entry of queued) {
    for (const revision of entry.input.revisions) {
      if (revision.content.kind !== 'markdown') continue;
      await store.addRecovery(accountId, workspaceId, {
        fileId: revision.fileId,
        path: revision.path,
        text: revision.content.text,
        reason,
      });
      copied += 1;
    }
  }
  return copied;
}

/**
 * Whether one recovery record may be shown to one signed-in account.
 *
 * The store already partitions by account, so a mismatch means the caller
 * mixed two accounts and the record stays hidden.
 */
export function isRecoveryVisible(
  record: RecoveryRecord,
  viewerAccountId: string,
): boolean {
  return record.accountId === viewerAccountId;
}

/** Where the sync engine paused and what the user does next. */
export type AccessState = 'ok' | 'session-expired' | 'access-revoked';

/** One readable sentence for an access state. No note content is named. */
export function accessStateMessage(state: AccessState): string {
  if (state === 'session-expired')
    return 'The session expired. Sync is paused and drafts are kept. Sign in again.';
  if (state === 'access-revoked')
    return 'This account lost access to the workspace. Server reads and writes stop; kept work waits in recovery.';
  return 'Sync is running.';
}
