import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { Window } from 'happy-dom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { act, createElement } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import { openLocalStore } from '@notesapp/storage-browser';

await test('creation results stay ordered within each surviving workspace', async (t) => {
  const browser = new Window({ url: 'http://localhost/' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'Event',
    'MouseEvent',
  ] as const) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: browser[name],
    });
  }
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const { createRoot } = await import('react-dom/client');
  const { useCreateNote } =
    await import('../../apps/web/dist/features/notes/new-note.js');
  const { useWorkspaceProblem } =
    await import('../../apps/web/dist/features/templates/workspace-problem.js');
  const local = await openLocalStore('http://localhost', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    databaseName: crypto.randomUUID(),
  });
  let hold = true;
  let cleanups = 0;
  let successes = 0;
  const writes: ReturnType<typeof Promise.withResolvers<void>>[] = [];
  const methods = {
    ...local,
    dropDraft: async (...args: Parameters<typeof local.dropDraft>) => {
      await local.dropDraft(...args);
      cleanups += 1;
    },
    checkpoint: async (...args: Parameters<typeof local.checkpoint>) => {
      if (hold) {
        const pending = Promise.withResolvers<void>();
        writes.push(pending);
        await pending.promise;
      }
      const result = await local.checkpoint(...args);
      successes += 1;
      return result;
    },
  };
  const pendingWork = new Set<Promise<unknown>>();
  const store = new Proxy(methods, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        const result: unknown = Reflect.apply(value, target, args);
        if (result instanceof Promise) {
          pendingWork.add(result);
          void result.then(
            () => pendingWork.delete(result),
            () => pendingWork.delete(result),
          );
        }
        return result;
      };
    },
  });
  const finishWork = async () => {
    do {
      await Promise.allSettled([...pendingWork]);
      await setImmediate();
    } while (pendingWork.size > 0);
  };
  const accountId = crypto.randomUUID();
  const workspaceA = crypto.randomUUID();
  const workspaceB = crypto.randomUUID();
  let remountCreators = true;
  const starts: string[] = [];
  function Creator({
    workspaceId,
    begin,
  }: {
    workspaceId: string;
    begin: () => (message: string | null) => boolean;
  }) {
    const note = useCreateNote(store, accountId, workspaceId, undefined, () => {
      starts.push(workspaceId);
      return begin();
    });
    return createElement(
      'button',
      { onClick: () => note.create('', 'Chosen text') },
      'Create',
    );
  }
  function Frame({ workspaceId }: { workspaceId: string }) {
    const { problem, begin } = useWorkspaceProblem(workspaceId);
    return createElement(
      'div',
      null,
      createElement('output', { 'aria-label': 'Problem' }, problem),
      createElement(Creator, {
        key: remountCreators ? workspaceId : 'shared',
        workspaceId,
        begin,
      }),
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const navigators: ReturnType<typeof useNavigate>[] = [];
  function Navigation() {
    navigators.push(useNavigate());
    return createElement(
      'output',
      { 'aria-label': 'Location' },
      useLocation().pathname,
    );
  }
  function WorkspaceFrame() {
    const { workspaceId } = useParams();
    assert.ok(workspaceId);
    return createElement(Frame, { workspaceId });
  }
  const show = async (workspaceId: string) => {
    const navigate = navigators.at(-1);
    await act(async () => {
      if (navigate !== undefined) await navigate(`/w/${workspaceId}`);
      else
        root.render(
          createElement(
            MemoryRouter,
            { initialEntries: [`/w/${workspaceId}`] },
            createElement(Navigation),
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: '/w/:workspaceId/*',
                element: createElement(WorkspaceFrame),
              }),
            ),
          ),
        );
    });
  };
  const output = () =>
    container.querySelector('output[aria-label="Problem"]')?.textContent ?? '';
  const location = () =>
    container.querySelector('output[aria-label="Location"]')?.textContent ?? '';
  const click = async () => {
    await act(async () => {
      const button = container.querySelector('button');
      assert.ok(button);
      button.click();
    });
  };
  const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 5000;
    while (!condition()) {
      assert.ok(Date.now() < deadline, 'Creation feedback did not settle.');
      await act(async () => {
        await setImmediate();
      });
    }
  };
  const message = 'The note could not be made on this device.';
  try {
    await show(workspaceA);
    await click();
    await waitFor(() => writes.length === 1);
    await show(workspaceB);
    await act(async () =>
      writes[0]?.reject(new Error('The local checkpoint failed.')),
    );
    await waitFor(() => cleanups === 1);
    assert.equal(output(), '');
    await show(workspaceA);
    assert.equal(
      output(),
      message,
      'The failure after dialog unmount must remain visible in its original workspace.',
    );
    await show(workspaceB);
    await click();
    await waitFor(() => writes.length === 2);
    await act(async () =>
      writes[1]?.reject(new Error('The second checkpoint failed.')),
    );
    await waitFor(() => output() === message);
    await show(workspaceA);
    assert.equal(
      output(),
      message,
      'Another workspace error must not replace this workspace error.',
    );
    hold = false;
    await click();
    await waitFor(() => output() === '');
    await show(workspaceB);
    assert.equal(
      output(),
      message,
      'Success in one workspace must not clear another workspace error.',
    );
    await t.test(
      'a save finishes after leaving its workspace without navigating back',
      async () => {
        await show(workspaceA);
        hold = true;
        const index = writes.length;
        const queued = (await local.pending(accountId, workspaceA)).length;
        await click();
        await waitFor(() => writes.length === index + 1);
        await show(workspaceB);
        const accepted = successes;
        await act(async () => writes[index]?.resolve());
        await waitFor(() => successes === accepted + 1);
        assert.equal(
          location(),
          `/w/${workspaceB}`,
          'A completed save must not take the user back to its old workspace.',
        );
        assert.equal(
          (await local.pending(accountId, workspaceA)).length,
          queued + 1,
        );
      },
    );
    await t.test(
      'an older failure cannot replace a newer success after returning to the workspace',
      async () => {
        await show(workspaceA);
        hold = true;
        const index = writes.length;
        await click();
        await waitFor(() => writes.length === index + 1);
        await show(workspaceB);
        await show(workspaceA);
        hold = false;
        const accepted = successes;
        await click();
        await waitFor(() => successes === accepted + 1);
        assert.equal(output(), '');
        const dropped = cleanups;
        await act(async () =>
          writes[index]?.reject(new Error('Older creation failed.')),
        );
        await waitFor(() => cleanups === dropped + 1);
        assert.equal(
          output(),
          '',
          'A stale failure must not replace the newer successful result.',
        );
      },
    );
    await t.test(
      'an older success cannot clear a newer failure after returning to the workspace',
      async () => {
        hold = true;
        const index = writes.length;
        await click();
        await waitFor(() => writes.length === index + 1);
        await show(workspaceB);
        await show(workspaceA);
        await click();
        await waitFor(() => writes.length === index + 2);
        const dropped = cleanups;
        await act(async () =>
          writes[index + 1]?.reject(new Error('Newer creation failed.')),
        );
        await waitFor(() => cleanups === dropped + 1);
        assert.equal(output(), message);
        const accepted = successes;
        const before = location();
        await act(async () => writes[index]?.resolve());
        await waitFor(() => successes === accepted + 1);
        assert.equal(
          output(),
          message,
          'A stale success must not clear the newer failed result.',
        );
        assert.equal(
          location(),
          before,
          'A stale success after A/B/A must not navigate away from the newer result.',
        );
      },
    );
    await t.test(
      'a reused creator keeps the new workspace attempt locked while the old save finishes',
      async () => {
        remountCreators = false;
        await show(workspaceA);
        hold = true;
        const index = writes.length;
        await click();
        await waitFor(() => writes.length === index + 1);
        await show(workspaceB);
        await click();
        await waitFor(() => writes.length === index + 2);
        const accepted = successes;
        await act(async () => writes[index]?.resolve());
        await waitFor(() => successes === accepted + 1);
        assert.equal(location(), `/w/${workspaceB}`);
        const started = starts.length;
        await click();
        assert.equal(
          starts.length,
          started,
          'An old finally block must not unlock the new workspace attempt.',
        );
        await act(async () => writes[index + 1]?.resolve());
        await waitFor(() => successes === accepted + 2);
        assert.ok(location().startsWith(`/w/${workspaceB}/notes/`));
      },
    );
  } finally {
    for (const pending of writes) pending.resolve();
    await act(async () => root.unmount());
    await act(finishWork);
    await local.close();
    await browser.happyDOM.close();
    for (const [name, original] of originals) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
