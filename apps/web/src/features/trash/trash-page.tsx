import {
  Stack,
  Inline,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Menu,
  MoreIcon,
  EmptyState,
  ListRow,
  LoadingState,
  Notice,
  Page,
  pageGroupLabelClassName,
  PageHeader,
} from '@notesapp/ui';
/**
 * The trash: the deleted notes of one workspace, with Restore and Delete.
 *
 * Deleting a note writes a tombstone revision, so the note leaves the file
 * tree but keeps its identifier, its content and its history. This screen is
 * the way back. Restore writes one revision on top of that tombstone. Delete
 * Delete calls the purge operation for that one note, after which nothing can
 * bring it back.
 *
 * A deletion that this device has not sent yet is listed as well. The local
 * store holds it as a tombstone of its own, and merging the two lists means a
 * person sees one trash whether or not the connection is up.
 *
 * Every server action uses a generated operation. There is no handwritten
 * request, URL, or response shape here.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  listDeletedFiles,
  purgeFiles,
  type WorkspaceDeletedFileSummary,
} from '@notesapp/api-client';
import type { LocalStore } from '@notesapp/sync';
import { generateUUID } from '@notesapp/core';

import { emptyStateIcon } from '../../shell/action-icons.tsx';
import { deleteTrashLabel, trashPageGlyph } from '../../lib/delete-label.ts';
import {
  problemMessage,
  useLocalStore,
  useRequestSync,
  useSession,
} from '../../app.tsx';
import { useLocalQuery } from '../../local-state.ts';
import { displayNoteName } from '../../lib/note-name.ts';
import { folderOf, relativeTime } from '../../lib/relative-time.ts';
import {
  mergeTrash,
  trashListClassName,
  type TrashItem,
} from '../../lib/trash-view.ts';
import { useNow } from '../../shell/now.ts';
import { restoreNote } from './trash.tsx';

/** The largest file set the purge operation accepts in one request. */
const purgeBatchSize = 1000;

/** The permanent deletion that waits for confirmation. */
type TrashConfirmation =
  | { readonly kind: 'one'; readonly fileId: string }
  | { readonly kind: 'all' }
  | null;

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
          icon={emptyStateIcon(trashPageGlyph)}
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
  const [remote, setRemote] = useState<readonly WorkspaceDeletedFileSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TrashConfirmation>(null);
  const [busy, setBusy] = useState(false);
  const [removedFileIds, setRemovedFileIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [generation, setGeneration] = useState(0);
  const loadedWorkspace = useRef<string | null>(null);
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
    /** Read Trash again when the window gets focus or the connection returns. */
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
    const firstRead = loadedWorkspace.current !== workspaceId;
    if (firstRead) {
      setLoading(true);
      setRemote([]);
      setRemovedFileIds(new Set());
      setConfirming(null);
    }
    void loadDeletedFiles(workspaceId)
      .then((files) => {
        if (cancelled) return;
        setRemote(files);
        loadedWorkspace.current = workspaceId;
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
    () => mergeTrash(remote, localFiles.value, removedFileIds),
    [remote, localFiles.value, removedFileIds],
  );
  const now = useNow();

  /** Restore one note and report the result. */
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

  /** Delete the confirmed notes permanently and report the result. */
  const deleteForever = (targets: readonly TrashItem[]): void => {
    if (busy) return;
    setConfirming(null);
    setBusy(true);
    setFailure(null);
    setOutcome(null);
    const targetIds = targets.map((item) => item.fileId);
    setRemovedFileIds((current) => new Set([...current, ...targetIds]));
    void (async (): Promise<void> => {
      const purgedIds: string[] = [];
      let purgeFailure: string | null = null;
      for (let index = 0; index < targetIds.length; index += purgeBatchSize) {
        const batch = targetIds.slice(index, index + purgeBatchSize);
        const purged = await purgeFiles({
          path: { workspaceId },
          body: { mutationId: generateUUID(), fileIds: batch },
        });
        if (purged.error !== undefined || purged.data === undefined) {
          purgeFailure = problemMessage(purged.error);
          break;
        }
        purgedIds.push(...purged.data.purgedFileIds);
      }
      const purgedSet = new Set(purgedIds);
      setRemote((current) =>
        current.filter((file) => !purgedSet.has(file.fileId)),
      );
      let localFailure = false;
      if (purgedIds.length > 0) {
        try {
          if (store === null)
            throw new Error('The local store is not available.');
          await store.forgetPurgedFiles(accountId, workspaceId, purgedIds);
        } catch {
          localFailure = true;
        }
      }
      // A target that the server did not purge returns to the list. A purged
      // target stays hidden for this mount, even if an older read finishes
      // after this operation and still contains it.
      setRemovedFileIds((current) => {
        const next = new Set(current);
        for (const fileId of targetIds)
          if (!purgedSet.has(fileId)) next.delete(fileId);
        return next;
      });
      if (localFailure)
        setFailure(
          purgedIds.length === 1
            ? 'The server deleted the note. Reload this page to update this device.'
            : 'The server deleted the notes. Reload this page to update this device.',
        );
      else if (purgeFailure !== null) setFailure(purgeFailure);
      else if (purgedIds.length !== targetIds.length)
        setFailure(
          'Some notes are not ready to delete. Wait for sync and try again.',
        );
      else
        setOutcome(
          targets.length === 1
            ? `${displayNoteName(targets[0]?.path ?? '')} is deleted.`
            : `${String(targets.length)} notes are deleted.`,
        );
      requestSync();
      setBusy(false);
    })();
  };

  return (
    <Page
      emptyState={
        !loading && items.length === 0 ? (
          <EmptyState
            icon={emptyStateIcon(trashPageGlyph)}
            title="The trash is empty"
            description="Notes you delete stay here until you restore them or delete them for good."
          />
        ) : null
      }
    >
      <PageHeader
        title="Trash"
        actionLayout="inline"
        actions={
          items.length === 0 ? undefined : (
            <Menu
              label="Trash actions"
              icon={<MoreIcon />}
              items={[
                {
                  id: 'empty',
                  label: 'Empty Trash',
                  danger: true,
                  disabled: busy || items.some((item) => item.pending),
                  onSelect: () => setConfirming({ kind: 'all' }),
                },
              ]}
            />
          )
        }
      />
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={
          confirming?.kind === 'all' ? 'Empty Trash?' : `${deleteTrashLabel}?`
        }
        titleId="trash-confirm-title"
        width="small"
        align="center"
      >
        <DialogBody>
          <p className="m-0 text-body text-strong">
            {confirming?.kind === 'all'
              ? `All ${items.length} notes and their versions go for good. You cannot undo this.`
              : `"${displayNoteName(items.find((item) => item.fileId === (confirming?.kind === 'one' ? confirming.fileId : ''))?.path ?? '')}" and its versions go for good. You cannot undo this.`}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              deleteForever(
                confirming?.kind === 'all'
                  ? items
                  : items.filter(
                      (item) =>
                        item.fileId ===
                        (confirming?.kind === 'one' ? confirming.fileId : ''),
                    ),
              )
            }
          >
            {confirming?.kind === 'all' ? 'Empty Trash' : deleteTrashLabel}
          </Button>
        </DialogFooter>
      </Dialog>
      <Stack
        gap={4}
        as="div"
        hidden={
          !loading && items.length === 0 && failure === null && outcome === null
        }
      >
        {outcome === null ? null : (
          <p className="sr-only" role="status" aria-live="polite">
            {outcome}
          </p>
        )}
        {failure === null ? null : <Notice tone="problem" message={failure} />}
        {loading ? (
          <LoadingState shape="list" rows={4} label="The trash is loading." />
        ) : items.length === 0 ? null : (
          <section aria-labelledby="trash-heading">
            <h2 className={pageGroupLabelClassName()} id="trash-heading">
              Deleted notes
            </h2>
            <ul className={trashListClassName}>
              {items.map((item) => {
                const name = displayNoteName(item.path);
                const folder = folderOf(item.path);
                const when =
                  item.deletedAt === null
                    ? ''
                    : relativeTime(item.deletedAt, now);
                const where = folder === null ? 'All notes' : folder;
                const parts = [where];
                if (when !== '') parts.push(`deleted ${when}`);
                if (item.pending) parts.push('waiting to go up');
                return (
                  <ListRow
                    contentEdge
                    key={item.fileId}
                    className="border-b border-edge-subtle"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="m-0 line-clamp-2 break-words text-body text-strong lg:line-clamp-1">
                        {folder === null ? name : name.slice(folder.length + 1)}
                      </p>
                      <p className="m-0 break-words text-secondary text-muted">
                        {parts.join(' \u00b7 ')}
                      </p>
                    </div>
                    <Inline
                      gap={2}
                      align="center"
                      as="div"
                      className="shrink-0"
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        compact
                        disabled={busy}
                        label={`Restore ${name}`}
                        onClick={() => restore(item)}
                      >
                        Restore
                      </Button>
                      <Menu
                        label={`Actions for ${name}`}
                        icon={<MoreIcon />}
                        items={[
                          {
                            id: 'restore',
                            label: 'Restore',
                            disabled: busy,
                            onSelect: () => restore(item),
                          },
                          {
                            id: 'delete',
                            label: deleteTrashLabel,
                            danger: true,
                            disabled: busy || item.pending,
                            onSelect: () =>
                              setConfirming({
                                kind: 'one',
                                fileId: item.fileId,
                              }),
                          },
                        ]}
                      />
                    </Inline>
                  </ListRow>
                );
              })}
            </ul>
          </section>
        )}
      </Stack>
    </Page>
  );
}
