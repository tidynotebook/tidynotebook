/**
 * Isolated Mermaid diagram rendering.
 *
 * Diagrams render inside a sandboxed frame (`frame.html`) rather than in the
 * note itself. The parent keeps the Markdown source; the frame keeps the
 * diagram library. The two sides exchange only fixed message shapes, so
 * no arbitrary HTML ever travels back to the parent.
 *
 * What this module never does:
 *
 * - It never gives the frame an origin privilege. The iframe uses
 *   `sandbox="allow-scripts"` without `allow-same-origin`, so the frame
 *   cannot read the parent document, storage, or cookies even if a diagram
 *   source is hostile.
 * - It never lets a note control the renderer. The frame fixes its Mermaid
 *   configuration (`securityLevel: 'strict'`, no directives) and its input
 *   limits; the message carries only the source text and the theme name.
 * - It never waits forever or grows forever. The source length, the render
 *   time, and the frame height are all bounded, and a failure replaces the
 *   frame with editable source in the same pane.
 *
 * The built frame document contains the diagram engine. The parent side of
 * this module holds no diagram library.
 */
import { generateUUID } from '@notesapp/core';

/** The palette name the frame renders with. */
export type DiagramTheme = 'light' | 'dark';

/**
 * The built diagram frame document.
 *
 * The editor and the published page (record 0158) both load this one
 * document. A plain path string on purpose: it names a static Vite entry,
 * not an application API route, so it stays a literal instead of a
 * constructed URL. `apps/web/vite.config.ts` emits the frame at this path.
 */
export const diagramFramePath = '/src/diagram/frame.html';

/**
 * The source request that the parent sends to the frame.
 *
 * `requestId` matches one render; `source` is the raw Mermaid source without
 * the fence; `theme` is the appearance Mermaid renders with; `palette` holds
 * the colours of the theme in force, in the order of {@link paletteNames}.
 *
 * The palette travels with the request on purpose. The frame has an opaque
 * origin and reads no stylesheet of the page, so sending the values keeps
 * one palette for the page and the frame and leaves no colour in the frame
 * document to drift.
 */
export type DiagramRequest = {
  readonly requestId: string;
  readonly source: string;
  readonly theme: DiagramTheme;
  readonly palette: readonly string[];
  readonly expanded?: boolean;
};

/** The custom properties the frame paints itself with, in a fixed order. */
export const paletteNames: readonly string[] = [
  '--notes-bg',
  '--notes-surface',
  '--notes-text',
  '--notes-accent-text',
  '--notes-border',
];

/**
 * The custom property of the stylesheet that names the face of a diagram.
 *
 * `apps/web/src/tailwind.css` declares it, and the frame reads it from the
 * stylesheet that the build writes into the frame document, so a diagram is
 * set in the face of the page and no module names a family (record 0061).
 */
export const diagramFontVariable = '--font-sans';

/** The theme options that the frame gives Mermaid for one request. */
export type DiagramThemeOptions = {
  readonly theme: 'base';
  readonly look: 'classic';
  readonly darkMode: boolean;
  readonly fontFamily: string;
  readonly themeVariables: Readonly<Record<string, string>>;
};

/**
 * The Mermaid theme of one request, from the palette that it carries.
 *
 * Mermaid draws a node, an edge and a label in colours of its own theme,
 * the lavender of `default` in light and the greys of `dark`. The colours of
 * a diagram come from the theme registry instead, in both appearances: the
 * `base` theme of Mermaid takes every colour below from the palette of the
 * page, and derives the rest from them. A node is the chrome surface with the
 * component edge, as a code block is, the text is the text of the page, and
 * an edge is drawn in the component edge, which meets the 3 to 1 minimum of a
 * line a person must see (record 0063).
 *
 * A node has no shadow. A diagram is part of the page and not a raised
 * surface, so its fill and its edge separate it, as they separate a code
 * block. Mermaid puts a shadow on a node in two ways, and both are closed
 * here. The `neo` look, which a flowchart and a sequence diagram take by
 * default, adds a shadow filter whose colour Mermaid fixes and no palette
 * reaches, so the frame asks for the `classic` look. The `dropShadow` value
 * of the `base` theme is a light grey glow that some rules of the `classic`
 * look still read, and that a pale halo draws on a dark page, so the frame
 * sets it to `none`.
 *
 * The text is set in the face of the page. Mermaid reads the family in two
 * places: the option of the whole diagram, which sets the actors, the notes
 * and the messages of a sequence diagram, and the theme value, which sets
 * every other label. Both take the value of {@link diagramFontVariable}.
 *
 * @param fontFamily the value of {@link diagramFontVariable} in the frame.
 */
export function diagramThemeOptions(
  request: DiagramRequest,
  fontFamily: string,
): DiagramThemeOptions {
  const colour = (index: number): string => request.palette[index] ?? '';
  const background = colour(0);
  const surface = colour(1);
  const text = colour(2);
  const border = colour(4);
  return {
    theme: 'base',
    look: 'classic',
    darkMode: request.theme === 'dark',
    fontFamily,
    themeVariables: {
      dropShadow: 'none',
      fontFamily,
      background,
      mainBkg: surface,
      primaryColor: surface,
      primaryTextColor: text,
      primaryBorderColor: border,
      secondaryColor: surface,
      secondaryTextColor: text,
      secondaryBorderColor: border,
      tertiaryColor: background,
      tertiaryTextColor: text,
      tertiaryBorderColor: border,
      nodeBorder: border,
      nodeTextColor: text,
      textColor: text,
      titleColor: text,
      lineColor: border,
      clusterBkg: background,
      clusterBorder: border,
      edgeLabelBackground: background,
      noteBkgColor: surface,
      noteTextColor: text,
      noteBorderColor: border,
      actorBkg: surface,
      actorBorder: border,
      actorTextColor: text,
      actorLineColor: border,
      signalColor: text,
      signalTextColor: text,
      labelBoxBkgColor: surface,
      labelBoxBorderColor: border,
      labelTextColor: text,
      loopTextColor: text,
      sequenceNumberColor: background,
    },
  };
}

/** The part of a window that decides who may send the frame a request. */
export type DiagramFrameWindow = {
  readonly parent: unknown;
};

/**
 * Whether the frame takes a message as a request of its parent.
 *
 * The frame draws for the page that holds it and for no one else. A frame
 * document that a person opened at the top level has no parent, so it takes
 * no request at all, and a framed one takes a request from its own parent
 * only, never from a sibling frame or from a window that it opened.
 */
export function isParentMessage(
  frame: DiagramFrameWindow,
  source: unknown,
): boolean {
  return frame.parent !== frame && source === frame.parent;
}

/** True when a value is a six digit hex colour. */
function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** True when a value is the palette of one request. */
function isPalette(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length === paletteNames.length &&
    value.every(isHexColour)
  );
}

/**
 * The only message the frame sends to the parent.
 *
 * `requestId` echoes the request; `ok` reports whether rendering succeeded;
 * `height` is the content height in pixels for the parent to apply. A failed
 * render still answers with `ok: false` so the parent never waits forever.
 */
export type DiagramResponse = {
  readonly requestId: string;
  readonly ok: boolean;
  readonly height: number;
  readonly width?: number;
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
  readonly paddingX?: number;
  readonly paddingY?: number;
};

export type DiagramSize = {
  readonly width: number;
  readonly height: number;
  readonly paddingX: number;
  readonly paddingY: number;
};
export type DiagramScaleRequest = {
  readonly kind: 'scale';
  readonly requestId: string;
  readonly scale: number;
};

/** Only bounded numeric geometry can cross the sandbox boundary. */
export function isDiagramScaleRequest(
  value: unknown,
): value is DiagramScaleRequest {
  const scale = readProperty(value, 'scale');
  return (
    readProperty(value, 'kind') === 'scale' &&
    isBoundedString(readProperty(value, 'requestId'), 128) &&
    typeof scale === 'number' &&
    Number.isFinite(scale) &&
    scale >= 0.001 &&
    scale <= 4
  );
}

/**
 * The fixed resource limits of diagram rendering.
 *
 * Twenty thousand characters already hold a large graph. Eight seconds bound
 * one render without depending on machine load for the outcome: the same
 * source either renders inside the budget or falls back to source. The frame
 * height stays between a visible minimum and a maximum that keeps the note
 * scrollable.
 */
export const diagramLimits = {
  /** Largest accepted diagram source, in characters. */
  maxSourceChars: 20000,
  /** Longest accepted render, in milliseconds. */
  maxRenderMs: 8000,
  /**
   * Longest accepted load of the frame document, in milliseconds.
   *
   * The document holds the whole diagram engine inline, so a cold cache on a
   * slow link needs more than a render does. The clock stops on the `load`
   * event, and the render budget starts there.
   */
  maxLoadMs: 30000,
  /** Smallest applied frame height, in pixels. */
  minHeightPx: 40,
  /** Largest applied frame height, in pixels. */
  maxHeightPx: 800,
  /** Largest natural SVG dimension accepted from the sandbox. */
  maxNaturalPx: 32768,
} as const;

/** Inline text stays readable; a wide drawing scrolls instead of shrinking further. */
export function inlineDiagramScale(
  size: DiagramSize,
  availableWidth: number,
): number {
  const room = Number.isFinite(availableWidth)
    ? availableWidth - size.paddingX * 2
    : 0;
  return Math.max(0.75, Math.min(1, room / size.width));
}

/** The frame keeps its fixed configuration instead of taking note directives. */
export function diagramSourceAllowed(source: string): boolean {
  return (
    source.length <= diagramLimits.maxSourceChars &&
    !/%%\s*\{/.test(source) &&
    !/^\s*---(?:\r?\n|$)/.test(source)
  );
}

/** Reports whether a value is a non empty string inside a length cap. */
function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** Reads one property of an unknown value without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

/**
 * Reports whether an unknown value is a diagram request.
 *
 * Every field is checked: the request ID is a short non empty string, the
 * source is inside the character cap, the theme is exactly one of the two
 * appearances, and the palette is the expected count of hex colours.
 * Anything else is ignored, so a stray message from another frame cannot
 * start a render and no unchecked text reaches a style property.
 */
export function isDiagramRequest(value: unknown): value is DiagramRequest {
  const requestId = readProperty(value, 'requestId');
  const source = readProperty(value, 'source');
  const theme = readProperty(value, 'theme');
  const palette = readProperty(value, 'palette');
  const expanded = readProperty(value, 'expanded');
  return (
    isBoundedString(requestId, 128) &&
    typeof source === 'string' &&
    source.length <= diagramLimits.maxSourceChars &&
    (theme === 'light' || theme === 'dark') &&
    isPalette(palette) &&
    (expanded === undefined || typeof expanded === 'boolean')
  );
}

/**
 * Reports whether an unknown value is a diagram response.
 *
 * The height must be a finite number inside the applied bounds. A response
 * outside them is ignored, so a faulty frame cannot resize the note
 * arbitrarily.
 */
export function isDiagramResponse(value: unknown): value is DiagramResponse {
  const requestId = readProperty(value, 'requestId');
  const ok = readProperty(value, 'ok');
  const height = readProperty(value, 'height');
  const width = readProperty(value, 'width');
  const naturalWidth = readProperty(value, 'naturalWidth');
  const naturalHeight = readProperty(value, 'naturalHeight');
  const paddingX = readProperty(value, 'paddingX');
  const paddingY = readProperty(value, 'paddingY');
  const padding = (v: unknown): boolean =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 256;
  const dimension = (v: unknown, max: number): boolean =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max;
  return (
    isBoundedString(requestId, 128) &&
    typeof ok === 'boolean' &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height >= 0 &&
    height <= diagramLimits.maxHeightPx * 2 &&
    (width === undefined ||
      dimension(width, diagramLimits.maxNaturalPx * 4 + 32)) &&
    ((naturalWidth === undefined &&
      naturalHeight === undefined &&
      paddingX === undefined &&
      paddingY === undefined) ||
      (dimension(naturalWidth, diagramLimits.maxNaturalPx) &&
        dimension(naturalHeight, diagramLimits.maxNaturalPx) &&
        padding(paddingX) &&
        padding(paddingY)))
  );
}

/** The part of an element that the height of the frame reads. */
export type MeasuredElement = {
  getBoundingClientRect(): { readonly height: number };
};

/**
 * The height that the frame reports for what it drew.
 *
 * The frame measures its whole body, with the padding around the diagram,
 * and rounds up. It measured the host of the diagram alone, so the frame was
 * as tall as the diagram and the padding pushed the last rows of it out of
 * view: the lowest edge of a flowchart and the name under a sequence actor.
 *
 * @param body the body of the frame document.
 */
export function drawnHeight(body: MeasuredElement): number {
  return Math.ceil(body.getBoundingClientRect().height);
}

/** Clamps a reported height into the applied frame bounds. */
export function clampDiagramHeight(height: number): number {
  if (!Number.isFinite(height)) return diagramLimits.minHeightPx;
  if (height < diagramLimits.minHeightPx) return diagramLimits.minHeightPx;
  if (height > diagramLimits.maxHeightPx) return diagramLimits.maxHeightPx;
  return Math.round(height);
}

/**
 * One colour of the palette in the six digit form of a request.
 *
 * `applyTheme` writes each colour in six digits. A page with no script reads
 * its palette from the built stylesheet instead (record 0151), and the
 * minifier writes a colour such as `#ffffff` as `#fff`. The frame accepts six
 * digits alone, so the short form is written out here, and the light palette
 * of a published page reaches the frame like the dark one does.
 */
export function longHexColour(value: string): string {
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value);
  if (short === null) return value;
  return `#${(short[1] ?? '').repeat(2)}${(short[2] ?? '').repeat(2)}${(short[3] ?? '').repeat(2)}`;
}

/**
 * The colours the page renders with right now.
 *
 * `applyTheme` writes the whole palette on the document element, and the
 * stylesheet states it on a page with no script, so reading the computed
 * values here keeps the frame on the theme of the page without every caller
 * passing one down.
 */
function activePalette(): readonly string[] {
  const style = window.getComputedStyle(document.documentElement);
  return paletteNames.map((name) =>
    longHexColour(style.getPropertyValue(name).trim()),
  );
}

/** Options of one parent side diagram frame. */
export type DiagramFrameOptions = {
  /** The Mermaid source without the fence. */
  readonly source: string;
  readonly expanded?: boolean;
  readonly onSize?: (size: DiagramSize) => void;
  readonly onStatus?: (status: 'pending' | 'ready' | 'source') => void;
  /** The palette the frame renders with. */
  readonly theme: DiagramTheme;
  /**
   * The path of the built frame document, for example `diagram/frame.html`.
   * A plain path string on purpose: application URL construction belongs to
   * generated output, and this path is a static Vite entry, not an API route.
   */
  readonly framePath: string;
  /** How long the parent waits for the answer of a loaded frame. */
  readonly timeoutMs?: number | undefined;
  /** How long the parent waits for the frame document itself to load. */
  readonly loadTimeoutMs?: number | undefined;
  /**
   * What a failure does instead of the fallback of the editor.
   *
   * The editor leaves it out, and a failure then shows what happened, the
   * source and a Try again action inside the widget. The published page
   * passes it, because its own code block already shows the source, so the
   * frame leaves and the code block comes back (record 0158).
   */
  readonly onFailure?: (() => void) | undefined;
};

/**
 * The inline style of the frame element.
 *
 * The frame is a sandboxed document, so a utility class cannot reach it and
 * the parent sets its presentation here.
 *
 * `pointerEvents: 'none'` is the important one. The frame is a separate
 * document: a click on it moves the focus into that document, so the widget
 * around it never learns of the click, the source of the diagram never opens,
 * and every keystroke after the click is lost. The rendered diagram offers
 * nothing to press, so letting the click through to the editor costs nothing.
 */
export const diagramFrameStyle: Readonly<Record<string, string>> = {
  width: '100%',
  border: '0',
  pointerEvents: 'none',
};

/**
 * Creates the parent side of one diagram frame.
 *
 * Returns a wrapper element holding the sandboxed iframe, and the `dispose`
 * that releases it. **A caller must call `dispose`.** The wrapper holds a
 * window listener and a timer, and neither goes away with the element.
 *
 * Two clocks run, and they answer two different questions.
 *
 * - The load clock asks whether the frame document arrived at all. The frame
 *   holds the whole diagram engine inline, so a cold cache on a slow link
 *   takes real time, and a render budget that starts before the bytes arrive
 *   spends itself on the download. It is cleared by the `load` event.
 * - The render clock asks whether a loaded frame answered. It starts on
 *   `load`, beside the budget that the frame itself keeps, so the two agree
 *   on what they measure.
 *
 * A failure is never final. The wrapper shows what happened, the source, and
 * a Try again action, so one slow load does not leave text on the screen
 * until the note is edited.
 */
export function createDiagramFrame(options: DiagramFrameOptions): {
  readonly element: HTMLDivElement;
  readonly dispose: () => void;
  readonly setScale: (scale: number) => void;
} {
  const wrapper = document.createElement('div');
  wrapper.className = 'notes-diagram';

  const renderTimeoutMs = options.timeoutMs ?? diagramLimits.maxRenderMs;
  const loadTimeoutMs = options.loadTimeoutMs ?? diagramLimits.maxLoadMs;

  let frame: HTMLIFrameElement | null = null;
  let requestId = '';
  let settled = false;
  let timer = 0;
  let disposed = false;
  let natural: DiagramSize | null = null;
  let requestedScale: number | null = null;
  const status = (next: 'pending' | 'ready' | 'source'): void => {
    wrapper.setAttribute('data-notesapp-diagram', next);
    options.onStatus?.(next);
  };
  const applyScale = (): void => {
    if (!frame || !natural || requestedScale === null || disposed || !settled)
      return;
    const width =
      Math.ceil(natural.width * requestedScale) + natural.paddingX * 2;
    const height =
      Math.ceil(natural.height * requestedScale) + natural.paddingY * 2;
    wrapper.style.width = `${width}px`;
    frame.style.width = `${width}px`;
    frame.style.height = `${options.expanded ? height : clampDiagramHeight(height)}px`;
    const message: DiagramScaleRequest = {
      kind: 'scale',
      requestId,
      scale: requestedScale,
    };
    frame.contentWindow?.postMessage(message, '*');
  };
  const setScale = (scale: number): void => {
    if (!Number.isFinite(scale) || scale < 0.001 || scale > 4) return;
    requestedScale = scale;
    applyScale();
  };

  const stopClock = (): void => {
    window.clearTimeout(timer);
    timer = 0;
  };

  /**
   * Shows what happened, the source, and the one action that retries.
   *
   * Every path that reaches it has already stopped waiting: a timer that
   * fired was not cleared, and the one answer of the frame is read once.
   */
  const fallback = (message: string): void => {
    if (disposed) return;
    settled = true;
    stopClock();
    frame = null;
    if (options.onFailure !== undefined) {
      status('source');
      wrapper.textContent = '';
      options.onFailure();
      return;
    }
    status('source');
    wrapper.textContent = '';
    // The element sits inside the widget of `packages/editor`, so it reads
    // the classes of that widget: a note, an action and a source. The editor
    // theme is the one adapter that styles the generated DOM of the note, and
    // a name of this file alone would reach no rule at all.
    const note = document.createElement('p');
    note.className = 'cm-np-widget-note';
    note.textContent = message;
    wrapper.appendChild(note);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'cm-np-widget-action';
    retry.textContent = 'Try again';
    // The widget around this element opens the source of the diagram on a
    // press, so the action stops the press from reaching it.
    retry.addEventListener('mousedown', (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    });
    retry.addEventListener('click', (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      start();
    });
    wrapper.appendChild(retry);
    const code = document.createElement('pre');
    code.className = 'cm-np-widget-source';
    code.textContent = options.source;
    wrapper.appendChild(code);
  };

  const onMessage = (event: MessageEvent): void => {
    const current = frame;
    if (current === null || settled || disposed) return;
    if (event.source !== current.contentWindow) return;
    if (!isDiagramResponse(event.data)) return;
    if (event.data.requestId !== requestId) return;
    stopClock();
    if (!event.data.ok) {
      fallback('This diagram cannot be rendered.');
      return;
    }
    settled = true;
    status('ready');
    current.style.height = `${String(clampDiagramHeight(event.data.height))}px`;
    if (
      event.data.naturalWidth !== undefined &&
      event.data.naturalHeight !== undefined
    ) {
      natural = {
        width: event.data.naturalWidth,
        height: event.data.naturalHeight,
        paddingX: event.data.paddingX ?? 0,
        paddingY: event.data.paddingY ?? 0,
      };
      applyScale();
      options.onSize?.(natural);
    }
  };

  /** Builds the frame, posts the request, and starts the two clocks. */
  function start(): void {
    if (disposed) return;
    settled = false;
    natural = null;
    wrapper.style.width = '';
    stopClock();
    requestId = generateUUID();
    wrapper.textContent = '';
    status('pending');

    const iframe = document.createElement('iframe');
    iframe.className = 'notes-diagram-frame';
    iframe.setAttribute('title', 'Diagram preview');
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    // No `loading="lazy"`. The widget itself exists only while the editor
    // renders this part of the note, so the browser would add a second, and
    // invisible, gate in front of a clock that is already running.
    iframe.setAttribute('src', options.framePath);
    Object.assign(iframe.style, diagramFrameStyle);
    iframe.style.height = `${String(diagramLimits.minHeightPx)}px`;
    wrapper.appendChild(iframe);
    frame = iframe;

    iframe.addEventListener('load', (): void => {
      if (frame !== iframe || disposed) return;
      stopClock();
      // The editor can build this frame before the app applies new colours.
      // Read the palette when the loaded frame is ready to draw.
      const request: DiagramRequest = {
        requestId,
        source: options.source,
        theme: options.theme,
        palette: activePalette(),
        expanded: options.expanded ?? false,
      };
      // The frame runs with an opaque origin (`sandbox` without
      // `allow-same-origin`), so the target origin is `*` by necessity. The
      // message itself carries the request ID, and the response is accepted
      // only from this iframe with the same ID, so a stray frame cannot
      // answer for it.
      iframe.contentWindow?.postMessage(request, '*');
      timer = window.setTimeout(() => {
        fallback('This diagram took too long to draw.');
      }, renderTimeoutMs);
    });

    timer = window.setTimeout(() => {
      fallback('The diagram viewer did not load.');
    }, loadTimeoutMs);
  }

  window.addEventListener('message', onMessage);
  start();

  return {
    element: wrapper,
    setScale,
    dispose: (): void => {
      disposed = true;
      stopClock();
      window.removeEventListener('message', onMessage);
      frame = null;
      wrapper.remove();
    },
  };
}
