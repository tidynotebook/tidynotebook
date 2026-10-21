import { useCallback, useRef } from 'react';
import { flushUnchangedDraft } from '../../lib/draft-flush.ts';

/** The writes and identity of the open working copy. */
type DraftFlushPorts = {
  readonly cancelWrite: () => void;
  readonly versionTimer: { current: number | null };
  readonly flushWork: () => Promise<void>;
  readonly saveDraft: { current: () => Promise<boolean> };
  readonly readIdentity: () => string | null;
};

/** Saves a current draft before a reload or an external protocol handoff. */
export function useNoteDraftFlush({
  cancelWrite,
  versionTimer,
  flushWork,
  saveDraft,
  readIdentity,
}: DraftFlushPorts): () => Promise<void> {
  const identityRef = useRef(readIdentity);
  identityRef.current = readIdentity;
  return useCallback(
    () =>
      flushUnchangedDraft(identityRef.current, async () => {
        cancelWrite();
        if (versionTimer.current !== null) {
          window.clearTimeout(versionTimer.current);
          versionTimer.current = null;
        }
        await flushWork();
        if (!(await saveDraft.current()))
          throw new Error(
            'The open draft could not be stored. Keep this tab open and try again.',
          );
      }),
    [cancelWrite, versionTimer, flushWork, saveDraft],
  );
}
