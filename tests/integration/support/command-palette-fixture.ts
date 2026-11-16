/** Controlled search READs for the actual palette. No service is started. */
import assert from 'node:assert/strict';
import type { PaletteHit } from '../../../apps/web/src/lib/palette-items.ts';

type Reply = { data: { hits: readonly PaletteHit[] } };
const pending = new Map<
  string,
  ReturnType<typeof Promise.withResolvers<Reply>>
>();
export const reads: string[] = [];

export async function searchFiles({ query }: { query: { query: string } }) {
  assert.ok(!pending.has(query.query), 'A query has only one pending read.');
  const gate = Promise.withResolvers<Reply>();
  pending.set(query.query, gate);
  reads.push(query.query);
  return gate.promise;
}

export function answer(query: string, hits: readonly PaletteHit[] = []) {
  const gate = pending.get(query);
  assert.ok(gate, 'The palette must have requested this query.');
  pending.delete(query);
  gate.resolve({ data: { hits } });
}

export function finishReads() {
  for (const query of pending.keys()) answer(query);
}
