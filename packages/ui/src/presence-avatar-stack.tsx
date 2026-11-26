import type { ReactNode } from 'react';
import { PresenceAvatar } from './identity.tsx';
import { Inline } from './primitives.tsx';
import { Pill } from './section-heading.tsx';

export function PresenceAvatarStack({
  people,
}: {
  readonly people: readonly {
    readonly id: string;
    readonly initial: string;
    readonly slot: number;
    readonly idle: boolean;
  }[];
}): ReactNode {
  return (
    <Inline gap={1} aria-hidden="true">
      <span className="inline-flex -space-x-1">
        {people.slice(0, 4).map((person, index) => (
          <span
            key={person.id}
            className={
              index === 0 ? 'inline-flex' : 'inline-flex max-compact:hidden'
            }
          >
            <PresenceAvatar slot={person.slot} idle={person.idle} ring>
              {person.initial}
            </PresenceAvatar>
          </span>
        ))}
      </span>
      {people.length > 4 ? (
        <Pill className="max-compact:hidden">+{people.length - 4}</Pill>
      ) : null}
      {people.length > 1 ? (
        <span className="hidden text-small text-muted max-compact:inline">
          {people.length}
        </span>
      ) : null}
    </Inline>
  );
}
