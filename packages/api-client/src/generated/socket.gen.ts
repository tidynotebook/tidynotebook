/*
 * Generated from packages/api-contract/asyncapi.yaml by tools/sdk-codegen.
 * Do not edit by hand. Run `pnpm generate` after a contract change.
 */

import type {
  SyncNoticeAccount,
  SyncNoticeChanged,
  SyncNoticeReady,
  SyncNoticeReconcile,
  SyncNoticeRefused,
  SyncNoticeStop,
  SyncNoticeSubscribe,
  SyncNoticeSubscribed,
} from './types.gen.js';

/** The address of the syncNotices channel, from the upgrade openSyncNotices. */
export const syncNoticesPath = '/api/sync/notices';

/** The one WebSocket subprotocol of the syncNotices channel. */
export const syncNoticesProtocol = 'notesapp.sync.1';

/** Every message that a client sends on the syncNotices channel. */
export type SyncNoticesClientMessage = SyncNoticeSubscribe;

/** Every message that the server sends on the syncNotices channel. */
export type SyncNoticesServerMessage = SyncNoticeAccount | SyncNoticeChanged | SyncNoticeReady | SyncNoticeReconcile | SyncNoticeRefused | SyncNoticeStop | SyncNoticeSubscribed;

const syncNoticesServerKinds: readonly string[] = ["account","changed","ready","reconcile","refused","stop","subscribed"];

/**
 * The WebSocket address of the syncNotices channel on one origin.
 *
 * An https origin gives a wss address and an http origin gives a ws address.
 */
export function syncNoticesAddress(origin: string): string {
  const address = new URL(syncNoticesPath, origin);
  address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
  return address.toString();
}

/** The frame text of one client message of the syncNotices channel. */
export function encodeSyncNoticesMessage(message: SyncNoticesClientMessage): string {
  return JSON.stringify(message);
}

function isSyncNoticesServerMessage(value: unknown): value is SyncNoticesServerMessage {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const kind: unknown = Object.fromEntries(Object.entries(value)).kind;
  return typeof kind === 'string' && syncNoticesServerKinds.includes(kind);
}

/**
 * The server message of one frame of the syncNotices channel, or `null`.
 *
 * A frame that is not JSON, or that names no server message, answers
 * `null`, and the caller treats the stream as broken.
 */
export function readSyncNoticesMessage(frame: string): SyncNoticesServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(frame);
  } catch {
    return null;
  }
  return isSyncNoticesServerMessage(value) ? value : null;
}
