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

function paintPresence(color?: string) {
  return (node: HTMLSpanElement | null): void => {
    node?.style.setProperty('--presence-color', color ?? '');
  };
}

export function PresenceDots({
  colors,
}: {
  readonly colors: readonly string[];
}): ReactNode {
  return (
    <span aria-hidden="true" className="inline-flex -space-x-0.5">
      {colors.map((color, index) => (
        <span
          key={index}
          ref={paintPresence(color)}
          className="size-2 rounded-full bg-live-extra ring-1 ring-surface"
        />
      ))}
    </span>
  );
}

export function PresenceAvatar({
  children,
  slot = 0,
  color,
  pending = false,
  idle = false,
  ring = false,
}: {
  readonly children: ReactNode;
  readonly slot?: number;
  readonly color?: string | undefined;
  readonly pending?: boolean;
  readonly idle?: boolean;
  readonly ring?: boolean;
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      data-presence-slot={pending ? undefined : slot}
      ref={pending ? undefined : paintPresence(color)}
      className={`${presenceAvatarShape} relative inline-flex ${ring ? 'size-6' : 'size-5'} ${pending ? 'bg-surface text-muted' : 'bg-live-extra text-live-ink'} ${ring ? `border border-overlay ring-1 ${idle ? 'ring-live-extra/60' : 'ring-live-extra'}` : ''}`}
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

export const presenceAvatarShape =
  'shrink-0 items-center justify-center rounded-full text-avatar';
