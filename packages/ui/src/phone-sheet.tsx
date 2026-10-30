/** One header for every level of a phone sheet. */
import type { ReactNode, Ref } from 'react';
import { IconButton } from './icon-button.tsx';
import { CloseIcon } from './icons.tsx';
import { ContentHeader, HeaderTitle, HeaderSlot } from './content-header.tsx';
import { Inline } from './primitives.tsx';
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
    <ContentHeader
      data-sheet-drag=""
      data-scroll-edge="above"
      padX={4}
      className="ui-sheet-header touch-pan-x touch-pinch-zoom"
    >
      <HeaderSlot>
        {leading ?? (
          <IconButton
            glyph={<CloseIcon />}
            size="header"
            label="Close dialog"
            onClick={onClose}
          />
        )}
      </HeaderSlot>
      <HeaderTitle>
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="truncate text-title-header text-strong outline-none"
        >
          {title}
        </h2>
      </HeaderTitle>
      <Inline justify="end" className="flex-1">
        <HeaderSlot>{trailing}</HeaderSlot>
      </Inline>
    </ContentHeader>
  );
}
