import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { act, createElement, StrictMode, useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import type {
  PaletteAction,
  PaletteChoices,
  PaletteNote,
} from '../../apps/web/src/lib/palette-items.ts';
import * as fixture from './support/command-palette-fixture.ts';

await test('the actual command palette exposes its list and keeps its interactions', async (t) => {
  const { Window } = await import('happy-dom');
  const browser = new Window({ url: 'http://localhost/' });
  // Keep Happy DOM's own cleanup clock real. Only component window timers
  // use Node's controllable clock, with no real-time test wait.
  const clockOriginals = new Map(
    ['setTimeout', 'clearTimeout'].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const windowTimers = new Set<ReturnType<typeof setTimeout>>();
  browser.setTimeout = (callback, delay, ...args) => {
    const timer = setTimeout(() => {
      windowTimers.delete(timer);
      callback(...args);
    }, delay);
    windowTimers.add(timer);
    return timer;
  };
  browser.clearTimeout = (timer) => {
    clearTimeout(timer);
    windowTimers.delete(timer);
  };
  const names = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLInputElement',
    'Element',
    'Node',
    'Event',
    'MouseEvent',
    'KeyboardEvent',
    'MutationObserver',
    'ResizeObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'fetch',
    'IS_REACT_ACT_ENVIRONMENT',
  ] as const;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of names) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    if (name === 'fetch' || name === 'IS_REACT_ACT_ENVIRONMENT') continue;
    const value: unknown = browser[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value:
        typeof value === 'function' && /^[a-z]/.test(name)
          ? value.bind(browser)
          : value,
    });
  }
  const unexpected: string[] = [];
  const refuseNetwork = async (): Promise<never> => {
    unexpected.push('Unexpected network or service write');
    throw Error('Unexpected network or service write in palette fixture.');
  };
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: refuseNetwork,
  });
  browser.fetch = refuseNetwork;
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const fixtureUrl = new URL(
    './support/command-palette-fixture.ts',
    import.meta.url,
  ).href;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (
        context.parentURL?.endsWith('/shell/command-palette.js') &&
        specifier === '@notesapp/api-client'
      )
        return { url: fixtureUrl, shortCircuit: true };
      return next(specifier, context);
    },
  });
  const { createRoot } = await import('react-dom/client');
  const { CommandPalette } =
    await import('../../apps/web/dist/shell/command-palette.js');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const notes: readonly PaletteNote[] = [
    { fileId: 'alpha', path: 'Alpha.md', updatedAt: '2026-01-02' },
    { fileId: 'beta', path: 'Beta.md', updatedAt: '2026-01-01' },
  ];
  let serial = 0;
  function Location() {
    return createElement('output', { id: 'route' }, useLocation().pathname);
  }
  function Host({
    items,
    actions,
  }: {
    readonly items: readonly PaletteNote[];
    readonly actions: () => readonly PaletteAction[];
  }) {
    const [open, setOpen] = useState(false);
    return createElement(
      MemoryRouter,
      null,
      createElement(
        'button',
        { id: 'trigger', onClick: () => setOpen(true) },
        'Search',
      ),
      createElement('input', {
        id: 'destination',
        'aria-label': 'Action target',
      }),
      createElement(Location),
      createElement(CommandPalette, {
        open,
        onOpenChange: setOpen,
        workspaceId: 'synthetic',
        workspaceName: 'Synthetic workspace',
        notes: items,
        actions,
        store: null,
        accountId: null,
      }),
    );
  }
  /** Wait for a specific committed condition, without a fixed time delay. */
  async function until(condition: () => boolean) {
    for (let turn = 0; turn < 100 && !condition(); turn++)
      await act(async () => {
        await setImmediate();
      });
    assert.ok(
      condition(),
      'The requested committed condition must be reached.',
    );
  }
  async function render(
    items: readonly PaletteNote[] = notes,
    actions: () => readonly PaletteAction[] = () => [],
    fresh = true,
  ) {
    if (fresh) serial++;
    await act(async () =>
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(Host, { key: serial, items, actions }),
        ),
      ),
    );
  }
  function trigger() {
    const button = container.querySelector<HTMLButtonElement>('#trigger');
    assert.ok(button);
    return button;
  }
  function field() {
    const input = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input',
    );
    assert.ok(input);
    return input;
  }
  async function open() {
    trigger().focus();
    await act(async () => trigger().click());
    await until(() => document.activeElement === field());
  }
  function options() {
    return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  }
  /** Check semantic state against the actual rendered rows, not test data. */
  function listState(count: number) {
    const input = field();
    const list = document.getElementById(
      input.getAttribute('aria-controls') ?? '',
    );
    assert.ok(list);
    assert.equal(list.getAttribute('role'), 'listbox');
    assert.equal(options().length, count);
    assert.equal(input.getAttribute('role'), 'combobox');
    assert.equal(input.getAttribute('aria-autocomplete'), 'list');
    assert.equal(input.getAttribute('aria-expanded'), String(count > 0));
    assert.equal(
      input.hasAttribute('aria-haspopup'),
      false,
      'Listbox is implicit.',
    );
    const id = input.getAttribute('aria-activedescendant');
    if (count === 0) {
      assert.equal(id, null);
      assert.equal(list.querySelector('[aria-selected="true"]'), null);
    } else {
      assert.ok(id);
      const selected = document.getElementById(id);
      assert.ok(selected && list.contains(selected));
      assert.equal(selected.getAttribute('role'), 'option');
      assert.equal(selected.getAttribute('aria-selected'), 'true');
      assert.equal(list.querySelectorAll('[aria-selected="true"]').length, 1);
    }
    return input;
  }
  async function key(value: string, shiftKey = false) {
    const event = new KeyboardEvent('keydown', {
      key: value,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => field().dispatchEvent(event));
    return event;
  }
  async function type(value: string) {
    const input = field();
    const setter = Object.getOwnPropertyDescriptor(
      browser.HTMLInputElement.prototype,
      'value',
    )?.set?.bind(input);
    assert.ok(setter);
    await act(async () => {
      setter(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  async function search(query: string) {
    await type(query);
    await act(async () => t.mock.timers.tick(150));
    assert.equal(fixture.reads.at(-1), query);
  }
  const hit = (fileId: string) => ({
    fileId,
    path: fileId + '.md',
    excerpt: [],
  });
  const pick =
    (choices: PaletteChoices, choose: (id: string) => void = () => {}) =>
    (): readonly PaletteAction[] => [
      {
        id: 'pick',
        label: 'Choose template',
        icon: 'template',
        pick: {
          placeholder: 'Find a template',
          choices: () => choices,
          empty: {
            title: 'No templates',
            description: 'Add a synthetic template.',
            action: null,
          },
          noMatch: 'No template matches.',
          choose,
        },
      },
    ];
  const ready: PaletteChoices = {
    status: 'ready',
    choices: [
      { id: 'one', label: 'First', detail: null },
      { id: 'two', label: 'Second', detail: null },
    ],
    notice: null,
  };
  try {
    await t.test(
      'present rows expose the list and preserve navigation and query editing',
      async () => {
        await render();
        await open();
        const input = listState(2);
        assert.equal(
          input.getAttribute('aria-label'),
          'Search notes, or type an action',
        );
        assert.equal(
          input.getAttribute('aria-activedescendant'),
          'palette-note-alpha',
        );
        await key('ArrowUp');
        listState(2);
        assert.equal(
          input.getAttribute('aria-activedescendant'),
          'palette-note-beta',
        );
        await key('ArrowDown');
        await key('End');
        listState(2);
        assert.equal(
          input.getAttribute('aria-activedescendant'),
          'palette-note-beta',
        );
        await key('Home');
        await type('Beta');
        listState(1);
        assert.equal(
          input.getAttribute('aria-activedescendant'),
          'palette-note-beta',
        );
        input.setSelectionRange(1, 3);
        await render(notes, () => [], false);
        assert.equal(field(), input);
        assert.equal(input.value, 'Beta');
        assert.equal(input.selectionStart, 1);
        assert.equal(input.selectionEnd, 3);
        assert.equal(document.activeElement, input);
      },
    );
    await t.test(
      'empty list has no popup or active descendant and Enter does nothing',
      async () => {
        await render([]);
        await open();
        listState(0);
        assert.match(
          document.body.textContent ?? '',
          /No note and no action matches/,
        );
        for (const keyName of [
          'ArrowDown',
          'ArrowUp',
          'Home',
          'End',
          'Enter',
        ]) {
          await key(keyName);
          listState(0);
        }
        assert.equal(document.activeElement, field());
      },
    );
    await t.test(
      'no match stays collapsed through a pending and empty read',
      async () => {
        await render();
        await open();
        await search('no-match');
        listState(0);
        assert.match(document.body.textContent ?? '', /Searching/);
        await act(async () => fixture.answer('no-match'));
        listState(0);
        assert.match(
          document.body.textContent ?? '',
          /No note and no action matches/,
        );
        await type('');
        listState(2);
      },
    );
    await t.test(
      'late results cannot become the active option of a newer query',
      async () => {
        await render([]);
        await open();
        await search('old-query');
        listState(0);
        await search('new-query');
        listState(0);
        await act(async () => fixture.answer('old-query', [hit('Old reply')]));
        listState(0);
        assert.equal(
          options().some((row) => row.textContent?.includes('Old reply')),
          false,
        );
        await act(async () => fixture.answer('new-query', [hit('New reply')]));
        listState(1);
        assert.equal(
          field().getAttribute('aria-activedescendant'),
          'palette-note-New reply',
        );
      },
    );
    await t.test(
      'choice loading, unavailable, empty and ready states describe visible rows',
      async () => {
        await render(
          [],
          pick({ status: 'loading', label: 'Loading templates' }),
        );
        await open();
        listState(1);
        await key('Enter');
        listState(0);
        assert.equal(field().placeholder, 'Find a template');
        assert.match(
          document.querySelector('[aria-live="polite"]')?.textContent ?? '',
          /Loading templates/,
        );
        await render(
          [],
          pick({
            status: 'unavailable',
            message: 'Synthetic read unavailable',
          }),
          false,
        );
        listState(0);
        assert.match(
          document.body.textContent ?? '',
          /Synthetic read unavailable/,
        );
        await render(
          [],
          pick({ status: 'ready', choices: [], notice: null }),
          false,
        );
        listState(0);
        assert.match(document.body.textContent ?? '', /No templates/);
        await render([], pick(ready), false);
        listState(2);
        await key('End');
        listState(2);
        assert.equal(
          field().getAttribute('aria-activedescendant'),
          'palette-choice-two',
        );
        await type('First');
        listState(1);
        assert.equal(
          field().getAttribute('aria-activedescendant'),
          'palette-choice-one',
        );
        await type('absent');
        listState(0);
        assert.match(document.body.textContent ?? '', /No template matches/);
        await type('');
        await key('Backspace');
        listState(1);
        assert.equal(field().placeholder, 'Search notes, or type an action');
      },
    );
    await t.test(
      'an action removed during its step returns to the root list',
      async () => {
        await render([], pick(ready));
        await open();
        await key('Enter');
        listState(2);
        await render([], () => [], false);
        listState(0);
        assert.equal(field().placeholder, 'Search notes, or type an action');
      },
    );
    await t.test(
      'Escape returns to the trigger and reopen resets query and selection',
      async () => {
        await render();
        await open();
        await type('Beta');
        await key('End');
        listState(1);
        await key('Escape');
        assert.equal(document.querySelector('[role="dialog"]'), null);
        assert.equal(document.activeElement, trigger());
        await open();
        listState(2);
        assert.equal(field().value, '');
        assert.equal(
          field().getAttribute('aria-activedescendant'),
          'palette-note-alpha',
        );
        const backward = await key('Tab', true);
        assert.equal(backward.defaultPrevented, true);
        assert.equal(document.activeElement, field());
        const forward = await key('Tab');
        assert.equal(forward.defaultPrevented, true);
        assert.equal(document.activeElement, field());
      },
    );
    await t.test(
      'an action runs once after close and keeps its own focus',
      async () => {
        let calls = 0;
        const actions = (): readonly PaletteAction[] => [
          {
            id: 'run',
            label: 'Focus target',
            icon: 'open',
            run: () => {
              calls++;
              assert.equal(document.querySelector('[role="dialog"]'), null);
              assert.equal(document.activeElement, trigger());
              container
                .querySelector<HTMLInputElement>('#destination')
                ?.focus();
            },
          },
        ];
        await render([], actions);
        await open();
        listState(1);
        await key('Enter');
        assert.equal(calls, 1);
        await until(() => document.activeElement?.id === 'destination');
        assert.equal(document.querySelector('[role="dialog"]'), null);
      },
    );
    await t.test(
      'choice pointer selection runs after close without taking input focus first',
      async () => {
        let chosen = '';
        await render(
          [],
          pick(ready, (id) => {
            assert.equal(document.querySelector('[role="dialog"]'), null);
            chosen = id;
            container.querySelector<HTMLInputElement>('#destination')?.focus();
          }),
        );
        await open();
        await key('Enter');
        const input = listState(2),
          option = options()[1];
        assert.ok(option);
        await act(async () =>
          option.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })),
        );
        listState(2);
        assert.equal(document.activeElement, input);
        await act(async () =>
          option.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
          ),
        );
        assert.equal(chosen, 'two');
        assert.equal(document.activeElement?.id, 'destination');
      },
    );
    await t.test(
      'Enter on a note navigates after the modal closes',
      async () => {
        await render();
        await open();
        listState(2);
        await key('Enter');
        assert.equal(document.querySelector('[role="dialog"]'), null);
        assert.equal(
          container.querySelector('#route')?.textContent,
          '/w/synthetic/notes/alpha',
        );
      },
    );
    await t.test(
      'a read completed after close cannot leak into a new open',
      async () => {
        await render();
        await open();
        await search('closed-query');
        listState(0);
        await key('Escape');
        await act(async () =>
          fixture.answer('closed-query', [hit('Closed reply')]),
        );
        assert.equal(document.querySelector('[role="dialog"]'), null);
        await open();
        listState(2);
        assert.equal(field().value, '');
        assert.equal(
          options().some((row) => row.textContent?.includes('Closed reply')),
          false,
        );
      },
    );
  } finally {
    await act(async () => {
      root.unmount();
      fixture.finishReads();
    });
    container.remove();
    hooks.deregister();
    for (const timer of windowTimers.values()) clearTimeout(timer);
    windowTimers.clear();
    t.mock.timers.reset();
    await browser.happyDOM.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  for (const [name, descriptor] of originals)
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, name),
      descriptor,
      name,
    );
  for (const [name, descriptor] of clockOriginals)
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, name),
      descriptor,
      name,
    );
  assert.deepEqual(unexpected, []);
});
