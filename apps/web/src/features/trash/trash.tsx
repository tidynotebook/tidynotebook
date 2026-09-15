/**
 * The trash: the deleted notes of one workspace, with Restore and Delete
 * permanently.
 *
 * Deleting a note writes a tombstone revision, so the note leaves the file
 * tree but keeps its identifier, its content and its history. This screen is
 * the way back. Restore writes one revision on top of that tombstone. Delete
 * permanently calls the purge operation for that one note, after which nothing
 * can bring it back.
 *
 * A deletion that this device has not sent yet is listed as well. The local
 * store holds it as a tombstone of its own, and merging the two lists means a
 * person sees one trash whether or not the connection is up.
 *
 * Every server action uses a generated operation. There is no handwritten
 * request, URL, or response shape here.
 */
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
import { Link, useNavigate, useParams } from 'react-router';
import {
  listDeletedFiles,
  purgeFiles,
  restoreFile,
  type WorkspaceDeletedFileSummary,
} from '@notesapp/api-client';
import { generateUUID } from '@notesapp/core';
import type { LocalStore } from '@notesapp/sync';
import {
  Button,
  buttonClassName,
  Card,
  EmptyState,
  ListRow,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  TrashIcon,
} from '@notesapp/ui';
import {
  problemMessage,
  useLocalStore,
  useRequestSync,
  useSession,
} from '../../app.tsx';
import { useLocalQuery } from '../../local-state.ts';
import { displayNoteName } from '../../lib/note-name.ts';
import { folderOf, relativeTime } from '../../lib/relative-time.ts';
import { useFiles } from '../../shell/files.tsx';

/** How long the notice after a deletion stays on screen. */
export const undoNoticeMs = 8000;

/** How long a restore waits for a queued deletion to reach the server. */
const restoreWaitMs = 15_000;

/** How long a restore waits between two attempts. */
const restoreStepMs = 250;

/** One deleted note as the trash shows it. */
export type TrashItem = {
  readonly fileId: string;
  readonly path: string;
  /** The instant of the deletion, or `null` when only this device knows it. */
  readonly deletedAt: string | null;
  /** True while the deletion has not reached the server. */
  readonly pending: boolean;
};

/**
 * Merges the deleted notes of the server with the ones only this device knows.
 *
 * A note that this device deleted while offline holds no place in the listing
 * of the server yet, and a note that another device deleted is not in the
 * local cache. Both belong in the trash, so the two lists are joined on the
 * file identifier and the server entry wins where both hold one.
 */
export function mergeTrash(
  remote: readonly WorkspaceDeletedFileSummary[],
  local: readonly {
    readonly fileId: string;
    readonly path: string;
    readonly deleted: boolean;
    readonly updatedAt: string;
  }[],
): readonly TrashItem[] {
  const merged = new Map<string, TrashItem>();
  for (const file of local) {
    if (!file.deleted) continue;
    merged.set(file.fileId, {
      fileId: file.fileId,
      path: file.path,
      deletedAt: file.updatedAt,
      pending: true,
    });
  }
  for (const file of remote)
    merged.set(file.fileId, {
      fileId: file.fileId,
      path: file.path,
      deletedAt: file.deletedAt,
      pending: false,
    });
  return [...merged.values()].sort((left, right) => {
    const leftAt = Date.parse(left.deletedAt ?? '');
    const rightAt = Date.parse(right.deletedAt ?? '');
    if (
      Number.isFinite(leftAt) &&
      Number.isFinite(rightAt) &&
      leftAt !== rightAt
    )
      return rightAt - leftAt;
    return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  });
}

/** Reads every page of the deleted notes of one workspace. */
async function loadDeletedFiles(
  workspaceId: string,
): Promise<readonly WorkspaceDeletedFileSummary[]> {
  const files: WorkspaceDeletedFileSummary[] = [];
  let cursor: string | null = null;
  for (;;) {
    const query: { readonly cursor?: string; readonly limit: number } =
      cursor === null ? { limit: 100 } : { cursor, limit: 100 };
    const page = await listDeletedFiles({
      path: { workspaceId },
      query: { ...query },
    });
    if (page.error !== undefined || page.data === undefined)
      throw new Error(problemMessage(page.error));
    files.push(...page.data.files);
    const next: string | null = page.data.nextCursor;
    if (next === null) break;
    cursor = next;
  }
  return files;
}

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
 * The region announces itself, and the button is an ordinary button in the
 * document order, so the offer is there for a reader and for the keyboard. It
 * goes away by itself after a few seconds; the note stays in the trash.
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
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-edge-subtle bg-card p-3 shadow-md">
      <div
        className="flex flex-wrap items-center justify-between gap-group"
        role="status"
        aria-live="polite"
      >
        <p className="m-0 min-w-0 text-control text-strong">{message}</p>
        <div className="flex items-center gap-cluster">
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
            label="Hide this notice"
            onClick={dismiss}
          >
            Close
          </Button>
        </div>
      </div>
      {failure === null ? null : (
        <p className="mb-0 mt-2 text-control text-danger" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}

/** The trash of one workspace. */
export function TrashView(): ReactNode {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : null;
  const session = useSession();
  const store = useLocalStore();
  const accountId = session.account?.accountId ?? null;

  if (workspaceId === null)
    return (
      <Page>
        <PageHeader title="Trash" />
        <EmptyState
          icon={<TrashIcon size={24} />}
          title="This address names no trash"
          description="Open your notes and choose Trash in the sidebar."
        />
      </Page>
    );
  if (accountId === null)
    return (
      <Page>
        <PageHeader title="Trash" />
        <LoadingState shape="list" rows={4} label="The trash is loading." />
      </Page>
    );

  return (
    <TrashList
      store={store.store}
      accountId={accountId}
      workspaceId={workspaceId}
    />
  );
}

/** The listing and the two actions of the trash. */
function TrashList({
  store,
  accountId,
  workspaceId,
}: {
  readonly store: LocalStore | null;
  readonly accountId: string;
  readonly workspaceId: string;
}): ReactNode {
  const navigate = useNavigate();
  const requestSync = useRequestSync();
  const files = useFiles();
  const [remote, setRemote] = useState<readonly WorkspaceDeletedFileSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const emptyLocalFiles = useMemo(() => [], []);
  const localFiles = useLocalQuery(
    store,
    accountId,
    workspaceId,
    (activeStore, activeAccount, activeWorkspace) =>
      activeStore.listLocalFiles(activeAccount, activeWorkspace),
    emptyLocalFiles,
    (change) =>
      change.kind === 'draft' ||
      change.kind === 'queue' ||
      change.kind === 'file' ||
      change.kind === 'purge' ||
      change.kind === 'reset',
  );

  // A remote delete, restore, or purge changes which accepted rows belong in
  // Trash. Refresh that server list after the matching local transition. A
  // focus or reconnect also repairs a missed invalidation.
  useEffect(() => {
    if (store === null) return;
    const unsubscribe = store.subscribe((change) => {
      if (
        change.accountId === accountId &&
        change.workspaceId === workspaceId &&
        (change.kind === 'file' || change.kind === 'purge')
      )
        setGeneration((value) => value + 1);
    });
    const refresh = (): void => setGeneration((value) => value + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [store, accountId, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadDeletedFiles(workspaceId)
      .then((files) => {
        if (cancelled) return;
        setRemote(files);
        setFailure(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setFailure(
          reason instanceof Error
            ? reason.message
            : 'The trash could not be read.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, generation]);

  const items = useMemo(
    () => mergeTrash(remote, localFiles.value),
    [remote, localFiles.value],
  );
  const now = Date.now();

  const reload = (): void => {
    setGeneration((value) => value + 1);
  };

  const restore = (item: TrashItem): void => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    void (async (): Promise<void> => {
      const done = await restoreNote(
        workspaceId,
        item.fileId,
        store?.deviceId ?? 'web-device',
      );
      setBusy(false);
      if (!done.ok) {
        setFailure(done.message);
        return;
      }
      requestSync();
      void navigate(`/w/${workspaceId}/notes/${item.fileId}`);
    })();
  };

  const deleteForever = (item: TrashItem): void => {
    if (busy) return;
    if (confirming !== item.fileId) {
      setConfirming(item.fileId);
      return;
    }
    setConfirming(null);
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    void (async (): Promise<void> => {
      const purged = await purgeFiles({
        path: { workspaceId },
        body: { mutationId: generateUUID(), fileIds: [item.fileId] },
      });
      if (purged.error !== undefined || purged.data === undefined) {
        setBusy(false);
        setFailure(problemMessage(purged.error));
        return;
      }
      try {
        await store?.forgetPurgedFiles(accountId, workspaceId, [item.fileId]);
      } catch {
        setBusy(false);
        setRemote((current) =>
          current.filter((file) => file.fileId !== item.fileId),
        );
        files.reload();
        reload();
        setFailure(
          'The note is deleted permanently on the server. Reload this page to update this device.',
        );
        return;
      }
      setOutcome(`${displayNoteName(item.path)} is deleted permanently.`);
      setRemote((current) =>
        current.filter((file) => file.fileId !== item.fileId),
      );
      requestSync();
      files.reload();
      reload();
      setBusy(false);
    })();
  };

  return (
    <Page>
      <PageHeader
        title="Trash"
        description="Restore puts a note back with your notes. Delete permanently removes the note and its versions for good."
        actions={
          <Link
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            to={`/w/${workspaceId}`}
          >
            Back to your notes
          </Link>
        }
      />
      <div className="space-y-4">
        {outcome === null ? null : <Notice tone="success" message={outcome} />}
        {failure === null ? null : <Notice tone="problem" message={failure} />}
        {loading ? (
          <LoadingState shape="list" rows={4} label="The trash is loading." />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<TrashIcon size={24} />}
            title="The trash is empty"
            description="A note you delete waits here until you restore it or delete it for good."
          />
        ) : (
          <Card title="Deleted notes" titleId="trash-heading">
            <ul className="m-0 list-none p-0">
              {items.map((item) => {
                const name = displayNoteName(item.path);
                const folder = folderOf(item.path);
                const when =
                  item.deletedAt === null
                    ? ''
                    : relativeTime(item.deletedAt, now);
                const where = folder === null ? 'Top level' : folder;
                const parts = [where];
                if (when !== '') parts.push(`deleted ${when}`);
                if (item.pending) parts.push('waiting to go up');
                return (
                  <ListRow key={item.fileId} className="flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-ui font-medium text-strong">
                        {folder === null ? name : name.slice(folder.length + 1)}
                      </p>
                      <p className="m-0 truncate text-control text-muted">
                        {parts.join(' \u00b7 ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-cluster">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        label={`Restore ${name}`}
                        onClick={() => restore(item)}
                      >
                        Restore
                      </Button>
                      {confirming === item.fileId ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            icon={<TrashIcon size={14} />}
                            label={`Confirm that ${name} is deleted permanently`}
                            onClick={() => deleteForever(item)}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            label={`Keep ${name} in the trash`}
                            onClick={() => setConfirming(null)}
                          >
                            Keep
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          icon={<TrashIcon size={14} />}
                          label={`Delete ${name} permanently`}
                          onClick={() => deleteForever(item)}
                        >
                          Delete permanently
                        </Button>
                      )}
                    </div>
                  </ListRow>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </Page>
  );
}
