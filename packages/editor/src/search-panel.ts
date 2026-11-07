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
  getPanel,
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
  bareFieldClassName,
  countedFieldClassName,
  editorSearchClasses,
  readVisibleArea,
  followVisibleArea,
  glyph,
} from '@notesapp/ui';

/** Shared search layout, also checked against the served stylesheet. */
export const searchPanelClasses = editorSearchClasses;

/** An ordinal names an exact, single selection, never the next candidate. */
export function currentSearchMatch(
  state: EditorState,
  matches: readonly { from: number; to: number }[],
): number {
  if (state.selection.ranges.length !== 1) return -1;
  return matches.findIndex(
    (match) =>
      match.from === state.selection.main.from &&
      match.to === state.selection.main.to,
  );
}

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
  control.className = buttonClassName({
    variant: 'secondary',
    size: 'compact',
  });
  control.textContent = label;
  // Keep the current field and phone keyboard while using panel actions.
  control.addEventListener('pointerdown', (event) => event.preventDefault());
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
/** A group owns item spacing and stretches its controls equally. */
function group(
  className: string,
  ...children: readonly HTMLElement[]
): HTMLElement {
  const row = document.createElement('div');
  row.className = className;
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
  private readonly longCount = document.createElement('span');
  private readonly shortCount = document.createElement('span');
  private readonly toggles: readonly HTMLButtonElement[];
  private readonly replacement: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly mainActions: HTMLElement;
  private readonly tail: HTMLElement;
  private readonly search: HTMLElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private observer: ResizeObserver | undefined;
  private stopViewport: (() => void) | undefined;
  private margin = { top: 0, bottom: 0 };
  private reveal = false;
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
    this.searchField.className = bareFieldClassName();
    this.replaceField = field(searchPanelWords.replace, this.query.replace);
    this.replaceField.className = fieldClassName({
      className: editorSearchClasses.replacement,
    });
    for (const input of [this.searchField, this.replaceField]) {
      input.addEventListener('input', commit);
      input.addEventListener('change', commit);
    }
    this.count = document.createElement('span');
    this.count.className = searchPanelClasses.count;
    this.count.setAttribute('aria-live', 'polite');
    this.longCount.className = editorSearchClasses.desktop;
    this.shortCount.className = editorSearchClasses.phone;
    this.count.append(this.longCount, this.shortCount);
    const search = document.createElement('div');
    this.search = search;
    search.className = countedFieldClassName();
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
        variant: 'secondary',
        size: 'compact',
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
    replacementToggle.classList.add('aria-pressed:bg-active');
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
      size: 'compact',
      iconOnly: true,
    });
    more.setAttribute('aria-label', 'More find options');
    more.title = 'More find options';
    more.replaceChildren(glyph(glyphClass, moreParts));
    const close = iconButton(searchPanelWords.close, closeParts, () =>
      closeSearchPanel(view),
    );
    const previous = iconButton(
      searchPanelWords.previous,
      chevronDownParts,
      () => {
        findPrevious(view);
      },
    );
    previous.querySelector('svg')?.classList.add('rotate-180');
    this.previous = previous;
    this.next = iconButton(searchPanelWords.next, chevronDownParts, () =>
      findNext(view),
    );
    const navigation = group(
      editorSearchClasses.navigation,
      previous,
      this.next,
    );
    const desktop = group(editorSearchClasses.desktop, ...this.toggles);
    const phone = group(editorSearchClasses.phone, more);
    this.tail = group(
      editorSearchClasses.tail,
      phone,
      ...(view.state.readOnly
        ? []
        : [group(editorSearchClasses.desktop, replacementToggle)]),
      close,
    );
    this.mainActions = group(
      editorSearchClasses.main,
      navigation,
      desktop,
      this.tail,
    );
    this.replacement = this.replaceField;
    const one = button(searchPanelWords.replaceOne, () => {
      replaceNext(view);
    });
    const all = button(searchPanelWords.replaceAll, () => {
      replaceAll(view);
    });
    for (const control of [one, all])
      control.className = buttonClassName({
        variant: 'secondary',
        className: editorSearchClasses.grow,
      });
    this.actions = group(editorSearchClasses.actions, one, all);
    this.replacement.hidden = this.actions.hidden = true;
    this.dom = document.createElement('div');
    this.dom.className = `cm-np-search ${editorSearchClasses.card}`;
    this.dom.setAttribute('role', 'search');
    this.dom.setAttribute('aria-label', searchPanelWords.panel);
    const grid = group(editorSearchClasses.grid, search, this.mainActions);
    if (!view.state.readOnly) grid.append(this.replacement);
    this.dom.append(grid);
    if (!view.state.readOnly) this.dom.append(this.actions);
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
    this.reveal ||= update.selectionSet || update.docChanged;
    this.measure();
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
    this.replacement.hidden = this.actions.hidden = !show;
    this.mainActions.className = show
      ? editorSearchClasses.expandedMain
      : editorSearchClasses.main;
    this.tail.className = show
      ? editorSearchClasses.expandedTail
      : editorSearchClasses.tail;
    this.reveal = true;
    this.measure();
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
    const current = currentSearchMatch(state, this.matches);
    const invalid = this.query.search.length > 0 && !this.query.valid;
    const total = this.matches.length;
    const full = !this.query.search
      ? ''
      : invalid
        ? 'Invalid pattern'
        : total === 0
          ? 'No matches'
          : current < 0
            ? `${total} matches`
            : `${current + 1} of ${total}`;
    const short = full
      .replace('No matches', 'None')
      .replace('matches', 'found')
      .replace('Invalid pattern', 'Invalid');
    this.longCount.textContent = full;
    this.shortCount.textContent = short;
    this.count.hidden = !this.query.search;
    this.count.setAttribute('aria-label', full);
    this.count.className = invalid
      ? editorSearchClasses.errorCount
      : editorSearchClasses.count;
    this.search.className = countedFieldClassName(invalid);
    this.searchField.setAttribute('aria-invalid', String(invalid));
    this.previous.disabled = this.next.disabled = total === 0;
    for (const control of this.actions.querySelectorAll('button'))
      control.disabled = total === 0 || state.readOnly;
    [this.query.caseSensitive, this.query.regexp, this.query.wholeWord].forEach(
      (pressed, index) =>
        this.toggles[index]?.setAttribute('aria-pressed', String(pressed)),
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.closeOptions?.();
    this.observer?.disconnect();
    this.stopViewport?.();
    this.view.scrollDOM.removeEventListener('scroll', this.measure);
  }

  private readonly resized = (): void => {
    this.reveal = true;
    this.measure();
  };

  /** Only browser geometry is written here; recipes own all visual steps. */
  private readonly measure = (): void => {
    if (this.destroyed) return;
    this.view.requestMeasure({
      key: this,
      read: () => {
        const editor = this.view.dom.getBoundingClientRect();
        const scroller = this.view.scrollDOM.getBoundingClientRect();
        const screen = readVisibleArea();
        const top = Math.max(scroller.top, screen.top) + 8;
        const bottom = Math.min(scroller.bottom, screen.bottom) - 8;
        const right = Math.min(editor.right, screen.right) - 8;
        const left = Math.max(editor.left, screen.left) + 8;
        const height = Math.min(
          this.dom.offsetHeight,
          Math.max(0, bottom - top),
        );
        const width = Math.min(this.dom.offsetWidth, Math.max(0, right - left));
        const current = currentSearchMatch(this.view.state, this.matches);
        const match = current < 0 ? undefined : this.matches[current];
        const start = match ? this.view.coordsAtPos(match.from) : null;
        const end = match ? this.view.coordsAtPos(match.to) : null;
        const overlap =
          start &&
          end &&
          start.top < top + height + 8 &&
          end.bottom > top - 8 &&
          Math.max(start.right, end.right) > right - width - 8;
        const below = Boolean(overlap && this.view.scrollDOM.scrollTop < 1);
        return {
          top: (below ? Math.max(top, bottom - height) : top) - editor.top,
          right: editor.right - right,
          maxHeight: Math.max(0, bottom - top),
          maxWidth: Math.max(0, right - left),
          margin: height + 16,
          below,
          match,
        };
      },
      write: (box) => {
        if (this.destroyed) return;
        this.dom.style.top = `${box.top}px`;
        this.dom.style.right = `${box.right}px`;
        this.dom.style.maxHeight = `${box.maxHeight}px`;
        this.dom.style.maxWidth = `${box.maxWidth}px`;
        this.margin = box.below
          ? { top: 0, bottom: box.margin }
          : { top: box.margin, bottom: 0 };
        if (this.reveal && box.match) {
          this.reveal = false;
          this.view.dispatch({
            effects: EditorView.scrollIntoView(this.view.state.selection.main, {
              y: 'nearest',
            }),
          });
        }
      },
    });
  };

  scrollMargin(): { top: number; bottom: number } {
    return this.margin;
  }

  mount(): void {
    this.searchField.select();
    this.observer = new ResizeObserver(this.resized);
    this.observer.observe(this.dom);
    this.observer.observe(this.view.dom);
    this.stopViewport = followVisibleArea(this.resized);
    this.view.scrollDOM.addEventListener('scroll', this.measure);
    this.reveal = true;
    this.measure();
  }
}

/** The panel of `search({ createPanel })`. */
export function createSearchPanel(view: EditorView): Panel {
  return new SearchPanel(view);
}

/** Search stays outside the flow; its measured footprint keeps matches clear. */
export const searchPanelScrollMargins = EditorView.scrollMargins.of((view) => {
  const panel = getPanel(view, createSearchPanel);
  return panel instanceof SearchPanel ? panel.scrollMargin() : null;
});
