/**
 * Public entry point of the shared Markdown package.
 *
 * The editor, the server, and the reading surface all read a note through
 * these functions, so one document renders the same way everywhere and one
 * policy decides what a reader can reach.
 *
 * `parseMarkdown` gives the tree with source offsets. `extractLinks` and
 * `extractAttachmentRefs` give the references a caller resolves through the
 * generated API operations. `renderMarkdown` gives sanitized HTML. Every one
 * of them refuses a document that is larger or deeper than `markdownLimits`
 * allows by throwing `MarkdownLimitError`. Nothing in this package performs
 * input or output of any kind.
 */
export type { Root } from 'mdast';
export type { AlertTone } from './alerts.ts';
export {
  alertMarkerLength,
  alertTitle,
  alertToneOf,
  alertTones,
} from './alerts.ts';
export { parseMarkdown } from './parse.ts';
export type { AttachmentRef, NoteLink, SourceRange } from './links.ts';
export { extractAttachmentRefs, extractLinks } from './links.ts';
export type { MarkdownLimitReason } from './limits.ts';
export { markdownLimits, MarkdownLimitError } from './limits.ts';
export type { ContentUrl } from './policy.ts';
export { allowsExternalImage, classifyUrl, isIdentifier } from './policy.ts';
export type {
  LegacyReferenceMap,
  PortableMigration,
  ReferenceRewrite,
} from './rewrite.ts';
export {
  migrateLegacyReferences,
  portableRelativePath,
  rewriteRelativeReferences,
} from './rewrite.ts';
export type { DisplayMathFence, InlineMathDelimiter } from './math-syntax.ts';
export {
  closingDisplayMathFence,
  displayMathFenceChar,
  displayMathFenceMin,
  inlineMathDelimiters,
  openingDisplayMathFence,
  singleDollarTextMath,
} from './math-syntax.ts';
export type { OrderedMarkerStyle } from './ordered-markers.ts';
export {
  orderedMarkerLabel,
  orderedMarkerStyle,
  orderedMarkerStyles,
} from './ordered-markers.ts';
export type { MathRenderReason } from './math.ts';
export {
  isSafeMathStyle,
  mathLimits,
  MathRenderError,
  renderMath,
} from './math.ts';
export type { NoteTarget, RenderMarkdownOptions } from './render.ts';
export { headingSlug, renderMarkdown } from './render.ts';
