/**
 * Creating a note without loading the editor implementation.
 *
 * A new note starts as an empty draft in the store, and its create waits in
 * the queue at once, so it reaches the server with no edit (record 0104). The
 * router then opens the editor with the handoff state. The rules of the draft
 * itself live in `new-note-draft.ts`.
 *
 * This module holds the hook and no button. The one action of a screen sits in
 * the screen and appears once (decision 0062), so the note list renders its own
 * primary button and the sidebar renders a row.
 */
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { generateUUID } from '@notesapp/core';
import {
  createNote,
  isLocalStorageError,
  type LocalStore,
} from '@notesapp/sync';
import {
  freeNotePath,
  newNoteDraft,
  newNoteTemplateText,
} from '../../lib/new-note-draft.ts';
import { displayNoteName } from '../../lib/note-name.ts';

/** Creates one empty note and opens it. */
export function useCreateNote(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string,
): {
  /** Creates the note in the named folder, or at the root for an empty name. */
  readonly create: (folder?: string, template?: string) => void;
  readonly error: string | null;
} {
  const navigate = useNavigate();
  const creating = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    (folder = '', template?: string): void => {
      if (creating.current) return;
      if (store === null || accountId === null) {
        setError('Local storage is unavailable, so a note cannot be made.');
        return;
      }
      creating.current = true;
      void (async (): Promise<void> => {
        try {
          // The name avoids every path that the server holds or may hold, so
          // a note whose new name is unsent or parked keeps its old one
          // (record 0184).
          let taken: readonly string[] = [];
          try {
            const held = await store.listHeldPaths(accountId, workspaceId);
            taken = held.map((entry) => entry.path);
          } catch {
            taken = [];
          }
          const path = freeNotePath(taken, folder);
          const fileId = generateUUID();
          const draft = newNoteDraft({
            accountId,
            workspaceId,
            path,
            ids: { fileId, workingCopyId: generateUUID() },
            text: newNoteTemplateText(template, path, new Date()),
          });
          try {
            await createNote(store, draft);
          } catch (failure: unknown) {
            setError(
              isLocalStorageError(failure) && failure.kind === 'quota'
                ? 'This device is full, so the note was not made. Free space and try again.'
                : 'The note could not be made on this device.',
            );
            return;
          }
          setError(null);
          await navigate(`/w/${workspaceId}/notes/${fileId}`, {
            state: { focusNoteText: true, noteName: displayNoteName(path) },
          });
        } finally {
          creating.current = false;
        }
      })();
    },
    [store, accountId, workspaceId, navigate],
  );

  return { create, error };
}
