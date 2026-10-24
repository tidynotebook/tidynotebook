import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Window } from 'happy-dom';

/** Check the same reconfiguration with a normal or exhausted parse budget. */
async function checkReconfiguration(
  t: TestContext,
  exhaustInitialBudget = false,
) {
  // Install the DOM before loading CodeMirror, as in note-link-surfaces.
  const browser = new Window({ url: 'http://localhost/' });
  browser.document.write('<!doctype html><html><body></body></html>');
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = [
    'window',
    'document',
    'MutationObserver',
    'ResizeObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getComputedStyle',
  ] as const;
  for (const name of globals) {
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
  try {
    const { createEditor, setEditorTheme, setEditorRich } =
      await import('../../packages/editor/dist/create-editor.js');
    const { findRichRegions } =
      await import('../../packages/editor/dist/widgets.js');
    const { fenceLanguageOf } =
      await import('../../packages/editor/dist/language.js');
    const { forceParsing, syntaxTreeAvailable } =
      await import('@codemirror/language');
    const doc =
      '# Editor and math\n\n```javascript\nfunction greet(name) {\n  return `Hello, ${name}`;\n}\nconst count = 42;\n```\n\nInline math: $E = mc^2$.\n\n$$\n\\frac{a}{b} + \\sqrt{x^2 + y^2}\n$$\n\nEnd of smoke test.\n';
    const rich = { renderMath: () => '<span>Formula</span>' };
    // End the initial parse budget before it can reach the math. Restore
    // the clock before any async work or reconfiguration.
    let time = 0;
    const clock = exhaustInitialBudget
      ? t.mock.method(Date, 'now', () => (time += 100))
      : undefined;
    const view = (() => {
      try {
        return createEditor(document.body, doc, () => {}, {
          theme: 'light',
          rich,
        });
      } finally {
        clock?.mock.restore();
      }
    })();
    try {
      if (exhaustInitialBudget) {
        assert.equal(
          syntaxTreeAvailable(view.state, view.state.doc.length),
          false,
        );
        assert.deepEqual(findRichRegions(view.state), []);
        assert.equal(view.state.doc.toString(), doc);
      }
      // Finish the lazy fence load and queued viewport work, then publish
      // a complete tree before reading regions or reconfiguring the editor.
      const fence = fenceLanguageOf('javascript');
      assert.ok(fence !== null);
      await fence.load();
      await browser.happyDOM.waitUntilComplete();
      assert.ok(forceParsing(view, view.state.doc.length));
      assert.ok(syntaxTreeAvailable(view.state, view.state.doc.length));
      assert.equal(view.state.doc.toString(), doc);
      const expected = findRichRegions(view.state);
      assert.deepEqual(
        expected.map(({ kind, from, to }) => ({ kind, from, to })),
        [
          { kind: 'math-inline', from: 121, to: 131 },
          { kind: 'math-display', from: 134, to: 170 },
        ],
      );
      for (const theme of ['dark', 'light'] as const) {
        setEditorTheme(view, theme);
        setEditorRich(view, rich);
        assert.deepEqual(findRichRegions(view.state), expected);
        assert.equal(view.state.doc.toString(), doc);
        assert.ok(view.dom.textContent?.includes('End of smoke test.'));
      }
    } finally {
      view.destroy();
    }
  } finally {
    await browser.happyDOM.close();
    for (const [name, original] of originals) {
      if (original === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, original);
    }
  }
}

await test('display math keeps its source range after viewport parsing and editor reconfiguration', (t) =>
  checkReconfiguration(t));

await test('display math waits for a complete tree after the initial parse budget ends', (t) =>
  checkReconfiguration(t, true));
