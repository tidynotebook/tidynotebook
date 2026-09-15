/**
 * The note list of one open area.
 *
 * The route view groups the notes of the workspace by how recently they
 * changed, and it offers the create action both in the header and in the
 * empty state, so the one job of the screen is always one click away. The
 * layout frame lives in `shell.tsx`; this file owns the note list screen only.
 */
import { useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  Button,
  EmptyState,
  FileTextIcon,
  LoadingState,
  Page,
  PageHeader,
  PlusIcon,
} from '@notesapp/ui';
import { useLocalStore, useSession } from '../../app.tsx';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { useFiles } from '../../shell/files.tsx';
import { useCreateNote } from './new-note.tsx';
import { groupNotesByRecency } from '../../lib/note-groups.ts';
import { noteRowMeta } from '../../lib/note-row.ts';

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

  const now = Date.now();
  const groups = useMemo(
    () => groupNotesByRecency(files.notes, now),
    [files.notes, now],
  );
  const total = files.notes.length;

  return (
    <Page width="wide">
      <PageHeader
        title="All notes"
        description={`${String(total)} ${total === 1 ? 'note' : 'notes'}`}
        actions={
          <Button
            size="sm"
            icon={<PlusIcon size={14} />}
            disabled={store.store === null}
            onClick={() => newNote.create()}
          >
            New note
          </Button>
        }
      />
      {newNote.error === null ? null : (
        <p className="mb-3 text-control text-danger" role="alert">
          {newNote.error}
        </p>
      )}
      {files.loading ? (
        <LoadingState shape="list" rows={6} label="Your notes are loading." />
      ) : total === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={32} />}
          title="No notes yet."
          description="Write your first note to fill this space."
          action={
            <Button
              icon={<PlusIcon size={16} />}
              disabled={store.store === null}
              onClick={() => newNote.create()}
            >
              New note
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label} aria-labelledby={`group-${group.label}`}>
              <h2
                className="mb-1 px-2 text-control font-semibold uppercase tracking-wide text-muted"
                id={`group-${group.label}`}
              >
                {group.label}
              </h2>
              <ul className="m-0 list-none p-0">
                {group.notes.map((note) => {
                  const meta = noteRowMeta(note.path, note.updatedAt, now);
                  return (
                    <li key={note.fileId}>
                      <Link
                        to={`/w/${workspaceId}/notes/${note.fileId}`}
                        className="flex min-h-11 items-center gap-group rounded-lg border-b border-edge-subtle px-2 py-2 text-ink no-underline motion-safe:transition-colors last:border-b-0 hover:bg-hover"
                      >
                        <span
                          className="inline-flex shrink-0 items-center text-muted"
                          aria-hidden="true"
                        >
                          <FileTextIcon size={16} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-ui font-medium text-strong">
                            {meta.name}
                          </span>
                          {meta.folder === null ? null : (
                            <span className="truncate text-control text-muted">
                              {meta.folder}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-control text-muted">
                          {meta.when}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
