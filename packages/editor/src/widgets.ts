/**
 * The block level part of the live preview.
 *
 * Three things cannot be expressed with text decorations: an attachment
 * image, a Mermaid diagram, and a display math block. Each of them replaces
 * whole lines with a rendered widget. Everything else, tables included,
 * stays text so it can be edited in place.
 *
 * The rules these widgets follow:
 *
 * - Their ranges come from the Markdown syntax tree, never from a regular
 *   expression over the document.
 * - A widget covers whole lines and is a `Decoration.replace({ block: true })`,
 *   so CodeMirror can measure it.
 * - A widget disappears while the selection touches its range, so the source
 *   is always reachable and always editable.
 * - The remaining widgets are declared as atomic ranges, so an arrow key
 *   steps over a widget instead of walking into hidden text.
 * - A click inside a widget puts the cursor at the start of its source. A
 *   picture is the one exception: when the host can show it, the picture is
 *   a button that asks the host to open it (record 0145), and a click beside
 *   it still opens the source.
 * - `updateDOM` re-renders when the source or a resolver changed, so a same
 *   length edit never leaves a stale preview on screen.
 *
 * This module never fetches anything and never imports the API client or a
 * storage package. Attachment URLs, math rendering, and the diagram frame
 * arrive through the injected `RichWidgetResolvers`. It never loads an
 * external image by itself either: an external destination renders a compact
 * placeholder with a Load action that the reader must press.
 *
 * A decoration that replaces a line break, and every block decoration, has
 * to come from a state field rather than from a view plugin, which is why
 * the setext heading underline is hidden here as well. A code fence line
 * is never hidden: `./live-preview.ts` draws it quiet, so the source stays
 * on the screen for editing and for a copy.
 */
import { prepareImageRemoval } from './image-removal.ts';
import { syntaxTree } from '@codemirror/language';
import {
  Prec,
  RangeSet,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Transaction,
} from '@codemirror/state';
import type { SyntaxNode, Tree } from '@lezer/common';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import {
  allowsExternalImage,
  classifyUrl,
  diagramFence,
} from '@notesapp/markdown';

/** The kinds of region that render as a widget. */
export type RichWidgetKind =
  'image' | 'math-inline' | 'math-display' | 'diagram';

/** One region with its exact source range. */
export type RichWidget = {
  readonly from: number;
  readonly to: number;
  readonly kind: RichWidgetKind;
  /** The exact source text, so `doc.sliceString(from, to)` is this string. */
  readonly source: string;
  /** The image alt text or the math body, depending on the kind. */
  readonly content: string;
  /** The image destination, for the two image kinds. */
  readonly destination: string;
  /** True when the region covers whole lines and renders as a block. */
  readonly block: boolean;
};

/**
 * The fixed resource limits of widget rendering.
 *
 * A region larger than its cap stays editable source rather than rendering.
 * The math cap matches `mathLimits.maxSourceChars` in `@notesapp/markdown`,
 * so a widget never asks KaTeX for more than the renderer accepts.
 */
export const richLimits = {
  /** Largest accepted widget source, in characters. */
  maxSourceChars: 20000,
  /** Largest accepted math source inside a widget, in characters. */
  maxMathChars: 2000,
  /** Largest accepted diagram source, in characters. */
  maxDiagramChars: 20000,
  /** Largest accepted widget count per document; the rest stays source. */
  maxWidgets: 200,
} as const;

/**
 * Reports whether a region stays editable source instead of rendering.
 *
 * Rendering an oversized region would cost more than the preview is worth
 * and could freeze typing.
 */
export function shouldPreserveAsSource(widget: RichWidget): boolean {
  if (widget.source.length > richLimits.maxSourceChars) return true;
  if (
    (widget.kind === 'math-inline' || widget.kind === 'math-display') &&
    widget.content.length > richLimits.maxMathChars
  )
    return true;
  return (
    widget.kind === 'diagram' &&
    widget.content.length > richLimits.maxDiagramChars
  );
}

/** The attachment revision identifier of a destination, or null. */
export function attachmentIdOf(destination: string): string | null {
  const legacy = /^\/attachments\/([^/?#]+)$/.exec(destination)?.[1];
  if (legacy !== undefined) return legacy;
  if (
    destination === '' ||
    destination.startsWith('/') ||
    destination.startsWith('#') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination)
  )
    return null;
  return destination;
}

/** One created diagram element and the call that releases it. */
export type DiagramHandle = {
  readonly element: HTMLElement;
  readonly dispose: () => void;
};

/**
 * The release of the diagram that one widget element holds.
 *
 * A widget is filled again when its source or its resolvers change, and it is
 * destroyed when it leaves the screen. Both paths pass through the release
 * below, so a diagram frame never outlives the element that shows it.
 */
const diagramReleases = new WeakMap<HTMLElement, () => void>();

/** Releases the diagram of one widget element, if it holds one. */
function releaseDiagram(parent: HTMLElement): void {
  const release = diagramReleases.get(parent);
  if (release === undefined) return;
  diagramReleases.delete(parent);
  release();
}

/** Callbacks the web composition injects into the widget extension. */
export type RichWidgetResolvers = {
  /**
   * Renders math to sanitized HTML, for example through a dynamic import of
   * `@notesapp/markdown`. May throw; a throw shows editable source.
   */
  readonly renderMath?:
    ((source: string, display: boolean) => string) | undefined;
  /**
   * Resolves an attachment destination to a local object URL, or null when
   * the bytes are not ready. Never fetches an external URL.
   */
  readonly resolveAttachment?:
    ((destination: string) => string | null) | undefined;
  /**
   * Creates the diagram element for one Mermaid source, for example an
   * isolated frame. May throw; a throw shows editable source.
   *
   * It answers the element and the call that releases it. A diagram holds a
   * frame, a listener and a clock, and a widget that leaves the screen must
   * give all three back, so the release is part of the answer and not
   * something a caller can forget.
   */
  readonly createDiagram?: ((source: string) => DiagramHandle) | undefined;
  /** Called when a widget hands the cursor back to its source. */
  readonly onOpenSource?: ((widget: RichWidget) => void) | undefined;
  /**
   * Opens one picture at its own size, for example in a viewer dialog of the
   * application (record 0145). When it is absent, a picture is no control and
   * a click on it opens its source like a click on any widget.
   */
  readonly onOpenImage?: ((image: ImageOpenRequest) => void) | undefined;
};

/** The picture that a press on an image widget asks the host to open. */
export type ImageOpenRequest = {
  /** Removes only the selected reference, when the note permits editing. */
  readonly remove?: (() => boolean) | undefined;
  /** The address the widget shows: a local blob address or an HTTPS one. */
  readonly url: string;
  readonly alt: string;
  /** The destination as the note writes it, which names the file. */
  readonly destination: string;
  /** True for a picture on another host, whose bytes the page cannot read. */
  readonly external: boolean;
};

/** The class of the button that holds a picture the host can open. */
export const imageOpenClassName = 'cm-np-widget-image-open';

/**
 * What a picture of another host shows when it does not load.
 *
 * The words take the place of the picture and nothing else. A picture that the
 * host can open keeps its button around the words, because Copy link and Open
 * original need the address alone (record 0145).
 */
export function failedImageView(view: {
  readonly alt: string;
  readonly openLabel: string | null;
}): { readonly message: string; readonly openLabel: string | null } {
  return {
    message:
      view.alt === ''
        ? 'This picture did not load.'
        : `This picture did not load: ${view.alt}`,
    openLabel: view.openLabel,
  };
}

/**
 * The accessible name of the button that opens one picture.
 *
 * The alt text is the name of the picture, so it follows the action. A
 * picture with no alt text still names what the button does.
 */
export function imageOpenLabel(alt: string): string {
  const name = alt.trim();
  return name === '' ? 'Open image' : `Open image: ${name}`;
}

/**
 * Whether a destination is a picture on another host.
 *
 * The one URL policy of `@notesapp/markdown` answers it, so the note surface
 * and the reference renderer agree on what counts as external.
 */
export function isExternalImage(destination: string): boolean {
  return (
    classifyUrl(destination).kind === 'external' &&
    allowsExternalImage(destination)
  );
}

/** The text of one whole-line range, used to place a block widget. */
function lineRange(
  state: EditorState,
  from: number,
  to: number,
): { readonly from: number; readonly to: number } {
  return { from: state.doc.lineAt(from).from, to: state.doc.lineAt(to).to };
}

/** The alt text of one image, which is the run between `![` and `]`. */
function imageAlt(source: string): string {
  return /^!\[([^\]]*)\]/.exec(source)?.[1] ?? '';
}

/**
 * One reference label, in the form CommonMark compares.
 *
 * A label matches without regard to case and to the shape of its white space,
 * so both sides of the comparison pass through here.
 */
function referenceKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

/**
 * The link definitions of one document, by label, and the ranges that hold
 * them.
 *
 * A reference image names its destination somewhere else in the note, so the
 * widget finder needs the definitions before it can resolve one. They come
 * from the syntax tree, like every other fact of the preview. The walk enters
 * only the blocks that can hold a definition and never the text of a block.
 */
function linkDefinitions(state: EditorState): {
  readonly definitions: ReadonlyMap<string, string>;
  readonly ranges: readonly SourceRange[];
} {
  const doc = state.doc;
  const definitions = new Map<string, string>();
  const ranges: SourceRange[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'LinkReference')
        return definitionContainers.has(node.name);
      ranges.push({ from: node.from, to: node.to });
      const label = node.node.getChild('LinkLabel');
      const url = node.node.getChild('URL');
      if (label === null || url === null) return false;
      const key = referenceKey(
        doc.sliceString(label.from + 1, Math.max(label.from + 1, label.to - 1)),
      );
      // The first definition of a label wins, as CommonMark states.
      if (!definitions.has(key))
        definitions.set(key, doc.sliceString(url.from, url.to));
      return false;
    },
  });
  return { definitions, ranges };
}

/** The blocks that can hold a link definition. */
const definitionContainers = new Set([
  'Document',
  'Blockquote',
  'BulletList',
  'OrderedList',
  'ListItem',
]);

/** One range of the source. */
type SourceRange = { readonly from: number; readonly to: number };

/**
 * One range that the widget field decorates: a widget, or source that hides
 * with no widget in its place, such as a hard break marker or a setext
 * heading underline.
 */
type Region = {
  readonly from: number;
  readonly to: number;
  /** The range that the selection touches to show the source again. */
  readonly revealFrom: number;
  readonly revealTo: number;
  readonly widget: RichWidget | null;
};

/** What one scan of a range of the tree found. */
type RegionScan = {
  readonly regions: Region[];
  /** Whether the range holds a link definition. */
  readonly definitions: boolean;
  /** How many tree nodes the scan entered. */
  readonly visited: number;
};

/**
 * Finds the regions of one range of the tree, in document order.
 *
 * One walk finds every kind, and it enters a block only when the block can
 * hold a region. A range of whole top-level blocks gives the regions of
 * those blocks and of nothing else, which is what lets the field scan only
 * the blocks that an edit changed.
 */
function scanRegions(
  state: EditorState,
  range: SourceRange,
  definitions: ReadonlyMap<string, string>,
): RegionScan {
  const doc = state.doc;
  const regions: Region[] = [];
  const slice = (from: number, to: number): string => doc.sliceString(from, to);
  const paragraphs: SourceRange[] = [];
  let sawDefinition = false;
  let visited = 0;
  const hide = (from: number, to: number, reveal: SourceRange): void => {
    regions.push({
      from,
      to,
      revealFrom: reveal.from,
      revealTo: reveal.to,
      widget: null,
    });
  };
  const widget = (found: RichWidget): void => {
    regions.push({
      from: found.from,
      to: found.to,
      revealFrom: found.from,
      revealTo: found.to,
      widget: found,
    });
  };
  syntaxTree(state).iterate({
    from: range.from,
    to: range.to,
    enter: (node) => {
      visited += 1;
      const name = node.name;
      if (name === 'LinkReference') {
        sawDefinition = true;
        return false;
      }
      if (name === 'FencedCode') {
        const info = node.node.getChild('CodeInfo');
        const infoText = info === null ? '' : slice(info.from, info.to);
        if (diagramFence(infoText)) {
          const text = node.node.getChild('CodeText');
          const lines = lineRange(state, node.from, node.to);
          widget({
            ...lines,
            kind: 'diagram',
            source: slice(lines.from, lines.to),
            content: text === null ? '' : slice(text.from, text.to),
            destination: '',
            block: true,
          });
          return false;
        }
        // A code fence keeps its fence lines on the screen, so editing and a
        // copy read the source as it is. `./live-preview.ts` draws them quiet.
        return false;
      }
      if (name === 'MathBlock') {
        const lines = lineRange(state, node.from, node.to);
        const parts: string[] = [];
        for (const text of node.node.getChildren('MathText'))
          parts.push(slice(text.from, text.to));
        widget({
          ...lines,
          kind: 'math-display',
          source: slice(lines.from, lines.to),
          content: parts.join('\n'),
          destination: '',
          block: true,
        });
        return false;
      }
      if (name === 'InlineMath') {
        widget(inlineMath(state, node.node));
        return false;
      }
      if (name === 'Image') {
        const found = imageRegion(state, node.node, definitions);
        if (found === null) return true;
        widget(found);
        return false;
      }
      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        // Hiding the underline and the line break above it joins the
        // underline into the heading line, so the heading shows its text
        // only. A cursor on either line brings the underline back.
        const mark = node.node.getChild('HeaderMark');
        const line = mark === null ? null : doc.lineAt(mark.from);
        if (line !== null && line.from > 0)
          hide(line.from - 1, line.to, { from: node.from, to: node.to });
        return true;
      }
      if (name === 'Paragraph') {
        paragraphs.push({ from: node.from, to: node.to });
        return true;
      }
      if (name === 'HardBreak') {
        // The marker hides with the rest of the source of its paragraph, and
        // never its line break, which is what the marker asks for (decision
        // 0107).
        const paragraph = paragraphs[paragraphs.length - 1];
        if (paragraph !== undefined)
          hide(
            node.from,
            Math.min(node.to, doc.lineAt(node.from).to),
            paragraph,
          );
        return true;
      }
      return true;
    },
    leave: (node) => {
      if (node.name === 'Paragraph') paragraphs.pop();
    },
  });
  regions.sort((left, right) => left.from - right.from || left.to - right.to);
  return { regions, definitions: sawDefinition, visited };
}

/** The region of one inline math node. */
function inlineMath(state: EditorState, node: SyntaxNode): RichWidget {
  const slice = (from: number, to: number): string =>
    state.doc.sliceString(from, to);
  const text = node.getChild('MathText');
  // A run of dollars can span the lines of its paragraph, as remark reads
  // it, so the marks of a quote and the indent of a list on a later line
  // belong to the note and not to the formula.
  let content = '';
  if (text !== null) {
    let at = text.from;
    for (const mark of [
      ...node.getChildren('QuoteMark'),
      ...text.getChildren('QuoteMark'),
    ].sort((left, right) => left.from - right.from)) {
      if (mark.from < text.from || mark.to > text.to) continue;
      content += slice(at, mark.from);
      at = mark.to;
    }
    content += slice(at, text.to);
    content = content.replace(/\n[ \t]+/g, '\n');
  }
  return {
    from: node.from,
    to: node.to,
    kind: 'math-inline',
    source: slice(node.from, node.to),
    content,
    destination: '',
    block: false,
  };
}

/** The region of one image node, or `null` when it renders no widget. */
function imageRegion(
  state: EditorState,
  node: SyntaxNode,
  definitions: ReadonlyMap<string, string>,
): RichWidget | null {
  const doc = state.doc;
  const slice = (from: number, to: number): string => doc.sliceString(from, to);
  const text = slice(node.from, node.to);
  const alt = imageAlt(text);
  const url = node.getChild('URL');
  // A reference image names its destination elsewhere in the note. The full
  // form carries the label, and the collapsed and shortcut forms use the alt
  // text as the label, which is what CommonMark states.
  const label = node.getChild('LinkLabel');
  const destination =
    url !== null
      ? slice(url.from, url.to)
      : (definitions.get(
          referenceKey(
            label === null
              ? alt
              : slice(label.from + 1, Math.max(label.from + 1, label.to - 1)),
          ),
        ) ?? null);
  if (destination === null) return null;
  const attachment = attachmentIdOf(destination);
  if (attachment === null && !isExternalImage(destination)) return null;
  const line = doc.lineAt(node.from);
  const alone =
    line.text.trim() === text.trim() &&
    doc.lineAt(node.to).number === line.number;
  return {
    from: alone ? line.from : node.from,
    to: alone ? line.to : node.to,
    kind: 'image',
    source: text,
    content: alt,
    destination,
    block: alone,
  };
}

/**
 * Finds every region that renders as a widget, from the syntax tree.
 *
 * Regions come back in document order and never overlap. At most
 * `richLimits.maxWidgets` are reported; the rest of a very long document
 * stays editable source.
 */
export function findRichRegions(state: EditorState): readonly RichWidget[] {
  const { definitions } = linkDefinitions(state);
  const found: RichWidget[] = [];
  for (const region of scanRegions(
    state,
    { from: 0, to: state.doc.length },
    definitions,
  ).regions)
    if (region.widget !== null && found.length < richLimits.maxWidgets)
      found.push(region.widget);
  return found;
}

/**
 * What one widget shows, decided without a DOM.
 *
 * Keeping the decision separate from the element makes every branch of the
 * widget testable in Node: the tests assert the view model, and the DOM
 * builder below is a direct translation of it.
 */
export type WidgetView =
  | {
      readonly kind: 'image';
      readonly url: string;
      readonly alt: string;
      readonly external: boolean;
      /**
       * The name of the button that opens the picture, or null when the host
       * shows no picture of its own and the picture is no control.
       */
      readonly openLabel: string | null;
    }
  | { readonly kind: 'math'; readonly html: string; readonly display: boolean }
  | {
      readonly kind: 'element';
      readonly element: HTMLElement;
      readonly dispose: () => void;
    }
  | {
      readonly kind: 'source';
      readonly message: string;
      readonly source: string;
    };

/**
 * Decides what one region shows.
 *
 * Everything that can fail, an oversized region, a missing attachment, a
 * resolver that is still loading, and a resolver that throws, ends in the
 * `source` view, so the source is never lost.
 */
export function widgetView(
  widget: RichWidget,
  resolvers: RichWidgetResolvers,
): WidgetView {
  const source = (message: string): WidgetView => ({
    kind: 'source',
    message,
    source: widget.source,
  });
  if (shouldPreserveAsSource(widget))
    return source('This block is large, so it stays source.');
  if (widget.kind === 'image') {
    const openLabel =
      resolvers.onOpenImage === undefined
        ? null
        : imageOpenLabel(widget.content);
    // A picture on another host keeps its address and loads by itself
    // (decision 0067). A picture of this workspace waits for the bytes that
    // the resolver holds.
    if (attachmentIdOf(widget.destination) === null)
      return {
        kind: 'image',
        url: widget.destination,
        alt: widget.content,
        external: true,
        openLabel,
      };
    const url = resolvers.resolveAttachment?.(widget.destination) ?? null;
    if (url === null) return source('The attachment is not ready yet.');
    return {
      kind: 'image',
      url,
      alt: widget.content,
      external: false,
      openLabel,
    };
  }
  if (widget.kind === 'math-inline' || widget.kind === 'math-display') {
    const render = resolvers.renderMath;
    if (render === undefined) return source('Math is still loading.');
    const display = widget.kind === 'math-display';
    try {
      return { kind: 'math', html: render(widget.content, display), display };
    } catch {
      return source('This formula cannot be rendered.');
    }
  }
  const create = resolvers.createDiagram;
  if (create === undefined) return source('Diagrams are still loading.');
  try {
    const handle = create(widget.content);
    return {
      kind: 'element',
      element: handle.element,
      dispose: handle.dispose,
    };
  } catch {
    return source('This diagram cannot be rendered.');
  }
}

/** The accessible label of one widget kind. */
function widgetLabel(kind: RichWidgetKind): string {
  if (kind === 'image') return 'Image';
  if (kind === 'math-inline') return 'Inline formula';
  if (kind === 'math-display') return 'Formula';
  return 'Diagram';
}

/** Renders one region as DOM. */
class RichWidgetType extends WidgetType {
  private editor: EditorView | null = null;
  readonly widget: RichWidget;
  readonly resolvers: RichWidgetResolvers;

  constructor(widget: RichWidget, resolvers: RichWidgetResolvers) {
    super();
    this.widget = widget;
    this.resolvers = resolvers;
  }

  override eq(other: RichWidgetType): boolean {
    return (
      other.widget.kind === this.widget.kind &&
      other.widget.source === this.widget.source &&
      other.widget.content === this.widget.content &&
      other.widget.destination === this.widget.destination &&
      other.resolvers === this.resolvers
    );
  }

  override get estimatedHeight(): number {
    if (this.widget.kind === 'diagram') return 240;
    if (this.widget.kind === 'math-display') return 60;
    return -1;
  }

  /**
   * The editor ignores the events of the button of a picture, so a press, a
   * key and a focus there belong to the button and never move the caret into
   * the source (record 0145). Every other event of a widget is the editor's.
   */
  override ignoreEvent(event: Event): boolean {
    const target = event.target;
    return (
      target instanceof Element &&
      target.closest(`.${imageOpenClassName}`) !== null
    );
  }

  /**
   * Re-renders in place when the source or a resolver changed.
   *
   * CodeMirror calls this only when `eq` reported a difference, which is
   * exactly the case where the previous DOM is stale. Returning true keeps
   * the same element and its position in the layout.
   */
  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    this.editor = view;
    releaseDiagram(dom);
    dom.textContent = '';
    this.fill(dom);
    return true;
  }

  /** Releases a removed widget promptly, which stops a frame from loading. */
  override destroy(dom: HTMLElement): void {
    releaseDiagram(dom);
    dom.textContent = '';
  }

  toDOM(view: EditorView): HTMLElement {
    this.editor = view;
    const container = document.createElement(
      this.widget.block ? 'div' : 'span',
    );
    container.className = this.widget.block
      ? 'cm-np-widget cm-np-widget-block'
      : 'cm-np-widget cm-np-widget-inline';
    container.setAttribute('data-notesapp-rich', this.widget.kind);
    container.setAttribute('aria-label', widgetLabel(this.widget.kind));
    container.addEventListener('mousedown', (event: Event): void => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('button') !== null)
        return;
      event.preventDefault();
      this.openSource(view);
    });
    this.fill(container);
    return container;
  }

  /** Puts the cursor at the start of the source this widget replaced. */
  private openSource(view: EditorView): void {
    view.dispatch({ selection: { anchor: this.widget.from } });
    view.focus();
    this.resolvers.onOpenSource?.(this.widget);
  }

  /** Renders one view model into `parent`. */
  private fill(parent: HTMLElement): void {
    const view = widgetView(this.widget, this.resolvers);
    if (view.kind === 'source') {
      const note = document.createElement('span');
      note.className = 'cm-np-widget-note';
      note.textContent = view.message;
      parent.appendChild(note);
      const code = document.createElement('span');
      code.className = 'cm-np-widget-source';
      code.textContent = view.source;
      parent.appendChild(code);
      return;
    }
    if (view.kind === 'image') {
      const image = document.createElement('img');
      image.className = 'cm-np-widget-image';
      image.src = view.url;
      image.alt = view.alt;
      if (view.external) {
        // The host of the picture learns that somebody asked for it and never
        // which note holds it.
        image.referrerPolicy = 'no-referrer';
        image.loading = 'lazy';
        image.addEventListener('error', (): void => {
          // The words replace the picture alone, so the button that holds a
          // picture the host can open stays around them.
          const failure = failedImageView(view);
          const failed = document.createElement('span');
          failed.className = 'cm-np-widget-note cm-np-widget-error';
          failed.textContent = failure.message;
          image.replaceWith(failed);
        });
      }
      const label = view.openLabel;
      if (label === null) {
        parent.appendChild(image);
        return;
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.className = imageOpenClassName;
      open.setAttribute('aria-label', label);
      open.title = label;
      open.addEventListener('click', (): void => {
        this.resolvers.onOpenImage?.({
          remove:
            this.editor === null
              ? undefined
              : prepareImageRemoval(
                  this.editor,
                  this.editor.posAtDOM(parent),
                  this.widget.source,
                ),
          url: view.url,
          alt: view.alt,
          destination: this.widget.destination,
          external: view.external,
        });
      });
      open.appendChild(image);
      parent.appendChild(open);
      return;
    }
    if (view.kind === 'math') {
      const holder = document.createElement('span');
      holder.className = view.display
        ? 'cm-np-math cm-np-math-display'
        : 'cm-np-math cm-np-math-inline';
      // The resolver returns sanitized markup: `renderMath` in
      // `@notesapp/markdown` strips every element and every attribute that
      // is not part of the KaTeX drawing set before it returns.
      holder.innerHTML = view.html;
      parent.appendChild(holder);
      return;
    }
    diagramReleases.set(parent, view.dispose);
    parent.appendChild(view.element);
  }
}

/** The decorations and the atomic ranges of one state. */
export type RichWidgetSet = {
  /**
   * The widgets, each over the whole range of its source. The extension
   * gives them a higher precedence than every text decoration, because a
   * text decoration that replaces the start of a widget range leaves
   * CodeMirror a widget that is open at its start, and CodeMirror draws such
   * a range as the rest of the decoration before it and never draws the
   * widget (issue 204).
   */
  readonly widgets: DecorationSet;
  /** The source that the preview hides without a widget in its place. */
  readonly hides: DecorationSet;
  readonly atomic: RangeSet<Decoration>;
};

/**
 * The regions of one state, and what the field needs to keep them right.
 *
 * The field keeps this index from one transaction to the next. An edit
 * scans only the top-level blocks that it changed, and the rest of the index
 * moves with the edit, so the cost of a key follows the change and not the
 * length of the note.
 */
export type RegionIndex = {
  readonly regions: readonly Region[];
  readonly definitions: ReadonlyMap<string, string>;
  /** Where the link definitions stand, so an edit of one scans again. */
  readonly definitionRanges: readonly SourceRange[];
  /**
   * Whether the regions wait for a tree of the whole note. A parse that stops
   * before the end of the note gives a tree that can hold none of its blocks,
   * and the next parse can draw even the blocks before the edit anew, so the
   * regions move with the edits until a whole tree comes, and that tree is
   * scanned whole.
   */
  readonly pending: boolean;
  /** How many tree nodes the update that made this index entered. */
  readonly visited: number;
};

/**
 * Whether the tree of a state holds the blocks of its whole note.
 *
 * The note language parses the Markdown body as a document mounted in its
 * own. A parse that stops early can leave a tree as long as the note whose
 * body is still one unparsed `Body` node, or a body that ends before the
 * note, so the test reads the body and not the length alone.
 */
function treeCovers(state: EditorState): boolean {
  const tree = syntaxTree(state);
  if (tree.length < state.doc.length) return false;
  for (
    let child = tree.topNode.firstChild;
    child !== null;
    child = child.nextSibling
  )
    if (child.name === 'Body') return false;
  // A body parsed in part ends before the note does.
  return documentNode(tree).to >= state.doc.length;
}

/** The index of one state, from a scan of the whole tree. */
export function regionIndexOf(state: EditorState): RegionIndex {
  const { definitions, ranges } = linkDefinitions(state);
  const scan = scanRegions(
    state,
    { from: 0, to: state.doc.length },
    definitions,
  );
  return {
    regions: scan.regions,
    definitions,
    definitionRanges: ranges,
    pending: !treeCovers(state),
    visited: scan.visited,
  };
}

/**
 * The top-level block that holds one node, or `null` for the document.
 *
 * The note language wraps the Markdown document in a document of its own,
 * so a block is a node whose parent is a `Document` and that is not one.
 */
function topBlockOf(node: SyntaxNode): SyntaxNode | null {
  for (let at: SyntaxNode = node; at.parent !== null; at = at.parent)
    if (at.parent.name === 'Document' && at.name !== 'Document') return at;
  return null;
}

/**
 * The Markdown document of a tree, whose children are its blocks.
 *
 * The note language puts the front matter and the Markdown document side
 * by side under a document of its own. A tree with no front matter grammar
 * is the Markdown document itself.
 */
function documentNode(tree: Tree): SyntaxNode {
  const top = tree.topNode;
  for (let child = top.firstChild; child !== null; child = child.nextSibling)
    if (child.name === 'Document') return child;
  return top;
}

/** The top-level blocks of a tree that touch one position, as one range. */
function blocksAt(tree: Tree, position: number): SourceRange {
  let from = position;
  let to = position;
  for (const side of [-1, 1] as const) {
    const block = topBlockOf(tree.resolve(position, side));
    if (block === null || block.from > position || block.to < position)
      continue;
    from = Math.min(from, block.from);
    to = Math.max(to, block.to);
  }
  return { from, to };
}

/** The first top-level block of a tree that starts at or after a position. */
function topBlockFrom(tree: Tree, position: number): SyntaxNode | null {
  let node = documentNode(tree).childAfter(position);
  while (node !== null && node.from < position) node = node.nextSibling;
  return node;
}

/**
 * The range of the new document that one edit can have changed, as whole
 * top-level blocks, or `null` when the edit changed a link definition and
 * the whole note scans again.
 *
 * The range starts with the blocks around the edit, in the old tree and in
 * the new one. An edit can change how the text after it parses, as an open
 * code fence does, so the range then grows block by block until a block of
 * the new tree stands where the same block of the old tree stood.
 */
function changedBlocks(
  transaction: Transaction,
  index: RegionIndex,
): SourceRange | null {
  let fromA = Number.POSITIVE_INFINITY;
  let toA = Number.NEGATIVE_INFINITY;
  let fromB = Number.POSITIVE_INFINITY;
  let toB = Number.NEGATIVE_INFINITY;
  transaction.changes.iterChangedRanges((startA, endA, startB, endB) => {
    fromA = Math.min(fromA, startA);
    toA = Math.max(toA, endA);
    fromB = Math.min(fromB, startB);
    toB = Math.max(toB, endB);
  });
  const oldTree = syntaxTree(transaction.startState);
  const newTree = syntaxTree(transaction.state);
  const shift = toB - toA;
  const oldBlocks = {
    from: blocksAt(oldTree, fromA).from,
    to: blocksAt(oldTree, toA).to,
  };
  if (
    index.definitionRanges.some(
      (range) => range.from <= oldBlocks.to && range.to >= oldBlocks.from,
    )
  )
    return null;
  let from = Math.min(fromB, oldBlocks.from, blocksAt(newTree, fromB).from);
  let to = Math.max(toB, oldBlocks.to + shift, blocksAt(newTree, toB).to);
  // Grow until the blocks of the two trees stand in the same places again.
  for (;;) {
    const next = topBlockFrom(newTree, to);
    if (next === null) {
      to = Math.max(to, Math.min(newTree.length, transaction.newDoc.length));
      break;
    }
    const before = topBlockFrom(oldTree, Math.max(0, to - shift));
    if (
      before !== null &&
      before.name === next.name &&
      before.from + shift === next.from &&
      before.to + shift === next.to
    )
      break;
    to = next.to;
  }
  const doc = transaction.newDoc;
  from = doc.lineAt(Math.max(0, Math.min(from, doc.length))).from;
  to = doc.lineAt(Math.max(0, Math.min(to, doc.length))).to;
  return { from, to };
}

/**
 * Whether one region belongs to a range of blocks: it lies inside it, or
 * it overlaps it. A region that only touches the range belongs to the block
 * beside it.
 */
function meets(region: Region, range: SourceRange): boolean {
  return (
    (region.revealFrom >= range.from && region.revealTo <= range.to) ||
    (region.revealFrom < range.to && region.revealTo > range.from)
  );
}

/** One region moved by the changes of a transaction. */
function mapRegion(region: Region, transaction: Transaction): Region {
  const map = (position: number): number =>
    transaction.changes.mapPos(position);
  const from = map(region.from);
  const to = map(region.to);
  return {
    from,
    to,
    revealFrom: map(region.revealFrom),
    revealTo: map(region.revealTo),
    widget: region.widget === null ? null : { ...region.widget, from, to },
  };
}

/** The index with the regions of one range scanned again. */
function rescan(
  state: EditorState,
  kept: readonly Region[],
  range: SourceRange,
  index: Omit<RegionIndex, 'regions' | 'pending' | 'visited'>,
): RegionIndex | null {
  const scan = scanRegions(state, range, index.definitions);
  if (scan.definitions) return null;
  const regions = [
    ...kept.filter((region) => !meets(region, range)),
    ...scan.regions.filter((region) => meets(region, range)),
  ].sort((left, right) => left.from - right.from || left.to - right.to);
  return {
    definitions: index.definitions,
    definitionRanges: index.definitionRanges,
    regions,
    pending: false,
    visited: scan.visited,
  };
}

/**
 * The index after one transaction.
 *
 * An edit scans the blocks that it changed. A change of a link definition
 * scans the whole note, because an image anywhere can name it. An edit whose
 * parse stops before the end of the note moves the regions with it, and the
 * transaction that brings a tree of the whole note scans it whole. A
 * transaction that changes neither keeps the index.
 */
export function nextRegionIndex(
  index: RegionIndex,
  transaction: Transaction,
): RegionIndex {
  const state = transaction.state;
  const covered = treeCovers(state);
  if (transaction.docChanged) {
    const regions = index.regions.map((region) =>
      mapRegion(region, transaction),
    );
    const definitionRanges = index.definitionRanges.map((range) => ({
      from: transaction.changes.mapPos(range.from),
      to: transaction.changes.mapPos(range.to),
    }));
    if (!covered || index.pending) {
      // A tree that stops before the end of the note holds none of its
      // blocks, so the regions move with the edit until a whole tree comes.
      if (covered) return regionIndexOf(state);
      return {
        definitions: index.definitions,
        definitionRanges,
        regions,
        pending: true,
        visited: 0,
      };
    }
    const range = changedBlocks(transaction, index);
    if (range === null) return regionIndexOf(state);
    return (
      rescan(state, regions, range, {
        definitions: index.definitions,
        definitionRanges,
      }) ?? regionIndexOf(state)
    );
  }
  if (!index.pending || !covered) return index;
  // A tree of the whole note arrived after a parse that stopped early.
  return regionIndexOf(state);
}

/**
 * The decorations of one index under the selection of a state.
 *
 * A region whose range the selection touches is left out, so its source
 * shows and stays editable.
 */
function decorate(
  index: RegionIndex,
  state: EditorState,
  resolvers: RichWidgetResolvers,
): RichWidgetSet {
  const selection = state.selection.main;
  const widgetItems: Range<Decoration>[] = [];
  const items: Range<Decoration>[] = [];
  const atomicItems: Range<Decoration>[] = [];
  let widgets = 0;
  for (const region of index.regions) {
    if (region.widget !== null) {
      // The cap counts in document order, so the same widgets render
      // wherever the selection stands.
      if (widgets >= richLimits.maxWidgets) continue;
      widgets += 1;
    }
    if (region.to <= region.from) continue;
    if (selection.from <= region.revealTo && selection.to >= region.revealFrom)
      continue;
    if (region.widget !== null) {
      const decoration = Decoration.replace({
        widget: new RichWidgetType(region.widget, resolvers),
        block: region.widget.block,
      });
      widgetItems.push(decoration.range(region.from, region.to));
      atomicItems.push(decoration.range(region.from, region.to));
      continue;
    }
    const hidden = Decoration.replace({});
    items.push(hidden.range(region.from, region.to));
    atomicItems.push(hidden.range(region.from, region.to));
  }
  return {
    widgets: Decoration.set(widgetItems, true),
    hides: Decoration.set(items, true),
    atomic: RangeSet.of(atomicItems, true),
  };
}

/**
 * Builds the widgets and the hidden source of one state.
 *
 * A region whose range the selection touches is left out, so its source
 * shows and stays editable. The setext heading underline is hidden here as
 * well, because that decoration replaces a line break.
 */
export function buildRichWidgets(
  state: EditorState,
  resolvers: RichWidgetResolvers,
): RichWidgetSet {
  return decorate(regionIndexOf(state), state, resolvers);
}

/** The value of the widget field: the index and its decorations. */
type RichWidgetField = RichWidgetSet & { readonly index: RegionIndex };

/** The field of one extension, which a test reads through `regionIndex`. */
const indexFields = new WeakMap<object, StateField<RichWidgetField>>();

/**
 * The widget extension.
 *
 * Block replacements come from a state field, because CodeMirror refuses
 * block decorations from a view plugin. The regions move with each edit and
 * only the blocks that the edit changed are read again. The decorations are
 * built again when the regions change and when the selection moves, so the
 * source of a region shows while the selection touches it.
 */
export function richWidgets(resolvers: RichWidgetResolvers = {}): Extension {
  const field = StateField.define<RichWidgetField>({
    create: (state) => {
      const index = regionIndexOf(state);
      return { ...decorate(index, state, resolvers), index };
    },
    update: (current, transaction) => {
      const index = nextRegionIndex(current.index, transaction);
      if (index === current.index && transaction.selection === undefined)
        return current;
      return { ...decorate(index, transaction.state, resolvers), index };
    },
    provide: (self) => [
      // A widget replaces its whole source, so no text decoration of the
      // live preview may cut into its range (issue 204).
      Prec.high(EditorView.decorations.from(self, (value) => value.widgets)),
      EditorView.decorations.from(self, (value) => value.hides),
      EditorView.atomicRanges.of(
        (view) => view.state.field(self, false)?.atomic ?? RangeSet.empty,
      ),
    ],
  });
  const extension: Extension = [field];
  indexFields.set(extension, field);
  return extension;
}

/**
 * The region index that the widget extension keeps in one state, or `null`
 * when the state has none. Tests read it to hold the cost of an edit.
 */
export function regionIndex(
  state: EditorState,
  extension: Extension,
): RegionIndex | null {
  const field = indexFields.get(extension);
  return field === undefined
    ? null
    : (state.field(field, false)?.index ?? null);
}
