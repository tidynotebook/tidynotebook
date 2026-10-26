import type { ReactNode } from 'react';
import { switchClassNames } from './control-classes.ts';

/** A full row switch states its value and any unavailable reason. */
export function Switch({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
}): ReactNode {
  const classes = switchClassNames(checked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={classes.row}
      onClick={() => onChange(!checked)}
    >
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint === undefined ? null : (
          <span className="block text-control text-muted">{hint}</span>
        )}
      </span>
      <span className={classes.track} aria-hidden="true">
        <span className={classes.thumb} />
      </span>
    </button>
  );
}
