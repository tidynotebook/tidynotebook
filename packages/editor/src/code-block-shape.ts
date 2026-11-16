/**
 * The shape of a code block on the note, as one set of rules.
 *
 * The preview draws the card of a code block and its quiet fence lines, and
 * the bar of `./code-controls.ts` carries its copy action. Both read these
 * rules, so the card and the bar always agree.
 *
 * A fence that a person is still typing is not a block yet. Three backticks
 * with no closer open a fence that runs to the end of the note, so the card
 * covered every line below the caret while the person typed the opener.
 * Until the fence has a closer, it stays text while the caret is on its
 * opening line, and an opener with no line after it always stays text. Enter on the opener writes the closer
 * (`./fence-close.ts`), and the block is then a card.
 */
import type { Text } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/** A range of the selection. */
export type SelectionRange = {
  readonly from: number;
  readonly to: number;
};

/** Whether a fenced block has no closing fence. */
function unclosed(block: SyntaxNode): boolean {
  return (
    block.name === 'FencedCode' && block.getChildren('CodeMark').length < 2
  );
}

/**
 * Whether a code node is a block on the note, and not a fence that a person
 * is still typing.
 */
export function codeBlockDrawn(
  doc: Text,
  block: SyntaxNode,
  selection: SelectionRange,
): boolean {
  if (!unclosed(block)) return true;
  const opener = doc.lineAt(block.from);
  if (doc.lineAt(block.to).number === opener.number) return false;
  return !(selection.from >= opener.from && selection.to <= opener.to);
}

/** Whether the selection touches a block, edges included. */
export function codeSelected(
  block: { readonly from: number; readonly to: number },
  selection: SelectionRange,
): boolean {
  return selection.from <= block.to && selection.to >= block.from;
}

/** Whether the selection touches the line that holds `at`. */
export function lineSelected(
  doc: Text,
  at: number,
  selection: SelectionRange,
): boolean {
  const line = doc.lineAt(at);
  return selection.from <= line.to && selection.to >= line.from;
}
