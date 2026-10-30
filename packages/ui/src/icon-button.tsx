import type { ComponentProps, ReactNode } from 'react';
import { buttonClassName, sidebarViewClassName } from './control-classes.ts';
import { Button } from './controls.tsx';
export type IconButtonSize = 'row' | 'toolbar' | 'header' | 'rail';
const positions = {
  row: 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
  header: 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
  toolbar: '',
  rail: '',
} as const;
export function IconButton({
  glyph,
  size = 'toolbar',
  label,
  className = '',
  reveal = false,
  current = false,
  slotClassName = '',
  render,
  ...props
}: Omit<
  ComponentProps<typeof Button>,
  'icon' | 'size' | 'children' | 'label'
> & {
  readonly glyph: ReactNode;
  readonly size?: IconButtonSize;
  readonly label: string;
  readonly reveal?: boolean;
  readonly current?: boolean;
  readonly slotClassName?: string;
  readonly render?: (props: {
    readonly className: string;
    readonly 'aria-label': string;
    readonly 'aria-current': 'page' | undefined;
    readonly title: string;
    readonly children: ReactNode;
  }) => ReactNode;
}): ReactNode {
  const control = render ? (
    render({
      className:
        size === 'rail'
          ? sidebarViewClassName({ current })
          : buttonClassName({
              variant: 'ghost',
              iconOnly: true,
              iconSize: size,
            }),
      'aria-label': label,
      'aria-current': current ? 'page' : undefined,
      title: label,
      children: glyph,
    })
  ) : (
    <Button
      {...props}
      aria-current={current ? 'page' : undefined}
      ariaPressed={current ? true : size === 'rail' ? false : props.ariaPressed}
      variant={props.variant ?? 'ghost'}
      icon={glyph}
      iconSize={size}
      label={label}
      className={`${positions[size]} ${current ? 'aria-pressed:bg-active aria-pressed:text-strong aria-pressed:hover:bg-active' : ''} ${reveal ? rowActionVisibility : ''} ${className}`}
    />
  );
  return size === 'row' || size === 'header' ? (
    <span
      className={`relative inline-flex h-4 w-4 shrink-0 items-center justify-center ${slotClassName}`}
    >
      {control}
    </span>
  ) : (
    control
  );
}

export const rowActionVisibility =
  'fine:pointer-events-none fine:opacity-0 fine:group-hover:pointer-events-auto fine:group-hover:opacity-100 fine:group-hover/item:pointer-events-auto fine:group-hover/item:opacity-100 fine:group-focus-within:pointer-events-auto fine:group-focus-within:opacity-100 fine:group-focus-within/item:pointer-events-auto fine:group-focus-within/item:opacity-100 fine:aria-expanded:pointer-events-auto fine:aria-expanded:opacity-100';
