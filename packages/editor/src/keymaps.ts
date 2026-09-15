/**
 * Markdown formatting commands and their key bindings.
 *
 * Every command in this module is a pure function of `EditorState` that
 * returns a `TransactionSpec`, so the whole command set is testable without a
 * document, a view, or a browser. The key bindings at the bottom only
 * dispatch what these functions return.
 *
 * The rules that shape this module:
 *
 * - A command toggles. Bold on bold text removes the markers, a heading at
 *   the same level becomes a paragraph, and a bullet list becomes plain
 *   lines again.
 * - A command that cannot apply returns `null`. The binding then returns
 *   `false`, so CodeMirror passes the key on. This is how `Tab` stays free
 *   outside a list item: keyboard users can still leave the editor.
 * - Nothing here reads the syntax tree. Line shapes are read with small
 *   anchored expressions, so the commands stay independent of the live
 *   preview and of the parser configuration.
 */
import { indentUnit } from '@codemirror/language';
import {
  EditorSelection,
  EditorState,
  type ChangeSpec,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView, type Command, type KeyBinding } from '@codemirror/view';

/** One row of the shortcut table that the shell renders. */
export type EditorShortcut = {
  /** The key combination, written for a reader of both platforms. */
  readonly keys: string;
  /** What the combination does, in one short sentence. */
  readonly description: string;
};

/** The inline markers this module can toggle. */
export type InlineMarker = '**' | '*' | '`' | '~~';

/** The list shapes this module can toggle. */
export type ListKind = 'bullet' | 'ordered' | 'task';

/** Everything one list line marker holds, with offsets inside the line. */
type ListLine = {
  /** Leading white space of the line. */
  readonly indent: string;
  /** The bullet or the number with its delimiter, for example `-` or `2.`. */
  readonly bullet: string;
  /** White space between the bullet and the content or the task box. */
  readonly gap: string;
  /** The task box with its trailing white space, or the empty string. */
  readonly task: string;
  /** Whether the bullet counts items. */
  readonly kind: 'bullet' | 'ordered';
  /** The counted value of an ordered bullet, or null for a plain bullet. */
  readonly value: number | null;
  /** Length of everything before the content of the line. */
  readonly prefixLength: number;
};

/** Matches the marker of one list line, with or without a task box. */
const listLinePattern =
  /^([ \t]*)(?:([-+*])|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/;

/** Matches the block quote marker of one line. */
const quoteLinePattern = /^([ \t]*)((?:>[ \t]?)+)/;

/** Matches a code fence opener or closer with its indentation. */
const fenceLinePattern = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** Reads the list marker of one line, or null when the line holds none. */
export function parseListLine(lineText: string): ListLine | null {
  const match = listLinePattern.exec(lineText);
  if (match === null) return null;
  const indent = match[1] ?? '';
  const plain = match[2];
  const digits = match[3] ?? '';
  const delimiter = match[4] ?? '';
  const gap = match[5] ?? '';
  const task = match[6] ?? '';
  const bullet = plain === undefined ? `${digits}${delimiter}` : plain;
  return {
    indent,
    bullet,
    gap,
    task,
    kind: plain === undefined ? 'ordered' : 'bullet',
    value: plain === undefined ? Number.parseInt(digits, 10) : null,
    prefixLength: indent.length + bullet.length + gap.length + task.length,
  };
}

/**
 * Reports whether the given line sits inside an open fenced code block.
 *
 * The scan starts at the first line, because a fence is only defined by the
 * lines above it. Twenty thousand lines cost one pass of small string tests,
 * which is well inside one key press.
 */
export function insideCodeFence(
  state: EditorState,
  lineNumber: number,
): boolean {
  let open: string | null = null;
  for (let number = 1; number < lineNumber; number += 1) {
    const text = state.doc.line(number).text;
    const match = fenceLinePattern.exec(text);
    if (match === null) continue;
    const marker = match[1] ?? '';
    const rest = match[2] ?? '';
    if (open === null) {
      open = marker;
      continue;
    }
    const sameKind = marker[0] === open[0];
    if (sameKind && marker.length >= open.length && rest.trim() === '')
      open = null;
  }
  return open !== null;
}

/** Reports whether the cursor sits on a list item line. */
export function inListItem(state: EditorState): boolean {
  const line = state.doc.lineAt(state.selection.main.head);
  return parseListLine(line.text) !== null;
}

/** The line numbers the selection touches, without duplicates, in order. */
function selectedLineNumbers(state: EditorState): readonly number[] {
  const numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number += 1) numbers.add(number);
  }
  return [...numbers].sort((left, right) => left - right);
}

/**
 * The lines a block command applies to.
 *
 * A multi line selection ignores its blank lines, so a selected paragraph
 * gap does not become an empty list item. A selection that is only blank
 * lines keeps them, so the command still starts a list on an empty line.
 */
function blockTargets(state: EditorState): readonly number[] {
  const numbers = selectedLineNumbers(state);
  if (numbers.length <= 1) return numbers;
  const filled = numbers.filter(
    (number) => state.doc.line(number).text.trim() !== '',
  );
  return filled.length === 0 ? numbers : filled;
}

/**
 * Toggles one inline marker around every selection range.
 *
 * Markers directly outside the range and markers at both ends inside the
 * range are both recognised, so bold applied to bold text removes it whether
 * the selection includes the stars or not. A one character marker never
 * unwraps a doubled marker, so italic on `**bold**` adds emphasis instead of
 * breaking the bold pair.
 */
export function toggleInlineSpec(
  state: EditorState,
  marker: InlineMarker,
): TransactionSpec {
  const width = marker.length;
  const doubled = `${marker}${marker}`;
  return state.changeByRange((range) => {
    const { from, to } = range;
    const before = state.doc.sliceString(Math.max(0, from - width), from);
    const after = state.doc.sliceString(
      to,
      Math.min(state.doc.length, to + width),
    );
    const wider =
      state.doc.sliceString(Math.max(0, from - width * 2), from) === doubled &&
      state.doc.sliceString(to, Math.min(state.doc.length, to + width * 2)) ===
        doubled;
    if (before === marker && after === marker && !(width === 1 && wider))
      return {
        changes: [
          { from: from - width, to: from },
          { from: to, to: to + width },
        ],
        range: EditorSelection.range(from - width, to - width),
      };
    const inner = state.doc.sliceString(from, to);
    if (
      inner.length >= width * 2 &&
      inner.startsWith(marker) &&
      inner.endsWith(marker)
    )
      return {
        changes: [
          { from, to: from + width },
          { from: to - width, to },
        ],
        range: EditorSelection.range(from, to - width * 2),
      };
    return {
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      range: range.empty
        ? EditorSelection.cursor(from + width)
        : EditorSelection.range(from + width, to + width),
    };
  });
}

/** Reports whether a string is a link destination this editor may insert. */
export function isLinkDestination(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return false;
  return /^(?:https?:\/\/|mailto:)\S+$/i.test(trimmed);
}

/**
 * Wraps every selection range as a Markdown link.
 *
 * A selection that is already a URL becomes the destination and the cursor
 * waits in the empty label. A URL from the clipboard becomes the destination
 * of the selected label and the cursor moves past the link. Otherwise the
 * label is the selection and the cursor waits inside the empty parentheses,
 * which is where the person types or pastes the destination.
 */
export function linkSpec(
  state: EditorState,
  clipboard: string | null = null,
): TransactionSpec {
  const pasted =
    clipboard !== null && isLinkDestination(clipboard) ? clipboard.trim() : '';
  return state.changeByRange((range) => {
    const selected = state.doc.sliceString(range.from, range.to);
    if (isLinkDestination(selected)) {
      const insert = `[](${selected.trim()})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    if (pasted !== '') {
      const insert = `[${selected}](${pasted})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      };
    }
    const insert = `[${selected}]()`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + selected.length + 3),
    };
  });
}

/** The marker one list kind writes at position `index` of the selection. */
function listMarkerFor(kind: ListKind, index: number): string {
  if (kind === 'ordered') return `${String(index + 1)}. `;
  if (kind === 'task') return '- [ ] ';
  return '- ';
}

/** Reports whether one parsed line already has the requested list shape. */
function matchesKind(parsed: ListLine | null, kind: ListKind): boolean {
  if (parsed === null) return false;
  if (kind === 'task') return parsed.task !== '';
  return parsed.kind === kind && parsed.task === '';
}

/**
 * Turns every selected line into the requested list shape, or back.
 *
 * When every selected line already has that shape the markers are removed,
 * so the same key press starts and ends a list. A line that carries another
 * list shape is converted rather than nested, so one line never grows two
 * markers.
 */
export function toggleListSpec(
  state: EditorState,
  kind: ListKind,
): TransactionSpec | null {
  const targets = blockTargets(state);
  if (targets.length === 0) return null;
  const parsedLines = targets.map((number) =>
    parseListLine(state.doc.line(number).text),
  );
  const remove = parsedLines.every((parsed) => matchesKind(parsed, kind));
  const changes: ChangeSpec[] = [];
  targets.forEach((number, index) => {
    const line = state.doc.line(number);
    const parsed = parsedLines[index] ?? null;
    const prefixLength = parsed?.prefixLength ?? 0;
    const indent = parsed?.indent ?? /^[ \t]*/.exec(line.text)?.[0] ?? '';
    const keep = remove ? indent : `${indent}${listMarkerFor(kind, index)}`;
    const currentPrefix =
      parsed === null ? indent : line.text.slice(0, prefixLength);
    if (currentPrefix === keep) return;
    changes.push({
      from: line.from,
      to: line.from + currentPrefix.length,
      insert: keep,
    });
  });
  if (changes.length === 0) return null;
  return { changes };
}

/**
 * Adds or removes the block quote marker of every selected line.
 *
 * The marker goes after the indentation, so a quoted list item keeps its
 * place in the surrounding text.
 */
export function toggleQuoteSpec(state: EditorState): TransactionSpec | null {
  const targets = blockTargets(state);
  if (targets.length === 0) return null;
  const matches = targets.map((number) =>
    quoteLinePattern.exec(state.doc.line(number).text),
  );
  const remove = matches.every((match) => match !== null);
  const changes: ChangeSpec[] = [];
  targets.forEach((number, index) => {
    const line = state.doc.line(number);
    const match = matches[index] ?? null;
    if (remove) {
      const indent = match?.[1] ?? '';
      const marker = match?.[2] ?? '';
      if (marker === '') return;
      changes.push({
        from: line.from + indent.length,
        to: line.from + indent.length + marker.length,
        insert: '',
      });
      return;
    }
    const indent = /^[ \t]*/.exec(line.text)?.[0] ?? '';
    changes.push({ from: line.from + indent.length, insert: '> ' });
  });
  if (changes.length === 0) return null;
  return { changes };
}

/** Applies or clears one heading level on every selected line. */
export function headingLevelSpec(
  state: EditorState,
  level: number,
): TransactionSpec | null {
  const clamped = Math.min(6, Math.max(1, Math.floor(level)));
  const targets = blockTargets(state);
  if (targets.length === 0) return null;
  const changes: ChangeSpec[] = [];
  for (const number of targets) {
    const line = state.doc.line(number);
    const match = /^( {0,3})(#{1,6})([ \t]+|$)/.exec(line.text);
    const indent = (match?.[1] ?? '').length;
    if (match === null) {
      changes.push({
        from: line.from,
        insert: `${'#'.repeat(clamped)} `,
      });
      continue;
    }
    const markers = match[2] ?? '';
    const gap = match[3] ?? '';
    const from = line.from + indent;
    if (markers.length === clamped) {
      changes.push({
        from,
        to: from + markers.length + gap.length,
        insert: '',
      });
      continue;
    }
    changes.push({
      from,
      to: from + markers.length,
      insert: '#'.repeat(clamped),
    });
  }
  if (changes.length === 0) return null;
  return { changes };
}

/** Adds one indentation unit to every selected list line. */
export function indentListSpec(state: EditorState): TransactionSpec | null {
  const unit = state.facet(indentUnit);
  const changes: ChangeSpec[] = [];
  for (const number of blockTargets(state)) {
    const line = state.doc.line(number);
    if (parseListLine(line.text) === null) continue;
    changes.push({ from: line.from, insert: unit });
  }
  if (changes.length === 0) return null;
  return { changes };
}

/** Removes up to one indentation unit from every selected list line. */
export function outdentListSpec(state: EditorState): TransactionSpec | null {
  const unit = state.facet(indentUnit);
  const changes: ChangeSpec[] = [];
  for (const number of blockTargets(state)) {
    const line = state.doc.line(number);
    if (parseListLine(line.text) === null) continue;
    const indent = /^[ \t]*/.exec(line.text)?.[0] ?? '';
    if (indent === '') continue;
    const width = indent.startsWith('\t')
      ? 1
      : Math.min(unit.length, indent.length);
    changes.push({ from: line.from, to: line.from + width, insert: '' });
  }
  if (changes.length === 0) return null;
  return { changes };
}

/**
 * Continues the list item or the block quote the cursor sits in.
 *
 * An item that holds no content ends the list instead of repeating itself.
 * Inside a fenced code block the command declines, so the default newline
 * applies and the fence stays open around the new line. A selection that is
 * not empty also declines, because replacing a range is the plain newline
 * behaviour.
 */
export function continueBlockSpec(state: EditorState): TransactionSpec | null {
  const range = state.selection.main;
  if (state.selection.ranges.length !== 1 || !range.empty) return null;
  const line = state.doc.lineAt(range.head);
  if (insideCodeFence(state, line.number)) return null;

  const parsed = parseListLine(line.text);
  if (parsed !== null) {
    const content = line.text.slice(parsed.prefixLength);
    if (content.trim() === '')
      return {
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      };
    const next =
      parsed.task !== ''
        ? `${parsed.bullet}${parsed.gap}[ ] `
        : parsed.kind === 'ordered'
          ? `${String((parsed.value ?? 0) + 1)}${parsed.bullet.slice(-1)}${parsed.gap}`
          : `${parsed.bullet}${parsed.gap}`;
    const insert = `\n${parsed.indent}${next}`;
    return {
      changes: { from: range.head, insert },
      selection: { anchor: range.head + insert.length },
    };
  }

  const quote = quoteLinePattern.exec(line.text);
  if (quote !== null) {
    const indent = quote[1] ?? '';
    const marker = quote[2] ?? '';
    const content = line.text.slice(indent.length + marker.length);
    if (content.trim() === '')
      return {
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
      };
    const insert = `\n${indent}${marker}`;
    return {
      changes: { from: range.head, insert },
      selection: { anchor: range.head + insert.length },
    };
  }
  return null;
}

/** Turns a spec producing function into a CodeMirror command. */
function dispatching(
  build: (state: EditorState) => TransactionSpec | null,
): Command {
  return (view: EditorView): boolean => {
    if (view.state.readOnly) return false;
    const spec = build(view.state);
    if (spec === null) return false;
    view.dispatch(view.state.update({ ...spec, userEvent: 'input.format' }));
    return true;
  };
}

/**
 * Reads a link destination from the clipboard when that needs no prompt.
 *
 * Reading the clipboard asks the person for permission in some browsers. A
 * shortcut must never open a permission dialog, so the read happens only
 * when the permission is already granted, and every failure answers `null`.
 */
async function grantedClipboardText(): Promise<string | null> {
  try {
    const permissions: Permissions | undefined = navigator.permissions;
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (permissions === undefined || clipboard === undefined) return null;
    // `clipboard-read` is not in the standard permission name union, so the
    // descriptor is built as an unknown value and narrowed at the call.
    const descriptor = {
      name: 'clipboard-read',
    } as unknown as PermissionDescriptor;
    const status = await permissions.query(descriptor);
    if (status.state !== 'granted') return null;
    return await clipboard.readText();
  } catch {
    // No clipboard, no permission, or a browser without the query name. The
    // link command then works from the selection alone.
    return null;
  }
}

/** Toggles bold around the selection. */
export const toggleBold = dispatching((state) => toggleInlineSpec(state, '**'));

/** Toggles italic around the selection. */
export const toggleItalic = dispatching((state) =>
  toggleInlineSpec(state, '*'),
);

/** Toggles an inline code span around the selection. */
export const toggleInlineCode = dispatching((state) =>
  toggleInlineSpec(state, '`'),
);

/** Toggles strike through around the selection. */
export const toggleStrikethrough = dispatching((state) =>
  toggleInlineSpec(state, '~~'),
);

/** Toggles a bullet list on the selected lines. */
export const toggleBulletList = dispatching((state) =>
  toggleListSpec(state, 'bullet'),
);

/** Toggles an ordered list on the selected lines. */
export const toggleOrderedList = dispatching((state) =>
  toggleListSpec(state, 'ordered'),
);

/** Toggles a task list on the selected lines. */
export const toggleTaskList = dispatching((state) =>
  toggleListSpec(state, 'task'),
);

/** Toggles a block quote on the selected lines. */
export const toggleQuote = dispatching(toggleQuoteSpec);

/** Adds one indentation unit to the list item under the cursor. */
export const indentListItem = dispatching(indentListSpec);

/** Removes one indentation unit from the list item under the cursor. */
export const outdentListItem = dispatching(outdentListSpec);

/** Continues a list item or a block quote on Enter. */
export const continueBlock = dispatching(continueBlockSpec);

/** Sets or clears one heading level on the selected lines. */
export function setHeadingLevel(level: number): Command {
  return dispatching((state) => headingLevelSpec(state, level));
}

/**
 * Wraps the selection as a Markdown link.
 *
 * The command answers immediately and applies the change once the optional
 * clipboard read settles, which is the same tick when no permission exists.
 */
export const insertLink: Command = (view: EditorView): boolean => {
  if (view.state.readOnly) return false;
  void grantedClipboardText().then((clipboard) => {
    view.dispatch(
      view.state.update({
        ...linkSpec(view.state, clipboard),
        userEvent: 'input.format',
      }),
    );
    view.focus();
  });
  return true;
};

/**
 * The formatting bindings.
 *
 * `Tab` and `Shift-Tab` indent inside a list only. Outside a list the
 * commands return false, CodeMirror leaves the key alone, and the browser
 * moves focus out of the editor, which is the behaviour the CodeMirror
 * accessibility advice asks for.
 */
export const formattingKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: toggleBold, preventDefault: true },
  { key: 'Mod-i', run: toggleItalic, preventDefault: true },
  { key: 'Mod-e', run: toggleInlineCode, preventDefault: true },
  {
    key: 'Mod-k',
    run: insertLink,
    preventDefault: true,
    stopPropagation: true,
  },
  { key: 'Mod-Shift-x', run: toggleStrikethrough, preventDefault: true },
  { key: 'Mod-1', run: setHeadingLevel(1), preventDefault: true },
  { key: 'Mod-2', run: setHeadingLevel(2), preventDefault: true },
  { key: 'Mod-3', run: setHeadingLevel(3), preventDefault: true },
  { key: 'Mod-4', run: setHeadingLevel(4), preventDefault: true },
  { key: 'Mod-5', run: setHeadingLevel(5), preventDefault: true },
  { key: 'Mod-6', run: setHeadingLevel(6), preventDefault: true },
  { key: 'Mod-Shift-7', run: toggleOrderedList, preventDefault: true },
  { key: 'Mod-Shift-8', run: toggleBulletList, preventDefault: true },
  { key: 'Mod-Shift-9', run: toggleTaskList, preventDefault: true },
  { key: 'Mod-Shift-.', run: toggleQuote, preventDefault: true },
  { key: 'Mod-]', run: indentListItem, preventDefault: true },
  { key: 'Mod-[', run: outdentListItem, preventDefault: true },
  { key: 'Tab', run: indentListItem, shift: outdentListItem },
  { key: 'Enter', run: continueBlock },
];

/**
 * The shortcuts of the note surface, in the order the dialog shows them.
 *
 * One table, one truth. The shell renders it; nothing in the dialog is
 * written a second time by hand.
 */
export const shortcuts: readonly EditorShortcut[] = [
  { keys: 'Cmd or Ctrl + S', description: 'Save the note' },
  {
    keys: 'Cmd or Ctrl + K',
    description: 'Insert a link in the note',
  },
  { keys: 'Cmd or Ctrl + P', description: 'Open the command palette' },
  { keys: 'Cmd or Ctrl + \\', description: 'Show or hide the sidebar' },
  { keys: 'Cmd or Ctrl + O', description: 'Open a note by name' },
  { keys: 'Cmd or Ctrl + F', description: 'Find in this note' },
  { keys: 'Cmd or Ctrl + H', description: 'Find and replace in this note' },
  { keys: 'Escape', description: 'Close the find panel or the dialog' },
  { keys: 'Cmd or Ctrl + B', description: 'Bold' },
  { keys: 'Cmd or Ctrl + I', description: 'Italic' },
  { keys: 'Cmd or Ctrl + E', description: 'Inline code' },
  { keys: 'Cmd or Ctrl + Shift + X', description: 'Strike through' },
  { keys: 'Cmd or Ctrl + 1 to 6', description: 'Heading level 1 to 6' },
  { keys: 'Cmd or Ctrl + Shift + 7', description: 'Ordered list' },
  { keys: 'Cmd or Ctrl + Shift + 8', description: 'Bullet list' },
  { keys: 'Cmd or Ctrl + Shift + 9', description: 'Task list' },
  { keys: 'Cmd or Ctrl + Shift + .', description: 'Block quote' },
  { keys: 'Tab or Cmd or Ctrl + ]', description: 'Indent the list item' },
  {
    keys: 'Shift + Tab or Cmd or Ctrl + [',
    description: 'Outdent the list item',
  },
  { keys: 'Cmd or Ctrl + Enter', description: 'Toggle the task box' },
  { keys: 'Alt + Enter', description: 'Open the link at the cursor' },
];
