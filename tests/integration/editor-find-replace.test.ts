/** Real editor commands through the find panel DOM, without service data. */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Window } from 'happy-dom';
import { buttonClassName, editorSearchClasses } from '@notesapp/ui';

const browser = new Window({ url: 'http://localhost/' });
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Text',
  'MutationObserver',
  'ResizeObserver',
  'DOMRect',
  'Range',
  'getComputedStyle',
  'KeyboardEvent',
  'Event',
  'HTMLInputElement',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const;
// Happy DOM has no font loader. This fixture has no table or font request.
browser.document.write('<!doctype html><html><body></body></html>');
Object.defineProperty(browser.document, 'fonts', {
  value: Object.assign(new browser.EventTarget(), {
    status: 'loaded',
    ready: Promise.resolve(),
  }),
});
const originals = new Map<string, PropertyDescriptor | undefined>();
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
const { createEditor, openFindAndReplace } = await import('@notesapp/editor');
after(async () => {
  await browser.happyDOM.abort();
  for (const [name, value] of originals) {
    if (value) Object.defineProperty(globalThis, name, value);
    else Reflect.deleteProperty(globalThis, name);
  }
});

function input(label: string, value: string): HTMLInputElement {
  const field = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  assert.ok(field);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return field;
}
function click(label: string): HTMLButtonElement {
  const button =
    document.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    ) ??
    [
      ...document.querySelectorAll<HTMLButtonElement>('.cm-np-search button'),
    ].find((button) => button.textContent === label);
  assert.ok(button, label);
  button.click();
  return button;
}
function key(
  target: HTMLElement,
  key: string,
  options: { shiftKey?: boolean; ctrlKey?: boolean } = {},
): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    }),
  );
}
function count(): string | null | undefined {
  return document.querySelector('.cm-np-search-count')?.textContent;
}
function fixture(text = 'launch Launch launches launch', readOnly = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = createEditor(host, text, () => {}, { readOnly });
  openFindAndReplace(view);
  return {
    view,
    close() {
      view.destroy();
      host.remove();
    },
  };
}

await test('query typing, selection, options, counts and wrap navigation keep one view', () => {
  const f = fixture();
  try {
    const field = input('Find', 'launch');
    assert.equal(count(), '1 of 4');
    field.focus();
    key(field, 'Enter');
    assert.equal(
      f.view.state.sliceDoc(
        f.view.state.selection.main.from,
        f.view.state.selection.main.to,
      ),
      'launch',
    );
    key(field, 'Enter');
    assert.equal(count(), '2 of 4');
    key(field, 'Enter', { shiftKey: true });
    assert.equal(count(), '1 of 4');
    key(field, 'Enter', { shiftKey: true });
    assert.equal(count(), '4 of 4');
    click('Match case');
    assert.equal(count()?.endsWith('of 3'), true);
    click('Whole word');
    assert.equal(count()?.endsWith('of 2'), true);
    click('Match case');
    assert.equal(count()?.endsWith('of 3'), true);
    click('Whole word');
    click('Regular expression');
    input('Find', 'launch(?:es)?');
    assert.equal(count()?.endsWith('of 4'), true);
    assert.equal(f.view.state.doc.toString(), 'launch Launch launches launch');
    assert.equal(
      f.view.dom.parentElement?.querySelectorAll('.cm-editor').length,
      1,
    );
  } finally {
    f.close();
  }
});

await test('replace next, replace all, capture groups and undo preserve editing history', () => {
  const f = fixture('red-1 red-2 red-3');
  try {
    input('Find', 'red-(\\d)');
    click('Regular expression');
    click('Show replace');
    const replace = input('Replace with', 'blue-$1');
    key(replace, 'Enter');
    key(replace, 'Enter');
    assert.ok(f.view.state.doc.toString().includes('blue-1'));
    click('Replace all');
    assert.equal(f.view.state.doc.toString(), 'blue-1 blue-2 blue-3');
    f.view.focus();
    key(f.view.contentDOM, 'z', { ctrlKey: true });
    assert.ok(f.view.state.doc.toString().includes('red-'));
    key(f.view.contentDOM, 'z', { ctrlKey: true });
    assert.equal(f.view.state.doc.toString(), 'red-1 red-2 red-3');
  } finally {
    f.close();
  }
});

await test('empty replacement deletes matches and closing replace keeps its draft', () => {
  const f = fixture('one one');
  try {
    input('Find', 'one');
    click('Show replace');
    input('Replace with', 'two');
    click('Hide replace');
    click('Show replace');
    assert.equal(
      document.querySelector<HTMLInputElement>('[aria-label="Replace with"]')
        ?.value,
      'two',
    );
    input('Replace with', '');
    click('Replace all');
    assert.equal(f.view.state.doc.toString(), ' ');
  } finally {
    f.close();
  }
});

await test('no-match, empty and regex error states disable actions without edits', () => {
  const f = fixture();
  try {
    click('Show replace');
    for (const query of ['', 'missing']) {
      input('Find', query);
      assert.equal(count(), '0 of 0');
      assert.ok(
        document.querySelector<HTMLButtonElement>('[aria-label="Next"]')
          ?.disabled,
      );
      assert.ok(
        [
          ...document.querySelectorAll<HTMLButtonElement>(
            '.cm-np-search-replacement button',
          ),
        ].every((b) => b.disabled),
      );
    }
    click('Regular expression');
    const field = input('Find', '[');
    assert.equal(field.getAttribute('aria-invalid'), 'true');
    assert.equal(
      document.getElementById(field.getAttribute('aria-describedby') ?? '')
        ?.textContent,
      'Invalid regular expression. Check the pattern.',
    );
    key(field, 'Enter');
    assert.equal(f.view.state.doc.toString(), 'launch Launch launches launch');
    input('Find', 'launch');
    assert.equal(field.getAttribute('aria-invalid'), 'false');
    assert.equal(
      document.querySelector<HTMLButtonElement>('[aria-label="Next"]')
        ?.disabled,
      false,
    );
  } finally {
    f.close();
  }
});

await test('replace actions use the shared cluster and normal field-height button recipe', () => {
  const f = fixture();
  try {
    input('Find', 'launch');
    click('Show replace');
    const actions = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.cm-np-search-replacement button',
      ),
    ];
    assert.equal(actions.length, 2);
    assert.equal(
      actions[0]?.parentElement?.className,
      editorSearchClasses.actions,
    );
    for (const button of actions)
      assert.equal(
        button.className,
        buttonClassName({ variant: 'secondary', size: 'default' }),
      );
  } finally {
    f.close();
  }
});

await test('read-only search keeps options and has no replacement action', () => {
  const f = fixture('launch Launch', true);
  try {
    input('Find', 'launch');
    assert.equal(count(), '1 of 2');
    click('Match case');
    assert.equal(count(), '1 of 1');
    assert.equal(document.querySelector('[aria-label="Show replace"]'), null);
    assert.equal(document.querySelector('[aria-label="Replace with"]'), null);
    assert.equal(document.querySelector('.cm-np-search-replacement'), null);
  } finally {
    f.close();
  }
});

await test('opening from a selection and Escape return focus without changing text or selection', () => {
  const f = fixture('one launch two');
  try {
    click('Close');
    f.view.dispatch({ selection: { anchor: 4, head: 10 } });
    f.view.focus();
    openFindAndReplace(f.view);
    const field = document.querySelector<HTMLInputElement>(
      '[aria-label="Find"]',
    );
    assert.ok(field);
    assert.equal(field.value, 'launch');
    assert.equal(field.selectionStart, 0);
    assert.equal(field.selectionEnd, 6);
    field.focus();
    key(field, 'Escape');
    assert.equal(document.querySelector('.cm-np-search'), null);
    assert.equal(document.activeElement, f.view.contentDOM);
    assert.equal(f.view.state.selection.main.from, 4);
    assert.equal(f.view.state.selection.main.to, 10);
    assert.equal(f.view.state.doc.toString(), 'one launch two');
  } finally {
    f.close();
  }
});

await test('zero-width regex replacement and undo do not lose document content', () => {
  const f = fixture('red\nred');
  try {
    input('Find', '^');
    click('Regular expression');
    assert.equal(count(), '1 of 2');
    click('Show replace');
    input('Replace with', '> ');
    click('Replace all');
    assert.equal(f.view.state.doc.toString(), '> red\n> red');
    f.view.focus();
    key(f.view.contentDOM, 'z', { ctrlKey: true });
    assert.equal(f.view.state.doc.toString(), 'red\nred');
  } finally {
    f.close();
  }
});
