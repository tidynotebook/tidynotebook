import { useNavigationDrawer } from './use-navigation-drawer.ts';
import { TrialNotice } from '../features/accounts/trial-notice.tsx';
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
 * actions for the tree (New note, New folder, New note from template, Sort
 * notes, and Expand or Collapse all folders), the tree and the footer (decision 0093). Search is
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
 * is the parent. Both marks are fills and neither is an edge. The tree itself
 * is `./tree.tsx`: one list of rows with the tree role, a selection of many
 * rows, one menu for a row and a rename in place (record 0164).
 *
 * The workspace is an explicit container that the person chooses. The
 * switcher is the first row of the sidebar, so it reads as the container of
 * everything below it, and the workspace stays in the address so a note keeps
 * a stable link. `./workspaces.tsx` owns it and record 0049 states why it is
 * there.
 */
import {
  lazy,
  Suspense,
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
  AnchoredMenu,
  avatarClassName,
  Button,
  ScrollRegion,
  buttonClassName,
  CloseIcon,
  compactButtonVisualClassName,
  edgeControlClassName,
  FolderIcon,
  LoadingState,
  Menu,
  MenuIcon,
  MoreIcon,
  type MenuItem,
  type MenuAnchor,
  focusOutline,
  focusOutlineInset,
  Notice,
  PageBackProvider,
  pageColumnClassName,
  pageGutter,
  pageSideClassName,
  PanelLeftIcon,
  SearchIcon,
  transitionSurface,
} from '@notesapp/ui';
import { trashPageGlyph } from '../lib/delete-label.ts';
import {
  SyncProvider,
  useLocalStore,
  useSession,
  useSyncSession,
  useTheme,
  useWorkspace,
  useWorkspaceSync,
} from '../app.tsx';
import { attentionTitle } from '../features/attention/attention-link.tsx';
import { NewFromTemplateDialog } from '../features/templates/new-from-template.tsx';
import { useWorkspaceProblem } from '../features/templates/workspace-problem.ts';
import type { CommandPalette } from './command-palette.tsx';
import type { ShortcutsDialog } from './shortcuts.tsx';
import { createModuleLoad } from '../lib/module-load.ts';
import {
  formatPaletteActions,
  type ActionIconName,
  type PaletteAction,
} from '../lib/palette-items.ts';
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
import {
  frameContentClassName,
  frameNoticeRowClassName,
} from '../lib/frame-content.ts';
import {
  MoveItemsDialog,
  NewFolderDialog,
} from '../features/folders/folders.tsx';
import { useCreateNote } from '../features/notes/new-note.tsx';
import {
  DailyNotesProvider,
  today,
  useDailyNotes,
} from '../features/daily-notes/daily-notes.tsx';

import { daysWithNotes } from '../lib/daily-note.ts';
import {
  TemplatesProvider,
  useTemplates,
} from '../features/templates/templates.tsx';
import {
  templatePalettePick,
  templateDestinationFor,
  type TemplateDestination,
} from '../lib/templates.ts';
import { SidebarCalendar } from '../features/daily-notes/calendar.tsx';
import { dailyNoteDate, type PublicationScope } from '@notesapp/core';
const PublishDialog = lazy(async () => ({
  default: (await import('../features/publishing/publish-dialog.tsx'))
    .PublishDialog,
}));
import { publishedLinksTitle } from '../features/publishing/publishing.ts';
import { accountsTitle } from '../lib/accounts.ts';
import {
  NoteActionsScope,
  useNoteActions,
} from '../features/editor/note-actions.tsx';
import { ancestorFolders, buildNoteTree } from '../lib/note-list.ts';
import type { DragItem } from '../lib/folder-moves.ts';
import {
  drawerCalendarClassName,
  drawerClassName,
  drawerTreeClassName,
} from './drawer.ts';
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
import { useTreeDrag } from './tree-drag.ts';
import { NoteTree } from './tree.tsx';
import {
  rowSpacerClassName,
  treeListClassName,
  treeMessageClassName,
  treeRowClassName,
  treeRowLeadingClassName,
  treeRowNameClassName,
} from '../lib/tree-row.ts';
import { moveNoteToTrashPaletteLabel, noteTrashRow } from '../lib/note-menu.ts';
import { baseNameOf, displayNoteName } from '../lib/note-name.ts';
import { initialOf } from '../lib/initial.ts';
import { workspaceAfterRemoval } from '../lib/workspace-choice.ts';
import {
  knownFolderPaths,
  selectedFolderOrRoot,
  selectionForOpenNote,
} from '../lib/folder-selection.ts';
import { UpdateNotice, usePersistentStorage } from './pwa-notices.tsx';
import {
  NoteSaveScope,
  useFlushNoteDraft,
  useNoteSaveFact,
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
import { SettingsModalHost, useOpenSettings } from './settings-modal.tsx';
import { useSignOut } from './sign-out.tsx';
import { syncStateIsQuiet } from '../lib/sync-state.ts';
import type { CalendarMonth } from '../lib/calendar-month.ts';
import {
  breadcrumbKey,
  breadcrumbParts,
  framePageOf,
  leafOf,
  parentPartOf,
  type BreadcrumbPart,
  type PageTitles,
} from '../lib/breadcrumb.ts';
import { settingsTitle } from '../features/accounts/accounts.tsx';
import { BackLink } from './back-link.tsx';
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
} from '../features/trash/trash.tsx';
import { useViewportFit } from './viewport-fit.ts';
import { SidebarViewBar, useSidebarView } from './sidebar-view-bar.tsx';
import { sidebarViewLabels, type SidebarView } from '../lib/sidebar-view.ts';

/** The name of the screen that lists every note of the workspace. */
/**
 * The list of shortcuts comes from the editor package, which loads the
 * editor engine, so the dialog loads when it opens and the first screen reads
 * no editor code (record 0177). A dialog that does not arrive is stated in
 * place, and the screen stays.
 */
const loadCommandPalette = createModuleLoad(
  async () => (await import('./command-palette.tsx')).CommandPalette,
);

const loadShortcutsDialog = createModuleLoad(
  async () => (await import('./shortcuts.tsx')).ShortcutsDialog,
);

/** What the frame states when the dialog of the shortcuts did not load. */
const shortcutsLoadFailure =
  'The list of keyboard shortcuts did not load. Check the connection, then try again.';

const allNotesTitle = 'All notes';

/** The name of the screen that holds the notes a person deleted. */
const SidebarStatus = lazy(async () => ({
  default: (await import('./sidebar-status.tsx')).SidebarStatus,
}));
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

/** The key line that opens the shortcut list. */
const shortcutsKeys = 'Cmd or Ctrl + /';

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
      <ol className="m-0 flex min-w-0 list-none items-center gap-1 p-0 text-body">
        {parts.map((part, index) =>
          part.to === null ? (
            <li
              className="flex min-w-0 flex-1 items-center gap-1"
              key={breadcrumbKey(part, index)}
            >
              {index === 0 ? null : (
                <span className="text-muted max-md:hidden" aria-hidden="true">
                  /
                </span>
              )}
              {leafFilled ? null : (
                <span className="truncate text-label text-strong">
                  {part.label}
                </span>
              )}
              <HeaderLeafSlot className="flex min-w-0 flex-1 items-center empty:hidden" />
            </li>
          ) : (
            // A separator stands between two parts and never after the
            // last one, which a page that is not the note ends on
            // (record 0139).
            <li
              className="flex shrink-0 items-center gap-1 max-md:hidden"
              key={breadcrumbKey(part, index)}
            >
              {index === 0 ? null : (
                <span className="text-muted" aria-hidden="true">
                  /
                </span>
              )}
              <Link
                className={`max-w-32 truncate rounded-md text-muted no-underline hover:text-strong ${transitionSurface} ${focusOutline}`}
                to={part.to}
                onClick={() => {
                  if (part.folder !== null) onSelectFolder(part.folder);
                }}
              >
                {part.label}
              </Link>
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
  onPublish,
  onMove,
  onNewNoteIn,
  onFromTemplate,
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
  /** Opens the Publish dialog of the frame for one note or one folder. */
  readonly onPublish: (scope: PublicationScope) => void;
  /** Opens the Move to folder dialog of the frame for some rows. */
  readonly onMove: (
    items: readonly DragItem[],
    returnFocus: () => void,
  ) => void;
  readonly onNewNoteIn: (folder: string) => void;
  readonly onFromTemplate: (folder: string) => void;
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
  const files = useFiles();
  const { openFolders, openFolder, setOpenFolders } = folders;
  const noteOrder = useNoteOrder();
  const expansion = folderExpansion(openFolders, knownFolders);
  const drag = useTreeDrag({
    store: store.store,
    accountId: session.account?.accountId ?? null,
    workspaceId,
    area: files,
    emptyFolders: files.emptyFolders,
    moveEmptyFolders: files.moveEmptyFolders,
    openFolder,
  });
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
  const overflowActions = useRef<HTMLDivElement | null>(null);
  const [sortAnchor, setSortAnchor] = useState<MenuAnchor | null>(null);
  const sortItems = noteOrders.map((order) => ({
    id: order,
    ...noteOrderLabel(order),
    selected: order === noteOrder.order,
    onSelect: () => noteOrder.setOrder(order),
  }));
  const expand = () => setOpenFolders(expandedFolders(expansion, knownFolders));

  const fixedTop = useRef<HTMLDivElement>(null),
    fixedBottom = useRef<HTMLDivElement>(null);
  return (
    <div className="ui-sidebar-panel">
      <div ref={fixedTop} data-scroll-edge="above" className="ui-sidebar-top">
        {' '}
        <div className="ui-sidebar-header md:hidden">
          <span className="text-title-header text-strong">
            {sidebarViewLabels[view]}
          </span>
          <span className="ui-sidebar-slot">
            <Button
              variant="ghost"
              size="sm"
              className="ui-sidebar-header-close"
              label="Close navigation"
              title="Close navigation"
              icon={<CloseIcon />}
              onClick={onClose}
            />
          </span>
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
            <div className="ui-drawer-actions">
              <div className="ui-drawer-actions-row ui-sidebar-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  className="ui-sidebar-action"
                  label={
                    selectedFolder === ''
                      ? 'New note'
                      : `New note in ${selectedFolder}`
                  }
                  title="New note"
                  icon={actionIcon('new-note')}
                  onClick={() => onNewNoteIn(selectedFolder)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="ui-sidebar-action"
                  label="New folder"
                  title="New folder"
                  icon={actionIcon('new-folder')}
                  onClick={() => onNewFolderIn('')}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="ui-sidebar-action"
                  label="New note from template"
                  title="New note from template"
                  icon={actionIcon('template')}
                  onClick={() => onFromTemplate(selectedFolder)}
                />
                <div className="ui-drawer-actions-wide">
                  <Menu
                    label="Sort notes"
                    icon={actionIcon('sort')}
                    triggerClassName="ui-sidebar-action"
                    align="start"
                    items={sortItems}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ui-sidebar-action"
                    label={folderExpansionLabels[expansion]}
                    title={folderExpansionLabels[expansion]}
                    icon={actionIcon(
                      expansion === 'expand' ? 'expand-all' : 'collapse-all',
                    )}
                    disabled={knownFolders.length === 0}
                    onClick={expand}
                  />
                </div>
                <div ref={overflowActions} className="ui-drawer-actions-more">
                  <Menu
                    label="More drawer actions"
                    icon={<MoreIcon />}
                    triggerClassName="ui-sidebar-action"
                    items={[
                      {
                        id: 'sort',
                        label: 'Sort notes',
                        icon: actionIcon('sort'),
                        onSelect: () => {
                          const trigger =
                            overflowActions.current?.querySelector('button');
                          if (trigger)
                            setSortAnchor(trigger.getBoundingClientRect());
                        },
                      },
                      {
                        id: 'expansion',
                        label: folderExpansionLabels[expansion],
                        icon: actionIcon(
                          expansion === 'expand'
                            ? 'expand-all'
                            : 'collapse-all',
                        ),
                        disabled: knownFolders.length === 0,
                        onSelect: expand,
                      },
                    ]}
                  />
                </div>
                {sortAnchor === null ? null : (
                  <AnchoredMenu
                    label="Sort notes"
                    items={sortItems}
                    anchor={sortAnchor}
                    onClose={(restore) => {
                      setSortAnchor(null);
                      if (restore)
                        overflowActions.current
                          ?.querySelector('button')
                          ?.focus();
                    }}
                  />
                )}
              </div>
              {newNoteProblem === null ? null : (
                <p
                  className="ui-sidebar-message text-secondary text-danger"
                  role="alert"
                >
                  {newNoteProblem}
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>
      <ScrollRegion
        className={drawerTreeClassName}
        above={fixedTop}
        below={fixedBottom}
      >
        {view === 'notes' ? (
          <>
            <section className="ui-sidebar-tree-items" aria-label="Folders">
              <div
                className={treeRowClassName({
                  wrapOnPhone: true,
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
                    <span data-tree-name className="min-w-0 flex-1 truncate">
                      {allNotesTitle}
                    </span>
                  </Link>
                </div>
                <span className="ui-sidebar-slot">
                  <Menu
                    label="Actions for All notes"
                    icon={<MoreIcon />}
                    triggerClassName="ui-sidebar-row-action ui-sidebar-row-menu"
                    items={[
                      {
                        id: 'new-note',
                        label: 'New note',
                        onSelect: () => onNewNoteIn(''),
                      },
                      {
                        id: 'new-folder',
                        label: 'New folder',
                        onSelect: () => onNewFolderIn(''),
                      },
                      {
                        id: 'template',
                        label: 'New note from template',
                        onSelect: () => onFromTemplate(''),
                      },
                    ]}
                  />
                </span>
              </div>
              {files.loading ? (
                <div className="ui-sidebar-message">
                  <LoadingState
                    shape="list"
                    rows={4}
                    label="Your notes are loading."
                  />
                </div>
              ) : tree.length === 0 ? (
                <p className="ui-sidebar-message text-secondary text-muted">
                  No notes yet.
                </p>
              ) : (
                <div className={treeListClassName}>
                  <NoteTree
                    workspaceId={workspaceId}
                    nodes={tree}
                    knownFolders={knownFolders}
                    activeFileId={fileId}
                    selectedFolder={selectedFolder}
                    folders={folders}
                    drag={drag}
                    onSelectFolder={onSelectFolder}
                    onNavigate={onNavigate}
                    onNewNoteIn={onNewNoteIn}
                    onNewFolderIn={onNewFolderIn}
                    onPublish={onPublish}
                    onMove={onMove}
                  />
                </div>
              )}
              {files.limitNotice === null ? null : (
                <p
                  className="ui-sidebar-message text-secondary text-muted"
                  role="status"
                  aria-live="polite"
                >
                  {files.limitNotice}
                </p>
              )}
            </section>
            {drag.problem === null ? null : (
              <p className={treeMessageClassName('problem')} role="alert">
                {drag.problem}
              </p>
            )}
          </>
        ) : (
          <div className={drawerCalendarClassName}>
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
              <p
                className="ui-sidebar-message text-secondary text-danger"
                role="alert"
              >
                {daily.openProblem}
              </p>
            )}
          </div>
        )}
      </ScrollRegion>
      <div
        ref={fixedBottom}
        data-scroll-edge="below"
        className="ui-sidebar-footer"
      >
        {' '}
        <Suspense fallback={<div className="ui-sidebar-status shrink-0" />}>
          <SidebarStatus workspaceId={workspaceId} />
        </Suspense>
      </div>
    </div>
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

/** The old Settings routes load through the frame chunk (issue 517). */
export { loadLegacySettings } from './settings-modal.tsx';

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
          <TemplatesProvider workspaceId={workspaceId}>
            <NoteSaveScope>
              <NoteActionsScope>
                <HeaderSlotProvider>
                  <ShellFrame workspaceId={workspaceId} />
                </HeaderSlotProvider>
              </NoteActionsScope>
            </NoteSaveScope>
          </TemplatesProvider>
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
  const openSettings = useOpenSettings();
  const signOut = useSignOut(workspaceId);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteView, setPaletteView] = useState<{
    readonly view: typeof CommandPalette;
  } | null>(null);
  const [paletteFailed, setPaletteFailed] = useState(false);
  const paletteOwner = useRef<object | null>(null);
  useEffect(() => {
    const owner = {};
    paletteOwner.current = owner;
    return () => {
      paletteOwner.current = null;
    };
  }, [workspaceId]);
  /** Load the palette on demand and open it only if the same shell still owns the request. */
  const openPalette = useCallback((): void => {
    const owner = paletteOwner.current;
    setPaletteFailed(false);
    void loadCommandPalette().then((loaded) => {
      if (owner === null || paletteOwner.current !== owner) return;
      if (!loaded.ok) {
        setPaletteFailed(true);
        return;
      }
      setPaletteView({ view: loaded.value });
      setPaletteOpen(true);
    });
  }, []);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutsDialog, setShortcutsDialog] = useState<{
    readonly view: typeof ShortcutsDialog;
  } | null>(null);
  const [shortcutsFailed, setShortcutsFailed] = useState(false);
  const openShortcuts = useCallback((): void => {
    setShortcutsFailed(false);
    void loadShortcutsDialog().then((loaded) => {
      if (!loaded.ok) {
        setShortcutsFailed(true);
        return;
      }
      setShortcutsDialog({ view: loaded.value });
      setShortcutsOpen(true);
    });
  }, []);
  // The parent of the folder the dialog will make, or `null` while it is
  // closed. It is a path and not a flag, so a folder row can name a parent
  // that is not the selected one.
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  // The note or the folder that the publish dialog opens, or `null` while
  // it is closed.
  const [publishScope, setPublishScope] = useState<PublicationScope | null>(
    null,
  );
  // The rows that the Move to folder dialog moves, and how the tree takes the
  // focus back when it closes, or `null` while it is closed (record 0164).
  const [moveItems, setMoveItems] = useState<{
    readonly items: readonly DragItem[];
    readonly returnFocus: () => void;
  } | null>(null);
  // Which workspace dialog is open, or `null` for none. The frame owns these
  // and not the sidebar: the sidebar is transformed so it slides, and a
  // transform makes its box the containing block of a `position: fixed` child,
  // which would trap a dialog inside the width of the sidebar.
  const [workspaceDialog, setWorkspaceDialog] = useState<
    'create' | 'rename' | 'delete' | null
  >(null);
  const [templateDestination, setTemplateDestination] =
    useState<TemplateDestination | null>(null);
  const { problem: templateProblem, begin: beginTemplateCreation } =
    useWorkspaceProblem(workspaceId);
  const templateFolder = templateDestinationFor(
    workspaceId,
    templateDestination,
  );
  useEffect(() => {
    setTemplateDestination(null);
  }, [workspaceId]);
  const [selectedFolder, setSelectedFolder] = useState('');
  useEffect(() => {
    setSelectedFolder('');
  }, [workspaceId]);
  const framePage = framePageOf(matches.map((match) => match.handle));
  const sidebar = useSidebarSize();
  const displayedSidebar = sidebar.size;
  const {
    phoneButton: menuButtonRef,
    desktopButton: desktopMenuButtonRef,
    panel: sidebarRef,
    scrim: drawerScrimRef,
    rememberOpener,
    modal: navigationModal,
  } = useNavigationDrawer(drawerOpen, setDrawerOpen);
  /** Collapses or shows the sidebar. Settings is a modal, so no page hides it. */
  const toggleSidebar = sidebar.toggleCollapsed;
  const [sidebarView, setSidebarView] = useSidebarView();
  // The frame is the visible part of the screen, so iOS cannot scroll it
  // away under an open keyboard.
  useViewportFit();
  // The frame owns the open folders of the tree, because the New folder
  // dialog sits here and has to show the folder it made.
  const folders = useOpenFolders(workspaceId);
  const session = useSession();
  const store = useLocalStore();
  const theme = useTheme();
  const files = useFiles();
  const workspace = useWorkspace();
  const accountId = session.account?.accountId ?? null;
  const sync = useWorkspaceSync(store.store, accountId, workspaceId);
  const syncSession = useSyncSession();
  const flushNoteDraft = useFlushNoteDraft();
  const online = useOnline();
  // Work that the server does not have yet: a note made on this device, or a
  // save the server has not accepted. It can go up while the device is
  // online and sync runs, so only then is it not at risk.
  const persistence = usePersistentStorage({
    afterFirstSave: useSavedOnce(),
    unsentWork: files.notes.some((note) => note.localOnly || note.unsent),
    sending: online && syncStateIsQuiet(sync.state),
  });
  const newNote = useCreateNote(store.store, accountId, workspaceId);
  const daily = useDailyNotes();
  const templates = useTemplates();
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
    /** Open the palette with Ctrl or Cmd P or O, and collapse the sidebar with Ctrl or Cmd backslash. */
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (!event.metaKey && !event.ctrlKey) return;
      if (key === 'p' || key === 'o') {
        event.preventDefault();
        openPalette();
        return;
      }
      if (key === '\\') {
        event.preventDefault();
        toggleSidebar();
        return;
      }
      if (key === ',') {
        event.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    // Capture this key before the editor can use it to change a code block.
    const onShortcutsKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key !== '/' ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.isComposing ||
        document.querySelector('[role="dialog"], dialog[open]') !== null
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) openShortcuts();
    };
    window.addEventListener('keydown', onShortcutsKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onShortcutsKeyDown, true);
    };
  }, [toggleSidebar, openPalette, openSettings, openShortcuts]);

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
      hint: <KeyHint keys="Cmd or Ctrl + ," />,
      icon: actionIcon('settings'),
      onSelect: () => {
        openSettings();
      },
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      hint: <KeyHint keys={shortcutsKeys} />,
      icon: actionIcon('keyboard'),
      onSelect: openShortcuts,
    },
  ];

  // Sign out is the one row that ends the session, so it sits below the
  // others with space between, which is what a pinned row of a menu is.
  const signOutItem: readonly MenuItem[] = [
    {
      id: 'sign-out',
      label: 'Sign out',
      icon: actionIcon('sign-out'),
      onSelect: signOut.start,
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

  // The breadcrumb names the way to the page, and the heading of the page
  // names the page (record 0139). The route table names the page, the open
  // note gives its name and its folders, and the page above is a part of its
  // own when the workspace part does not already name it.
  const noteName =
    openNotePath === null ? null : displayNoteName(baseNameOf(openNotePath));
  const routeName = leafOf(framePage, noteName);
  const routeParent = parentPartOf(framePage, {
    workspaceId,
    fileId: typeof params.fileId === 'string' ? params.fileId : null,
    noteName,
    titles: pageTitles,
  });

  // The avatar shows the first letter of the person, so the accessible name
  // holds the whole name: a control whose visible text is one letter has to
  // keep that letter inside its name (WCAG 2.5.3).
  const accountName = session.account?.name ?? session.account?.email ?? '';
  const accountInitial = initialOf(accountName);
  const accountLabel =
    accountName === '' ? 'Account' : `Account: ${accountName}`;

  // The palette reads its actions when it opens, so the rows of the
  // formatting tools follow the caret of the note at that moment. A list
  // that a render built kept the tools of an earlier caret.
  /** Build the palette actions when the palette opens. */
  const paletteActions = useCallback(
    (): readonly PaletteAction[] => [
      {
        id: 'new-note',
        label:
          selectedFolder === '' ? 'New note' : `New note in ${selectedFolder}`,
        keywords: 'create add',
        icon: 'new-note' as const,
        run: () => newNote.create(selectedFolder),
      },
      {
        id: 'new-folder',
        label:
          selectedFolder === ''
            ? 'New folder'
            : `New folder in ${selectedFolder}`,
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
        run: toggleSidebar,
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
        keys: shortcutsKeys,
        icon: 'keyboard' as const,
        run: openShortcuts,
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
            // The templates of the folder of the member are the second step
            // of this action, in the same palette (record 0149).
            ...(noteActions.insertTemplate === null
              ? []
              : [
                  {
                    id: 'insert-template',
                    label: 'Insert from template',
                    keywords: 'template copy paste fill snippet insert',
                    icon: 'template' as const,
                    pick: templatePalettePick({
                      settings: templates.settings,
                      list: {
                        notes: files.notes,
                        loading: files.loading,
                        complete: files.limitNotice === null,
                      },
                      openFileId: noteActions.fileId,
                      choose: noteActions.insertTemplate,
                      newTemplate: newNote.create,
                    }),
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
            ...(noteActions.copyMarkdown === null
              ? []
              : [
                  {
                    id: 'copy-note',
                    label: 'Copy this note as Markdown',
                    keywords: 'copy clipboard markdown text whole all source',
                    icon: 'copy-markdown' as const,
                    run: noteActions.copyMarkdown,
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
              : formatPaletteActions(
                  noteActions.formatRows(),
                  noteActions.format,
                )),
            ...(noteActions.deleteAndLeave === null
              ? []
              : [
                  {
                    id: 'move-note-to-trash',
                    label: moveNoteToTrashPaletteLabel,
                    keywords: 'delete trash remove',
                    icon: noteTrashRow.icon,
                    run: noteActions.deleteAndLeave,
                  },
                ]),
          ]),
      {
        id: 'trash',
        label: 'Go to Trash',
        keywords: 'deleted restore',
        icon: trashPageGlyph,
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
        label: 'Open Settings',
        keywords: 'account theme appearance preferences',
        icon: 'settings' as const,
        run: () => {
          openSettings();
        },
      },
    ],
    [
      cycleTheme,
      daily.open,
      files.limitNotice,
      files.loading,
      files.notes,
      navigate,
      newNote.create,
      noteActions,
      openSettings,
      otherWorkspaces,
      selectedFolder,
      toggleSidebar,
      templates.settings,
      themeIconName,
      workspaceId,
    ],
  );

  const ShortcutsView = shortcutsDialog?.view ?? null;
  const PaletteView = paletteView?.view ?? null;

  return (
    <SyncProvider value={sync}>
      <DeleteNoticeProvider>
        <div className="flex h-viewport flex-col bg-app text-strong">
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
                if (!drawerOpen) rememberOpener(menuButtonRef.current);
                setDrawerOpen((open) => !open);
              }}
            />
            <Button
              buttonRef={desktopMenuButtonRef}
              variant="ghost"
              size="sm"
              compact
              className={`shrink-0 max-md:hidden ${edgeControlClassName({ edge: 'start', mark: 'icon' })}`}
              label={
                displayedSidebar.collapsed
                  ? 'Show the sidebar'
                  : 'Hide the sidebar'
              }
              title={
                displayedSidebar.collapsed
                  ? 'Show the sidebar'
                  : 'Hide the sidebar'
              }
              icon={<PanelLeftIcon />}
              ariaControls="notes-sidebar"
              ariaExpanded={!displayedSidebar.collapsed}
              onClick={toggleSidebar}
            />

            <Breadcrumb
              parts={breadcrumbParts({
                workspaceId,
                workspaceName: openWorkspace?.name ?? '',
                notePath: openNotePath,
                leaf: routeName,
                parent: routeParent,
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
              onClick={openPalette}
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
              header={
                <>
                  <p className="m-0 truncate text-title-header text-strong">
                    {session.account?.name ?? ''}
                  </p>
                  <p className="m-0 truncate text-secondary text-muted">
                    {session.account?.email ?? ''}
                  </p>
                </>
              }
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
            ref={drawerScrimRef}
            data-drawer-scrim=""
            className={
              drawerOpen ? 'fixed inset-0 z-30 bg-scrim/70 md:hidden' : 'hidden'
            }
            role="presentation"
            onClick={() => setDrawerOpen(false)}
          />

          <aside
            ref={sidebarRef}
            id="notes-sidebar"
            className={drawerClassName(drawerOpen, displayedSidebar)}
            aria-label="Notes navigation"
            aria-modal={navigationModal ? true : undefined}
            role={navigationModal ? 'dialog' : undefined}
          >
            <SidebarViewBar
              workspaceId={workspaceId}
              view={sidebarView}
              onChoose={setSidebarView}
              onNavigate={() => setDrawerOpen(false)}
            />
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
                onPublish={setPublishScope}
                onMove={(items, returnFocus) =>
                  setMoveItems({ items, returnFocus })
                }
                onNewNoteIn={(folder) => newNote.create(folder)}
                onFromTemplate={(folder) =>
                  setTemplateDestination({ workspaceId, folder })
                }
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
            className={`${frameContentClassName()} ${sidebarInsetClass(displayedSidebar)}`}
          >
            {/*
              The frame notices stand in the column of the page under them
              and keep the side region beside them, so a notice lines up
              with the page and with the note (decision 0137).
            */}
            <div className={`${frameNoticeRowClassName()} ${pageGutter}`}>
              <div className={`${pageColumnClassName()} pt-4 empty:hidden`}>
                <TrialNotice />
                {templateProblem !== null ? (
                  <Notice tone="problem" message={templateProblem} />
                ) : null}
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
                {paletteFailed ? (
                  <Notice
                    tone="problem"
                    message="Search did not load. Try again."
                  >
                    <Button variant="secondary" size="sm" onClick={openPalette}>
                      Try again
                    </Button>
                  </Notice>
                ) : null}
                {shortcutsFailed ? (
                  <Notice tone="problem" message={shortcutsLoadFailure}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShortcutsFailed(false)}
                    >
                      Close
                    </Button>
                  </Notice>
                ) : null}
                {persistence.notice.kind === 'quiet' ? (
                  <Notice tone="info" message={persistence.notice.message}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={persistence.close}
                    >
                      Close
                    </Button>
                  </Notice>
                ) : persistence.notice.kind === 'at-risk' ? (
                  <Notice tone="problem" message={persistence.notice.message} />
                ) : null}
              </div>
              <div className={pageSideClassName()} />
            </div>
            {/*
              Every page header of the frame draws the one back control, to
              the page above it (record 0138).
            */}
            <PageBackProvider value={<BackLink />}>
              <Outlet />
            </PageBackProvider>
          </div>

          <DeleteNoticeBar />

          {PaletteView === null ? null : (
            <PaletteView
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              workspaceId={workspaceId}
              workspaceName={openWorkspace?.name ?? 'This workspace'}
              notes={files.notes}
              store={store.store}
              accountId={accountId}
              actions={paletteActions}
            />
          )}
          <SettingsModalHost workspaceId={workspaceId} />
          {signOut.dialog}
          {shortcutsOpen && ShortcutsView !== null ? (
            <ShortcutsView open onClose={() => setShortcutsOpen(false)} />
          ) : null}
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
          <NewFromTemplateDialog
            key={workspaceId}
            workspaceId={workspaceId}
            folder={templateFolder ?? ''}
            open={templateFolder !== null}
            onClose={() => setTemplateDestination(null)}
            onCreationStart={beginTemplateCreation}
          />
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
              folders.openFolder(folder);
            }}
          />
          {publishScope === null ? null : (
            <Suspense fallback={null}>
              <PublishDialog
                open
                onClose={() => setPublishScope(null)}
                workspaceId={workspaceId}
                scope={publishScope}
                notes={files.notes}
              />
            </Suspense>
          )}
          {session.account === null || moveItems === null ? null : (
            <MoveItemsDialog
              open
              onClose={() => setMoveItems(null)}
              store={store.store}
              accountId={session.account.accountId}
              workspaceId={workspaceId}
              area={files}
              folders={allFolders}
              emptyFolders={files.emptyFolders}
              items={moveItems.items}
              returnFocus={moveItems.returnFocus}
              onFolderMoved={files.moveEmptyFolders}
            />
          )}
        </div>
      </DeleteNoticeProvider>
    </SyncProvider>
  );
}

/** Whether this session already created one version of any note. */
function useSavedOnce(): boolean {
  const saved = useNoteSaveFact((report) => report?.lastSavedAt != null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (saved) setSeen(true);
  }, [saved]);
  return seen;
}
