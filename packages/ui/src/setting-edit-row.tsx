/** A short value edit keeps the normal Settings row edge and divider. */
import type { ComponentProps, ReactNode } from 'react';
import { Form, Inline } from './primitives.tsx';
import { listRowClasses } from './layout.tsx';
import { Button } from './controls.tsx';
export function SettingEditRow({
  children,
  onSubmit,
  onCancel,
  disabled,
  busy = false,
  label,
}: {
  readonly children: ReactNode;
  readonly onSubmit: ComponentProps<typeof Form>['onSubmit'];
  readonly onCancel: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly label: string;
}): ReactNode {
  return (
    <Form
      column={false}
      gap={3}
      aria-label={label}
      data-dialog-escape="local"
      className={listRowClasses('setting')
        .replace('items-center', 'items-stretch')
        .replace('gap-4', '')}
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      {children}
      <Inline gap={2} justify="end">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || disabled}>
          {busy ? 'Saving' : 'Save'}
        </Button>
      </Inline>
    </Form>
  );
}
