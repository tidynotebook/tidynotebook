import type { ReactNode } from 'react';
import {
  Stack,
  Inline,
  Inset,
  Divider,
  type SpaceValue,
} from './primitives.tsx';
/** A group label and its optional count share one line. The parent owns the next gap. */
export function SectionHeading({
  label,
  count,
  action,
  inset = 0,
  divider = false,
  danger = false,
  id,
}: {
  readonly label: ReactNode;
  readonly count?: ReactNode;
  readonly action?: ReactNode;
  readonly inset?: SpaceValue;
  readonly divider?: boolean;
  readonly danger?: boolean;
  readonly id?: string;
}): ReactNode {
  return (
    <Stack gap={2}>
      <Inset padX={inset}>
        <Inline gap={2} wrap>
          <h3
            id={id}
            className={`min-w-0 flex-1 text-group ${danger ? 'text-danger' : 'text-muted'}`}
          >
            {label}
          </h3>
          {count === undefined ? null : (
            <span className="shrink-0 text-secondary text-muted">{count}</span>
          )}
          {action}
        </Inline>
      </Inset>
      {divider ? (
        <div className="coarse:hidden">
          <Divider />
        </div>
      ) : null}
    </Stack>
  );
}
const pillTones = {
  neutral: 'bg-hover text-muted',
  accent: 'bg-accent-surface text-strong',
  success: 'bg-success-surface text-strong',
  danger: 'bg-danger-surface text-strong',
};
const pillDots = {
  neutral: '',
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
};

export function Pill({
  children,
  tone = 'neutral',
}: {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'accent' | 'success' | 'danger';
}): ReactNode {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-small ${pillTones[tone]}`}
    >
      {tone === 'neutral' ? null : (
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${pillDots[tone]}`}
        />
      )}
      {children}
    </span>
  );
}
