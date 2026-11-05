/** The compact document scale of a template, separate from note editing. */
import type { ComponentPropsWithRef, ReactNode } from 'react';
export function PreviewSurface({
  fill = false,
  expandOnPhone = false,
  className = '',
  ...props
}: ComponentPropsWithRef<'div'> & {
  readonly fill?: boolean;
  readonly expandOnPhone?: boolean;
}): ReactNode {
  return (
    <div
      {...props}
      className={`${fill ? 'flex-1 overflow-auto' : expandOnPhone ? 'fine:max-h-72 fine:overflow-auto' : 'max-h-72 overflow-auto'} flex flex-col gap-2 rounded-lg border border-edge-subtle bg-app p-4 text-preview-body text-strong content-h1:text-preview-first content-h2:text-preview-heading content-h3:text-preview-heading content-h4:text-preview-heading content-h5:text-preview-heading content-h6:text-preview-heading content-emphasis:font-semibold content-th:font-semibold content-ul:list-disc content-ul:pl-6 content-task-list-item:list-none content-task-list-item-input:size-4 content-task-list-item:flex content-task-list-item:items-center content-task-list-item:gap-2 content-task-list-item-input:align-middle content-notes-task-mark:hidden content-ol:list-decimal content-ol:pl-6 content-pre:overflow-auto content-pre:bg-surface content-pre:p-3 content-a:text-accent content-table-scroll:w-fit content-table-scroll:max-w-full content-table-scroll:overflow-x-auto content-table-scroll:focus-visible:outline-2 content-table-scroll:focus-visible:outline-focus content-table-cell:min-w-table-cell-min content-table-cell:max-w-table-cell content-table-cell:wrap-break-word content-table-cell:p-2 content-img:max-w-full ${className}`}
    />
  );
}
