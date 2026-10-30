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
      className={`${fill ? 'flex-1 overflow-auto' : expandOnPhone ? 'fine:max-h-72 fine:overflow-auto' : 'max-h-72 overflow-auto'} flex flex-col gap-2 rounded-lg border border-edge-subtle bg-app p-4 text-preview-body text-strong [&_h1]:text-preview-first [&_h2]:text-preview-heading [&_h3]:text-preview-heading [&_h4]:text-preview-heading [&_h5]:text-preview-heading [&_h6]:text-preview-heading [&_strong]:font-semibold [&_b]:font-semibold [&_th]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_li.task-list-item]:list-none [&_.task-list-item_input]:size-4 [&_.task-list-item]:flex [&_.task-list-item]:items-center [&_.task-list-item]:gap-2 [&_.task-list-item_input]:align-middle [&_.notes-task-mark]:hidden [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-auto [&_pre]:bg-surface [&_pre]:p-3 [&_a]:text-accent [&_table]:w-full [&_td]:p-2 [&_th]:p-2 [&_img]:max-w-full ${className}`}
    />
  );
}
