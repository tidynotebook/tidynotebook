import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatActionOf,
  formatActions,
  plainTextContext,
  type FormatContext,
} from '@notesapp/editor';
import { controlStripClassName } from '@notesapp/ui';
import { actionIconNames } from './palette-items.ts';
import { noteColumnClassName } from './note-column.ts';
import {
  formatPaletteRows,
  formatToolbar,
  formatToolbarClassName,
  formatToolbarColumnClassName,
  formatToolbarFrameClassName,
  formatToolGroupClassName,
  formatToolTitle,
  keySignsText,
  pressKeepsTextFocus,
  slashMenuCommands,
  tableActions,
  toolApplies,
  toolbarFocusTarget,
} from './format-toolbar.ts';

/** The caret outside a table, in a body row, and in the header row. */
const outside = plainTextContext;
const inside = {
  table: true,
  bodyRow: true,
  row: 1,
  rows: 2,
  column: 0,
  columns: 2,
  align: null,
  itemUp: false,
  itemDown: false,
} as const;
const inHeader = { ...inside, bodyRow: false, row: 0 } as const;
type Context = FormatContext;

/** Every format action that the row reaches, in the order of the row. */
const rowActions = formatToolbar.flat().map((tool) => tool.id);

await test('the row holds the tools of issues 153 and 172, in five groups', () => {
  assert.deepEqual(
    formatToolbar.map((group) => group.map((tool) => tool.id)),
    [
      ['heading-1', 'heading-2', 'heading-3'],
      ['bold', 'italic', 'strikethrough', 'inline-code', 'link'],
      ['bullet-list', 'ordered-list', 'task-list', 'quote'],
      ['table'],
      ['move-item-up', 'move-item-down'],
    ],
  );
});

await test('every tool is a format action of the editor, reached once', () => {
  const known = new Set(formatActions.map((action) => action.id));
  const all = [...rowActions, ...tableActions.map((tool) => tool.id)];
  for (const id of all) assert.ok(known.has(id), `${id} is unknown`);
  assert.equal(new Set(all).size, all.length);
  // Every format action is a tool except the heading levels four to six,
  // which the keys reach.
  assert.equal(all.length, formatActions.length - 3);
});

await test('every tool draws a glyph of its own, and every action a named one', () => {
  const glyphs = new Set<string>(actionIconNames);
  const tools = formatToolbar.flat().map((tool) => tool.icon);
  assert.equal(new Set(tools).size, tools.length);
  // A row goes above or below with one glyph, as Publish and Published links
  // share one: the name of the action tells the two apart.
  for (const icon of [...tools, ...tableActions.map((tool) => tool.icon)])
    assert.ok(glyphs.has(icon), `${icon} is no glyph`);
});

await test('the palette offers every tool of the row and nothing else', () => {
  const rows = formatPaletteRows({ ...outside, itemUp: true, itemDown: true });
  assert.deepEqual(
    rows.map((row) => row.action),
    rowActions,
  );
  for (const row of rows) {
    const action = formatActionOf(row.action);
    assert.equal(row.label, action.label);
    assert.equal(row.keys, action.keys ?? undefined);
    assert.equal(row.id, `format-${row.action}`);
    assert.ok(row.keywords.startsWith('format markdown'));
  }
  assert.equal(rows.find((row) => row.action === 'table')?.keys, undefined);
});

await test('a tool title names the keys of the device', () => {
  assert.equal(formatToolTitle('Bold', ['⌘', 'B'], true), 'Bold (⌘B)');
  assert.equal(
    formatToolTitle('Bold', ['Ctrl', 'B'], false),
    'Bold (Ctrl + B)',
  );
  assert.equal(formatToolTitle('Table', [], false), 'Table');
});

await test('the arrow keys move inside the row and wrap at both ends', () => {
  assert.equal(toolbarFocusTarget('ArrowRight', 0, 7), 1);
  assert.equal(toolbarFocusTarget('ArrowRight', 6, 7), 0);
  assert.equal(toolbarFocusTarget('ArrowLeft', 0, 7), 6);
  assert.equal(toolbarFocusTarget('Home', 4, 7), 0);
  assert.equal(toolbarFocusTarget('End', 1, 7), 6);
  assert.equal(toolbarFocusTarget('Enter', 1, 7), null);
  assert.equal(toolbarFocusTarget('ArrowRight', 0, 0), null);
});

await test('the row stands on the measure of the note, above a divider', () => {
  const frame = formatToolbarFrameClassName().split(' ');
  assert.ok(frame.includes('border-b'));
  assert.ok(frame.includes('border-edge-line'));
  // The footer uses the same inline padding, so the row, the text and the
  // word count start on one line.
  assert.ok(frame.includes('px-2'));
  const column = formatToolbarColumnClassName().split(' ');
  // Decision 0055: the one measure of the note, centred.
  for (const name of ['mx-auto', 'w-full', 'max-w-note']) {
    assert.ok(noteColumnClassName().split(' ').includes(name));
    assert.ok(column.includes(name), `the column lacks ${name}`);
  }
});

await test('the row stays above the text on a phone', () => {
  // The row stood at the foot of a phone screen, where a swipe starts the
  // gestures of the system, and it was out of reach with the keyboard closed.
  // No width and no pointer moves it below the text or its divider.
  for (const name of formatToolbarFrameClassName().split(' ')) {
    const utility = name.split(':').at(-1) ?? name;
    assert.ok(!utility.startsWith('order-'), `${name} moves the row`);
    assert.ok(!utility.startsWith('border-t'), `${name} moves the divider`);
    assert.ok(utility !== 'border-b-0', `${name} drops the divider`);
  }
});

await test('the row scrolls sideways and never moves a tool out of it', () => {
  // A phone scrolls the row instead of hiding tools in a menu, so a menu
  // never covers the text that a person selected.
  const row = formatToolbarClassName();
  assert.ok(row.startsWith(controlStripClassName()));
  assert.ok(!row.split(' ').includes('flex-wrap'));
  const group = formatToolGroupClassName().split(' ');
  assert.ok(group.includes('shrink-0'));
  assert.ok(
    !group.some((name) => name === 'hidden' || name.endsWith(':hidden')),
  );
});

await test('the table actions are palette rows and not tools of the row', () => {
  // Record 0096. A table carries its own controls for a row and a column, so
  // the row keeps the tools that format text.
  const tools = formatToolbar.flat().map((tool) => tool.id);
  for (const action of tableActions) assert.ok(!tools.includes(action.id));
  assert.deepEqual(
    tableActions.map((tool) => tool.id),
    [
      'table-row-above',
      'table-row-below',
      'table-column-left',
      'table-column-right',
      'table-move-row-up',
      'table-move-row-down',
      'table-move-column-left',
      'table-move-column-right',
      'table-align-left',
      'table-align-center',
      'table-align-right',
      'table-delete-row',
      'table-delete-column',
      'table-delete',
    ],
  );
});

await test('a block tool does not apply inside a table', () => {
  const applies = (id: string, context: Context): boolean => {
    const tool = [...formatToolbar.flat(), ...tableActions].find(
      (candidate) => candidate.id === id,
    );
    assert.ok(tool !== undefined, id);
    return tool !== undefined && toolApplies(tool, context);
  };
  for (const id of ['heading-1', 'bullet-list', 'quote', 'table']) {
    assert.equal(applies(id, outside), true, id);
    assert.equal(applies(id, inside), false, id);
  }
  for (const id of ['bold', 'link', 'inline-code'])
    assert.equal(applies(id, inside), true, id);
  assert.equal(applies('table-row-below', outside), false);
  assert.equal(applies('table-row-below', inside), true);
});

await test('the palette offers the tools that apply where the caret stands', () => {
  const ids = (context: Context): readonly string[] =>
    formatPaletteRows(context).map((row) => row.action);
  assert.ok(!ids(outside).includes('table-row-below'));
  assert.ok(ids(inside).includes('table-row-below'));
  assert.ok(ids(inside).includes('bold'));
  assert.ok(!ids(inside).includes('heading-1'));
  assert.ok(!ids(inside).includes('table'));
});

await test('the header row and the last column are never offered for removal', () => {
  const tool = (id: string) =>
    tableActions.find((candidate) => candidate.id === id);
  const removeRow = tool('table-delete-row');
  const removeColumn = tool('table-delete-column');
  assert.ok(removeRow !== undefined && removeColumn !== undefined);
  if (removeRow === undefined || removeColumn === undefined) return;
  assert.equal(toolApplies(removeRow, inHeader), false);
  assert.equal(toolApplies(removeRow, inside), true);
  assert.equal(toolApplies(removeColumn, { ...inside, columns: 1 }), false);
  assert.equal(toolApplies(removeColumn, inside), true);
  assert.ok(
    !formatPaletteRows(inHeader)
      .map((row) => row.action)
      .includes('table-delete-row'),
  );
});

await test('the move tools apply only where the list item can go', () => {
  // Record 0106. A tool that cannot move the item stays in its place in the
  // row, disabled, and leaves the palette.
  const ids = (context: Context): readonly string[] =>
    formatPaletteRows(context).map((row) => row.action);
  assert.ok(!ids(outside).includes('move-item-up'));
  assert.ok(!ids(outside).includes('move-item-down'));
  const first = { ...outside, itemDown: true };
  assert.ok(!ids(first).includes('move-item-up'));
  assert.ok(ids(first).includes('move-item-down'));
  assert.equal(
    formatPaletteRows(first).find((row) => row.action === 'move-item-down')
      ?.keys,
    'Alt + Down arrow',
  );
});

await test('the slash menu offers every block tool of the row, in its order', () => {
  // Issue 259. The menu reads the one list of the tools, so a block tool
  // that joins the row joins the menu, and no inline tool or move is a block.
  const commands = slashMenuCommands((keys) => `keys of ${keys}`);
  assert.deepEqual(
    commands.map((command) => command.id),
    [
      'heading-1',
      'heading-2',
      'heading-3',
      'bullet-list',
      'ordered-list',
      'task-list',
      'quote',
      'table',
    ],
  );
  assert.ok(commands[0]?.keywords.includes('h1'));
  assert.equal(commands[0]?.hint, 'keys of Cmd or Ctrl + 1');
  // The table has no key, so its row states none.
  assert.equal(commands.at(-1)?.hint, null);
});

await test('key caps join as the keyboard of the device writes them', () => {
  assert.equal(keySignsText(['⌘', 'B'], true), '⌘B');
  assert.equal(keySignsText(['Ctrl', 'B'], false), 'Ctrl + B');
});

await test('the row offers no control that scrolls it', async () => {
  // An arrow at each end of the row stood beside the tools on a phone. A
  // person swipes the row, so the row holds its tools and nothing else.
  const toolbar = await import('./format-toolbar.ts');
  assert.deepEqual(
    Object.keys(toolbar).filter((name) => /scroll|overflow/i.test(name)),
    [],
  );
});

await test('a press on a phone keeps the focus and the keyboard in the text', () => {
  // Review of issue 261: a tap on a tool gave it the focus, so the keyboard
  // of a phone closed and opened again.
  assert.equal(
    pressKeepsTextFocus({
      pointerType: 'touch',
      composing: false,
    }),
    true,
  );
  assert.equal(
    pressKeepsTextFocus({
      pointerType: 'pen',
      composing: false,
    }),
    true,
  );
  // A mouse gives the tool the focus, and so does a finger while the text
  // composes, because the focus ends the composition before the action.
  assert.equal(
    pressKeepsTextFocus({
      pointerType: 'mouse',
      composing: false,
    }),
    false,
  );
  assert.equal(
    pressKeepsTextFocus({
      pointerType: 'touch',
      composing: true,
    }),
    false,
  );
});
