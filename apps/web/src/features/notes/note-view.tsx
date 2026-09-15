/**
 * One note route view.
 *
 * The unknown, purged, empty, and readable states stay distinct here, and the
 * Move to folder dialog that the note screen owns lives beside the editor. The
 * dialog writes the move through the store, and the editor reads the new path
 * from the note list, so this screen carries no path of its own. The editor
 * host that owns the one CodeMirror view is loaded lazily from
 * `note-editor.tsx`. The layout frame lives in `shell.tsx`.
 */
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { LoadingState, Page, pageGutter, PageHeader } from '@notesapp/ui';
import { useLocalStore, useSession } from '../../app.tsx';
import { useFiles } from '../../shell/files.tsx';
import { MoveNoteDialog } from '../folders/folders.tsx';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { displayNoteName } from '../../lib/note-name.ts';

const NoteEditorLoader = lazy(async () => ({
  default: (await import('../editor/note-editor.tsx')).NoteEditorLoader,
}));

/** One note: unknown, purged, empty, and readable states stay distinct. */
export function NoteView(): ReactNode {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : null;
  const fileId = typeof params.fileId === 'string' ? params.fileId : null;
  const session = useSession();
  const store = useLocalStore();
  const files = useFiles();
  const [moveOpen, setMoveOpen] = useState(false);
  const moveFolders = useMemo(
    () =>
      [...new Set([...files.folders, ...files.emptyFolders])].sort(
        (left, right) => (left < right ? -1 : 1),
      ),
    [files.folders, files.emptyFolders],
  );
  const notePath =
    files.notes.find((note) => note.fileId === fileId)?.path ?? null;
  useDocumentTitle(notePath === null ? null : displayNoteName(notePath));

  if (workspaceId === null || fileId === null)
    return (
      <Page>
        <PageHeader title="Note not found" />
        <p className="m-0">
          This address does not match a note. The note may be deleted, or the
          link may be wrong.
        </p>
      </Page>
    );

  const accountId = session.account?.accountId ?? null;
  if (accountId === null)
    return (
      <main className={`mx-auto w-full max-w-3xl ${pageGutter} py-6`}>
        <LoadingState shape="note" label="The note is loading." />
      </main>
    );

  return (
    <main className="flex h-full min-w-0 flex-col">
      <Suspense
        fallback={
          <div className={`mx-auto w-full max-w-3xl ${pageGutter} py-6`}>
            <LoadingState shape="note" label="The editor is loading." />
          </div>
        }
      >
        <NoteEditorLoader
          store={store.store}
          accountId={accountId}
          workspaceId={workspaceId}
          fileId={fileId}
          onMoveToFolder={() => setMoveOpen(true)}
        />
      </Suspense>
      {notePath === null ? null : (
        <MoveNoteDialog
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          store={store.store}
          accountId={accountId}
          workspaceId={workspaceId}
          notes={files.notes}
          folders={moveFolders}
          fileId={fileId}
          path={notePath}
        />
      )}
    </main>
  );
}
