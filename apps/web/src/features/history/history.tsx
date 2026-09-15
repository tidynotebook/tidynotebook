/**
 * The history of one note: a timeline of versions, with one way back.
 *
 * Every row says how long ago the version was made and how many lines it
 * added and removed, and carries one Restore action. Nothing on the screen
 * names a revision or prints an instant of the machine. Opening a row shows
 * the lines that changed between that version and the newest one, and the
 * whole text of the version.
 *
 * Opening the history never changes the text on this device. Restore writes
 * one new version on top of the newest one and records where it came from;
 * it never rewinds the history and never touches a draft or a queued save.
 *
 * An image file has no line comparison, so a row of an image shows the
 * picture of that version instead.
 *
 * Every server action uses a generated operation. There is no handwritten
 * request, URL, or response shape here.
 */
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router';
import {
  getFile,
  getRevision,
  listHistory,
  restoreRevision,
  type HistoryRevisionItem,
} from '@notesapp/api-client';
import { generateUUID } from '@notesapp/core';
import {
  alignLines,
  countHunkLines,
  type DiffHunk,
  type LineChangeCount,
} from '@notesapp/editor';
import type { LocalStore } from '@notesapp/sync';
import {
  Button,
  buttonClassName,
  Card,
  EmptyState,
  HistoryIcon,
  ListRow,
  LoadingState,
  Notice,
  Page,
  PageHeader,
} from '@notesapp/ui';
import { problemMessage, useLocalStore, useSession } from '../../app.tsx';
import {
  loadAttachmentBinary,
  type LoadedAttachment,
} from '../../lib/attachment-content.ts';
import { displayNoteName } from '../../lib/note-name.ts';
import {
  requestDiff,
  requestDiffSeries,
  type DiffPair,
} from './diff-worker.ts';
import { rowChangeOf, rowChangeText } from '../../lib/history-rows.ts';
import { relativeTime } from '../../lib/relative-time.ts';

/** How many history entries one page requests. */
const historyPageSize = 50;

/** One classified row of an inline hunk for screen readers and sighted users. */
type DiffRow = {
  readonly kind: 'context' | 'removed' | 'added';
  readonly text: string;
};

/**
 * Aligns the two sides of one hunk into display rows.
 *
 * The alignment is exact: every before line shows once as context or
 * removed, and every after line once as context or added, including
 * unchanged lines inside the changed region. When even that small alignment
 * exceeds its bound, every before line shows as removed and every after line
 * as added.
 */
function rowsOfHunk(hunk: DiffHunk): readonly DiffRow[] {
  const before = [...hunk.before];
  const after = [...hunk.after];
  const aligned = alignLines(before.join(''), after.join(''));
  if (aligned === null)
    return [
      ...before.map((line): DiffRow => ({ kind: 'removed', text: line })),
      ...after.map((line): DiffRow => ({ kind: 'added', text: line })),
    ];
  return aligned.map((entry): DiffRow => {
    if (entry.kind === 'same')
      return { kind: 'context', text: before[entry.beforeIndex] ?? '' };
    if (entry.kind === 'del')
      return { kind: 'removed', text: before[entry.beforeIndex] ?? '' };
    return { kind: 'added', text: after[entry.afterIndex] ?? '' };
  });
}

/**
 * One unified inline diff in the main pane.
 *
 * Hunks render in order with their 1-based line ranges. Removed lines carry a
 * minus prefix, added lines a plus prefix, and context lines a blank prefix.
 * The text of every line renders verbatim, including whitespace.
 */
export function InlineDiff({
  hunks,
  idPrefix,
  oldLabel,
  newLabel,
}: {
  readonly hunks: readonly DiffHunk[];
  readonly idPrefix: string;
  readonly oldLabel: string;
  readonly newLabel: string;
}): ReactNode {
  const rendered = useMemo(
    () =>
      hunks.map((hunk) => ({
        hunk,
        rows: rowsOfHunk(hunk),
      })),
    [hunks],
  );
  if (rendered.length === 0)
    return (
      <p className="m-0 text-control text-muted">
        This version and the newest one hold the same text.
      </p>
    );
  return (
    <ol className="m-0 list-none space-y-4 p-0" aria-label="Line differences">
      {rendered.map((entry, index) => {
        const beforeCount = entry.hunk.before.length;
        const afterCount = entry.hunk.after.length;
        return (
          <li
            className="overflow-hidden rounded-lg border border-edge-subtle"
            key={`${idPrefix}-hunk-${String(index)}`}
          >
            <h4 className="m-0 bg-hover px-3 py-2 text-control font-semibold text-strong">
              {`Hunk ${String(index + 1)}: ${oldLabel} from line ${String(entry.hunk.beforeStart)} (${String(beforeCount)} lines), ${newLabel} from line ${String(entry.hunk.afterStart)} (${String(afterCount)} lines)`}
            </h4>
            <ol className="m-0 list-none p-0 font-mono text-control">
              {entry.rows.map((row, rowIndex) => (
                <li
                  className={`flex gap-cluster px-3 py-0.5 ${row.kind === 'removed' ? 'bg-danger/10 text-danger' : row.kind === 'added' ? 'bg-success/10 text-success' : 'text-muted'}`}
                  key={`${idPrefix}-hunk-${String(index)}-row-${String(rowIndex)}`}
                >
                  <span>
                    {row.kind === 'removed'
                      ? '− '
                      : row.kind === 'added'
                        ? '+ '
                        : '  '}
                  </span>
                  <code className="whitespace-pre-wrap">
                    {row.text === '' ? '(empty line)' : row.text}
                  </code>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

/** The loaded file head behind the history. */
type FileHead =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'purged' }
  | { readonly status: 'unknown' }
  | {
      readonly status: 'ready';
      readonly path: string;
      readonly kind: 'note' | 'attachment';
      readonly headRevisionId: string | null;
      readonly headText: string;
    };

/** The state of the selected revision detail. */
type RevisionDetail =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'ready';
      readonly item: HistoryRevisionItem;
      readonly text: string;
    };

/** The state of the inline comparison. */
type DiffState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly hunks: readonly DiffHunk[] }
  | { readonly status: 'limit' }
  | { readonly status: 'error'; readonly message: string };

/**
 * The history of one file.
 *
 * Route params name the workspace and the file. Session and store come from
 * the application providers, so this screen remounts cleanly when the account
 * changes.
 */
export function HistoryView(): ReactNode {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : null;
  const fileId = typeof params.fileId === 'string' ? params.fileId : null;
  const session = useSession();
  const store = useLocalStore();

  if (workspaceId === null || fileId === null)
    return (
      <HistoryNotice
        workspaceId={null}
        title="This address names no history"
        description="Open a note and choose History in its menu."
      />
    );
  const accountId = session.account?.accountId ?? null;
  if (accountId === null)
    return (
      <Page width="wide">
        <PageHeader title="History" />
        <LoadingState shape="list" rows={5} label="The history is loading." />
      </Page>
    );
  return (
    <HistoryDetail
      store={store.store}
      workspaceId={workspaceId}
      fileId={fileId}
    />
  );
}

/** One message screen of the history, with the way back to the notes. */
function HistoryNotice({
  workspaceId,
  title,
  description,
}: {
  readonly workspaceId: string | null;
  readonly title: string;
  readonly description: string;
}): ReactNode {
  return (
    <Page width="wide">
      <PageHeader title="History" />
      <EmptyState
        icon={<HistoryIcon size={24} />}
        title={title}
        description={description}
        action={
          <Link
            className={buttonClassName({ variant: 'secondary' })}
            to={workspaceId === null ? '/' : `/w/${workspaceId}`}
          >
            Back to your notes
          </Link>
        }
      />
    </Page>
  );
}

/** Loads the file head and the server version pages of one file. */
function HistoryDetail({
  store,
  workspaceId,
  fileId,
}: {
  readonly store: LocalStore | null;
  readonly workspaceId: string;
  readonly fileId: string;
}): ReactNode {
  const [head, setHead] = useState<FileHead>({ status: 'loading' });
  const [items, setItems] = useState<readonly HistoryRevisionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RevisionDetail | null>(null);
  const [diff, setDiff] = useState<DiffState>({ status: 'idle' });
  const [counts, setCounts] = useState<ReadonlyMap<string, LineChangeCount>>(
    new Map(),
  );
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<LoadedAttachment | null>(null);
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(
    null,
  );
  const generationRef = useRef(0);

  /** Loads the file head once per file. */
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setHead({ status: 'loading' });
      const result = await getFile({ path: { workspaceId, fileId } });
      if (cancelled) return;
      if (result.error !== undefined || result.data === undefined) {
        const code = result.response?.status ?? 0;
        if (code === 410) setHead({ status: 'purged' });
        else if (code === 404) setHead({ status: 'unknown' });
        else
          setHead({ status: 'error', message: problemMessage(result.error) });
        return;
      }
      const file = result.data;
      setHead({
        status: 'ready',
        path: file.path,
        kind: file.kind,
        headRevisionId: file.headRevisionId,
        headText: file.head?.text ?? '',
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, fileId]);

  /** Loads the first history page once per file. */
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setItems([]);
      setNextCursor(null);
      setHistoryError(null);
      const result = await listHistory({
        path: { workspaceId, fileId },
        query: { limit: historyPageSize },
      });
      if (cancelled) return;
      if (result.error !== undefined || result.data === undefined) {
        setHistoryError(problemMessage(result.error));
        return;
      }
      setItems(result.data.revisions);
      setNextCursor(result.data.nextCursor);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, fileId]);

  /**
   * Measures what every listed version changed.
   *
   * A row says how many lines the version added and removed, which is one
   * comparison of each version with the one before it. The whole series
   * shares a single worker, so the timeline never blocks typing and never
   * pays for a worker per row.
   */
  useEffect(() => {
    if (head.status !== 'ready' || head.kind !== 'note') {
      setCounts(new Map());
      return;
    }
    let cancelled = false;
    const positions: number[] = [];
    const pairs: DiffPair[] = [];
    for (let index = 0; index + 1 < items.length; index += 1) {
      const newer = items[index];
      const older = items[index + 1];
      if (newer === undefined || older === undefined) continue;
      if (newer.text === null || older.text === null) continue;
      positions.push(index);
      pairs.push({ before: older.text, after: newer.text });
    }
    void requestDiffSeries(pairs).then((results) => {
      if (cancelled) return;
      const measured = new Map<string, LineChangeCount>();
      results.forEach((result, position) => {
        const index = positions[position];
        const item = index === undefined ? undefined : items[index];
        if (item === undefined || result.kind !== 'complete') return;
        measured.set(item.revisionId, countHunkLines(result.hunks));
      });
      setCounts(measured);
    });
    return () => {
      cancelled = true;
    };
  }, [items, head]);

  /** Revokes the attachment preview when it closes or changes. */
  useEffect(
    () => () => {
      preview?.dispose();
    },
    [preview],
  );

  /** Reloads the history pages from the start. */
  async function reloadHistory(): Promise<void> {
    const result = await listHistory({
      path: { workspaceId, fileId },
      query: { limit: historyPageSize },
    });
    if (result.error !== undefined || result.data === undefined) {
      setHistoryError(problemMessage(result.error));
      return;
    }
    setItems(result.data.revisions);
    setNextCursor(result.data.nextCursor);
    setHistoryError(null);
  }

  /** Loads the next history page, if the server offers one. */
  async function loadMore(): Promise<void> {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    const result = await listHistory({
      path: { workspaceId, fileId },
      query: { cursor: nextCursor, limit: historyPageSize },
    });
    setLoadingMore(false);
    if (result.error !== undefined || result.data === undefined) {
      setHistoryError(problemMessage(result.error));
      return;
    }
    setItems((current) => [...current, ...result.data.revisions]);
    setNextCursor(result.data.nextCursor);
  }

  /** Opens one revision: detail text, attachment preview, and inline diff. */
  async function openRevision(item: HistoryRevisionItem): Promise<void> {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSelectedId(item.revisionId);
    setDetail({ status: 'loading' });
    setDiff({ status: 'loading' });
    setActionError(null);
    preview?.dispose();
    setPreview(null);
    setPreviewRevisionId(null);

    let text = item.text ?? '';
    if (item.text === null && !item.deleted && item.objectId === null) {
      const fetched = await getRevision({
        path: { workspaceId, revisionId: item.revisionId },
      });
      if (generation !== generationRef.current) return;
      if (fetched.error !== undefined || fetched.data === undefined) {
        setDetail({ status: 'error', message: problemMessage(fetched.error) });
        setDiff({ status: 'idle' });
        return;
      }
      text = fetched.data.text ?? '';
    }
    if (generation !== generationRef.current) return;
    setDetail({ status: 'ready', item, text });

    if (head.status === 'ready' && head.kind === 'note') {
      try {
        const compared = await requestDiff(text, head.headText);
        if (generation !== generationRef.current) return;
        if (compared.kind === 'complete')
          setDiff({ status: 'ready', hunks: compared.hunks });
        else setDiff({ status: 'limit' });
      } catch {
        if (generation === generationRef.current)
          setDiff({
            status: 'error',
            message: 'The comparison did not finish.',
          });
      }
    } else {
      setDiff({ status: 'idle' });
    }

    if (head.status === 'ready' && head.kind === 'attachment') {
      try {
        const loaded = await loadAttachmentBinary(
          workspaceId,
          item.revisionId,
          new AbortController().signal,
        );
        if (generation !== generationRef.current) {
          loaded.dispose();
          return;
        }
        setPreview(loaded);
        setPreviewRevisionId(item.revisionId);
      } catch {
        if (generation === generationRef.current) setPreview(null);
      }
    }
  }

  /** Restores one revision as a new child of the current head. */
  async function restore(targetRevisionId: string): Promise<void> {
    if (head.status !== 'ready' || head.headRevisionId === null || busy) return;
    setBusy(true);
    setActionError(null);
    const result = await restoreRevision({
      path: { workspaceId, fileId },
      body: {
        mutationId: generateUUID(),
        deviceId: store?.deviceId ?? 'web-device',
        clientTime: new Date().toISOString(),
        targetRevisionId,
        expectedHead: head.headRevisionId,
        revisionId: generateUUID(),
        message: null,
      },
    });
    setBusy(false);
    if (result.error !== undefined || result.data === undefined) {
      setActionError(problemMessage(result.error));
      return;
    }
    setActionMessage(
      'That text is back as the newest version. Every earlier version is kept.',
    );
    await reloadHistory();
  }

  if (head.status === 'loading')
    return (
      <Page width="wide">
        <PageHeader title="History" />
        <LoadingState
          shape="list"
          rows={5}
          label="The history of this note is loading."
        />
      </Page>
    );
  if (head.status === 'error')
    return (
      <HistoryNotice
        workspaceId={workspaceId}
        title="The history is not available"
        description={head.message}
      />
    );
  if (head.status === 'unknown')
    return (
      <HistoryNotice
        workspaceId={workspaceId}
        title="This note has no history here"
        description="The note is not in this workspace. It may have been deleted permanently."
      />
    );
  if (head.status === 'purged')
    return (
      <HistoryNotice
        workspaceId={workspaceId}
        title="This note is deleted permanently"
        description="Its versions on the server are gone. Work that never left this device is still in Needs attention."
      />
    );

  const name = displayNoteName(head.path);
  const now = Date.now();
  const restorable = head.headRevisionId !== null;
  return (
    <Page width="wide">
      <PageHeader
        title={`History of ${name}`}
        description="Restore brings a version back as the newest one. Nothing is lost, and the text on this device stays as it is."
        actions={
          <Link
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            to={`/w/${workspaceId}/notes/${fileId}`}
          >
            Back to the note
          </Link>
        }
      />
      <div className="space-y-4">
        {actionMessage === '' ? null : (
          <Notice tone="success" message={actionMessage} />
        )}
        {actionError === null ? null : (
          <Notice tone="problem" message={actionError} />
        )}
        {historyError === null ? null : (
          <Notice tone="problem" message={historyError} />
        )}
        {items.length === 0 && historyError === null ? (
          <EmptyState
            icon={<HistoryIcon size={24} />}
            title="No version yet"
            description="Save this note once and its first version appears here."
          />
        ) : (
          <Card title="Versions" titleId="history-versions">
            <ol className="m-0 list-none p-0">
              {items.map((item, index) => {
                const when = relativeTime(item.serverTime, now);
                const change = rowChangeOf({
                  deleted: item.deleted,
                  restored: item.restoredFrom !== null,
                  first: item.parents.length === 0,
                  count: counts.get(item.revisionId) ?? null,
                });
                const selected = item.revisionId === selectedId;
                const panelId = `history-panel-${String(index)}`;
                const label = when === '' ? 'Saved' : `Saved ${when}`;
                return (
                  <Fragment key={item.revisionId}>
                    <ListRow>
                      <button
                        type="button"
                        className="min-w-0 flex-1 cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        aria-expanded={selected}
                        aria-controls={panelId}
                        onClick={() => {
                          if (selected) {
                            setSelectedId(null);
                            return;
                          }
                          void openRevision(item);
                        }}
                      >
                        <span className="block truncate text-ui font-medium text-strong">
                          {label}
                        </span>
                        <span className="block truncate text-control text-muted">
                          {rowChangeText(change)}
                        </span>
                      </button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || !restorable}
                        label={`Restore the version ${label.toLowerCase()}`}
                        onClick={() => {
                          void restore(item.revisionId);
                        }}
                      >
                        Restore
                      </Button>
                    </ListRow>
                    {selected ? (
                      <li
                        className="border-b border-edge-subtle px-1 py-3 last:border-b-0"
                        id={panelId}
                      >
                        <RevisionPanel
                          detail={detail}
                          diff={diff}
                          kind={head.kind}
                          preview={preview}
                          previewRevisionId={previewRevisionId}
                          name={name}
                          newest={item.revisionId === head.headRevisionId}
                        />
                      </li>
                    ) : null}
                  </Fragment>
                );
              })}
            </ol>
            {nextCursor === null ? null : (
              <div className="mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => {
                    void loadMore();
                  }}
                >
                  {loadingMore
                    ? 'Loading older versions'
                    : 'Show older versions'}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </Page>
  );
}

/**
 * What one selected version holds, under its row.
 *
 * A note shows the lines that changed between that version and the newest
 * one, and offers its whole text. An image shows the picture of that
 * version.
 */
function RevisionPanel({
  detail,
  diff,
  kind,
  preview,
  previewRevisionId,
  name,
  newest,
}: {
  readonly detail: RevisionDetail | null;
  readonly diff: DiffState;
  readonly kind: 'note' | 'attachment';
  readonly preview: LoadedAttachment | null;
  readonly previewRevisionId: string | null;
  readonly name: string;
  /** True when this version is the newest one, so it has no comparison. */
  readonly newest: boolean;
}): ReactNode {
  if (detail === null || detail.status === 'loading')
    return <LoadingState label="This version is loading." />;
  if (detail.status === 'error')
    return <Notice tone="problem" message={detail.message} />;
  if (kind === 'attachment')
    return preview !== null && previewRevisionId === detail.item.revisionId ? (
      <img
        className="max-h-96 rounded-lg border border-edge-subtle"
        src={preview.url}
        alt={`${name} as it was in this version`}
      />
    ) : (
      <p className="m-0 text-control text-muted">
        This version has no picture on this device.
      </p>
    );
  return (
    <div className="space-y-3">
      <h3 className="m-0 text-control font-semibold uppercase tracking-wide text-muted">
        {newest
          ? 'This is the newest version'
          : 'Changes to the newest version'}
      </h3>
      {newest ? (
        <p className="m-0 text-control text-muted">
          Your note holds this text right now.
        </p>
      ) : diff.status === 'idle' ? (
        <p className="m-0 text-control text-muted">
          No comparison is available for this version.
        </p>
      ) : diff.status === 'loading' ? (
        <LoadingState
          shape="list"
          rows={4}
          label="The comparison of the two versions is loading."
        />
      ) : diff.status === 'ready' ? (
        <InlineDiff
          hunks={diff.hunks}
          idPrefix={`history-${detail.item.revisionId}`}
          oldLabel="This version"
          newLabel="Newest version"
        />
      ) : diff.status === 'limit' ? (
        <p className="m-0 text-control text-muted">
          The two versions are too far apart to compare line by line. Open the
          whole text below, or restore the version.
        </p>
      ) : (
        <Notice tone="problem" message={diff.message} />
      )}
      <details>
        <summary className="cursor-pointer text-control text-muted">
          Whole text of this version
        </summary>
        <pre
          className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-edge-subtle bg-surface p-3 font-mono text-control text-strong"
          aria-label={`Whole text of ${name} in this version`}
        >
          {detail.text}
        </pre>
      </details>
    </div>
  );
}
