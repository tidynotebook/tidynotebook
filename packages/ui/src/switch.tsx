import { useId, type ReactNode } from 'react';
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
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={hint === undefined ? undefined : hintId}
      disabled={disabled}
      className={classes.row}
      onClick={() => onChange(!checked)}
    >
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint === undefined ? null : (
          <span id={hintId} className="block text-control text-muted">
            {hint}
          </span>
        )}
      </span>
      <span className={classes.track} aria-hidden="true">
        <span className={classes.thumb} />
      </span>
    </button>
  );
}
