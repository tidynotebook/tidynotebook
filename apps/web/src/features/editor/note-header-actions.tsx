/**
 * The actions of the note route, in the frame header.
 *
 * The header is the context of the route: where a person is, then what they
 * can do here (record 0064). The note route puts one control there, the note
 * menu, and History and Publish are rows of it (record 0069). The note
 * surface itself keeps no control, so the text and the word count stay one
 * page.
 *
 * `lib/note-menu.ts` decides which rows the menu holds and in what order, so
 * the order is a rule a unit test reads and not a shape of this JSX. This
 * file turns one row into its handler and its glyph.
 *
 * Every action here is one the command palette already offers, and it runs
 * the same function, so a person meets one behaviour by two roads. Each row
 * draws the one glyph of its action from `shell/action-icons.tsx`, so the
 * menu, the palette and the sidebar cannot show three marks for one thing
 * (record 0065).
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { buttonClassName, Menu, MoreIcon, type MenuItem } from '@notesapp/ui';
import { SavePill } from './save-pill.tsx';
import { actionIcon } from '../../shell/action-icons.tsx';
import { HeaderActions } from '../../shell/header-slot.tsx';
import {
  noteMenuRows,
  noteTrashRow,
  type NoteMenuAction,
} from '../../lib/note-menu.ts';

/** What the open note can do, as the header offers it. */
export type NoteHeaderActionsProps = {
  readonly workspaceId: string;
  readonly onCopyText: () => void;
  readonly fileId: string;
  /** Moves the caret into the note name, so the person can write a new one. */
  readonly onRename: () => void;
  readonly onMoveToFolder: (() => void) | undefined;
  readonly onDuplicate: () => void;
  readonly onAttachImage: () => void;
  readonly onExport: () => void;
  readonly onPublish: (() => void) | undefined;
  readonly onDelete: () => void;
};

/**
 * The trigger of the note menu.
 *
 * It keeps its touch target and draws a smaller surface inside it, as every
 * other compact control of the product does.
 */
const noteMenuTriggerClassName = buttonClassName({
  variant: 'ghost',
  size: 'sm',
  iconOnly: true,
  compact: true,
  className: 'shrink-0',
});

/** The note menu of the open note, in the frame header. */
export function NoteHeaderActions({
  workspaceId,
  fileId,
  onRename,
  onCopyText,
  onMoveToFolder,
  onDuplicate,
  onAttachImage,
  onExport,
  onPublish,
  onDelete,
}: NoteHeaderActionsProps): ReactNode {
  const navigate = useNavigate();

  /**
   * What each row of the menu runs. Open and Copy link are rows of the menu
   * of a tree row and not of the header, because the header acts on the note
   * that is open already (record 0164).
   */
  const run: Readonly<Partial<Record<NoteMenuAction, () => void>>> = {
    history: () => {
      void navigate(`/w/${workspaceId}/notes/${fileId}/history`);
    },
    publish: () => onPublish?.(),
    rename: onRename,
    move: () => onMoveToFolder?.(),
    duplicate: onDuplicate,
    'attach-image': onAttachImage,
    export: onExport,
    'move-to-trash': onDelete,
  };

  const items: MenuItem[] = noteMenuRows({
    canMove: onMoveToFolder !== undefined,
    canPublish: onPublish !== undefined,
  }).flatMap((row) => {
    const onSelect = run[row.id];
    return onSelect === undefined
      ? []
      : [
          {
            id: row.id,
            label: row.label,
            icon: actionIcon(row.icon),
            onSelect,
          },
        ];
  });

  return (
    <HeaderActions>
      <SavePill workspaceId={workspaceId} onCopyText={onCopyText} />
      {/*
        Move to Trash is the one row that destroys something, so it takes the
        danger tone of the row recipe and stands in the pinned region under
        the separator, away from the row a person reaches for by mistake.
      */}
      <Menu
        label="Note actions"
        icon={<MoreIcon />}
        items={items}
        pinned={[
          {
            id: noteTrashRow.id,
            label: noteTrashRow.label,
            icon: actionIcon(noteTrashRow.icon),
            danger: true,
            onSelect: onDelete,
          },
        ]}
        triggerClassName={noteMenuTriggerClassName}
        compact
      />
    </HeaderActions>
  );
}
