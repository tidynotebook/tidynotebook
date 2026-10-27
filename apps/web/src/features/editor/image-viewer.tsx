/**
 * The image viewer of a note (record 0145).
 *
 * A press on a picture of the note opens it here, in the one dialog of
 * `@notesapp/ui`. The picture stands on the scrim with no panel around it,
 * and one raised bar of tools floats over it, so the picture takes the whole
 * screen. A press on the scrim beside the picture closes the viewer, as
 * Escape and Close do. The picture fits the screen first. The zoom buttons, the
 * `+`, `-` and `0` keys, and the wheel with Ctrl or Cmd held zoom it, and a
 * drag with the mouse moves a zoomed picture. The actions are the ones the
 * page can do with that picture: a picture of the workspace is copied and
 * downloaded, and a picture of another host gives its link and its original.
 *
 * `lib/image-viewer.ts` holds every rule of that. This module turns the rules
 * into elements and browser calls, and it reads the bytes only from the blob
 * address the editor already shows, so it starts no request of its own.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { ImageOpenRequest } from '@notesapp/editor';
import {
  Button,
  buttonClassName,
  CloseIcon,
  CopyIcon,
  Dialog,
  DownloadIcon,
  ExternalLinkIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@notesapp/ui';
import {
  actionNeedsPicture,
  closesOnRelease,
  fitZoom,
  imageActionLabels,
  imageActionMessages,
  imageActions,
  imageDownloadName,
  imageTitle,
  lowestZoom,
  wheelZoom,
  zoomIn,
  zoomKey,
  zoomLimits,
  zoomOut,
  zoomPercent,
  zoomedSize,
  viewerStatus,
  type ImageAction,
  type ImageSize,
} from '../../lib/image-viewer.ts';
import { canCopyImage, copyPngImage, copyText } from '../../platform.ts';

/** The viewer of one picture, or nothing while no picture is open. */
export function ImageViewer({
  image,
  onClose,
  returnFocus,
  onRemoved,
}: {
  readonly onRemoved?: () => void;
  readonly image: ImageOpenRequest | null;
  readonly returnFocus: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const titleId = useId();
  // The dialog keeps the heading for assistive software, and the bar of tools
  // shows the name of the picture where the screen has room for it.
  return (
    <Dialog
      open={image !== null}
      onClose={onClose}
      title={imageTitle(image?.alt ?? '')}
      titleId={titleId}
      returnFocus={returnFocus}
      width="screen"
    >
      {image === null ? null : (
        <ImageViewerBody
          key={image.url}
          image={image}
          onClose={onClose}
          onRemoved={onRemoved}
        />
      )}
    </Dialog>
  );
}

/** The zoom a person chose: the fit of the screen, or one fixed scale. */
type Zoom =
  { readonly kind: 'fit' } | { readonly kind: 'scale'; readonly value: number };

const fit: Zoom = { kind: 'fit' };

/** Where one press on the room of the picture started. */
type PressStart = {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly left: number;
  readonly top: number;
  /** True when the press drags a zoomed picture. */
  readonly pan: boolean;
  /** True when the press started on the scrim and not on the picture. */
  readonly onScrim: boolean;
};

/** Encodes the shown picture as one PNG, the one type a clipboard takes. */
function pngOf(picture: HTMLImageElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = picture.naturalWidth;
    canvas.height = picture.naturalHeight;
    const context = canvas.getContext('2d');
    if (context === null || canvas.width === 0 || canvas.height === 0) {
      reject(new Error('notesapp image viewer: the picture has no pixels'));
      return;
    }
    context.drawImage(picture, 0, 0);
    canvas.toBlob((blob) => {
      if (blob === null)
        reject(new Error('notesapp image viewer: the encode failed'));
      else resolve(blob);
    }, 'image/png');
  });
}

/** Saves the bytes of one blob address under a name. */
function saveAs(url: string, name: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/** The icon of one action. */
function actionIcon(action: ImageAction): ReactNode {
  if (action === 'download') return <DownloadIcon />;
  if (action === 'open') return <ExternalLinkIcon />;
  return <CopyIcon />;
}

/** The room inside the padding of one element. */
function contentBox(element: HTMLElement): ImageSize {
  const style = getComputedStyle(element);
  const across =
    Number.parseFloat(style.paddingLeft) +
    Number.parseFloat(style.paddingRight);
  const down =
    Number.parseFloat(style.paddingTop) +
    Number.parseFloat(style.paddingBottom);
  return {
    width: Math.max(0, element.clientWidth - across),
    height: Math.max(0, element.clientHeight - down),
  };
}

/** The tools and the picture of one open viewer. */
function ImageViewerBody({
  image,
  onClose,
  onRemoved,
}: {
  readonly onRemoved?: (() => void) | undefined;
  readonly image: ImageOpenRequest;
  readonly onClose: () => void;
}): ReactNode {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pictureRef = useRef<HTMLImageElement | null>(null);
  const pressRef = useRef<PressStart | null>(null);
  const [natural, setNatural] = useState<ImageSize | null>(null);
  const [room, setRoom] = useState<ImageSize>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<Zoom>(fit);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');

  const fitted = natural === null ? 1 : fitZoom(natural, room);
  const scale = zoom.kind === 'fit' ? fitted : zoom.value;
  // The fit of a very large picture can be below the smallest step, and the
  // zoom out reaches it there.
  const lowest = lowestZoom(fitted);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const lowestRef = useRef(lowest);
  lowestRef.current = lowest;
  const size = natural === null ? null : zoomedSize(natural, scale);
  const overflows =
    size !== null && (size.width > room.width || size.height > room.height);

  // The room of the picture follows the screen, so the fit follows a turn of
  // a phone and a resize of the window.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    const measure = (): void => {
      setRoom(contentBox(scroller));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => {
      observer.disconnect();
    };
  }, []);

  // The wheel with Ctrl or Cmd held zooms the picture and not the page. A
  // React wheel handler is passive and cannot keep the page zoom away, so
  // this listener is added by hand.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom({
        kind: 'scale',
        value: wheelZoom(scaleRef.current, event.deltaY, lowestRef.current),
      });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
    };
  }, []);

  const zoomTo = (value: number): void => {
    setZoom({ kind: 'scale', value });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = zoomKey(event.key);
    if (step === null) return;
    event.preventDefault();
    if (step === 'fit') setZoom(fit);
    else zoomTo(step === 'in' ? zoomIn(scale) : zoomOut(scale, lowest));
  };

  // A press with the mouse drags a zoomed picture. A press on the scrim that
  // does not travel is a tap, and a tap on the scrim closes the viewer.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const scroller = scrollerRef.current;
    if (scroller === null || event.button !== 0) return;
    const pan = overflows && event.pointerType !== 'touch';
    if (pan) {
      event.preventDefault();
      scroller.setPointerCapture(event.pointerId);
    }
    pressRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
      pan,
      onScrim: event.target === event.currentTarget,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const scroller = scrollerRef.current;
    const start = pressRef.current;
    if (scroller === null || start?.pointerId !== event.pointerId) return;
    if (!start.pan) return;
    scroller.scrollLeft = start.left - (event.clientX - start.x);
    scroller.scrollTop = start.top - (event.clientY - start.y);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const start = pressRef.current;
    pressRef.current = null;
    if (start?.pointerId !== event.pointerId) return;
    if (
      closesOnRelease({
        onScrim: start.onScrim,
        dx: event.clientX - start.x,
        dy: event.clientY - start.y,
      })
    )
      onClose();
  };

  const endPress = (): void => {
    pressRef.current = null;
  };

  const run = (action: ImageAction): void => {
    if (action === 'download') {
      saveAs(image.url, imageDownloadName(image.destination, image.alt));
      return;
    }
    if (action === 'copy-link') {
      void copyText(image.url).then((done) => {
        setMessage(
          done
            ? imageActionMessages.copiedLink
            : imageActionMessages.copyLinkFailed,
        );
      });
      return;
    }
    const picture = pictureRef.current;
    if (picture === null) return;
    // A page with no clipboard for pictures, such as one served over plain
    // HTTP, never draws the picture: a full size canvas of a large photo
    // costs memory for a copy that cannot happen.
    if (!canCopyImage()) {
      setMessage(imageActionMessages.copyImageFailed);
      return;
    }
    void copyPngImage(pngOf(picture)).then((done) => {
      setMessage(
        done
          ? imageActionMessages.copiedImage
          : imageActionMessages.copyImageFailed,
      );
    });
  };

  const status = viewerStatus({ failed, message });
  // The zoom means nothing until the picture states its size, so the tools
  // wait for it and no percentage shows that the picture does not have.
  const idle = failed || natural === null;

  return (
    <div className="relative h-full w-full" onKeyDown={onKeyDown}>
      <div
        ref={scrollerRef}
        className={`flex h-full w-full overflow-auto overscroll-contain p-6 ${overflows ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endPress}
      >
        {failed ? null : (
          <img
            ref={pictureRef}
            className={`m-auto max-w-none shrink-0 select-none ${size === null ? 'invisible' : ''}`}
            src={image.url}
            alt={image.alt}
            width={size?.width}
            height={size?.height}
            draggable={false}
            referrerPolicy={image.external ? 'no-referrer' : undefined}
            onLoad={(event): void => {
              const picture = event.currentTarget;
              setNatural({
                width: picture.naturalWidth,
                height: picture.naturalHeight,
              });
            }}
            onError={(): void => {
              setFailed(true);
            }}
          />
        )}
      </div>
      {/*
        The one bar of tools floats over the picture. It is a raised surface,
        so it reads on a light picture and on a dark one alike.
      */}
      <div className="absolute inset-x-3 top-3 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-lg border border-edge-subtle bg-card p-1 text-strong shadow-overlay">
        <p className="m-0 hidden max-w-xs truncate px-2 text-control font-medium md:block">
          {imageTitle(image.alt)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          label="Zoom out"
          icon={<ZoomOutIcon />}
          disabled={idle || scale <= lowest}
          onClick={() => {
            zoomTo(zoomOut(scale, lowest));
          }}
        />
        <span className="w-12 text-center text-control tabular-nums text-muted">
          {idle ? '' : zoomPercent(scale)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          label="Zoom in"
          icon={<ZoomInIcon />}
          disabled={idle || scale >= zoomLimits.max}
          onClick={() => {
            zoomTo(zoomIn(scale));
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={idle || zoom.kind === 'fit'}
          onClick={() => {
            setZoom(fit);
          }}
        >
          Fit
        </Button>
        {imageActions(image.external).map((action) =>
          action === 'open' ? (
            <a
              key={action}
              className={buttonClassName({
                variant: 'ghost',
                size: 'sm',
                iconOnly: true,
              })}
              href={image.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              aria-label={imageActionLabels[action]}
              title={imageActionLabels[action]}
            >
              {actionIcon(action)}
            </a>
          ) : (
            <Button
              key={action}
              variant="ghost"
              size="sm"
              label={imageActionLabels[action]}
              icon={actionIcon(action)}
              disabled={actionNeedsPicture(action) && idle}
              onClick={() => {
                run(action);
              }}
            />
          ),
        )}
        {image.remove === undefined ? null : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (image.remove?.() === true) {
                onRemoved?.();
                onClose();
              } else setMessage('This image changed. Open it again.');
            }}
          >
            Remove
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          label="Close"
          icon={<CloseIcon />}
          onClick={onClose}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-x-3 bottom-4 flex justify-center"
        role="status"
      >
        {status === '' ? null : (
          <p className="m-0 rounded-lg border border-edge-subtle bg-card px-3 py-2 text-control text-strong shadow-overlay">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
