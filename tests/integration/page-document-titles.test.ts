import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { act, createElement, StrictMode, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
const browser = new Window({ url: 'http://localhost/' });
browser.document.write('<!doctype html><html><body></body></html>');
browser.document.write('<!doctype html><html><body></body></html>');
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'MutationObserver',
  'fetch',
  'IS_REACT_ACT_ENVIRONMENT',
  'Text',
  'Range',
  'DOMRect',
  'ResizeObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const name of globals) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  if (name !== 'fetch' && name !== 'IS_REACT_ACT_ENVIRONMENT') {
    const value: unknown = browser[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value:
        typeof value === 'function' && /^[a-z]/.test(name)
          ? value.bind(browser)
          : value,
    });
  }
}
const unexpected: string[] = [];
const rejectNetwork = async (): Promise<never> => {
  unexpected.push('Unexpected network call');
  throw Error('Auth component fixture made an unexpected network call.');
};
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: rejectNetwork,
});
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
browser.fetch = rejectNetwork;
const fixtureUrl = new URL('./support/page-title-fixture.ts', import.meta.url)
  .href;
const loaderModuleUrl = new URL(
  './support/page-title-loader.ts',
  import.meta.url,
).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('?worker'))
      return {
        url: 'data:text/javascript,export default class {}',
        shortCircuit: true,
      };
    const parent = context.parentURL ?? '';
    if (
      parent.endsWith('/notes/note-view.js') &&
      specifier.endsWith('/editor/note-loader.js')
    )
      return { url: loaderModuleUrl, shortCircuit: true };
    if (parent.includes('/apps/web/dist/')) {
      if (
        specifier === '@notesapp/api-client' ||
        /^(\.\.\/)+app\.js$/.test(specifier) ||
        specifier.endsWith('/lib/proof-of-work.js') ||
        specifier.endsWith('/shell/files.js') ||
        specifier.endsWith('/folders/folders.js') ||
        specifier.endsWith('/publishing/publish-dialog.js')
      )
        return { url: fixtureUrl, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const fixture = await import('./support/page-title-fixture.ts');
const { createRoot } = await import('react-dom/client');
const { LoginPage } =
  await import('../../apps/web/dist/features/accounts/accounts.js');
const { TrashView } =
  await import('../../apps/web/dist/features/trash/trash-page.js');
const { HistoryView } =
  await import('../../apps/web/dist/features/history/history.js');
const { NoteEditorLoader } =
  await import('../../apps/web/dist/features/editor/note-loader.js');
const { OAuthSignInPage } =
  await import('../../apps/web/dist/features/oauth/oauth-pages.js');
const { NoteView } =
  await import('../../apps/web/dist/features/notes/note-view.js');
const { useDocumentTitle } =
  await import('../../apps/web/dist/shell/document-title.js');
function Destination() {
  useDocumentTitle('Destination');
  return createElement('p', null, 'Destination');
}
await test('actual page title owners', async (t) => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async (element: ReactNode, address = '/') => {
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { key: address, initialEntries: [address] },
          element,
        ),
      );
    });
  };
  const title = (screen: string) =>
    assert.equal(document.title, screen + ' - tidy notebook');
  const loader = (
    id = 'note',
    account = 'account',
    path: string | null = null,
  ) =>
    createElement(NoteEditorLoader, {
      store: null,
      accountId: account,
      workspaceId: 'workspace',
      fileId: id,
      currentPath: path,
    });
  try {
    await t.test('F2 plain initialized Login', async () => {
      fixture.reset();
      await render(createElement(LoginPage));
      assert.match(container.textContent ?? '', /Sign in/);
      title('Sign in');
    });
    await t.test('D4 Trash replaces a committed prior title', async () => {
      await render(createElement(Destination));
      await render(createElement(TrashView));
      assert.match(container.textContent ?? '', /Trash/);
      title('Trash');
    });
    await t.test('N11 direct History', async () => {
      await render(createElement(HistoryView));
      assert.match(container.textContent ?? '', /history/i);
      title('Version history');
    });
    await t.test('N11 resolved missing note', async () => {
      await render(loader());
      assert.match(container.textContent ?? '', /Note not found/);
      title('Note not found');
    });

    await t.test(
      'plain Login pending, first setup and late completion after unmount',
      async () => {
        fixture.reset();
        fixture.setSetup({ hold: true, initialized: false });
        await render(createElement(LoginPage));
        title('Loading sign-in screen');
        await act(async () => fixture.releaseSetup());
        title('Create your account');
        await render(null);
        fixture.setSetup({ hold: true });
        await render(createElement(LoginPage));
        title('Loading sign-in screen');
        await render(createElement(Destination));
        await act(async () => fixture.releaseSetup());
        title('Destination');
      },
    );
    await t.test('Login failed setup and retry', async () => {
      fixture.reset();
      fixture.setSetupFailure(true);
      await render(createElement(LoginPage));
      title('Sign in');
      assert.match(container.textContent ?? '', /service did not answer/);
      fixture.setSetupFailure(false);
      fixture.setSetup({ hold: true });
      const retry = [...container.querySelectorAll('button')].find(
        (b) => b.textContent === 'Try again',
      );
      assert.ok(retry);
      await act(async () => retry.click());
      title('Loading sign-in screen');
      await act(async () => fixture.releaseSetup());
      title('Sign in');
    });
    await t.test('signed-in Login does not own destination title', async () => {
      fixture.setSession('signed-in');
      await render(
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/login',
            element: createElement(LoginPage),
          }),
          createElement(Route, {
            path: '/',
            element: createElement(Destination),
          }),
        ),
        '/login',
      );
      title('Destination');
      fixture.reset();
    });
    for (const query of [
      '',
      '?client_id=client&redirect_uri=https%3A%2F%2Fclient.example.invalid%2Fcallback&scope=notes%3Aread&sig=synthetic&exp=1',
    ])
      await t.test(
        'OAuth remains sole owner ' +
          (query ? 'embedded Login' : 'invalid request'),
        async () => {
          fixture.reset();
          fixture.setSetup({ hold: true });
          await render(
            createElement(OAuthSignInPage),
            '/oauth/sign-in' + query,
          );
          title('Sign in');
          await act(async () => fixture.releaseSetup());
          title('Sign in');
        },
      );
    await t.test(
      'loader loading, absent list ready fallback and presentation-only rename',
      async () => {
        const reply = fixture.hold('ready');
        await render(loader('ready'));
        title('Loading note');
        await act(async () =>
          reply.resolve(fixture.ready('Folder/Example.md')),
        );
        title('Folder/Example');
        assert.match(container.textContent ?? '', /Synthetic saved text/);
        const count = fixture.reads.length;
        await render(loader('ready', 'account', 'Folder/Renamed.md'));
        title('Folder/Renamed');
        assert.equal(fixture.reads.length, count);
      },
    );
    await t.test(
      'rapid A B C, stale ready and error replies, account and workspace identity',
      async () => {
        const a = fixture.hold('A'),
          b = fixture.hold('B'),
          c = fixture.hold('C');
        await render(loader('A'));
        title('Loading note');
        await render(loader('B'));
        title('Loading note');
        await render(loader('C', 'other-account'));
        title('Loading note');
        await act(async () => c.resolve(fixture.ready('C.md')));
        title('C');
        await act(async () => {
          b.resolve({ error: {}, response: { status: 500 } });
          a.resolve(fixture.ready('A.md'));
        });
        title('C');
        assert.match(container.textContent ?? '', /Synthetic saved text/);
        const d = fixture.hold('D');
        await render(
          createElement(NoteEditorLoader, {
            store: null,
            accountId: 'other-account',
            workspaceId: 'other-workspace',
            fileId: 'D',
          }),
        );
        title('Loading note');
        await act(async () => d.resolve(fixture.ready('D.md')));
        title('D');
        await render(createElement(Destination));
        await act(async () => a.resolve(fixture.ready('Old.md')));
        title('Destination');
      },
    );
    for (const [id, code, screen] of [
      ['unavailable', 500, "Can't open this note"],
      ['purged', 410, 'This note was deleted'],
    ] as const)
      await t.test('resolved ' + id, async () => {
        const r = fixture.hold(id);
        await render(loader(id));
        title('Loading note');
        await act(async () =>
          r.resolve({ error: {}, response: { status: code } }),
        );
        title(screen);
        assert.match(container.textContent ?? '', new RegExp(screen));
      });
    await t.test('deleted note owns its visible heading', async () => {
      fixture.setDeleted([
        { fileId: 'deleted', kind: 'note', path: 'Folder/Example.md' },
      ]);
      await render(loader('deleted'));
      title('Folder/Example is in Trash');
      assert.match(container.textContent ?? '', /Folder\/Example is in Trash/);
      fixture.setDeleted([]);
    });
    await t.test(
      'NoteView invalid address and account wait use local owner',
      async () => {
        await render(createElement(NoteView));
        title('Note not found');
        fixture.reset();
        await render(
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/w/:workspaceId/notes/:fileId',
              element: createElement(NoteView),
            }),
          ),
          '/w/workspace/notes/note',
        );
        title('Loading note');
      },
    );
    await t.test(
      'NoteView real lazy loader owns absent-list and rename titles',
      async () => {
        fixture.setSession('signed-in');
        fixture.setPath(null);
        const r = fixture.hold('note');
        const route = () =>
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/w/:workspaceId/notes/:fileId',
              element: createElement(NoteView),
            }),
          );
        await render(route(), '/w/workspace/notes/note');
        title('Loading note');
        assert.match(container.textContent ?? '', /Loading editor/);
        await act(async () => {
          fixture.loaderGate.resolve();
          await import('./support/page-title-loader.ts');
        });
        await act(async () => r.resolve(fixture.ready('Fallback.md')));
        title('Fallback');
        fixture.setPath('Renamed.md');
        await render(route(), '/w/workspace/notes/note');
        title('Renamed');
        fixture.setPath(null);
      },
    );
    for (const [name, Screen] of [
      ['Trash', TrashView],
      ['Version history', HistoryView],
    ] as const)
      await t.test(
        name +
          ' invalid, account wait, resolved read and late route completion',
        async () => {
          fixture.reset();
          await render(createElement(Screen));
          title(name);
          fixture.setSession('signed-in');
          const r = fixture.hold('history-note');
          const path =
            name === 'Trash'
              ? '/w/workspace/trash'
              : '/w/workspace/notes/history-note/history';
          const pattern =
            name === 'Trash'
              ? '/w/:workspaceId/trash'
              : '/w/:workspaceId/notes/:fileId/history';
          await render(
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: pattern,
                element: createElement(Screen),
              }),
            ),
            path,
          );
          title(name);
          await render(createElement(Destination));
          await act(async () => r.resolve(fixture.ready('Late.md')));
          title('Destination');
        },
      );

    for (const [id, code, heading] of [
      ['h-unknown', 404, 'This note has no history here'],
      ['h-purged', 410, 'This note is deleted permanently'],
      ['h-error', 500, 'The history is not available'],
      ['h-ready', 200, 'No version yet'],
    ] as const)
      await t.test('History resolved ' + id, async () => {
        fixture.reset();
        fixture.setSession('signed-in');
        const r = fixture.hold(id);
        await render(
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/w/:workspaceId/notes/:fileId/history',
              element: createElement(HistoryView),
            }),
          ),
          '/w/workspace/notes/' + id + '/history',
        );
        title('Version history');
        await act(async () =>
          r.resolve(
            code === 200
              ? fixture.ready('History.md')
              : { error: {}, response: { status: code } },
          ),
        );
        title('Version history');
        assert.ok(container.textContent?.includes(heading));
      });
    await t.test(
      'Trash empty read then destination does not retain Trash title',
      async () => {
        fixture.reset();
        fixture.setSession('signed-in');
        await render(
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/w/:workspaceId/trash',
              element: createElement(TrashView),
            }),
          ),
          '/w/workspace/trash',
        );
        title('Trash');
        assert.match(container.textContent ?? '', /trash/i);
        await render(createElement(Destination));
        title('Destination');
      },
    );
    await t.test(
      'Trash failed read, return retry, rows and cancelled late read',
      async () => {
        fixture.reset();
        fixture.setSession('signed-in');
        fixture.setTrashFailure(true);
        const route = () =>
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/w/:workspaceId/trash',
              element: createElement(TrashView),
            }),
          );
        await render(route(), '/w/workspace/trash');
        title('Trash');
        assert.match(container.textContent ?? '', /service did not answer/);
        await render(createElement(Destination));
        fixture.setTrashFailure(false);
        fixture.setDeleted([
          { fileId: 'trash-row', kind: 'note', path: 'Synthetic deleted.md' },
        ]);
        await render(route(), '/w/workspace/trash');
        title('Trash');
        assert.match(container.textContent ?? '', /Synthetic deleted/);
        await render(createElement(Destination));
        const late = fixture.holdTrash();
        await render(route(), '/w/workspace/trash');
        title('Trash');
        assert.match(container.textContent ?? '', /Loading trash/);
        await render(createElement(Destination));
        await act(async () => late.resolve());
        title('Destination');
        fixture.clearTrashHold();
        fixture.setDeleted([]);
      },
    );
    await t.test(
      'History delayed version read cannot reclaim title after route departure',
      async () => {
        fixture.reset();
        fixture.setSession('signed-in');
        fixture.showHistoryRows(true);
        const head = fixture.hold('preview-note');
        await render(
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/w/:workspaceId/notes/:fileId/history',
              element: createElement(HistoryView),
            }),
          ),
          '/w/workspace/notes/preview-note/history',
        );
        await act(async () => head.resolve(fixture.ready('History.md')));
        title('Version history');
        const row =
          container.querySelector('main button[aria-expanded]') ??
          container.querySelector('button[aria-expanded]');
        assert.ok(row instanceof HTMLElement);
        await act(async () => row.click());
        title('Version history');
        assert.match(container.textContent ?? '', /Loading version/);
        await render(createElement(Destination));
        await act(async () =>
          fixture.versionRead.resolve({
            data: { text: 'Synthetic saved version' },
          }),
        );
        title('Destination');
        fixture.showHistoryRows(false);
      },
    );
    await t.test(
      'Strict Mode remount never restores an older title',
      async () => {
        fixture.reset();
        await render(createElement(StrictMode, null, createElement(LoginPage)));
        title('Sign in');
        await render(createElement(StrictMode, null, createElement(TrashView)));
        title('Trash');
        await render(createElement(Destination));
        title('Destination');
      },
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    hooks.deregister();
    await browser.happyDOM.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
    originals.get('IS_REACT_ACT_ENVIRONMENT'),
  );
  assert.deepEqual(unexpected, []);
  assert.deepEqual(fixture.writes, []);
});
