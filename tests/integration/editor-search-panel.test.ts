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
