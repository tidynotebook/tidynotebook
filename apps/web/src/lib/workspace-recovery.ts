import { createWorkspace, type Workspace } from '@notesapp/api-client';
import { contentDigest } from '@notesapp/core';
import { createNote, type LocalStore } from '@notesapp/sync';
import { freeNamedPath, newNoteDraft } from './new-note-draft.ts';
import { baseNameOf, cleanNoteBaseName } from './note-name.ts';

const pending = new Map<string, Promise<string | null>>();
const flushes = new Map<string, Set<() => Promise<void>>>();

export function registerAccessFlush(
  workspaceId: string,
  flush: () => Promise<void>,
): () => void {
  const registered = flushes.get(workspaceId) ?? new Set();
  registered.add(flush);
  flushes.set(workspaceId, registered);
  return () => {
    registered.delete(flush);
    if (registered.size === 0) flushes.delete(workspaceId);
  };
}

async function recoveryId(value: string): Promise<string> {
  const digest = await contentDigest(value);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function recoverWorkspaceAccess(
  store: LocalStore,
  accountId: string,
  old: Workspace,
  remaining: readonly Workspace[],
  removed: boolean,
): Promise<string | null> {
  const scope = `${accountId}:${old.workspaceId}`;
  const running = pending.get(scope);
  if (running !== undefined) return running;
  async function recover(): Promise<string | null> {
    await Promise.all(
      [...(flushes.get(old.workspaceId) ?? [])].map((flush) => flush()),
    );
    let destination =
      remaining.find((space) => space.personal && space.role !== 'viewer') ??
      remaining.find((space) => space.role !== 'viewer');
    const accessNotice = removed
      ? `You no longer have access to ${old.name}.`
      : null;
    let notice = accessNotice;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const copies = await store.workspaceAccessCopies(
        accountId,
        old.workspaceId,
      );
      if (copies.length > 0 && destination === undefined) {
        const created = await createWorkspace({ body: { name: 'Personal' } });
        if (created.data === undefined)
          throw new Error('No workspace can hold the recovered text.');
        destination = created.data;
      }
      if (destination !== undefined && copies.length > 0) {
        const workspaceId = destination.workspaceId;
        const folder = `From ${cleanNoteBaseName(old.name)}`;
        const known = new Set(
          (await store.listLocalFiles(accountId, workspaceId)).map(
            (file) => file.fileId,
          ),
        );
        const paths = (await store.listHeldPaths(accountId, workspaceId)).map(
          (file) => file.path,
        );
        for (const copy of copies) {
          const fileId = await recoveryId(
            JSON.stringify([scope, copy.identity, copy.path, copy.text]),
          );
          if (known.has(fileId)) continue;
          const name = cleanNoteBaseName(
            baseNameOf(copy.path).replace(/\.md$/iu, ''),
          );
          const path = freeNamedPath(paths, folder, name);
          await createNote(
            store,
            newNoteDraft({
              accountId,
              workspaceId,
              path,
              text: copy.text,
              ids: { fileId, workingCopyId: fileId },
            }),
          );
          known.add(fileId);
          paths.push(path);
        }
        const saved = `Your unsent text is in ${destination.name}, in the folder ${folder}.`;
        notice = accessNotice === null ? saved : `${accessNotice} ${saved}`;
      }
      if (
        await store.clearWorkspaceAccess(
          accountId,
          old.workspaceId,
          copies,
          removed,
        )
      )
        return notice;
    }
    throw new Error('The local copy changed during recovery.');
  }
  const next = (
    typeof navigator.locks === 'undefined'
      ? recover()
      : navigator.locks.request(`notesapp:workspace-access:${scope}`, recover)
  ).finally(() => {
    pending.delete(scope);
  });
  pending.set(scope, next);
  return next;
}
