/**
 * The owner side of published links, and the retention run.
 *
 * The reader path of `publications-repository.ts` reads and never writes,
 * which is refusal 3 of decision 0031. The owner path is the other side: it
 * runs inside the workspace transaction of `transaction.ts`, so it holds a
 * verified `Actor`, it takes the workspace lock, and the row policies bind
 * every statement to the account of that actor.
 *
 * Two rules of decision 0030 live here.
 *
 * - **The count and the insert are one transaction.** The lock of the unit of
 *   work orders them, so two creates at one instant cannot both read the same
 *   count and both pass the limit. The count reads the open links only, so a
 *   revocation frees its place at once, which is what the refusal of the
 *   limit tells the owner to do. `planPublishedLink` of `packages/core` is
 *   the rule that decides, and the row that this file writes carries the scope
 *   that the rule answered, never the scope that the caller sent.
 * - **A stored secret is a digest.** The caller hands over the digest of the
 *   token, and a value of another shape is a defect of the adapter rather than
 *   a refusal of the owner, so this file throws on one. No answer here carries
 *   a digest of any kind.
 */
import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import {
  OperationalError,
  fail,
  ok,
  planPublishedLink,
  type Actor,
  type PublicationScope,
  type PublishedLink,
  type Result,
} from '@notesapp/core';
import { files, publications } from '../schema.ts';
import { isUuid } from './errors.ts';
import { isSecretDigest, storedScope } from './publication-row.ts';

/**
 * One link as its owner reads it: the domain record, and whether an
 * administrator took it down after a report (record 0119).
 */
export type OwnedPublishedLink = PublishedLink & {
  readonly takenDown: boolean;
};

/** What the owner path stores for one new link. */
export type PublishedLinkDraft = {
  /** The digest of the opaque token. The token itself reaches no server file. */
  readonly tokenDigest: string;
  readonly scope: PublicationScope;
  /** The slow salted hash of the password, or `null` for an open link. */
  readonly passwordDigest: string | null;
  /** The instant at which the link stops opening, or `null`. */
  readonly expiresAt: string | null;
};

/** The links of one workspace, as their owner changes them. */
export type PublicationOwner = {
  /** Writes one more link, or refuses the request as the rule decided. */
  create(draft: PublishedLinkDraft): Promise<Result<OwnedPublishedLink>>;
  /**
   * Every open link of this workspace, newest first, and no digest of any.
   *
   * A revoked link is not a link of this workspace any more. It opens
   * nothing from the instant of the revocation, and the retention run takes
   * its row away, so the list of the owner drops it at once: the screen
   * answers what is open right now (decision 0048) and it has no words for a
   * link that is not. A link that reached its expiry stays, because the
   * screen does say that one stopped and the owner can revoke it. A link that
   * an administrator took down stays too, marked, until the retention run
   * takes it away after 30 days, so the owner learns why it stopped (record
   * 0123).
   */
  list(): Promise<readonly OwnedPublishedLink[]>;
  /** Stops one link at `at`. A link that is already revoked keeps its instant. */
  revoke(publicationId: string, at: Date): Promise<Result<OwnedPublishedLink>>;
};

/** How many links one answer of the owner list holds at most. */
const maxListedLinks = 500;

/** The columns of a link that an answer may carry. */
const linkColumns = {
  publicationId: publications.id,
  workspaceId: publications.workspaceId,
  scopeKind: publications.scopeKind,
  scopeFileId: publications.scopeFileId,
  scopePath: publications.scopePath,
  createdAt: publications.createdAt,
  expiresAt: publications.expiresAt,
  revokedAt: publications.revokedAt,
  takenDownAt: publications.takenDownAt,
  passwordDigest: publications.passwordDigest,
};

/** One stored row as the domain record, with no digest in it. */
function ownedLink(row: {
  publicationId: string;
  workspaceId: string;
  scopeKind: string;
  scopeFileId: string | null;
  scopePath: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  takenDownAt: Date | null;
  passwordDigest: string | null;
}): OwnedPublishedLink {
  return {
    publicationId: row.publicationId,
    workspaceId: row.workspaceId,
    scope: storedScope(row.scopeKind, row.scopeFileId, row.scopePath),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    passwordProtected: row.passwordDigest !== null,
    takenDown: row.takenDownAt !== null,
  };
}

/** Reads the expiry that the owner asked for. */
function expiryInstant(value: string | null): Date | null {
  if (value === null) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new OperationalError(
      'unexpected',
      'notesapp: the expiry of a published link is not an instant; the transport must validate it.',
    );
  }
  return instant;
}

/** Builds the owner side of published links over one open transaction. */
export function publicationsOwnerRepository(
  _client: pg.PoolClient,
  db: NodePgDatabase,
  actor: Actor,
  workspaceId: string,
): PublicationOwner {
  /** Whether this workspace holds one live note of this identifier. */
  const holdsNote = async (fileId: string): Promise<boolean> => {
    if (!isUuid(fileId)) return false;
    const rows = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.workspaceId, workspaceId),
          eq(files.id, fileId),
          eq(files.kind, 'note'),
          eq(files.deleted, false),
          isNotNull(files.headRevisionId),
        ),
      )
      .limit(1);
    return rows.length === 1;
  };

  /** One link of this workspace by its identifier. */
  const linkById = async (
    publicationId: string,
  ): Promise<OwnedPublishedLink | null> => {
    const rows = await db
      .select(linkColumns)
      .from(publications)
      .where(
        and(
          eq(publications.workspaceId, workspaceId),
          eq(publications.id, publicationId),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : ownedLink(row);
  };

  return {
    async create(
      draft: PublishedLinkDraft,
    ): Promise<Result<OwnedPublishedLink>> {
      if (!isSecretDigest(draft.tokenDigest)) {
        throw new OperationalError(
          'unexpected',
          'notesapp: a published link stores the digest of its token and never the token.',
        );
      }
      const expiresAt = expiryInstant(draft.expiresAt);
      const counted = await db
        .select({ value: count() })
        .from(publications)
        .where(
          and(
            eq(publications.workspaceId, workspaceId),
            isNull(publications.revokedAt),
          ),
        );
      const plan = planPublishedLink({
        scope: draft.scope,
        currentLinkCount: counted[0]?.value ?? 0,
      });
      if (!plan.ok) return plan;
      const scope = plan.value;
      // A link over a note that the workspace does not hold would open
      // nothing, so the owner learns now rather than after a reader fails.
      if (scope.kind === 'note' && !(await holdsNote(scope.fileId)))
        return fail('not_found', [scope.fileId]);
      const rows = await db
        .insert(publications)
        .values({
          workspaceId,
          id: randomUUID(),
          ownerAccountId: actor.accountId,
          tokenDigest: draft.tokenDigest,
          scopeKind: scope.kind,
          scopeFileId: scope.kind === 'note' ? scope.fileId : null,
          scopePath: scope.kind === 'folder' ? scope.path : null,
          passwordDigest: draft.passwordDigest,
          expiresAt,
        })
        .returning(linkColumns);
      const row = rows[0];
      if (row === undefined) {
        throw new OperationalError(
          'unexpected',
          'notesapp: the published link was not written.',
        );
      }
      return ok(ownedLink(row));
    },

    async list(): Promise<readonly OwnedPublishedLink[]> {
      const rows = await db
        .select(linkColumns)
        .from(publications)
        .where(
          and(
            eq(publications.workspaceId, workspaceId),
            or(
              isNull(publications.revokedAt),
              isNotNull(publications.takenDownAt),
            ),
          ),
        )
        .orderBy(desc(publications.createdAt), desc(publications.id))
        .limit(maxListedLinks);
      return rows.map(ownedLink);
    },

    async revoke(
      publicationId: string,
      at: Date,
    ): Promise<Result<OwnedPublishedLink>> {
      if (!isUuid(publicationId)) return fail('not_found');
      const rows = await db
        .update(publications)
        .set({ revokedAt: at })
        .where(
          and(
            eq(publications.workspaceId, workspaceId),
            eq(publications.id, publicationId),
            isNull(publications.revokedAt),
          ),
        )
        .returning(linkColumns);
      const row = rows[0];
      if (row !== undefined) return ok(ownedLink(row));
      // The link is already revoked, or it is not a link of this workspace.
      const existing = await linkById(publicationId);
      return existing === null ? fail('not_found') : ok(existing);
    },
  };
}

/** How many links and tickets one retention run removed. */
export type PublicationCleanupResult = {
  readonly expiredLinks: number;
  readonly expiredTickets: number;
};

/**
 * Removes every link that stopped and every ticket that expired.
 *
 * The run carries no membership and the runtime role holds no DELETE right on
 * either table, so the work is the SECURITY DEFINER function of the migration,
 * as the sync retention already is. Each statement of that function reads an
 * index, so a run never reads a live link.
 */
export async function runPublicationCleanup(
  client: pg.PoolClient,
  cutoff: Date,
): Promise<PublicationCleanupResult> {
  const result = await client.query<{
    expired_links: string;
    expired_tickets: string;
  }>('select * from public.notesapp_cleanup_publications($1)', [cutoff]);
  const row = result.rows[0];
  return {
    expiredLinks: Number(row?.expired_links ?? '0'),
    expiredTickets: Number(row?.expired_tickets ?? '0'),
  };
}
