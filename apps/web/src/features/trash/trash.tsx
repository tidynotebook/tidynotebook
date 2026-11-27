/** The deletion notice and its existing guarded restore operation. */
import {
  createContext,
  useCallback,
  useContext,
  lazy,
  Suspense,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { restoreFile } from '@notesapp/api-client';
import { generateUUID } from '@notesapp/core';

import { problemMessage } from '../../app.tsx';

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

const DeleteToast = lazy(async () => ({
  default: (await import('./delete-toast.tsx')).DeleteToast,
}));

export function DeleteNoticeBar(): ReactNode {
  const { notice, dismiss } = useDeleteNotice();
  return notice === null ? null : (
    <Suspense>
      <DeleteToast notice={notice} dismiss={dismiss} />
    </Suspense>
  );
}
