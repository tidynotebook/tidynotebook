/**
 * One note route view.
 *
 * The unknown, purged, empty, and readable states stay distinct here. The two
 * dialogs that the note screen owns, Move to folder and Publish, live beside
 * the editor. Both open from the command palette, which is where every action
 * of the open note lives, so the note surface itself gains no control.
 *
 * Move to folder writes through the store, and the editor reads the new path
 * from the note list, so this screen carries no path of its own. Publish calls
 * one generated operation and shows the new link one time. The editor host
 * that owns the one CodeMirror view is loaded lazily from `note-editor.tsx`.
 * The layout frame lives in `shell.tsx`.
 */
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { LoadingState, Page, PageHeader, PageRegion } from '@notesapp/ui';
import { useLocalStore, useSession } from '../../app.tsx';
import { useFiles } from '../../shell/files.tsx';
import { MoveItemsDialog } from '../folders/folders.tsx';
import { PublishDialog } from '../publishing/publish-dialog.tsx';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { noteScreenClassName } from '../../lib/note-column.ts';

const NoteEditorLoader = lazy(async () => ({
  default: (await import('../editor/note-loader.tsx')).NoteEditorLoader,
}));

/** A committed route fallback owns its title until the loader is ready. */
function NoteRouteTitle({
  screen,
  children,
}: {
  readonly screen: string;
  readonly children: ReactNode;
}): ReactNode {
  useDocumentTitle(screen);
  return children;
}

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
  const [publishOpen, setPublishOpen] = useState(false);
  const moveFolders = useMemo(
    () =>
      [...new Set([...files.folders, ...files.emptyFolders])].sort(
        (left, right) => (left < right ? -1 : 1),
      ),
    [files.folders, files.emptyFolders],
  );
  const notePath =
    files.notes.find((note) => note.fileId === fileId)?.path ?? null;

  if (workspaceId === null || fileId === null)
    return (
      <NoteRouteTitle screen="Note not found">
        <Page>
          <PageHeader
            title="Note not found"
            description="This address does not match a note. The note may be deleted, or the link may be wrong."
          />
        </Page>
      </NoteRouteTitle>
    );

  const accountId = session.account?.accountId ?? null;
  if (accountId === null)
    return (
      <NoteRouteTitle screen="Loading note">
        <Page>
          <LoadingState shape="note" label="Loading note" />
        </Page>
      </NoteRouteTitle>
    );

  return (
    <main className={noteScreenClassName()}>
      <Suspense
        fallback={
          <NoteRouteTitle screen="Loading note">
            <PageRegion>
              <LoadingState shape="note" label="Loading editor" />
            </PageRegion>
          </NoteRouteTitle>
        }
      >
        <NoteEditorLoader
          store={store.store}
          accountId={accountId}
          workspaceId={workspaceId}
          fileId={fileId}
          currentPath={notePath}
          onMoveToFolder={() => setMoveOpen(true)}
          onPublish={() => setPublishOpen(true)}
        />
      </Suspense>
      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        workspaceId={workspaceId}
        scope={{ kind: 'note', fileId }}
        notes={files.notes}
      />
      {notePath === null ? null : (
        <MoveItemsDialog
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          store={store.store}
          accountId={accountId}
          workspaceId={workspaceId}
          area={files}
          folders={moveFolders}
          emptyFolders={files.emptyFolders}
          items={[{ kind: 'note', fileId, path: notePath }]}
          onFolderMoved={files.moveEmptyFolders}
        />
      )}
    </main>
  );
}
