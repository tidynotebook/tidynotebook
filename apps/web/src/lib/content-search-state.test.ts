import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentContentSearch,
  startContentSearch,
  type ContentSearchAnswer,
} from './content-search-state.ts';
import type { ContentSearch } from './palette-items.ts';

await test('a delayed query stays pending and a completed empty query is settled', async () => {
  const request = {};
  const delayed = Promise.withResolvers<ContentSearch>();
  let answer: ContentSearchAnswer | null = null;
  const search = startContentSearch(
    request,
    () => delayed.promise,
    (next) => {
      answer = next;
    },
  );
  assert.equal(currentContentSearch(request, answer), null);
  delayed.resolve({ hits: [], offline: false });
  await search.done;
  assert.deepEqual(currentContentSearch(request, answer), {
    hits: [],
    offline: false,
  });
});

await test('rapid inputs and out-of-order answers never reuse old snippets', async () => {
  const first = {};
  const second = {};
  const delayed = Promise.withResolvers<ContentSearch>();
  let answer: ContentSearchAnswer | null = null;
  const old = startContentSearch(
    first,
    () => delayed.promise,
    (next) => {
      answer = next;
    },
  );
  old.cancel();
  const latest = {
    hits: [
      {
        fileId: 'new',
        path: 'Latest.md',
        excerpt: [{ text: 'blue umbrella', marked: true }],
      },
    ],
    offline: false,
  };
  const next = startContentSearch(
    second,
    () => Promise.resolve(latest),
    (value) => {
      answer = value;
    },
  );
  await next.done;
  delayed.resolve({
    hits: [{ fileId: 'old', path: 'Old.md', excerpt: [] }],
    offline: false,
  });
  await old.done;
  assert.deepEqual(currentContentSearch(second, answer), latest);
  assert.equal(currentContentSearch({}, answer), null);
});
