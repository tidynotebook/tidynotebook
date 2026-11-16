/** Mount the built Settings section and exercise its real hook and controls. */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import type { OfflineSettingsStore } from '../../apps/web/dist/features/accounts/offline-settings.js';

const browser = new Window({ url: 'http://localhost/' });
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'HTMLButtonElement',
  'getComputedStyle',
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
originals.set(
  'IS_REACT_ACT_ENVIRONMENT',
  Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
);
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
const { createRoot } = await import('react-dom/client');
const { OfflineSettingsSection } =
  await import('../../apps/web/dist/features/accounts/offline-settings.js');

const accountA = crypto.randomUUID();
const accountB = crypto.randomUUID();
const workspaceA = crypto.randomUUID();
const workspaceB = crypto.randomUUID();
const digestOf = (accountId: string, workspaceId: string): string =>
  `${accountId}/${workspaceId}`;

/** Only storage timing is controlled; React state, the hook and controls are real. */
function controlledStore() {
  const paused = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const readB = Promise.withResolvers<void>();
  const kept = new Set([digestOf(accountA, workspaceB)]);
  const writes: { accountId: string; workspaceId: string; keep: boolean }[] =
    [];
  let pauseUsed = false;
  let failB = false;
  let readsB = 0;
  const store: OfflineSettingsStore = {
    listAcceptedFiles: async (accountId, workspaceId) => [
      {
        serverOrigin: 'http://localhost',
        accountId,
        workspaceId,
        fileId: workspaceId,
        path: 'image.png',
        kind: 'attachment',
        acceptedHeadRevisionId: null,
        acceptedHeadDigest: digestOf(accountId, workspaceId),
        acceptedPath: 'image.png',
        localHeadRevisionId: null,
        deleted: false,
        updatedAt: '2026-10-25T00:00:00.000Z',
      },
    ],
    isAttachmentPinned: async (_accountId, workspaceId, digest) => {
      if (workspaceId === workspaceB) {
        readsB += 1;
        readB.resolve();
      }
      return kept.has(digest);
    },
    isHistoryPinned: async () => false,
    setAttachmentPinned: async (accountId, workspaceId, digest, keep) => {
      writes.push({ accountId, workspaceId, keep });
      if (workspaceId === workspaceA && !pauseUsed) {
        pauseUsed = true;
        started.resolve();
        await paused.promise;
      }
      if (workspaceId === workspaceB && failB)
        throw new Error('Storage unavailable');
      if (keep) kept.add(digest);
      else kept.delete(digest);
    },
    setHistoryPinned: async () => {
      throw new Error('Unexpected history write');
    },
  };
  return {
    store,
    paused,
    started,
    readB,
    kept,
    writes,
    readsB: () => readsB,
    refuseB: () => {
      failB = true;
    },
  };
}

/** Mount the Offline settings section and return render helpers. */
function screen(store: OfflineSettingsStore) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return {
    container,
    async render(
      accountId: string,
      workspaceId: string,
      currentStore = store,
    ): Promise<void> {
      await act(async () => {
        // No key change: the production section and its lock stay mounted.
        root.render(
          createElement(OfflineSettingsSection, {
            store: currentStore,
            accountId,
            workspaceId,
          }),
        );
      });
    },
    images(): HTMLButtonElement {
      const control = container.querySelector(
        'button[role="switch"][aria-label="Images"]',
      );
      assert.ok(control instanceof HTMLButtonElement);
      return control;
    },
    async close(): Promise<void> {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

await test(
  'mounted Settings keeps the offline write blocked after a workspace reread',
  { timeout: 10000 },
  async () => {
    const fixture = controlledStore();
    const page = screen(fixture.store);
    try {
      await page.render(accountA, workspaceA);
      assert.equal(page.images().getAttribute('aria-checked'), 'false');
      assert.equal(page.images().disabled, false);
      await act(async () => page.images().click());
      await fixture.started.promise;
      assert.equal(page.images().disabled, true);

      await page.render(accountA, workspaceB);
      await act(async () => fixture.readB.promise);
      // B is kept, unlike A. This proves B's completed read reached the screen.
      assert.equal(page.images().getAttribute('aria-checked'), 'true');
      assert.equal(page.images().disabled, true);
      const heading = page.container.querySelector('#offline-heading');
      assert.ok(heading instanceof HTMLElement);
      heading.focus();
      await act(async () => page.images().click());
      assert.deepEqual(fixture.writes, [
        { accountId: accountA, workspaceId: workspaceA, keep: true },
      ]);

      const readsBeforeRelease = fixture.readsB();
      await act(async () => fixture.paused.resolve());
      assert.ok(fixture.readsB() > readsBeforeRelease);
      assert.equal(page.images().disabled, false);
      assert.equal(page.images().getAttribute('aria-checked'), 'true');
      assert.equal(document.activeElement, heading);

      const row = page.images();
      assert.equal(row.getAttribute('role'), 'switch');
      await act(async () => row.click());
      assert.deepEqual(fixture.writes.at(-1), {
        accountId: accountA,
        workspaceId: workspaceB,
        keep: false,
      });
      assert.equal(fixture.writes.length, 2);
      assert.equal(page.images().getAttribute('aria-checked'), 'false');
      assert.equal(fixture.kept.has(digestOf(accountA, workspaceB)), false);
    } finally {
      fixture.paused.resolve();
      await page.close();
    }
  },
);

await test(
  'mounted Settings drops a late workspace failure and clears errors on account change',
  { timeout: 10000 },
  async () => {
    const fixture = controlledStore();
    const page = screen(fixture.store);
    try {
      await page.render(accountA, workspaceA);
      await act(async () => page.images().click());
      await fixture.started.promise;
      await page.render(accountA, workspaceB);
      await act(async () => fixture.readB.promise);
      assert.equal(page.images().getAttribute('aria-checked'), 'true');
      assert.equal(page.images().disabled, true);
      await act(async () =>
        fixture.paused.reject(new Error('Old workspace write failed')),
      );
      assert.equal(page.images().disabled, false);
      assert.equal(
        page.container.querySelector('[role="alert"]') === null,
        true,
      );

      fixture.refuseB();
      await act(async () => page.images().click());
      assert.match(
        page.container.querySelector('[role="alert"]')?.textContent ?? '',
        /could not change offline storage/,
      );
      await page.render(accountB, workspaceB);
      assert.equal(
        page.container.querySelector('[role="alert"]') === null,
        true,
      );
      assert.equal(page.images().getAttribute('aria-checked'), 'false');
    } finally {
      fixture.paused.resolve();
      await page.close();
    }
  },
);

await test(
  'mounted Settings ignores an old store failure in the same account and workspace',
  { timeout: 10000 },
  async () => {
    const oldStore = controlledStore();
    const replacement = controlledStore();
    const page = screen(oldStore.store);
    try {
      await page.render(accountA, workspaceA);
      await act(async () => page.images().click());
      await oldStore.started.promise;
      assert.equal(page.images().getAttribute('aria-checked'), 'true');

      await page.render(accountA, workspaceA, replacement.store);
      // The replacement store is unpinned. Its read has reached the control,
      // while the old store still owns the in-flight write.
      assert.equal(page.images().getAttribute('aria-checked'), 'false');
      assert.equal(page.images().disabled, true);
      await act(async () =>
        oldStore.paused.reject(new Error('Old store write failed')),
      );
      assert.equal(
        page.container.querySelector('[role="alert"]') === null,
        true,
      );
      assert.equal(page.images().disabled, false);
      assert.equal(replacement.writes.length, 0);
    } finally {
      oldStore.paused.resolve();
      replacement.paused.resolve();
      await page.close();
    }
  },
);

after(async () => {
  await browser.happyDOM.abort();
  for (const [name, descriptor] of originals) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, descriptor);
  }
});
