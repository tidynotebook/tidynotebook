/** A navigation group uses the same line box as its rows. */
import type { ReactNode } from 'react';
import { Inline } from './primitives.tsx';
export function NavigationHeading({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Inline
      as="h3"
      gap={2}
      padX={{ fine: 2, coarse: 4 }}
      padY={{ fine: 1, coarse: 0 }}
      className="ui-settings-nav-heading text-group text-muted"
    >
      <span className="flex h-5 items-center coarse:h-auto gap-2">
        {children}
      </span>
    </Inline>
  );
}
