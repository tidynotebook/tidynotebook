import type { IdentityStoreHandle } from '@notesapp/storage-server';

/** Persist trial expiry without blocking other maintenance jobs on failure. */
export function createTrialExpiry(
  store: Pick<IdentityStoreHandle, 'expireTrials'>,
): () => Promise<void> {
  return async () => {
    await store.expireTrials();
  };
}
