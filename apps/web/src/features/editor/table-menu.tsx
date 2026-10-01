/**
 * The menu of a row or a column of a table (record 0097).
 *
 * The handle that the editor draws on a table asks for this menu with the cell
 * it names, and the note screen renders it at the place of the handle. The
 * rows come from `lib/table-menu.ts`, the one list that the command palette
 * reads as well, and each row runs its action on the cell of the handle
 * through `runTableAction`, whatever cell holds the caret.
 */
import { useCallback, type ReactNode } from 'react';
import {
  runTableAction,
  tableControlLabels,
  type EditorView,
  type TableMenuRequest,
} from '@notesapp/editor';
import { AnchoredMenu, type MenuItem } from '@notesapp/ui';
import { tableMenuEntries } from '../../lib/table-menu.ts';
import { actionIcon } from '../../shell/action-icons.tsx';

/** The menu of one handle, over the editor of the open note. */
export function TableMenu({
  request,
  view,
  onClose,
}: {
  readonly request: TableMenuRequest;
  /** The editor of the open note, which the actions change. */
  readonly view: () => EditorView | null;
  readonly onClose: () => void;
}): ReactNode {
  const close = useCallback(
    (restoreFocus: boolean): void => {
      onClose();
      // The editor marks the row or the column of the menu while it is open
      // (record 0147), and this tells it the menu is gone.
      request.onClose();
      // A key or a chosen row gives the focus back to the note, where the
      // person writes on.
      if (restoreFocus) view()?.focus();
    },
    [onClose, request, view],
  );
  const items = tableMenuEntries(request.kind, request.context).map(
    (entry): MenuItem => ({
      id: entry.id,
      label: entry.label,
      icon: actionIcon(entry.icon),
      group: entry.group,
      danger: entry.danger,
      ...(entry.current ? { hint: 'Current' } : {}),
      onSelect: () => {
        const editor = view();
        if (editor !== null) runTableAction(editor, entry.id, request.pos);
      },
    }),
  );
  return (
    <AnchoredMenu
      label={
        request.kind === 'row'
          ? tableControlLabels.rowMenu
          : tableControlLabels.columnMenu
      }
      items={items}
      anchor={request.anchor}
      onClose={close}
    />
  );
}
