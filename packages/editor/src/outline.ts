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
import type { EditorState, Text } from '@codemirror/state';
import { markdownGrammarOn } from './grammar-gate.ts';
import { outlineOfSource, type OutlineHeading } from './outline-source.ts';
export type { OutlineHeading } from './outline-source.ts';

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
  const headings = outlineOfSource(state.doc);
  outlines.set(state.doc, headings);
  return headings;
}
