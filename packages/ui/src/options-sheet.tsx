/** Opens transient choices with the same dialog and phone sheet as the app. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogBody, DialogFooter } from './dialog.tsx';
import { Button, Switch } from './controls.tsx';

export type SheetOption = {
  readonly label: string;
  readonly read: () => boolean;
  readonly change: (checked: boolean) => void;
};
export function openOptionsSheet(
  title: string,
  options: readonly SheetOption[],
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
      >
        <DialogBody>
          {options.map((option) => (
            <Switch
              key={option.label}
              label={option.label}
              checked={option.read()}
              onChange={(checked) => {
                option.change(checked);
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
