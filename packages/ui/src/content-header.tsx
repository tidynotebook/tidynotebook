/** One fixed title row. Larger targets stay centered on the glyph slots. */
import type { ComponentPropsWithRef, ReactNode } from 'react';
import {
  Inline,
  Stack,
  type InsetProps,
  type SpaceValue,
} from './primitives.tsx';
import { fixedRegionClasses } from './scroll-region.tsx';
export function ContentHeader({
  children,
  className = '',
  pad,
  padX,
  padY,
  ...props
}: ComponentPropsWithRef<'header'> & InsetProps): ReactNode {
  return (
    <Inline
      as="header"
      {...props}
      pad={pad}
      padX={padX}
      padY={padY}
      gap={2}
      className={`ui-settings-heading relative shrink-0 coarse:h-11 ${fixedRegionClasses('bottom')} ${className}`}
    >
      {children}
    </Inline>
  );
}
export function HeaderTitle({
  children,
  className = '',
  ...props
}: ComponentPropsWithRef<'div'>): ReactNode {
  return (
    <Stack
      {...props}
      gap={0.5}
      className={`min-w-0 flex-1 coarse:pointer-events-none coarse:absolute coarse:inset-x-16 coarse:text-center ${className}`}
    >
      {children}
    </Stack>
  );
}
export function HeaderSlot({
  children,
  className = '',
  ...props
}: ComponentPropsWithRef<'span'>): ReactNode {
  return (
    <span
      {...props}
      className={`relative inline-flex h-6 w-4 shrink-0 items-center justify-center ${className}`}
    >
      {children}
    </span>
  );
}
export function RowCopy({
  children,
  className = '',
  ...props
}: ComponentPropsWithRef<'div'>): ReactNode {
  return (
    <Stack
      {...props}
      gap={0.5}
      className={`ui-settings-copy min-w-0 flex-1 ${className}`}
    >
      {children}
    </Stack>
  );
}
export function RowControl({
  children,
  className = '',
  ...props
}: ComponentPropsWithRef<'div'>): ReactNode {
  return (
    <Inline
      {...props}
      gap={2}
      justify="end"
      className={`ui-settings-control h-7 max-w-3/5 shrink-0 coarse:h-5 ${className}`}
    >
      {children}
    </Inline>
  );
}
/** One group owns its heading and its rows. A title block is another group. */
export function ContentGroups({
  children,
  gap = { fine: 6, coarse: 4 },
  ...props
}: ComponentPropsWithRef<'div'> & { readonly gap?: SpaceValue }): ReactNode {
  return (
    <Stack {...props} gap={gap}>
      {children}
    </Stack>
  );
}
