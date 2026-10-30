/** Header glyph slots keep their edge while the hit area grows around them. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  avatarClassName,
  buttonClassName,
  defaultIconSize,
  IconButton,
  MenuIcon,
  Menu,
  pageGutter,
} from '@notesapp/ui';
import { loadCompiler, webRequire } from './support/tailwind.ts';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const stylesheet = resolve(root, 'apps/web/src/tailwind.css');
const shell = resolve(root, 'apps/web/src/shell/shell.tsx');

/** The box of every icon-only control of the frame header. */
const headerControl = buttonClassName({
  variant: 'ghost',
  iconOnly: true,
  iconSize: 'header',
});

const dom = new Window();
const controls = dom.document.createElement('div');
controls.innerHTML =
  renderToStaticMarkup(
    createElement(IconButton, {
      size: 'header',
      label: 'Open navigation',
      glyph: createElement(MenuIcon),
    }),
  ) +
  renderToStaticMarkup(
    createElement(Menu, {
      label: 'Account',
      trigger: 'avatar',
      compact: true,
      icon: createElement('span', { className: avatarClassName() }, 'U'),
      items: [],
    }),
  );
const toggle = controls.querySelector('[aria-label="Open navigation"]');
const account = controls.querySelector('[aria-label="Account"]');
assert.ok(toggle && account);
const toggleSlot = toggle.parentElement,
  accountSlot = account.parentElement;
assert.ok(toggleSlot && accountSlot);
/** Every class name that this test needs a rule for. */
const candidates = [
  ...pageGutter.split(' '),
  ...headerControl.split(' '),
  ...avatarClassName().split(' '),
  ...toggle.className.split(' '),
  ...account.className.split(' '),
  ...toggleSlot.className.split(' '),
  ...accountSlot.className.split(' '),
];

/** Compiles the application stylesheet with the given candidates. */
async function buildCss(): Promise<string> {
  const compile = loadCompiler();
  const source = await readFile(stylesheet, 'utf8');
  const compiler = await compile(source, {
    base: dirname(stylesheet),
    loadStylesheet: async (
      id: string,
      base: string,
    ): Promise<{ path: string; base: string; content: string }> => {
      const path = id.startsWith('.')
        ? resolve(base, id)
        : webRequire.resolve(`${id}/index.css`);
      return {
        path,
        base: dirname(path),
        content: await readFile(path, 'utf8'),
      };
    },
  });
  return compiler.build([...candidates]);
}

const css = await buildCss();
const shellSource = await readFile(shell, 'utf8');

await test('the header reads the page gutter and uses the shared header icon slot', () => {
  assert.match(shellSource, /as="header"/);
  assert.ok(shellSource.includes('${pageGutter}'));
  assert.match(shellSource, /<IconButton\s+size="header"/);
  assert.match(css, /--spacing:\s*0.25rem/);
});
await test('the icon slot stays on the content edge for both pointer sizes', () => {
  assert.ok(toggleSlot.classList.contains('w-4'));
  assert.ok(toggleSlot.classList.contains('h-4'));
  assert.equal(defaultIconSize, 16);
  for (const token of [
    'absolute',
    'left-1/2',
    'top-1/2',
    '-translate-x-1/2',
    '-translate-y-1/2',
  ])
    assert.ok(toggle.classList.contains(token), token);
  assert.ok(css.includes('width: calc(var(--spacing) * 4)'));
  for (const name of ['w-7', 'h-7', 'coarse:w-11', 'coarse:h-11'])
    assert.ok(toggle.classList.contains(name), name);
  assert.ok(css.includes('width: calc(var(--spacing) * 7)'));
  assert.ok(css.includes('width: calc(var(--spacing) * 11)'));
});
await test('the avatar slot keeps the outer edge of its visible mark on the gutter', () => {
  assert.ok(accountSlot.classList.contains('w-6'));
  assert.ok(accountSlot.classList.contains('h-6'));
  for (const token of ['absolute', 'left-1/2', '-translate-x-1/2'])
    assert.ok(account.classList.contains(token), token);
  assert.ok(css.includes('calc(var(--spacing) * 6)'));
});
await dom.happyDOM.close();
