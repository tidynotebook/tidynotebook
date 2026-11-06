/**
 * The find and replace panel of the note editor (issue 247).
 *
 * `@codemirror/search` draws a panel of its own, with lowercase words, grey
 * native buttons and a raw close mark. Its documented `createPanel` option
 * takes a panel of ours instead, so this module builds the panel from the
 * recipes of `packages/ui`: a compact find bar, match count, icon controls,
 * option toggles, and a replace row shown on request. Phone options use the
 * shared application sheet. Removing a visible action does not remove its key.
 *
 * The keys stay the keys of the search package. Enter in the find field finds
 * the next match and Shift and Enter the one before it, Enter in the replace
 * field replaces the next match (`searchPanelKey`), and the keys of
 * `searchKeymap` that the panel shares with the editor, Escape among them,
 * run through `runScopeHandlers` as they do in the panel of the package.
 * Escape closes the panel and gives the focus back to the text.
 *
 * A replace of every match says how many it replaced, with the count and its
 * noun (`replaceAllWords`), because the phrase of the package has one form
 * for every count.
 *
 * `editor-theme.ts` places the controls in one band, because CodeMirror
 * places the panel itself. Every class of a control is a recipe.
 */
import {
  closeSearchPanel,
  findNext,
  gotoLine,
  searchKeymap,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  runScopeHandlers,
  type Panel,
  type ViewUpdate,
} from '@codemirror/view';
import {
  buttonClassName,
  chevronDownParts,
  openOptionsSheet,
  closeParts,
  fieldClassName,
  glyph,
  editorSearchClasses,
} from '@notesapp/ui';

/** Styles read by the application stylesheet and its integration check. */
export const searchPanelClasses = editorSearchClasses;

/** The words of the panel, which a person reads and hears. */
export const searchPanelWords = {
  panel: 'Find and replace',
  find: 'Find',
  replace: 'Replace with',
  next: 'Next',
  previous: 'Previous',
  selectAll: 'Select all',
  replaceOne: 'Replace',
  replaceAll: 'Replace all',
  matchCase: 'Match case',
  regexp: 'Regular expression',
  wholeWord: 'Whole word',
  close: 'Close',
} as const;

/**
 * The words of the parts of CodeMirror that a person hears.
 *
 * The search package announces a match and a replace, and the completion
 * list names itself, in words of its own. These are the same messages in
 * sentence case (issue 247).
 */
export const editorPhrases: Readonly<Record<string, string>> = {
  'current match': 'Current match',
  'on line': 'on line',
  'replaced match on line $': 'Replaced the match on line $',
  Completions: 'Suggestions',
};

/**
 * The keys of the search package that the note editor keeps.
 *
 * A note has no line numbers, so the key that goes to a line number, and the
 * stock dialog that it opens, have no place in it.
 */
export const noteSearchKeymap = searchKeymap.filter(
  (binding) => binding.run !== gotoLine,
);

/** What a person hears after a replace of every match. */
export function replaceAllWords(count: number): string {
  return count === 1
    ? 'Replaced 1 match.'
    : `Replaced ${String(count)} matches.`;
}

/**
 * The words of a replace of every match, with the count and its noun.
 *
 * The package announces `replaced $ matches` for every count, so one match
 * read `Replaced 1 matches`. This filter keeps the change of the package and
 * states the words of {@link replaceAllWords} in place of its own, for the
 * button and for the key alike.
 */
export const replaceAllAnnouncement: Extension =
  EditorState.transactionFilter.of((transaction) => {
    if (
      !transaction.isUserEvent('input.replace.all') ||
      !transaction.effects.some((effect) => effect.is(EditorView.announce))
    )
      return transaction;
    let count = 0;
    transaction.changes.iterChanges(() => {
      count += 1;
    }, true);
    return {
      changes: transaction.changes,
      ...(transaction.selection === undefined
        ? {}
        : { selection: transaction.selection }),
      effects: [
        ...transaction.effects.filter(
          (effect) => !effect.is(EditorView.announce),
        ),
        EditorView.announce.of(replaceAllWords(count)),
      ],
      userEvent: 'input.replace.all',
      scrollIntoView: transaction.scrollIntoView,
    };
  });

/** The field of the panel that a key of the panel lands in. */
export type SearchPanelField = 'find' | 'replace' | 'other';

/**
 * The command that Enter runs in one field of the panel, or `null` for a key
 * that the panel leaves alone.
 *
 * Enter in the find field finds the next match and Shift and Enter the one
 * before it, and Enter in the replace field replaces the next match, as in the
 * panel of the package.
 */
export function searchPanelKey(
  key: { readonly key: string; readonly shiftKey: boolean },
  field: SearchPanelField,
): 'next' | 'previous' | 'replace' | null {
  if (key.key !== 'Enter') return null;
  if (field === 'find') return key.shiftKey ? 'previous' : 'next';
  if (field === 'replace') return 'replace';
  return null;
}

/** The class of the glyph inside a control: the 16 px of a control. */
const glyphClass = editorSearchClasses.glyph;

/** A text field of the panel. */
function field(label: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.className = fieldClassName();
  input.type = 'text';
  input.value = value;
  input.placeholder = label;
  input.setAttribute('aria-label', label);
  input.spellcheck = false;
  input.autocomplete = 'off';
  return input;
}

/** A button of the panel with its word. */
function button(label: string, run: () => void): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = buttonClassName({
    variant: 'secondary',
    size: 'default',
  });
  control.textContent = label;
  control.addEventListener('click', run);
  return control;
}

/** An icon button has the same target and focus treatment as app controls. */
function iconButton(
  label: string,
  parts: Parameters<typeof glyph>[1],
  run: () => void,
): HTMLButtonElement {
  const control = button(label, run);
  control.className = buttonClassName({
    variant: 'ghost',
    size: 'compact',
    iconOnly: true,
  });
  control.setAttribute('aria-label', label);
  control.title = label;
  control.replaceChildren(glyph(glyphClass, parts));
  return control;
}
/** One band of the panel. */
function band(...children: readonly HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = `cm-np-search-row ${editorSearchClasses.row}`;
  row.append(...children);
  return row;
}

let nextPanelId = 0;

/** The find and replace panel of one view. */
class SearchPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private readonly view: EditorView;
  private query: SearchQuery;
  private readonly searchField: HTMLInputElement;
  private readonly replaceField: HTMLInputElement;
  private readonly count: HTMLSpanElement;
  private readonly toggles: readonly HTMLButtonElement[];
  private readonly replacement: HTMLElement;
  private readonly replacementToggle: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly matchActions: readonly HTMLButtonElement[];
  private readonly replaceActions: readonly HTMLButtonElement[];
  private replaceVisible = false;
  private closeOptions: (() => void) | undefined;
  private destroyed = false;
  private matches: { from: number; to: number }[] = [];
  private countedQuery: SearchQuery | null = null;
  private countedDoc: EditorState['doc'] | null = null;

  constructor(view: EditorView) {
    this.view = view;
    this.query = getSearchQuery(view.state);
    const commit = (): void => {
      this.commit();
    };
    this.searchField = field(searchPanelWords.find, this.query.search);
    // `openSearchPanel` of the package selects the field with this mark.
    this.searchField.setAttribute('main-field', 'true');
    this.searchField.classList.add(
      'cm-np-search-field',
      ...editorSearchClasses.query.split(' '),
    );
    this.replaceField = field(searchPanelWords.replace, this.query.replace);
    this.replaceField.classList.add(
      'cm-np-search-field',
      ...editorSearchClasses.replaceField.split(' '),
    );
    for (const input of [this.searchField, this.replaceField]) {
      input.addEventListener('input', commit);
      input.addEventListener('change', commit);
    }
    this.count = document.createElement('span');
    this.count.className = `cm-np-search-count ${editorSearchClasses.count}`;
    this.count.setAttribute('aria-live', 'polite');
    const options = [
      { label: searchPanelWords.matchCase, text: 'Aa', key: 'caseSensitive' },
      { label: searchPanelWords.regexp, text: '.*', key: 'regexp' },
      { label: searchPanelWords.wholeWord, text: 'W', key: 'wholeWord' },
    ] as const;
    this.toggles = options.map((option) => {
      const toggle = button(option.text, () =>
        this.option(option.key, !this.query[option.key]),
      );
      toggle.className = buttonClassName({
        variant: 'ghost',
        iconOnly: true,
        size: 'compact',
        className: 'aria-pressed:bg-active',
      });
      toggle.title = option.label;
      toggle.setAttribute('aria-label', option.label);
      return toggle;
    });
    this.replacementToggle = button('Replace', () =>
      this.showReplace(!this.replaceVisible),
    );
    this.replacementToggle.className = buttonClassName({
      variant: 'ghost',
      size: 'compact',
      className: 'aria-expanded:bg-active',
    });
    this.replacementToggle.setAttribute('aria-label', 'Show replace');
    this.replacementToggle.setAttribute('aria-expanded', 'false');
    const more = button('Options', () => {
      more.disabled = true;
      void openOptionsSheet(
        'Find options',
        options.map((option) => ({
          label: option.label,
          read: () => this.query[option.key],
          change: (checked: boolean) => this.option(option.key, checked),
        })),
      )
        .then((close) => {
          if (this.destroyed) close();
          else this.closeOptions = close;
        })
        .finally(() => {
          more.disabled = false;
        });
    });
    more.className = buttonClassName({
      variant: 'ghost',
      size: 'compact',
      className: editorSearchClasses.more,
    });
    more.setAttribute('aria-label', 'Find options');
    const close = iconButton(searchPanelWords.close, closeParts, () =>
      closeSearchPanel(view),
    );
    close.classList.add(...editorSearchClasses.close.split(' '));
    const previous = iconButton(
      searchPanelWords.previous,
      chevronDownParts,
      () => {
        findPrevious(view);
      },
    );
    previous.querySelector('svg')?.classList.add('rotate-180');
    const next = iconButton(searchPanelWords.next, chevronDownParts, () => {
      findNext(view);
    });
    this.matchActions = [previous, next];
    const desktop = document.createElement('span');
    desktop.className = editorSearchClasses.options;
    desktop.append(...this.toggles);
    const controls = band(
      this.count,
      previous,
      next,
      desktop,
      more,
      ...(view.state.readOnly ? [] : [this.replacementToggle]),
    );
    controls.classList.add(...editorSearchClasses.controls.split(' '));
    const primary = document.createElement('div');
    primary.className = editorSearchClasses.main;
    primary.append(this.searchField, controls, close);
    const replaceOne = button(searchPanelWords.replaceOne, () => {
      replaceNext(view);
    });
    const replaceEvery = button(searchPanelWords.replaceAll, () => {
      replaceAll(view);
    });
    this.replaceActions = [replaceOne, replaceEvery];
    const actions = document.createElement('div');
    actions.className = editorSearchClasses.actions;
    actions.append(...this.replaceActions);
    this.replacement = document.createElement('div');
    this.replacement.className = `cm-np-search-row cm-np-search-replacement ${editorSearchClasses.replacement}`;
    this.replacement.append(this.replaceField, actions);
    this.replacement.hidden = true;
    this.status = document.createElement('div');
    this.status.className = editorSearchClasses.status;
    this.status.setAttribute('role', 'status');
    this.status.id = `note-find-status-${String(++nextPanelId)}`;
    this.searchField.setAttribute('aria-describedby', this.status.id);
    this.dom = document.createElement('div');
    this.dom.className = 'cm-np-search';
    this.dom.setAttribute('role', 'search');
    this.dom.setAttribute('aria-label', searchPanelWords.panel);
    this.dom.append(
      primary,
      ...(view.state.readOnly ? [] : [this.replacement]),
      this.status,
    );
    this.refresh();
    this.dom.addEventListener('keydown', (event) => {
      this.keydown(event);
    });
  }

  /** States the query of the fields to the editor, when it changed. */
  private commit(): void {
    const query = new SearchQuery({
      search: this.searchField.value,
      caseSensitive: this.query.caseSensitive,
      regexp: this.query.regexp,
      wholeWord: this.query.wholeWord,
      replace: this.replaceField.value,
    });
    if (query.eq(this.query)) return;
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  /** The keys of the panel, as the panel of the package reads them. */
  private keydown(event: KeyboardEvent): void {
    if (runScopeHandlers(this.view, event, 'search-panel')) {
      event.preventDefault();
      return;
    }
    const command = searchPanelKey(
      event,
      event.target === this.searchField
        ? 'find'
        : event.target === this.replaceField
          ? 'replace'
          : 'other',
    );
    if (command === null) return;
    event.preventDefault();
    if (command === 'next') findNext(this.view);
    else if (command === 'previous') findPrevious(this.view);
    else replaceNext(this.view);
  }

  update(update: ViewUpdate): void {
    for (const transaction of update.transactions)
      for (const effect of transaction.effects)
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query))
          this.setQuery(effect.value);
    this.refresh();
  }

  /** Shows a query that the editor set, for example from the selection. */
  private setQuery(query: SearchQuery): void {
    this.query = query;
    this.searchField.value = query.search;
    this.replaceField.value = query.replace;
    this.refresh();
  }

  private option(
    key: 'caseSensitive' | 'regexp' | 'wholeWord',
    checked: boolean,
  ): void {
    const query = new SearchQuery({
      search: this.query.search,
      replace: this.query.replace,
      caseSensitive: this.query.caseSensitive,
      regexp: this.query.regexp,
      wholeWord: this.query.wholeWord,
      [key]: checked,
    });
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    this.refresh();
  }
  private showReplace(show: boolean): void {
    this.replaceVisible = show;
    this.replacement.hidden = !show;
    this.replacementToggle.setAttribute('aria-expanded', String(show));
    this.replacementToggle.setAttribute(
      'aria-label',
      show ? 'Hide replace' : 'Show replace',
    );
    this.view.requestMeasure();
  }
  private refresh(): void {
    const state = this.view.state;
    if (this.countedDoc !== state.doc || this.countedQuery !== this.query) {
      this.matches = [];
      if (this.query.valid) {
        const cursor = this.query.getCursor(state.doc);
        for (;;) {
          const match = cursor.next();
          if (match.done) break;
          this.matches.push({ from: match.value.from, to: match.value.to });
        }
      }
      this.countedDoc = state.doc;
      this.countedQuery = this.query;
    }
    let current = this.matches.findIndex(
      (match) =>
        match.from === state.selection.main.from &&
        match.to === state.selection.main.to,
    );
    if (current < 0)
      current = this.matches.findIndex(
        (match) => match.to >= state.selection.main.head,
      );
    this.count.textContent = `${this.matches.length === 0 ? 0 : current < 0 ? 1 : current + 1} of ${this.matches.length}`;
    const invalid = this.query.search.length > 0 && !this.query.valid;
    this.searchField.className = fieldClassName({
      invalid,
      className: `cm-np-search-field ${editorSearchClasses.query}`,
    });
    this.searchField.setAttribute('aria-invalid', String(invalid));
    this.status.className = invalid
      ? editorSearchClasses.error
      : editorSearchClasses.status;
    const message = invalid
      ? 'Invalid regular expression. Check the pattern.'
      : this.query.search.length === 0
        ? 'Enter text to find.'
        : this.matches.length === 0
          ? 'No matches'
          : '';
    if (this.status.textContent !== message) {
      this.status.textContent = message;
      this.status.hidden = message.length === 0;
      this.view.requestMeasure();
    }
    for (const action of this.matchActions)
      action.disabled = this.matches.length === 0;
    for (const action of this.replaceActions)
      action.disabled = state.readOnly || this.matches.length === 0;
    [this.query.caseSensitive, this.query.regexp, this.query.wholeWord].forEach(
      (pressed, index) =>
        this.toggles[index]?.setAttribute('aria-pressed', String(pressed)),
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.closeOptions?.();
  }

  mount(): void {
    this.searchField.select();
  }
}

/** The panel of `search({ createPanel })`. */
export function createSearchPanel(view: EditorView): Panel {
  return new SearchPanel(view);
}
