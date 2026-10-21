/**
 * Content policy for stored Markdown.
 *
 * This module owns two decisions that every reader of a note depends on: which
 * URL a rendered document may point at, and which HTML elements and attributes
 * may survive rendering. The editor, the server, and the reading surface all
 * import the same policy, so a note renders under identical rules everywhere.
 *
 * External links use a deny list. Unknown path shapes, elements, and
 * attributes are removed. Nothing here
 * fetches anything; a caller resolves an internal reference through the
 * generated API operations.
 */
import type { Options as SanitizeSchema } from 'rehype-sanitize';
import { alertTones } from './alerts.ts';
import {
  codeBlockClass,
  codeLabelClass,
  codeTokenClasses,
} from './code-tokens.ts';
import {
  authorElements,
  authorStrippedElements,
  type AuthorAttribute,
} from './html-elements.ts';
import {
  taskMarkAttributes,
  taskMarkClass,
  taskMarkPoints,
} from './task-mark.ts';

/**
 * Shape of a canonical identifier, as written in stored Markdown.
 *
 * The check is a shape check only. It accepts the RFC 9562 text form with a
 * version between 1 and 8 and a variant of 8, 9, a, or b. It rejects the nil
 * and maximum identifiers, so a placeholder cannot become a link target.
 */
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Reports whether `value` has the canonical identifier shape. */
export function isIdentifier(value: string): boolean {
  return uuidPattern.test(value.toLowerCase());
}

/** A classified link or image destination. */
export type ContentUrl =
  | { readonly kind: 'note'; readonly id: string; readonly href: string }
  | { readonly kind: 'attachment'; readonly id: string; readonly href: string }
  | {
      readonly kind: 'relative';
      /** The decoded, workspace-root-relative target path. */
      readonly path: string;
      /** The portable destination as it appears in rendered HTML. */
      readonly href: string;
    }
  | { readonly kind: 'fragment'; readonly href: string }
  | {
      readonly kind: 'external';
      readonly href: string;
      readonly protocol: string;
    }
  | { readonly kind: 'blocked' };

const blocked: ContentUrl = { kind: 'blocked' };
/**
 * Reports whether the text holds a control character.
 *
 * A control character can hide a scheme from a reader and from a simple check,
 * for example a tab inside `java<tab>script:`, so a destination that holds one
 * is blocked. The scan is a loop and not a regular expression, because a
 * control character inside a pattern is invisible to a reviewer.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Schemes that can run code or open local content. */
const blockedSchemes = new Set([
  'javascript:',
  'vbscript:',
  'data:',
  'blob:',
  'file:',
]);
const notePath = /^\/notes\/([^/?#]+)(#[A-Za-z0-9_-]+)?$/;
const attachmentPath = /^\/attachments\/([^/?#]+)$/;
const localFragment = /^#([A-Za-z0-9_-]+)$/;

/** A scheme at the start of a destination. */
const anyScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Resolves a portable destination against the folder of one stored note. */
function relativeTarget(url: string, sourcePath: string): string | null {
  const hash = url.indexOf('#');
  const encodedPath = hash === -1 ? url : url.slice(0, hash);
  const rawFragment = hash === -1 ? '' : url.slice(hash);
  if (encodedPath === '' || encodedPath.includes('?')) return null;
  if (rawFragment !== '' && !localFragment.test(rawFragment)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
  if (
    decoded === '' ||
    decoded.startsWith('/') ||
    decoded.includes('\\') ||
    hasControlCharacter(decoded)
  )
    return null;
  const base = sourcePath.split('/');
  base.pop();
  for (const part of decoded.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (base.length === 0) return null;
      base.pop();
      continue;
    }
    base.push(part.normalize('NFC'));
  }
  return base.length === 0 ? null : base.join('/');
}

/**
 * Classifies an author-supplied destination.
 *
 * A parsed absolute URL is external unless its scheme can run code or open
 * local content. Internal references, fragments, and portable paths keep
 * their own checks. A malformed address or identifier is blocked.
 */
export function classifyUrl(raw: string, sourcePath = ''): ContentUrl {
  const url = raw.trim();
  if (url === '' || hasControlCharacter(url)) return blocked;
  if (url.startsWith('//')) return blocked;
  const fragment = localFragment.exec(url)?.[1];
  if (fragment !== undefined)
    return { kind: 'fragment', href: `#user-content-${fragment}` };
  if (url.startsWith('/')) {
    const noteMatch = notePath.exec(url);
    const note = noteMatch?.[1];
    if (note !== undefined) {
      const id = note.toLowerCase();
      return isIdentifier(id)
        ? {
            kind: 'note',
            id,
            href: `/notes/${id}${
              noteMatch?.[2] === undefined
                ? ''
                : `#user-content-${noteMatch[2].slice(1)}`
            }`,
          }
        : blocked;
    }
    const attachment = attachmentPath.exec(url)?.[1];
    if (attachment !== undefined) {
      const id = attachment.toLowerCase();
      return isIdentifier(id)
        ? { kind: 'attachment', id, href: `/attachments/${id}` }
        : blocked;
    }
    return blocked;
  }
  if (anyScheme.test(url)) {
    try {
      const parsed = new URL(url);
      return blockedSchemes.has(parsed.protocol)
        ? blocked
        : { kind: 'external', href: url, protocol: parsed.protocol };
    } catch {
      return blocked;
    }
  }
  if (url.includes(':')) return blocked;
  const path = relativeTarget(url, sourcePath);
  return path === null ? blocked : { kind: 'relative', path, href: url };
}

/**
 * The one scheme an external picture may use.
 *
 * Decision 0067 loads an external picture, and the content policy of the
 * application shell and of the published page names `https:` alone. A picture
 * over plain HTTP is refused here rather than blocked by the browser later,
 * so one rule decides it and the reader sees the alt text instead of an empty
 * box.
 */
const secureImageScheme = /^https:/i;

/** Whether an external destination may load as a picture. */
export function allowsExternalImage(href: string): boolean {
  return secureImageScheme.test(href.trim());
}

/**
 * The only identifier shape the renderer may emit.
 *
 * mdast-util-to-hast writes a footnote identifier as `user-content-fn-<label>`
 * or `user-content-fnref-<label>`. Requiring the prefix and one following
 * character keeps every identifier inside that namespace.
 */
const namespacedId = /^user-content-[A-Za-z0-9]/;
const headingOrFootnoteId = /^(?:footnote-label|user-content-[A-Za-z0-9])/;

/** The attribute list of every element of the schema, by tag name. */
type SchemaAttributes = NonNullable<SanitizeSchema['attributes']>;

/** One attribute of the author list, as the sanitizer names it. */
function schemaAttribute(
  attribute: AuthorAttribute,
): SchemaAttributes[string][number] {
  return attribute.value.kind === 'word'
    ? [attribute.name, ...attribute.value.words]
    : attribute.name;
}

/**
 * Adds the elements and the attributes of the author list to the schema.
 *
 * `./html-elements.ts` is the one list of the HTML that an author may write
 * (record 0157). The renderer applies it first, and this schema names the
 * same elements and attributes again, so the sanitizer stays the last gate
 * behind it and the two cannot drift.
 */
function withAuthorAttributes(
  renderer: Readonly<SchemaAttributes>,
): SchemaAttributes {
  const merged: SchemaAttributes = { ...renderer };
  for (const [tagName, attributes] of authorElements)
    merged[tagName] = [
      ...(renderer[tagName] ?? []),
      ...attributes.map(schemaAttribute),
    ];
  return merged;
}

/** Every element of the schema, the renderer set and the author set. */
function withAuthorElements(renderer: readonly string[]): string[] {
  return [...new Set([...renderer, ...authorElements.keys()])].sort();
}

/**
 * The sanitization schema for rendered notes.
 *
 * It is written out rather than derived from the rehype-sanitize GitHub
 * schema. The renderer lists the elements that it emits itself below, and
 * `./html-elements.ts` lists the elements that an author may write, which the
 * renderer has already applied (record 0157). An explicit list is easier to
 * review than a derived one.
 *
 * Additions over the plain CommonMark set are the GFM table elements, the
 * disabled task-list checkbox and its check mark, the footnote section with
 * its back references, the alert attributes of a block quote, the token
 * classes of highlighted code (record 0159), and the placeholder elements
 * for math and diagrams.
 *
 * An image source accepts `https` as well as an internal path, because
 * decision 0067 loads an external picture. An image element runs no script,
 * and every other scheme, `javascript:` and `data:` among them, is still
 * refused.
 *
 * Math renders through `./math.ts`, which sanitizes KaTeX HTML on its own
 * and inserts it after this schema ran. The main pipeline therefore keeps
 * only the `data-math` placeholder. The class and `aria-hidden` entries below
 * exist so that a second pass of this schema over already rendered math, for
 * example on a reading surface, keeps the KaTeX layout classes without
 * reopening a style or URL surface: `style` stays dropped here and is owned
 * by the math sanitizer alone.
 *
 * `clobberPrefix` is empty on purpose. The renderer already asks
 * mdast-util-to-hast for the `user-content-` prefix, so a footnote identifier
 * is namespaced before this stage. Prefixing a second time here would rename
 * the identifier without renaming the fragment that points at it, which breaks
 * every footnote back reference. Because this schema does not add the prefix,
 * it requires it instead: an `id` must start with `user-content-` and a
 * character, so a note cannot claim a plain identifier such as `submit` and
 * clobber a form control or a script variable.
 *
 * That prefix is shared by every note. A page that renders one note is
 * therefore safe, which is what the reading surface does. A page that
 * renders several notes at once must scope the footnote identifiers itself,
 * for example by rendering each note in its own document fragment; two notes
 * with the same footnote label would otherwise produce the same identifier.
 *
 * A `title` on a link or an image is author text. It is kept, because a reader
 * can see it and losing it would lose content. The serializer escapes it, so
 * it cannot carry markup, and it holds no URL.
 */
export const sanitizeSchema: SanitizeSchema = {
  strip: [...authorStrippedElements],
  clobber: [],
  clobberPrefix: '',
  protocols: {
    // applyUrlPolicy checks each href before this schema runs. A scheme list
    // here would remove custom protocol handlers that the shared policy allows.
    // An image source is an internal attachment path, which carries no
    // scheme, or the secure external address that decision 0067 keeps. Every
    // other scheme, `javascript:` and `data:` first, is refused here.
    src: ['https'],
  },
  ancestors: {
    input: ['li'],
    li: ['ol', 'ul'],
    // The check mark of a task box stands beside the box, inside its item.
    polyline: ['svg'],
    svg: ['li'],
    tbody: ['table'],
    td: ['table'],
    tfoot: ['table'],
    th: ['table'],
    thead: ['table'],
    tr: ['table'],
  },
  required: { input: { type: 'checkbox', disabled: true } },
  tagNames: withAuthorElements([
    'a',
    'blockquote',
    'br',
    'code',
    'del',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'img',
    'input',
    'li',
    'ol',
    'p',
    'polyline',
    'pre',
    'section',
    'span',
    'strong',
    'sup',
    'svg',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
  ]),
  attributes: withAuthorAttributes({
    // A code block and its label (record 0174). An author writes no class, so
    // only the renderer gives a figure these names.
    figure: [['className', codeBlockClass]],
    figcaption: [['className', codeLabelClass]],
    blockquote: [
      ['className', 'notes-alert'],
      ['dataAlert', ...alertTones],
    ],
    a: [
      'href',
      'title',
      'ariaDescribedBy',
      'ariaLabel',
      'dataFootnoteBackref',
      'dataFootnoteRef',
      ['className', 'data-footnote-backref'],
      ['id', namespacedId],
      ['rel', 'noopener', 'noreferrer'],
    ],
    h1: [['id', namespacedId]],
    code: [['className', /^language-[a-z0-9_-]+$/]],
    h2: [
      ['className', 'sr-only'],
      ['id', headingOrFootnoteId],
    ],
    h3: [['id', namespacedId]],
    h4: [['id', namespacedId]],
    h5: [['id', namespacedId]],
    h6: [['id', namespacedId]],
    img: [
      'alt',
      'src',
      'title',
      ['loading', 'lazy'],
      ['referrerPolicy', 'no-referrer'],
    ],
    input: [
      ['type', 'checkbox'],
      ['disabled', true],
      ['checked', true],
    ],
    li: [
      ['className', 'task-list-item'],
      ['id', namespacedId],
    ],
    ol: ['start', ['className', 'contains-task-list']],
    p: [['className', 'notes-alert-title']],
    // The check mark of `./task-mark.ts`, with exactly the values that the
    // renderer writes, so no other drawing passes.
    polyline: [['points', taskMarkPoints]],
    pre: [
      ['dataDiagram', 'mermaid'],
      ['dataFrontmatter', 'yaml'],
    ],
    section: [
      'dataFootnotes',
      ['className', 'footnotes'],
      ['id', namespacedId],
    ],
    sup: [['id', namespacedId]],
    svg: [
      ['className', taskMarkClass],
      ...Object.entries(taskMarkAttributes).map(
        ([name, value]): [string, string] => [name, value],
      ),
    ],
    span: [
      ['dataMath', 'inline', 'display'],
      ['dataBlocked', 'link', 'image'],
      'ariaHidden',
      [
        'className',
        ...codeTokenClasses,
        'notes-math',
        'notes-math-inline',
        'notes-math-display',
        'katex',
        'katex-display',
        'katex-html',
        'base',
        'strut',
        'mord',
        'mop',
        'mbin',
        'mrel',
        'mopen',
        'mclose',
        'mpunct',
        'minner',
        'vlist-t',
        'vlist-r',
        'vlist',
        'pstrut',
        'mtight',
        'mspace',
        'msupsub',
        'sizing',
        'delimsizing',
        'fontsize-ensurer',
        'svg-align',
        'hide-tail',
        'thinbox',
        'mathnormal',
        'text',
        /^katex[a-z-]*$/,
        /^reset-size[0-9]*$/,
        /^size[0-9]*$/,
      ],
    ],
    td: [['align', 'center', 'left', 'right']],
    th: [['align', 'center', 'left', 'right']],
    ul: [['className', 'contains-task-list']],
    '*': [],
  }),
};
