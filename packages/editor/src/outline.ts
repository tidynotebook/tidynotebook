/**
 * The note outline, read with the shared Markdown grammar.
 *
 * The outline panel used to hold a third definition of what a heading is,
 * which did not know about fenced code and disagreed with both the renderer
 * and the preview. It uses the same grammar as the preview, so a
 * `#` inside a code fence is code in every surface.
 *
 * This function takes a state and returns cached rows. It never
 * dispatches, never focuses, and never touches the DOM. The caller moves the
 * cursor with the offsets it returns.
 */
import { syntaxTree } from '@codemirror/language';
import { EditorState, type Text } from '@codemirror/state';
import { markdownGrammarOn } from './grammar-gate.ts';
import { noteMarkdown, parsedWhole } from './language.ts';
import { contentText, headingLevel } from './live-preview.ts';

/** One heading row of the outline. */
export type OutlineHeading = {
  /** One to six. */
  readonly level: number;
  /** The heading text with its markers removed. */
  readonly text: string;
  /** The start of the heading in the document. */
  readonly from: number;
  /** The end of the heading in the document. */
  readonly to: number;
};

// Immutable documents are shared by selection, scroll, and parser updates.
// Weak keys let old documents and their rows go when undo no longer holds them.
const outlines = new WeakMap<Text, readonly OutlineHeading[]>();

/**
 * Lists the headings of one document in order.
 *
 * ATX and setext headings both appear. A heading with no text is left out,
 * because an empty row cannot be read or activated.
 */
export function outlineOf(state: EditorState): readonly OutlineHeading[] {
  if (!markdownGrammarOn(state)) return [];
  const known = outlines.get(state.doc);
  if (known !== undefined) return known;
  // The live tree can stop at the initial viewport. Background parsing does
  // not change the document, so the panel cannot wait for it to add rows.
  // Read the complete structure without loading fence highlight languages.
  const complete = parsedWhole(
    EditorState.create({
      doc: state.doc,
      extensions: [noteMarkdown({ headless: true })],
    }),
  );
  const found: OutlineHeading[] = [];
  syntaxTree(complete).iterate({
    enter: (node) => {
      const level = headingLevel(node.name);
      if (level === 0) return true;
      const text = contentText(complete, node.from, node.to);
      if (text !== '')
        found.push({ level, text, from: node.from, to: node.to });
      return false;
    },
  });
  outlines.set(state.doc, found);
  return found;
}
