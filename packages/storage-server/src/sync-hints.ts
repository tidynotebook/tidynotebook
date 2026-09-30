/**
 * The feed hints of the unit of work of the store, sent after its commit
 * (record 0142).
 *
 * PostgreSQL serializes every transaction that queued a notification with one
 * lock that it holds until the commit record is flushed, so saves of
 * different workspaces waited for each other at commit. The unit of work sets
 * `deferHintsSetting` for its transaction, and the feed trigger then marks
 * the changed workspaces in `syncHintsSetting` instead of queueing a
 * notification. `commitWithHints` reads the mark and commits in one round
 * trip, then sends the hints in a transaction of its own that does not wait
 * for its flush. A hint is not data (record 0124), so a hint lost in a stop
 * between the two costs a later read and never a save.
 */
import type pg from 'pg';

/** The PostgreSQL channel of every sync hint. */
export const syncHintChannel = 'notesapp_sync';

/** The setting that asks the feed trigger to mark instead of notifying. */
export const deferHintsSetting = 'notesapp.defer_hints';

/** The setting where the feed trigger marks the changed workspaces. */
export const syncHintsSetting = 'notesapp.sync_hints';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The workspaces of one mark, each once and in order.
 *
 * The trigger writes identifiers only, and a value of another shape is left
 * out, so nothing but an identifier ever reaches the hint text.
 */
export function markedWorkspaces(mark: unknown): readonly string[] {
  if (typeof mark !== 'string' || mark === '') return [];
  const ids = mark.split(',').filter((id) => uuidPattern.test(id));
  return [...new Set(ids)].sort();
}

/**
 * The one statement text that sends the hints of some workspaces.
 *
 * Each identifier passed `markedWorkspaces`, so it is written as a literal. A
 * text with no parameters runs as one simple query, and so the begin, the
 * setting, the notifications and the commit take one round trip.
 */
export function hintStatement(workspaceIds: readonly string[]): string {
  const hints = workspaceIds
    .filter((id) => uuidPattern.test(id))
    .map((id) => `('w:${id}')`)
    .join(', ');
  return [
    'begin',
    'set local synchronous_commit to off',
    `select pg_notify('${syncHintChannel}', hint) from (values ${hints}) as hints (hint)`,
    'commit',
  ].join('; ');
}

/** The mark of a result of the commit statement, read without trusting it. */
function markOf(answer: unknown): unknown {
  const first: unknown = Array.isArray(answer) ? answer[0] : answer;
  if (first === null || typeof first !== 'object') return undefined;
  const rows: unknown = Reflect.get(first, 'rows');
  if (!Array.isArray(rows)) return undefined;
  const row: unknown = rows[0];
  if (row === null || typeof row !== 'object') return undefined;
  return Reflect.get(row, 'mark');
}

/**
 * Commits the open transaction of one connection, then sends its hints.
 *
 * The commit is what the caller waits for, and a failure of it throws as
 * before. The send runs after it, and its failure is swallowed: the save is
 * durable, and the reconcile and the poll read the feed without the hint.
 */
export async function commitWithHints(client: pg.PoolClient): Promise<void> {
  const answer: unknown = await client.query(
    `select current_setting('${syncHintsSetting}', true) as mark; commit`,
  );
  const workspaceIds = markedWorkspaces(markOf(answer));
  if (workspaceIds.length === 0) return;
  try {
    await client.query(hintStatement(workspaceIds));
  } catch {
    try {
      await client.query('rollback');
    } catch {
      // The connection is gone. The hint is lost, and the save is not.
    }
  }
}
