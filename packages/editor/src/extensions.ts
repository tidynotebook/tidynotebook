/**
 * The command surface of the note editor, as one extension bundle.
 *
 * `createEditor` adds this bundle and nothing else: formatting keys, find and
 * replace, note link completion, paste conversion, the numbering of ordered
 * lists, and the presentation of the panels those features open. Keeping the bundle here lets the editor
 * composition stay one list, and lets every feature be tested on its own.
 *
 * Order inside the bundle is deliberate. Completion keys run before the
 * formatting keys, so `Enter` accepts a completion instead of continuing a
 * list. The formatting keys run before the CodeMirror defaults, so `Enter`
 * continues a list before the plain newline applies.
 */
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { pasteURLAsLink } from '@codemirror/lang-markdown';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  noteLinkCompartment,
  noteLinkCompletion,
  noteLinkSource,
  type NoteLinkSource,
} from './completion.ts';
import { touchFieldQuery } from './editor-theme.ts';
import { formattingKeymap } from './keymaps.ts';
import { orderedListNumbering } from './list-numbering.ts';
import { markdownPaste } from './paste.ts';
import { listControls } from './list-controls.ts';
import { listMarkerCaret } from './list-marker.ts';
import { tableControls } from './table-controls.ts';
import { tableGridEditing } from './table-grid.ts';

/**
 * Presentation of the editor panels and tooltips.
 *
 * CodeMirror builds this DOM itself, so utility classes cannot reach it.
 * This adapter is the one place that styles it, and it reads only the
 * central semantic theme variables, so both palettes stay correct and no
 * colour is written twice.
 */
export const panelTheme: Extension = EditorView.theme({
  // The note screen gives the editor a bounded height, so the CodeMirror
  // scroller owns the scrolling and the note header above it stays visible.
  '&': { height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-panels': {
    backgroundColor: 'var(--notes-surface-card)',
    color: 'var(--notes-text)',
    fontSize: 'var(--text-control)',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--notes-border-subtle)',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid var(--notes-border-subtle)',
  },
  '.cm-panel.cm-search': {
    padding: 'calc(var(--spacing) * 2)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'calc(var(--spacing) * 2)',
  },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(var(--spacing) * 1)',
    color: 'var(--notes-text-muted)',
  },
  '.cm-panel.cm-search br': { display: 'none' },
  '.cm-textfield': {
    backgroundColor: 'var(--notes-bg)',
    color: 'var(--notes-text)',
    border: '1px solid var(--notes-border)',
    borderRadius: 'calc(var(--spacing) * 1.5)',
    padding: 'calc(var(--spacing) * 1) calc(var(--spacing) * 2)',
    fontSize: 'var(--text-control)',
  },
  // The touch step of every field, so Safari on iOS does not zoom into the
  // search field on a tap.
  [`@media ${touchFieldQuery}`]: {
    '.cm-textfield': { fontSize: 'var(--text-base)' },
  },
  '.cm-textfield:focus-visible': {
    outline: '2px solid var(--notes-focus)',
    outlineOffset: '1px',
  },
  '.cm-button': {
    backgroundColor: 'var(--notes-surface-hover)',
    backgroundImage: 'none',
    color: 'var(--notes-text-strong)',
    border: '1px solid var(--notes-border)',
    borderRadius: 'calc(var(--spacing) * 1.5)',
    padding: 'calc(var(--spacing) * 1) calc(var(--spacing) * 2)',
    fontSize: 'var(--text-control)',
  },
  '.cm-button:hover': { backgroundColor: 'var(--notes-surface-active)' },
  '.cm-button:active': { backgroundImage: 'none' },
  '.cm-button:focus-visible': {
    outline: '2px solid var(--notes-focus)',
    outlineOffset: '1px',
  },
  '.cm-panel.cm-search [name="close"]': {
    color: 'var(--notes-text-strong)',
    fontSize: 'var(--text-ui)',
  },
  '.cm-searchMatch': {
    backgroundColor:
      'color-mix(in srgb, var(--notes-accent-fill) 28%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor:
      'color-mix(in srgb, var(--notes-accent-fill) 55%, transparent)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--notes-surface-card)',
    border: '1px solid var(--notes-border)',
    borderRadius: 'calc(var(--spacing) * 2)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-control)',
    maxHeight: 'calc(var(--spacing) * 60)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    color: 'var(--notes-text)',
    padding: 'calc(var(--spacing) * 1) calc(var(--spacing) * 2)',
    display: 'flex',
    alignItems: 'baseline',
    gap: 'calc(var(--spacing) * 2)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--notes-accent-fill)',
    color: 'var(--notes-accent-on-fill)',
  },
  '.cm-completionLabel': { color: 'inherit' },
  '.cm-completionDetail': {
    color: 'var(--notes-text-muted)',
    fontStyle: 'normal',
    marginInlineStart: 'auto',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail':
    { color: 'inherit' },
  '.cm-completionIcon': { display: 'none' },
});

/** Opens the find panel with its replace field. */
export const openFindAndReplace = openSearchPanel;

/**
 * Every command extension of the note editor.
 *
 * The note list starts empty and arrives later through
 * {@link setNoteLinkSource}, so the editor is never rebuilt for it.
 */
export function editorCommands(): Extension {
  return [
    search({ top: true }),
    autocompletion({
      override: [noteLinkCompletion],
      icons: false,
      activateOnTyping: true,
      closeOnBlur: true,
    }),
    noteLinkCompartment.of(noteLinkSource({ notes: [], currentPath: '' })),
    pasteURLAsLink,
    markdownPaste,
    // Every edit of a person, a paste included, renumbers the ordered lists
    // it touched in the same transaction (record 0089).
    orderedListNumbering(),
    // A table is a grid over its text: the caret stays in a cell, and the
    // edit of a person keeps the pipes of the table (record 0095).
    tableGridEditing(),
    // A caret never rests in a drawn bullet or task box (record 0132). The
    // filters run from the last one registered, so this one runs before the
    // table filter and a caret it moves into a table still lands in a cell.
    listMarkerCaret(),
    // A table carries a handle for each row and column, which opens its menu
    // and drags it to a new place (records 0097 and 0098).
    tableControls(),
    // A list item carries a grip that drags it to a new place (record 0106).
    listControls(),
    // `markdown()` registers its own `Enter` handler with high precedence.
    // These two keymaps sit above it, so completion accepts first and the
    // list continuation of this package is the one that runs.
    Prec.highest(keymap.of(completionKeymap)),
    Prec.highest(keymap.of(formattingKeymap)),
    keymap.of([
      ...searchKeymap,
      { key: 'Mod-h', mac: 'Mod-Alt-f', run: openSearchPanel },
    ]),
    panelTheme,
  ];
}

/**
 * Replaces the note list the completion offers.
 *
 * Only the compartment is reconfigured, so the document, the undo history,
 * the selection, and any active composition stay exactly where they are.
 */
export function setNoteLinkSource(
  view: EditorView,
  source: NoteLinkSource,
): void {
  view.dispatch({
    effects: noteLinkCompartment.reconfigure(noteLinkSource(source)),
  });
}
