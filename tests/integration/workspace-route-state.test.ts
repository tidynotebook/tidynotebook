/** Actual workspace loader and route guard, with controlled list responses. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement, StrictMode, useEffect, useState } from 'react';
import type { Root } from 'react-dom/client';
import type { Workspace } from '@notesapp/api-client';
import type { SessionStatus, WorkspaceValue } from '../../apps/web/dist/app.js';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  createMemoryRouter,
  RouterProvider,
  useParams,
} from 'react-router';
import { requests } from './support/workspace-route-fixture.ts';

const browser = new Window({ url: 'http://localhost/' });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'MutationObserver',
] as const) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: browser[name],
  });
}
originals.set(
  'IS_REACT_ACT_ENVIRONMENT',
  Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
);
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
originals.set('fetch', Object.getOwnPropertyDescriptor(globalThis, 'fetch'));
const originalBrowserFetch = Object.getOwnPropertyDescriptor(browser, 'fetch');
let unexpectedNetwork = 0;
/** All service reads in this fixture go through its controlled list replies. */
async function refuseNetwork(): Promise<never> {
  unexpectedNetwork += 1;
  throw Error('Unexpected workspace fixture network request');
}
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: refuseNetwork,
});
Object.defineProperty(browser, 'fetch', {
  configurable: true,
  value: refuseNetwork,
});
const fixture = new URL('./support/workspace-route-fixture.ts', import.meta.url)
  .href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      context.parentURL?.endsWith('/apps/web/dist/app.js') &&
      specifier === '@notesapp/api-client'
    )
      return { url: fixture, shortCircuit: true };
    if (specifier === './support/workspace-route-app.js')
      return {
        url: new URL('../../apps/web/dist/app.js', import.meta.url).href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
  load(url, context, next) {
    const result = next(url, context);
    if (url.endsWith('/apps/web/dist/app.js')) {
      return {
        ...result,
        source:
          readFileSync(new URL(url), 'utf8') +
          '\nexport { useWorkspaceLoader, WorkspaceContext, SessionScope };',
      };
    }
    return result;
  },
});
const { createRoot } = await import('react-dom/client');
const { useWorkspaceLoader, WorkspaceContext, SessionScope } =
  await import('./support/workspace-route-app.js');
const { useDocumentTitle } =
  await import('../../apps/web/dist/shell/document-title.js');
const { RequireCurrentWorkspace, WorkspaceHome } =
  await import('../../apps/web/dist/shell/workspaces.js');
const personal: Workspace = {
  workspaceId: 'personal',
  name: 'Personal',
  role: 'owner',
  personal: true,
};
const added: Workspace = {
  workspaceId: 'added',
  name: 'Added',
  role: 'owner',
  personal: false,
};

await test('workspace membership reload and route lifecycle', async (t) => {
  const container = document.createElement('div');
  document.body.append(container);
  let root: Root | null = null;
  const unavailable = (): never => {
    throw Error('No mounted workspace host.');
  };
  let value: WorkspaceValue = {
    state: { status: 'loading' },
    reload: unavailable,
    remember: unavailable,
    adopt: unavailable,
    forget: unavailable,
  };
  let navigate: ReturnType<typeof useNavigate> = unavailable;
  let account: string | null = 'account-a';
  let status: SessionStatus = 'signed-in';
  let address = '';
  const currentRoot = (): Root => {
    assert.ok(root);
    return root;
  };
  const ready = () => {
    const state = value.state;
    assert.ok(state.status === 'ready');
    return state;
  };
  const requestAt = (index: number) => {
    const request = requests[index];
    assert.ok(request);
    return request;
  };
  const renderHost = async () => {
    const rendered = currentRoot();
    await act(async () =>
      rendered.render(
        strict
          ? createElement(StrictMode, null, createElement(Host))
          : createElement(Host),
      ),
    );
  };
  let strict = false;
  let guardGeneration = 0;
  let mounts = 0;
  let protectedRequests = 0;
  function ProtectedPage() {
    const [draft] = useState(() => 'Unsaved draft');
    useEffect(() => {
      mounts += 1;
      protectedRequests += 1;
    }, []);
    return createElement('button', { 'data-create': '' }, draft);
  }
  function RouteProbe() {
    navigate = useNavigate();
    address = useLocation().pathname;
    const workspaceId = address.split('/')[2];
    assert.ok(workspaceId);
    return createElement(RequireCurrentWorkspace, {
      workspaceId,
      children: createElement(ProtectedPage),
    });
  }
  function Host() {
    const [generation, setGeneration] = useState(0);
    value = {
      ...useWorkspaceLoader(status, account, generation),
      reload: () => setGeneration((n) => n + 1),
    };
    return createElement(
      WorkspaceContext.Provider,
      { value },
      createElement(
        MemoryRouter,
        { initialEntries: [address] },
        createElement(RouteProbe, {
          key: `${account ?? 'signed-out'}:${guardGeneration}`,
        }),
      ),
    );
  }
  async function start(path = '/w/unknown', strictMode = false) {
    if (root) await act(async () => currentRoot().unmount());
    strict = strictMode;
    guardGeneration = 0;
    browser.localStorage.clear();
    requests.length = 0;
    mounts = 0;
    protectedRequests = 0;
    account = 'account-a';
    status = 'signed-in';
    address = path;
    root = createRoot(container);
    await renderHost();
  }
  async function answer(
    index: number,
    workspaces: readonly Workspace[] = [personal],
  ) {
    assert.ok(requestAt(index), `Missing list request ${index}`);
    await act(async () => requestAt(index).resolve({ data: { workspaces } }));
  }
  async function fail(index: number, responseStatus = 0) {
    assert.ok(requestAt(index));
    await act(async () =>
      requestAt(index).resolve({
        error: {},
        ...(responseStatus ? { response: { status: responseStatus } } : {}),
      }),
    );
  }
  async function go(path: string) {
    await act(async () => navigate(path));
  }
  function noProtectedChild() {
    assert.equal(container.querySelector('[data-create]'), null);
  }
  try {
    await t.test(
      'unknown target mounts no protected child while membership is pending',
      async () => {
        await start();
        assert.equal(protectedRequests, 0);
        assert.equal(container.querySelector('[data-create]'), null);
        await answer(0);
        assert.equal(protectedRequests, 0);
        await answer(1);
        assert.equal(address, '/w/personal');
      },
    );
    await t.test('completion revision increases after reload', async () => {
      await start('/w/personal');
      await answer(0);
      const revision = ready().revision;
      await act(async () => value.reload());
      await answer(1);
      assert.ok(ready().revision > revision);
    });
    await t.test(
      'a workspace made on another device opens after refresh',
      async () => {
        await start('/w/added');
        await answer(0);
        noProtectedChild();
        await answer(1, [personal, added]);
        assert.equal(address, '/w/added');
        assert.equal(mounts, 1);
        assert.equal(ready().workspaceId, 'added');
      },
    );
    await t.test(
      'repeated known-workspace refresh keeps the same draft and child',
      async () => {
        await start('/w/personal');
        await answer(0);
        const child = container.querySelector('[data-create]');
        let revision = ready().revision;
        for (let index = 1; index <= 3; index += 1) {
          await act(async () => value.reload());
          assert.equal(container.querySelector('[data-create]'), child);
          await answer(index);
          assert.ok(ready().revision > revision);
          revision = ready().revision;
          assert.equal(container.querySelector('[data-create]'), child);
          assert.ok(child);
          assert.equal(child.textContent, 'Unsaved draft');
          assert.equal(mounts, 1);
        }
      },
    );
    await t.test(
      'stale list completion cannot replace a later request',
      async () => {
        await start('/w/personal');
        await answer(0);
        await act(async () => value.reload());
        await act(async () => value.reload());
        await answer(2, [personal, added]);
        const revision = ready().revision;
        await answer(1, [personal]);
        assert.equal(ready().revision, revision);
        assert.equal(ready().workspaces.length, 2);
        assert.equal(mounts, 1);
      },
    );
    await t.test(
      'failed refresh keeps a known workspace usable with and without disk cache',
      async () => {
        await start('/w/personal');
        await answer(0);
        const child = container.querySelector('[data-create]');
        await act(async () => value.reload());
        await fail(1, 503);
        assert.equal(container.querySelector('[data-create]'), child);
        browser.localStorage.clear();
        await act(async () => value.reload());
        await fail(2);
        assert.equal(container.querySelector('[data-create]'), child);
        assert.equal(mounts, 1);
        assert.ok(ready().failure);
      },
    );
    await t.test(
      'local membership changes retain the failed refresh and last server revision',
      async () => {
        await start('/w/personal');
        await answer(0);
        const serverRevision = ready().serverRevision;
        await act(async () => value.reload());
        await fail(1, 503);
        const failed = ready();
        assert.ok(failed.failure);
        const child = container.querySelector('[data-create]');
        await act(async () => value.adopt(added));
        const adopted = ready();
        assert.ok(adopted.revision > failed.revision);
        assert.equal(adopted.serverRevision, serverRevision);
        assert.equal(adopted.failure, failed.failure);
        assert.deepEqual(adopted.workspaces, [personal, added]);
        assert.equal(
          browser.localStorage.getItem('notesapp.workspaces:account-a'),
          JSON.stringify([personal, added]),
        );
        await act(async () => value.forget('added'));
        const forgotten = ready();
        assert.ok(forgotten.revision > adopted.revision);
        assert.equal(forgotten.serverRevision, serverRevision);
        assert.equal(forgotten.failure, failed.failure);
        assert.deepEqual(forgotten.workspaces, [personal]);
        assert.equal(
          browser.localStorage.getItem('notesapp.workspaces:account-a'),
          JSON.stringify([personal]),
        );
        assert.equal(container.querySelector('[data-create]'), child);
        assert.equal(mounts, 1);
        assert.equal(address, '/w/personal');
        assert.equal(requests.length, 2);
      },
    );
    await t.test(
      'a local change without a remaining choice reports failure before storing the list',
      async () => {
        await start('/w/personal');
        await answer(0);
        await act(async () => value.reload());
        await fail(1, 503);
        assert.ok(ready().failure);
        const list = browser.localStorage.getItem(
          'notesapp.workspaces:account-a',
        );
        const choice = browser.localStorage.getItem(
          'notesapp.workspace:account-a',
        );
        assert.equal(list, JSON.stringify([personal]));
        assert.equal(choice, 'personal');
        await act(async () => value.forget('personal'));
        assert.deepEqual(value.state, {
          status: 'error',
          message: 'Your notes did not open. Try again.',
        });
        noProtectedChild();
        assert.equal(
          browser.localStorage.getItem('notesapp.workspaces:account-a'),
          list,
        );
        assert.equal(
          browser.localStorage.getItem('notesapp.workspace:account-a'),
          choice,
        );
        assert.equal(requests.length, 2);
      },
    );
    await t.test(
      'cache membership can open a known target after a network failure',
      async () => {
        await start('/w/personal');
        browser.localStorage.setItem(
          'notesapp.workspaces:account-a',
          JSON.stringify([personal]),
        );
        await fail(0);
        assert.equal(mounts, 1);
        assert.equal(address, '/w/personal');
      },
    );
    await t.test(
      'cache exclusion cannot redirect an unknown target; retry can confirm exclusion',
      async () => {
        await start('/w/unknown');
        await answer(0);
        await fail(1);
        assert.equal(address, '/w/unknown');
        noProtectedChild();
        assert.ok(container.querySelector('[role=alert]'));
        await act(async () => container.querySelector('button')?.click());
        noProtectedChild();
        assert.equal(container.querySelector('[role=alert]'), null);
        await answer(2);
        assert.equal(address, '/w/personal');
        assert.equal(mounts, 1);
      },
    );
    await t.test(
      'initial failure without valid cache reports failure and can recover',
      async () => {
        await start();
        browser.localStorage.setItem(
          'notesapp.workspaces:account-a',
          'broken cache',
        );
        await fail(0);
        noProtectedChild();
        assert.equal(address, '/w/unknown');
        assert.ok(container.querySelector('[role=alert]'));
        await act(async () => container.querySelector('button')?.click());
        await answer(1);
        noProtectedChild();
        await answer(2);
        assert.equal(address, '/w/personal');
      },
    );
    await t.test(
      'permission failure does not use a valid disk cache',
      async () => {
        await start();
        browser.localStorage.setItem(
          'notesapp.workspaces:account-a',
          JSON.stringify([personal]),
        );
        await fail(0, 403);
        noProtectedChild();
        assert.equal(value.state.status, 'error');
      },
    );
    await t.test(
      'adopt and forget supersede an in-flight list without stale resurrection',
      async () => {
        await start('/w/personal');
        await answer(0);
        await act(async () => value.reload());
        const beforeAdopt = ready().revision;
        await act(async () => value.adopt(added));
        assert.ok(ready().revision > beforeAdopt);
        await go('/w/added');
        assert.equal(address, '/w/added');
        await answer(1, [personal]);
        assert.equal(ready().workspaces.length, 2);
        await answer(2, [personal, added]);
        await go('/w/personal');
        await act(async () => value.reload());
        const beforeForget = ready().revision;
        await act(async () => value.forget('added'));
        assert.ok(ready().revision > beforeForget);
        await answer(3, [personal, added]);
        assert.equal(ready().workspaces.length, 1);
        await answer(4, [personal]);
        assert.equal(ready().workspaces.length, 1);
        const revision = ready().revision;
        await act(async () => {
          value.adopt(personal);
          value.forget('absent');
        });
        assert.equal(ready().revision, revision);
        assert.equal(requests.length, 5);
      },
    );
    await t.test(
      'a mutation and list completion in one batch keep the newer membership',
      async () => {
        await start('/w/personal');
        await answer(0);
        await act(async () => value.reload());
        await act(async () => {
          value.adopt(added);
          requestAt(1).resolve({ data: { workspaces: [personal] } });
        });
        assert.equal(ready().workspaces.length, 2);
        await answer(2, [personal, added]);
        assert.equal(ready().workspaces.length, 2);
      },
    );
    await t.test(
      'sign-out and a new session cannot reuse prior membership',
      async () => {
        await start('/w/personal');
        await answer(0);
        await act(async () => value.reload());
        status = 'signed-out';
        account = null;
        await renderHost();
        noProtectedChild();
        status = 'signed-in';
        account = 'account-a';
        await renderHost();
        noProtectedChild();
        await answer(1, [personal, added]);
        noProtectedChild();
        await answer(2, [personal]);
        assert.equal(ready().workspaces.length, 1);
        assert.equal(mounts, 2);
      },
    );
    await t.test(
      'account switch masks the prior account and cancels its pending answer',
      async () => {
        await start('/w/personal');
        await answer(0);
        const oldValue = value;
        await act(async () => value.reload());
        account = 'account-b';
        await renderHost();
        noProtectedChild();
        await answer(1, [personal, added]);
        noProtectedChild();
        assert.equal(
          browser.localStorage.getItem('notesapp.workspaces:account-b'),
          null,
        );
        await answer(2, [added]);
        noProtectedChild();
        await act(async () => {
          oldValue.remember('personal');
          oldValue.adopt(personal);
          oldValue.forget('added');
        });
        assert.equal(ready().workspaces.length, 1);
        await answer(3, [added]);
        assert.equal(address, '/w/added');
        assert.equal(ready().workspaceId, 'added');
      },
    );
    await t.test(
      'rapid addresses and return from a known route cannot use an earlier answer',
      async () => {
        await start('/w/unknown');
        await answer(0);
        await go('/w/added');
        noProtectedChild();
        await go('/w/personal');
        assert.equal(mounts, 1);
        await answer(1);
        assert.equal(address, '/w/personal');
        await answer(2, [personal, added]);
        assert.equal(address, '/w/personal');
        await go('/w/unknown');
        noProtectedChild();
        await answer(3);
        assert.equal(address, '/w/personal');
      },
    );
    await t.test(
      'a failed refresh keeps current membership before an older disk cache',
      async () => {
        await start('/w/added');
        await answer(0);
        await answer(1, [personal, added]);
        assert.equal(address, '/w/added');
        assert.equal(mounts, 1);
        await act(async () => value.reload());
        browser.localStorage.setItem(
          'notesapp.workspaces:account-a',
          JSON.stringify([personal]),
        );
        await fail(2);
        assert.ok(container.querySelector('[data-create]'));
        assert.equal(mounts, 1);
        assert.deepEqual(ready().workspaces, [personal, added]);
        assert.equal(address, '/w/added');
        await act(async () => value.reload());
        await fail(3);
        assert.ok(container.querySelector('[data-create]'));
        assert.equal(mounts, 1);
        assert.deepEqual(ready().workspaces, [personal, added]);
        assert.equal(address, '/w/added');
      },
    );
    await t.test(
      'a failed refresh cannot restore a forgotten workspace from disk cache',
      async () => {
        await start('/w/personal');
        await answer(0, [personal, added]);
        await act(async () => value.forget('added'));
        browser.localStorage.setItem(
          'notesapp.workspaces:account-a',
          JSON.stringify([personal, added]),
        );
        await act(async () => value.reload());
        await fail(1);
        assert.deepEqual(ready().workspaces, [personal]);
        assert.equal(address, '/w/personal');
        assert.equal(mounts, 1);
      },
    );
    await t.test(
      'a remounted unknown guard waits for its own refreshed list',
      async () => {
        await start('/w/unknown');
        await answer(0);
        guardGeneration += 1;
        await renderHost();
        noProtectedChild();
        await answer(1);
        assert.equal(address, '/w/unknown');
        noProtectedChild();
        await answer(2);
        assert.equal(address, '/w/personal');
      },
    );
    await t.test(
      'Strict Mode replay cancels the first request and settles the active request',
      async () => {
        await start('/w/unknown', true);
        noProtectedChild();
        assert.equal(requests.length, 2);
        await answer(0, [personal, added]);
        noProtectedChild();
        assert.equal(value.state.status, 'loading');
        await answer(1);
        noProtectedChild();
        await answer(2);
        assert.equal(address, '/w/personal');
      },
    );
    await t.test(
      'unmount cancels list completion and prevents a cache write',
      async () => {
        await start();
        await act(async () => currentRoot().unmount());
        root = null;
        await answer(0, [personal, added]);
        assert.equal(
          browser.localStorage.getItem('notesapp.workspaces:account-a'),
          null,
        );
      },
    );
    await t.test(
      'WorkspaceHome keeps loading, error, zero-argument retry and ready navigation',
      async () => {
        let homeAddress = '';
        let homeNavigation = '';
        const retries: unknown[][] = [];
        function HomeLocation() {
          const location = useLocation();
          homeAddress = `${location.pathname}${location.search}${location.hash}`;
          homeNavigation = useNavigationType();
          return null;
        }
        const renderHome = async (
          state: WorkspaceValue['state'],
          path: string,
        ) => {
          await act(async () =>
            currentRoot().render(
              createElement(
                WorkspaceContext.Provider,
                {
                  value: {
                    state,
                    reload: (...args: unknown[]) => {
                      retries.push(args);
                    },
                    remember: unavailable,
                    adopt: unavailable,
                    forget: unavailable,
                  },
                },
                createElement(
                  MemoryRouter,
                  { initialEntries: [path] },
                  createElement(HomeLocation),
                  createElement(
                    Routes,
                    null,
                    createElement(Route, {
                      path: '/w/:workspaceId/*',
                      element: createElement(
                        'p',
                        { 'data-home-destination': '' },
                        'Workspace destination',
                      ),
                    }),
                    createElement(Route, {
                      path: '*',
                      element: createElement(WorkspaceHome),
                    }),
                  ),
                ),
              ),
            ),
          );
        };
        const path = '/settings?settings=appearance#section';
        root = createRoot(container);
        await renderHome({ status: 'loading' }, path);
        assert.match(container.textContent ?? '', /Your notes are opening\./);
        assert.equal(container.querySelector('[role=alert]'), null);
        assert.equal(container.querySelector('button'), null);
        assert.equal(homeAddress, path);
        await renderHome(
          { status: 'error', message: 'Read failed. Try again.' },
          path,
        );
        assert.equal(
          container.querySelector('h1')?.textContent,
          'Your notes did not open',
        );
        assert.equal(
          container.querySelector('[role=alert]')?.textContent,
          'Read failed. Try again.',
        );
        const retry = container.querySelector('button');
        assert.ok(retry);
        assert.equal(retry.textContent, 'Try again');
        await act(async () => retry.click());
        assert.deepEqual(retries, [[]]);
        assert.equal(homeAddress, path);
        await renderHome({ status: 'loading' }, path);
        assert.equal(container.querySelector('[role=alert]'), null);
        assert.match(container.textContent ?? '', /Your notes are opening\./);
        await renderHome({ status: 'error', message: '' }, path);
        assert.ok(container.querySelector('[role=alert]'));
        assert.ok(container.querySelector('button'));
        const readyState: WorkspaceValue['state'] = {
          status: 'ready',
          workspaceId: personal.workspaceId,
          workspaces: [personal],
          revision: 1,
          serverRevision: 1,
          failure: null,
        };
        await renderHome(readyState, path);
        assert.equal(
          homeAddress,
          '/w/personal/settings?settings=appearance#section',
        );
        assert.equal(homeNavigation, 'REPLACE');
        assert.ok(container.querySelector('[data-home-destination]'));
        await act(async () => currentRoot().unmount());
        root = createRoot(container);
        await renderHome(readyState, '/');
        assert.equal(homeAddress, '/w/personal');
        assert.equal(homeNavigation, 'REPLACE');
      },
    );

    await t.test(
      'RouterProvider keeps a known draft and its title through refresh',
      async () => {
        if (root) await act(async () => currentRoot().unmount());
        requests.length = 0;
        account = 'account-a';
        status = 'signed-in';
        let draftMounts = 0;
        let locationKey = '';
        function Draft() {
          const [text] = useState('Unsaved router draft');
          const location = useLocation();
          locationKey = location.key;
          useDocumentTitle('Owned router note');
          useEffect(() => {
            draftMounts += 1;
          }, []);
          return createElement('textarea', {
            'aria-label': 'Synthetic draft',
            value: text,
            readOnly: true,
          });
        }
        function GuardedDraft() {
          const { workspaceId } = useParams();
          assert.ok(workspaceId);
          return createElement(RequireCurrentWorkspace, {
            workspaceId,
            children: createElement(Draft),
          });
        }
        const router = createMemoryRouter(
          [
            {
              path: '/w/:workspaceId/notes/:fileId',
              element: createElement(GuardedDraft),
            },
          ],
          { initialEntries: ['/w/personal/notes/one?keep=yes#draft'] },
        );
        function CompositionHost() {
          const [generation, setGeneration] = useState(0);
          value = {
            ...useWorkspaceLoader(status, account, generation),
            reload: () => setGeneration((n) => n + 1),
          };
          return createElement(
            WorkspaceContext.Provider,
            { value },
            createElement(SessionScope, {
              accountKey: account ?? 'signed-out',
              children: createElement(RouterProvider, { router }),
            }),
          );
        }
        root = createRoot(container);
        try {
          await act(async () =>
            currentRoot().render(createElement(CompositionHost)),
          );
          assert.equal(container.querySelector('textarea'), null);
          await answer(0);
          const draft = container.querySelector('textarea');
          assert.ok(draft);
          draft.setSelectionRange(2, 7);
          const key = locationKey;
          assert.equal(document.title, 'Owned router note - tidy notebook');
          for (const fails of [false, true, false]) {
            const index = requests.length;
            await act(async () => value.reload());
            assert.ok(requests[index]);
            assert.equal(container.querySelector('textarea'), draft);
            assert.equal(document.title, 'Owned router note - tidy notebook');
            if (fails) await fail(index, 503);
            else await answer(index);
            assert.equal(container.querySelector('textarea'), draft);
            assert.equal(draft.value, 'Unsaved router draft');
            assert.deepEqual(
              [draft.selectionStart, draft.selectionEnd],
              [2, 7],
            );
            assert.equal(draftMounts, 1);
            assert.equal(locationKey, key);
            assert.equal(
              router.state.location.pathname,
              '/w/personal/notes/one',
            );
            assert.equal(router.state.location.search, '?keep=yes');
            assert.equal(router.state.location.hash, '#draft');
            assert.equal(document.title, 'Owned router note - tidy notebook');
          }
        } finally {
          await act(async () => currentRoot().unmount());
          root = null;
          router.dispose();
        }
      },
    );
    await t.test(
      'RouterProvider gates new route owners and SessionScope drops the old account draft',
      async () => {
        if (root) await act(async () => currentRoot().unmount());
        requests.length = 0;
        account = 'account-a';
        status = 'signed-in';
        const opened: string[] = [];
        function Draft() {
          const { workspaceId, fileId } = useParams();
          assert.ok(workspaceId);
          assert.ok(fileId);
          const [text] = useState('Unsaved ' + fileId);
          useDocumentTitle('Owned ' + fileId);
          useEffect(() => {
            opened.push(workspaceId + '/' + fileId);
          }, [workspaceId, fileId]);
          return createElement(
            'div',
            null,
            createElement('textarea', { value: text, readOnly: true }),
            createElement(
              'button',
              { 'data-create': '' },
              'Synthetic creation',
            ),
          );
        }
        function GuardedDraft() {
          const { workspaceId } = useParams();
          assert.ok(workspaceId);
          return createElement(RequireCurrentWorkspace, {
            workspaceId,
            children: createElement(Draft),
          });
        }
        const router = createMemoryRouter(
          [
            {
              path: '/w/:workspaceId/notes/:fileId',
              element: createElement(GuardedDraft),
            },
          ],
          { initialEntries: ['/w/personal/notes/first'] },
        );
        function CompositionHost() {
          const [generation, setGeneration] = useState(0);
          value = {
            ...useWorkspaceLoader(status, account, generation),
            reload: () => setGeneration((n) => n + 1),
          };
          return createElement(
            WorkspaceContext.Provider,
            { value },
            createElement(SessionScope, {
              accountKey: account ?? 'signed-out',
              children: createElement(RouterProvider, { router }),
            }),
          );
        }
        root = createRoot(container);
        try {
          await act(async () =>
            currentRoot().render(createElement(CompositionHost)),
          );
          await answer(0);
          assert.deepEqual(opened, ['personal/first']);
          assert.equal(document.title, 'Owned first - tidy notebook');
          const oldDraft = container.querySelector('textarea');
          assert.ok(oldDraft);
          await act(async () => {
            void router.navigate('/w/added/notes/second');
          });
          assert.equal(container.querySelector('textarea'), null);
          assert.equal(container.querySelector('[data-create]'), null);
          assert.deepEqual(opened, ['personal/first']);
          await answer(1, [personal, added]);
          assert.deepEqual(opened, ['personal/first', 'added/second']);
          assert.equal(document.title, 'Owned second - tidy notebook');
          assert.equal(oldDraft.isConnected, false);
          const secondDraft = container.querySelector('textarea');
          assert.ok(secondDraft);
          assert.equal(secondDraft.value, 'Unsaved second');
          await act(async () => value.reload());
          const stale = requests.length - 1;
          account = 'account-b';
          await act(async () =>
            currentRoot().render(createElement(CompositionHost)),
          );
          assert.equal(secondDraft.isConnected, false);
          assert.equal(container.querySelector('textarea'), null);
          assert.equal(container.querySelector('[data-create]'), null);
          const fresh = requests.length - 1;
          assert.notEqual(stale, fresh);
          await answer(stale, [personal, added]);
          assert.equal(container.querySelector('textarea'), null);
          assert.deepEqual(opened, ['personal/first', 'added/second']);
          await answer(fresh, [personal, added]);
          assert.deepEqual(opened, [
            'personal/first',
            'added/second',
            'added/second',
          ]);
          assert.equal(document.title, 'Owned second - tidy notebook');
          assert.notEqual(container.querySelector('textarea'), secondDraft);
          assert.equal(router.state.location.pathname, '/w/added/notes/second');
        } finally {
          await act(async () => currentRoot().unmount());
          root = null;
          router.dispose();
        }
      },
    );
  } finally {
    if (root) await act(async () => currentRoot().unmount());
    container.remove();
    hooks.deregister();
    for (const [name, original] of originals) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
    if (originalBrowserFetch)
      Object.defineProperty(browser, 'fetch', originalBrowserFetch);
    else Reflect.deleteProperty(browser, 'fetch');
    await browser.happyDOM.close();
    assert.equal(unexpectedNetwork, 0);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(browser, 'fetch'),
      originalBrowserFetch,
    );
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
      originals.get('IS_REACT_ACT_ENVIRONMENT'),
    );
  }
});
