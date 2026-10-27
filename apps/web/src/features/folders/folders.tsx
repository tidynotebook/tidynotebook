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
 * Every field here is the one `TextField` of `@notesapp/ui` and every row of
 * the folder picker is the one row recipe, so no dialog of this feature writes
 * the classes of a control (decision 0065). Each dialog is a form, so Enter
 * confirms it the way the platform confirms a form.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LocalStore } from '@notesapp/sync';
import {
  Button,
  CheckIcon,
  Dialog,
  DialogBody,
  DialogFooter,
  Notice,
  rowClassName,
  TextField,
} from '@notesapp/ui';
import { FolderPicker } from './folder-picker.tsx';
import { applyMoves } from './apply-moves.ts';
import {
  planMove,
  type DragItem,
  type MoveArea,
} from '../../lib/folder-moves.ts';
import { childFolderPath } from '../../lib/folder-selection.ts';
import {
  baseNameOf,
  cleanNoteBaseName,
  cleanNoteName,
  displayNoteName,
  folderOf,
  noteNameProblem,
  noteBaseNameProblem,
} from '../../lib/note-name.ts';

/**
 * One row of the folder picker.
 *
 * The radio is the control and the row is what a person sees, so the input is
 * visually hidden inside the label and the row reads the one row recipe with
 * its `selected` mark (decisions 0062 and 0065). A hidden input still takes
 * the focus and the arrow keys of a radio group, so the row states that focus
 * with `focus-within`: `focus-visible` on the label would never match.
 */
function FolderChoice({
  label,
  chosen,
  onChoose,
}: {
  readonly label: string;
  readonly chosen: boolean;
  readonly onChoose: () => void;
}): ReactNode {
  return (
    <label
      className={rowClassName({
        selected: chosen,
        className:
          'text-ui focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-focus',
      })}
    >
      <input
        className="sr-only"
        type="radio"
        name="move-target"
        checked={chosen}
        onChange={onChoose}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {chosen ? (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          <CheckIcon />
        </span>
      ) : null}
    </label>
  );
}

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
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef('');

  useEffect(() => {
    if (!open) return;
    setInside(parent);
    setChoosing(false);
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
      title={choosing ? 'Save in' : 'New folder'}
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
          {choosing ? (
            <FolderPicker
              folders={folders}
              selected={inside}
              onSelect={setInside}
              onDone={() => setChoosing(false)}
            />
          ) : (
            <>
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
              <div className="mt-3 flex items-center gap-2 text-control">
                <span className="min-w-0 flex-1 break-words">
                  Inside: {inside === '' ? 'No folder' : inside}
                </span>
                <Button variant="secondary" onClick={() => setChoosing(true)}>
                  Change
                </Button>
              </div>
            </>
          )}
        </DialogBody>
        {choosing ? null : (
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create folder
            </Button>
          </DialogFooter>
        )}
      </form>
    </Dialog>
  );
}

/** The words that name what a move carries, for the legend of the dialog. */
function moveSubject(items: readonly DragItem[]): string {
  const only = items.length === 1 ? items[0] : undefined;
  if (only === undefined) return `${String(items.length)} items`;
  if (only.kind === 'note') return displayNoteName(baseNameOf(only.path));
  return `the folder ${only.folder.split('/').at(-1) ?? only.folder}`;
}

/** The folder that holds the first item, which the dialog chooses first. */
function startFolder(items: readonly DragItem[]): string {
  const first = items[0];
  if (first === undefined) return '';
  return folderOf(first.kind === 'note' ? first.path : first.folder);
}

/**
 * Moves one note, one folder or a selection of rows into a folder that
 * already exists, or into a new one (record 0164).
 *
 * The move is one store operation, so the tree and the open editor both read
 * the new paths from the store. `planMove` of `lib/folder-moves.ts` decides
 * every new path first, so nothing moves unless everything can. A folder of
 * the move is not one of the choices, because a folder cannot move into
 * itself.
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
  /** Every folder that a person can choose, sorted by path. */
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
  const [target, setTarget] = useState<string | null>('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const movedFolders = items.flatMap((item) =>
    item.kind === 'folder' ? [item.folder] : [],
  );
  const choices = folders.filter(
    (folder) =>
      !movedFolders.some(
        (moved) => folder === moved || folder.startsWith(`${moved}/`),
      ),
  );

  // The dialog reads the rows when it opens, so a change of the tree behind
  // it does not move the choice that the person is making.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!open) return;
    setTarget(startFolder(itemsRef.current));
    setCustom('');
    setError(null);
    setBusy(false);
  }, [open]);

  const move = (): void => {
    if (store === null) {
      setError('Local storage is unavailable, so nothing can move.');
      return;
    }
    const folder = target === null ? cleanNoteName(custom) : target;
    if (target === null && folder === '') {
      setError('Type a folder name.');
      return;
    }
    if (target === null) {
      const named = noteNameProblem(folder);
      if (named !== null) {
        setError(named.replaceAll('note name', 'folder name'));
        return;
      }
    }
    const outcome = planMove(items, folder, area, emptyFolders);
    if (outcome.problem !== null) {
      setError(outcome.problem);
      return;
    }
    const plan = outcome.plan;
    if (plan === null) {
      onClose();
      return;
    }
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
      title="Move to folder"
      titleId="move-items-title"
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
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-control font-medium text-strong">
              Move {moveSubject(items)} to
            </legend>
            <ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
              {['', ...choices, null].map((folder) => (
                <li key={folder ?? 'new'}>
                  <FolderChoice
                    label={
                      folder === null
                        ? 'A new folder'
                        : folder === ''
                          ? 'All notes, at the top'
                          : folder
                    }
                    chosen={target === folder}
                    onChoose={() => {
                      setTarget(folder);
                      setError(null);
                    }}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
          {target === null ? (
            <div className="mt-3">
              <TextField
                id="move-items-folder"
                label="New folder name"
                value={custom}
                autoFocus
                onChange={(value) => {
                  setCustom(value);
                  setError(null);
                }}
              />
            </div>
          ) : null}
          {error === null ? null : (
            <Notice className="mt-3" tone="problem" message={error} />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            Move
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
