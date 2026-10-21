/**
 * The save state channel of the open note.
 *
 * The note screen publishes what the frame shows about the open note through
 * `NoteSaveScope`: a failed local write and the time of the last version. The
 * note saves itself, so no control reports the result; the note states a
 * failed local write itself (`lib/local-write.ts`). The scope holds one
 * store, so the context never changes and a reader renders only when the
 * fact it selects changes. A key changes no such fact (record 0175). The note
 * screen keeps `data-save-state` on its root, so automation reads the note
 * state without reading copy and only one element carries it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createFactStore,
  sameMembers,
  type FactStore,
} from '../../lib/fact-store.ts';
import type { NoteSaveReport } from '../../lib/save-state.ts';
import {
  createReloadGuard,
  createScreenWriter,
} from '../../lib/screen-writer.ts';
export { noteSaveReport, resolveSaveState } from '../../lib/save-state.ts';
export type {
  NoteSaveReport,
  SaveState,
  SaveStateInput,
} from '../../lib/save-state.ts';

type NoteSaveChannel = {
  readonly report: FactStore<NoteSaveReport | null>;
  readonly flushDraft: () => Promise<void>;
  readonly flushDraftForHandoff: () => Promise<void>;
  readonly registerDraftFlush: (
    flush: () => Promise<void>,
    handoff: () => Promise<void>,
  ) => () => void;
};

/** The channel outside a scope: no note, and nothing to flush. */
const noChannel: NoteSaveChannel = {
  report: createFactStore<NoteSaveReport | null>(null, sameMembers),
  flushDraft: () => Promise.resolve(),
  flushDraftForHandoff: () => Promise.resolve(),
  registerDraftFlush: () => () => {},
};

const NoteSaveContext = createContext<NoteSaveChannel>(noChannel);

/**
 * Carries the save facts of the open note up to the frame.
 *
 * The note screen sits under the header in the tree, so the frame owns the
 * store and the note screen writes into it.
 */
export function NoteSaveScope({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const [report] = useState(() =>
    createFactStore<NoteSaveReport | null>(null, sameMembers),
  );
  const draftFlush = useRef<() => Promise<void>>(() => Promise.resolve());
  const flushDraft = useCallback((): Promise<void> => draftFlush.current(), []);
  const handoffFlush = useRef<() => Promise<void>>(() => Promise.resolve());
  const flushDraftForHandoff = useCallback(() => handoffFlush.current(), []);
  const registerDraftFlush = useCallback(
    (
      flush: () => Promise<void>,
      handoff: () => Promise<void>,
    ): (() => void) => {
      draftFlush.current = flush;
      handoffFlush.current = handoff;
      return () => {
        if (draftFlush.current === flush)
          draftFlush.current = () => Promise.resolve();
        if (handoffFlush.current === handoff)
          handoffFlush.current = () => Promise.resolve();
      };
    },
    [],
  );
  const value = useMemo<NoteSaveChannel>(
    () => ({ report, flushDraft, flushDraftForHandoff, registerDraftFlush }),
    [report, flushDraft, flushDraftForHandoff, registerDraftFlush],
  );
  return (
    <NoteSaveContext.Provider value={value}>
      {children}
    </NoteSaveContext.Provider>
  );
}

/**
 * Reads one fact of the open note, or of no note on another screen.
 *
 * `select` must answer a value that compares with `Object.is`, such as a
 * boolean or a string, so a reader renders only when that value changes.
 */
export function useNoteSaveFact<T>(
  select: (report: NoteSaveReport | null) => T,
): T {
  const { report } = useContext(NoteSaveContext);
  return useSyncExternalStore(report.subscribe, () => select(report.get()));
}

/** Writes the open editor buffer to the local draft store. */
export function useFlushNoteDraft(): () => Promise<void> {
  return useContext(NoteSaveContext).flushDraft;
}

/** Saves the draft and cancels handoff if its editor changes while waiting. */
export function useFlushNoteDraftForHandoff(): () => Promise<void> {
  return useContext(NoteSaveContext).flushDraftForHandoff;
}

/** Registers the local write and the guarded protocol handoff write. */
export function useRegisterNoteDraftFlush({
  flushDraft,
  flushDraftForHandoff,
}: {
  readonly flushDraft: () => Promise<void>;
  readonly flushDraftForHandoff: () => Promise<void>;
}): void {
  const { registerDraftFlush } = useContext(NoteSaveContext);
  useEffect(
    () => registerDraftFlush(flushDraft, flushDraftForHandoff),
    [registerDraftFlush, flushDraft, flushDraftForHandoff],
  );
}

/**
 * The writer of the save facts of the open note, for the editor to call when
 * a fact may have changed. The facts go when the screen goes, and an answer
 * of the store that arrives later writes nothing (record 0175).
 */
export function useNoteSavePublisher(): (report: NoteSaveReport) => void {
  const { report } = useContext(NoteSaveContext);
  const [writer] = useState(() =>
    createScreenWriter<NoteSaveReport | null>(report.set, null),
  );
  useLayoutEffect(() => {
    writer.open();
    return writer.close;
  }, [writer]);
  return writer.write;
}

/**
 * Blocks an unsafe reload while unsaved work sits only in memory.
 *
 * A queued save is durable on this device and survives a reload, so it
 * never blocks. Only text that has not reached local storage yet, and a
 * local write that failed, keep the browser confirmation. The answer sets
 * the guard without a render, because the first key of a burst sets it. The
 * guard goes with the screen, and an answer of the store that arrives later
 * sets nothing (record 0175).
 */
export function useUnsafeReloadGuard(): (blocked: boolean) => void {
  const [guard] = useState(() => createReloadGuard(window));
  useLayoutEffect(() => {
    guard.open();
    return guard.close;
  }, [guard]);
  return guard.set;
}

/** Follows the connection state of the browser. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  useEffect(() => {
    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  return online;
}
