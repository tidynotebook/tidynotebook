import {
  Button,
  ChevronsUpDownIcon,
  LoadingState,
  Menu,
  type MenuItem,
  Page,
  PageHeader,
  rowClassName,
} from '@notesapp/ui';

/**
 * The workspaces of the account, and the control that moves between them.
 *
 * A workspace is an explicit container that a person chooses (record 0049). It
 * is the scope that every read of the product already has: the note list, the
 * command palette, the search answer, the backlink panel, the Trash and the
 * published links each answer for one workspace, so two workspaces keep two
 * sets of notes apart without a rule in any of those surfaces.
 *
 * The switcher is the first row of the sidebar, so it reads as the container
 * of everything below it: the initial of the workspace in a small square, the
 * name, and the mark of a control that moves between alternatives. It is a
 * row of the sidebar and not a box of its own (decision 0064). Create
 * workspace is a pinned row of its menu, so it stays in view as the list
 * grows.
 *
 * The rules of which workspace opens live in `lib/workspace-choice.ts`. The
 * state and the browser storage live in `app.tsx`. This module is the screen.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';

import { deleteGlyph } from '../lib/delete-label.ts';
import { useWorkspace } from '../app.tsx';
import { addressInWorkspace, isMemberOf } from '../lib/workspace-choice.ts';
import { initialOf } from '../lib/initial.ts';
import { actionIcon } from './action-icons.tsx';

/** The longest workspace name the contract accepts. */

/**
 * Sends an address that names no workspace into the chosen workspace.
 *
 * The root address goes to the notes of the workspace this device last
 * opened, and any other path goes to the same path under it (record 0091), so
 * `/settings` opens the Settings modal inside the frame. This screen has no sidebar and
 * no rail: it is only the step before the frame, while no workspace is known.
 */
export function WorkspaceHome(): ReactNode {
  const { state, reload } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (state.status === 'ready')
      void navigate(addressInWorkspace(state.workspaceId, location), {
        replace: true,
      });
  }, [state, navigate, location]);

  if (state.status === 'error')
    return (
      <Page>
        <PageHeader title="Your notes did not open" />
        <p className="text-secondary text-danger" role="alert">
          {state.message}
        </p>
        <Button variant="secondary" onClick={() => reload()}>
          Try again
        </Button>
      </Page>
    );

  return (
    <Page>
      <LoadingState label="Your notes are opening." />
    </Page>
  );
}

/**
 * Opens the workspace that the address names, when the account holds it.
 *
 * The address is the one thing that says which workspace is open, and this is
 * the one place that records it as the choice of this device. Every other
 * screen navigates and lets this decide.
 *
 * A workspace the list does not hold is not yet a refusal. The list is a cache
 * of a server fact and it goes stale, so the address is worth one question to
 * the server: another device may have made that workspace. The redirect waits
 * for the answer to that question and not merely for the asking, which is what
 * `revision` is for. A workspace that is still unknown after the answer sends
 * the person to the one they chose, because a refusal they cannot act on is
 * worse than their own notes.
 */
export function RequireCurrentWorkspace({
  workspaceId,
  children,
}: {
  readonly workspaceId: string;
  readonly children: ReactNode;
}): ReactNode {
  const { state, remember, reload } = useWorkspace();
  /** The address that was asked about, and the list revision at that moment. */
  const [asked, setAsked] = useState<{
    readonly workspaceId: string;
    readonly revision: number;
  } | null>(null);

  const ready = state.status === 'ready';
  const member = ready && isMemberOf(state.workspaces, workspaceId);
  const revision = ready ? state.revision : 0;

  useEffect(() => {
    if (!ready || member) {
      if (member) remember(workspaceId);
      return;
    }
    if (asked?.workspaceId === workspaceId) return;
    setAsked({ workspaceId, revision });
    reload();
  }, [ready, member, workspaceId, revision, asked, remember, reload]);

  if (!ready) return children;
  if (member) return children;
  // The question is still out. Nothing is decided, so nothing moves.
  if (asked?.workspaceId !== workspaceId || revision <= asked.revision)
    return children;
  return <Navigate to={`/w/${state.workspaceId}`} replace />;
}

import {
  NewWorkspaceDialog,
  RenameWorkspaceDialog,
  DeleteWorkspaceDialog,
} from './workspace-dialog-entry.tsx';
export { NewWorkspaceDialog, RenameWorkspaceDialog, DeleteWorkspaceDialog };

/**
 * The workspace switcher of the sidebar.
 *
 * The trigger names the open workspace. The menu lists every workspace of the
 * account and marks the open one, then the actions of that workspace, then the
 * pinned Create workspace row.
 *
 * The dialogs of those actions do not live here. The sidebar is a transformed
 * element, because the drawer slides, and a transform makes its box the
 * containing block of every `position: fixed` descendant. A dialog rendered
 * inside it would be trapped in the width of the sidebar instead of covering
 * the page. So this control raises intent and `shell.tsx` owns the dialogs,
 * which is what it already does for the folder and publish dialogs.
 */
export function WorkspaceSwitcher({
  workspaceId,
  onNavigate,
  onCreate,
  onRename,
  onDelete,
}: {
  /**
   * The workspace of the address, which is the one the shell is showing.
   *
   * The trigger names this and not the stored choice, because the address is
   * what every other part of the shell is scoped to. Reading one fact from
   * one place keeps the name and the notes below it in step.
   */
  readonly workspaceId: string;
  /** Closes the navigation drawer after a switch on a narrow viewport. */
  readonly onNavigate: () => void;
  readonly onCreate: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  const { state } = useWorkspace();
  const navigate = useNavigate();

  const workspaces = state.status === 'ready' ? state.workspaces : [];
  const openWorkspace =
    workspaces.find((workspace) => workspace.workspaceId === workspaceId) ??
    null;

  if (state.status !== 'ready' || openWorkspace === null) return null;

  const switchTo = (wanted: string): void => {
    if (wanted === workspaceId) return;
    // Only the address moves. The membership check of the route records the
    // choice, so nothing else writes it.
    void navigate(`/w/${wanted}`);
    onNavigate();
  };

  const items: MenuItem[] = workspaces.map((workspace) => ({
    id: workspace.workspaceId,
    label: workspace.name,
    icon: actionIcon('workspace'),
    selected: workspace.workspaceId === workspaceId,
    onSelect: () => switchTo(workspace.workspaceId),
  }));

  const pinned: MenuItem[] = [
    {
      id: 'rename-workspace',
      onIntent: () => {
        void RenameWorkspaceDialog.preload();
      },
      label: 'Rename workspace',
      icon: actionIcon('rename'),
      onSelect: onRename,
    },
    // Record 0051 keeps the last workspace of an account, so the row is absent
    // rather than present and always refused. The server refuses it either
    // way; this is only the courtesy.
    ...(workspaces.length > 1
      ? [
          {
            id: 'delete-workspace',
            onIntent: () => {
              void DeleteWorkspaceDialog.preload();
            },
            label: 'Delete permanently',
            icon: actionIcon(deleteGlyph),
            danger: true,
            onSelect: onDelete,
          },
        ]
      : []),
    {
      id: 'new-workspace',
      onIntent: () => {
        void NewWorkspaceDialog.preload();
      },
      label: 'New workspace',
      icon: actionIcon('new-workspace'),
      onSelect: onCreate,
    },
  ];

  return (
    <div className="shrink-0">
      <Menu
        label={`Workspace: ${openWorkspace.name}`}
        trigger="row"
        items={items}
        pinned={pinned}
        matchTrigger
        triggerClassName={rowClassName({
          inset: false,
          className: 'ui-sidebar-switcher w-full text-left',
        }).replace('ui-tree-row', '')}
      >
        <span
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm bg-active text-avatar text-strong"
          aria-hidden="true"
        >
          {initialOf(openWorkspace.name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-label text-strong">
          {openWorkspace.name}
        </span>
        <span
          className="inline-flex shrink-0 items-center text-muted"
          aria-hidden="true"
        >
          <ChevronsUpDownIcon />
        </span>
      </Menu>
    </div>
  );
}
