/**
 * The application shell: one frame for every signed in screen.
 *
 * The header is one row of 44 px and it is the context of the route
 * (decision 0064). Left: the drawer toggle below `md`, the sidebar toggle
 * from `md` up, then the breadcrumb of `lib/breadcrumb.ts`. Then the actions
 * of the route, through the one `HeaderSlot` of `./header-slot.tsx`, which
 * the screen below fills. Right: Search, which opens the command palette at
 * every width, and the account avatar. The wordmark is not here: it belongs
 * to the sign in and setup screens, and the workspace name is the identity a
 * person works under. Every distance in that row comes from the layout scale
 * of `apps/web/src/tailwind.css`.
 *
 * The last part of the breadcrumb is a slot as well. A route that writes that
 * part itself claims `HeaderLeafSlot`, which is how the note route makes its
 * name the one editable name of the screen (decision 0069). A phone carries
 * five controls where it carried seven, and the gap is one step below the
 * medium width, which is what leaves the name its room.
 *
 * The sidebar is a column of rows: the workspace switcher, one row of icon
 * actions for the tree (New note, New folder, Sort notes, and Expand or
 * Collapse all folders), the tree and the footer (decision 0093). Search is
 * not one of them: the header carries it at every width and `Cmd or Ctrl + P`
 * opens it from the keyboard, so the row it held is space the tree has now
 * (decision 0069). No row of it is a filled button, because the one
 * action of a screen lives in the screen (decision 0062). Its width and its
 * collapse state belong to the person and live in browser settings, where
 * `./sidebar-size.ts` holds the steps and `./drawer.ts` turns one state into
 * classes. Every route below owns exactly one `main` landmark.
 *
 * The tree marks two things at once: the note the screen shows, and the
 * folder that a create action uses as its parent. `lib/tree-row.ts` holds
 * which mark each one takes, and `lib/folder-selection.ts` holds which folder
 * is the parent. Both marks are fills and neither is an edge.
 *
 * The workspace is an explicit container that the person chooses. The
 * switcher is the first row of the sidebar, so it reads as the container of
 * everything below it, and the workspace stays in the address so a note keeps
 * a stable link. `./workspaces.tsx` owns it and record 0049 states why it is
 * there.
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
  useMatches,
  useNavigate,
  useParams,
} from 'react-router';
import {
  avatarClassName,
  Badge,
  Button,
  buttonClassName,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  compactButtonVisualClassName,
  edgeControlClassName,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  LoadingState,
  Menu,
  MenuIcon,
  type MenuItem,
  MoreIcon,
  focusOutline,
  focusOutlineInset,
  Notice,
  pageGutter,
  PanelLeftIcon,
  rowClassName,
  SearchIcon,
  transitionSurface,
} from '@notesapp/ui';
import {
  SyncProvider,
  useLocalStore,
  useRequestSync,
  useSession,
  useSyncSession,
  useSyncState,
  useTheme,
  useWorkspace,
  useWorkspaceSync,
} from '../app.tsx';
import {
  attentionTitle,
  AttentionLink,
  useAttentionCount,
} from '../features/attention/attention-link.tsx';
import { CommandPalette } from './command-palette.tsx';
import {
  FilesProvider,
  useFiles,
  useNoteOrder,
  useOpenFolders,
  type OpenFoldersControl,
} from './files.tsx';
import {
  expandedFolders,
  folderExpansion,
  folderExpansionLabels,
} from '../lib/folder-expansion.ts';
import { noteOrderLabel, noteOrders } from '../lib/note-order.ts';
import { formatPaletteRows } from '../lib/format-toolbar.ts';
import {
  NewFolderDialog,
  RenameFolderDialog,
} from '../features/folders/folders.tsx';
import { useCreateNote } from '../features/notes/new-note.tsx';
import {
  DailyNotesProvider,
  today,
  useDailyNotes,
} from '../features/daily-notes/daily-notes.tsx';
import { daysWithNotes } from '../lib/daily-note.ts';
import { SidebarCalendar } from '../features/daily-notes/calendar.tsx';
import { dailyNoteDate } from '@notesapp/core';
import { PublishDialog } from '../features/publishing/publish-dialog.tsx';
import { publishedLinksTitle } from '../features/publishing/publishing.ts';
import { accountsTitle } from '../lib/accounts.ts';
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
import {
  treeBranchClassName,
  treeItemsClassName,
  treeListClassName,
  treeRowClassName,
  treeRowLeadingClassName,
  treeRowNameClassName,
} from '../lib/tree-row.ts';
import { deleteNotes } from '../features/editor/note-delete.ts';
import { baseNameOf, displayNoteName } from '../lib/note-name.ts';
import { initialOf } from '../lib/initial.ts';
import { workspaceAfterRemoval } from '../lib/workspace-choice.ts';
import {
  knownFolderPaths,
  selectedFolderOrRoot,
  selectionForOpenNote,
} from '../lib/folder-selection.ts';
import { folderOf } from '../lib/relative-time.ts';
import { UpdateNotice, usePersistentStorage } from './pwa-notices.tsx';
import {
  NoteSaveScope,
  useFlushNoteDraft,
  useNoteSave,
  useOnline,
} from '../features/editor/save-status.tsx';
import { actionIcon } from './action-icons.tsx';
import {
  HeaderLeafSlot,
  HeaderSlot,
  HeaderSlotProvider,
  useHeaderSlot,
} from './header-slot.tsx';
import { KeyHint } from './key-hint.tsx';
import { ShortcutsDialog } from './shortcuts.tsx';
import { syncDotClassName, syncFooter } from '../lib/sync-state.ts';
import type { CalendarMonth } from '../lib/calendar-month.ts';
import type { ActionIconName } from '../lib/palette-items.ts';
import {
  breadcrumbKey,
  breadcrumbParts,
  framePageOf,
  leafOf,
  type BreadcrumbPart,
  type PageTitles,
} from '../lib/breadcrumb.ts';
import { settingsTitle } from '../features/accounts/accounts.tsx';
import { notFoundTitle } from './not-found.tsx';
import {
  DeleteWorkspaceDialog,
  NewWorkspaceDialog,
  RenameWorkspaceDialog,
  RequireCurrentWorkspace,
  WorkspaceSwitcher,
} from './workspaces.tsx';
import {
  DeleteNoticeBar,
  DeleteNoticeProvider,
  useDeleteNotice,
} from '../features/trash/trash.tsx';
import { useViewportFit } from './viewport-fit.ts';
import { SidebarViewBar, useSidebarView } from './sidebar-view-bar.tsx';
import { sidebarViewLabels, type SidebarView } from '../lib/sidebar-view.ts';

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
    <div className={treeRowClassName({ open: active })}>
      <div className={treeRowLeadingClassName}>
        <span className={rowSpacerClassName} aria-hidden="true" />
        <Link
          ref={revealActive}
          className={treeRowNameClassName}
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
          <span
            className="inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            <FileTextIcon />
          </span>
          <span
            className="min-w-0 flex-1 truncate"
            title={displayNoteName(basename)}
          >
            {displayNoteName(basename)}
          </span>
          {note.localOnly || note.unsent ? (
            <span className="shrink-0" title="On this device only">
              <Badge>Local</Badge>
            </span>
          ) : null}
        </Link>
      </div>
      <Menu
        label={`Actions for the note ${displayNoteName(basename)}`}
        icon={<MoreIcon className="text-muted" />}
        triggerClassName={rowActionClassName}
        items={[
          {
            id: 'delete-note',
            label: 'Delete',
            icon: actionIcon('delete'),
            danger: true,
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  );
}

/** The name of the screen that lists every note of the workspace. */
const allNotesTitle = 'All notes';

/** The name of the screen that holds the notes a person deleted. */
const trashTitle = 'Trash';

/**
 * The word of each page of the frame that names no note.
 *
 * Each word comes from the screen that owns it, and the route table names
 * which page is open (record 0091).
 */
const pageTitles: PageTitles = {
  notes: allNotesTitle,
  trash: trashTitle,
  published: publishedLinksTitle,
  accounts: accountsTitle,
  attention: attentionTitle,
  settings: settingsTitle,
  'not-found': notFoundTitle,
};

/** The key line that shows or hides the sidebar, as the table writes it. */
const sidebarKeys = 'Cmd or Ctrl + \\';

/** The key line that opens the command palette. */
const paletteKeys = 'Cmd or Ctrl + P';

/**
 * One icon action that sits on a row: the chevron and the row menu.
 *
 * A ghost control of the one recipe, square, and as small as a row allows on
 * a desktop while it keeps the 44 px touch target under the medium width.
 */
const rowActionClassName = buttonClassName({
  variant: 'ghost',
  size: 'sm',
  className: 'size-11 shrink-0 px-0 md:size-7',
});

/** The column that a row with no chevron keeps for one, so names line up. */
const rowSpacerClassName = 'size-11 shrink-0 md:size-7';

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
  depth = 1,
  workspaceId,
  activeFileId,
  selectedFolder,
  openFolders,
  drag,
  onToggleFolder,
  onSelectFolder,
  onRenameFolder,
  onDeleteFolder,
  onPublishFolder,
  onNewNoteIn,
  onNewFolderIn,
  onDeleteNote,
  onNavigate,
}: {
  readonly nodes: readonly TreeNode[];
  /** How far in this list sits. The list at the top of the tree is 1. */
  readonly depth?: number | undefined;
  readonly workspaceId: string;
  readonly activeFileId: string | null;
  readonly selectedFolder: string;
  readonly openFolders: ReadonlySet<string>;
  readonly drag: TreeDrag;
  readonly onToggleFolder: (path: string) => void;
  readonly onSelectFolder: (path: string) => void;
  readonly onRenameFolder: (path: string) => void;
  readonly onDeleteFolder: (folder: string) => void;
  readonly onPublishFolder: (folder: string) => void;
  readonly onNewNoteIn: (path: string) => void;
  readonly onNewFolderIn: (path: string) => void;
  readonly onDeleteNote: (note: NoteSummary) => void;
  readonly onNavigate: () => void;
}): ReactNode {
  return (
    <ul className={treeItemsClassName}>
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
              className={treeRowClassName({
                selected: isSelected,
                dropTarget: isTarget,
              })}
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
              <div className={treeRowLeadingClassName}>
                <button
                  type="button"
                  className={rowActionClassName}
                  onClick={() => onToggleFolder(node.fullPath)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} folder ${node.name}`}
                  title={`${isOpen ? 'Collapse' : 'Expand'} folder ${node.name}`}
                >
                  <span className="inline-flex text-muted" aria-hidden="true">
                    {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </span>
                </button>
                <button
                  type="button"
                  className={treeRowNameClassName}
                  onClick={() => onSelectFolder(node.fullPath)}
                  aria-pressed={isSelected}
                  aria-expanded={isOpen}
                  draggable
                  onDragStart={(event) => {
                    drag.begin(event, {
                      kind: 'folder',
                      folder: node.fullPath,
                    });
                  }}
                  onDragEnd={() => drag.end()}
                >
                  <span
                    className="inline-flex shrink-0 items-center"
                    aria-hidden="true"
                  >
                    {isOpen ? <FolderOpenIcon /> : <FolderIcon />}
                  </span>
                  <span className="min-w-0 truncate" title={node.name}>
                    {node.name}
                  </span>
                </button>
              </div>
              <Menu
                label={`Actions for the folder ${node.name}`}
                icon={<MoreIcon className="text-muted" />}
                triggerClassName={rowActionClassName}
                items={[
                  {
                    id: 'new-note',
                    label: 'New note in this folder',
                    icon: actionIcon('new-note'),
                    onSelect: () => onNewNoteIn(node.fullPath),
                  },
                  {
                    id: 'new-folder',
                    label: 'New folder in this folder',
                    icon: actionIcon('new-folder'),
                    onSelect: () => onNewFolderIn(node.fullPath),
                  },
                  {
                    id: 'rename',
                    label: 'Rename folder',
                    icon: actionIcon('rename'),
                    onSelect: () => onRenameFolder(node.fullPath),
                  },
                  {
                    id: 'publish',
                    label: 'Publish folder',
                    icon: actionIcon('publish'),
                    onSelect: () => onPublishFolder(node.fullPath),
                  },
                  {
                    id: 'delete-folder',
                    label: 'Delete folder',
                    icon: actionIcon('delete'),
                    danger: true,
                    onSelect: () => onDeleteFolder(node.fullPath),
                  },
                ]}
              />
            </div>
            {isOpen ? (
              node.children.length === 0 ? (
                <div className={treeBranchClassName(depth + 1)}>
                  <p className="m-0 px-3 py-1 text-control text-muted">
                    This folder is empty.
                  </p>
                </div>
              ) : (
                <div className={treeBranchClassName(depth + 1)}>
                  <TreeView
                    nodes={node.children}
                    depth={depth + 1}
                    workspaceId={workspaceId}
                    activeFileId={activeFileId}
                    selectedFolder={selectedFolder}
                    openFolders={openFolders}
                    drag={drag}
                    onToggleFolder={onToggleFolder}
                    onSelectFolder={onSelectFolder}
                    onRenameFolder={onRenameFolder}
                    onDeleteFolder={onDeleteFolder}
                    onPublishFolder={onPublishFolder}
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

/**
 * Where the person is, as one line of the header.
 *
 * The workspace, then the folders of the open note, then the name of the note
 * or the page (decision 0064). Every part but the last one is a link, and the
 * last one is the name of the route, so it is the one part that never moves
 * anywhere. `lib/breadcrumb.ts` decides which parts a route yields.
 *
 * Below the medium width only the last part stays. A phone header holds the
 * drawer toggle, the actions of the route and the account, and the whole
 * path of a note does not fit beside them.
 *
 * The last part is a slot. A route that writes that part itself, such as the
 * note route with its name field, claims it through `HeaderLeafSlot` and the
 * word below is not drawn (decision 0069).
 */
function Breadcrumb({
  parts,
  onSelectFolder,
}: {
  readonly parts: readonly BreadcrumbPart[];
  readonly onSelectFolder: (folder: string) => void;
}): ReactNode {
  const { leafFilled } = useHeaderSlot();
  return (
    <nav className="min-w-0 flex-1" aria-label="Where you are">
      <ol className="m-0 flex min-w-0 list-none items-center gap-1 p-0 text-ui">
        {parts.map((part, index) =>
          part.to === null ? (
            <li
              className="flex min-w-0 flex-1 items-center"
              key={breadcrumbKey(part, index)}
            >
              {leafFilled ? null : (
                <span className="truncate font-medium text-strong">
                  {part.label}
                </span>
              )}
              <HeaderLeafSlot className="flex min-w-0 flex-1 items-center empty:hidden" />
            </li>
          ) : (
            <li
              className="flex shrink-0 items-center gap-1 max-md:hidden"
              key={breadcrumbKey(part, index)}
            >
              <Link
                className={`max-w-32 truncate rounded-md text-muted no-underline hover:text-strong ${transitionSurface} ${focusOutline}`}
                to={part.to}
                onClick={() => {
                  if (part.folder !== null) onSelectFolder(part.folder);
                }}
              >
                {part.label}
              </Link>
              <span className="text-muted" aria-hidden="true">
                /
              </span>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

/**
 * The sidebar: a column of rows on the chrome plane.
 *
 * The switcher, then the row of tree actions, then the tree, then the footer
 * rows (decisions 0064, 0069 and 0093). No row of it is a filled button: the
 * one action of a screen lives in the screen (decision 0062).
 */
function Sidebar({
  workspaceId,
  view,
  selectedFolder,
  folders,
  knownFolders,
  newNoteProblem,
  onSelectFolder,
  onNavigate,
  onNewFolderIn,
  onRenameFolder,
  onPublishFolder,
  onNewNoteIn,
  onNewWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onClose,
}: {
  readonly workspaceId: string;
  /** What the panel shows, which the view bar chose (record 0105). */
  readonly view: SidebarView;
  readonly selectedFolder: string;
  readonly folders: OpenFoldersControl;
  /** Every folder the tree shows, which Expand all folders opens. */
  readonly knownFolders: readonly string[];
  /** Why the last New note did not happen, when one did not. */
  readonly newNoteProblem: string | null;
  readonly onSelectFolder: (folder: string) => void;
  readonly onNavigate: () => void;
  readonly onNewFolderIn: (folder: string) => void;
  readonly onRenameFolder: (folder: string) => void;
  readonly onPublishFolder: (folder: string) => void;
  readonly onNewNoteIn: (folder: string) => void;
  readonly onNewWorkspace: () => void;
  readonly onRenameWorkspace: () => void;
  readonly onDeleteWorkspace: () => void;
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
  const { openFolders, toggleFolder, openFolder, setOpenFolders } = folders;
  const noteOrder = useNoteOrder();
  const expansion = folderExpansion(openFolders, knownFolders);
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
    () => buildNoteTree(files.notes, files.emptyFolders, noteOrder.order),
    [files.notes, files.emptyFolders, noteOrder.order],
  );
  const openNotePath =
    fileId === null
      ? null
      : (files.notes.find((note) => note.fileId === fileId)?.path ?? null);
  const daily = useDailyNotes();
  // The layout of the member names the daily notes (record 0101). Until the
  // settings arrive no note is the note of a date, so no day is marked.
  const layout =
    daily.settings.status === 'ready' ? daily.settings.settings : null;
  const markedDays = useCallback(
    (month: CalendarMonth): ReadonlySet<number> =>
      layout === null ? new Set() : daysWithNotes(files.notes, month, layout),
    [files.notes, layout],
  );

  // Open the folders that hold the note, so a note opened from the palette or
  // a link is shown in the tree. A collapse the person makes later stays,
  // because this runs only when the open note or its path changes.
  useEffect(() => {
    if (openNotePath === null) return;
    for (const folder of ancestorFolders(openNotePath)) openFolder(folder);
  }, [openNotePath, openFolder]);
  const notesPath = `/w/${workspaceId}`;
  const trashPath = `/w/${workspaceId}/trash`;
  const publishedPath = `/w/${workspaceId}/published`;
  const accountsPath = `/w/${workspaceId}/accounts`;
  // An administrator manages the accounts of the installation, so only an
  // administrator sees the row that opens them (record 0109).
  const administers = session.account?.installationRole === 'administrator';
  const attentionPath = `/w/${workspaceId}/attention`;
  // One short sentence for the state of the work, beside the dot that states
  // the same thing without a word. A failed local write of the open note
  // takes both, because sync never saw that text.
  const openNote = useNoteSave();
  const footer = syncFooter({
    state: sync.state,
    online,
    noteName: sync.noteName,
    openNoteWriteFailed: openNote?.localWriteFailed ?? false,
  });
  const syncLine = footer.line;
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
        <span className="text-ui font-semibold text-strong">
          {sidebarViewLabels[view]}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="size-11"
          label="Close navigation"
          title="Close navigation"
          icon={<CloseIcon />}
          onClick={onClose}
        />
      </div>

      <WorkspaceSwitcher
        workspaceId={workspaceId}
        onNavigate={onClose}
        onCreate={onNewWorkspace}
        onRename={onRenameWorkspace}
        onDelete={onDeleteWorkspace}
      />

      {view === 'notes' ? (
        <>
          {/*
        The actions of the tree are one row of icons (decision 0093). Each one
        is a compact ghost control with a name and a title, so the row stays
        quiet and every action stays in the tab order.
      */}
          <div className="px-2 pt-1">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                compact
                label="New note"
                title="New note"
                icon={actionIcon('new-note')}
                onClick={() => onNewNoteIn(selectedFolder)}
              />
              <Button
                variant="ghost"
                size="sm"
                compact
                label="New folder"
                title="New folder"
                icon={actionIcon('new-folder')}
                onClick={() => onNewFolderIn(selectedFolder)}
              />
              <Menu
                label="Sort notes"
                icon={actionIcon('sort')}
                compact
                align="start"
                items={noteOrders.map((order) => ({
                  id: order,
                  ...noteOrderLabel(order),
                  selected: order === noteOrder.order,
                  onSelect: () => noteOrder.setOrder(order),
                }))}
              />
              <Button
                variant="ghost"
                size="sm"
                compact
                label={folderExpansionLabels[expansion]}
                title={folderExpansionLabels[expansion]}
                icon={actionIcon(
                  expansion === 'expand' ? 'expand-all' : 'collapse-all',
                )}
                disabled={knownFolders.length === 0}
                onClick={() =>
                  setOpenFolders(expandedFolders(expansion, knownFolders))
                }
              />
            </div>
            {newNoteProblem === null ? null : (
              <p className="my-1 px-2 text-control text-danger" role="alert">
                {newNoteProblem}
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <section className="pt-1" aria-label="Folders">
              <div
                className={treeRowClassName({
                  open: location.pathname === notesPath,
                  selected: selectedFolder === '',
                  dropTarget: drag.over === '',
                })}
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
                {/*
              The root of the tree is a link and not a button, because the
              workspace screen is the list of all notes and this row names it.
              It looked inert before: it set the parent of the next create
              action and took a drop, and neither of those moves the screen, so
              the one row named `All notes` never opened the screen named
              `All notes`. It still does both of those, and the selection
              follows the note that opens, by record 0034.
            */}
                <div className={treeRowLeadingClassName}>
                  <span className={rowSpacerClassName} aria-hidden="true" />
                  <Link
                    className={treeRowNameClassName}
                    to={notesPath}
                    aria-current={
                      location.pathname === notesPath ? 'page' : undefined
                    }
                    onClick={() => {
                      onSelectFolder('');
                      onNavigate();
                    }}
                  >
                    <span
                      className="inline-flex shrink-0 items-center"
                      aria-hidden="true"
                    >
                      <FolderIcon />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {allNotesTitle}
                    </span>
                  </Link>
                </div>
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
                <p className="my-1 px-2 text-control text-muted">
                  No notes yet.
                </p>
              ) : (
                <div className={treeListClassName}>
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
                    onPublishFolder={onPublishFolder}
                    onNewNoteIn={onNewNoteIn}
                    onNewFolderIn={onNewFolderIn}
                    onDeleteNote={deleteNoteNow}
                    onNavigate={onNavigate}
                  />
                </div>
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
        </>
      ) : (
        // The calendar has the view of its own (record 0105), so the month
        // always shows and the panel scrolls when a short screen needs it.
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
          <SidebarCalendar
            today={today()}
            openNoteDate={
              openNotePath === null || layout === null
                ? null
                : dailyNoteDate(openNotePath, layout)
            }
            daysWithNotes={markedDays}
            onOpen={daily.open}
          />
          {daily.openProblem === null ? null : (
            <p className="my-1 px-2 text-control text-danger" role="alert">
              {daily.openProblem}
            </p>
          )}
        </div>
      )}

      <div className="border-t border-edge-subtle p-2">
        <div className={rowClassName({ interactive: false })}>
          <span className={syncDotClassName(footer.dot)} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-muted" title={syncLine}>
            {syncLine}
          </span>
        </div>
        <Link
          className={rowClassName({
            current: location.pathname === trashPath,
            inset: false,
          })}
          to={trashPath}
          onClick={onNavigate}
          aria-current={location.pathname === trashPath ? 'page' : undefined}
        >
          <span
            className="inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            {actionIcon('trash')}
          </span>
          <span className="min-w-0 flex-1 truncate">{trashTitle}</span>
        </Link>
        <Link
          className={rowClassName({
            current: location.pathname === publishedPath,
            inset: false,
          })}
          to={publishedPath}
          onClick={onNavigate}
          aria-current={
            location.pathname === publishedPath ? 'page' : undefined
          }
        >
          <span
            className="inline-flex shrink-0 items-center"
            aria-hidden="true"
          >
            {actionIcon('published-links')}
          </span>
          <span className="min-w-0 flex-1 truncate">{publishedLinksTitle}</span>
        </Link>
        {administers ? (
          <Link
            className={rowClassName({
              current: location.pathname === accountsPath,
              inset: false,
            })}
            to={accountsPath}
            onClick={onNavigate}
            aria-current={
              location.pathname === accountsPath ? 'page' : undefined
            }
          >
            <span
              className="inline-flex shrink-0 items-center"
              aria-hidden="true"
            >
              {actionIcon('accounts')}
            </span>
            <span className="min-w-0 flex-1 truncate">{accountsTitle}</span>
          </Link>
        ) : null}
        <AttentionLink
          workspaceId={workspaceId}
          count={attentionCount}
          className={rowClassName({
            current: location.pathname === attentionPath,
            inset: false,
            danger: true,
          })}
        />
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
      className={`absolute bottom-0 right-0 top-0 z-10 hidden w-2 translate-x-1 cursor-col-resize md:block ${focusOutlineInset}`}
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
  // HeaderSlotProvider wraps both the header and the routes under it, so the
  // actions a route places reach the one slot of the frame (record 0064).
  return (
    <RequireCurrentWorkspace workspaceId={workspaceId}>
      <FilesProvider workspaceId={workspaceId}>
        <DailyNotesProvider workspaceId={workspaceId}>
          <NoteSaveScope>
            <NoteActionsScope>
              <HeaderSlotProvider>
                <ShellFrame workspaceId={workspaceId} />
              </HeaderSlotProvider>
            </NoteActionsScope>
          </NoteSaveScope>
        </DailyNotesProvider>
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
  const matches = useMatches();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // The parent of the folder the dialog will make, or `null` while it is
  // closed. It is a path and not a flag, so a folder row can name a parent
  // that is not the selected one.
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [renameFolder, setRenameFolder] = useState<string | null>(null);
  // The folder that the publish dialog opens, or `null` while it is closed.
  const [publishFolder, setPublishFolder] = useState<string | null>(null);
  // Which workspace dialog is open, or `null` for none. The frame owns these
  // and not the sidebar: the sidebar is transformed so it slides, and a
  // transform makes its box the containing block of a `position: fixed` child,
  // which would trap a dialog inside the width of the sidebar.
  const [workspaceDialog, setWorkspaceDialog] = useState<
    'create' | 'rename' | 'delete' | null
  >(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const sidebar = useSidebarSize();
  const [sidebarView, setSidebarView] = useSidebarView();
  // The frame is the visible part of the screen, so iOS cannot scroll it
  // away under an open keyboard.
  useViewportFit();
  // The frame owns the open folders of the tree, because the New folder
  // dialog sits here and has to show the folder it made.
  const folders = useOpenFolders(workspaceId);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const drawerWasOpenRef = useRef(false);
  const session = useSession();
  const store = useLocalStore();
  const theme = useTheme();
  const files = useFiles();
  const workspace = useWorkspace();
  const accountId = session.account?.accountId ?? null;
  const sync = useWorkspaceSync(store.store, accountId, workspaceId);
  const syncSession = useSyncSession();
  const flushNoteDraft = useFlushNoteDraft();
  const persistence = usePersistentStorage(useSavedOnce());
  const newNote = useCreateNote(store.store, accountId, workspaceId);
  const daily = useDailyNotes();
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

  // Opening a note selects the folder of that note (record 0034). The rule
  // runs on the address of the screen and not only on the path value, because
  // a person who selects another folder and then opens the same note again
  // has opened a note: that act moves the selection back to its folder.
  const openedAt = location.key;
  useEffect(() => {
    setSelectedFolder((selected) =>
      selectionForOpenNote(selected, openNotePath),
    );
  }, [openNotePath, openedAt]);

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

  // The glyph of the theme states which appearance is in force, so the menu
  // row and the palette row read one name and show one mark.
  const themeIconName: ActionIconName =
    theme.choice === 'system'
      ? 'theme-system'
      : theme.choice === 'light'
        ? 'theme-light'
        : 'theme-dark';

  const accountItems: readonly MenuItem[] = [
    {
      id: 'theme',
      label: 'Theme',
      hint: themeName,
      icon: actionIcon(themeIconName),
      onSelect: cycleTheme,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: actionIcon('settings'),
      onSelect: () => {
        void navigate(`/w/${workspaceId}/settings`);
      },
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: actionIcon('keyboard'),
      onSelect: () => setShortcutsOpen(true),
    },
  ];

  // Sign out is the one row that ends the session, so it sits below the
  // others with space between, which is what a pinned row of a menu is.
  const signOutItem: readonly MenuItem[] = [
    {
      id: 'sign-out',
      label: 'Sign out',
      icon: actionIcon('sign-out'),
      onSelect: () => session.signOut(),
    },
  ];

  // The workspaces of the account, and the one this frame is showing. The
  // dialogs below take both, so they sit at frame level and not in the
  // transformed sidebar.
  const allWorkspaces = useMemo(
    () =>
      workspace.state.status === 'ready' ? workspace.state.workspaces : [],
    [workspace.state],
  );
  const openWorkspace = useMemo(
    () =>
      allWorkspaces.find((entry) => entry.workspaceId === workspaceId) ?? null,
    [allWorkspaces, workspaceId],
  );

  // Every workspace the person can move to from here. The open one is absent,
  // because a row that goes where you already are is noise.
  const otherWorkspaces = useMemo(
    () => allWorkspaces.filter((entry) => entry.workspaceId !== workspaceId),
    [allWorkspaces, workspaceId],
  );

  // The name of the page or the note that the route shows, which is the last
  // part of the breadcrumb. The route table names the page, and every other
  // part comes from the workspace and from the path of the open note.
  const noteName =
    openNotePath === null ? null : displayNoteName(baseNameOf(openNotePath));
  const routeName = leafOf(
    framePageOf(matches.map((match) => match.handle)),
    noteName,
    pageTitles,
  );

  // The avatar shows the first letter of the person, so the accessible name
  // holds the whole name: a control whose visible text is one letter has to
  // keep that letter inside its name (WCAG 2.5.3).
  const accountName = session.account?.name ?? session.account?.email ?? '';
  const accountInitial = initialOf(accountName);
  const accountLabel =
    accountName === '' ? 'Account' : `Account: ${accountName}`;

  const paletteActions = useMemo(
    () => [
      {
        id: 'new-note',
        label: 'New note',
        keywords: 'create add',
        icon: 'new-note' as const,
        run: () => newNote.create(selectedFolder),
      },
      {
        id: 'new-folder',
        label: 'New folder',
        keywords: 'create add group',
        icon: 'new-folder' as const,
        run: () => setNewFolderParent(selectedFolder),
      },
      {
        id: 'today',
        label: "Open today's note",
        keywords: 'daily journal day date today',
        icon: 'today' as const,
        run: () => daily.open(today()),
      },
      {
        id: 'toggle-sidebar',
        label: 'Show or hide the sidebar',
        keywords: 'sidebar panel collapse expand navigation tree',
        icon: 'sidebar' as const,
        keys: sidebarKeys,
        run: sidebar.toggleCollapsed,
      },
      {
        id: 'toggle-theme',
        label: 'Toggle theme',
        keywords: 'dark light system palette',
        icon: themeIconName,
        run: cycleTheme,
      },
      {
        id: 'shortcuts',
        label: 'Show keyboard shortcuts',
        keywords: 'keys help',
        icon: 'keyboard' as const,
        run: () => setShortcutsOpen(true),
      },
      ...(noteActions === null
        ? []
        : [
            {
              id: 'history',
              label: 'Open the history of this note',
              keywords: 'versions revisions',
              icon: 'history' as const,
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
                    icon: 'move' as const,
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
                    icon: 'image' as const,
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
                    icon: 'export' as const,
                    run: noteActions.exportMarkdown,
                  },
                ]),
            ...(noteActions.publish === null
              ? []
              : [
                  {
                    id: 'publish-note',
                    label: 'Publish this note',
                    keywords: 'publish link share read only reader',
                    icon: 'publish' as const,
                    run: noteActions.publish,
                  },
                ]),
            ...(noteActions.duplicate === null
              ? []
              : [
                  {
                    id: 'duplicate-note',
                    label: 'Duplicate this note',
                    keywords: 'duplicate copy clone',
                    icon: 'duplicate' as const,
                    run: noteActions.duplicate,
                  },
                ]),
            // Every tool of the row of formatting tools is a row here as
            // well, from the one list of `lib/format-toolbar.ts` (record
            // 0094). The palette runs an action after it has closed, so the
            // editor takes the focus back.
            ...(noteActions.format === null
              ? []
              : formatPaletteRows(noteActions.formatContext).map((row) => ({
                  id: row.id,
                  label: row.label,
                  keywords: row.keywords,
                  icon: row.icon,
                  keys: row.keys,
                  run: (): void => {
                    noteActions.format?.(row.action);
                  },
                }))),
            ...(noteActions.deleteAndLeave === null
              ? []
              : [
                  {
                    id: 'delete-note',
                    label: 'Delete this note',
                    keywords: 'delete trash remove',
                    icon: 'delete' as const,
                    run: noteActions.deleteAndLeave,
                  },
                ]),
          ]),
      {
        id: 'trash',
        label: 'Go to Trash',
        keywords: 'deleted restore',
        icon: 'trash' as const,
        run: () => {
          void navigate(`/w/${workspaceId}/trash`);
        },
      },
      {
        id: 'published-links',
        label: `Go to ${publishedLinksTitle}`,
        keywords: 'publish link share revoke reader',
        icon: 'published-links' as const,
        run: () => {
          void navigate(`/w/${workspaceId}/published`);
        },
      },
      // Only an administrator manages the accounts (record 0109).
      ...(session.account?.installationRole === 'administrator'
        ? [
            {
              id: 'accounts',
              label: `Go to ${accountsTitle}`,
              keywords: 'accounts invite invitation people users administrator',
              icon: 'accounts' as const,
              run: (): void => {
                void navigate(`/w/${workspaceId}/accounts`);
              },
            },
          ]
        : []),
      // One row per workspace of the account, so a switch is reachable from
      // the keyboard alone. The note search of the palette stays inside the
      // open workspace, because isolation is the point of record 0049.
      ...otherWorkspaces.map((entry) => ({
        id: `workspace-${entry.workspaceId}`,
        label: `Go to ${entry.name}`,
        keywords: 'workspace switch change area',
        icon: 'workspace' as const,
        run: (): void => {
          void navigate(`/w/${entry.workspaceId}`);
        },
      })),
      {
        id: 'settings',
        label: 'Go to Settings',
        keywords: 'account theme sign out',
        icon: 'settings' as const,
        run: () => {
          void navigate(`/w/${workspaceId}/settings`);
        },
      },
    ],
    [
      cycleTheme,
      daily.open,
      navigate,
      newNote.create,
      noteActions,
      otherWorkspaces,
      selectedFolder,
      sidebar.toggleCollapsed,
      themeIconName,
      workspaceId,
    ],
  );

  return (
    <SyncProvider value={sync}>
      <DeleteNoticeProvider>
        <div className="flex h-viewport flex-col bg-app text-ink">
          <a
            className={buttonClassName({
              variant: 'primary',
              size: 'sm',
              className:
                'fixed left-2 top-2 z-50 -translate-y-20 focus-visible:translate-y-0',
            })}
            href="#notes-content"
          >
            Skip to content
          </a>

          {/*
            The gap is one step on a phone and the cluster step from the
            medium width up. A phone header carries the drawer toggle, the
            name of the note, the note menu, Search and the account, where it
            carried History and Publish as well (decision 0069). Each
            icon-only control is compact: it keeps its touch target and draws
            the smaller mark that every other control of the product draws.

            The control at each end takes `edgeControlClassName`, which pulls
            its touch box into the gutter so the mark a person reads sits on
            the same line as the title of the page below. Without it the
            toggle stood 14 px inside the gutter on a phone and the avatar
            stood 10 px inside it, so one bar showed three different edges.
          */}
          <header
            className={`z-30 flex h-header shrink-0 items-center gap-1 border-b border-edge-subtle bg-surface md:gap-cluster ${pageGutter}`}
          >
            <Button
              buttonRef={menuButtonRef}
              variant="ghost"
              size="sm"
              compact
              className={`shrink-0 md:hidden ${edgeControlClassName({ edge: 'start', mark: 'icon' })}`}
              label="Open navigation"
              title="Open navigation"
              icon={<MenuIcon />}
              ariaControls="notes-sidebar"
              ariaExpanded={drawerOpen}
              onClick={() => {
                setDrawerOpen((open) => !open);
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              compact
              className={`shrink-0 max-md:hidden ${edgeControlClassName({ edge: 'start', mark: 'icon' })}`}
              label={
                sidebar.size.collapsed ? 'Show the sidebar' : 'Hide the sidebar'
              }
              title={
                sidebar.size.collapsed ? 'Show the sidebar' : 'Hide the sidebar'
              }
              icon={<PanelLeftIcon />}
              ariaControls="notes-sidebar"
              ariaExpanded={!sidebar.size.collapsed}
              onClick={sidebar.toggleCollapsed}
            />

            <Breadcrumb
              parts={breadcrumbParts({
                workspaceId,
                workspaceName: openWorkspace?.name ?? '',
                notePath: openNotePath,
                leaf: routeName,
              })}
              onSelectFolder={(folder) => {
                folders.openFolder(folder);
                setSelectedFolder(folder);
              }}
            />

            <HeaderSlot className="flex shrink-0 items-center gap-cluster empty:hidden" />

            {/*
              A hand written button and not a `Button`, because the word and
              the key hint each appear at a width of their own. Every class it
              draws still comes from the one recipe of a control (record
              0065): the compact outer box keeps the touch target and the
              surface inside it is what a person sees.
            */}
            <button
              type="button"
              className={buttonClassName({
                variant: 'ghost',
                size: 'sm',
                compact: true,
                className: 'shrink-0',
              })}
              aria-label="Search"
              title="Search"
              onClick={() => setPaletteOpen(true)}
            >
              <span
                className={compactButtonVisualClassName({
                  variant: 'ghost',
                  size: 'sm',
                  iconOnly: false,
                })}
              >
                <span
                  className="inline-flex shrink-0 items-center"
                  aria-hidden="true"
                >
                  <SearchIcon />
                </span>
                <span className="max-md:hidden">Search</span>
                <span className="max-lg:hidden">
                  <KeyHint keys={paletteKeys} />
                </span>
              </span>
            </button>

            <Menu
              label={accountLabel}
              icon={<span className={avatarClassName()}>{accountInitial}</span>}
              items={accountItems}
              pinned={signOutItem}
              compact
              triggerClassName={buttonClassName({
                variant: 'ghost',
                size: 'sm',
                iconOnly: true,
                compact: true,
                className: `shrink-0 ${edgeControlClassName({ edge: 'end', mark: 'avatar' })}`,
              })}
            />
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
            <SidebarViewBar view={sidebarView} onChoose={setSidebarView} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Sidebar
                workspaceId={workspaceId}
                view={sidebarView}
                selectedFolder={selectedFolder}
                folders={folders}
                knownFolders={allFolders}
                newNoteProblem={newNote.error}
                onSelectFolder={setSelectedFolder}
                onNavigate={() => setDrawerOpen(false)}
                onNewFolderIn={(folder) => setNewFolderParent(folder)}
                onRenameFolder={(folder) => setRenameFolder(folder)}
                onPublishFolder={(folder) => setPublishFolder(folder)}
                onNewNoteIn={(folder) => newNote.create(folder)}
                onNewWorkspace={() => setWorkspaceDialog('create')}
                onRenameWorkspace={() => setWorkspaceDialog('rename')}
                onDeleteWorkspace={() => setWorkspaceDialog('delete')}
                onClose={() => setDrawerOpen(false)}
              />
            </div>
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
                ownerId={syncSession.ownerId}
                required={sync.state.kind === 'update-required'}
                onFlushDrafts={flushNoteDraft}
                onStopQueue={syncSession.stop}
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
          {openWorkspace === null ? null : (
            <>
              <NewWorkspaceDialog
                open={workspaceDialog === 'create'}
                onClose={() => setWorkspaceDialog(null)}
                workspaces={allWorkspaces}
                onCreated={(created) => {
                  // The server answered with the whole workspace, so the list
                  // already holds it before the address names it.
                  workspace.adopt(created);
                  void navigate(`/w/${created.workspaceId}`);
                  setDrawerOpen(false);
                }}
              />
              <RenameWorkspaceDialog
                open={workspaceDialog === 'rename'}
                onClose={() => setWorkspaceDialog(null)}
                workspace={openWorkspace}
                workspaces={allWorkspaces}
                onRenamed={workspace.reload}
              />
              <DeleteWorkspaceDialog
                open={workspaceDialog === 'delete'}
                onClose={() => setWorkspaceDialog(null)}
                workspace={openWorkspace}
                onDeleted={() => {
                  const next = workspaceAfterRemoval(
                    allWorkspaces,
                    workspaceId,
                  );
                  workspace.forget(workspaceId);
                  if (next !== null) void navigate(`/w/${next.workspaceId}`);
                  setDrawerOpen(false);
                }}
              />
            </>
          )}
          <NewFolderDialog
            open={newFolderParent !== null}
            onClose={() => setNewFolderParent(null)}
            folders={allFolders}
            parent={newFolderParent ?? ''}
            onCreated={(folder) => {
              files.addEmptyFolder(folder);
              // The new folder must be on the screen. Its parent can be
              // closed, because the row menu makes a folder inside a folder
              // that nobody opened, so every folder above it opens here.
              for (const above of ancestorFolders(folder))
                folders.openFolder(above);
              setSelectedFolder(folder);
            }}
          />
          {publishFolder === null ? null : (
            <PublishDialog
              open
              onClose={() => setPublishFolder(null)}
              workspaceId={workspaceId}
              scope={{ kind: 'folder', path: publishFolder }}
              notes={files.notes}
            />
          )}
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
