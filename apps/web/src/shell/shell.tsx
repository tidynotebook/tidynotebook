/**
 * The application shell: one frame for every signed in screen.
 *
 * The header is one row of 48 px with three zones. Left: the drawer toggle
 * below `md`, the sidebar toggle from `md` up, then the product mark. Centre:
 * one search affordance that opens the command palette at every width. Right:
 * one overflow menu. Every distance in that row comes from the layout scale
 * of `apps/web/src/tailwind.css`, through `pageGutter` and the cluster and
 * group gaps, so the header lines up with every page under it.
 *
 * The sidebar holds the only primary action of the shell, the folder tree,
 * and a quiet footer. Its width and its collapse state belong to the person
 * and live in browser settings; `./sidebar-size.ts` holds the steps and
 * `./drawer.ts` turns one state into classes. Every route below owns exactly
 * one `main` landmark.
 *
 * The tree marks two things at once: the note the screen shows, and the
 * folder that a create action uses as its parent. `lib/tree-row.ts` holds
 * which mark each one takes, and `lib/folder-selection.ts` holds which folder
 * is the parent.
 *
 * The one workspace of the account is an implicit container. It stays in
 * the address so a note keeps a stable link, but nothing on screen names
 * it.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import {
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  ComputerIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  Menu,
  MenuIcon,
  MoonIcon,
  MoreIcon,
  CloseIcon,
  Notice,
  pageGutter,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  LoadingState,
  SettingsIcon,
  SunIcon,
  TrashIcon,
  WorkspaceIcon,
  type MenuItem,
} from '@notesapp/ui';
import {
  SyncProvider,
  useLocalStore,
  useRequestSync,
  useSession,
  useSyncState,
  useTheme,
  useWorkspaceSync,
} from '../app.tsx';
import {
  AttentionLink,
  useAttentionCount,
} from '../features/attention/attention-link.tsx';
import { CommandPalette } from './command-palette.tsx';
import { FilesProvider, useFiles, useOpenFolders } from './files.tsx';
import {
  NewFolderDialog,
  RenameFolderDialog,
} from '../features/folders/folders.tsx';
import { NewNoteButton, useCreateNote } from '../features/notes/new-note.tsx';
import {
  NoteActionsScope,
  useNoteActions,
} from '../features/editor/note-actions.tsx';
import {
  ancestorFolders,
  buildNoteTree,
  notesInFolder,
  type NoteSummary,
  type TreeNode,
} from '../lib/note-list.ts';
import { drawerClassName } from './drawer.ts';
import {
  formatSidebarSize,
  parseSidebarSize,
  sidebarInsetClass,
  sidebarSizeStorageKey,
  sidebarWidthPx,
  stepAfterKey,
  stepForWidth,
  type SidebarSize,
} from './sidebar-size.ts';
import { useTreeDrag, type TreeDrag } from './tree-drag.ts';
import { treeRowClassName, treeRowTextClassName } from '../lib/tree-row.ts';
import { deleteNotes } from '../features/editor/note-delete.ts';
import { displayNoteName } from '../lib/note-name.ts';
import {
  knownFolderPaths,
  selectedFolderOrRoot,
  selectionForOpenNote,
} from '../lib/folder-selection.ts';
import { folderOf } from '../lib/relative-time.ts';
import { UpdateNotice, usePersistentStorage } from './pwa-notices.tsx';
import {
  NoteSaveScope,
  useNoteSave,
  useOnline,
} from '../features/editor/save-status.tsx';
import { KeyHint } from './key-hint.tsx';
import { ShortcutsDialog } from './shortcuts.tsx';
import { syncStateMessage } from '../lib/sync-state.ts';
import { RequireCurrentWorkspace } from './workspaces.tsx';
import {
  DeleteNoticeBar,
  DeleteNoticeProvider,
  useDeleteNotice,
} from '../features/trash/trash.tsx';

/**
 * One note row of the tree.
 *
 * The row and not the link carries the mark of the open note, so the fill,
 * the edge, and the pointer answer cover the same box as the actions menu
 * next to it. `tree-row.ts` holds which mark each state takes.
 */
function NoteRow({
  note,
  basename,
  workspaceId,
  active,
  drag,
  onNavigate,
  onDelete,
}: {
  readonly note: NoteSummary;
  readonly basename: string;
  readonly workspaceId: string;
  readonly active: boolean;
  readonly drag?: TreeDrag | undefined;
  readonly onNavigate: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  // The open note scrolls into view when its row mounts or becomes active, so
  // a note opened from the palette or a link is visible in the tree even when
  // it was below the fold. `nearest` moves the row the least amount needed.
  const revealActive = useCallback(
    (node: HTMLElement | null): void => {
      if (node !== null && active) node.scrollIntoView({ block: 'nearest' });
    },
    [active],
  );
  return (
    <div className={`group ${treeRowClassName({ open: active })}`}>
      <Link
        ref={revealActive}
        className={`flex min-h-11 flex-1 items-center gap-cluster rounded-lg px-2 text-control no-underline motion-safe:transition-colors md:min-h-8 ${treeRowTextClassName({ open: active })}`}
        to={`/w/${workspaceId}/notes/${note.fileId}`}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        draggable={drag !== undefined}
        onDragStart={(event) => {
          drag?.begin(event, {
            kind: 'note',
            fileId: note.fileId,
            path: note.path,
          });
        }}
        onDragEnd={() => drag?.end()}
      >
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          <FileTextIcon size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate">
          {displayNoteName(basename)}
        </span>
        {note.localOnly || note.unsent ? (
          <span
            className="shrink-0 rounded-full border border-edge px-1.5 text-control text-muted"
            title="On this device only"
          >
            Local
          </span>
        ) : null}
      </Link>
      <Menu
        label={`Actions for the note ${displayNoteName(basename)}`}
        icon={<MoreIcon size={14} />}
        triggerClassName={rowMenuClassName}
        items={[
          {
            id: 'delete-note',
            label: 'Delete',
            icon: <TrashIcon size={14} />,
            danger: true,
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  );
}

/** The actions menu of one tree row, which every row shares. */
const rowMenuClassName =
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent text-muted motion-safe:transition-colors hover:bg-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-focus md:size-8';

/**
 * Renders the tree nodes as interactive collapsible lists.
 *
 * A row is a drag source and a folder row is a drop target. The handlers stay
 * thin: every rule of a drop lives in `folder-moves.ts` and the state of the
 * gesture lives in `tree-drag.ts`. The same moves are reachable without a
 * pointer through Move to folder and Rename folder.
 */
function TreeView({
  nodes,
  workspaceId,
  activeFileId,
  selectedFolder,
  openFolders,
  drag,
  onToggleFolder,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
  onNewNoteIn,
  onNewFolderIn,
  onDeleteNote,
  onNavigate,
}: {
  readonly nodes: readonly TreeNode[];
  readonly workspaceId: string;
  readonly activeFileId: string | null;
  readonly selectedFolder: string;
  readonly openFolders: ReadonlySet<string>;
  readonly drag: TreeDrag;
  readonly onToggleFolder: (path: string) => void;
  readonly onSelectFolder: (path: string) => void;
  readonly onRenameFolder: (path: string) => void;
  readonly onDeleteFolder: (folder: string) => void;
  readonly onNewNoteIn: (path: string) => void;
  readonly onNewFolderIn: (path: string) => void;
  readonly onDeleteNote: (note: NoteSummary) => void;
  readonly onNavigate: () => void;
}): ReactNode {
  return (
    <ul className="m-0 list-none space-y-1 p-0">
      {nodes.map((node) => {
        if (node.kind === 'note')
          return (
            <li key={node.note.fileId}>
              <NoteRow
                note={node.note}
                basename={node.basename}
                workspaceId={workspaceId}
                active={node.note.fileId === activeFileId}
                drag={drag}
                onNavigate={onNavigate}
                onDelete={() => onDeleteNote(node.note)}
              />
            </li>
          );

        const isOpen = openFolders.has(node.fullPath);
        const isTarget = drag.over === node.fullPath;
        const isSelected = selectedFolder === node.fullPath;
        return (
          <li key={`folder:${node.fullPath}`}>
            <div
              className={`group ${treeRowClassName({
                selected: isSelected,
                dropTarget: isTarget,
              })}`}
              onDragOver={(event) => {
                if (!drag.accepts(node.fullPath)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                drag.hover(node.fullPath);
              }}
              onDragLeave={() => {
                if (isTarget) drag.hover(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                drag.drop(node.fullPath);
              }}
            >
              <button
                type="button"
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-muted motion-safe:transition-colors hover:bg-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-focus md:size-8"
                onClick={() => onToggleFolder(node.fullPath)}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} folder ${node.name}`}
                title={`${isOpen ? 'Collapse' : 'Expand'} folder ${node.name}`}
              >
                <span className="inline-flex" aria-hidden="true">
                  {isOpen ? (
                    <ChevronDownIcon size={14} />
                  ) : (
                    <ChevronRightIcon size={14} />
                  )}
                </span>
              </button>
              <button
                type="button"
                className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-1 text-left text-control motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-focus md:min-h-8 ${treeRowTextClassName({ selected: isSelected })}`}
                onClick={() => onSelectFolder(node.fullPath)}
                aria-pressed={isSelected}
                aria-expanded={isOpen}
                draggable
                onDragStart={(event) => {
                  drag.begin(event, { kind: 'folder', folder: node.fullPath });
                }}
                onDragEnd={() => drag.end()}
              >
                <span
                  className="inline-flex shrink-0 items-center"
                  aria-hidden="true"
                >
                  {isOpen ? (
                    <FolderOpenIcon size={14} />
                  ) : (
                    <FolderIcon size={14} />
                  )}
                </span>
                <span className="min-w-0 truncate">{node.name}</span>
              </button>
              <Menu
                label={`Actions for the folder ${node.name}`}
                icon={<MoreIcon size={14} />}
                triggerClassName={rowMenuClassName}
                items={[
                  {
                    id: 'new-note',
                    label: 'New note in this folder',
                    icon: <PlusIcon size={14} />,
                    onSelect: () => onNewNoteIn(node.fullPath),
                  },
                  {
                    id: 'new-folder',
                    label: 'New folder in this folder',
                    icon: <FolderPlusIcon size={14} />,
                    onSelect: () => onNewFolderIn(node.fullPath),
                  },
                  {
                    id: 'rename',
                    label: 'Rename folder',
                    icon: <PencilIcon size={14} />,
                    onSelect: () => onRenameFolder(node.fullPath),
                  },
                  {
                    id: 'delete-folder',
                    label: 'Delete folder',
                    icon: <TrashIcon size={14} />,
                    danger: true,
                    onSelect: () => onDeleteFolder(node.fullPath),
                  },
                ]}
              />
            </div>
            {isOpen ? (
              node.children.length === 0 ? (
                <p className="my-1 ml-3 border-l border-edge-subtle py-1 pl-3 text-control text-muted">
                  This folder is empty.
                </p>
              ) : (
                <div className="ml-3 border-l border-edge-subtle pl-1">
                  <TreeView
                    nodes={node.children}
                    workspaceId={workspaceId}
                    activeFileId={activeFileId}
                    selectedFolder={selectedFolder}
                    openFolders={openFolders}
                    drag={drag}
                    onToggleFolder={onToggleFolder}
                    onSelectFolder={onSelectFolder}
                    onRenameFolder={onRenameFolder}
                    onDeleteFolder={onDeleteFolder}
                    onNewNoteIn={onNewNoteIn}
                    onNewFolderIn={onNewFolderIn}
                    onDeleteNote={onDeleteNote}
                    onNavigate={onNavigate}
                  />
                </div>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** A quiet group label inside the sidebar. */
function GroupLabel({
  id,
  children,
  action,
}: {
  readonly id: string;
  readonly children: ReactNode;
  readonly action?: ReactNode | undefined;
}): ReactNode {
  return (
    <h2
      className="mb-1 flex min-h-8 items-center justify-between gap-cluster px-2 text-control font-semibold uppercase tracking-wide text-muted"
      id={id}
    >
      <span>{children}</span>
      {action}
    </h2>
  );
}

/** The sidebar: the new note action, the folder tree, a footer. */
function Sidebar({
  workspaceId,
  selectedFolder,
  onSelectFolder,
  onNavigate,
  onNewFolderIn,
  onRenameFolder,
  onNewNoteIn,
  onClose,
}: {
  readonly workspaceId: string;
  readonly selectedFolder: string;
  readonly onSelectFolder: (folder: string) => void;
  readonly onNavigate: () => void;
  readonly onNewFolderIn: (folder: string) => void;
  readonly onRenameFolder: (folder: string) => void;
  readonly onNewNoteIn: (folder: string) => void;
  readonly onClose: () => void;
}): ReactNode {
  const params = useParams();
  const location = useLocation();
  const fileId = typeof params.fileId === 'string' ? params.fileId : null;
  const session = useSession();
  const store = useLocalStore();
  const sync = useSyncState();
  const files = useFiles();
  const online = useOnline();
  const { openFolders, toggleFolder, openFolder } = useOpenFolders(workspaceId);
  const drag = useTreeDrag({
    store: store.store,
    accountId: session.account?.accountId ?? null,
    workspaceId,
    notes: files.notes,
    emptyFolders: files.emptyFolders,
    moveEmptyFolders: files.moveEmptyFolders,
    openFolder,
  });
  const attentionCount = useAttentionCount(
    store.store,
    session.account?.accountId ?? null,
    workspaceId,
  );
  const tree = useMemo(
    () => buildNoteTree(files.notes, files.emptyFolders),
    [files.notes, files.emptyFolders],
  );
  const openNotePath =
    fileId === null
      ? null
      : (files.notes.find((note) => note.fileId === fileId)?.path ?? null);

  // Open the folders that hold the note, so a note opened from the palette or
  // a link is shown in the tree. A collapse the person makes later stays,
  // because this runs only when the open note or its path changes.
  useEffect(() => {
    if (openNotePath === null) return;
    for (const folder of ancestorFolders(openNotePath)) openFolder(folder);
  }, [openNotePath, openFolder]);
  const trashPath = `/w/${workspaceId}/trash`;
  const navigate = useNavigate();
  const { announce } = useDeleteNotice();
  const requestSync = useRequestSync();
  const [deleting, setDeleting] = useState(false);
  const [deleteProblem, setDeleteProblem] = useState<string | null>(null);

  const accountId = session.account?.accountId ?? null;

  /** Moves one note to the trash without a confirmation step. */
  const deleteNoteNow = (target: NoteSummary): void => {
    if (deleting) return;
    const name = displayNoteName(target.path);
    const folder = folderOf(target.path);
    // Remember the folder before the local tombstone publishes its change.
    // It stays hidden while another note still describes the folder.
    if (folder !== null) files.addEmptyFolder(folder);
    const activeStore = store.store;
    if (activeStore === null || accountId === null) {
      setDeleteProblem(
        'Local storage is unavailable, so the note cannot be deleted.',
      );
      return;
    }
    setDeleting(true);
    setDeleteProblem(null);
    void (async (): Promise<void> => {
      const outcome = await deleteNotes(activeStore, accountId, workspaceId, [
        { fileId: target.fileId, name },
      ]);
      setDeleting(false);
      if (!outcome.ok) {
        setDeleteProblem(outcome.message);
        return;
      }
      announce({
        workspaceId,
        items: [{ fileId: target.fileId, name }],
      });
      requestSync();
      setDeleteProblem(null);
      if (fileId === target.fileId) void navigate(`/w/${workspaceId}`);
    })();
  };

  /** Moves every note under one folder to the trash without a confirm step. */
  const deleteFolderNow = (folder: string): void => {
    if (deleting) return;
    const targets = notesInFolder(files.notes, folder);
    if (targets.length === 0) {
      files.removeEmptyFolders(folder);
      return;
    }
    const items = targets.map((note) => ({
      fileId: note.fileId,
      name: displayNoteName(note.path),
    }));
    const activeStore = store.store;
    if (activeStore === null || accountId === null) {
      setDeleteProblem(
        'Local storage is unavailable, so the folder cannot be deleted.',
      );
      return;
    }
    // The open note needs no special case. The store marks every working copy
    // of every named note deleted, so the open editor follows it.
    const holdsOpenNote =
      fileId !== null && targets.some((note) => note.fileId === fileId);
    setDeleting(true);
    setDeleteProblem(null);
    void (async (): Promise<void> => {
      const outcome = await deleteNotes(
        activeStore,
        accountId,
        workspaceId,
        items,
      );
      setDeleting(false);
      if (!outcome.ok) {
        setDeleteProblem(outcome.message);
        return;
      }
      announce({ workspaceId, items });
      requestSync();
      files.removeEmptyFolders(folder);
      setDeleteProblem(null);
      if (holdsOpenNote) void navigate(`/w/${workspaceId}`);
    })();
  };

  return (
    <>
      <div className="flex h-header shrink-0 items-center justify-between gap-cluster border-b border-edge-subtle px-2 md:hidden">
        <span className="text-ui font-semibold text-strong">Notes</span>
        <Button
          variant="ghost"
          size="sm"
          className="size-11"
          label="Close navigation"
          title="Close navigation"
          icon={<CloseIcon size={18} />}
          onClick={onClose}
        />
      </div>

      {session.account !== null ? (
        <div className="flex items-center gap-1 px-2 py-2">
          <NewNoteButton
            store={store.store}
            accountId={session.account.accountId}
            workspaceId={workspaceId}
            folder={selectedFolder}
            variant="primary"
            className="min-w-0 flex-1"
          />
          <Button
            variant="ghost"
            size="sm"
            className="size-11 shrink-0"
            label="New folder"
            title="New folder"
            icon={<FolderPlusIcon size={18} />}
            onClick={() => onNewFolderIn(selectedFolder)}
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <section aria-labelledby="tree-heading">
          <GroupLabel id="tree-heading">Folders</GroupLabel>
          <div
            className={`group ${treeRowClassName({
              selected: selectedFolder === '',
              dropTarget: drag.over === '',
            })}`}
            onDragOver={(event) => {
              if (!drag.accepts('')) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              drag.hover('');
            }}
            onDragLeave={() => {
              if (drag.over === '') drag.hover(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              drag.drop('');
            }}
          >
            <button
              type="button"
              className={`flex min-h-11 w-full cursor-pointer items-center rounded-lg border-0 bg-transparent px-2 text-left text-control motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-focus md:min-h-8 ${treeRowTextClassName({ selected: selectedFolder === '' })}`}
              aria-pressed={selectedFolder === ''}
              onClick={() => onSelectFolder('')}
            >
              All notes
            </button>
          </div>
          {files.loading ? (
            <div className="px-2 py-2">
              <LoadingState
                shape="list"
                rows={4}
                label="Your notes are loading."
              />
            </div>
          ) : tree.length === 0 ? (
            <p className="my-1 px-2 text-control text-muted">No notes yet.</p>
          ) : (
            <TreeView
              nodes={tree}
              workspaceId={workspaceId}
              activeFileId={fileId}
              selectedFolder={selectedFolder}
              openFolders={openFolders}
              drag={drag}
              onToggleFolder={toggleFolder}
              onSelectFolder={(folder) => {
                openFolder(folder);
                onSelectFolder(folder);
              }}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={deleteFolderNow}
              onNewNoteIn={onNewNoteIn}
              onNewFolderIn={onNewFolderIn}
              onDeleteNote={deleteNoteNow}
              onNavigate={onNavigate}
            />
          )}
          {files.limitNotice === null ? null : (
            <p
              className="my-1 px-2 text-control text-muted"
              role="status"
              aria-live="polite"
            >
              {files.limitNotice}
            </p>
          )}
        </section>
        {deleteProblem === null ? null : (
          <p className="mx-2 my-2 text-control text-danger" role="alert">
            {deleteProblem}
          </p>
        )}
        {drag.problem === null ? null : (
          <p className="mx-2 my-2 text-control text-danger" role="alert">
            {drag.problem}
          </p>
        )}
      </div>

      <div className="border-t border-edge-subtle p-2">
        <p className="m-0 px-2 pb-1 text-control text-muted">
          {online
            ? syncStateMessage(sync.state, sync.noteName)
            : 'No connection. Your notes stay on this device.'}
        </p>
        <Link
          className="flex min-h-11 items-center gap-cluster rounded-lg px-2 text-control text-muted no-underline motion-safe:transition-colors hover:bg-hover hover:text-strong md:min-h-8"
          to={trashPath}
          onClick={onNavigate}
          aria-current={location.pathname === trashPath ? 'page' : undefined}
        >
          <span
            className="inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            <TrashIcon size={14} />
          </span>
          <span>Trash</span>
        </Link>
        <AttentionLink workspaceId={workspaceId} count={attentionCount} />
        {store.error !== null ? (
          <p className="my-1 px-2 text-control text-danger" role="alert">
            {store.error}
          </p>
        ) : null}
      </div>
    </>
  );
}

/** The sidebar width and collapse state of this device. */
type SidebarControl = {
  readonly size: SidebarSize;
  readonly setStep: (step: SidebarSize['step']) => void;
  readonly toggleCollapsed: () => void;
};

/**
 * Keeps the sidebar width and the collapse choice across reloads.
 *
 * Both are choices of this person on this device, so they live next to the
 * open folders of the tree in browser settings and never reach the account.
 */
function useSidebarSize(): SidebarControl {
  const [size, setSize] = useState<SidebarSize>(() => {
    try {
      return parseSidebarSize(
        window.localStorage.getItem(sidebarSizeStorageKey),
      );
    } catch {
      return parseSidebarSize(null);
    }
  });

  /**
   * Moves to one size and stores it.
   *
   * A drag reports every pointer move, and most of those moves land on the
   * step the sidebar already has. The write is therefore skipped when nothing
   * changed, so one gesture writes once for each step it crosses.
   */
  const change = useCallback(
    (next: (current: SidebarSize) => SidebarSize): void => {
      setSize((current) => {
        const wanted = next(current);
        if (
          wanted.step === current.step &&
          wanted.collapsed === current.collapsed
        )
          return current;
        try {
          window.localStorage.setItem(
            sidebarSizeStorageKey,
            formatSidebarSize(wanted),
          );
        } catch {
          // The sidebar still works when browser preference storage fails.
        }
        return wanted;
      });
    },
    [],
  );

  const setStep = useCallback(
    (step: SidebarSize['step']): void => {
      // A drag on a collapsed sidebar means the person wants it back.
      change(() => ({ step, collapsed: false }));
    },
    [change],
  );

  const toggleCollapsed = useCallback((): void => {
    change((current) => ({ ...current, collapsed: !current.collapsed }));
  }, [change]);

  return useMemo(
    () => ({ size, setStep, toggleCollapsed }),
    [size, setStep, toggleCollapsed],
  );
}

/**
 * The edge of the sidebar that sets its width.
 *
 * It is a separator, which is the role a person and a screen reader both know
 * for this control: a pointer drags it, and the arrow keys move it one step
 * at a time, so the width is reachable without a pointer. The width moves in
 * named steps, because presentation comes from utility classes and a pixel
 * width would need an inline style.
 *
 * The hit area is wider than the line a person sees, so the edge is easy to
 * catch. It is hidden below the medium width, where the sidebar is an overlay
 * that covers the screen and has no width to set.
 */
function SidebarResizer({
  size,
  onStep,
}: {
  readonly size: SidebarSize;
  readonly onStep: (step: SidebarSize['step']) => void;
}): ReactNode {
  const [dragging, setDragging] = useState(false);

  const follow = useCallback(
    (clientX: number): void => {
      onStep(stepForWidth(clientX));
    },
    [onStep],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent): void => {
      event.preventDefault();
      follow(event.clientX);
    };
    const onUp = (): void => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // A drag over text would select it, which makes the gesture look broken.
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = previous;
    };
  }, [dragging, follow]);

  return (
    <div
      role="separator"
      aria-label="Sidebar width"
      aria-orientation="vertical"
      aria-valuenow={sidebarWidthPx(size.step)}
      aria-valuemin={sidebarWidthPx('narrow')}
      aria-valuemax={sidebarWidthPx('widest')}
      tabIndex={0}
      className="absolute bottom-0 right-0 top-0 z-10 hidden w-2 translate-x-1 cursor-col-resize focus-visible:outline-2 focus-visible:outline-focus md:block"
      onPointerDown={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onStep(stepAfterKey(size.step, event.key === 'ArrowRight' ? 1 : -1));
      }}
    />
  );
}

/** The application frame. */
export function Shell(): ReactNode {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : '';
  // NoteSaveScope and NoteActionsScope wrap the frame, not sit inside it, so
  // the frame reads what the open note screen registers. The screen mounts in
  // the Outlet below the frame and writes into these scopes; the frame reads
  // them to build the command palette and to time the persistence prompt.
  return (
    <RequireCurrentWorkspace workspaceId={workspaceId}>
      <FilesProvider workspaceId={workspaceId}>
        <NoteSaveScope>
          <NoteActionsScope>
            <ShellFrame workspaceId={workspaceId} />
          </NoteActionsScope>
        </NoteSaveScope>
      </FilesProvider>
    </RequireCurrentWorkspace>
  );
}

/** The frame of one open notes area. */
function ShellFrame({
  workspaceId,
}: {
  readonly workspaceId: string;
}): ReactNode {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // The parent of the folder the dialog will make, or `null` while it is
  // closed. It is a path and not a flag, so a folder row can name a parent
  // that is not the selected one.
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [renameFolder, setRenameFolder] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const sidebar = useSidebarSize();
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const drawerWasOpenRef = useRef(false);
  const session = useSession();
  const store = useLocalStore();
  const theme = useTheme();
  const files = useFiles();
  const accountId = session.account?.accountId ?? null;
  const sync = useWorkspaceSync(store.store, accountId, workspaceId);
  const persistence = usePersistentStorage(useSavedOnce());
  const newNote = useCreateNote(store.store, accountId, workspaceId);
  const noteActions = useNoteActions();
  // Every folder the tree can show: the ones the note paths imply and the
  // ones that hold no note yet.
  const allFolders = useMemo(
    () =>
      knownFolderPaths(
        files.notes.map((note) => note.path),
        files.emptyFolders,
      ),
    [files.notes, files.emptyFolders],
  );

  // The note the screen shows right now, so a create action puts its result
  // next to it. The path and not the identifier, because a note that moves to
  // another folder moves the create parent with it.
  const openNotePath = useMemo(() => {
    const fileId = typeof params.fileId === 'string' ? params.fileId : null;
    if (fileId === null) return null;
    return files.notes.find((note) => note.fileId === fileId)?.path ?? null;
  }, [params.fileId, files.notes]);

  useEffect(() => {
    setSelectedFolder((selected) =>
      selectionForOpenNote(selected, openNotePath),
    );
  }, [openNotePath]);

  // A folder that left the tree cannot be a parent. The list of an area that
  // has not answered yet holds nothing, so the check waits for the answer:
  // without that wait every background refresh would send the selection of
  // the person back to the top.
  useEffect(() => {
    if (files.loading) return;
    setSelectedFolder((selected) => selectedFolderOrRoot(selected, allFolders));
  }, [allFolders, files.loading]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (!event.metaKey && !event.ctrlKey) return;
      if (key === 'p' || key === 'o') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (key === '\\') {
        event.preventDefault();
        sidebar.toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebar.toggleCollapsed]);

  useEffect(() => {
    if (!drawerOpen) {
      if (drawerWasOpenRef.current) menuButtonRef.current?.focus();
      drawerWasOpenRef.current = false;
      return;
    }
    drawerWasOpenRef.current = true;
    const sidebar = sidebarRef.current;
    const focusable = (): HTMLElement[] =>
      sidebar === null
        ? []
        : Array.from(
            sidebar.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = focusable();
      const first = targets[0];
      const last = targets.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const cycleTheme = useCallback((): void => {
    const order = ['system', 'light', 'dark'] as const;
    const at = order.indexOf(theme.choice);
    theme.setChoice(order[(at + 1) % order.length] ?? 'system');
  }, [theme]);

  const themeName =
    theme.choice === 'system'
      ? 'System'
      : theme.choice === 'light'
        ? 'Light'
        : 'Dark';

  const menuItems: readonly MenuItem[] = [
    {
      id: 'theme',
      label: 'Theme',
      hint: themeName,
      icon:
        theme.choice === 'system' ? (
          <ComputerIcon size={14} />
        ) : theme.choice === 'light' ? (
          <SunIcon size={14} />
        ) : (
          <MoonIcon size={14} />
        ),
      onSelect: cycleTheme,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <SettingsIcon size={14} />,
      onSelect: () => {
        void navigate('/settings');
      },
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      onSelect: () => setShortcutsOpen(true),
    },
    {
      id: 'sign-out',
      label: 'Sign out',
      onSelect: () => session.signOut(),
    },
  ];

  const paletteActions = useMemo(
    () => [
      {
        id: 'new-note',
        label: 'New note',
        keywords: 'create add',
        run: () => newNote.create(selectedFolder),
      },
      {
        id: 'new-folder',
        label: 'New folder',
        keywords: 'create add group',
        run: () => setNewFolderParent(selectedFolder),
      },
      {
        id: 'toggle-sidebar',
        label: 'Show or hide the sidebar',
        keywords: 'sidebar panel collapse expand navigation tree',
        run: sidebar.toggleCollapsed,
      },
      {
        id: 'toggle-theme',
        label: 'Toggle theme',
        keywords: 'dark light system palette',
        run: cycleTheme,
      },
      {
        id: 'shortcuts',
        label: 'Show keyboard shortcuts',
        keywords: 'keys help',
        run: () => setShortcutsOpen(true),
      },
      ...(noteActions === null
        ? []
        : [
            {
              id: 'history',
              label: 'Open the history of this note',
              keywords: 'versions revisions',
              run: (): void => {
                void navigate(
                  `/w/${workspaceId}/notes/${noteActions.fileId}/history`,
                );
              },
            },
            ...(noteActions.moveToFolder === null
              ? []
              : [
                  {
                    id: 'move-note',
                    label: 'Move this note to a folder',
                    keywords: 'move folder organize relocate',
                    run: noteActions.moveToFolder,
                  },
                ]),
            ...(noteActions.attachImage === null
              ? []
              : [
                  {
                    id: 'attach-image',
                    label: 'Attach an image to this note',
                    keywords:
                      'insert add embed image picture photo upload file',
                    run: noteActions.attachImage,
                  },
                ]),
            ...(noteActions.exportMarkdown === null
              ? []
              : [
                  {
                    id: 'export-note',
                    label: 'Export this note as Markdown',
                    keywords: 'export download save file markdown',
                    run: noteActions.exportMarkdown,
                  },
                ]),
            ...(noteActions.duplicate === null
              ? []
              : [
                  {
                    id: 'duplicate-note',
                    label: 'Duplicate this note',
                    keywords: 'duplicate copy clone',
                    run: noteActions.duplicate,
                  },
                ]),
            ...(noteActions.deleteAndLeave === null
              ? []
              : [
                  {
                    id: 'delete-note',
                    label: 'Delete this note',
                    keywords: 'delete trash remove',
                    run: noteActions.deleteAndLeave,
                  },
                ]),
          ]),
      {
        id: 'trash',
        label: 'Go to Trash',
        keywords: 'deleted restore',
        run: () => {
          void navigate(`/w/${workspaceId}/trash`);
        },
      },
      {
        id: 'settings',
        label: 'Go to Settings',
        keywords: 'account theme sign out',
        run: () => {
          void navigate('/settings');
        },
      },
    ],
    [
      cycleTheme,
      navigate,
      newNote.create,
      noteActions,
      selectedFolder,
      sidebar.toggleCollapsed,
      workspaceId,
    ],
  );

  return (
    <SyncProvider value={sync}>
      <DeleteNoticeProvider>
        <div className="flex h-dvh flex-col bg-app text-ink">
          <a
            className="fixed left-2 top-2 z-50 -translate-y-20 rounded-lg bg-accent-fill px-3 py-2 text-on-accent focus:translate-y-0"
            href="#notes-content"
          >
            Skip to content
          </a>

          <header
            className={`z-30 flex h-header shrink-0 items-center gap-group border-b border-edge-subtle bg-card ${pageGutter}`}
          >
            <Button
              buttonRef={menuButtonRef}
              variant="ghost"
              size="sm"
              className="size-11 shrink-0 md:hidden"
              label="Open navigation"
              title="Open navigation"
              icon={<MenuIcon size={18} />}
              ariaControls="notes-sidebar"
              ariaExpanded={drawerOpen}
              onClick={() => {
                setDrawerOpen((open) => !open);
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="size-11 shrink-0 max-md:hidden"
              label={
                sidebar.size.collapsed ? 'Show the sidebar' : 'Hide the sidebar'
              }
              title={
                sidebar.size.collapsed ? 'Show the sidebar' : 'Hide the sidebar'
              }
              icon={<PanelLeftIcon size={18} />}
              ariaControls="notes-sidebar"
              ariaExpanded={!sidebar.size.collapsed}
              onClick={sidebar.toggleCollapsed}
            />

            <Link
              className="flex shrink-0 items-center gap-cluster text-ui font-semibold text-strong no-underline"
              to="/"
            >
              <span
                className="inline-flex size-7 items-center justify-center rounded-lg bg-accent-fill text-on-accent"
                aria-hidden="true"
              >
                <WorkspaceIcon size={16} />
              </span>
              <span className="hidden sm:inline">Notesapp</span>
            </Link>

            <button
              type="button"
              className="mx-auto flex min-h-11 w-full max-w-md min-w-0 cursor-pointer items-center gap-cluster rounded-lg border border-edge bg-app px-3 text-control text-muted motion-safe:transition-colors hover:bg-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:min-h-8"
              onClick={() => setPaletteOpen(true)}
            >
              <span
                className="inline-flex shrink-0 items-center"
                aria-hidden="true"
              >
                <SearchIcon size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">
                Search notes
              </span>
              <kbd className="hidden shrink-0 rounded border border-edge bg-hover px-1.5 text-control text-muted sm:inline">
                <KeyHint keys="Cmd or Ctrl + P" />
              </kbd>
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <Menu
                label="More actions"
                icon={<MoreIcon size={18} />}
                items={menuItems}
              />
            </div>
          </header>

          <div
            className={
              drawerOpen ? 'fixed inset-0 z-30 bg-scrim/70 md:hidden' : 'hidden'
            }
            role="presentation"
            onClick={() => setDrawerOpen(false)}
          />

          <aside
            ref={sidebarRef}
            id="notes-sidebar"
            className={drawerClassName(drawerOpen, sidebar.size)}
            aria-label="Notes navigation"
            aria-modal={drawerOpen ? true : undefined}
            role={drawerOpen ? 'dialog' : undefined}
          >
            <Sidebar
              workspaceId={workspaceId}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              onNavigate={() => setDrawerOpen(false)}
              onNewFolderIn={(folder) => setNewFolderParent(folder)}
              onRenameFolder={(folder) => setRenameFolder(folder)}
              onNewNoteIn={(folder) => newNote.create(folder)}
              onClose={() => setDrawerOpen(false)}
            />
            <SidebarResizer size={sidebar.size} onStep={sidebar.setStep} />
          </aside>

          <div
            id="notes-content"
            className={`min-h-0 flex-1 overflow-y-auto ${sidebarInsetClass(sidebar.size)}`}
          >
            <div
              className={`mx-auto w-full max-w-3xl ${pageGutter} pt-4 empty:hidden`}
            >
              <UpdateNotice
                store={store.store}
                onFlushDrafts={() => Promise.resolve()}
              />
              {session.error === null ? null : (
                <Notice tone="info" message={session.error} />
              )}
              {theme.syncError === null ? null : (
                <Notice tone="info" message={theme.syncError} />
              )}
              {persistence.denial === null ? null : (
                <Notice tone="problem" message={persistence.denial}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={persistence.dismiss}
                  >
                    Understood
                  </Button>
                </Notice>
              )}
            </div>
            <Outlet />
          </div>

          <DeleteNoticeBar />

          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            workspaceId={workspaceId}
            notes={files.notes}
            store={store.store}
            accountId={accountId}
            actions={paletteActions}
          />
          <ShortcutsDialog
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
          />
          <NewFolderDialog
            open={newFolderParent !== null}
            onClose={() => setNewFolderParent(null)}
            folders={allFolders}
            parent={newFolderParent ?? ''}
            onCreated={(folder) => {
              files.addEmptyFolder(folder);
              setSelectedFolder(folder);
            }}
          />
          {session.account === null || renameFolder === null ? null : (
            <RenameFolderDialog
              open
              onClose={() => setRenameFolder(null)}
              store={store.store}
              accountId={session.account.accountId}
              workspaceId={workspaceId}
              notes={files.notes}
              folders={allFolders}
              folder={renameFolder}
              onRenamed={(toFolder) => {
                files.moveEmptyFolders(renameFolder, toFolder);
                setRenameFolder(null);
              }}
            />
          )}
        </div>
      </DeleteNoticeProvider>
    </SyncProvider>
  );
}

/** Whether this session already created one version of any note. */
function useSavedOnce(): boolean {
  const note = useNoteSave();
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (note?.lastSavedAt != null) setSeen(true);
  }, [note]);
  return seen;
}
