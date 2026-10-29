/**
 * The folder dialogs: new folder and move to folder.
 *
 * A folder renames in place in the tree (record 0164), so it has no dialog of
 * its own.
 *
 * Every dialog states the outcome before it writes and reports one cause
 * when it cannot run. The rules of a rewrite live in `lib/folder-moves.ts`
 * and the write itself lives in `apply-moves.ts`.
 *
 * A folder holds no state of its own: it exists because notes carry a path
 * with a separator in it. New folder therefore writes nothing. It names a
 * folder that this device remembers until a note is made or moved into it,
 * so making a folder never makes a note.
 *
 * Every field here is the one `TextField` of `@notesapp/ui` and every folder
 * choice is the one tree of `folder-tree-picker.tsx`, so no dialog of this
 * feature writes
 * the classes of a control (decision 0065). Each dialog is a form, so Enter
 * confirms it the way the platform confirms a form.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LocalStore } from '@notesapp/sync';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Notice,
  TextField,
} from '@notesapp/ui';
import { FolderField, FolderTreePicker } from './folder-tree-picker.tsx';
import { applyMoves } from './apply-moves.ts';
import {
  planMove,
  type DragItem,
  type MoveArea,
} from '../../lib/folder-moves.ts';
import { childFolderPath, isInsideFolder } from '../../lib/folder-selection.ts';
import {
  baseNameOf,
  cleanNoteBaseName,
  displayNoteName,
  folderOf,
  noteNameProblem,
  noteBaseNameProblem,
} from '../../lib/note-name.ts';

/**
 * Names a folder. It writes nothing and it creates no note.
 *
 * The folder appears in the tree at once and stays there until a note is
 * made or moved into it. The context menu of the folder row holds New note
 * in this folder and New folder in this folder.
 *
 * The dialog states the parent it will use, so a person reads where the
 * folder lands before they make it and never has to guess. `parent` comes
 * from the row that started the action, or from the selected folder for the
 * main action and the command palette.
 */
export function NewFolderDialog({
  open,
  onClose,
  folders,
  parent,
  onCreated,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Every folder that already exists, so a repeated name is refused. */
  readonly folders: readonly string[];
  /** The selected folder, or an empty string for the root. */
  readonly parent: string;
  readonly onCreated: (folder: string) => void;
}): ReactNode {
  const [name, setName] = useState('');
  const [inside, setInside] = useState(parent);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef('');

  useEffect(() => {
    if (!open) return;
    setInside(parent);
    nameRef.current = '';
    setName('');
    setError(null);
  }, [open, parent]);

  /** Check the typed name and create the folder under the current parent. */
  const create = (): void => {
    const child = cleanNoteBaseName(nameRef.current);
    if (child.includes('/')) {
      setError('A folder name cannot contain a slash.');
      return;
    }
    const problem = noteBaseNameProblem(child);
    if (problem !== null) {
      setError(problem.replaceAll('note name', 'folder name'));
      return;
    }
    const folder = childFolderPath(inside, child);
    const pathProblem = noteNameProblem(folder);
    if (pathProblem !== null) {
      setError(pathProblem.replaceAll('note name', 'folder name'));
      return;
    }
    if (folders.some((one) => one.toLowerCase() === folder.toLowerCase())) {
      setError(`A folder named ${folder} already exists.`);
      return;
    }
    onClose();
    onCreated(folder);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New folder"
      titleId="new-folder-title"
      width="small"
    >
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          create();
        }}
      >
        <DialogBody>
          <TextField
            id="new-folder-name"
            label="Name"
            value={name}
            error={error ?? undefined}
            autoFocus
            onChange={(value) => {
              nameRef.current = value;
              setName(value);
              setError(null);
            }}
          />
          <FolderField
            id="new-folder-inside"
            label="Inside"
            value={inside}
            folders={folders}
            onChange={(folder) => {
              setInside(folder);
              setError(null);
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Create folder
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** The words that name what a move carries, for the title of the dialog. */
function moveSubject(items: readonly DragItem[]): string {
  const only = items.length === 1 ? items[0] : undefined;
  if (only === undefined) return `${String(items.length)} items`;
  if (only.kind === 'note') return displayNoteName(baseNameOf(only.path));
  return only.folder.split('/').at(-1) ?? only.folder;
}

/** The folder that holds the first item, which the dialog chooses first. */
function startFolder(items: readonly DragItem[]): string {
  const first = items[0];
  if (first === undefined) return '';
  return folderOf(first.kind === 'note' ? first.path : first.folder);
}

/**
 * Moves one note, one folder or a selection of rows into a folder that
 * already exists, or into a new one that New folder here names (record 0164).
 *
 * The move is one store operation, so the tree and the open editor both read
 * the new paths from the store. `planMove` of `lib/folder-moves.ts` decides
 * every new path first, so nothing moves unless everything can. A folder of
 * the move and its children are dim rows of the tree, because a folder cannot
 * move into itself.
 */
export function MoveItemsDialog({
  open,
  onClose,
  store,
  accountId,
  workspaceId,
  area,
  folders,
  emptyFolders,
  items,
  onFolderMoved,
  returnFocus,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly store: LocalStore | null;
  readonly accountId: string;
  readonly workspaceId: string;
  /** The notes and the names in use of the area (record 0184). */
  readonly area: MoveArea;
  /** Every folder of the workspace, sorted by path. */
  readonly folders: readonly string[];
  /** The folders that only this device remembers. */
  readonly emptyFolders: readonly string[];
  /** The rows that move. */
  readonly items: readonly DragItem[];
  /** Follows a folder of the move with the folders this device remembers. */
  readonly onFolderMoved: (fromFolder: string, toFolder: string) => void;
  /**
   * Gives the focus back when the dialog closes. The row that opened it can
   * leave the tree with the move, so the tree names where the focus goes.
   */
  readonly returnFocus?: (() => void) | undefined;
}): ReactNode {
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const movedFolders = items.flatMap((item) =>
    item.kind === 'folder' ? [item.folder] : [],
  );
  const movedKey = movedFolders.join('\n');
  const isDisabled = useCallback(
    (folder: string): boolean =>
      movedKey
        .split('\n')
        .some((moved) => moved !== '' && isInsideFolder(folder, moved)),
    [movedKey],
  );

  // The dialog reads the rows when it opens, so a change of the tree behind
  // it does not move the choice that the person is making.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!open) return;
    setTarget(startFolder(itemsRef.current));
    setError(null);
    setBusy(false);
  }, [open]);

  const outcome = planMove(items, target, area, emptyFolders);
  const message = error ?? outcome.problem;
  const move = (): void => {
    if (busy || outcome.plan === null || outcome.problem !== null) return;
    if (store === null) {
      setError('Local storage is unavailable, so nothing can move.');
      return;
    }
    const plan = outcome.plan;
    setBusy(true);
    void (async (): Promise<void> => {
      const failure = await applyMoves(
        store,
        accountId,
        workspaceId,
        plan.moves,
      );
      setBusy(false);
      if (failure !== null) {
        setError(failure);
        return;
      }
      for (const rewrite of plan.folderMoves)
        onFolderMoved(rewrite.from, rewrite.to);
      onClose();
    })();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Move ${moveSubject(items)} to`}
      titleId="move-items-title"
      fillSheet
      headerActions
      width="small"
      returnFocus={returnFocus}
    >
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          move();
        }}
      >
        <DialogBody>
          <FolderTreePicker
            folders={folders}
            searchPlacement="header"
            selected={target}
            currentFolder={
              items.every(
                (item) =>
                  folderOf(item.kind === 'note' ? item.path : item.folder) ===
                  startFolder(items),
              )
                ? startFolder(items)
                : undefined
            }
            label={`Move ${moveSubject(items)} to`}
            rootName="All notes, at the top"
            isDisabled={isDisabled}
            disabledNote={(folder) =>
              movedFolders.includes(folder) ? 'this folder' : null
            }
            autoFocus
            onSelect={(folder) => {
              setTarget(folder);
              setError(null);
            }}
          />
          {message === null ? null : (
            <Notice className="mt-3" tone="problem" message={message} />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={busy || outcome.plan === null || outcome.problem !== null}
          >
            Move
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
