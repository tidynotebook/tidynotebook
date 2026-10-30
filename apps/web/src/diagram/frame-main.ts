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
 * The frame answers exactly one request. A second message is ignored, and
 * every answer carries the request identifier back, so a stray frame cannot
 * answer for this one.
 */
import mermaid from 'mermaid';
import '../tailwind.css';
import {
  diagramFontVariable,
  diagramLimits,
  diagramThemeOptions,
  drawnHeight,
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

/** Renders one validated request and answers with its height. */
async function render(request: DiagramRequest): Promise<void> {
  paint(request);
  // The colours come from the palette of the request, in light and in dark,
  // so a diagram takes the theme of the page and never one of Mermaid.
  const themed = diagramThemeOptions(request, await pageFace(request.source));
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: themed.theme,
    look: themed.look,
    darkMode: themed.darkMode,
    fontFamily: themed.fontFamily,
    themeVariables: { ...themed.themeVariables },
  });
  const id = `notes-diagram-${request.requestId.replace(/[^a-zA-Z0-9-]/g, '')}`;
  const outcome = await mermaid.render(id, request.source);
  const host = document.getElementById('notes-diagram-host');
  if (host === null) throw new Error('The diagram host is missing.');
  host.innerHTML = outcome.svg;
  const response: DiagramResponse = {
    requestId: request.requestId,
    ok: true,
    height: drawnHeight(document.body),
  };
  window.parent.postMessage(response, '*');
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
      fail(request.requestId, 'Diagram rendering timed out.', request.source);
    }, diagramLimits.maxRenderMs);
    void render(request)
      .catch(() => {
        fail(
          request.requestId,
          'This diagram cannot be rendered.',
          request.source,
        );
      })
      .finally(() => {
        window.clearTimeout(timer);
      });
  };
  window.addEventListener('message', onMessage, { once: true });
}

startDiagramFrame();
