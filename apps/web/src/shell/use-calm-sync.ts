import { useEffect, useRef, useState } from 'react';
import {
  calmSyncTracker,
  type CalmSyncFacts,
  type CalmSyncView,
} from '../lib/calm-sync-status.ts';

/**
 * The calm view of the sidebar footer for these facts.
 *
 * One tracker lives for the life of the footer, so a wait that started
 * before a render keeps its start, and the view changes only when its words
 * or its dot change.
 */
export function useCalmSyncView(facts: CalmSyncFacts): CalmSyncView {
  const tracker = useRef<ReturnType<typeof calmSyncTracker> | null>(null);
  const [view, setView] = useState<CalmSyncView>(() => {
    tracker.current ??= calmSyncTracker(facts, (next) => setView(next));
    return tracker.current.view();
  });
  const { state, online, failed, pending, editing } = facts;
  useEffect(() => {
    tracker.current?.update({ state, online, failed, pending, editing });
  }, [state, online, failed, pending, editing]);
  useEffect(() => () => tracker.current?.dispose(), []);
  return view;
}
