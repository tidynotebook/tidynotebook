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
import { setLastAdministrator } from './support/administration-settings-fixture.ts';
import {
  calls,
  setAdministrator,
  setWaiting,
  setSessions,
  sessionWrites,
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
const adminFixture = new URL(
  './support/administration-settings-fixture.ts',
  import.meta.url,
).href;
const folderFixture = new URL(
  './support/folder-picker-fixture.ts',
  import.meta.url,
).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ?? '';
    if (parent.includes('/apps/web/dist/')) {
      if (
        (parent.endsWith('/administration.js') ||
          parent.endsWith('/installation-settings.js')) &&
        specifier === '@notesapp/api-client'
      )
        return { url: adminFixture, shortCircuit: true };
      if (
        (parent.endsWith('/api-keys.js') ||
          parent.endsWith('/account-settings.js')) &&
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
const { AdministrationRedirect } =
  await import('../../apps/web/dist/features/accounts/administration-redirect.js');
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
      path: '/w/:workspaceId/accounts',
      element: createElement(AdministrationRedirect),
    }),
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

await test('a Settings deep link focuses its section title, not the first navigation row', async () => {
  await show('/w/one/notes/n1?settings=daily-notes');
  const title = dialog()?.querySelector('h2[tabindex="-1"]');
  assert.ok(title);
  assert.equal(title.textContent, 'Daily notes');
  assert.equal(document.activeElement, title);
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
  assert.deepEqual(groups, ['Security', 'Preferences', 'Workspace Personal']);
  const rows = [...nav.querySelectorAll('[data-settings-page]')].map(
    (row) => row.textContent,
  );
  assert.deepEqual(rows, [
    'Devices',
    'API keys',
    'Appearance and editor',
    'Offline',
    'Daily notes',
    'Templates',
    'Export and import',
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
  assert.equal(
    modal
      .querySelector('[aria-label^="Profile,"]')
      ?.getAttribute('aria-current'),
    'page',
  );
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
  const list = nav?.closest('.ui-settings-navigation');
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

await test('Devices puts the current session first and the group action before a long list', async () => {
  const others = Array.from({ length: 12 }, (_, index) => ({
    sessionId: `session-${String(index)}`,
    current: false,
    userAgent: 'Chrome/100 Linux',
    createdAt: '2026-10-28T00:00:00.000Z',
    lastActiveAt: '2026-10-28T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  }));
  setSessions([
    ...others,
    {
      ...others[0],
      sessionId: 'current',
      current: true,
      userAgent: 'Firefox/100 Linux',
      createdAt: '2026-10-28T00:00:00.000Z',
      lastActiveAt: '2026-10-28T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
  ]);
  await show('/w/one/notes/n1?settings=devices');
  const modal = dialog();
  assert.ok(modal);
  const current = modal.querySelector('[aria-label="This device"]');
  assert.ok(current);
  assert.match(current.textContent ?? '', /Firefox on Linux/);
  assert.match(
    current.textContent ?? '',
    /To sign out of this device, use the account menu./,
  );
  assert.equal(current.querySelector('button'), null);
  const bulk = button('Sign out every other device');
  assert.equal(
    bulk.parentElement?.querySelector('h3')?.textContent,
    'Other devices',
  );
  const rows = [...modal.querySelectorAll('li')].filter((row) =>
    row.querySelector('button[aria-label="Sign out Chrome on Linux"]'),
  );
  assert.equal(rows.length, 12);
  const first = rows[0];
  assert.ok(first);
  assert.ok(
    (bulk.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) !==
      0,
  );
  await click(bulk);
  assert.deepEqual(sessionWrites, ['others']);
  assert.match(modal.textContent ?? '', /No other devices./);
  assert.ok(modal.querySelector('[aria-label="This device"]'));
  setSessions();
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
  const secret = container.querySelector<HTMLInputElement>('#api-key-secret');
  assert.ok(secret);
  assert.equal(
    modal.querySelector('h2[tabindex="-1"]')?.textContent,
    'API keys',
  );
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
  try {
    await click(button('Copy key'));
    assert.match(
      container.textContent ?? '',
      /The key could not be copied. Select it and copy it./,
    );
    assert.equal(document.activeElement, secret);
    assert.equal(secret.selectionStart, 0);
    assert.equal(secret.selectionEnd, secret.value.length);
  } finally {
    if (clipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard');
    else Object.defineProperty(navigator, 'clipboard', clipboard);
  }
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
  await click(button('Templates folder'));
  assert.equal(dialog(), modal);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.ok(container.querySelector('[role="tree"]'));
  assert.equal(container.querySelector('#template-folder'), null);
  assert.equal(
    modal?.querySelector('section[aria-labelledby] h2')?.textContent,
    'Save in',
  );
  assert.ok(
    button('Back to section')
      .closest('.ui-settings-heading')
      ?.querySelector('h2'),
  );
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
  const format = button('Name format');
  assert.ok(format);
  await click(format);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
  assert.ok(container.querySelector('#daily-format'));
  await escape();
  assert.equal(container.querySelector('#daily-format'), null);
  assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
});

await test('phone Settings uses navigation and action rows with one edit level', async () => {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const result = original(query);
    Object.defineProperty(result, 'matches', {
      value:
        query.includes('pointer: coarse') ||
        query.includes('max-width: 1023px'),
    });
    return result;
  };
  try {
    await show('/w/one/notes/n1?settings=account');
    assert.ok(container.querySelector('#profile-heading'));
    assert.equal(
      [...container.querySelectorAll('button')].some(
        (b) => b.getAttribute('aria-label') === 'Edit name',
      ),
      false,
    );
    const name = button('Name');
    await click(name);
    assert.ok(container.querySelector('#profile-name'));
    assert.equal(button('Save').hasAttribute('disabled'), true);
    const editScope = container.querySelector('.ui-settings-scope');
    assert.ok(editScope === null || editScope.textContent !== 'Account');
    assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
    await escape();
    assert.equal(container.querySelector('#profile-name'), null);
    await settle();
    assert.equal(document.activeElement?.getAttribute('aria-label'), 'Name');
    const remove = button('Delete account…');
    assert.ok(remove);
    await click(remove);
    assert.ok(container.querySelector('#remove-own-password'));
    await escape();
    assert.equal(container.querySelector('#remove-own-password'), null);
  } finally {
    window.matchMedia = original;
    await show('/w/one/notes/n1?settings=account');
  }
});

await test('administration deep links and the old route respect the signed-in role', async () => {
  await show('/w/one/accounts');
  assert.equal(address, '/w/one?settings=');
  assert.equal(
    container.querySelector('[data-settings-page="accounts"]'),
    null,
  );
  setAdministrator(true);
  try {
    await show('/w/one/accounts');
    assert.equal(address, '/w/one?settings=accounts');
    assert.deepEqual(
      [...container.querySelectorAll('nav [data-settings-page]')]
        .slice(-4)
        .map((e) => e.getAttribute('data-settings-page')),
      ['accounts', 'mail', 'legal', 'reports'],
    );
    assert.doesNotMatch(container.textContent ?? '', /Manage accounts/);
    assert.ok(button('Invite a person'));
    for (const line of container.querySelectorAll('.ui-meta-facts')) {
      const facts = [...line.querySelectorAll('span')];
      assert.ok(
        facts.every((fact) => !fact.textContent?.trim().startsWith('·')),
      );
      assert.ok(
        facts
          .slice(0, -1)
          .every((fact) => fact.textContent?.trim().endsWith('·')),
      );
    }
    assert.match(container.textContent ?? '', /Let anybody sign up/);
  } finally {
    setAdministrator(false);
  }
});

await test('Mail is a section form whose Save stays disabled until a value changes', async () => {
  setAdministrator(true);
  try {
    await show('/w/one?settings=mail');
    assert.ok(container.querySelector('#mail-host'));
    assert.equal(
      [...container.querySelectorAll('button')].some(
        (item) => item.textContent === 'Mail server',
      ),
      false,
    );
    const save = button('Save');
    assert.equal(save.hasAttribute('disabled'), true);
    await act(async () => {
      const field = container.querySelector<HTMLInputElement>('#mail-host');
      assert.ok(field);
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set?.call(field, 'smtp.changed.example');
      field.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.equal(button('Save').hasAttribute('disabled'), false);
    await click(button('Save'));
    const sender = container.querySelector<HTMLInputElement>('#mail-sender');
    assert.ok(sender?.required);
    assert.equal(sender.getAttribute('aria-invalid'), 'true');
    assert.match(container.textContent ?? '', /Enter the sender address\./);
    await click(button('Cancel'));
    assert.equal(button('Save').hasAttribute('disabled'), true);
  } finally {
    setAdministrator(false);
  }
});

await test('phone Mail has one pinned Save and the Close control is in its trailing header slot', async () => {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const result = original(query);
    Object.defineProperty(result, 'matches', {
      value:
        query.includes('pointer: coarse') ||
        query.includes('max-width: 1023px'),
    });
    return result;
  };
  setAdministrator(true);
  try {
    for (const page of ['mail', 'offline', 'daily-notes', 'account']) {
      await show(`/w/one?settings=${page}`);
      const column = container.querySelector('.ui-settings-column');
      assert.ok(column);
      const close = button('Close Settings', column);
      assert.equal(
        close.closest('[data-header-slot]')?.getAttribute('data-header-slot'),
        'trailing',
      );
      const back = button('Back to Settings', column);
      assert.equal(
        back.closest('[data-header-slot]')?.getAttribute('data-header-slot'),
        'leading',
      );
      if (page === 'mail') {
        const footer = column.querySelector('.ui-dialog-footer');
        assert.ok(footer);
        assert.deepEqual(
          [...footer.querySelectorAll('button')].map((item) =>
            item.textContent?.trim(),
          ),
          ['Save'],
        );
        assert.equal(footer.querySelector('button')?.type, 'submit');
      }
    }
  } finally {
    window.matchMedia = original;
    setAdministrator(false);
  }
});

await test('phone admin draft forms keep one frame and return focus without a save', async () => {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const result = original(query);
    Object.defineProperty(result, 'matches', {
      value:
        query.includes('pointer: coarse') ||
        query.includes('max-width: 1023px'),
    });
    return result;
  };
  setAdministrator(true);
  try {
    for (const [page, opener, field] of [
      ['legal', 'Terms', '#legal-kind'],
      ['accounts', '+ Invite a person', '#invite-email'],
    ] as const) {
      await show(`/w/one?settings=${page}`);
      const start = button(opener);
      start.focus();
      await click(start);
      assert.ok(container.querySelector(field), field);
      assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
      assert.equal(document.activeElement?.tagName, 'H2');
      assert.equal(document.activeElement?.getAttribute('tabindex'), '-1');
      await escape();
      assert.equal(container.querySelector(field), null);
      assert.equal(
        document.activeElement === start,
        true,
        'Focus returns to the opener',
      );
    }
    await show('/w/one?settings=accounts');
    assert.ok(
      [...container.querySelectorAll('h3')].some(
        (heading) => heading.textContent?.trim() === 'Users',
      ),
    );
    const row = button('Account: Sam Lee');
    row.focus();
    await click(row);
    assert.match(
      container.querySelector('.ui-settings-action')?.textContent ?? '',
      /sam@example.com/,
    );
    assert.equal(button('Role').querySelector('[data-setting-help]'), null);
    for (const [opener, field] of [
      ['Role', '#account-role'],
      ['Limits and access', '#controls-standing'],
    ] as const) {
      await click(button(opener));
      assert.ok(container.querySelector(field));
      assert.equal(document.activeElement?.tagName, 'H2');
      assert.equal(document.activeElement?.getAttribute('tabindex'), '-1');
      if (opener === 'Limits and access') {
        const switches = container.querySelectorAll(
          '.ui-settings-action [role="switch"]',
        );
        assert.equal(switches.length, 2);
        assert.equal(switches[0]?.getAttribute('aria-label'), 'Teams');
        assert.equal(
          container.querySelectorAll('.ui-settings-action input[type=checkbox]')
            .length,
          0,
        );
      }
      await escape();
      assert.equal(container.querySelector(field), null);
      assert.ok(button(opener));
    }
    await escape();
    setLastAdministrator(true);
    await show('/w/one?settings=accounts');
    await click(button('Account: Sam Lee'));
    assert.doesNotMatch(
      container.querySelector('.ui-settings-action')?.textContent ?? '',
      /Danger zone/,
    );
    await escape();
    assert.equal(container.querySelector('.ui-settings-action'), null);
    assert.equal(
      document.activeElement?.getAttribute('aria-label') === 'Account: Sam Lee',
      true,
      'Focus returns to the account row',
    );
  } finally {
    setLastAdministrator(false);
    setAdministrator(false);
    window.matchMedia = original;
  }
});

await release();
