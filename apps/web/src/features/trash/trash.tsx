/** The deletion notice and its existing guarded restore operation. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { restoreFile } from '@notesapp/api-client';
import { generateUUID } from '@notesapp/core';
import { Button, CloseIcon, Toast } from '@notesapp/ui';
import { problemMessage, useLocalStore, useRequestSync } from '../../app.tsx';

/** How long the notice after a deletion stays on screen. */
export const undoNoticeMs = 8000;

/** How long a restore waits for a queued deletion to reach the server. */
const restoreWaitMs = 15_000;

/** How long a restore waits between two attempts. */
const restoreStepMs = 250;

/** The path that a restore gave the note, or `null` when it failed. */
export type RestoreOutcome =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly message: string };

/**
 * Restores one note, waiting for a deletion that is still on its way.
 *
 * Deleting a note writes a local tombstone first and the sync engine sends it
 * a moment later, so a restore right after a deletion can arrive before the
 * deletion does. The server answers 404 for a note it does not hold as
 * deleted, which is the one answer worth waiting on. Every other answer is
 * final and is reported as it is.
 */
export async function restoreNote(
  workspaceId: string,
  fileId: string,
  deviceId: string,
  options: {
    readonly now?: () => number;
    readonly wait?: (ms: number) => Promise<void>;
  } = {},
): Promise<RestoreOutcome> {
  const now = options.now ?? Date.now;
  const wait =
    options.wait ??
    ((ms: number): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }));
  const deadline = now() + restoreWaitMs;
  for (;;) {
    const result = await restoreFile({
      path: { workspaceId, fileId },
      body: {
        mutationId: generateUUID(),
        deviceId,
        clientTime: new Date().toISOString(),
        revisionId: generateUUID(),
      },
    });
    if (result.data !== undefined)
      return { ok: true, path: result.data.revision.path };
    const status = result.response?.status ?? 0;
    if (status !== 404 || now() >= deadline)
      return { ok: false, message: problemMessage(result.error) };
    await wait(restoreStepMs);
  }
}

/** One note that the last deletion removed. */
export type DeleteNoticeItem = {
  readonly fileId: string;
  /** The name of the note, without its storage suffix. */
  readonly name: string;
};

/** The notes that the last deletion removed, while its notice is on screen. */
export type DeleteNotice = {
  readonly workspaceId: string;
  readonly items: readonly DeleteNoticeItem[];
};

/** What the notice after a deletion offers to the screens below. */
type DeleteNoticeValue = {
  readonly notice: DeleteNotice | null;
  /** Announces that notes went to the trash. */
  readonly announce: (notice: DeleteNotice) => void;
  /** Takes the notice off the screen. */
  readonly dismiss: () => void;
};

const DeleteNoticeContext = createContext<DeleteNoticeValue>({
  notice: null,
  announce: () => {},
  dismiss: () => {},
});

/**
 * Holds the notice that follows a deletion.
 *
 * The editor announces the deletion and then leaves for the note list, so the
 * notice cannot live in the editor. It lives above both screens, which is what
 * lets the person undo the deletion from the list they land on.
 */
export function DeleteNoticeProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const [notice, setNotice] = useState<DeleteNotice | null>(null);
  const dismiss = useCallback((): void => {
    setNotice(null);
  }, []);
  const value = useMemo(
    () => ({ notice, announce: setNotice, dismiss }),
    [notice, dismiss],
  );
  return (
    <DeleteNoticeContext.Provider value={value}>
      {children}
    </DeleteNoticeContext.Provider>
  );
}

/** Reads the notice that follows a deletion. */
export function useDeleteNotice(): DeleteNoticeValue {
  return useContext(DeleteNoticeContext);
}

/**
 * The notice that one note went to the trash, with one chance to restore it.
 *
 * It is the one `Toast` of the package: a raised surface at the foot of the
 * window that owns the live region, the measure and the arrival, so this
 * screen writes no width and no plane of its own. The button is an ordinary
 * button in the document order, so the offer is there for a reader and for
 * the keyboard. It goes away by itself after a few seconds; the note stays in
 * the trash.
 */
export function DeleteNoticeBar(): ReactNode {
  const { notice, dismiss } = useDeleteNotice();
  const store = useLocalStore();
  const navigate = useNavigate();
  const requestSync = useRequestSync();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const restoredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (notice === null) return;
    setFailure(null);
    restoredRef.current.clear();
    const timer = window.setTimeout(dismiss, undoNoticeMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [notice, dismiss]);

  if (notice === null) return null;
  const count = notice.items.length;
  const only = count === 1 ? notice.items[0] : undefined;
  const message =
    only === undefined
      ? `${String(count)} notes moved to Trash.`
      : `${only.name} moved to Trash.`;
  const restoreLabel =
    only === undefined
      ? `Restore ${String(count)} deleted notes`
      : `Restore ${only.name}`;
  const restore = (): void => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    void (async (): Promise<void> => {
      for (const item of notice.items) {
        if (restoredRef.current.has(item.fileId)) continue;
        const outcome = await restoreNote(
          notice.workspaceId,
          item.fileId,
          store.store?.deviceId ?? 'web-device',
        );
        if (!outcome.ok) {
          setBusy(false);
          if (restoredRef.current.size > 0)
            setFailure(
              `${String(restoredRef.current.size)} of ${String(count)} notes are back. Try Restore again for the other notes.`,
            );
          else setFailure(outcome.message);
          return;
        }
        restoredRef.current.add(item.fileId);
      }
      setBusy(false);
      requestSync();
      dismiss();
      if (only === undefined) {
        void navigate(`/w/${notice.workspaceId}`);
        return;
      }
      void navigate(`/w/${notice.workspaceId}/notes/${only.fileId}`);
    })();
  };

  return (
    // One message for one cause: a restore that did not work replaces the
    // sentence of the deletion, so the toast never stacks a general message
    // and a detailed one, and Restore stays on offer.
    <Toast message={failure ?? message}>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        title={restoreLabel}
        onClick={restore}
      >
        {busy ? 'Restoring' : 'Restore'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        label="Close this notice"
        icon={<CloseIcon />}
        onClick={dismiss}
      />
    </Toast>
  );
}
