import assert from 'node:assert/strict';
import test from 'node:test';
import { createFactStore, sameMembers } from './fact-store.ts';
import { noteSaveReport } from './save-state.ts';

await test('a write of an equal value tells no reader', () => {
  const store = createFactStore<{ readonly saved: string | null } | null>(
    null,
    sameMembers,
  );
  let heard = 0;
  store.subscribe(() => {
    heard += 1;
  });
  store.set({ saved: null });
  store.set({ saved: null });
  assert.equal(heard, 1);
  store.set({ saved: '2026-10-02T10:00:00.000Z' });
  assert.equal(heard, 2);
  store.set(null);
  store.set(null);
  assert.equal(heard, 3);
});

await test('a stopped reader hears nothing more', () => {
  const store = createFactStore<number>(0, Object.is);
  let heard = 0;
  const stop = store.subscribe(() => {
    heard += 1;
  });
  store.set(1);
  stop();
  store.set(2);
  assert.equal(heard, 1);
  assert.equal(store.get(), 2);
});

await test('only the first edit changes the pending fact that the frame reads', () => {
  const store = createFactStore(
    noteSaveReport({ storageError: null, lastSavedAt: null }),
    sameMembers,
  );
  let heard = 0;
  store.subscribe(() => {
    heard += 1;
  });
  // Only the first key changes pending state. Further keys and draft writes
  // keep it pending until the current work reaches the server.
  for (let step = 0; step < 50; step += 1)
    store.set(
      noteSaveReport({
        pendingSave: true,
        storageError: null,
        lastSavedAt: null,
      }),
    );
  assert.equal(heard, 1);
  // A version and a failed write are facts the frame shows.
  store.set(
    noteSaveReport({
      pendingSave: true,
      storageError: null,
      lastSavedAt: '2026-10-02T10:00:00.000Z',
    }),
  );
  store.set(
    noteSaveReport({
      pendingSave: true,
      storageError: 'quota',
      lastSavedAt: '2026-10-02T10:00:00.000Z',
    }),
  );
  assert.equal(heard, 3);
});
