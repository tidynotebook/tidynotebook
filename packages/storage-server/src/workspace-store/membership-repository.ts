/**
 * The membership repository: the actor's role in the open workspace.
 *
 * It reads the membership row inside the workspace transaction.
 */
import { and, eq } from 'drizzle-orm';
import type { Role, WorkspaceTransaction } from '@notesapp/core';
import { memberships } from '../schema.ts';
import { assertUuid } from './errors.ts';
import type { RepositoryContext } from './context.ts';

/** Builds the membership slice of the port over one open transaction. */
export function membershipRepository(
  context: RepositoryContext,
): Pick<WorkspaceTransaction, 'role'> {
  const { db, workspaceId } = context;
  return {
    async role(accountId: string): Promise<Role | null> {
      assertUuid(accountId, 'the account');
      const rows = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.accountId, accountId),
          ),
        );
      return rows[0]?.role ?? null;
    },
  };
}
