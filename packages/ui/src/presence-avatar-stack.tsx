import type { ReactNode } from 'react';
import { PresenceAvatar, presenceAvatarShape } from './identity.tsx';

const overflowLayouts = [
  { visible: 1, display: 'compact:hidden' },
  { visible: 2, display: 'max-compact:hidden md:hidden' },
  { visible: 4, display: 'max-md:hidden' },
];

export function PresenceAvatarStack({
  people,
}: {
  readonly people: readonly {
    readonly id: string;
    readonly initial: string;
    readonly slot: number;
    readonly color?: string | undefined;
    readonly idle: boolean;
  }[];
}): ReactNode {
  return (
    <span
      className="inline-flex -space-x-1"
      aria-hidden="true"
      data-presence-stack=""
    >
      {people.slice(0, 4).map((person, index) => (
        <span
          key={person.id}
          className={
            index > 1
              ? 'inline-flex max-md:hidden'
              : index === 1
                ? 'inline-flex max-compact:hidden'
                : 'inline-flex'
          }
        >
          <PresenceAvatar
            slot={person.slot}
            color={person.color}
            idle={person.idle}
            ring
          >
            {person.initial}
          </PresenceAvatar>
        </span>
      ))}
      {overflowLayouts.map(({ visible, display }) =>
        people.length > visible ? (
          <span
            key={visible}
            data-presence-overflow=""
            className={`${presenceAvatarShape} inline-flex size-6 border border-overlay bg-active text-strong ${display}`}
          >
            +{people.length - visible}
          </span>
        ) : null,
      )}
    </span>
  );
}
