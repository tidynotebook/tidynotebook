import type { ContentSearch } from './palette-items.ts';

/** One completed search belongs to exactly one input and workspace read. */
export type ContentSearchAnswer = {
  readonly request: object;
  readonly result: ContentSearch;
};

/** Old results must not supply snippets or an empty state for a new input. */
export function currentContentSearch(
  request: object,
  answer: ContentSearchAnswer | null,
): ContentSearch | null {
  return answer?.request === request ? answer.result : null;
}

/** Starts one search. Cancellation prevents a late answer from changing the list. */
export function startContentSearch(
  request: object,
  read: () => Promise<ContentSearch>,
  publish: (answer: ContentSearchAnswer) => void,
): { readonly done: Promise<void>; readonly cancel: () => void } {
  let cancelled = false;
  return {
    done: read().then((result) => {
      if (!cancelled) publish({ request, result });
    }),
    cancel: () => {
      cancelled = true;
    },
  };
}
