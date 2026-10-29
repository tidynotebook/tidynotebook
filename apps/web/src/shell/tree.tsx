/**
 * The tree of the sidebar: one list of rows with a selection (record 0164).
 *
 * `lib/tree-rows.ts` turns the folders and the notes into the rows a person
 * can see, and this module renders them as the tree of WAI-ARIA: one `tree`
 * with a `treeitem` for each row that states its level, its place, whether it
 * is open and whether it is selected. One row is in the tab order, and the
 * keys of `lib/tree-keys.ts` move the focus, open and close a folder, build a
 * selection, rename a row in place, open the menu and move the selection to
 * Trash. A long tree renders a window of its rows (record 0165).
 *
 * The action button of a row, a right click, Shift + F10 and the Menu key
 * open one menu, whose rows `lib/tree-actions.ts` decides. Each action is an
 * operation that exists: a move and a rename are one `moveFiles` of the local
 * store and a move to Trash is one `trashFiles` (record 0032). The dialogs of
 * a move and of a publish sit in the frame, because the sidebar is a box that
 * slides and a dialog inside it would take its width, so this module asks the
 * frame to open them.
 *
 * A row is a drag source and a folder row is a drop target. A row of a
 * selection drags the whole selection. The rules of a drop live in
 * `lib/folder-moves.ts` and the state of the gesture in `tree-drag.ts`.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import type { PublicationScope } from '@notesapp/core';
import {
  AnchoredMenu,
  Badge,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  inlineFieldClassName,
  MoreIcon,
  type MenuAnchor,
  type MenuItem,
} from '@notesapp/ui';
import { useLocalStore, useRequestSync, useSession } from '../app.tsx';
import { useDeleteNotice } from '../features/trash/trash.tsx';
import { deleteNotes } from '../features/editor/note-delete.ts';
import { applyMoves } from '../features/folders/apply-moves.ts';
import {
  downloadNote,
  transferFailureMessage,
} from '../features/export/export.ts';
import { duplicateNote } from '../features/notes/duplicate-note.ts';
import { actionIcon } from './action-icons.tsx';
import { useFiles, type OpenFoldersControl } from './files.tsx';
import { useContentRowWindow } from './content-row-window.ts';
import type { TreeDrag } from './tree-drag.ts';
import type { DragItem } from '../lib/folder-moves.ts';
import type { TreeNode } from '../lib/note-list.ts';
import { baseNameOf, displayNoteName } from '../lib/note-name.ts';
import { copyNoteLink, noteAddress } from '../lib/copy-link.ts';
import { copyText } from '../platform.ts';
import {
  treeMenu,
  treeRowControls,
  type TreeAction,
  type TreeTarget,
} from '../lib/tree-actions.ts';
import { treeKeyIntent } from '../lib/tree-keys.ts';
import {
  renamePlan,
  renameStartName,
  type RenameTarget,
} from '../lib/tree-rename.ts';
import {
  treeIndentClassName,
  treeIndentStyle,
  treeItemClassName,
  treeItemsClassName,
  treeMessageClassName,
  treeRowClassName,
  treeRowLeadingClassName,
  treeRowNameClassName,
  rowActionClassName,
  rowSpacerClassName,
} from '../lib/tree-row.ts';
import {
  blurLeavesRow,
  isFieldKey,
  placeAfterChange,
  rowKeyOf,
  treeKeyAction,
} from '../lib/tree-navigation.ts';
import {
  openRename,
  renameStep,
  type RenameEffect,
  type RenameEvent,
  type RenameField,
} from '../lib/tree-rename-field.ts';
import {
  actionableKeys,
  folderRowKey,
  isActionable,
  noteRowKey,
  visibleTreeRows,
  type ActionableRow,
} from '../lib/tree-rows.ts';
import {
  actionTargets,
  emptySelection,
  isRowSelected,
  keepVisible,
  selectAll,
  selectRange,
  toggleRow,
  type TreeSelection,
} from '../lib/tree-selection.ts';
import { trashPlan } from '../lib/tree-trash.ts';

/** What the tree asks the frame to do, and what it reads from it. */
export type NoteTreeProps = {
  readonly workspaceId: string;
  /** The folders and the notes of the tree, from `buildNoteTree`. */
  readonly nodes: readonly TreeNode[];
  /** Every folder the tree can show, which a rename must not take. */
  readonly knownFolders: readonly string[];
  readonly activeFileId: string | null;
  /** The folder that a create action uses as its parent (record 0029). */
  readonly selectedFolder: string;
  readonly folders: OpenFoldersControl;
  readonly drag: TreeDrag;
  /** Makes a folder the create parent without changing the open page. */
  readonly onSelectFolder: (folder: string) => void;
  /** Runs after a row opens a screen, which closes the drawer on a phone. */
  readonly onNavigate: () => void;
  readonly onNewNoteIn: (folder: string) => void;
  readonly onNewFolderIn: (folder: string) => void;
  /** Opens the Publish dialog of the frame for one note or one folder. */
  readonly onPublish: (scope: PublicationScope) => void;
  /**
   * Opens the Move to folder dialog of the frame for some rows, with the way
   * the tree takes the focus back when the dialog closes.
   */
  readonly onMove: (
    items: readonly DragItem[],
    returnFocus: () => void,
  ) => void;
};

/** The row that a rename in place edits, and its field. */
type Renaming = {
  readonly target: RenameTarget;
  readonly field: RenameField;
};

/** The accessible name of the tree: what it holds. */
export const treeLabel = 'Notes and folders';

/** The one line under the tree: a result or the reason an action stopped. */
type TreeMessage = {
  readonly tone: 'status' | 'problem';
  readonly text: string;
};

/** The menu that is open, the place it opens at and the rows it acts on. */
type OpenMenu = {
  readonly anchor: MenuAnchor;
  readonly keys: readonly string[];
  /** The row that takes the focus back when a key closes the menu. */
  readonly returnKey: string;
};

/** The target of an action that one row starts. */
function targetOf(row: ActionableRow): TreeTarget {
  return row.kind === 'note'
    ? { kind: 'note', fileId: row.note.fileId, path: row.note.path }
    : { kind: 'folder', path: row.path };
}

/** What a drag or a move of one target carries. */
function dragItemOf(target: TreeTarget): DragItem {
  return target.kind === 'note'
    ? { kind: 'note', fileId: target.fileId, path: target.path }
    : { kind: 'folder', folder: target.path };
}

/** The place on the screen of one element, for a menu that opens beside it. */
function anchorOf(element: Element): MenuAnchor {
  const box = element.getBoundingClientRect();
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
}

/** The tree of the folders and the notes of the open workspace. */
export function NoteTree({
  workspaceId,
  nodes,
  knownFolders,
  activeFileId,
  selectedFolder,
  folders,
  drag,
  onSelectFolder,
  onNavigate,
  onNewNoteIn,
  onNewFolderIn,
  onPublish,
  onMove,
}: NoteTreeProps): ReactNode {
  const navigate = useNavigate();
  const files = useFiles();
  const store = useLocalStore();
  const session = useSession();
  const accountId = session.account?.accountId ?? null;
  const requestSync = useRequestSync();
  const { announce } = useDeleteNotice();
  const { openFolders, toggleFolder, openFolder } = folders;

  const rows = useMemo(
    () => visibleTreeRows(nodes, openFolders),
    [nodes, openFolders],
  );
  const order = useMemo(() => actionableKeys(rows), [rows]);
  const rowByKey = useMemo(
    () =>
      new Map(
        rows.flatMap((row) =>
          isActionable(row) ? [[row.key, row] as const] : [],
        ),
      ),
    [rows],
  );
  const indexByKey = useMemo(
    () => new Map(rows.map((row, index) => [row.key, index] as const)),
    [rows],
  );
  const activeKey = activeFileId === null ? null : noteRowKey(activeFileId);

  const [selection, setSelection] = useState<TreeSelection>(emptySelection);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [renaming, setRenamingState] = useState<Renaming | null>(null);
  // The field of a rename lives in a reference as well, because one gesture
  // sends several events before React renders again: Escape gives the focus
  // back, and the blur that follows must read the field that Escape closed.
  const renamingRef = useRef<Renaming | null>(null);
  const setRenaming = useCallback((next: Renaming | null): void => {
    renamingRef.current = next;
    setRenamingState(next);
  }, []);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [message, setMessage] = useState<TreeMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const elements = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(null);
  // The row element that has the focus, so the commit that removes it knows
  // that the focus fell to the page with it, and the order of the rows that
  // the last commit showed, so the place of the tree can follow a row that
  // left (lib/tree-navigation.ts).
  const focusedRow = useRef<HTMLElement | null>(null);
  const previousOrder = useRef(order);
  const revealedFor = useRef<string | null>(null);
  const focusIndex =
    focusKey === null ? null : (indexByKey.get(focusKey) ?? null);
  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);
  const rowsInView = useContentRowWindow(rowKeys, focusIndex);
  const selecting = selection.keys.size > 0;

  // A row that left the screen leaves the selection.
  useEffect(() => {
    setSelection((current) => keepVisible(current, order));
  }, [order]);

  // A result stands for a few seconds. A problem stands until the next act.
  useEffect(() => {
    if (message?.tone !== 'status') return;
    const timer = globalThis.setTimeout(() => setMessage(null), 4000);
    return () => globalThis.clearTimeout(timer);
  }, [message]);

  // The open note comes into view when it changes, so a note opened from the
  // palette or a link is visible in the tree even when it was below the
  // fold. Its row may not be in the window yet, so the box scrolls to it.
  const activeIndex =
    activeKey === null ? -1 : (indexByKey.get(activeKey) ?? -1);
  useEffect(() => {
    if (activeKey === null || activeIndex === -1) return;
    if (revealedFor.current === activeKey) return;
    revealedFor.current = activeKey;
    rowsInView.reveal(activeIndex);
  }, [activeKey, activeIndex, rowsInView]);

  // A row that took the focus while it was outside the window takes it once
  // the window renders it.
  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    const element = elements.current.get(key);
    if (element === undefined) return;
    pendingFocus.current = null;
    element.focus();
  });

  /** Moves the focus to one row, and brings it into the window first. */
  const focusRow = useCallback(
    (key: string): void => {
      setFocusKey(key);
      const element = elements.current.get(key);
      if (element !== undefined) {
        element.focus();
        return;
      }
      const index = indexByKey.get(key);
      if (index === undefined) return;
      pendingFocus.current = key;
      rowsInView.reveal(index);
    },
    [indexByKey, rowsInView],
  );

  // A row that leaves the tree gives its place to the next row that stays,
  // and that row takes the focus when the focus fell to the page with the row
  // that left. Every way a row leaves runs through here: a move to Trash from
  // the keys or from a menu, a move, a rename of a folder, a drag and a change
  // from another device (record 0164).
  useLayoutEffect(() => {
    const previous = previousOrder.current;
    previousOrder.current = order;
    const element = focusedRow.current;
    const active = document.activeElement;
    const focusFell =
      element !== null &&
      !element.isConnected &&
      (active === null || active === document.body);
    if (previous === order && !focusFell) return;
    if (focusFell) focusedRow.current = null;
    const place = placeAfterChange({
      previous,
      current: order,
      key: focusKey,
      focusFell,
    });
    if (place.focus && place.key !== null) focusRow(place.key);
    else if (place.key !== focusKey) setFocusKey(place.key);
  });

  // The way the tree takes the focus back after a dialog that it opened, such
  // as Move to folder, whose move can take away the row that opened it. It
  // reads the place of the tree when the dialog closes.
  const returnFocusRef = useRef((): void => {});
  returnFocusRef.current = (): void => {
    if (focusKey !== null) focusRow(focusKey);
  };
  const returnFocus = useCallback((): void => {
    returnFocusRef.current();
  }, []);

  /** The rows an action started from one row acts on. */
  const targetsFor = useCallback(
    (key: string): readonly string[] => actionTargets(selection, order, key),
    [selection, order],
  );

  /** The targets of some keys, in the order of the screen. */
  const targetsOfKeys = useCallback(
    (keys: readonly string[]): readonly TreeTarget[] =>
      keys.flatMap((key) => {
        const row = rowByKey.get(key);
        return row === undefined ? [] : [targetOf(row)];
      }),
    [rowByKey],
  );

  /** Moves the notes of some rows to Trash, as one store operation. */
  const trash = useCallback(
    (keys: readonly string[]): void => {
      if (busy) return;
      const plan = trashPlan(targetsOfKeys(keys), files.notes);
      setMessage(null);
      if (plan.items.length === 0) {
        for (const folder of plan.dropFolders) files.removeEmptyFolders(folder);
        setSelection(emptySelection);
        return;
      }
      const activeStore = store.store;
      if (activeStore === null || accountId === null) {
        setMessage({
          tone: 'problem',
          text: 'Local storage is unavailable, so nothing moved to Trash.',
        });
        return;
      }
      // The folder of a note that leaves stays on this device, so the tree
      // still shows it. Remember it before the tombstone publishes its change.
      for (const folder of plan.keepFolders) files.addEmptyFolder(folder);
      const holdsOpenNote =
        activeFileId !== null &&
        plan.items.some((item) => item.fileId === activeFileId);
      setBusy(true);
      void (async (): Promise<void> => {
        const outcome = await deleteNotes(
          activeStore,
          accountId,
          workspaceId,
          plan.items,
        );
        setBusy(false);
        if (!outcome.ok) {
          setMessage({ tone: 'problem', text: outcome.message });
          return;
        }
        announce({ workspaceId, items: plan.items });
        requestSync();
        for (const folder of plan.dropFolders) files.removeEmptyFolders(folder);
        setSelection(emptySelection);
        if (holdsOpenNote) void navigate(`/w/${workspaceId}`);
      })();
    },
    [
      busy,
      targetsOfKeys,
      files,
      store.store,
      accountId,
      activeFileId,
      workspaceId,
      announce,
      requestSync,
      navigate,
    ],
  );

  /** Turns the name of one row into a field. */
  const startRename = useCallback(
    (key: string): void => {
      const row = rowByKey.get(key);
      if (row === undefined) return;
      const target: RenameTarget =
        row.kind === 'note'
          ? { kind: 'note', fileId: row.note.fileId, path: row.note.path }
          : { kind: 'folder', path: row.path };
      setMessage(null);
      setFocusKey(key);
      setRenaming({ target, field: openRename(key, renameStartName(target)) });
    },
    [rowByKey, setRenaming],
  );

  /** Writes the name that the field keeps, and reports how the keep ended. */
  const keepName = useCallback(
    (target: RenameTarget, field: RenameField): void => {
      const report = (event: RenameEvent): RenameEffect => {
        // A keep reports to its own field. A rename that a person started on
        // another row while this one wrote is not this field.
        const current = renamingRef.current;
        if (current === null || current.field.key !== field.key) return 'none';
        const step = renameStep(current.field, event);
        setRenaming(
          step.field.phase === 'closed'
            ? null
            : { ...current, field: step.field },
        );
        return step.effect;
      };
      // The row takes the focus back only when the focus is still in the
      // field, as after Enter. A person who moved away keeps the focus where
      // it went (lib/tree-rename-field.ts).
      const kept = (key: string): void => {
        if (report({ kind: 'kept' }) !== 'give-back') return;
        // The row of a renamed folder has a new key, so it takes the focus
        // once the tree renders it.
        pendingFocus.current = key;
        focusRow(key);
      };
      const plan = renamePlan(target, field.value, files, knownFolders);
      if (plan.kind === 'refused') {
        setMessage({ tone: 'problem', text: plan.problem });
        report({ kind: 'refused' });
        return;
      }
      if (plan.kind === 'unchanged') {
        kept(field.key);
        return;
      }
      const done = (): void => {
        const moved = plan.folder;
        if (moved !== null) {
          files.moveEmptyFolders(moved.from, moved.to);
          if (openFolders.has(moved.from)) openFolder(moved.to);
          if (selectedFolder === moved.from) onSelectFolder(moved.to);
        }
        setMessage(null);
        kept(moved === null ? field.key : folderRowKey(moved.to));
      };
      const activeStore = store.store;
      if (plan.moves.length === 0) {
        done();
        return;
      }
      if (activeStore === null || accountId === null) {
        setMessage({
          tone: 'problem',
          text: 'Local storage is unavailable, so the name did not change.',
        });
        report({ kind: 'refused' });
        return;
      }
      setBusy(true);
      void (async (): Promise<void> => {
        const failure = await applyMoves(
          activeStore,
          accountId,
          workspaceId,
          plan.moves,
        );
        setBusy(false);
        if (failure !== null) {
          setMessage({ tone: 'problem', text: failure });
          report({ kind: 'refused' });
          return;
        }
        done();
      })();
    },
    [
      files,
      knownFolders,
      store.store,
      accountId,
      openFolders,
      openFolder,
      selectedFolder,
      onSelectFolder,
      focusRow,
      workspaceId,
      setRenaming,
    ],
  );

  /**
   * Sends one event to the field of the rename. Each event acts once, so the
   * blur that follows Escape or Enter keeps nothing (lib/tree-rename-field.ts).
   */
  const renameEvent = useCallback(
    (event: RenameEvent): void => {
      const current = renamingRef.current;
      if (current === null) return;
      const step = renameStep(current.field, event);
      setRenaming(
        step.field.phase === 'closed'
          ? null
          : { ...current, field: step.field },
      );
      if (step.effect === 'give-back') {
        setMessage(null);
        focusRow(current.field.key);
      } else if (step.effect === 'keep') keepName(current.target, step.field);
      else if (event.kind === 'type') setMessage(null);
    },
    [setRenaming, focusRow, keepName],
  );

  /** Copies one note into a new note beside it and opens the copy. */
  const duplicate = useCallback(
    (target: TreeTarget): void => {
      if (target.kind !== 'note') return;
      const activeStore = store.store;
      if (activeStore === null || accountId === null) {
        setMessage({
          tone: 'problem',
          text: 'Local storage is unavailable, so the note was not copied.',
        });
        return;
      }
      void (async (): Promise<void> => {
        const name = displayNoteName(baseNameOf(target.path));
        const cached = await activeStore
          .readCachedNote(accountId, workspaceId, target.fileId)
          .catch(() => null);
        if (cached === null) {
          setMessage({
            tone: 'problem',
            text: `${name} is not on this device yet. Try again in a moment.`,
          });
          return;
        }
        let fileId: string;
        try {
          fileId = await duplicateNote(activeStore, {
            accountId,
            workspaceId,
            path: target.path,
            text: cached.text,
            takenPaths: files.namesInUse.map((name) => name.path),
          });
        } catch {
          setMessage({
            tone: 'problem',
            text: `${name} was not copied on this device. Try again.`,
          });
          return;
        }
        setSelection(emptySelection);
        onNavigate();
        void navigate(`/w/${workspaceId}/notes/${fileId}`);
      })();
    },
    [
      store.store,
      accountId,
      workspaceId,
      files.namesInUse,
      onNavigate,
      navigate,
    ],
  );

  /** Runs one row of a tree menu on the rows it acts on. */
  const run = useCallback(
    (action: TreeAction, keys: readonly string[]): void => {
      const targets = targetsOfKeys(keys);
      const first = targets[0];
      if (first === undefined) return;
      switch (action) {
        case 'open':
        case 'history':
          if (first.kind !== 'note') return;
          setSelection(emptySelection);
          onNavigate();
          void navigate(
            action === 'open'
              ? `/w/${workspaceId}/notes/${first.fileId}`
              : `/w/${workspaceId}/notes/${first.fileId}/history`,
          );
          return;
        case 'publish':
          onPublish(
            first.kind === 'note'
              ? { kind: 'note', fileId: first.fileId }
              : { kind: 'folder', path: first.path },
          );
          return;
        case 'rename': {
          const key = keys[0];
          if (key !== undefined) startRename(key);
          return;
        }
        case 'move':
          onMove(targets.map(dragItemOf), returnFocus);
          return;
        case 'duplicate':
          duplicate(first);
          return;
        case 'copy-link':
          if (first.kind !== 'note') return;
          void copyNoteLink(
            noteAddress(globalThis.location.origin, workspaceId, first.fileId),
            copyText,
          ).then((text) => setMessage({ tone: 'status', text }));
          return;
        case 'export':
          if (first.kind !== 'note') return;
          void downloadNote(workspaceId, first.fileId).catch(
            (failure: unknown) => {
              setMessage({
                tone: 'problem',
                text: transferFailureMessage(failure),
              });
            },
          );
          return;
        case 'new-note':
          if (first.kind === 'folder') onNewNoteIn(first.path);
          return;
        case 'new-folder':
          if (first.kind === 'folder') onNewFolderIn(first.path);
          return;
        case 'move-to-trash':
          trash(keys);
          return;
        case 'attach-image':
          return;
      }
    },
    [
      targetsOfKeys,
      onNavigate,
      navigate,
      workspaceId,
      onPublish,
      startRename,
      onMove,
      returnFocus,
      duplicate,
      onNewNoteIn,
      onNewFolderIn,
      trash,
    ],
  );

  /** Opens the menu of one row at a place on the screen. */
  const openMenu = useCallback(
    (key: string, anchor: MenuAnchor): void => {
      // A row outside the selection acts for itself alone, and the selection
      // gives way to it, as a file manager does on a right click.
      if (!isRowSelected(selection, key)) setSelection(emptySelection);
      setFocusKey(key);
      setMenu({ anchor, keys: targetsFor(key), returnKey: key });
    },
    [selection, targetsFor],
  );

  /** A click on a row with Ctrl, Cmd or Shift builds the selection. */
  const pickWith = useCallback(
    (event: ReactMouseEvent, key: string): boolean => {
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        const current =
          activeKey !== null && order.includes(activeKey) && !selecting
            ? activeKey
            : null;
        setSelection((now) => toggleRow(now, key, current));
        setFocusKey(key);
        return true;
      }
      if (event.shiftKey) {
        event.preventDefault();
        const from =
          focusKey ??
          (activeKey !== null && order.includes(activeKey) ? activeKey : null);
        setSelection((now) => selectRange(now, order, key, from));
        setFocusKey(key);
        return true;
      }
      return false;
    },
    [activeKey, order, selecting, focusKey],
  );

  /** The keys of the tree, from the row of the element that has the focus. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const target = event.target instanceof Element ? event.target : null;
    // The name field of a rename takes its own keys, and every other row
    // still takes the keys of the tree.
    if (isFieldKey(target)) return;
    const intent = treeKeyIntent(event);
    if (intent === null) return;
    const key = rowKeyOf(target) ?? focusKey ?? order[0];
    if (key === undefined) return;
    const action = treeKeyAction(intent, { rows, order, key, selecting });
    if (action.kind === 'none') return;
    event.preventDefault();
    if (action.kind === 'clear') event.stopPropagation();
    switch (action.kind) {
      case 'focus':
        focusRow(action.key);
        return;
      case 'extend':
        setSelection((now) => selectRange(now, order, action.to, action.from));
        focusRow(action.to);
        return;
      case 'toggle-folder':
        setFocusKey(key);
        toggleFolder(action.path);
        return;
      case 'open-note':
        setSelection(emptySelection);
        onNavigate();
        void navigate(`/w/${workspaceId}/notes/${action.fileId}`);
        return;
      case 'select-folder':
        setSelection(emptySelection);
        onSelectFolder(action.path);
        toggleFolder(action.path);
        return;
      case 'toggle-select':
        setSelection((now) => toggleRow(now, action.key));
        return;
      case 'select-all':
        setSelection(selectAll(order));
        return;
      case 'clear':
        setSelection(emptySelection);
        return;
      case 'rename':
        startRename(action.key);
        return;
      case 'menu': {
        const element = elements.current.get(action.key);
        if (element !== undefined) openMenu(action.key, anchorOf(element));
        return;
      }
      case 'trash':
        trash(targetsFor(action.key));
        return;
    }
  };

  // The one row in the tab order: the row with the focus, else the open note,
  // else the first row of the window, so Tab always reaches the tree.
  const rendered = rowsInView.indexes.flatMap((index) => {
    const row = rows[index];
    return row === undefined ? [] : [row];
  });
  const renderedKeys = rendered.filter(isActionable).map((row) => row.key);
  const tabbable =
    focusKey !== null && renderedKeys.includes(focusKey)
      ? focusKey
      : activeKey !== null && renderedKeys.includes(activeKey)
        ? activeKey
        : (renderedKeys[0] ?? null);

  const openTargets = menu === null ? [] : targetsOfKeys(menu.keys);
  const openTree = menu === null ? null : treeMenu(openTargets);

  return (
    <>
      <div
        ref={rowsInView.listRef}
        className={treeItemsClassName}
        role="tree"
        aria-label={treeLabel}
        aria-multiselectable="true"
        onKeyDown={onKeyDown}
      >
        {rendered.map((row) =>
          row.kind === 'empty' ? (
            // The line of an empty folder is a row of the tree that a person
            // cannot act on, so the tree owns treeitems alone.
            <div
              key={row.key}
              role="treeitem"
              aria-level={row.level}
              aria-disabled="true"
              aria-selected="false"
              className={treeIndentClassName(row.level)}
              style={treeIndentStyle(row.level)}
            >
              <div className={treeRowClassName({ wrapOnPhone: true })}>
                <span className={rowSpacerClassName} aria-hidden="true" />
                <span className="min-w-0 truncate text-muted">
                  This folder is empty.
                </span>
              </div>
            </div>
          ) : (
            <TreeRow
              key={row.key}
              row={row}
              workspaceId={workspaceId}
              open={row.key === activeKey}
              parent={row.kind === 'folder' && row.path === selectedFolder}
              picked={isRowSelected(selection, row.key)}
              selecting={selecting}
              tabbable={row.key === tabbable}
              renaming={renaming?.field.key === row.key ? renaming.field : null}
              drag={drag}
              register={(element) => {
                if (element === null) elements.current.delete(row.key);
                else elements.current.set(row.key, element);
              }}
              onFocus={(element) => {
                focusedRow.current = element;
                setFocusKey(row.key);
              }}
              onLeave={(element) => {
                if (focusedRow.current === element) focusedRow.current = null;
              }}
              onPick={(event) => pickWith(event, row.key)}
              onPlainClick={() => {
                setSelection(emptySelection);
                setFocusKey(row.key);
                if (row.kind === 'folder') {
                  onSelectFolder(row.path);
                  toggleFolder(row.path);
                  return;
                }
                onNavigate();
                void navigate(`/w/${workspaceId}/notes/${row.note.fileId}`);
              }}
              onToggle={() => {
                if (row.kind === 'folder') toggleFolder(row.path);
              }}
              onDragItems={() =>
                targetsOfKeys(targetsFor(row.key)).map(dragItemOf)
              }
              onMenu={(anchor) => openMenu(row.key, anchor)}
              onRenameEvent={renameEvent}
            />
          ),
        )}
      </div>
      {message === null ? null : (
        <p
          className={treeMessageClassName(message.tone)}
          role={message.tone === 'problem' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      {menu === null || openTree === null ? null : (
        <AnchoredMenu
          label={openTree.label}
          anchor={menu.anchor}
          align="start"
          items={openTree.rows.map((row): MenuItem => ({
            id: row.id,
            label: row.label,
            icon: actionIcon(row.icon),
            onSelect: () => run(row.id, menu.keys),
          }))}
          pinned={openTree.pinned.map((row): MenuItem => ({
            id: row.id,
            label: row.label,
            icon: actionIcon(row.icon),
            danger: true,
            onSelect: () => run(row.id, menu.keys),
          }))}
          onClose={(restoreFocus) => {
            const key = menu.returnKey;
            setMenu(null);
            if (restoreFocus) focusRow(key);
          }}
        />
      )}
    </>
  );
}

/** One row of the tree: a note or a folder, its actions and its marks. */
function TreeRow({
  row,
  workspaceId,
  open,
  parent,
  picked,
  selecting,
  tabbable,
  renaming,
  drag,
  register,
  onFocus,
  onLeave,
  onPick,
  onPlainClick,
  onToggle,
  onDragItems,
  onMenu,
  onRenameEvent,
}: {
  readonly row: ActionableRow;
  readonly workspaceId: string;
  /** The row is the note that the screen shows. */
  readonly open: boolean;
  /** The row is the folder that a create action uses. */
  readonly parent: boolean;
  /** The row is in the selection. */
  readonly picked: boolean;
  /** Some row is in the selection. */
  readonly selecting: boolean;
  /** The row is the one row of the tree in the tab order. */
  readonly tabbable: boolean;
  readonly renaming: RenameField | null;
  readonly drag: TreeDrag;
  readonly register: (element: HTMLElement | null) => void;
  /** The row took the focus, from itself or from an element inside it. */
  readonly onFocus: (element: HTMLElement) => void;
  /** The focus moved from the row to an element outside it. */
  readonly onLeave: (element: HTMLElement) => void;
  /** Builds the selection when a modifier key is down, and says if it did. */
  readonly onPick: (event: ReactMouseEvent) => boolean;
  readonly onPlainClick: () => void;
  readonly onToggle: () => void;
  readonly onDragItems: () => readonly DragItem[];
  readonly onMenu: (anchor: MenuAnchor) => void;
  readonly onRenameEvent: (event: RenameEvent) => void;
}): ReactNode {
  const isFolder = row.kind === 'folder';
  const isTarget = isFolder && drag.over === row.path;
  const controls = treeRowControls(
    row.kind === 'folder'
      ? { kind: 'folder', name: row.name, expanded: row.expanded }
      : {
          kind: 'note',
          name: row.name,
          local: row.note.localOnly || row.note.unsent,
        },
  );
  const icon = (
    <span className="inline-flex shrink-0 items-center" aria-hidden="true">
      {row.kind === 'note' ? (
        <FileTextIcon />
      ) : row.expanded ? (
        <FolderOpenIcon />
      ) : (
        <FolderIcon />
      )}
    </span>
  );
  const name =
    renaming === null ? (
      <span
        data-tree-name
        className="min-w-0 flex-1 truncate max-lg:pointer-coarse:line-clamp-2 max-lg:pointer-coarse:whitespace-normal max-lg:pointer-coarse:break-words"
        title={row.name}
      >
        {row.name}
      </span>
    ) : (
      <input
        className={inlineFieldClassName()}
        value={renaming.value}
        readOnly={renaming.phase !== 'editing'}
        aria-label={isFolder ? 'Name of the folder' : 'Name of the note'}
        autoComplete="off"
        spellCheck={false}
        // The field takes the focus as it opens, as the rename asked for it,
        // with the name selected so typing replaces it.
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) =>
          onRenameEvent({ kind: 'type', value: event.target.value })
        }
        onBlur={() => onRenameEvent({ kind: 'blur' })}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            onRenameEvent({ kind: 'enter' });
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onRenameEvent({ kind: 'escape' });
          }
        }}
      />
    );
  const badge =
    row.kind === 'note' && (row.note.localOnly || row.note.unsent) ? (
      <span className="shrink-0" title="On this device only">
        <Badge>Local</Badge>
      </span>
    ) : null;
  // A press on the chevron or the action button gives the focus to its row
  // and not to the button, so the keys that follow act on the row a person
  // pressed.
  const keepFocus = (event: ReactMouseEvent<HTMLElement>): void => {
    event.preventDefault();
    const item = event.currentTarget.closest('[role="treeitem"]');
    if (item instanceof HTMLElement) item.focus();
  };

  return (
    <div
      ref={register}
      role="treeitem"
      data-row-key={row.key}
      aria-level={row.level}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-selected={picked || (!selecting && open)}
      aria-expanded={isFolder ? row.expanded : undefined}
      aria-current={open ? 'page' : undefined}
      aria-label={controls.label}
      aria-haspopup="menu"
      tabIndex={tabbable ? 0 : -1}
      className={`${treeIndentClassName(row.level)} ${treeItemClassName}`}
      style={treeIndentStyle(row.level)}
      draggable={renaming === null}
      onFocus={(event) => onFocus(event.currentTarget)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        const to =
          next instanceof Node
            ? event.currentTarget.contains(next)
              ? 'row'
              : 'element'
            : 'none';
        if (blurLeavesRow({ to, documentFocused: document.hasFocus() }))
          onLeave(event.currentTarget);
      }}
      onClick={(event) => {
        if (renaming !== null) return;
        if (onPick(event)) return;
        onPlainClick();
      }}
      // A middle click opens a note in a new tab, as a link of the page does.
      onAuxClick={(event) => {
        if (event.button !== 1 || row.kind !== 'note') return;
        event.preventDefault();
        window.open(
          `/w/${workspaceId}/notes/${row.note.fileId}`,
          '_blank',
          'noopener',
        );
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({
          top: event.clientY,
          left: event.clientX,
          width: 0,
          height: 0,
        });
      }}
      onDragStart={(event) => drag.begin(event, onDragItems())}
      onDragEnd={() => drag.end()}
      onDragOver={(event) => {
        if (!isFolder || !drag.accepts(row.path)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        drag.hover(row.path);
      }}
      onDragLeave={() => {
        if (isTarget) drag.hover(null);
      }}
      onDrop={(event) => {
        if (!isFolder) return;
        event.preventDefault();
        drag.drop(row.path);
      }}
    >
      <div
        className={treeRowClassName({
          wrapOnPhone: true,
          open,
          selected: parent,
          picked,
          selecting,
          dropTarget: isTarget,
        })}
      >
        <div className={treeRowLeadingClassName}>
          {isFolder ? (
            <span className="ui-sidebar-slot">
              {/* The keys open and close a folder with Right and Left on the
            row, so the chevron is no stop of the keys. A screen reader on
            a touch screen reaches it by a swipe, by its name. */}
              <button
                type="button"
                tabIndex={-1}
                aria-label={controls.toggle ?? undefined}
                className={rowActionClassName}
                onMouseDown={keepFocus}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle();
                }}
                title={controls.toggle ?? undefined}
              >
                <span className="inline-flex text-muted" aria-hidden="true">
                  {row.expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </span>
              </button>
            </span>
          ) : (
            <span className={rowSpacerClassName} aria-hidden="true" />
          )}
          <div className={treeRowNameClassName}>
            {icon}
            {name}
            {badge}
          </div>
        </div>
        {/*
          The action button opens the menu that a right click, Shift + F10
          and the Menu key open. It is no stop of the keys, and a screen
          reader on a touch screen, which has neither key, reaches it by a
          swipe, by its name.
        */}
        <span className="ui-sidebar-slot">
          <button
            type="button"
            tabIndex={-1}
            aria-label={controls.actions}
            aria-haspopup="menu"
            className={`${rowActionClassName} ui-sidebar-row-menu`}
            title={controls.actions}
            onMouseDown={keepFocus}
            onClick={(event) => {
              event.stopPropagation();
              onMenu(anchorOf(event.currentTarget));
            }}
          >
            <span className="inline-flex text-muted" aria-hidden="true">
              <MoreIcon />
            </span>
          </button>
        </span>
      </div>
    </div>
  );
}
