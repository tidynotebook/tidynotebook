import {
  Stack,
  Inline,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
} from '@notesapp/ui';
/**
 * The keyboard shortcuts dialog.
 *
 * The rows come from `shortcuts` in `packages/editor`, which is the same
 * table the key maps are built from, so a shortcut the code registers and a
 * shortcut the dialog shows cannot drift apart.
 *
 * That table names both platforms in one string. `KeyHint` shows the caps of
 * this device instead, so the person reads the keys that are on the keyboard
 * in front of them.
 *
 * The list is two columns: the description takes the free width and the caps
 * sit at the end of the row. One flex row for each shortcut states that, so
 * the dialog needs no grid with a column value of its own.
 */
import type { ReactNode } from 'react';
import { shortcuts } from '@notesapp/editor';

import { KeyHint } from './key-hint.tsx';

/** The dialog that lists every shortcut. */
export function ShortcutsDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      titleId="keyboard-shortcuts-title"
      width="medium"
    >
      <DialogBody>
        <Stack gap={2} as="dl" className="text-body">
          {shortcuts.map((shortcut) => (
            <Inline
              gap={4}
              align="center"
              justify="between"
              as="div"
              key={shortcut.keys}
            >
              <dt className="min-w-0 text-strong">{shortcut.description}</dt>
              <dd className="m-0 shrink-0">
                <KeyHint keys={shortcut.keys} />
              </dd>
            </Inline>
          ))}
        </Stack>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
