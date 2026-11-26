/**
 * Public entry point of the generated notesapp HTTP client.
 *
 * Every application HTTP call uses an operation exported here, and every
 * WebSocket address and message comes from the generated socket entry. No
 * consumer may import a file under `src/generated/` directly.
 */
export * from './generated/index.ts';
export * from './generated/socket.gen.ts';
export * from './generated/addresses.gen.ts';
export { observeResponseProgress } from './response-progress.ts';
export {
  connectSyncNotices,
  policyCloseCode,
  reconnectSettings,
  type ReconnectSettings,
  type SyncNoticesHandlers,
  type SyncNoticesTransport,
} from './socket.ts';

export function loadSyncNoticesTransport(): Promise<
  typeof import('./socket.ts')
> {
  return import('./socket.ts');
}

export {
  configureClient,
  normalizeProblem,
  type TokenProvider,
} from './configure.ts';
