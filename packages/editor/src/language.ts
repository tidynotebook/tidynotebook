/**
 * The one Markdown grammar of the editor.
 *
 * `@codemirror/lang-markdown` runs the Lezer Markdown parser. This module
 * configures it to the flavor that `@notesapp/markdown` defines: CommonMark,
 * the GFM bundle (tables, task items, strikethrough, autolinks), YAML front
 * matter, the shared math delimiter rule, and GFM footnotes (record 0156). The maintained YAML front
 * matter wrapper gives the body to the Markdown parser and parses the leading
 * metadata as YAML. It does not evaluate or export a metadata value. Every
 * decoration, the outline, and every widget read `syntaxTree(state)` of the
 * language built here.
 *
 * Code inside a fence is parsed by a second language when one is known for
 * the info string. The list of those languages and the map of their tokens
 * live in `@notesapp/markdown`, which highlights the published page with the
 * same languages (records 0159 and 0173), so a fence reads one way on both
 * surfaces, and its indentation and comment markers are those of its
 * language. The languages load on demand, so the initial bundle carries none
 * of them.
 */
import {
  HighlightStyle,
  LanguageDescription,
  LanguageSupport,
  syntaxHighlighting,
} from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import {
  headlessNoteMarkdown,
  markdownWithFences,
} from './headless-markdown.ts';
export { parsedWhole, type ParsedWholeOptions } from './headless-markdown.ts';
import {
  codeLanguageOf,
  codeLanguages as fenceLanguages,
  codeTokenTags,
  loadCodeLanguage,
  type CodeLanguage,
  type CodeToken,
} from '@notesapp/markdown';

/**
 * The CodeMirror language of one entry of the shared list.
 *
 * It is the one language object that the renderer highlights with (record
 * 0173), so the editor highlights exactly the tokens that the published page
 * highlights, and a fence takes the indentation, the folding data and the
 * comment markers of its language.
 */
async function fenceSupport(language: CodeLanguage): Promise<LanguageSupport> {
  return new LanguageSupport(await loadCodeLanguage(language));
}

/**
 * The languages a fenced code block can be highlighted with.
 *
 * One description for each entry of the shared list of `@notesapp/markdown`,
 * in its order. Each entry loads on first use. An unknown info string is not
 * an error: the fence body stays plain monospaced text with the language
 * label visible.
 */
export const codeLanguages: readonly LanguageDescription[] = fenceLanguages.map(
  (language) =>
    LanguageDescription.of({
      name: language.name,
      alias: [...language.aliases],
      extensions: [...language.extensions],
      load: () => fenceSupport(language),
    }),
);

/**
 * The language of the info string of one fence, or `null`.
 *
 * The shared rule of `codeLanguageOf` decides it, so the renderer and the
 * editor pick one language for one fence.
 */
export function fenceLanguageOf(info: string): LanguageDescription | null {
  const language = codeLanguageOf(info);
  if (language === null) return null;
  return (
    codeLanguages.find((description) => description.name === language.name) ??
    null
  );
}

/**
 * The colours of code inside a fence.
 *
 * Only code tags appear here. Markdown's own tags (heading, emphasis, link)
 * are left out on purpose: the live preview decorations style those, and two
 * sources of truth for one appearance is what this rebuild removes.
 *
 * Every colour is one syntax variable of the active theme, which the theme
 * registry writes on the document element. A theme switch therefore repaints
 * the code of an open note without reconfiguring the editor.
 *
 * `syntaxTokenNames` is the shared contract of colour names between this
 * package and the `syntax` group of a theme in `@notesapp/ui`. A unit test
 * asserts the two lists agree, so the editor and the registry name the same
 * colours. `heading` and `link` stay in the contract because every theme still
 * declares them, but the code style below no longer reads them: a Markdown
 * heading and a Markdown link take their colour from the note typography in
 * the live preview, not from the code palette.
 */
export const syntaxTokenNames = [
  'keyword',
  'string',
  'comment',
  'number',
  'tag',
  'attribute',
  'heading',
  'link',
  'punctuation',
] as const;

/** The colour of one code token, from the palette of the active theme. */
function tokenColour(token: CodeToken): string {
  return token === 'invalid'
    ? 'var(--notes-danger-text)'
    : `var(--notes-syntax-${token})`;
}

/**
 * The highlight specs for code inside a fence.
 *
 * One spec for each token of `codeTokenTags` in `@notesapp/markdown`, which
 * is the one map from a Lezer tag to a code token. The renderer writes its
 * classes from the same map, so a token of the editor and a token of the
 * published page take one colour. A comment leans, on both surfaces.
 * Exported so a unit test can hold the boundary of the map.
 */
export const codeHighlightSpecs = codeTokenTags.map((entry) => ({
  tag: [...entry.tags],
  color: tokenColour(entry.token),
  ...(entry.token === 'comment' ? { fontStyle: 'italic' } : {}),
}));

const codeHighlightStyle = HighlightStyle.define(codeHighlightSpecs);

/** Whether a reader needs the lazy fence parsers of the view. */
export type NoteMarkdownOptions = {
  /**
   * A headless reader needs the Markdown structure, not fence highlighting.
   * Omit the lazy fence parsers so this synchronous read waits for no load.
   * The view keeps them by default. HTML and other fixed nested parsers stay.
   */
  readonly headless?: boolean;
};

/**
 * The Markdown language support of the note editor.
 *
 * `addKeymap` stays on, so Enter continues a list and a quote the way the
 * upstream Markdown package defines it. Formatting shortcuts are added
 * separately by the keymap module.
 */
export function noteMarkdown(
  options: NoteMarkdownOptions = {},
): LanguageSupport {
  return options.headless === true
    ? headlessNoteMarkdown()
    : markdownWithFences(fenceLanguageOf);
}

/** The language plus the colors its fenced code needs. */
export function noteMarkdownExtensions(
  options: NoteMarkdownOptions = {},
): Extension {
  return [noteMarkdown(options), syntaxHighlighting(codeHighlightStyle)];
}
