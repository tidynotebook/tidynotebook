import {
  IconButton,
  Toolbar,
  Toast,
  CanvasImage,
  Inline,
  Inset,
  Button,
  buttonClassName,
  CloseIcon,
  CopyIcon,
  Dialog,
  DownloadIcon,
  ArrowRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@notesapp/ui';

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
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { ImageOpenRequest } from '@notesapp/editor';

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
          media={{ kind: 'image', image }}
          onClose={onClose}
          onRemoved={onRemoved}
        />
      )}
    </Dialog>
  );
}

/** A vector renderer shares the image viewer without returning markup from its frame. */
export type VectorViewContent = {
  readonly title: string;
  readonly render: (options: {
    readonly scale: number;
    readonly onSize: (size: ImageSize) => void;
    readonly onError: () => void;
  }) => ReactNode;
};

/** A vector drawing uses the same dialog, tools and input handling as images. */
export function VectorViewer({
  content,
  onClose,
  returnFocus,
}: {
  readonly content: VectorViewContent;
  readonly onClose: () => void;
  readonly returnFocus: () => void;
}): ReactNode {
  const titleId = useId();
  return (
    <Dialog
      open
      title={content.title}
      titleId={titleId}
      width="screen"
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <ImageViewerBody media={{ kind: 'vector', content }} onClose={onClose} />
    </Dialog>
  );
}

type ViewerMedia =
  | { readonly kind: 'image'; readonly image: ImageOpenRequest }
  | { readonly kind: 'vector'; readonly content: VectorViewContent };

/** The zoom a person chose: the fit of the screen, or one fixed scale. */
type Zoom =
  | { readonly kind: 'initial' }
  | { readonly kind: 'fit' }
  | { readonly kind: 'scale'; readonly value: number };

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
  if (action === 'open') return <ArrowRightIcon />;
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
  media,
  onClose,
  onRemoved,
}: {
  readonly onRemoved?: (() => void) | undefined;
  readonly media: ViewerMedia;
  readonly onClose: () => void;
}): ReactNode {
  const image = media.kind === 'image' ? media.image : null;
  const title =
    media.kind === 'image' ? imageTitle(media.image.alt) : media.content.title;
  const maximum = media.kind === 'vector' ? 4 : zoomLimits.max;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<{
    x: number;
    y: number;
    u: number;
    v: number;
  } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    distance: number;
    scale: number;
    u: number;
    v: number;
  } | null>(null);
  const touched = useRef(false);
  const pictureRef = useRef<HTMLImageElement | null>(null);
  const pressRef = useRef<PressStart | null>(null);
  const [natural, setNatural] = useState<ImageSize | null>(null);
  const [room, setRoom] = useState<ImageSize>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<Zoom>(
    media.kind === 'vector' ? { kind: 'initial' } : fit,
  );
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');

  const fitted = natural === null ? 1 : fitZoom(natural, room);
  const scale =
    zoom.kind === 'scale'
      ? zoom.value
      : zoom.kind === 'initial' && fitted < 0.625
        ? 1
        : fitted;
  const atFit =
    zoom.kind === 'fit' || (zoom.kind === 'initial' && fitted >= 0.625);
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

  // The floating tools reserve their measured height, so they do not cover content.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const controls = controlsRef.current?.firstElementChild;
    if (!scroller || !(controls instanceof HTMLElement)) return;
    const previous = scroller.style.paddingBlock;
    const base = Number.parseFloat(getComputedStyle(scroller).paddingTop);
    const measure = (): void => {
      scroller.style.paddingBlock = `${Math.max(base, controls.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + base / 2)}px`;
      setRoom(contentBox(scroller));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(controls);
    return () => {
      observer.disconnect();
      scroller.style.paddingBlock = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const scroller = scrollerRef.current;
    const canvas = canvasRef.current;
    if (!anchor || !scroller || !canvas) return;
    const box = canvas.getBoundingClientRect();
    scroller.scrollLeft += box.left + anchor.u * scale - anchor.x;
    scroller.scrollTop += box.top + anchor.v * scale - anchor.y;
    anchorRef.current = null;
  }, [scale, zoom]);

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
      const canvas = canvasRef.current;
      if (canvas) {
        const box = canvas.getBoundingClientRect();
        anchorRef.current = {
          x: event.clientX,
          y: event.clientY,
          u: (event.clientX - box.left) / scaleRef.current,
          v: (event.clientY - box.top) / scaleRef.current,
        };
      }
      setZoom({
        kind: 'scale',
        value: Math.min(
          maximum,
          wheelZoom(scaleRef.current, event.deltaY, lowestRef.current),
        ),
      });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
    };
  }, [maximum]);

  const zoomTo = (value: number, point?: { x: number; y: number }): void => {
    const canvas = canvasRef.current;
    const scroller = scrollerRef.current;
    if (canvas && scroller) {
      const bounds = scroller.getBoundingClientRect();
      const x = point?.x ?? bounds.left + bounds.width / 2;
      const y = point?.y ?? bounds.top + bounds.height / 2;
      const box = canvas.getBoundingClientRect();
      anchorRef.current = {
        x,
        y,
        u: (x - box.left) / scaleRef.current,
        v: (y - box.top) / scaleRef.current,
      };
    }
    setZoom({
      kind: 'scale',
      value: Math.min(maximum, Math.max(lowestRef.current, value)),
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = zoomKey(event.key);
    if (step === null) return;
    event.preventDefault();
    if (step === 'fit') setZoom(fit);
    else if (step === 'actual') zoomTo(1);
    else zoomTo(step === 'in' ? zoomIn(scale) : zoomOut(scale, lowest));
  };

  // Only the expanded viewer owns touch gestures. Inline diagrams retain
  // native note scrolling. A second contact starts a pinch around its midpoint.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const scroller = scrollerRef.current;
    if (!scroller || event.button !== 0) return;
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      scroller.setPointerCapture(event.pointerId);
      if (touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const canvas = canvasRef.current;
        if (a && b && canvas) {
          const box = canvas.getBoundingClientRect();
          pinch.current = {
            distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
            scale: scaleRef.current,
            u: ((a.x + b.x) / 2 - box.left) / scaleRef.current,
            v: ((a.y + b.y) / 2 - box.top) / scaleRef.current,
          };
          touched.current = true;
          pressRef.current = null;
        }
        event.preventDefault();
        return;
      }
    }
    const pan = overflows;
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
    if (!scroller) return;
    if (touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      const initial = pinch.current;
      const [a, b] = [...touches.current.values()];
      if (initial && a && b) {
        event.preventDefault();
        anchorRef.current = {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          u: initial.u,
          v: initial.v,
        };
        setZoom({
          kind: 'scale',
          value: Math.min(
            maximum,
            Math.max(
              lowestRef.current,
              (initial.scale * Math.hypot(b.x - a.x, b.y - a.y)) /
                initial.distance,
            ),
          ),
        });
        return;
      }
    }
    const start = pressRef.current;
    if (start?.pointerId !== event.pointerId || !start.pan) return;
    scroller.scrollLeft = start.left - (event.clientX - start.x);
    scroller.scrollTop = start.top - (event.clientY - start.y);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const scroller = scrollerRef.current;
    touches.current.delete(event.pointerId);
    pinch.current = null;
    if (touched.current) {
      const remaining = [...touches.current.entries()][0];
      if (remaining && scroller) {
        const [id, point] = remaining;
        pressRef.current = {
          pointerId: id,
          x: point.x,
          y: point.y,
          left: scroller.scrollLeft,
          top: scroller.scrollTop,
          pan: true,
          onScrim: false,
        };
      } else {
        pressRef.current = null;
        touched.current = false;
      }
      return;
    }
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
    touches.current.clear();
    pinch.current = null;
    touched.current = false;
  };

  const run = (action: ImageAction): void => {
    if (image === null) return;
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

  const status =
    media.kind === 'vector'
      ? failed
        ? 'The diagram did not load.'
        : natural === null
          ? 'Loading diagram'
          : ''
      : viewerStatus({ failed, message });
  // The zoom means nothing until the picture states its size, so the tools
  // wait for it and no percentage shows that the picture does not have.
  const idle = failed || natural === null;

  return (
    <div
      className={`relative h-full w-full ${media.kind === 'vector' ? 'bg-app' : ''}`}
      onKeyDown={onKeyDown}
    >
      <Inline
        as="div"
        pad={media.kind === 'vector' ? 4 : 6}
        ref={scrollerRef}
        align={media.kind === 'vector' && !atFit ? 'start' : 'safe-center'}
        justify={media.kind === 'vector' && !atFit ? 'start' : 'safe-center'}
        className={`flex h-full w-full touch-none overflow-auto overscroll-contain ${overflows ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endPress}
      >
        <div ref={canvasRef} className="shrink-0">
          {failed ? null : media.kind === 'vector' ? (
            media.content.render({
              scale,
              onSize: setNatural,
              onError: () => setFailed(true),
            })
          ) : (
            <CanvasImage
              ref={pictureRef}
              className={`max-w-none shrink-0 select-none ${size === null ? 'invisible' : ''}`}
              src={media.image.url}
              alt={media.image.alt}
              width={size?.width}
              height={size?.height}
              draggable={false}
              referrerPolicy={media.image.external ? 'no-referrer' : undefined}
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
      </Inline>
      {/*
        The one bar of tools floats over the picture. It is a raised surface,
        so it reads on a light picture and on a dark one alike.
      */}
      <div ref={controlsRef}>
        <Toolbar
          floating
          trailing={
            <IconButton
              variant="ghost"
              label="Close"
              glyph={<CloseIcon />}
              onClick={onClose}
            />
          }
        >
          <Inset
            padX={2}
            as="p"
            className="hidden max-w-xs truncate text-label md:block"
          >
            {title}
          </Inset>
          <IconButton
            variant="ghost"
            label="Zoom out"
            glyph={<ZoomOutIcon />}
            disabled={idle || scale <= lowest}
            onClick={() => {
              zoomTo(zoomOut(scale, lowest));
            }}
          />
          <Button
            variant="ghost"
            size="compact"
            className="w-14 tabular-nums aria-disabled:text-muted"
            disabled={idle}
            aria-disabled={scale === 1}
            label={`${zoomPercent(scale)}, reset zoom to 100%`}
            title="Reset zoom to 100%"
            onClick={() => {
              if (scale !== 1) zoomTo(1);
            }}
          >
            {idle ? '' : zoomPercent(scale)}
          </Button>
          <span className="sr-only" aria-live="polite">
            {idle ? '' : `Zoom ${zoomPercent(scale)}`}
          </span>
          <IconButton
            variant="ghost"
            label="Zoom in"
            glyph={<ZoomInIcon />}
            disabled={idle || scale >= maximum}
            onClick={() => {
              zoomTo(zoomIn(scale));
            }}
          />
          <Button
            variant="ghost"
            size="compact"
            disabled={idle || atFit}
            onClick={() => {
              setZoom(fit);
            }}
          >
            Fit
          </Button>
          {image === null
            ? null
            : imageActions(image.external).map((action) =>
                action === 'open' ? (
                  <a
                    key={action}
                    className={buttonClassName({
                      variant: 'ghost',
                      size: 'compact',
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
                  <IconButton
                    key={action}
                    variant="ghost"
                    label={imageActionLabels[action]}
                    glyph={actionIcon(action)}
                    disabled={actionNeedsPicture(action) && idle}
                    onClick={() => {
                      run(action);
                    }}
                  />
                ),
              )}
          {image?.remove === undefined ? null : (
            <Button
              variant="ghost"
              size="compact"
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
        </Toolbar>
      </div>
      {status === '' ? null : <Toast message={status} />}
    </div>
  );
}
