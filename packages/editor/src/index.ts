/**
 * Public entry point of the live Markdown editor package.
 *
 * The package knows Markdown and local editor commands only. It never
 * imports endpoints, database tables, token storage, or the generated API
 * client; navigation leaves through injected callbacks.
 */
export type {
  AlignedLine,
  DiffHunk,
  DiffResult,
  HunkDecision,
  LineChangeCount,
} from './unified-diff.ts';
export {
  alignLines,
  compareLines,
  countHunkLines,
  diffContextLines,
  maxDiffEdits,
  mergeHunks,
} from './unified-diff.ts';
export type { CreateEditorOptions } from './create-editor.ts';
export {
  createEditor,
  emptyNoteHint,
  livePreviewExtensions,
  setEditorReadOnly,
  setEditorRich,
  setEditorSpellCheck,
  setEditorTheme,
} from './create-editor.ts';
export type {
  EditorNavigation,
  LinkSpan,
  LinkTarget,
  TaskBox,
} from './commands.ts';
export type { NoteChoice, NoteLinkSource } from './completion.ts';
export { noteLinkText, relativeNotePath } from './completion.ts';
export { openFindAndReplace, setNoteLinkSource } from './extensions.ts';
export type {
  EditorShortcut,
  FormatAction,
  FormatActionId,
  FormatScope,
  TableActionId,
} from './keymaps.ts';
export {
  formatActionApplies,
  formatActionOf,
  formatActions,
  runFormatAction,
  runTableAction,
  shortcuts,
} from './keymaps.ts';
export type {
  ScreenRect,
  TableMenuOpener,
  TableMenuRequest,
} from './table-controls.ts';
export { tableControlLabels } from './table-controls.ts';
export type { FormatContext } from './format-context.ts';
export { plainTextContext } from './format-context.ts';
export { htmlToMarkdown } from './paste.ts';
export { takeMarginTaps } from './list-marker.ts';
export type { EditorState } from '@codemirror/state';
export type { EditorView } from '@codemirror/view';
export {
  findTaskBox,
  insertText,
  linkSpanAt,
  taskToggleAt,
  toggleTaskSpec,
} from './commands.ts';
export {
  editorTheme,
  editorThemeVariables,
  noteSurfaceStyle,
  touchFieldQuery,
} from './editor-theme.ts';
export {
  codeLanguages,
  noteMarkdown,
  noteMarkdownExtensions,
  syntaxTokenNames,
} from './language.ts';
export { mathMarkdownExtension } from './math-syntax.ts';
export type { OutlineHeading } from './outline.ts';
export { outlineOf } from './outline.ts';
export type {
  DelimiterPart,
  PreviewBuild,
  PreviewNode,
  PreviewRange,
} from './live-preview.ts';
export {
  buildPreview,
  contentText,
  delimiterRowParts,
  headingLevel,
  livePreview,
  previewStructureOf,
  tableAlignments,
} from './live-preview.ts';
export type {
  DiagramHandle,
  ImageOpenRequest,
  RichWidget,
  RichWidgetKind,
  RichWidgetResolvers,
  RichWidgetSet,
} from './widgets.ts';
export {
  attachmentIdOf,
  buildRichWidgets,
  findRichRegions,
  isExternalImage,
  richLimits,
  richWidgets,
  shouldPreserveAsSource,
} from './widgets.ts';
export {
  bindDocument,
  openBoundNote,
  type BoundNote,
  isRemoteChange,
  remoteWorkGate,
  type DocumentBinding,
  type RemoteWorkGate,
} from './document-binding.ts';
