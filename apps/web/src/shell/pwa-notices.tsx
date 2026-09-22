/**
 * The two notices of the installed application.
 *
 * An installed worker waits until the person accepts the update, so the
 * shell has to offer it. Durable local storage has to be asked for, and a
 * refusal has to be said once, because the promise of offline drafts does
 * not hold without it.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LocalStore } from '@notesapp/sync';
import { Button, Notice } from '@notesapp/ui';
import {
  describeStorageFailure,
  persistenceDenialMessage,
  requestPersistentStorage,
} from '../pwa/lifecycle.ts';
import {
  closeForUpdate,
  currentUpdateRegistration,
  holdTabLock,
  listenForUpdates,
  postUpdateMessage,
  runUpdate,
  UpdateFailedError,
  type TabLock,
} from '../pwa/update.ts';

/** Watches the worker registration for a version that waits to activate. */
export function useWaitingUpdate(): boolean {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const container = navigator.serviceWorker;
    if (container === undefined) return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    let removeInstalling = (): void => {};
    const check = (): void => {
      if (cancelled) return;
      setWaiting(registration?.waiting != null);
    };
    const watchInstalling = (): void => {
      removeInstalling();
      const installing = registration?.installing;
      if (installing === undefined || installing === null) {
        removeInstalling = (): void => {};
        check();
        return;
      }
      installing.addEventListener('statechange', check);
      removeInstalling = () =>
        installing.removeEventListener('statechange', check);
      check();
    };
    void container
      .getRegistration()
      .then((found) => {
        if (cancelled) return;
        registration = found ?? null;
        watchInstalling();
        registration?.addEventListener('updatefound', watchInstalling);
      })
      .catch(() => undefined);
    container.addEventListener('controllerchange', check);
    return () => {
      cancelled = true;
      removeInstalling();
      registration?.removeEventListener('updatefound', watchInstalling);
      container.removeEventListener('controllerchange', check);
    };
  }, []);

  return waiting;
}

/** What this tab says when it cannot store its text for an update. */
const keptOpenMessage =
  'This tab could not store its text, so it stays open. Copy your text, then close the tab.';

/**
 * Offers the waiting version, and closes this tab for an update of another.
 *
 * The notice shows when a new worker waits, and when the server needs a newer
 * application before this tab syncs again (record 0086). Accepting runs
 * `runUpdate`: it stores the text of every open tab, closes each of them,
 * and only then lets the new worker take over. A step that fails keeps the
 * text and says what to do next.
 *
 * Every tab also listens for the update of another tab. It stores its text,
 * stops, closes its database, and then reloads when that update ends.
 */
export function UpdateNotice({
  store,
  ownerId,
  required,
  onFlushDrafts,
  onStopQueue,
}: {
  readonly store: LocalStore | null;
  readonly ownerId: string;
  /** The server needs a newer application before this tab syncs again. */
  readonly required: boolean;
  readonly onFlushDrafts: () => Promise<void>;
  readonly onStopQueue: () => Promise<void>;
}): ReactNode {
  const waiting = useWaitingUpdate();
  const [problem, setProblem] = useState<string | null>(null);
  const [mustReload, setMustReload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const tabLock = useRef<TabLock | null>(null);
  const closedRef = useRef(false);
  // The listener below lives as long as the tab, so it reads the current
  // callbacks through a ref instead of subscribing again on every render.
  const effects = useRef({ store, onFlushDrafts, onStopQueue });
  effects.current = { store, onFlushDrafts, onStopQueue };

  useEffect(() => {
    const lock = holdTabLock(store, ownerId);
    tabLock.current = lock;
    return () => {
      lock.leave();
      tabLock.current = null;
    };
  }, [store, ownerId]);

  useEffect(
    () =>
      listenForUpdates(ownerId, (message) => {
        if (message.type === 'NOTESAPP_UPDATE_SETTLED') {
          if (closedRef.current) window.location.reload();
          return;
        }
        const current = effects.current;
        void closeForUpdate({
          flushDrafts: current.onFlushDrafts,
          stopQueue: current.onStopQueue,
          closeStore: () => current.store?.close() ?? Promise.resolve(),
          leave: () => tabLock.current?.leave(),
        }).then((outcome) => {
          if (outcome === 'kept') {
            setProblem(keptOpenMessage);
            return;
          }
          closedRef.current = true;
          setClosed(true);
        });
      }),
    [ownerId],
  );

  const install = useCallback((): void => {
    setBusy(true);
    setProblem(null);
    void (async (): Promise<void> => {
      try {
        await runUpdate({
          registration: await currentUpdateRegistration(),
          flushDrafts: onFlushDrafts,
          stopQueue: onStopQueue,
          closeStore: () => store?.close() ?? Promise.resolve(),
          tabs: tabLock.current ?? holdTabLock(store, ownerId),
          post: (message) => {
            postUpdateMessage(ownerId, message);
          },
          reload: () => {
            window.location.reload();
          },
        });
      } catch (failure: unknown) {
        setBusy(false);
        if (failure instanceof UpdateFailedError) {
          setMustReload(failure.reason === 'start-failed');
          setProblem(failure.message);
          return;
        }
        // A draft that could not be stored stops the update before any tab
        // closes, so the sentence is the one of that storage failure.
        setProblem(describeStorageFailure(failure));
      }
    })();
  }, [store, ownerId, onFlushDrafts, onStopQueue]);

  const reload = useCallback((): void => {
    window.location.reload();
  }, []);

  if (closed)
    return (
      <Notice
        tone="info"
        message="Notesapp updates in another tab. This tab reloads when the update is done."
      >
        <Button variant="secondary" size="sm" onClick={reload}>
          Reload
        </Button>
      </Notice>
    );
  if (mustReload && problem !== null)
    return (
      <Notice tone="problem" message={problem}>
        <Button variant="secondary" size="sm" onClick={reload}>
          Reload
        </Button>
      </Notice>
    );
  if (!waiting && !required)
    return problem === null ? null : <Notice tone="problem" message={problem} />;
  return (
    <Notice
      tone={problem === null ? 'info' : 'problem'}
      message={
        problem ??
        (required
          ? 'A new version of Notesapp is needed to save to the server.'
          : 'A new version of Notesapp is ready.')
      }
    >
      <Button variant="primary" size="sm" disabled={busy} onClick={install}>
        {busy ? 'Updating' : 'Update now'}
      </Button>
    </Notice>
  );
}

const persistenceAskedKey = 'notesapp.persistence-asked';

/**
 * Asks for durable storage after the first save, once per device.
 *
 * The request needs a reason the browser can see, so it runs after a save
 * instead of at start. A refusal is said once and then remembered, so the
 * message never repeats on every save.
 */
export function usePersistentStorage(afterFirstSave: boolean): {
  readonly denial: string | null;
  readonly dismiss: () => void;
} {
  const [denial, setDenial] = useState<string | null>(null);

  useEffect(() => {
    if (!afterFirstSave) return;
    let asked = 'no';
    try {
      asked = window.localStorage.getItem(persistenceAskedKey) ?? 'no';
    } catch {
      return;
    }
    if (asked !== 'no') return;
    void requestPersistentStorage().then((outcome) => {
      try {
        window.localStorage.setItem(persistenceAskedKey, outcome);
      } catch {
        // The outcome is still correct for this tab.
      }
      if (outcome === 'denied') setDenial(persistenceDenialMessage());
    });
  }, [afterFirstSave]);

  const dismiss = useCallback((): void => {
    setDenial(null);
  }, []);

  return { denial, dismiss };
}
