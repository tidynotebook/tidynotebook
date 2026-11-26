import { createFile, getFile, listFiles } from '@notesapp/api-client';
import { generateUUID } from '@notesapp/core';
import { base64, type Draft } from '@notesapp/sync';
import { observeDocument, startDocument } from '@notesapp/storage-browser';
import { freeNamedPath } from './new-note-draft.ts';
import { problemCode } from './problem-text.ts';

export async function persistRecoveredNote(
  draft: Draft,
  folder: string,
  name: string,
  heldPaths: readonly string[],
): Promise<string> {
  const scope = { workspaceId: draft.workspaceId };
  const path = { ...scope, fileId: draft.fileId };
  const existing = await getFile({ path });
  if (existing.data !== undefined) return existing.data.path;
  if (existing.response?.status !== 404)
    throw new Error('The recovered note could not be checked.');

  const taken = new Set(heldPaths);
  let cursor: string | undefined;
  do {
    const page = await listFiles({
      path: scope,
      query: { limit: 500, ...(cursor === undefined ? {} : { cursor }) },
    });
    if (page.data === undefined)
      throw new Error('The destination could not be read.');
    for (const file of page.data.files) taken.add(file.path);
    cursor = page.data.nextCursor ?? undefined;
  } while (cursor !== undefined);

  const document = {
    epoch: 1,
    observed: base64(observeDocument(startDocument(''))),
    update: base64(startDocument(draft.text)),
  };
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = freeNamedPath([...taken], folder, name);
    const result = await createFile({
      path: scope,
      body: {
        fileId: draft.fileId,
        path: candidate,
        revisionId: generateUUID(),
        mutationId: generateUUID(),
        deviceId: draft.workingCopyId,
        document,
      },
    });
    if (result.data !== undefined) return candidate;
    // A lost answer or another tab may already have saved this identity.
    const saved = await getFile({ path });
    if (saved.data !== undefined) return saved.data.path;
    if (problemCode(result.error) !== 'path_conflict')
      throw new Error('The recovered note could not be saved.');
    taken.add(candidate);
  }
  throw new Error('A free path for the recovered note could not be found.');
}
