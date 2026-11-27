/**
 * The count of parked saves and the link that reaches them.
 *
 * The link lives in its own module so the shell and the save state chip can
 * show the count without loading the whole Needs attention screen.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { LocalStore, RecoveryRecord } from '@notesapp/sync';
import { rowClassName } from '@notesapp/ui';
import { parkedSaves, type ParkedSave } from '../../lib/parked-saves.ts';

import { attentionTitle } from '../../lib/save-status-words.ts';
export { attentionTitle };

/** Reads the parked saves of one workspace and keeps the count current. */
export function useParkedSaves(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string | null,
): {
  readonly saves: readonly ParkedSave[];
  readonly error: string | null;
  readonly reload: () => void;
} {
  const [records, setRecords] = useState<readonly RecoveryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const reload = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  useEffect(() => {
    if (store === null || accountId === null || workspaceId === null) {
      setRecords([]);
      return;
    }
    const activeStore = store;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const kept = await activeStore.recover(accountId, workspaceId);
        if (cancelled) return;
        setRecords(kept.filter((record) => record.accountId === accountId));
        setError(null);
      } catch {
        if (!cancelled) setError('Kept work is unavailable on this device.');
      }
    };
    void load();
    const unsubscribe = activeStore.subscribe((change) => {
      // Draft writes happen on every keystroke and never change kept work,
      // so only the durable kinds trigger a reread.
      if (
        change.accountId === accountId &&
        change.workspaceId === workspaceId &&
        (change.kind === 'conflict' ||
          change.kind === 'queue' ||
          change.kind === 'reset')
      )
        void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store, accountId, workspaceId, generation]);

  return { saves: parkedSaves(records), error, reload };
}

/** How many saves of one workspace wait for attention. */
export function useAttentionCount(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string | null,
): number {
  return useParkedSaves(store, accountId, workspaceId).saves.length;
}

/** A link to the screen, shown only while a save waits there. */
export function AttentionLink({
  workspaceId,
  count,
  className,
}: {
  readonly workspaceId: string;
  readonly count: number;
  readonly className?: string | undefined;
}): ReactNode {
  if (count <= 0) return null;
  return (
    <Link
      className={className ?? rowClassName({ danger: true, inset: false })}
      to={`/w/${workspaceId}/attention`}
    >
      {attentionTitle} ({count})
    </Link>
  );
}
