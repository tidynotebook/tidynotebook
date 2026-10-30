/** A reserved column keeps the page clear of an open desktop panel. */
import type { ReactNode, HTMLAttributes } from 'react';
const columns = {
  narrow: 'md:grid-cols-sidebar-narrow',
  medium: 'md:grid-cols-sidebar-medium',
  wide: 'md:grid-cols-sidebar-wide',
  widest: 'md:grid-cols-sidebar-widest',
} as const;
export type SidebarWidth = keyof typeof columns;
export function ApplicationContent({
  children,
  sidebar,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly sidebar?: SidebarWidth | undefined;
}): ReactNode {
  return (
    <div
      {...props}
      className={`grid flex-1 grid-cols-1 overflow-hidden ${sidebar ? columns[sidebar] : ''} ${className}`}
    >
      {sidebar ? <div aria-hidden="true" className="hidden md:block" /> : null}
      <div className="flex flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
export function sidebarInsetClassName(size: {
  readonly collapsed: boolean;
  readonly step: SidebarWidth;
}): string {
  return size.collapsed ? 'md:grid-cols-1' : columns[size.step];
}
