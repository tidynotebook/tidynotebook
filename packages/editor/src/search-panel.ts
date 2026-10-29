/**
 * The find and replace panel of the note editor (issue 247).
 *
 * `@codemirror/search` draws a panel of its own, with lowercase words, grey
 * native buttons and a raw close mark. Its documented `createPanel` option
 * takes a panel of ours instead, so this module builds the panel from the
 * recipes of `packages/ui`: two fields, the buttons, three checkboxes and a
 * close action with the close glyph of the icon set. The words are sentence
 * case and say what each control does.
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
  moreParts,
  replaceParts,
  openOptionsSheet,
  closeParts,
  fieldClassName,
  glyph,
} from '@notesapp/ui';

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
const glyphClass = 'size-4 shrink-0';

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
  control.className = buttonClassName({ variant: 'secondary', size: 'sm' });
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
    size: 'sm',
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
  row.className = 'cm-np-search-row';
  row.append(...children);
  return row;
}

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
    this.searchField.classList.add('cm-np-search-field');
    this.replaceField = field(searchPanelWords.replace, this.query.replace);
    this.replaceField.classList.add('cm-np-search-field');
    for (const input of [this.searchField, this.replaceField]) {
      input.addEventListener('input', commit);
      input.addEventListener('change', commit);
    }
    this.count = document.createElement('span');
    this.count.className =
      'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-secondary text-muted';
    this.count.setAttribute('aria-live', 'polite');
    this.searchField.classList.add('pr-16');
    const search = document.createElement('div');
    search.className = 'relative min-w-0 flex-1 lg:max-w-80';
    search.append(this.searchField, this.count);
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
        size: 'sm',
        className: 'aria-pressed:bg-active',
      });
      toggle.title = option.label;
      toggle.setAttribute('aria-label', option.label);
      return toggle;
    });
    const replacementToggle = iconButton('Show replace', replaceParts, () =>
      this.showReplace(!this.replaceVisible),
    );

    replacementToggle.setAttribute('aria-pressed', 'false');
    const more = button('More', () => {
      more.disabled = true;
      void openOptionsSheet('Find options', [
        ...options.map((option) => ({
          label: option.label,
          read: () => this.query[option.key],
          change: (checked: boolean) => this.option(option.key, checked),
        })),
        ...(view.state.readOnly
          ? []
          : [
              {
                label: 'Replace',
                read: () => this.replaceVisible,
                change: (checked: boolean) => this.showReplace(checked),
              },
            ]),
      ])
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
      size: 'sm',
      iconOnly: true,
    });
    more.setAttribute('aria-label', 'More find options');
    more.title = 'More find options';
    more.replaceChildren(glyph(glyphClass, moreParts));
    const close = iconButton(searchPanelWords.close, closeParts, () =>
      closeSearchPanel(view),
    );
    close.classList.add('lg:ml-auto');
    const previous = iconButton(
      searchPanelWords.previous,
      chevronDownParts,
      () => {
        findPrevious(view);
      },
    );
    previous.querySelector('svg')?.classList.add('rotate-180');
    const desktop = document.createElement('span');
    desktop.className = 'hidden lg:contents';
    desktop.append(
      ...this.toggles,
      ...(view.state.readOnly ? [] : [replacementToggle]),
    );
    const phone = document.createElement('span');
    phone.className = 'lg:hidden';
    phone.append(more);
    const rows = [
      band(
        search,
        previous,
        iconButton(searchPanelWords.next, chevronDownParts, () => {
          findNext(view);
        }),
        desktop,
        phone,
        close,
      ),
    ];
    this.replacement = band(
      this.replaceField,
      button(searchPanelWords.replaceOne, () => {
        replaceNext(view);
      }),
      button(searchPanelWords.replaceAll, () => {
        replaceAll(view);
      }),
    );
    this.replacement.hidden = true;
    if (!view.state.readOnly) rows.push(this.replacement);
    this.dom = document.createElement('div');
    this.dom.className = 'cm-np-search';
    this.dom.setAttribute('role', 'search');
    this.dom.setAttribute('aria-label', searchPanelWords.panel);
    this.dom.append(...rows);
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
    this.dom
      .querySelector('[aria-label="Show replace"]')
      ?.setAttribute('aria-pressed', String(show));
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
