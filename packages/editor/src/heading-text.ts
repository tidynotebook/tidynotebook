import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/** The heading level of an ATX or setext heading node name, or 0. */
export function headingLevel(name: string): number {
  const atx = /^ATXHeading([1-6])$/.exec(name);
  if (atx !== null) return Number(atx[1]);
  const setext = /^SetextHeading([12])$/.exec(name);
  if (setext !== null) return Number(setext[1]);
  return 0;
}

/**
 * The nodes whose text is syntax rather than content.
 *
 * Removing them from a heading gives the words a reader sees, which is what
 * the outline lists and what the reference renderer puts inside its heading
 * element.
 */
const syntaxOnlyNodes = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'MathMark',
  'URL',
  'LinkTitle',
  'CodeInfo',
]);

/**
 * Whether a link or image hides its brackets.
 *
 * Only an inline link resolves from the tree alone. A bare `[word]` with no
 * definition is plain text in CommonMark, and the Lezer parser still wraps
 * it in a `Link` node, so hiding its brackets would remove characters that
 * are really in the file.
 */
export function hidesItsMarkers(owner: SyntaxNode | null): boolean {
  if (owner === null) return false;
  if (owner.name === 'Autolink') return true;
  return (
    (owner.name === 'Link' || owner.name === 'Image') &&
    owner.getChild('URL') !== null
  );
}

/** The reader visible text of one node range. */
export function contentText(
  state: EditorState,
  from: number,
  to: number,
  preserveSpace = false,
): string {
  let text = '';
  let at = from;
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (!syntaxOnlyNodes.has(node.name)) return true;
      if (node.name === 'LinkMark' && !hidesItsMarkers(node.node.parent))
        return false;
      if (node.from >= at) {
        text += state.doc.sliceString(at, node.from);
        at = node.to;
      }
      return false;
    },
  });
  text += state.doc.sliceString(Math.max(at, from), to);
  return preserveSpace ? text.trim() : text.replace(/\s+/g, ' ').trim();
}
