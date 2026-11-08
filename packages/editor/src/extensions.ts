/**
 * The command surface of the note editor, as one extension bundle.
 *
 * `createEditor` adds this bundle and nothing else: formatting keys, find and
 * replace, note link completion, paste conversion, the numbering of ordered
 * lists, and the words of the panels those features open. `editor-theme.ts`
 * draws those panels. Keeping the bundle here lets the editor composition
 * stay one list, and lets every feature be tested on its own.
 *
 * Order inside the bundle is deliberate. Completion keys run before the
 * formatting keys, so `Enter` accepts a completion instead of continuing a
 * list. The formatting keys run before the CodeMirror defaults, so `Enter`
 * continues a list before the plain newline applies.
 */
import {
  acceptCompletion,
  autocompletion,
  completionKeymap,
} from '@codemirror/autocomplete';
import { pasteURLAsLink } from '@codemirror/lang-markdown';
import { search } from '@codemirror/search';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, tooltips } from '@codemirror/view';
import { readVisibleArea } from '@notesapp/ui';
import {
  noteLinkCompartment,
  noteLinkCompletion,
  noteLinkSource,
  wikiLinkInput,
  type NoteLinkSource,
} from './completion.ts';
import {
  createSearchPanel,
  editorPhrases,
  noteSearchKeymap,
  openReplacePanel,
  replaceAllAnnouncement,
  searchPanelScrollMargins,
} from './search-panel.ts';
import { formattingKeymap } from './keymaps.ts';
import { orderedListNumbering } from './list-numbering.ts';
import { markdownPaste } from './paste.ts';
import { listControls } from './list-controls.ts';
import { listMarkerCaret } from './list-marker.ts';
import { typedFenceOpeners } from './fence-close.ts';
import { tableControls } from './table-controls.ts';
import { codeControls } from './code-controls.ts';
import { slashMenuCompletion } from './slash-menu.ts';
import { caretInView } from './caret-in-view.ts';
import { tableGridEditing } from './table-grid.ts';

/** Opens the find panel with its replace field. */
export const openFindAndReplace = openReplacePanel;

/**
 * Every command extension of the note editor.
 *
 * The note list starts empty and arrives later through
 * {@link setNoteLinkSource}, so the editor is never rebuilt for it.
 */
export function editorCommands(): Extension {
  return [
    // The find panel is a panel of the design system (issue 247).
    search({ top: true, createPanel: createSearchPanel }),
    searchPanelScrollMargins,
    replaceAllAnnouncement,
    EditorState.phrases.of(editorPhrases),
    // A list at the caret, such as the slash menu, opens in the part of the
    // screen that a person sees, so it stands above the keyboard of a phone
    // and not under it (record 0058).
    tooltips({ tooltipSpace: readVisibleArea }),
    // The keyboard of a phone that opens over the text keeps the caret in
    // view.
    caretInView(),
    autocompletion({
      // The list of notes after `[[` and `](`, and the slash menu of the
      // blocks (issue 259).
      override: [noteLinkCompletion, slashMenuCompletion],
      icons: false,
      activateOnTyping: true,
      closeOnBlur: true,
    }),
    noteLinkCompartment.of(noteLinkSource({ notes: [], currentPath: '' })),
    // A typed `[[Note]]` becomes a standard link at its last bracket when the
    // note is there (record 0172).
    wikiLinkInput,
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
    // The fence openers that the person typed, so Enter closes a fence typed
    // above text and leaves a fence of code alone.
    typedFenceOpeners,
    // A table carries a handle for each row and column, which opens its menu
    // and drags it to a new place (records 0097 and 0098).
    tableControls(),
    // A list item carries a grip that drags it to a new place (record 0106).
    listControls(),
    // A code block carries its language and a copy action (record 0174).
    codeControls(),
    // `markdown()` registers its own `Enter` handler with high precedence.
    // These two keymaps sit above it, so completion accepts first and the
    // list continuation of this package is the one that runs.
    // Tab chooses the row of an open list as Enter does, and it moves on to
    // the formatting keys when no list is open.
    Prec.highest(
      keymap.of([...completionKeymap, { key: 'Tab', run: acceptCompletion }]),
    ),
    Prec.highest(keymap.of(formattingKeymap)),
    keymap.of([
      ...noteSearchKeymap,
      // The find field keeps this key too, so it opens the replace row from
      // there. Cmd and H hides the application on a Mac, so a Mac uses Cmd,
      // Option and F, as the shortcut table states.
      {
        key: 'Mod-h',
        mac: 'Mod-Alt-f',
        run: openReplacePanel,
        scope: 'editor search-panel',
        preventDefault: true,
      },
    ]),
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
