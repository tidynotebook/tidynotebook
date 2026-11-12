/** Readable inline diagrams and one action to inspect the full vector drawing. */
import { buttonClassName, diagramBlockClasses } from '@notesapp/ui';
import {
  createDiagramFrame,
  diagramLimits,
  inlineDiagramScale,
  type DiagramFrameOptions,
  type DiagramSize,
} from './frame.ts';
export { diagramFramePath } from './frame.ts';

export function createDiagramWidget(options: DiagramFrameOptions): {
  readonly element: HTMLDivElement;
  readonly dispose: () => void;
} {
  const element = document.createElement('div');
  element.className = diagramBlockClasses.outer;
  const header = document.createElement('div');
  header.className = diagramBlockClasses.header;
  const caption = document.createElement('span');
  caption.className = diagramBlockClasses.caption;
  caption.textContent = 'Diagram';
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = buttonClassName({ variant: 'ghost' });
  expand.textContent = 'Expand';
  expand.setAttribute('aria-label', 'Expand diagram');
  expand.setAttribute('data-diagram-action', '');
  expand.disabled = true;
  header.append(caption, expand);
  const body = document.createElement('div');
  body.className = diagramBlockClasses.body;
  const viewport = document.createElement('div');
  viewport.className = diagramBlockClasses.viewport;
  viewport.setAttribute('data-diagram-scroll', '');
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Diagram');
  viewport.tabIndex = 0;
  const side = document.createElement('div');
  side.className = diagramBlockClasses.horizontalCue;
  side.setAttribute('aria-hidden', 'true');
  side.hidden = true;
  const bottom = document.createElement('div');
  bottom.className = diagramBlockClasses.verticalCue;
  bottom.setAttribute('aria-hidden', 'true');
  bottom.hidden = true;
  body.append(viewport, side, bottom);
  element.append(header, body);
  let disposed = false,
    ready = false,
    opening = false;
  let natural: DiagramSize | null = null;
  let closeViewer: (() => void) | null = null;
  const cue = (): void => {
    side.hidden =
      viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
  };
  const update = (): void => {
    if (disposed || !natural || viewport.clientWidth <= 0) return;
    const scale = inlineDiagramScale(natural, viewport.clientWidth);
    frame.setScale(scale);
    bottom.hidden =
      natural.height * scale + natural.paddingY * 2 <=
      Math.min(diagramLimits.maxHeightPx, viewport.clientHeight);
    cue();
  };
  const frame = createDiagramFrame({
    ...options,
    onSize: (size) => {
      natural = size;
      update();
      options.onSize?.(size);
    },
    onStatus: (state) => {
      ready = state === 'ready';
      expand.disabled = !ready || opening;
      options.onStatus?.(state);
    },
  });
  viewport.append(frame.element);
  viewport.addEventListener('scroll', cue, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(viewport);
  expand.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  expand.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (disposed || opening || closeViewer || !ready) return;
    opening = true;
    expand.disabled = true;
    expand.setAttribute('aria-busy', 'true');
    void import('./viewer.tsx')
      .then(({ openDiagramViewer }) => {
        if (disposed) return;
        caption.textContent = 'Diagram';
        caption.removeAttribute('role');
        closeViewer = openDiagramViewer({
          source: options.source,
          theme: options.theme,
          framePath: options.framePath,
          returnFocus: () => {
            if (expand.isConnected) expand.focus({ preventScroll: true });
          },
          onClosed: () => {
            closeViewer = null;
          },
        });
      })
      .catch(() => {
        if (disposed) return;
        caption.textContent = 'The viewer did not load. Try again.';
        caption.setAttribute('role', 'status');
      })
      .finally(() => {
        opening = false;
        expand.disabled = !ready;
        expand.removeAttribute('aria-busy');
      });
  });
  return {
    element,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      viewport.removeEventListener('scroll', cue);
      closeViewer?.();
      closeViewer = null;
      frame.dispose();
      element.remove();
    },
  };
}
