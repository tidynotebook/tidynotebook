import type pg from 'pg';
import {
  fail,
  ok,
  type Actor,
  type AcceptedInput,
  type Result,
} from '@notesapp/core';
import { updateActors } from '@notesapp/note-document';

export async function writeContributors(
  client: pg.PoolClient,
  workspaceId: string,
  actor: Actor,
  input: AcceptedInput,
): Promise<Result<void>> {
  for (const revision of input.revisions) {
    const document = input.documents.find(
      (item) => item.fileId === revision.fileId,
    );
    const contributors = new Set<string>();
    if (document !== undefined) {
      const { clientIds, deletes } = updateActors(document.update);
      if (deletes) contributors.add(actor.accountId);
      const bindings =
        clientIds.length === 0
          ? []
          : (
              await client.query<{
                client_id: string;
                account_id: string;
                can_write: boolean;
              }>(
                `select client_id, account_id, can_write from note_client_bindings
        where workspace_id = $1 and file_id = $2 and epoch = $3 and client_id = any($4::bigint[])`,
                [workspaceId, revision.fileId, document.epoch, clientIds],
              )
            ).rows;
      const byClient = new Map(
        bindings.map((binding) => [Number(binding.client_id), binding]),
      );
      if (bindings.some((binding) => !binding.can_write))
        return fail('invalid_content', [revision.fileId]);
      const unbound = clientIds.filter((id) => !byClient.has(id));
      if (unbound.length > 0) {
        await client.query(
          `insert into note_client_bindings (workspace_id, file_id, epoch, client_id, account_id, can_write)
          select $1, $2, $3, ids.client_id, $4, true from unnest($5::bigint[]) ids(client_id)
          on conflict do nothing`,
          [
            workspaceId,
            revision.fileId,
            document.epoch,
            actor.accountId,
            unbound,
          ],
        );
      }
      for (const id of clientIds)
        contributors.add(byClient.get(id)?.account_id ?? actor.accountId);
    }
    if (contributors.size === 0) contributors.add(actor.accountId);
    await client.query(
      `insert into revision_contributors (workspace_id, revision_id, account_id)
      select $1, $2, ids.account_id from unnest($3::uuid[]) ids(account_id)`,
      [workspaceId, revision.id, [...contributors]],
    );
  }

  return ok(undefined);
}
