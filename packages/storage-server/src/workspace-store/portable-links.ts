/** Accepted path link indexing and atomic move rewrites. */
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  type AcceptedInput,
  type DocumentService,
  type StoredRevisionInput,
  fail,
  ok,
  type Result,
} from '@notesapp/core';
import { extractLinks, rewriteRelativeReferences } from '@notesapp/markdown';
import {
  contents,
  files,
  noteDocuments,
  noteLinks,
  revisions,
  searchIndex,
} from '../schema.ts';

function markdownDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function tips(input: AcceptedInput): ReadonlyMap<string, StoredRevisionInput> {
  const result = new Map<string, StoredRevisionInput>();
  for (const revision of input.revisions) result.set(revision.fileId, revision);
  return result;
}

function noteTitle(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.endsWith('.md') ? name.slice(0, -'.md'.length) : name;
}

/** Replaces search and link rows for every accepted head in one write. */
export async function updateAcceptedIndexes(
  db: NodePgDatabase,
  workspaceId: string,
  acceptedHeads: ReadonlyMap<string, StoredRevisionInput>,
): Promise<void> {
  const fileIds = [...acceptedHeads.keys()];
  if (fileIds.length === 0) return;
  await db
    .delete(searchIndex)
    .where(
      and(
        eq(searchIndex.workspaceId, workspaceId),
        inArray(searchIndex.fileId, fileIds),
      ),
    );
  await db
    .delete(noteLinks)
    .where(
      and(
        eq(noteLinks.workspaceId, workspaceId),
        inArray(noteLinks.sourceFileId, fileIds),
      ),
    );
  const searchable = [...acceptedHeads.values()].filter(
    (tip) => !tip.deleted && tip.content.kind === 'markdown',
  );
  if (searchable.length === 0) return;
  // One parse of each note. `extractLinks` parses under the limits of the
  // one grammar, so a note that the renderer refuses fails here, before any
  // row is written, and no second parse repeats the check (issue 207).
  const linked = searchable.map((tip) => {
    const text = tip.content.kind === 'markdown' ? tip.content.text : '';
    const targets = new Set(
      extractLinks(text, tip.path).flatMap((link) =>
        link.targetPath === null ? [] : [link.targetPath],
      ),
    );
    return { tip, text, targets };
  });
  await db.insert(searchIndex).values(
    linked.map(({ tip, text }) => ({
      workspaceId,
      fileId: tip.fileId,
      revisionId: tip.id,
      path: tip.path,
      title: noteTitle(tip.path),
      body: text,
    })),
  );
  const links = linked.flatMap(({ tip, targets }) =>
    [...targets].map((targetPath) => ({
      workspaceId,
      sourceFileId: tip.fileId,
      sourceRevisionId: tip.id,
      sourcePath: tip.path,
      targetPath,
    })),
  );
  if (links.length > 0) await db.insert(noteLinks).values(links);
}

/** Adds note revisions that keep portable links live after a path move. */
export async function expandMovedReferences(
  db: NodePgDatabase,
  workspaceId: string,
  input: AcceptedInput,
  service: DocumentService,
): Promise<Result<AcceptedInput>> {
  const submittedTips = tips(input);
  const submittedIds = [...submittedTips.keys()];
  const current = await db
    .select({
      fileId: files.id,
      path: files.path,
      headRevisionId: files.headRevisionId,
      kind: files.kind,
      deleted: files.deleted,
    })
    .from(files)
    .where(
      and(eq(files.workspaceId, workspaceId), inArray(files.id, submittedIds)),
    );
  const currentById = new Map(current.map((row) => [row.fileId, row]));
  const movedPaths = new Map<string, string>();
  for (const [fileId, tip] of submittedTips) {
    const before = currentById.get(fileId);
    if (
      before !== undefined &&
      !before.deleted &&
      !tip.deleted &&
      before.path !== tip.path
    )
      movedPaths.set(before.path, tip.path);
  }
  if (movedPaths.size === 0) return ok(input);
  const inboundRows = await db
    .select({ sourceFileId: noteLinks.sourceFileId })
    .from(noteLinks)
    .where(
      and(
        eq(noteLinks.workspaceId, workspaceId),
        inArray(noteLinks.targetPath, [...movedPaths.keys()]),
      ),
    );
  const sourceIds = new Set(inboundRows.map((row) => row.sourceFileId));
  const sourceRows =
    sourceIds.size === 0
      ? []
      : await db
          .select({
            fileId: files.id,
            path: files.path,
            headRevisionId: files.headRevisionId,
            text: contents.markdown,
          })
          .from(files)
          .innerJoin(
            revisions,
            and(
              eq(revisions.workspaceId, files.workspaceId),
              eq(revisions.id, files.headRevisionId),
            ),
          )
          .innerJoin(
            contents,
            and(
              eq(contents.workspaceId, revisions.workspaceId),
              eq(contents.digest, revisions.contentDigest),
            ),
          )
          .where(
            and(
              eq(files.workspaceId, workspaceId),
              eq(files.deleted, false),
              eq(files.kind, 'note'),
              inArray(files.id, [...sourceIds]),
            ),
          );
  const rewritten: StoredRevisionInput[] = [];
  // The documents that this changeset writes, by file. A rewrite edits the
  // document that the changeset already accepted, so the two never disagree.
  const documents = new Map<
    string,
    AcceptedInput['documents'][number] & { readonly vectorBefore: Uint8Array }
  >(
    input.documents.map((document) => [
      document.fileId,
      { ...document, vectorBefore: service.stateVector(document.bytes) },
    ]),
  );
  for (const revision of input.revisions) {
    if (submittedTips.get(revision.fileId)?.id !== revision.id) {
      rewritten.push(revision);
      continue;
    }
    if (revision.content.kind !== 'markdown') {
      rewritten.push(revision);
      continue;
    }
    const sourcePath = currentById.get(revision.fileId)?.path ?? revision.path;
    const changed = rewriteRelativeReferences(
      revision.content.text,
      sourcePath,
      movedPaths,
    );
    if (changed.count === 0) {
      rewritten.push(revision);
      continue;
    }
    // The rewrite is a document edit, so the note keeps its identities and
    // every device merges it like any other work (record 0083).
    const current = documents.get(revision.fileId);
    if (current === undefined) {
      rewritten.push(revision);
      continue;
    }
    const edited = service.replaceText(current.bytes, changed.text);
    if (!edited.ok) return edited;
    documents.set(revision.fileId, {
      ...current,
      bytes: edited.value.bytes,
      state: edited.value.state,
      update: service.delta(edited.value.bytes, current.vectorBefore),
      vector: service.stateVector(edited.value.bytes),
    });
    rewritten.push({
      ...revision,
      content: {
        kind: 'markdown',
        digest: markdownDigest(changed.text),
        text: changed.text,
      },
    });
  }
  const expectedHeads: Record<string, string | null> = {
    ...input.expectedHeads,
  };
  for (const source of sourceRows) {
    if (
      submittedTips.has(source.fileId) ||
      source.headRevisionId === null ||
      source.text === null
    )
      continue;
    const changed = rewriteRelativeReferences(
      source.text,
      source.path,
      movedPaths,
    );
    if (changed.count === 0) continue;
    const stored = await readDocument(db, workspaceId, source.fileId);
    if (stored === null) continue;
    const edited = service.replaceText(stored.bytes, changed.text);
    if (!edited.ok) return edited;
    expectedHeads[source.fileId] = source.headRevisionId;
    documents.set(source.fileId, {
      vectorBefore: service.stateVector(stored.bytes),
      fileId: source.fileId,
      bytes: edited.value.bytes,
      epoch: stored.epoch,
      state: edited.value.state,
      merged: false,
      update: service.delta(
        edited.value.bytes,
        service.stateVector(stored.bytes),
      ),
      vector: service.stateVector(edited.value.bytes),
    });
    rewritten.push({
      id: randomUUID(),
      fileId: source.fileId,
      parents: [source.headRevisionId],
      path: source.path,
      deleted: false,
      content: {
        kind: 'markdown',
        digest: markdownDigest(changed.text),
        text: changed.text,
      },
      clientTime: new Date().toISOString(),
      message: 'Keep links after move.',
      restoredFrom: null,
    });
  }
  const fileIds = [...new Set(rewritten.map((revision) => revision.fileId))];
  if (fileIds.length > 1000) return fail('invalid_graph', fileIds);
  return ok({
    ...input,
    expectedHeads,
    revisions: rewritten,
    documents: [...documents.values()].map(
      ({ vectorBefore: _vectorBefore, ...document }) => document,
    ),
  });
}

/** The stored document of one note, or null when it has none yet. */
async function readDocument(
  db: NodePgDatabase,
  workspaceId: string,
  fileId: string,
): Promise<{ bytes: Uint8Array; epoch: number } | null> {
  const rows = await db
    .select({ bytes: noteDocuments.bytes, epoch: noteDocuments.epoch })
    .from(noteDocuments)
    .where(
      and(
        eq(noteDocuments.workspaceId, workspaceId),
        eq(noteDocuments.fileId, fileId),
      ),
    );
  return rows[0] ?? null;
}
