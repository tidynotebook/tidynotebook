import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Menu,
  MoreIcon,
  Notice,
  TextField,
} from '@notesapp/ui';
import { useLocalStore, useRequestSync, useSession } from '../../app.tsx';
import { useFiles } from '../../shell/files.tsx';
import { knownFolderPaths } from '../../lib/folder-selection.ts';
import { renamePlan } from '../../lib/tree-rename.ts';
import { trashPlan } from '../../lib/tree-trash.ts';
import { deleteFolderLabel } from '../../lib/delete-label.ts';
import { folderOf } from '../../lib/note-name.ts';
import { applyMoves } from './apply-moves.ts';
import { MoveItemsDialog, NewFolderDialog } from './folders.tsx';
import { deleteNotes } from '../editor/note-delete.ts';
import { useDeleteNotice } from '../trash/trash.tsx';

/** Folder pages use the same plans and writes as the tree. */
export function FolderPageActions({
  workspaceId,
  folder,
}: {
  readonly workspaceId: string;
  readonly folder: string;
}): ReactNode {
  const files = useFiles();
  const store = useLocalStore().store;
  const accountId = useSession().account?.accountId ?? null;
  const requestSync = useRequestSync();
  const navigate = useNavigate();
  const { announce } = useDeleteNotice();
  const [dialog, setDialog] = useState<
    'new' | 'rename' | 'move' | 'delete' | null
  >(null);
  const [name, setName] = useState(folder.split('/').at(-1) ?? folder);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scope = useRef<{ active: boolean } | null>(null);
  useEffect(() => {
    const owner = { active: true };
    scope.current = owner;
    return () => {
      owner.active = false;
    };
  }, [store, accountId, workspaceId, folder]);
  const folders = knownFolderPaths(
    files.notes.map((note) => note.path),
    files.emptyFolders,
  );
  /** Open a folder page, or All notes for the root folder. */
  const openFolder = (path: string): void => {
    void navigate(
      path === ''
        ? `/w/${workspaceId}`
        : `/w/${workspaceId}/folders/${path.split('/').map(encodeURIComponent).join('/')}`,
    );
  };
  /** Rename the folder and move its notes, then open the new folder if this page still owns the result. */
  const rename = async (): Promise<void> => {
    if (busy) return;
    const owner = scope.current;
    const plan = renamePlan(
      { kind: 'folder', path: folder },
      name,
      files,
      folders,
    );
    if (plan.kind === 'refused') {
      setProblem(plan.problem);
      return;
    }
    if (plan.kind === 'unchanged') {
      setDialog(null);
      return;
    }
    if (store === null || accountId === null) {
      setProblem('The name did not change. Try again.');
      return;
    }
    setBusy(true);
    setProblem(null);
    const failure = await applyMoves(store, accountId, workspaceId, plan.moves);
    if (owner === null || !owner.active || scope.current !== owner) return;
    setBusy(false);
    if (failure !== null) {
      setProblem(failure);
      return;
    }
    if (plan.folder !== null) {
      files.moveEmptyFolders(plan.folder.from, plan.folder.to);
      openFolder(plan.folder.to);
    }
    requestSync();
    setDialog(null);
  };
  /** Move the folder notes to Trash, then leave the folder if this page still owns the result. */
  const remove = async (): Promise<void> => {
    if (busy) return;
    const owner = scope.current;
    const plan = trashPlan([{ kind: 'folder', path: folder }], files.notes);
    if (plan.items.length > 0 && (store === null || accountId === null)) {
      setProblem('Nothing moved to Trash. Try again.');
      return;
    }
    for (const keep of plan.keepFolders) files.addEmptyFolder(keep);
    setBusy(true);
    setProblem(null);
    const result =
      plan.items.length === 0
        ? { ok: true }
        : store === null || accountId === null
          ? { ok: false, message: 'Nothing moved to Trash. Try again.' }
          : await deleteNotes(store, accountId, workspaceId, plan.items);
    if (owner === null || !owner.active || scope.current !== owner) return;
    setBusy(false);
    if (!result.ok) {
      setProblem(
        'message' in result
          ? result.message
          : 'Nothing moved to Trash. Try again.',
      );
      return;
    }
    for (const drop of plan.dropFolders) files.removeEmptyFolders(drop);
    if (plan.items.length > 0) announce({ workspaceId, items: plan.items });
    requestSync();
    setDialog(null);
    openFolder(folderOf(folder));
  };
  return (
    <>
      <Menu
        label="Folder actions"
        icon={<MoreIcon />}
        items={[
          {
            id: 'new',
            label: 'New folder inside',
            onSelect: () => setDialog('new'),
          },
          {
            id: 'rename',
            label: 'Rename',
            onSelect: () => {
              setName(folder.split('/').at(-1) ?? folder);
              setProblem(null);
              setDialog('rename');
            },
          },
          { id: 'move', label: 'Move', onSelect: () => setDialog('move') },
        ]}
        pinned={[
          {
            id: 'delete',
            label: deleteFolderLabel,
            danger: true,
            onSelect: () => {
              setProblem(null);
              setDialog('delete');
            },
          },
        ]}
      />
      <NewFolderDialog
        open={dialog === 'new'}
        onClose={() => setDialog(null)}
        folders={folders}
        parent={folder}
        onCreated={(path) => {
          files.addEmptyFolder(path);
          openFolder(path);
        }}
      />
      <MoveItemsDialog
        open={dialog === 'move' && accountId !== null}
        onClose={() => setDialog(null)}
        store={store}
        accountId={accountId ?? ''}
        workspaceId={workspaceId}
        area={files}
        folders={folders}
        emptyFolders={files.emptyFolders}
        items={[{ kind: 'folder', folder }]}
        onFolderMoved={(from, to) => {
          files.moveEmptyFolders(from, to);
          openFolder(to);
        }}
      />
      <Dialog
        open={dialog === 'rename'}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        title="Rename folder"
        titleId="rename-folder-title"
        width="small"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
        >
          <DialogBody>
            <TextField
              id="folder-name"
              label="Name"
              value={name}
              onChange={setName}
              autoFocus
              error={problem ?? undefined}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Renaming' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
      <Dialog
        open={dialog === 'delete'}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        title={`${deleteFolderLabel}?`}
        titleId="delete-folder-title"
        width="small"
      >
        <DialogBody>
          <p className="text-control text-muted">
            Notes in this folder go to Trash.
          </p>
          {problem === null ? null : (
            <Notice tone="problem" message={problem} />
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setDialog(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? 'Deleting' : deleteFolderLabel}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
