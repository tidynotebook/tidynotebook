/**
 * Public entry point of the shared Markdown package.
 *
 * The editor, the server, and the reading surface all read a note through
 * these functions, so one document renders the same way everywhere and one
 * policy decides what a reader can reach.
 *
 * `parseMarkdown` gives the tree with source offsets. `extractLinks` and
 * `extractAttachmentRefs` give the references a caller resolves through the
 * generated API operations. `readableText` gives the words a reader sees,
 * the one plain text of a note that search indexes and quotes (records 0162
 * and 0167), and `indexNote` gives the links and that text from one parse.
 * `renderMarkdown` gives sanitized HTML. Every one of them refuses a document
 * that is larger or deeper than `markdownLimits` allows by throwing
 * `MarkdownLimitError`. Nothing in this package performs input or output of
 * any kind.
 */
export type { Root } from 'mdast';
export type { AlertTone } from './alerts.ts';
export {
  alertMarkerLength,
  alertTitle,
  alertToneOf,
  alertTones,
} from './alerts.ts';
export type { LineLimits } from './parse.ts';
export {
  limitsOfMeasure,
  lineLimits,
  parseMarkdown,
  withinParseLimits,
} from './parse.ts';
export type { AttachmentRef, NoteLink, SourceRange } from './links.ts';
export { extractAttachmentRefs, extractLinks, indexNote } from './links.ts';
export type { MarkdownLimitReason, PartsMeasure } from './limits.ts';
export {
  blankLine,
  markdownLimits,
  MarkdownLimitError,
  measureParts,
  vouchedPartMarks,
} from './limits.ts';
export type { ContentUrl } from './policy.ts';
export { allowsExternalImage, classifyUrl, isIdentifier } from './policy.ts';
export type {
  LegacyReferenceMap,
  PortableMigration,
  ReferenceRewrite,
} from './rewrite.ts';
export {
  mapRelativeReferences,
  migrateLegacyReferences,
  portableRelativePath,
  rewriteRelativeReferences,
} from './rewrite.ts';
export type { DisplayMathFence, InlineMathDelimiter } from './math-syntax.ts';
export {
  closesDollarMath,
  closingDisplayMathFence,
  displayMathFenceChar,
  displayMathFenceMin,
  dollarMathEnd,
  inlineMathDelimiters,
  openingDisplayMathFence,
  opensDollarMath,
  singleDollarTextMath,
} from './math-syntax.ts';
export {
  footnoteIdentifier,
  footnoteLabelEnd,
  footnoteLabelMax,
  footnoteLabelOpen,
} from './footnote-syntax.ts';
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
export type { ReadableTextOptions } from './plain-text.ts';
export {
  blockSeparator,
  readableText,
  markdownWordCount,
} from './plain-text.ts';
export type { CodeLanguage } from './code-languages.ts';
export {
  codeBlockLabel,
  codeLanguageOf,
  diagramFence,
  codeLanguages,
  loadCodeLanguage,
  loadCodeParser,
} from './code-languages.ts';
export type { CodeToken, CodeTokenTags } from './code-tokens.ts';
export {
  codeBlockClass,
  codeLabelClass,
  codeTokenClass,
  codeTokenClasses,
  codeTokenNames,
  codeTokenTags,
} from './code-tokens.ts';
export type {
  AuthorAttribute,
  AuthorAttributeValue,
  HtmlTag,
} from './html-elements.ts';
export {
  authorElements,
  authorStrippedElements,
  previewHtmlElements,
  previewHtmlTag,
} from './html-elements.ts';
export { taskMarkClass, taskMarkPoints } from './task-mark.ts';
export type { NoteTarget, RenderMarkdownOptions } from './render.ts';
export { renderMarkdown } from './render.ts';
export type { WikiConversion, WikiResolver } from './wiki-links.ts';
export {
  convertWikiLinks,
  noteLinkLabel,
  standardNoteLink,
  wikiLinkResolver,
} from './wiki-links.ts';
export { headingSlug } from './heading-slug.ts';
