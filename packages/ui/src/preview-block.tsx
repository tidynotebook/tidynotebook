import {
  createElement,
  type ComponentPropsWithRef,
  type ElementType,
  type ReactNode,
} from 'react';
import { insetClasses } from './primitives.tsx';
export function PreviewBlock<T extends ElementType = 'pre'>({
  as,
  className = '',
  ...props
}: { readonly as?: T; readonly className?: string } & Omit<
  ComponentPropsWithRef<T>,
  'as' | 'className'
>): ReactNode {
  return createElement(as ?? 'pre', {
    ...props,
    className: `${insetClasses({ pad: 3 })} m-0 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-edge-subtle bg-app font-mono text-code text-strong ${className}`,
  });
}
