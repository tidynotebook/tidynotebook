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

const presenceColors = [
  'bg-live-0',
  'bg-live-1',
  'bg-live-2',
  'bg-live-3',
  'bg-live-4',
  'bg-live-5',
];

export function PresenceAvatar({
  children,
  slot,
}: {
  readonly children: ReactNode;
  readonly slot: number;
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-avatar text-live-ink ${presenceColors[slot] ?? 'bg-live-0'}`}
    >
      {children}
    </span>
  );
}
