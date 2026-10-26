import { useRef, useState, type ReactNode } from 'react';
import { Tooltip } from './tooltip.tsx';
import {
  historyButtonClassName,
  historyButtonName,
} from './control-classes.ts';
import { UndoIcon, RedoIcon } from './icons.tsx';

/** A named history action with a tooltip on pointer and keyboard focus. */
export function HistoryButton({
  action,
  available,
  apple,
  tabIndex,
  onClick,
}: {
  readonly action: 'undo' | 'redo';
  readonly available: boolean;
  readonly apple: boolean;
  readonly tabIndex: number;
  readonly onClick: () => void;
}): ReactNode {
  const name = historyButtonName(action, apple);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        ref={buttonRef}
        onPointerEnter={() => {
          setHovered(true);
          setHidden(false);
        }}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => {
          setFocused(true);
          setHidden(false);
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setHidden(true);
        }}
        type="button"
        className={historyButtonClassName(!available)}
        aria-label={name.label}
        aria-disabled={!available}
        tabIndex={tabIndex}
        onClick={() => {
          if (available) onClick();
        }}
      >
        {action === 'undo' ? <UndoIcon /> : <RedoIcon />}
      </button>
      {(hovered || focused) && !hidden && buttonRef.current !== null ? (
        <Tooltip text={name.tooltip} anchor={buttonRef.current} />
      ) : null}
    </span>
  );
}
