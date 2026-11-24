import { syntaxTree } from '@codemirror/language';
import { EditorState, type Text } from '@codemirror/state';
import { headlessNoteMarkdown, parsedWhole } from './headless-markdown.ts';
import { contentText, headingLevel } from './heading-text.ts';

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

/** Reads the shared Markdown grammar without mounting an editor. */
export function outlineOfSource(doc: string | Text): readonly OutlineHeading[] {
  const complete = parsedWhole(
    EditorState.create({
      doc,
      extensions: [headlessNoteMarkdown()],
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
  return found;
}
