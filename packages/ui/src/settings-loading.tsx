/** The Settings frame stays in place while its sections load. */
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Dialog } from './dialog.tsx';
import { ContentHeader, HeaderSlot, HeaderTitle } from './content-header.tsx';
import { IconButton } from './icon-button.tsx';
import { ChevronLeftIcon, CloseIcon } from './icons.tsx';
import { LoadingState } from './loading.tsx';
import { Inline, Stack } from './primitives.tsx';
import { settingsContentClassName } from './settings-layout.tsx';

export function SettingsLoading({
  listLevel,
  onBack,
  onClose,
}: {
  readonly listLevel: boolean;
  readonly onBack: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const id = useId();
  const listTitle = useRef<HTMLDivElement>(null);
  const previousList = useRef(listLevel);
  useLayoutEffect(() => {
    if (listLevel && !previousList.current) listTitle.current?.focus();
    previousList.current = listLevel;
  }, [listLevel]);
  return (
    <Dialog
      open
      title="Settings"
      titleId={id}
      hideTitle
      width="settings"
      onClose={onClose}
      returnFocus={() => {}}
    >
      <span role="status" aria-busy="true" className="sr-only">
        Loading settings
      </span>
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        <div
          className={`${listLevel ? 'flex' : 'hidden'} bg-card overflow-hidden flex-1 flex-col lg:flex lg:w-60 lg:flex-none lg:border-r lg:border-edge-subtle`}
        >
          <ContentHeader padX={4} className="fine:h-8 lg:hidden">
            <HeaderSlot side="leading" aria-hidden="true" />
            <HeaderTitle
              ref={listTitle}
              tabIndex={-1}
              className="text-center text-title-header text-strong outline-none"
            >
              Settings
            </HeaderTitle>
            <HeaderSlot side="trailing">
              <IconButton
                size="header"
                glyph={<CloseIcon />}
                label="Close Settings"
                onClick={onClose}
              />
            </HeaderSlot>
          </ContentHeader>
          <Stack pad={{ fine: 2, coarse: 4 }} aria-hidden="true">
            <LoadingState label="" shape="list" rows={7} />
          </Stack>
        </div>
        <Stack
          gap={0}
          className={`${listLevel ? 'hidden' : 'flex'} min-w-0 flex-1 overflow-hidden lg:flex`}
        >
          <ContentHeader
            padX={{ fine: 6, coarse: 1 }}
            padY={{ fine: 6, coarse: 4 }}
          >
            <HeaderSlot
              side="leading"
              targetWidth
              className="self-start lg:hidden"
            >
              <IconButton
                size="header"
                glyph={<ChevronLeftIcon />}
                label="Back to Settings"
                onClick={onBack}
              />
            </HeaderSlot>
            <Stack gap={1} className="min-w-0 flex-1">
              <Inline gap={2} justify="between">
                <HeaderTitle
                  align="start"
                  className="text-title-header text-strong"
                >
                  Settings
                </HeaderTitle>
              </Inline>
              <div
                aria-hidden="true"
                className="h-5 w-1/2 rounded-md bg-hover motion-safe:animate-pulse"
              />
            </Stack>
            <HeaderSlot side="trailing" targetWidth className="self-start">
              <IconButton
                size="header"
                glyph={<CloseIcon />}
                label="Close Settings"
                onClick={onClose}
              />
            </HeaderSlot>
          </ContentHeader>
          <Stack
            padX={{ fine: 6, coarse: 4 }}
            className={settingsContentClassName()}
            aria-hidden="true"
          >
            <LoadingState label="" rows={4} />
          </Stack>
        </Stack>
      </div>
    </Dialog>
  );
}
