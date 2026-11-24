import type { SnapshotRevision } from '@notesapp/sync';
import { guard, type ContentRow, type SnapshotItemRow } from '../database.ts';
import { byteLength, type LocalStoreContext } from './shared.ts';

/** Stores a batch of downloaded bodies and their staging rows atomically. */
export function storeSnapshotRevisions(
  ctx: LocalStoreContext,
  accountId: string,
  workspaceId: string,
  revisions: readonly SnapshotRevision[],
): Promise<void> {
  const { serverOrigin, db, tables, nowIso } = ctx;
  return guard('storing snapshot revisions', () =>
    db.transaction('rw', [tables.contents, tables.snapshotItems], async () => {
      const contents: ContentRow[] = [];
      const items: SnapshotItemRow[] = [];
      const storedAt = nowIso();
      for (const { text, ...revision } of revisions) {
        if (text !== null)
          contents.push({
            serverOrigin,
            accountId,
            workspaceId,
            digest: revision.digest,
            text,
            bytes: null,
            size: byteLength(text),
          });
        items.push({
          ...revision,
          serverOrigin,
          accountId,
          workspaceId,
          storedAt,
        });
      }
      if (contents.length > 0) await tables.contents.bulkPut(contents);
      await tables.snapshotItems.bulkPut(items);
    }),
  );
}
