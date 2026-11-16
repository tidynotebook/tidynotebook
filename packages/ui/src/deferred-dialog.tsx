/** Load an action on demand while its modal frame and focus remain available. */
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  useId,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Dialog, DialogBody, type DialogWidth } from './dialog.tsx';
import { LoadingState } from './loading.tsx';
import { DeferredDialogOpener } from './dialog-layout-context.ts';

export function DialogLoading({
  title,
  width = 'small',
  onClose,
}: {
  readonly title: string;
  readonly width?: DialogWidth;
  readonly onClose: () => void;
}): ReactNode {
  const id = useId();
  return (
    <Dialog
      open
      title={title}
      titleId={id}
      width={width}
      onClose={onClose}
      returnFocus={() => {}}
    >
      <DialogBody>
        <LoadingState
          shape="list"
          rows={3}
          label={`Loading ${title.toLowerCase()}`}
        />
      </DialogBody>
    </Dialog>
  );
}

export function deferredDialog<
  Props extends { readonly open: boolean; readonly onClose: () => void },
>(
  load: () => Promise<{ default: ComponentType<Props> }>,
  title: string,
  width: DialogWidth = 'small',
): ComponentType<Props> & {
  readonly preload: () => Promise<{ default: ComponentType<Props> }>;
} {
  let pending: Promise<{ default: ComponentType<Props> }> | undefined;
  const preload = () => {
    if (pending) return pending;
    const request = load();
    pending = request;
    // An intent is not an action. A failed preload can retry when selected.
    void request.catch(() => {
      if (pending === request) pending = undefined;
    });
    return request;
  };
  const Content = lazy(preload);
  function DeferredDialog(props: Props): ReactNode {
    // Some actions finish their work after the frame closes, such as creating
    // a note from a chosen template. Keep that loaded action mounted.
    const [used, setUsed] = useState(props.open);
    useEffect(() => {
      if (props.open) setUsed(true);
    }, [props.open]);
    const opener = useMemo(
      () =>
        props.open &&
        typeof document !== 'undefined' &&
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      [props.open],
    );
    if (!props.open && !used) return null;
    return (
      <DeferredDialogOpener.Provider value={opener}>
        <Suspense
          fallback={
            props.open ? (
              <DialogLoading
                title={title}
                width={width}
                onClose={props.onClose}
              />
            ) : null
          }
        >
          <Content {...props} />
        </Suspense>
      </DeferredDialogOpener.Provider>
    );
  }
  return Object.assign(DeferredDialog, { preload });
}
