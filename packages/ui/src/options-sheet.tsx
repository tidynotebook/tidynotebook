/** Opens transient choices with the same dialog and phone sheet as the app. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogBody, DialogFooter } from './dialog.tsx';
import { Button } from './controls.tsx';
import { ListRow } from './layout.tsx';

/** What the opener of the sheet learns, and where the focus goes back. */
export type OptionsSheetEvents = {
  /** Runs once when the sheet closes, by any road. */
  readonly onClose?: () => void;
  /** Gives the focus back on close, in place of the element that opened it. */
  readonly returnFocus?: () => void;
};

export type SheetOption = {
  readonly label: string;
  readonly read: () => boolean;
  readonly change: (checked: boolean) => void;
};
export function openOptionsSheet(
  title: string,
  options: readonly SheetOption[],
  events: OptionsSheetEvents = {},
): () => void {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    root.unmount();
    host.remove();
    events.onClose?.();
  };
  function Choices() {
    const [, refresh] = useState(0);
    return (
      <Dialog
        open
        title={title}
        titleId="editor-options-title"
        onClose={close}
        width="small"
        align="center"
        returnFocus={events.returnFocus}
      >
        <DialogBody>
          {options.map((option) => (
            // The row of a switch, as `Switch` draws it, with its own side
            // inset at a fine pointer. A Settings row reaches its fill past
            // the content into the padding of its region, and this dialog,
            // whose panel owns the inset, clips that fill at the row.
            <ListRow
              key={option.label}
              as="button"
              density="setting"
              className="fine:px-2"
              label={option.label}
              trailing={{ kind: 'switch', checked: option.read() }}
              role="switch"
              aria-checked={option.read()}
              onClick={() => {
                option.change(!option.read());
                refresh((value) => value + 1);
              }}
            />
          ))}
        </DialogBody>
        <DialogFooter>
          <Button onClick={close}>Done</Button>
        </DialogFooter>
      </Dialog>
    );
  }
  root.render(<Choices />);
  return close;
}
