import type { ReactNode } from 'react';
import { IconFrame } from './icons.tsx';
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

const presenceRings = [
  'ring-live-0',
  'ring-live-1',
  'ring-live-2',
  'ring-live-3',
  'ring-live-4',
  'ring-live-5',
];

const idleRings = [
  'ring-live-0/60',
  'ring-live-1/60',
  'ring-live-2/60',
  'ring-live-3/60',
  'ring-live-4/60',
  'ring-live-5/60',
];

export function PresenceDots({
  slots,
}: {
  readonly slots: readonly number[];
}): ReactNode {
  return (
    <span aria-hidden="true" className="inline-flex -space-x-0.5">
      {slots.map((slot, index) => (
        <span
          key={index}
          className={`size-2 rounded-full ring-1 ring-surface ${presenceColors[slot] ?? 'bg-live-0'}`}
        />
      ))}
    </span>
  );
}

export function PresenceAvatar({
  children,
  slot = 0,
  pending = false,
  idle = false,
  ring = false,
}: {
  readonly children: ReactNode;
  readonly slot?: number;
  readonly pending?: boolean;
  readonly idle?: boolean;
  readonly ring?: boolean;
}): ReactNode {
  const rings = idle ? idleRings : presenceRings;
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-avatar ${pending || idle ? 'bg-surface text-muted' : `text-live-ink ${presenceColors[slot] ?? 'bg-live-0'}`} ${ring ? `border border-overlay ring-1 ${rings[slot] ?? rings[0]}` : ''}`}
    >
      {pending ? (
        <IconFrame size={20} className="absolute inset-0">
          <circle cx="12" cy="12" r="11" strokeDasharray="2 2" />
        </IconFrame>
      ) : null}
      {children}
    </span>
  );
}
