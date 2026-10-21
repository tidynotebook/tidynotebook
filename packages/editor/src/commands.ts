/**
 * Editor commands as CodeMirror transactions.
 *
 * Every command here describes a document change and returns it for the
 * caller to dispatch; no command touches the network, storage, or generated
 * API operations. Navigation uses injected callbacks, so this package never
 * imports the API client or a storage package.
 */
import { syntaxTree } from '@codemirror/language';
import type {
  ChangeSpec,
  Transaction,
  TransactionSpec,
} from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { EditorView } from '@codemirror/view';
import { parseMarkdown } from '@notesapp/markdown';

/**
 * The transaction that one editing command dispatches.
 *
 * Every command of this package writes to the document and leaves the caret
 * somewhere new. CodeMirror scrolls the caret back into view only when the
 * transaction asks for it, so a command that leaves the flag out writes a line
 * that the person cannot see: the caret sits below the fold and the view stays
 * where it was. Typing one character needs no flag, because that change
 * arrives through the DOM and CodeMirror sets the flag itself.
 *
 * Pointer edits can keep a selection outside the viewport. They can opt out
 * of caret scrolling to keep the place where the person dropped an item.
 */
export function editingTransaction(spec: TransactionSpec): TransactionSpec {
  // A command that names its own event, such as a toggle of a task box,
  // keeps it, so the screen can tell that command apart.
  return {
    ...spec,
    userEvent: spec.userEvent ?? 'input.format',
    scrollIntoView: spec.scrollIntoView ?? true,
  };
}

/**
 * Writes `text` over the main selection and puts the caret after it.
 *
 * A change with no selection of its own maps the caret, and a caret at the
 * start of an insert stays before it. A second image that the note menu
 * attached then went before the first one, and a line of images read in the
 * reverse order of the attach. The caret moves past the text instead, as it
 * does after a paste.
 */
export function insertTextSpec(
  state: EditorState,
  text: string,
): TransactionSpec {
  const { from, to } = state.selection.main;
  return {
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: 'input',
  };
}

/** Writes `text` over the selection of a view, as `insertTextSpec` says. */
export function insertText(view: EditorView, text: string): void {
  view.dispatch(
    view.state.update(editingTransaction(insertTextSpec(view.state, text))),
  );
  view.focus();
}

/**
 * Whether one transaction is the edit of a person on this device.
 *
 * A remote change and a repair reach the view with no user event, an undo
 * and a redo carry their own, and a composition is left alone because a
 * change beside the composing range can end it.
 */
export function isEditOfAPerson(transaction: Transaction): boolean {
  if (transaction.isUserEvent('input.type.compose')) return false;
  return (
    transaction.isUserEvent('input') ||
    transaction.isUserEvent('delete') ||
    transaction.isUserEvent('move')
  );
}

/** A link found at one document position. */
export type LinkTarget = { readonly kind: 'url'; readonly target: string };

/** Callbacks the editor receives for navigation out of the text. */
export type EditorNavigation = {
  /** Opens one link target, for example through the router. */
  readonly onOpenLink?: ((target: LinkTarget) => void) | undefined;
};

/**
 * The user event of a toggle of a task box.
 *
 * A toggle is a whole action, not a keystroke, so the screen saves it at once
 * and another device reads it before the person reaches that device (record
 * 0134). It is an `input` event, so it is still an edit of a person.
 */
export const taskToggleEvent = 'input.toggle.task';

/** Whether one transaction toggles a task box. */
export function isTaskToggle(transaction: Transaction): boolean {
  return transaction.isUserEvent(taskToggleEvent);
}

/** One task box on a line, with absolute offsets. */
export type TaskBox = {
  readonly from: number;
  readonly to: number;
  readonly checked: boolean;
};

/** Finds the task box of one line, or null when the line holds no task. */
export function findTaskBox(
  lineText: string,
  lineFrom: number,
): TaskBox | null {
  const match = /^( {0,3})((?:[-+*])|(?:\d{1,9}[.)]))([ \t]+)\[([ xX])\]/.exec(
    lineText,
  );
  if (match === null) return null;
  const indent = match[1] ?? '';
  const bullet = match[2] ?? '';
  const gap = match[3] ?? '';
  const state = match[4] ?? '';
  const from = lineFrom + indent.length + bullet.length + gap.length;
  return { from, to: from + 3, checked: state === 'x' || state === 'X' };
}

/**
 * Toggles every task box touched by the selection.
 *
 * Lines with `- [ ]` become `- [x]` and lines with `- [x]` or `- [X]` become
 * `- [ ]`. Returns null when no selected line holds a task, so the caller can
 * leave the transaction undispatched and keep undo history clean.
 */
export function toggleTaskSpec(state: EditorState): TransactionSpec | null {
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from);
    const last = state.doc.lineAt(range.to);
    for (let number = first.number; number <= last.number; number += 1) {
      if (seen.has(number)) continue;
      seen.add(number);
      const line = state.doc.line(number);
      const box = findTaskBox(line.text, line.from);
      if (box === null) continue;
      changes.push({
        from: box.from + 1,
        to: box.from + 2,
        insert: box.checked ? ' ' : 'x',
      });
    }
  }
  if (changes.length === 0) return null;
  return { changes, userEvent: taskToggleEvent };
}

/**
 * Toggles the task box of the line that holds `position`.
 *
 * The clicked checkbox passes its own document position, so the toggle
 * always changes the task the person pointed at and never the task of the
 * current selection. Returns null when that line holds no task.
 */
export function taskToggleAt(
  state: EditorState,
  position: number,
): TransactionSpec | null {
  const clamped = Math.min(Math.max(position, 0), state.doc.length);
  const line = state.doc.lineAt(clamped);
  const box = findTaskBox(line.text, line.from);
  if (box === null) return null;
  return {
    changes: {
      from: box.from + 1,
      to: box.from + 2,
      insert: box.checked ? ' ' : 'x',
    },
    userEvent: taskToggleEvent,
  };
}

/** One link the preview renders, with the range it covers. */
export type LinkSpan = {
  /** The first offset of the link in the document. */
  readonly from: number;
  /** The offset after the last character of the link. */
  readonly to: number;
  /** Where the link goes. */
  readonly target: LinkTarget;
};

/** Resolves a syntax-marked autolink as the Markdown renderer does. */
function autolinkDestination(text: string): string {
  const paragraph = parseMarkdown(text).children[0];
  if (paragraph?.type !== 'paragraph' || paragraph.children.length !== 1)
    return text;
  const link = paragraph.children[0];
  return link?.type === 'link' ? link.url : text;
}

/** The destination of one link node, or null when it names none. */
function linkDestination(state: EditorState, node: SyntaxNode): string | null {
  if (node.name === 'Autolink')
    return autolinkDestination(state.doc.sliceString(node.from, node.to));
  if (node.name === 'Link') {
    const url = node.getChild('URL');
    if (url === null) return null;
    const text = state.doc.sliceString(url.from, url.to);
    // `[label](<a b>)` wraps its destination, and the brackets are notation.
    const inner =
      text.startsWith('<') && text.endsWith('>') ? text.slice(1, -1) : text;
    return inner === '' ? null : inner;
  }
  // A bare address is a `URL` node of its own paragraph. Inside a link, an
  // image, or a reference definition the same node is the target of that
  // construct and never a link of its own.
  if (node.name !== 'URL') return null;
  const owner = node.parent?.name ?? '';
  if (owner === 'Link' || owner === 'Image' || owner === 'Autolink')
    return null;
  if (owner === 'LinkReference') return null;
  const text = state.doc.sliceString(node.from, node.to);
  return text === '' ? null : autolinkDestination(text);
}

/**
 * Finds the link at one document position, or null.
 *
 * The syntax tree answers, so this reads the same nodes that the live preview
 * decorates and the two cannot disagree about where a link starts and ends.
 * Three shapes name a target: `[label](destination)`, `<https://example.com>`,
 * and a bare address that the grammar marks on its own. A footnote and a
 * reference link name none, so they return null and a click on them places
 * the caret.
 *
 * The range is the whole construct, so a caller can ask whether the selection
 * is inside the link that a person clicked.
 */
export function linkSpanAt(
  state: EditorState,
  position: number,
): LinkSpan | null {
  const at = Math.min(Math.max(position, 0), state.doc.length);
  const tree = syntaxTree(state);
  // Both sides, so a position on either edge of a link still finds it.
  for (const side of [-1, 1] as const) {
    for (
      let node: SyntaxNode | null = tree.resolveInner(at, side);
      node !== null;
      node = node.parent
    ) {
      const target = linkDestination(state, node);
      if (target !== null)
        return {
          from: node.from,
          to: node.to,
          target: { kind: 'url', target },
        };
    }
  }
  return null;
}
