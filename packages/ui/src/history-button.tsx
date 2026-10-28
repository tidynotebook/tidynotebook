import { useRef, type ReactNode } from 'react';
import { useHistoryTooltip } from './history-tooltip.ts';
import { Tooltip } from './tooltip.tsx';
import {
  historyButtonClassName,
  historyButtonName,
  historyButtonVisualClassName,
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
  const tip = useHistoryTooltip();
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        ref={buttonRef}
        onPointerEnter={() => tip.enter('trigger')}
        onPointerLeave={() => tip.leave('trigger')}
        onFocus={() => tip.enter('focus')}
        onBlur={() => tip.leave('focus')}
        type="button"
        className={historyButtonClassName()}
        aria-label={name.label}
        aria-disabled={!available}
        tabIndex={tabIndex}
        onClick={() => {
          if (available) onClick();
        }}
      >
        <span className={historyButtonVisualClassName(!available)}>
          <span
            className="inline-flex items-center justify-center"
            aria-hidden="true"
          >
            {action === 'undo' ? <UndoIcon /> : <RedoIcon />}
          </span>
        </span>
      </button>
      {tip.visible && buttonRef.current !== null ? (
        <Tooltip
          text={name.tooltip}
          anchor={buttonRef.current}
          onPointerEnter={() => tip.enter('tooltip')}
          onPointerLeave={() => tip.leave('tooltip')}
        />
      ) : null}
    </span>
  );
}
