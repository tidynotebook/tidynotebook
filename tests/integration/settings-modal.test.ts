/**
 * Settings as a modal over the current page (issue 517, items 5 to 10).
 *
 * The built host, the modal body, the old routes and the Sign out check run
 * in a DOM with a memory router. Only the hooks of the application context
 * are replaced, so no server or database is needed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import {
  act,
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import {
  calls,
  setWaiting,
  resetApiKeys,
  refuseApiKeyCreation,
} from './support/settings-modal-fixture.ts';

const browser = new Window({ url: 'http://localhost/' });
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'sessionStorage',
  'localStorage',
] as const;
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
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
const fixture = new URL('./support/settings-modal-fixture.ts', import.meta.url)
  .href;
const folderFixture = new URL(
  './support/folder-picker-fixture.ts',
  import.meta.url,
).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ?? '';
    if (parent.includes('/apps/web/dist/')) {
      if (
        parent.endsWith('/api-keys.js') &&
        specifier === '@notesapp/api-client'
      )
        return { url: fixture, shortCircuit: true };
      if (/^(\.\.\/)+app\.js$/.test(specifier))
        return { url: fixture, shortCircuit: true };
      if (
        (parent.endsWith('/template-settings.js') ||
          parent.endsWith('/daily-note-settings.js')) &&
        (specifier === '../../shell/files.js' ||
          specifier === './templates.js' ||
          specifier === './daily-notes.js')
      )
        return { url: folderFixture, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { createRoot } = await import('react-dom/client');
const { SettingsModalHost, useOpenSettings } =
  await import('../../apps/web/dist/shell/settings-modal.js');
const { LegacySettingsRedirect } =
  await import('../../apps/web/dist/shell/legacy-settings.js');
const { useSignOut } = await import('../../apps/web/dist/shell/sign-out.js');

const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);
/** Releases the DOM and the module hooks after the last test. */
async function release(): Promise<void> {
  await act(async () => root.unmount());
  hooks.deregister();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  await browser.happyDOM.close();
}

/** The address that the router shows now. */
let address = '';
/** How often the page under the modal mounted. */
let mounts = 0;

/** Writes the current address where the test reads it. */
function LocationProbe(): ReactNode {
  const location = useLocation();
  address = `${location.pathname}${location.search}`;
  return null;
}

/** A page with an open note: a field with unsaved text and the opener. */
function NotePage(): ReactNode {
  const openSettings = useOpenSettings();
  const [text, setText] = useState('Unsaved draft');
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    mounts += 1;
  }, []);
  return createElement(
    'main',
    null,
    createElement('textarea', {
      id: 'note-text',
      value: text,
      onChange: (event: { target: { value: string } }) =>
        setText(event.target.value),
    }),
    createElement(
      'button',
      { type: 'button', id: 'open-settings', onClick: () => openSettings() },
      'Settings',
    ),
    createElement(
      'button',
      {
        type: 'button',
        id: 'open-templates',
        onClick: () => openSettings('templates'),
      },
      'Manage templates',
    ),
  );
}

/** Goes to one address from inside the router. */
let go: (to: string) => void = () => {};
function Navigator(): ReactNode {
  const navigate = useNavigate();
  go = (to) => {
    void navigate(to);
  };
  return null;
}

/** The frame: the routes of a workspace, the host, and the old route. */
function Frame(): ReactNode {
  return createElement(
    Routes,
    null,
    createElement(Route, {
      path: '/w/:workspaceId/settings/:settingsPage?',
      element: createElement(LegacySettingsRedirect),
    }),
    createElement(Route, {
      path: '/w/:workspaceId/*',
      element: createElement(
        'div',
        null,
        createElement(NotePage),
        createElement(SettingsModalHost, { workspaceId: 'one' }),
      ),
    }),
  );
}

let renders = 0;
/** Mounts the frame at one address, with nothing left from a previous test. */
async function show(entry: string): Promise<void> {
  renders += 1;
  mounts = 0;
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        { key: String(renders), initialEntries: [entry] },
        createElement(LocationProbe),
        createElement(Navigator),
        createElement(Frame),
      ),
    ),
  );
  await settle();
}

/** Lets the lazy modal body and the effects finish. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
}

function dialog(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="dialog"]');
}

function button(label: string, scope: ParentNode = container): HTMLElement {
  const found = [...scope.querySelectorAll<HTMLElement>('button')].find(
    (candidate) =>
      candidate.getAttribute('aria-label') === label ||
      candidate.textContent?.trim() === label,
  );
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

function sectionButton(page: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-settings-page="${page}"]`,
  );
  assert.ok(found, `Missing section: ${page}`);
  return found;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settle();
}

async function escape(): Promise<void> {
  const target = document.activeElement ?? document.body;
  await act(async () =>
    target.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  await settle();
}

await test('Settings opens over the note, and Escape closes it with the note and focus kept', async () => {
  await show('/w/one/notes/n1');
  const field = container.querySelector<HTMLTextAreaElement>('#note-text');
  assert.ok(field);
  const opener = container.querySelector<HTMLElement>('#open-settings');
  assert.ok(opener);
  opener.focus();
  await click(opener);
  assert.equal(address, '/w/one/notes/n1?settings=');
  const modal = dialog();
  assert.ok(modal, 'The modal opens');
  assert.equal(modal.getAttribute('aria-modal'), 'true');
  // The note under the modal stays mounted with its unsaved text.
  assert.ok(container.querySelector('#note-text'));
  assert.equal(field.value, 'Unsaved draft');
  // Choosing a section replaces the entry, so Back still closes Settings.
  await click(sectionButton('devices'));
  assert.equal(address, '/w/one/notes/n1?settings=devices');
  await escape();
  assert.equal(dialog(), null);
  assert.equal(address, '/w/one/notes/n1');
  assert.equal(mounts, 1, 'The note never mounted again');
  assert.equal(container.querySelector('#note-text'), field);
  assert.equal(field.value, 'Unsaved draft');
  assert.equal(document.activeElement, opener);
});

await test('Close and the scrim remove the parameter of a deep link', async () => {
  await show('/w/one/notes/n1?settings=account');
  assert.ok(dialog(), address);
  await click(button('Close Settings', dialog() ?? container));
  assert.equal(dialog(), null);
  assert.equal(address, '/w/one/notes/n1');
  await show('/w/one?settings=offline');
  const scrim = container.querySelector<HTMLElement>(
    '[data-notes-dialog-root]',
  );
  assert.ok(scrim);
  await act(async () =>
    scrim.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })),
  );
  await settle();
  assert.equal(dialog(), null);
  assert.equal(address, '/w/one');
});

await test('the sidebar has the three groups, the workspace name and no Sign out', async () => {
  await show('/w/one/notes/n1?settings=account');
  const modal = dialog();
  assert.ok(modal);
  const nav = modal.querySelector('nav[aria-label="Settings sections"]');
  assert.ok(nav);
  const groups = [...nav.querySelectorAll('section')].map((group) =>
    group.getAttribute('aria-label'),
  );
  assert.deepEqual(groups, ['General', 'Workspace Personal', 'Account']);
  const rows = [...nav.querySelectorAll('[data-settings-page]')].map(
    (row) => row.textContent,
  );
  assert.deepEqual(rows, [
    'Appearance and editor',
    'Offline',
    'Daily notes',
    'Templates',
    'Export and import',
    'Account',
    'Devices',
    'API keys',
  ]);
  assert.doesNotMatch(nav.textContent ?? '', /Sign out|Spelling/);
  // The account card names who is signed in.
  assert.match(modal.textContent ?? '', /Mira Patel/);
  assert.match(modal.textContent ?? '', /mira@example\.com/);
  // Account: profile rows, usage, and Delete account in the Danger zone.
  const danger = modal.querySelector('#remove-account-heading');
  assert.equal(danger?.textContent, 'Danger zone');
  assert.ok(
    danger?.closest('section')?.textContent?.includes('Delete account'),
  );
  assert.match(modal.textContent ?? '', /12 MB of 5 GB used/);
  assert.equal(sectionButton('account').getAttribute('aria-current'), 'page');
});

await test('Delete account stays in Settings and Escape returns to Account', async () => {
  await show('/w/one/notes/n1?settings=account');
  const modal = dialog();
  assert.ok(modal);
  const danger = modal
    .querySelector('#remove-account-heading')
    ?.closest('section');
  assert.ok(danger);
  await click(button('Delete account', danger));
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.ok(container.querySelector('#remove-own-password'));
  await escape();
  assert.equal(container.querySelector('#remove-own-password'), null);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(address, '/w/one/notes/n1?settings=account');
});

await test('old page values and unknown values open their section', async () => {
  await show('/w/one/notes/n1?settings=profile');
  assert.equal(address, '/w/one/notes/n1?settings=account');
  await show('/w/one/notes/n1?settings=spelling');
  assert.equal(address, '/w/one/notes/n1?settings=appearance');
  await show('/w/one/notes/n1?settings=unknown');
  assert.equal(address, '/w/one/notes/n1?settings=appearance');
  // Billing needs an account portal, so it opens the first section.
  await show('/w/one/notes/n1?settings=billing');
  assert.equal(address, '/w/one/notes/n1?settings=appearance');
});

await test('old Settings routes open the modal over the last page of the tab', async () => {
  sessionStorage.clear();
  await show('/w/one/settings/templates');
  assert.equal(address, '/w/one?settings=templates');
  assert.ok(dialog());
  await show('/w/one/notes/n7');
  go('/w/one/settings#templates-heading');
  await settle();
  assert.equal(address, '/w/one/notes/n7?settings=templates');
  assert.ok(dialog());
  go('/w/one/settings/sign-out');
  await settle();
  assert.equal(address, '/w/one/notes/n7?settings=devices');
  assert.match(
    dialog()?.textContent ?? '',
    /To sign out of this device, use the account menu\./,
  );
  go('/w/one/settings');
  await settle();
  assert.equal(address, '/w/one/notes/n7?settings=');
});

await test('on a phone the sheet shows the list, then the section with Back', async () => {
  await show('/w/one/notes/n1');
  await click(button('Settings'));
  const modal = dialog();
  assert.ok(modal);
  const nav = modal.querySelector('nav');
  const list = nav?.parentElement?.parentElement;
  const detail = modal.querySelector('section[aria-labelledby]');
  assert.ok(list && detail);
  // The list level: the list shows and the section waits.
  assert.ok(list.className.split(' ').includes('flex'));
  assert.ok(detail.className.split(' ').includes('hidden'));
  const row = sectionButton('templates');
  await click(row);
  assert.equal(address, '/w/one/notes/n1?settings=templates');
  assert.ok(list.className.split(' ').includes('hidden'));
  assert.ok(detail.className.split(' ').includes('flex'));
  assert.match(
    detail.textContent ?? '',
    /Personal workspace, on every device\./,
  );
  await click(button('Back to Settings', detail));
  assert.equal(address, '/w/one/notes/n1?settings=');
  assert.equal(document.activeElement, sectionButton('templates'));
  // Close from the list returns to the note.
  await click(button('Close Settings', list));
  assert.equal(dialog(), null);
  assert.equal(address, '/w/one/notes/n1');
});

await test('Appearance and editor: preview cards apply at once, and spelling is under Editor', async () => {
  calls.choices.length = 0;
  calls.families.length = 0;
  await show('/w/one/notes/n1?settings=appearance');
  const modal = dialog();
  assert.ok(modal);
  const modes = [
    ...modal.querySelectorAll<HTMLInputElement>('input[name="theme-choice"]'),
  ];
  assert.deepEqual(
    modes.map((mode) => mode.value),
    ['system', 'light', 'dark'],
  );
  assert.equal(modes[0]?.checked, true);
  await act(async () => modes[2]?.click());
  assert.deepEqual(calls.choices, ['dark']);
  const families = [
    ...modal.querySelectorAll<HTMLInputElement>('input[name="theme-family"]'),
  ];
  assert.ok(families.length >= 11);
  // Each card holds a preview painted from the tokens of the theme.
  const card = families[0]?.closest('label');
  assert.ok(card?.querySelector('[aria-hidden="true"][style]'));
  const dracula = families.find((family) => family.value === 'dracula');
  assert.match(dracula?.closest('label')?.textContent ?? '', /dark only/);
  await act(async () => dracula?.click());
  assert.deepEqual(calls.families, ['dracula']);
  assert.ok(button('Import theme file', modal));
  const editor = [...modal.querySelectorAll('h3')].find(
    (heading) => heading.textContent === 'Editor',
  );
  assert.ok(editor);
  const spelling = editor.closest('section')?.querySelector('[role="switch"]');
  assert.equal(spelling?.getAttribute('aria-label'), 'Check spelling');
  assert.equal(spelling?.getAttribute('aria-checked'), 'true');
});

await test('Manage templates opens Settings at Templates over the same page', async () => {
  await show('/w/one/notes/n1');
  await click(button('Manage templates'));
  assert.equal(address, '/w/one/notes/n1?settings=templates');
  const modal = dialog();
  assert.ok(modal);
  assert.equal(
    modal.querySelector('section[aria-labelledby] h2')?.textContent,
    'Templates',
  );
  assert.equal(mounts, 1);
});

/** A frame with the Sign out of the account menu. */
function SignOutFrame(): ReactNode {
  const signOut = useSignOut('one');
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', id: 'sign-out', onClick: signOut.start },
      'Sign out',
    ),
    signOut.dialog,
  );
}

async function showSignOut(): Promise<void> {
  renders += 1;
  await act(async () =>
    root.render(createElement(SignOutFrame, { key: String(renders) })),
  );
}

await test('Sign out in the account menu keeps the waiting saves check', async () => {
  calls.signOut = 0;
  setWaiting([]);
  await showSignOut();
  await click(button('Sign out'));
  assert.equal(calls.signOut, 1, 'No waiting saves: sign out at once');
  assert.equal(dialog(), null);

  setWaiting([{ id: 'save-1' }]);
  await click(button('Sign out'));
  assert.equal(calls.signOut, 1);
  const modal = dialog();
  assert.ok(modal);
  assert.match(modal.textContent ?? '', /Sign out\?/);
  assert.match(
    modal.textContent ?? '',
    /Some saves have not reached the server yet\. Keep them on this device for the next sign-in, or remove them now\./,
  );
  assert.ok(button('Remove and sign out', modal));
  await click(button('Sign out and keep them', modal));
  assert.equal(calls.signOut, 2);
  assert.equal(dialog(), null);

  setWaiting(new Error('The store did not answer.'));
  await click(button('Sign out'));
  const unknown = dialog();
  assert.ok(unknown);
  assert.match(unknown.textContent ?? '', /cannot say what is still waiting/);
  assert.throws(() => button('Remove and sign out', unknown));
  await click(button('Cancel', unknown));
  assert.equal(dialog(), null);
  assert.equal(calls.signOut, 2);
});

await test('API key create, validation, secret and revoke use one Settings frame', async () => {
  resetApiKeys();
  await show('/w/one/notes/n1?settings=api-keys-apps');
  const modal = dialog();
  assert.ok(modal);
  const create = button('Create API key');
  await click(create);
  assert.equal(dialog(), modal);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(create.closest('[hidden]') !== null, true);
  const name = container.querySelector<HTMLInputElement>('#api-key-name');
  assert.ok(name);
  assert.equal(document.activeElement, name);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set?.call(name, 'Review client');
    name.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  refuseApiKeyCreation(true);
  await click(button('Create key'));
  assert.equal(name.value, 'Review client');
  assert.equal(dialog(), modal);
  assert.ok(container.querySelector('#api-key-name[aria-invalid="true"]'));
  refuseApiKeyCreation(false);
  await click(button('Create key'));
  assert.ok(container.querySelector('#api-key-secret'));
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  await click(button('Done'));
  assert.equal(container.querySelector('#api-key-secret'), null);
  assert.equal(document.activeElement, create);
  await click(button('Revoke Review client'));
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  await click(button('Revoke key'));
  assert.equal(container.querySelector('#api-key-secret'), null);
  assert.equal(
    container.querySelector('[aria-label="Revoke Review client"]'),
    null,
  );
  assert.equal(dialog(), modal);
  assert.equal(document.activeElement, create);
});

await test('Settings folder choices and name format do not open another modal', async () => {
  await show('/w/one/notes/n1?settings=templates');
  const modal = dialog();
  await click(button('Change'));
  assert.equal(dialog(), modal);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.ok(container.querySelector('[role="tree"]'));
  assert.equal(container.querySelector('#template-folder'), null);
  assert.equal(
    modal?.querySelector('section[aria-labelledby] h2')?.textContent,
    'Save in',
  );
  assert.ok(button('Back to section').parentElement?.querySelector('h2'));
  const back = button('Back to section');
  back.focus();
  await escape();
  assert.equal(container.querySelector('[role="tree"]'), null);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(
    modal?.querySelector('section[aria-labelledby] h2')?.textContent,
    'Templates',
  );
  await act(async () => go('/w/one/notes/n1?settings=daily-notes'));
  await settle();
  const format = button('Change name format');
  assert.ok(format);
  await click(format);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.ok(container.querySelector('#daily-format'));
  await escape();
  assert.equal(container.querySelector('#daily-format'), null);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
});

await release();
