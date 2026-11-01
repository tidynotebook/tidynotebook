import type { ReactNode } from 'react';
export function IdentityMark({
  children,
  size = 'workspace',
}: {
  readonly children: ReactNode;
  readonly size?: 'workspace' | 'brand';
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center bg-active text-strong ${size === 'brand' ? 'size-7 rounded-md' : 'size-5 rounded-sm text-avatar'}`}
    >
      {children}
    </span>
  );
}
export function TileSelectedBadge({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <span
      data-mode-check=""
      aria-hidden="true"
      className="absolute right-2 top-2 inline-flex rounded-md bg-card text-strong"
    >
      {children}
    </span>
  );
}
