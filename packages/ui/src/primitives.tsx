/** Typed composition. Spacing belongs to a parent, not to a feature class. */
import { DialogInsetContext } from './dialog-layout-context.ts';
import {
  useContext,
  createElement,
  type ComponentPropsWithRef,
  type ReactNode,
  type ElementType,
} from 'react';
export type Space = 0 | 0.5 | 1 | 2 | 3 | 4 | 6 | 8 | 12;
export type DensityValue<T> = T | { readonly fine: T; readonly coarse: T };
export type SpaceValue = DensityValue<Space>;
export type InsetProps = {
  readonly pad?: SpaceValue | undefined;
  readonly padX?: SpaceValue | undefined;
  readonly padY?: SpaceValue | undefined;
};
const spaces = {
  gx: {
    0: 'gap-x-0',
    0.5: 'gap-x-0.5',
    1: 'gap-x-1',
    2: 'gap-x-2',
    3: 'gap-x-3',
    4: 'gap-x-4',
    6: 'gap-x-6',
    8: 'gap-x-8',
    12: 'gap-x-12',
  },
  gy: {
    0: 'gap-y-0',
    0.5: 'gap-y-0.5',
    1: 'gap-y-1',
    2: 'gap-y-2',
    3: 'gap-y-3',
    4: 'gap-y-4',
    6: 'gap-y-6',
    8: 'gap-y-8',
    12: 'gap-y-12',
  },
  p: {
    0: 'p-0',
    0.5: 'p-0.5',
    1: 'p-1',
    2: 'p-2',
    3: 'p-3',
    4: 'p-4',
    6: 'p-6',
    8: 'p-8',
    12: 'p-12',
  },
  px: {
    0: 'px-0',
    0.5: 'px-0.5',
    1: 'px-1',
    2: 'px-2',
    3: 'px-3',
    4: 'px-4',
    6: 'px-6',
    8: 'px-8',
    12: 'px-12',
  },
  py: {
    0: 'py-0',
    0.5: 'py-0.5',
    1: 'py-1',
    2: 'py-2',
    3: 'py-3',
    4: 'py-4',
    6: 'py-6',
    8: 'py-8',
    12: 'py-12',
  },
  gap: {
    0: 'gap-0',
    0.5: 'gap-0.5',
    1: 'gap-1',
    2: 'gap-2',
    3: 'gap-3',
    4: 'gap-4',
    6: 'gap-6',
    8: 'gap-8',
    12: 'gap-12',
  },
} as const;
const touchSpaces = {
  gx: {
    0: 'coarse:gap-x-0',
    0.5: 'coarse:gap-x-0.5',
    1: 'coarse:gap-x-1',
    2: 'coarse:gap-x-2',
    3: 'coarse:gap-x-3',
    4: 'coarse:gap-x-4',
    6: 'coarse:gap-x-6',
    8: 'coarse:gap-x-8',
    12: 'coarse:gap-x-12',
  },
  gy: {
    0: 'coarse:gap-y-0',
    0.5: 'coarse:gap-y-0.5',
    1: 'coarse:gap-y-1',
    2: 'coarse:gap-y-2',
    3: 'coarse:gap-y-3',
    4: 'coarse:gap-y-4',
    6: 'coarse:gap-y-6',
    8: 'coarse:gap-y-8',
    12: 'coarse:gap-y-12',
  },
  p: {
    0: 'coarse:p-0',
    0.5: 'coarse:p-0.5',
    1: 'coarse:p-1',
    2: 'coarse:p-2',
    3: 'coarse:p-3',
    4: 'coarse:p-4',
    6: 'coarse:p-6',
    8: 'coarse:p-8',
    12: 'coarse:p-12',
  },
  px: {
    0: 'coarse:px-0',
    0.5: 'coarse:px-0.5',
    1: 'coarse:px-1',
    2: 'coarse:px-2',
    3: 'coarse:px-3',
    4: 'coarse:px-4',
    6: 'coarse:px-6',
    8: 'coarse:px-8',
    12: 'coarse:px-12',
  },
  py: {
    0: 'coarse:py-0',
    0.5: 'coarse:py-0.5',
    1: 'coarse:py-1',
    2: 'coarse:py-2',
    3: 'coarse:py-3',
    4: 'coarse:py-4',
    6: 'coarse:py-6',
    8: 'coarse:py-8',
    12: 'coarse:py-12',
  },
  gap: {
    0: 'coarse:gap-0',
    0.5: 'coarse:gap-0.5',
    1: 'coarse:gap-1',
    2: 'coarse:gap-2',
    3: 'coarse:gap-3',
    4: 'coarse:gap-4',
    6: 'coarse:gap-6',
    8: 'coarse:gap-8',
    12: 'coarse:gap-12',
  },
} as const;
export function spaceClasses(
  kind: keyof typeof spaces,
  value: SpaceValue | undefined,
): string {
  if (value === undefined) return '';
  return typeof value === 'number'
    ? spaces[kind][value]
    : `${spaces[kind][value.fine]} ${touchSpaces[kind][value.coarse]}`;
}
export function insetClasses({ pad, padX, padY }: InsetProps): string {
  return [
    spaceClasses('p', pad),
    spaceClasses('px', padX),
    spaceClasses('py', padY),
  ].join(' ');
}
export function compositionData(
  kind: string,
  props: InsetProps & {
    readonly gap?: SpaceValue | undefined;
    readonly gapX?: SpaceValue | undefined;
    readonly gapY?: SpaceValue | undefined;
  },
): Record<string, string> {
  const result: Record<string, string> = { 'data-ui-layout': kind };
  for (const [key, value] of Object.entries(props))
    if (value !== undefined)
      result[`data-ui-${key.toLowerCase()}`] = JSON.stringify(value);
  return result;
}
const aligns = {
  start: 'items-start',
  center: 'items-center',
  'safe-center': 'items-center-safe',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
} as const;
const justifies = {
  start: 'justify-start',
  center: 'justify-center',
  'safe-center': 'justify-center-safe',
  end: 'justify-end',
  between: 'justify-between',
} as const;
type Tag = ElementType;
type FrameProps<T extends Tag> = {
  readonly as?: T;
  readonly children?: ReactNode;
  readonly className?: string | undefined;
} & Omit<ComponentPropsWithRef<T>, 'as' | 'children' | 'className'>;
export function Stack<T extends Tag = 'div'>({
  as,
  children,
  className = '',
  gap = 0,
  align = 'stretch',
  fill = false,
  pad,
  padX,
  padY,
  ...rest
}: FrameProps<T> &
  InsetProps & {
    readonly gap?: SpaceValue;
    readonly align?: keyof typeof aligns;
    readonly fill?: boolean;
  }): ReactNode {
  return createElement(
    as ?? 'div',
    {
      ...rest,
      ...compositionData('stack', { pad, padX, padY, gap }),
      className: `flex flex-col ${fill ? 'flex-1 overflow-hidden' : ''} ${aligns[align]} ${spaceClasses('gap', gap)} ${insetClasses({ pad, padX, padY })} ${className}`,
    },
    children,
  );
}
export function Inline<T extends Tag = 'div'>({
  as,
  children,
  className = '',
  gap = 0,
  gapX,
  gapY,
  align = 'center',
  justify = 'start',
  wrap = false,
  pad,
  padX,
  padY,
  ...rest
}: FrameProps<T> &
  InsetProps & {
    readonly gap?: SpaceValue;
    readonly gapX?: SpaceValue;
    readonly gapY?: SpaceValue;
    readonly align?: keyof typeof aligns;
    readonly justify?: keyof typeof justifies;
    readonly wrap?: boolean;
  }): ReactNode {
  return createElement(
    as ?? 'div',
    {
      ...rest,
      ...compositionData('inline', { pad, padX, padY, gap, gapX, gapY }),
      className: `flex ${wrap ? 'flex-wrap' : 'flex-nowrap'} ${aligns[align]} ${justifies[justify]} ${spaceClasses('gap', gap)} ${spaceClasses('gx', gapX)} ${spaceClasses('gy', gapY)} ${insetClasses({ pad, padX, padY })} ${className}`,
    },
    children,
  );
}
export function Inset<T extends Tag = 'div'>({
  as,
  children,
  className = '',
  pad,
  padX,
  padY,
  ...rest
}: FrameProps<T> & InsetProps): ReactNode {
  return createElement(
    as ?? 'div',
    {
      ...rest,
      ...compositionData('inset', { pad, padX, padY }),
      className: `${insetClasses({ pad, padX, padY })} ${className}`,
    },
    children,
  );
}
export function Grid<T extends Tag = 'div'>({
  as,
  children,
  className = '',
  gap = 0,
  pad,
  padX,
  padY,
  ...rest
}: FrameProps<T> & InsetProps & { readonly gap?: SpaceValue }): ReactNode {
  return createElement(
    as ?? 'div',
    {
      ...rest,
      ...compositionData('grid', { pad, padX, padY, gap }),
      className: `grid ${spaceClasses('gap', gap)} ${insetClasses({ pad, padX, padY })} ${className}`,
    },
    children,
  );
}
export function Divider({
  className = '',
}: {
  readonly className?: string | undefined;
}): ReactNode {
  return (
    <div
      role="separator"
      className={`h-px w-full shrink-0 bg-edge-subtle ${className}`}
    />
  );
}
export function Panel<T extends Tag = 'div'>({
  as,
  pad = { fine: 2, coarse: 3 },
  regions = false,
  children,
  className = '',
  ...rest
}: FrameProps<T> & {
  readonly pad?: SpaceValue | undefined;
  readonly regions?: boolean;
}): ReactNode {
  return createElement(
    as ?? 'div',
    {
      ...rest,
      ...compositionData('panel', { pad, gap: pad }),
      className: `${regions ? 'grid h-full min-w-0 flex-1 grid-cols-1 grid-rows-sidebar overflow-clip' : 'flex flex-col'} ${spaceClasses('gap', pad)} ${insetClasses({ pad })} bg-panel ${className}`,
    },
    children,
  );
}
export function Toolbar({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}): ReactNode {
  return (
    <Inline gap={0.5} className={className}>
      {children}
    </Inline>
  );
}
export function IconSlot({
  children,
  className = '',
}: {
  readonly children?: ReactNode;
  readonly className?: string | undefined;
}): ReactNode {
  return (
    <span
      className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`}
    >
      {children}
    </span>
  );
}
export function Rail<T extends Tag = 'nav'>({
  as,
  children,
  className = '',
  ...rest
}: FrameProps<T>): ReactNode {
  return createElement(
    as ?? 'nav',
    {
      ...rest,
      className: `grid w-12 shrink-0 grid-rows-sidebar justify-items-center py-2 ${className}`,
    },
    children,
  );
}
export function StatusLine<T extends Tag = 'div'>({
  as,
  children,
  className = '',
  ...rest
}: FrameProps<T>): ReactNode {
  return createElement(
    as ?? 'div',
    {
      ...rest,
      className: `flex h-8 w-full shrink-0 items-center gap-2 px-2 py-2 text-secondary coarse:px-3 ${className}`,
    },
    children,
  );
}
export function PanelHeader({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}): ReactNode {
  return (
    <Inline
      as="header"
      align="center"
      justify="between"
      className={`h-11 shrink-0 ${className}`}
    >
      {children}
    </Inline>
  );
}
/** A public page can grow beyond one viewport without losing its center. */
export function Viewport<T extends Tag = 'div'>(
  props: ComponentPropsWithRef<T> & {
    readonly as?: T;
    readonly children?: ReactNode;
    readonly className?: string;
    readonly gap?: SpaceValue;
    readonly align?: keyof typeof aligns;
  } & InsetProps,
): ReactNode {
  return <Stack {...props} className={`min-h-dvh ${props.className ?? ''}`} />;
}
export function CanvasImage(props: ComponentPropsWithRef<'img'>): ReactNode {
  return <img {...props} className={props.className} />;
}
/** A form either groups fields or contains independently padded regions. */
export function Form({
  regions = false,
  gap = regions ? 0 : 3,
  children,
  ...props
}: ComponentPropsWithRef<'form'> & {
  readonly regions?: boolean;
  readonly gap?: SpaceValue;
}): ReactNode {
  const dialogInset = useContext(DialogInsetContext);
  return (
    <Stack
      {...props}
      as="form"
      gap={regions && dialogInset ? 6 : gap}
      fill={regions}
    >
      {children}
    </Stack>
  );
}
