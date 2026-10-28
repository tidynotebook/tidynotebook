import assert from 'node:assert/strict';
import test from 'node:test';
import { removeRetiredWritingTips } from './retired-writing-tips.ts';

await test('startup removes only the retired tip keys and tolerates unavailable storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const removed: string[] = [];
  const storage = {
    'notesapp.writing-tips:account:workspace': 'dismissed',
    'notesapp.writing-tips:other:workspace': 'dismissed',
    'notesapp.theme': 'dark',
    removeItem: (key: string) => removed.push(key),
  };
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage },
    });
    removeRetiredWritingTips();
    assert.deepEqual(removed, [
      'notesapp.writing-tips:account:workspace',
      'notesapp.writing-tips:other:workspace',
    ]);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      get: () => {
        throw new Error('Storage denied');
      },
    });
    assert.doesNotThrow(removeRetiredWritingTips);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', original);
  }
});
