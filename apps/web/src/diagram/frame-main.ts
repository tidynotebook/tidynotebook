/**
 * The frame side of the diagram renderer.
 *
 * This module is the entry point of `frame.html` and runs inside the
 * sandboxed iframe. The sandbox has no `allow-same-origin`, so the frame has
 * an opaque origin and every request it makes is cross origin. That is why
 * Mermaid is imported statically here and the build inlines this whole
 * module into the frame document: a self-contained page needs no network at
 * all, so no chunk can be refused (QA-04).
 *
 * The frame imports the one stylesheet of the application, as `main.tsx`
 * does, and the build writes it into the frame document with its faces, so
 * the frame sets its text in the face of the page (record 0061).
 *
 * The frame renders one source request. Later numeric scale messages resize
 * that drawing. Every message carries its request identifier.
 */
import mermaid from 'mermaid';
import { diagramBlockClasses } from '@notesapp/ui';
import '../tailwind.css';
import {
  diagramFontVariable,
  diagramLimits,
  diagramThemeOptions,
  drawnHeight,
  diagramSourceAllowed,
  isDiagramScaleRequest,
  isParentMessage,
  isDiagramRequest,
  paletteNames,
  type DiagramRequest,
  type DiagramResponse,
} from './frame.ts';

/**
 * Paints the frame with the palette that the request carries.
 *
 * The frame holds no colour of its own, so a new theme reaches it with no
 * change here. Every value was checked as a hex colour before it arrives.
 */
function paint(request: DiagramRequest): void {
  const element = document.documentElement;
  element.setAttribute('data-theme', request.theme);
  paletteNames.forEach((name, index) => {
    element.style.setProperty(name, request.palette[index] ?? '');
  });
  // The page plane paints only once the palette is in place, so a frame
  // that waits for its request shows the page behind it.
  document.body.classList.add('bg-app');
  document.body.classList.toggle(
    diagramBlockClasses.framePadding,
    request.expanded !== true,
  );
}

/**
 * The face of the page, loaded before Mermaid measures a label.
 *
 * Mermaid sizes each box from the width of its text when it draws, so a face
 * that arrives after the drawing leaves a label wider than its box. The face
 * travels inside the frame document, so the load reads no network.
 */
async function pageFace(source: string): Promise<string> {
  const family = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(diagramFontVariable)
    .trim();
  if (family === '') return family;
  await document.fonts.load(`1rem ${family}`, source);
  await document.fonts.ready;
  return family;
}

type Drawing = {
  readonly requestId: string;
  readonly svg: SVGSVGElement;
  readonly width: number;
  readonly height: number;
};

function scaleDrawing(drawing: Drawing, scale: number): void {
  drawing.svg.style.maxWidth = 'none';
  drawing.svg.style.display = 'block';
  drawing.svg.setAttribute('width', String(drawing.width * scale));
  drawing.svg.setAttribute('height', String(drawing.height * scale));
}

function answer(drawing: Drawing): void {
  const response: DiagramResponse = {
    requestId: drawing.requestId,
    ok: true,
    height: Math.min(diagramLimits.maxHeightPx * 2, drawnHeight(document.body)),
    width: Math.ceil(document.body.getBoundingClientRect().width),
    naturalWidth: drawing.width,
    naturalHeight: drawing.height,
    paddingX: Number.parseFloat(getComputedStyle(document.body).paddingLeft),
    paddingY: Number.parseFloat(getComputedStyle(document.body).paddingTop),
  };
  window.parent.postMessage(response, '*');
}

/** Render once. Later zoom messages resize the SVG without parsing it again. */
async function render(request: DiagramRequest): Promise<Drawing> {
  if (!diagramSourceAllowed(request.source))
    throw Error('Diagram configuration is fixed.');
  paint(request);
  const themed = diagramThemeOptions(request, await pageFace(request.source));
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    maxTextSize: diagramLimits.maxSourceChars,
    theme: themed.theme,
    look: themed.look,
    darkMode: themed.darkMode,
    fontFamily: themed.fontFamily,
    themeVariables: { ...themed.themeVariables },
  });
  const id = `notes-diagram-${request.requestId.replace(/[^a-zA-Z0-9-]/g, '')}`;
  const outcome = await mermaid.render(id, request.source);
  const host = document.getElementById('notes-diagram-host');
  if (!host) throw Error('The diagram host is missing.');
  host.innerHTML = outcome.svg;
  const svg = host.querySelector('svg');
  if (!svg) throw Error('The diagram has no drawing.');
  const box =
    svg.viewBox.baseVal.width > 0 ? svg.viewBox.baseVal : svg.getBBox();
  const width = box.width,
    height = box.height;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > diagramLimits.maxNaturalPx ||
    height > diagramLimits.maxNaturalPx
  )
    throw Error('The diagram dimensions are not supported.');
  const drawing: Drawing = { requestId: request.requestId, svg, width, height };
  const padding =
    Number.parseFloat(getComputedStyle(document.body).paddingLeft) * 2;
  scaleDrawing(
    drawing,
    Math.min(1, Math.max(1, window.innerWidth - padding) / width),
  );
  return drawing;
}

/** Shows the source in the frame and answers that rendering failed. */
function fail(requestId: string, message: string, source: string): void {
  const host = document.getElementById('notes-diagram-host');
  if (host !== null) {
    host.textContent = '';
    const note = document.createElement('p');
    note.textContent = message;
    host.appendChild(note);
    const code = document.createElement('pre');
    code.className = 'font-mono whitespace-pre-wrap';
    code.textContent = source;
    host.appendChild(code);
  }
  const response: DiagramResponse = {
    requestId,
    ok: false,
    height: diagramLimits.minHeightPx,
  };
  window.parent.postMessage(response, '*');
}

/**
 * Starts the frame and waits for exactly one request.
 *
 * The listener is registered with `{ once: true }`, so a second request is
 * never rendered. An invalid message is not a request, so the listener stays
 * registered until a valid one arrives. A message that does not come from the
 * parent of the frame is no request either, and a frame with no parent takes
 * none.
 */
export function startDiagramFrame(): void {
  let drawing: Drawing | null = null;
  let expired = false;
  window.addEventListener('message', (event: MessageEvent): void => {
    if (
      expired ||
      !drawing ||
      !isParentMessage(window, event.source) ||
      !isDiagramScaleRequest(event.data) ||
      event.data.requestId !== drawing.requestId
    )
      return;
    scaleDrawing(drawing, event.data.scale);
    answer(drawing);
  });
  const onMessage = (event: MessageEvent): void => {
    if (
      !isParentMessage(window, event.source) ||
      !isDiagramRequest(event.data)
    ) {
      window.addEventListener('message', onMessage, { once: true });
      return;
    }
    const request = event.data;
    const timer = window.setTimeout(() => {
      expired = true;
      fail(request.requestId, 'Diagram rendering timed out.', request.source);
    }, diagramLimits.maxRenderMs);
    void render(request)
      .then((result) => {
        if (expired) return;
        drawing = result;
        answer(result);
      })
      .catch(() => {
        if (expired) return;
        expired = true;
        fail(
          request.requestId,
          'This diagram cannot be rendered.',
          request.source,
        );
      })
      .finally(() => window.clearTimeout(timer));
  };
  window.addEventListener('message', onMessage, { once: true });
}

startDiagramFrame();
