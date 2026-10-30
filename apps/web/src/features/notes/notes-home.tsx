import {
  Stack,
  Inline,
  Button,
  EmptyState,
  FileTextIcon,
  LoadingState,
  Notice,
  Page,
  pageGroupLabelClassName,
  PageHeader,
  pageListClassName,
  PlusIcon,
  rowClassName,
} from '@notesapp/ui';

/**
 * The note list of one open area.
 *
 * The screen has one job and one primary button for it. New note sits in the
 * empty state when there are no notes, and in the page header otherwise
 * (decision 0062). The sidebar holds a row instead of a second filled button.
 *
 * The notes group by how recently they changed. A group label is a quiet
 * heading in sentence case, and the rows under it separate by space and by
 * fill and never by a rule (decision 0063). Each row is the one row recipe of
 * the product, so a note of this list, a note of the tree and a row of a menu
 * are one size, one radius and one focus treatment (decision 0065).
 *
 * The page has the note measure, as every page does, and lists its groups in
 * the side region (decision 0137).
 *
 * A group of a thousand notes renders the rows in view and a few around them,
 * and keeps the height of the others as space (record 0165). Every heading
 * stays in the document, so the list of groups in the side region finds each
 * one. Each row states its place and the size of its group, so a screen reader
 * reads a list of a thousand. The page keeps its scroll offset for the
 * session, so a person who opens a note and comes back finds the row they
 * left.
 *
 * The layout frame lives in `shell.tsx`; this file owns the note list screen
 * only.
 */
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router';

import { useLocalStore, useSession } from '../../app.tsx';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { useNow } from '../../shell/now.ts';
import { useFiles } from '../../shell/files.tsx';
import { NewFromTemplate } from '../templates/new-from-template.tsx';
import { useCreateNote } from './new-note.tsx';
import { groupNotesByRecency } from '../../lib/note-groups.ts';
import {
  noteGroupHeadingId,
  noteGroupSections,
} from '../../lib/page-sections.ts';
import { noteRowMeta } from '../../lib/note-row.ts';
import { showNewNoteInHeader } from '../../lib/notes-home-action.ts';
import type { NoteSummary } from '../../lib/note-list.ts';
import { pinnedIndex } from '../../lib/row-window.ts';
import { scrollerOf } from '../../shell/row-window.ts';
import { useContentRowWindow } from '../../shell/content-row-window.ts';

/** The quiet heading of one time band of the list. */
const groupLabelClassName = pageGroupLabelClassName();

/**
 * Where the list of each workspace was scrolled to, for this session.
 *
 * The frame keeps one box that scrolls for every route, and a note route
 * leaves it at the top, so the offset is kept here and given back when the
 * list mounts again.
 */
const keptOffsets = new Map<string, number>();

/** Keeps the scroll offset of the list of one workspace while it mounts. */
function useKeptOffset(
  scopeKey: string,
  ready: boolean,
): (element: HTMLElement | null) => void {
  const elementRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!ready || element === null) return;
    const scroller = scrollerOf(element);
    if (scroller === null) return;
    const kept = keptOffsets.get(scopeKey);
    scroller.scrollTop = kept ?? 0;
    /** Keep the list scroll offset for this scope so a return restores it. */
    const remember = (): void => {
      keptOffsets.set(scopeKey, scroller.scrollTop);
    };
    scroller.addEventListener('scroll', remember, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', remember);
    };
  }, [scopeKey, ready]);
  return (element) => {
    elementRef.current = element;
  };
}

/**
 * The rows of one time band, in a window around the view (record 0165).
 *
 * The list item stays a list item and the router link fills it, the shape
 * that `ListRow` renders for a plain address. This row needs the router and
 * not the platform, so it reads the row recipe directly.
 *
 * The row with the focus stays in the document when a person scrolls it out
 * of the window, as the row of the tree does, so the focus never falls to the
 * page. The list keeps it by its note, because the list sorts again.
 */
function NoteGroupList({
  notes,
  workspaceId,
  now,
}: {
  readonly notes: readonly NoteSummary[];
  readonly workspaceId: string;
  readonly now: number;
}): ReactNode {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const keys = useMemo(() => notes.map((note) => note.fileId), [notes]);
  const rows = useContentRowWindow(keys, pinnedIndex(keys, focusedId));
  return (
    <ul className={pageListClassName()} ref={rows.listRef}>
      {rows.indexes.map((index) => {
        const note = notes[index];
        if (note === undefined) return null;
        const meta = noteRowMeta(note.path, note.updatedAt, now);
        return (
          <li
            className="flex"
            key={note.fileId}
            aria-posinset={index + 1}
            aria-setsize={notes.length}
            onFocus={() => setFocusedId(note.fileId)}
            // A row gives up its place when the focus moves to another
            // element, and keeps it while the window of the browser is away.
            onBlur={(event) => {
              const next = event.relatedTarget;
              if (next instanceof Node && !event.currentTarget.contains(next))
                setFocusedId((current) =>
                  current === note.fileId ? null : current,
                );
            }}
          >
            <Link
              className={rowClassName({
                inset: false,
                className: 'ui-list-row min-w-0 flex-1',
              })}
              to={`/w/${workspaceId}/notes/${note.fileId}`}
              aria-label={
                meta.folder === null
                  ? meta.name
                  : `${meta.name}, in ${meta.folder}`
              }
            >
              <span
                className="inline-flex shrink-0 items-center text-muted"
                aria-hidden="true"
              >
                <FileTextIcon />
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-strong">
                {meta.name}
                {meta.folder === null ? null : (
                  <span className="text-secondary text-muted">
                    {' '}
                    · {meta.folder}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-secondary text-muted">
                {meta.when}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The note list of the open area. */
export function NotesHomeView(): ReactNode {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : '';
  const files = useFiles();
  const session = useSession();
  const store = useLocalStore();
  const accountId = session.account?.accountId ?? null;
  const newNote = useCreateNote(store.store, accountId, workspaceId);
  useDocumentTitle('All notes');
  const now = useNow();
  const groups = useMemo(
    () => groupNotesByRecency(files.notes, now),
    [files.notes, now],
  );
  const total = files.notes.length;
  const actions = (
    <Inline
      gap={2}
      wrap
      align="center"
      justify="center"
      as="div"
      className="lg:flex-row-reverse"
    >
      <Button
        icon={<PlusIcon />}
        disabled={store.store === null}
        onClick={() => newNote.create('')}
      >
        New note
      </Button>
      <NewFromTemplate key={workspaceId} workspaceId={workspaceId} folder="" />
    </Inline>
  );
  const keepOffset = useKeptOffset(workspaceId, !files.loading);

  return (
    <Page
      sections={
        files.loading || total === 0 ? undefined : noteGroupSections(groups)
      }
    >
      <Stack gap={4} as="div" ref={keepOffset}>
        <PageHeader
          title="All notes"
          description={
            files.loading || total === 0
              ? undefined
              : `${String(total)} ${total === 1 ? 'note' : 'notes'}`
          }
          actions={showNewNoteInHeader(files.loading, total) ? actions : null}
        />
        {newNote.error === null ? null : (
          <Notice tone="problem" message={newNote.error} />
        )}
        {files.loading ? (
          <LoadingState shape="list" rows={6} label="Your notes are loading." />
        ) : total === 0 ? (
          <EmptyState
            icon={<FileTextIcon size={20} />}
            title="No notes yet"
            description="Write your first note."
            action={actions}
          />
        ) : (
          <Stack gap={{ fine: 6, coarse: 4 }}>
            {groups.map((group) => (
              <Stack
                as="section"
                gap={2}
                className="ui-section"
                key={group.label}
                aria-labelledby={noteGroupHeadingId(group.label)}
              >
                <h2
                  className={groupLabelClassName}
                  id={noteGroupHeadingId(group.label)}
                >
                  {group.label}
                </h2>
                <NoteGroupList
                  notes={group.notes}
                  workspaceId={workspaceId}
                  now={now}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
