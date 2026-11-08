/** Real CodeMirror commands retain selection, history and panel focus. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

await test('find counts exact single selections and preserves replace history', async () => {
  const browser = new Window({ url: 'http://localhost/' });
  const names = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'MutationObserver',
    'ResizeObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ] as const;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of names) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    const value: unknown = browser[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value:
        typeof value === 'function' && /^[a-z]/.test(name)
          ? value.bind(browser)
          : value,
    });
  }
  const { EditorState, EditorSelection } = await import('@codemirror/state');
  const { EditorView } = await import('@codemirror/view');
  const {
    search,
    openSearchPanel,
    findNext,
    findPrevious,
    selectMatches,
    SearchQuery,
    setSearchQuery,
    replaceNext,
    replaceAll,
    closeSearchPanel,
  } =
    await import('../../packages/editor/node_modules/@codemirror/search/dist/index.js');
  const { history, undo, redo } =
    await import('../../packages/editor/node_modules/@codemirror/commands/dist/index.js');
  const { createSearchPanel, searchPanelScrollMargins } =
    await import('../../packages/editor/dist/search-panel.js');
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: 'seed Seed seedling seed',
      extensions: [
        history(),
        EditorState.allowMultipleSelections.of(true),
        searchPanelScrollMargins,
        search({ createPanel: createSearchPanel }),
      ],
    }),
  });
  try {
    openSearchPanel(view);
    // Search wraps createPanel, so a direct getPanel(factory) lookup misses it.
    const searchMargins = view.state.facet(EditorView.scrollMargins)[0];
    assert.ok(searchMargins);
    assert.deepEqual(searchMargins(view), { top: 0, bottom: 0 });
    const input = view.dom.querySelector<HTMLInputElement>('input[main-field]');
    assert.ok(input);
    const count = () =>
      view.dom.querySelector('[aria-live]')?.getAttribute('aria-label');
    const set = (query: InstanceType<typeof SearchQuery>) =>
      view.dispatch({ effects: setSearchQuery.of(query) });
    set(
      new SearchQuery({
        search: 'seed',
        replace: 'plant',
        caseSensitive: true,
        wholeWord: true,
      }),
    );
    assert.equal(count(), '2 matches');
    // One match that is not selected reads in the singular.
    set(new SearchQuery({ search: 'seedling' }));
    assert.equal(count(), '1 match');
    // The phone shows the short form of the same count.
    assert.equal(
      view.dom.querySelector('[aria-live]')?.lastElementChild?.textContent,
      '1 found',
    );
    set(
      new SearchQuery({
        search: 'seed',
        replace: 'plant',
        caseSensitive: true,
        wholeWord: true,
      }),
    );
    findNext(view);
    assert.equal(count(), '1 of 2');
    findNext(view);
    assert.equal(count(), '2 of 2');
    findNext(view);
    assert.equal(count(), '1 of 2');
    findPrevious(view);
    assert.equal(count(), '2 of 2');
    selectMatches(view);
    assert.equal(view.state.selection.ranges.length, 2);
    assert.equal(count(), '2 matches');
    view.dispatch({ selection: EditorSelection.single(1, 3) });
    assert.equal(count(), '2 matches');
    set(new SearchQuery({ search: '(', regexp: true }));
    assert.equal(count(), 'Invalid pattern');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    set(new SearchQuery({ search: 'missing' }));
    assert.equal(count(), 'No matches');
    set(new SearchQuery({ search: '' }));
    assert.equal(count(), '');
    set(
      new SearchQuery({
        search: 'seed',
        replace: 'plant',
        caseSensitive: true,
        wholeWord: true,
      }),
    );
    view.dispatch({ selection: EditorSelection.single(0, 4) });
    replaceNext(view);
    assert.equal(view.state.doc.toString(), 'plant Seed seedling seed');
    undo(view);
    assert.equal(view.state.doc.toString(), 'seed Seed seedling seed');
    redo(view);
    assert.equal(view.state.doc.toString(), 'plant Seed seedling seed');
    undo(view);
    replaceAll(view);
    assert.equal(view.state.doc.toString(), 'plant Seed seedling plant');
    undo(view);
    assert.equal(view.state.doc.toString(), 'seed Seed seedling seed');
    input.focus();
    closeSearchPanel(view);
    assert.equal(view.dom.querySelector('[role=search]'), null);
    assert.ok(view.hasFocus);
    assert.equal(searchMargins(view), null);
    const readonlyView = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'seed',
        extensions: [
          EditorState.readOnly.of(true),
          search({ createPanel: createSearchPanel }),
        ],
      }),
    });
    try {
      openSearchPanel(readonlyView);
      readonlyView.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({ search: 'seed', replace: 'plant' }),
        ),
      });
      assert.equal(
        readonlyView.dom.querySelector('[aria-label="Show replace"]'),
        null,
      );
      assert.equal(
        readonlyView.dom.querySelector('[aria-label="Replace with"]'),
        null,
      );
      replaceNext(readonlyView);
      replaceAll(readonlyView);
      assert.equal(readonlyView.state.doc.toString(), 'seed');
    } finally {
      readonlyView.destroy();
    }
  } finally {
    view.destroy();
    await browser.happyDOM.close();
    for (const name of names) {
      const original = originals.get(name);
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

await test('the replace key, Show replace and the options trigger keep focus and state', async () => {
  const browser = new Window({ url: 'http://localhost/' });
  const names = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLInputElement',
    'Element',
    'Node',
    'MutationObserver',
    'ResizeObserver',
    'getComputedStyle',
    'matchMedia',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ] as const;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of names) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    const value: unknown = browser[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value:
        typeof value === 'function' && /^[a-z]/.test(name)
          ? value.bind(browser)
          : value,
    });
  }
  const { EditorState } = await import('@codemirror/state');
  const { EditorView, keymap } = await import('@codemirror/view');
  const { search, closeSearchPanel, SearchQuery, setSearchQuery } =
    await import('../../packages/editor/node_modules/@codemirror/search/dist/index.js');
  const { createSearchPanel, openReplacePanel } =
    await import('../../packages/editor/dist/search-panel.js');
  const { editorCommands } =
    await import('../../packages/editor/dist/extensions.js');
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: 'seed Seed seedling seed',
      extensions: [search({ createPanel: createSearchPanel })],
    }),
  });
  const field = (label: string) =>
    view.dom.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  const button = (label: string) =>
    view.dom.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  // Polls a condition that a dynamic import settles, with no fixed wait.
  const until = async (check: () => boolean, message: string) => {
    for (let turn = 0; turn < 500 && !check(); turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(check(), message);
  };
  try {
    // The key opens the panel with the replace row and the focus in it.
    view.focus();
    assert.equal(openReplacePanel(view), true);
    assert.equal(field('Replace with')?.hidden, false);
    assert.equal(document.activeElement, field('Replace with'));
    assert.equal(button('Show replace')?.getAttribute('aria-pressed'), 'true');
    // Show replace hides the row and gives the focus back to Find.
    button('Show replace')?.click();
    assert.equal(field('Replace with')?.hidden, true);
    assert.equal(document.activeElement, field('Find'));
    // From Find, the key opens the row again; Show replace does the same.
    openReplacePanel(view);
    assert.equal(document.activeElement, field('Replace with'));
    button('Show replace')?.click();
    field('Find')?.focus();
    button('Show replace')?.click();
    assert.equal(field('Replace with')?.hidden, false);
    assert.equal(document.activeElement, field('Replace with'));

    // The options trigger names its dialog while it is open.
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: 'seed' })),
    });
    const more = button('More find options');
    assert.ok(more);
    assert.equal(more.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(more.getAttribute('aria-expanded'), 'false');
    assert.equal(more.getAttribute('aria-controls'), null);
    field('Find')?.focus();
    more.click();
    assert.equal(more.getAttribute('aria-expanded'), 'true');
    await until(
      () => document.getElementById('editor-options-title-panel') !== null,
      'the options dialog did not open',
    );
    assert.equal(
      more.getAttribute('aria-controls'),
      'editor-options-title-panel',
    );
    // A second press while it shows opens nothing more.
    more.click();
    assert.equal(document.querySelectorAll('[role=dialog]').length, 1);
    const done = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role=dialog] button'),
    ).find((control) => control.textContent === 'Done');
    assert.ok(done);
    done.click();
    await until(
      () => document.getElementById('editor-options-title-panel') === null,
      'the options dialog did not close',
    );
    assert.equal(more.getAttribute('aria-expanded'), 'false');
    assert.equal(more.getAttribute('aria-controls'), null);
    // The focus goes back where it was when the sheet opened.
    assert.equal(document.activeElement, field('Find'));
    closeSearchPanel(view);
  } finally {
    view.destroy();
  }

  // The editor binds the key in the text and in the fields of the panel.
  const bound = new EditorView({
    parent,
    state: EditorState.create({ doc: 'seed', extensions: [editorCommands()] }),
  });
  try {
    const bindings = bound.state
      .facet(keymap)
      .flat()
      .filter((binding) => binding.key === 'Mod-h');
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0]?.run, openReplacePanel);
    assert.equal(bindings[0]?.mac, 'Mod-Alt-f');
    assert.deepEqual(bindings[0]?.scope?.split(' ').sort(), [
      'editor',
      'search-panel',
    ]);
  } finally {
    bound.destroy();
  }

  // A note that cannot change opens the find row alone.
  const readonly = new EditorView({
    parent,
    state: EditorState.create({
      doc: 'seed',
      extensions: [
        EditorState.readOnly.of(true),
        search({ createPanel: createSearchPanel }),
      ],
    }),
  });
  try {
    openReplacePanel(readonly);
    assert.ok(readonly.dom.querySelector('[role=search]'));
    assert.equal(
      readonly.dom.querySelector('input[aria-label="Replace with"]'),
      null,
    );
  } finally {
    readonly.destroy();
    await browser.happyDOM.close();
    for (const name of names) {
      const original = originals.get(name);
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
