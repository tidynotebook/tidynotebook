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

/** Keeps update saves separate from the stricter protocol handoff check. */
export function useNoteDraftFlush({
  cancelWrite,
  versionTimer,
  flushWork,
  saveDraft,
  readIdentity,
}: DraftFlushPorts): {
  readonly flushDraft: () => Promise<void>;
  readonly flushDraftForHandoff: () => Promise<void>;
} {
  const identityRef = useRef(readIdentity);
  identityRef.current = readIdentity;
  const flushDraft = useCallback(async (): Promise<void> => {
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
  }, [cancelWrite, versionTimer, flushWork, saveDraft]);
  const flushDraftForHandoff = useCallback(
    () => flushUnchangedDraft(identityRef.current, flushDraft),
    [flushDraft],
  );
  return { flushDraft, flushDraftForHandoff };
}
