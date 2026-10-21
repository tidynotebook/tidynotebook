/**
 * Safe HTML rendering of stored Markdown.
 *
 * The pipeline is: parse Markdown, convert to HTML nodes with the handlers
 * below, parse the HTML that the author wrote and keep the safe set of
 * `./html-elements.ts`, apply the URL policy to every link and image, sanitize
 * with the shared schema, and serialize. Each stage narrows what can reach a
 * reader.
 *
 * What this renderer never does:
 *
 * - It never emits HTML that the author list does not name (record 0157). The
 *   HTML of a note goes through parse5, the parser of the HTML standard, and
 *   an element outside the list leaves its tags and keeps its text. A
 *   `<script>` block leaves with its content, and an `onerror` attribute and a
 *   `style` attribute leave. The elements of the renderer carry a mark of one
 *   render through that parse, so an author cannot forge one.
 * - It never fetches anything itself. An internal reference stays a path that
 *   the caller resolves through the generated API operations. An external
 *   image over HTTPS keeps its address, so the browser of the reader loads it
 *   and the host of that image learns of the reader (decision 0067).
 * - It never evaluates front matter. The parser keeps the YAML text in its
 *   own syntax node, and the Markdown to HTML stage emits it as escaped text
 *   in one metadata block.
 * - It never runs unbounded work. `./limits.ts` bounds the document before the
 *   parser sees it and bounds the parsed tree afterwards.
 *
 * A new line inside a paragraph is a line break, the way Obsidian and Notion
 * show it (decision 0107). CommonMark would join the two lines with a space;
 * this renderer writes a `br` element, and the live preview keeps the line.
 *
 * A block quote that opens with an alert marker, for example `[!NOTE]`,
 * becomes an alert: the marker leaves the text and the quote states its tone.
 * `./alerts.ts` holds that one rule, and the live preview reads it as well.
 *
 * Code in a fence of a known language is highlighted with the parsers of
 * `./code-languages.ts` and the token map of `./code-tokens.ts`, which the
 * editor reads as well (record 0159), so a token has one colour on both
 * surfaces.
 *
 * Math and Mermaid are handled differently. Math sources render through
 * `./math.ts` into sanitized KaTeX after the main sanitizer ran, so KaTeX
 * styles survive without reopening the main schema. A Mermaid fence stays a
 * `data-diagram` placeholder in HTML; the editor and the published page draw
 * it inside an isolated frame (record 0158). In both cases a failure keeps the
 * source verbatim inside the placeholder, so no content is lost and the
 * editor can still show the region as text.
 */
import type {
  Element,
  ElementContent,
  Root as HastRoot,
  RootContent,
} from 'hast';
import { highlightCode } from '@lezer/highlight';
import { raw } from 'hast-util-raw';
import type { Code, Nodes, Root as MdastRoot } from 'mdast';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkRehype from 'remark-rehype';
import { visit } from 'unist-util-visit';
import { alertMarkerLength, alertTitle, alertToneOf } from './alerts.ts';
import {
  codeBlockLabel,
  diagramFence,
  codeLanguageOf,
  loadCodeParser,
  loadedCodeParser,
} from './code-languages.ts';
import {
  codeBlockClass,
  codeHighlighter,
  codeLabelClass,
} from './code-tokens.ts';
import {
  authorElements,
  authorProperties,
  authorStrippedElements,
  neutralizeAuthorTags,
} from './html-elements.ts';
import { headingSlug } from './heading-slug.ts';
import { createMarkdownProcessor, parseMarkdown } from './parse.ts';
import { renderMath } from './math.ts';
import { allowsExternalImage, classifyUrl, sanitizeSchema } from './policy.ts';
import {
  taskMarkAttributes,
  taskMarkClass,
  taskMarkPoints,
} from './task-mark.ts';

/** Builds a text-only HTML element. */
function textElement(
  tagName: string,
  properties: Record<string, string>,
  value: string,
): Element {
  return {
    type: 'element',
    tagName,
    properties,
    children: [{ type: 'text', value }],
  };
}

/**
 * The math node types that remark-math registers on the mdast tree.
 *
 * They are read out of the registry rather than imported from the utility
 * package, so this package declares no dependency on an internal package of
 * remark-math.
 */
type InlineMathNode = Extract<Nodes, { type: 'inlineMath' }>;
type MathNode = Extract<Nodes, { type: 'math' }>;
type YamlNode = Extract<Nodes, { type: 'yaml' }>;

/**
 * Turns a math node into a placeholder that keeps its source.
 *
 * The placeholder holds the source as text, so it is escaped on
 * serialization and cannot inject markup. `renderMarkdown` replaces it with
 * sanitized KaTeX afterwards; a failure keeps this placeholder, so the region
 * stays editable source.
 */
function mathPlaceholder(node: InlineMathNode | MathNode): Element {
  return textElement(
    'span',
    { dataMath: node.type === 'math' ? 'display' : 'inline' },
    node.value,
  );
}

/** Renders inert YAML metadata as one text-only block. */
function frontMatterBlock(node: YamlNode): Element {
  return textElement('pre', { dataFrontmatter: 'yaml' }, node.value);
}

/** Info strings that are safe to repeat in a class name. */
const languagePattern = /^[a-z0-9_-]+$/;

/**
 * The highlighted text of one fence, as HTML nodes.
 *
 * A fence of a language of `./code-languages.ts` whose parser has loaded is
 * parsed with it, and each token becomes one `span` with the class of its
 * code token. Every other fence is one text node.
 */
function codeText(node: Code, value: string): ElementContent[] {
  const language = codeLanguageOf(node.lang ?? '');
  const parser = language === null ? null : loadedCodeParser(language);
  if (parser === null) return [{ type: 'text', value }];
  const parts: ElementContent[] = [];
  const pushText = (text: string): void => {
    const last = parts[parts.length - 1];
    if (last?.type === 'text') last.value += text;
    else parts.push({ type: 'text', value: text });
  };
  highlightCode(
    value,
    parser.parse(value),
    codeHighlighter,
    (text, classes) => {
      if (classes === '') pushText(text);
      else
        parts.push({
          type: 'element',
          tagName: 'span',
          properties: { className: classes.split(' ') },
          children: [{ type: 'text', value: text }],
        });
    },
    () => {
      pushText('\n');
    },
  );
  return parts;
}

/**
 * Renders a fenced or indented code block.
 *
 * Every block other than a diagram is a `figure` of the class
 * `notes-code`, with its label in a `figcaption` when it has one (record
 * 0174).
 *
 * A `mermaid` fence stays a diagram placeholder that keeps its source. The
 * editor and the published page draw it inside an isolated frame; HTML never
 * renders it inline. Every other block becomes normal preformatted code with a
 * language class when the info string is a plain word, and its tokens are
 * highlighted when the info string names a known language.
 */
function codeBlock(node: Code): Element {
  if (diagramFence(node.lang ?? ''))
    return textElement('pre', { dataDiagram: 'mermaid' }, node.value);
  const language = (node.lang ?? '').toLowerCase();
  const code: Element = {
    type: 'element',
    tagName: 'code',
    properties: languagePattern.test(language)
      ? { className: [`language-${language}`] }
      : {},
    children: codeText(node, `${node.value}\n`),
  };
  const pre: Element = {
    type: 'element',
    tagName: 'pre',
    properties: {},
    children: [code],
  };
  // A block is a figure with its language as its caption (record 0174), so a
  // reader reads the language with no script, and the script of a published
  // page puts the copy action on the figure.
  const label = codeBlockLabel(node.lang ?? '');
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: [codeBlockClass] },
    children:
      label === null
        ? [pre]
        : [
            textElement('figcaption', { className: codeLabelClass }, label),
            pre,
          ],
  };
}

/** Reads a string property, or `null` when it is absent or not a string. */
function stringProperty(node: Element, name: string): string | null {
  const value = node.properties[name];
  return typeof value === 'string' ? value : null;
}

/** Replaces an element with a text-only placeholder, keeping its position. */
function replaceWith(
  node: Element,
  tagName: string,
  properties: Record<string, string>,
  children: ElementContent[],
): void {
  node.tagName = tagName;
  node.properties = properties;
  node.children = children;
}

/**
 * Reports whether the converter generated this link itself.
 *
 * A footnote reference and its back reference are the only links this pipeline
 * creates, and their fragment destinations are not author-supplied. Both the
 * marker attribute and the generated fragment must match, so an author cannot
 * exempt an arbitrary destination by writing a `data-footnote-ref` attribute:
 * a link of the author loses its tags in `keepAuthorHtml`, and this check
 * would still refuse it.
 */
function isFootnoteLink(node: Element): boolean {
  const marked =
    'dataFootnoteRef' in node.properties ||
    'dataFootnoteBackref' in node.properties;
  return (
    marked &&
    (stringProperty(node, 'href') ?? '').startsWith('#user-content-fn')
  );
}

/**
 * One link from this note to another note, as the policy classified it.
 *
 * A link that names an identifier states `id`, and a portable link states the
 * `path` that it resolved to. Exactly one of the two is a value. `fragment`
 * carries the heading of the destination in the namespaced form that the
 * renderer writes, or an empty text.
 */
export type NoteTarget = {
  /** The identifier of the destination, or `null` for a portable link. */
  readonly id: string | null;
  /** The stored path of the destination, or `null` for a link by identifier. */
  readonly path: string | null;
  /** The fragment with its `#`, already namespaced, or an empty text. */
  readonly fragment: string;
};

export type RenderMarkdownOptions = {
  /** The stored path of the note that holds the Markdown. */
  readonly sourcePath?: string;
  /** Maps an allowed attachment path to its transport-specific path. */
  readonly attachmentHref?: (path: string) => string | null;
  /**
   * Maps a link between two notes onto the address of this surface.
   *
   * A surface that opens some notes and not others passes this resolver. It
   * answers the address of a note that the surface opens, and `null` for every
   * other note. A `null` answer takes the blocked destination path below, so
   * the link keeps its text, loses its address, and discloses nothing.
   *
   * A surface that opens every note of the workspace leaves it out, and a link
   * between notes then keeps the address of the workspace itself. The
   * published page of decision 0031 is the surface that passes one.
   */
  readonly noteHref?: (target: NoteTarget) => string | null;
};

/**
 * The namespaced fragment of one destination, or an empty text.
 *
 * A destination that names an identifier carries the namespaced fragment
 * already, because `classifyUrl` writes it. A portable destination carries the
 * fragment as the author wrote it, so it is namespaced here. Both forms
 * therefore reach a resolver in the one shape that a rendered heading holds.
 */
function namespacedFragment(href: string, namespaced: boolean): string {
  const hash = href.indexOf('#');
  if (hash === -1) return '';
  const raw = href.slice(hash + 1);
  if (raw === '') return '';
  return namespaced ? `#${raw}` : `#user-content-${raw}`;
}

/**
 * Applies the URL policy to every link and image in the HTML tree.
 *
 * This runs on HTML nodes rather than Markdown nodes so that one pass covers
 * inline links, reference links, autolinks, images, and reference images. A
 * blocked destination keeps its visible text and loses its destination, so the
 * reader still sees what the author wrote.
 */
function applyUrlPolicy(options: RenderMarkdownOptions = {}) {
  return (tree: HastRoot): undefined => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'a') {
        if (isFootnoteLink(node)) return;
        const href = stringProperty(node, 'href');
        const target =
          href === null
            ? { kind: 'blocked' as const }
            : classifyUrl(href, options.sourcePath);
        if (target.kind === 'blocked') {
          replaceWith(node, 'span', { dataBlocked: 'link' }, node.children);
          return;
        }
        // A title is author text that the serializer escapes, so it is kept:
        // dropping it would lose content that a reader can see on hover.
        // An external destination opens outside the application, so it never
        // gets a window handle back. A `target` attribute is never emitted.
        const title = stringProperty(node, 'title');
        const rest = title === null ? {} : { title };
        // A surface that opens some notes and not others decides every link
        // between two notes. A note that it does not open, and a portable
        // destination that names no note at all, both lose the address here
        // rather than keeping one that this surface cannot serve.
        if (
          options.noteHref !== undefined &&
          (target.kind === 'note' || target.kind === 'relative')
        ) {
          const resolved = options.noteHref({
            id: target.kind === 'note' ? target.id : null,
            path: target.kind === 'relative' ? target.path : null,
            fragment: namespacedFragment(target.href, target.kind === 'note'),
          });
          if (resolved === null) {
            replaceWith(node, 'span', { dataBlocked: 'link' }, node.children);
            return;
          }
          node.properties = { href: resolved, ...rest };
          return;
        }
        node.properties =
          target.kind === 'external'
            ? { href: target.href, ...rest, rel: ['noopener', 'noreferrer'] }
            : { href: target.href, ...rest };
        return;
      }
      if (node.tagName !== 'img') return;
      const source = stringProperty(node, 'src');
      const alt = stringProperty(node, 'alt') ?? '';
      const target =
        source === null
          ? { kind: 'blocked' as const }
          : classifyUrl(source, options.sourcePath);
      if (target.kind === 'attachment' || target.kind === 'relative') {
        const title = stringProperty(node, 'title');
        const key = target.kind === 'attachment' ? target.id : target.path;
        // A resolver that answers nothing states that this surface serves no
        // bytes for that reference, so the picture becomes its own text.
        const src =
          options.attachmentHref === undefined
            ? target.href
            : options.attachmentHref(key);
        if (src === null) {
          replaceWith(node, 'span', { dataBlocked: 'image' }, [
            { type: 'text', value: alt },
          ]);
          return;
        }
        node.properties = title === null ? { src, alt } : { src, alt, title };
        return;
      }
      // An external picture is content, so it renders as a picture (decision
      // 0067). The sanitizer keeps `http` and `https` on an image source and
      // nothing else, and an image element runs no script, so the cost is the
      // request that the reader makes to the host of the picture.
      if (target.kind === 'external' && allowsExternalImage(target.href)) {
        const title = stringProperty(node, 'title');
        // The referrer never leaves with the request, so the host of the
        // picture learns that somebody asked for it and never which note
        // holds it. The picture loads when the reader reaches it.
        node.properties = {
          src: target.href,
          alt,
          ...(title === null ? {} : { title }),
          loading: 'lazy',
          referrerPolicy: 'no-referrer',
        };
        return;
      }
      replaceWith(node, 'span', { dataBlocked: 'image' }, [
        { type: 'text', value: alt },
      ]);
    });
  };
}

/** A line ending inside the text of one paragraph. */
const lineEnding = /[ \t]*(?:\r?\n|\r)[ \t]*/;

/**
 * Turns each soft line break into a hard break (decision 0107).
 *
 * The parser keeps a soft break as a line ending inside a text node. This step
 * splits that node, so the break reaches the HTML as the same `br` element a
 * backslash break gives. It runs on the tree of this renderer only, so the
 * parse that the editor, the links, and the index read stays CommonMark.
 *
 * Each list of children is written again once, with every split text in it.
 * A paragraph of many lines then costs its size: a splice for each text
 * moved the rest of the paragraph each time, and a text of a hundred
 * thousand lines ran the call out of stack.
 */
function showLineBreaks() {
  return (tree: MdastRoot): undefined => {
    visit(tree, (node) => {
      if (!('children' in node)) return;
      const children: Nodes[] = node.children;
      if (
        !children.some(
          (child) => child.type === 'text' && lineEnding.test(child.value),
        )
      )
        return;
      const result: Nodes[] = [];
      for (const child of children) {
        const lines =
          child.type === 'text' ? child.value.split(lineEnding) : [];
        if (lines.length <= 1) {
          result.push(child);
          continue;
        }
        for (const [at, value] of lines.entries()) {
          if (at > 0) result.push({ type: 'break' });
          if (value !== '') result.push({ type: 'text', value });
        }
      }
      children.length = 0;
      for (const kept of result) children.push(kept);
    });
  };
}

/**
 * Turns a block quote that opens with an alert marker into an alert.
 *
 * The marker is not content. It states the tone of the quote, so it leaves
 * the text and becomes one attribute and one title. A reader of the published
 * page then sees the same construct the note surface draws, and the marker
 * never reaches the page as literal text.
 *
 * A quote whose first line is not a marker is untouched, so an ordinary quote
 * keeps every character the author wrote.
 */
function applyAlerts() {
  return (tree: HastRoot): undefined => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'blockquote') return;
      const first = node.children.find((child) => child.type === 'element');
      if (first === undefined || first.tagName !== 'p') return;
      const opening = first.children[0];
      if (opening === undefined || opening.type !== 'text') return;
      const tone = alertToneOf(opening.value);
      if (tone === null) return;
      opening.value = opening.value.slice(alertMarkerLength(opening.value));
      // The marker owns the line it stands on, so the break that ends that
      // line leaves with it, and the alert text starts on the first line.
      // The line ending after the break is the start of the next text node,
      // which holds the alert text itself when the HTML parse of record 0157
      // joined the two, so only the line ending leaves.
      if (opening.value === '') {
        const next = first.children[1];
        if (next?.type === 'element' && next.tagName === 'br') {
          first.children.splice(1, 1);
          const after = first.children[1];
          if (after?.type === 'text') {
            after.value = after.value.replace(/^\r?\n/, '');
            if (after.value === '') first.children.splice(1, 1);
          }
        }
      }
      node.properties = {
        className: ['notes-alert'],
        dataAlert: tone,
      };
      // A quote that holds the marker alone keeps no empty paragraph, so the
      // alert is its title and nothing else.
      const body =
        opening.value === '' && first.children.length === 1
          ? node.children.filter((child) => child !== first)
          : node.children;
      node.children = [
        textElement('p', { className: 'notes-alert-title' }, alertTitle(tone)),
        ...body,
      ];
    });
  };
}

/**
 * The property that marks an element of the renderer through the HTML parse.
 *
 * Its value starts with a word that is new for each render, so the text of an
 * author cannot know it, and the sanitizer names no such property, so it never
 * reaches the reader.
 */
const rendererMark = 'dataNotesRenderer';

/** Whether a tree holds HTML that the author wrote. */
function holdsAuthorHtml(tree: HastRoot): boolean {
  let found = false;
  visit(tree, 'raw', () => {
    found = true;
    return false;
  });
  return found;
}

/** The properties of the elements of the renderer, by the mark of each. */
type RendererProperties = ReadonlyMap<string, Element['properties']>;

/**
 * Marks every element of the renderer with a value of one render.
 *
 * The answer keeps the properties of each element under its mark, so the
 * elements of the renderer leave the parse with exactly the properties they
 * had before it, whatever the parser writes for a value.
 */
function markRendererElements(
  tree: HastRoot,
  render: string,
): RendererProperties {
  const kept = new Map<string, Element['properties']>();
  visit(tree, 'element', (node) => {
    const mark = `${render}-${String(kept.size)}`;
    kept.set(mark, node.properties);
    node.properties = { ...node.properties, [rendererMark]: mark };
  });
  return kept;
}

/**
 * Applies the author list of `./html-elements.ts` under one parent.
 *
 * An element with a mark of this render belongs to the renderer: it gets its
 * own properties back, because the schema of the sanitizer decides it later.
 * Every other element is the work of the author. One of
 * `authorStrippedElements` leaves with its content, one outside
 * `authorElements` leaves its tags and keeps its children, and one on the
 * list keeps the attributes that the list names and nothing else.
 */
function keepAuthorChildren(
  children: readonly RootContent[],
  renderer: RendererProperties,
): RootContent[] {
  const kept: RootContent[] = [];
  for (const child of children) {
    if (child.type !== 'element') {
      kept.push(child);
      continue;
    }
    const element = child;
    // A template holds its children in a document of its own, so an
    // unclosed one took every later block of the note out of the page. Its
    // content goes back into the tree, and the template leaves its tags.
    if (element.tagName === 'template' && element.content !== undefined) {
      element.children = element.content.children.filter(
        (inner): inner is ElementContent => inner.type !== 'doctype',
      );
      delete element.content;
    }
    element.children = keepAuthorElements(element.children, renderer);
    const mark = element.properties[rendererMark];
    const own = typeof mark === 'string' ? renderer.get(mark) : undefined;
    if (own !== undefined) {
      element.properties = { ...own };
      kept.push(element);
      continue;
    }
    if (authorStrippedElements.includes(element.tagName)) continue;
    if (!authorElements.has(element.tagName)) {
      kept.push(...element.children);
      continue;
    }
    element.properties = authorProperties(element.tagName, element.properties);
    kept.push(element);
  }
  return kept;
}

/** The same rule for the children of an element, which are element content. */
function keepAuthorElements(
  children: readonly ElementContent[],
  renderer: RendererProperties,
): ElementContent[] {
  return keepAuthorChildren(children, renderer).filter(
    (child): child is ElementContent => child.type !== 'doctype',
  );
}

/**
 * Parses the HTML that the author wrote and keeps its safe set (record 0157).
 *
 * The Markdown to HTML stage keeps each HTML node of the note as a raw node.
 * `hast-util-raw` gives the tree to parse5, the parser of the HTML standard,
 * which joins an opening tag with its closing tag and repairs a broken
 * nesting the way a browser does. The elements of the renderer carry a mark
 * of this render through that parse, and `keepAuthorChildren` reads it.
 *
 * A note with no HTML skips the parse, so its tree stays exactly as the
 * Markdown to HTML stage wrote it. A tag of `neutralAuthorTags` is text before
 * the parse, so no unclosed tag reads the rest of the note as text. The
 * nesting of the HTML is bounded before the parse recurses on it:
 * `parseMarkdown` refuses a note whose HTML nests deeper than the limit
 * (`assertAuthorHtmlDepth` of `./limits.ts`), and `renderMarkdown` renders
 * only a tree that it gave.
 */
function keepAuthorHtml() {
  return (tree: HastRoot): HastRoot => {
    if (!holdsAuthorHtml(tree)) return tree;
    visit(tree, 'raw', (node) => {
      node.value = neutralizeAuthorTags(node.value);
    });
    const renderer = markRendererElements(tree, crypto.randomUUID());
    const parsed = raw(tree);
    if (parsed.type !== 'root')
      throw new Error('The HTML parse of a note gave no document.');
    parsed.children = keepAuthorChildren(parsed.children, renderer);
    return parsed;
  };
}

/**
 * Draws the check mark beside the box of each task (record 0033).
 *
 * The box is a disabled checkbox, and the page draws it from the theme. An
 * input holds no child, so the mark is the element after it: the line of the
 * check mark of `./task-mark.ts`, which the live preview draws as well. The
 * page shows it only while the box is checked.
 */
function drawTaskMarks() {
  return (tree: HastRoot): undefined => {
    visit(tree, 'element', (node, index, parent) => {
      if (
        node.tagName !== 'input' ||
        node.properties.type !== 'checkbox' ||
        parent === undefined ||
        index === undefined
      )
        return;
      const mark: Element = {
        type: 'element',
        tagName: 'svg',
        properties: { className: [taskMarkClass], ...taskMarkAttributes },
        children: [
          {
            type: 'element',
            tagName: 'polyline',
            properties: { points: taskMarkPoints },
            children: [],
          },
        ],
      };
      parent.children.splice(index + 1, 0, mark);
      return index + 2;
    });
  };
}

/** Plain text inside one rendered heading. */
function headingText(node: Element): string {
  let value = '';
  const collect = (children: readonly ElementContent[]): void => {
    for (const child of children) {
      if (child.type === 'text') value += child.value;
      else if (child.type === 'element') collect(child.children);
    }
  };
  collect(node.children);
  return value;
}

/** Adds unique, namespaced identifiers to headings for safe fragments. */
function addHeadingIdentifiers() {
  return (tree: HastRoot): undefined => {
    const used = new Map<string, number>();
    visit(tree, 'element', (node) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const base = headingSlug(headingText(node));
      if (base === '') return;
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      node.properties.id = `user-content-${base}${count === 0 ? '' : `-${String(count + 1)}`}`;
    });
  };
}

/**
 * Decodes the text content of one math placeholder back into source.
 *
 * The serializer escapes `<`, `>`, `&`, and quotes as named or numeric
 * entities. Only those entities are decoded here, so an author written
 * `&unknown;` stays exactly as written and cannot smuggle a tag boundary.
 */
function decodePlaceholderText(value: string): string {
  return value
    .replace(/&#x3[Cc];/g, '<')
    .replace(/&#x3[Ee];/g, '>')
    .replace(/&#x22;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x26;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** One rendered math placeholder with its display mode and escaped source. */
const mathPlaceholderPattern =
  /<span data-math="(inline|display)">([\s\S]*?)<\/span>/g;

/**
 * Replaces math placeholders with sanitized KaTeX markup.
 *
 * Each placeholder is decoded back to its source and rendered through
 * `./math.ts`. A source that exceeds a limit or that KaTeX refuses keeps its
 * placeholder, so the region stays editable source in the same pane. The
 * KaTeX HTML is already sanitized, so inserting it here does not reopen the
 * main sanitizer.
 */
function renderMathPlaceholders(html: string): string {
  return html.replace(
    mathPlaceholderPattern,
    (full, mode: string, escaped: string): string => {
      const display = mode === 'display';
      const source = decodePlaceholderText(escaped);
      let rendered: string;
      try {
        rendered = renderMath(source, display);
      } catch {
        return full;
      }
      const variant = display ? 'notes-math-display' : 'notes-math-inline';
      return `<span class="notes-math ${variant}" data-math="${mode}">${rendered}</span>`;
    },
  );
}
/** Checks addresses again after the HTML sanitizer, with the shared policy. */
function checkSanitizedUrls() {
  return (tree: HastRoot): undefined => {
    visit(tree, 'element', (node) => {
      for (const name of ['href', 'src'] as const) {
        const value = stringProperty(node, name);
        if (value === null) continue;
        const target = classifyUrl(value);
        if (
          (target.kind === 'blocked' && /^[^/?#]*:/.test(value)) ||
          (name === 'src' &&
            target.kind === 'external' &&
            !allowsExternalImage(value))
        )
          delete node.properties[name];
      }
    });
  };
}

function buildRenderProcessor(options: RenderMarkdownOptions = {}) {
  return createMarkdownProcessor()
    .use(showLineBreaks)
    .use(remarkRehype, {
      // The HTML of the author stays as raw nodes here, and `keepAuthorHtml`
      // parses it and keeps the safe set of record 0157 right after.
      allowDangerousHtml: true,
      // Footnote identifiers are namespaced here, so the sanitizer does not have
      // to namespace them a second time. See `sanitizeSchema`.
      clobberPrefix: 'user-content-',
      handlers: {
        code: (_state, node: Code) => codeBlock(node),
        inlineMath: (_state, node: InlineMathNode) => mathPlaceholder(node),
        math: (_state, node: MathNode) => mathPlaceholder(node),
        yaml: (_state, node: YamlNode) => frontMatterBlock(node),
      },
    })
    .use(keepAuthorHtml)
    .use(drawTaskMarks)
    .use(addHeadingIdentifiers)
    .use(applyAlerts)
    .use(applyUrlPolicy, options)
    .use(rehypeSanitize, sanitizeSchema)
    .use(checkSanitizedUrls)
    .use(rehypeStringify)
    .freeze();
}

const renderProcessor = buildRenderProcessor();

/**
 * Loads the parser of every language that a fence of the tree names.
 *
 * The Markdown to HTML stage runs with no wait, so each parser it needs is
 * ready before it starts. A parser that fails to load leaves its fence plain
 * text, which is what an unknown language gives as well.
 */
async function loadFenceParsers(tree: MdastRoot): Promise<void> {
  const loads: Promise<unknown>[] = [];
  visit(tree, 'code', (node) => {
    const language = codeLanguageOf(node.lang ?? '');
    if (language !== null)
      loads.push(loadCodeParser(language).catch(() => null));
  });
  await Promise.all(loads);
}

/**
 * Renders `source` into sanitized HTML.
 *
 * Rejects with `MarkdownLimitError` when the document is too large or nests
 * too deeply; see `./limits.ts`. Math that renders becomes sanitized KaTeX;
 * math that fails keeps its source placeholder. Every other document renders,
 * and unknown syntax simply stays text.
 */
export async function renderMarkdown(
  source: string,
  options: RenderMarkdownOptions = {},
): Promise<string> {
  // `parseMarkdown` applies the size and depth guards, and it uses the same
  // Markdown plugins as this processor, so the tree it returns is the tree
  // this processor would have produced.
  const tree = parseMarkdown(source);
  await loadFenceParsers(tree);
  const processor =
    options.attachmentHref === undefined &&
    options.noteHref === undefined &&
    options.sourcePath === undefined
      ? renderProcessor
      : buildRenderProcessor(options);
  const html = processor.stringify(await processor.run(tree));
  return renderMathPlaceholders(html);
}
