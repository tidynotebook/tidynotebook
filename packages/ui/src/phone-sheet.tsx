/** The header used by every phone sheet, including template details. */
import type { ReactNode, Ref } from 'react';
import { Button } from './controls.tsx';
import { CloseIcon } from './icons.tsx';

export function PhoneSheetHeader({
  title,
  titleId,
  titleRef,
  onClose,
  leading,
  trailing,
}: {
  readonly title: ReactNode;
  readonly titleId?: string;
  readonly titleRef?: Ref<HTMLHeadingElement>;
  readonly onClose: () => void;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
}): ReactNode {
  return (
    <header
      data-sheet-drag=""
      className="ui-sheet-header flex shrink-0 touch-pan-x items-center gap-1 px-1"
    >
      <span className="flex size-11 shrink-0 items-center justify-center">
        {leading ?? (
          <Button
            variant="ghost"
            icon={<CloseIcon />}
            label="Close dialog"
            onClick={onClose}
          />
        )}
      </span>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="m-0 min-w-0 flex-1 truncate text-center text-title-header text-strong outline-none"
      >
        {title}
      </h2>
      <span className="flex size-11 shrink-0 items-center justify-center">
        {trailing}
      </span>
    </header>
  );
}
