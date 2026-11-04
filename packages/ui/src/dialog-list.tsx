import { useContext, type ComponentPropsWithRef, type ReactNode } from 'react';
import { PhoneSheetContext } from './dialog.tsx';
import { Inset, Stack } from './primitives.tsx';

/** The command dialog owns a desktop inset of 6 and a phone inset of 4. */
export function useDialogListInset(): 4 | 6 {
  return useContext(PhoneSheetContext) ? 4 : 6;
}

/** A dialog list keeps room for row fills inside its region inset. */
export function DialogList({
  children,
  className = '',
  ...props
}: ComponentPropsWithRef<'ul'>): ReactNode {
  const inset = useDialogListInset();
  return (
    <Inset {...props} as="ul" padX={inset} className={className}>
      {children}
    </Inset>
  );
}

/** Owns the command content inset and gaps; regions keep the row fill gutter. */
export function DialogListGroup({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const inset = useDialogListInset();
  return (
    <>
      <Stack gap={inset} padY={inset} className="min-h-0 overflow-hidden">
        {children}
      </Stack>
      {inset === 4 ? (
        <div aria-hidden="true" className="h-safe shrink-0" />
      ) : null}
    </>
  );
}
