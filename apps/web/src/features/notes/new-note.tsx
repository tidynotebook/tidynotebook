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
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { generateUUID } from '@notesapp/core';
import {
  createNote,
  isLocalStorageError,
  type LocalStore,
} from '@notesapp/sync';
import {
  freeNamedPath,
  freeNotePath,
  newNoteDraft,
  newNoteTemplateText,
} from '../../lib/new-note-draft.ts';
import { cleanNoteBaseName, displayNoteName } from '../../lib/note-name.ts';

type CreationScope = { readonly workspaceId: string; active: boolean };

/** Creates one empty note and opens it. */
export function useCreateNote(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string,
  onError?: (message: string | null) => void,
  onCreationStart?: () => (message: string | null) => boolean | void,
): {
  /**
   * Creates the note in the named folder, or at the root for an empty name.
   * A chosen name is made free in the folder; with none, "New note" is.
   */
  readonly create: (folder?: string, template?: string, name?: string) => void;
  readonly error: string | null;
} {
  const navigate = useNavigate();
  const currentScope = useRef<CreationScope | null>(null);
  const creating = useRef<{ readonly scope: CreationScope } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    const scope: CreationScope = { workspaceId, active: true };
    currentScope.current = scope;
    setError(null);
    return () => {
      scope.active = false;
      if (currentScope.current === scope) currentScope.current = null;
    };
  }, [store, accountId, workspaceId]);

  const create = useCallback(
    (folder = '', template?: string, name?: string): void => {
      const scope = currentScope.current;
      if (scope === null || !scope.active || scope.workspaceId !== workspaceId)
        return;
      if (creating.current?.scope === scope) return;
      const attempt = { scope };
      creating.current = attempt;
      const isCurrent = (): boolean =>
        scope.active &&
        currentScope.current === scope &&
        creating.current === attempt;
      // The surviving owner assigns order when work starts, so an older
      // completion cannot replace the result of a newer creator instance.
      const completed = onCreationStart?.();
      const report = (message: string | null): boolean => {
        let accepted = true;
        if (completed === undefined) onError?.(message);
        else accepted = completed(message) !== false;
        if (accepted && isCurrent()) setError(message);
        return accepted;
      };
      if (store === null || accountId === null) {
        report('Local storage is unavailable, so a note cannot be made.');
        if (creating.current === attempt) creating.current = null;
        return;
      }
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
          // A name that became taken since the dialog checked it is made
          // free, so the note is never lost to a clash.
          const path =
            name === undefined
              ? freeNotePath(taken, folder)
              : freeNamedPath(taken, folder, cleanNoteBaseName(name));
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
            report(
              isLocalStorageError(failure) && failure.kind === 'quota'
                ? 'This device is full, so the note was not made. Free space and try again.'
                : 'The note could not be made on this device.',
            );
            return;
          }
          if (!report(null) || !isCurrent()) return;
          await navigate(`/w/${workspaceId}/notes/${fileId}`, {
            state: { focusNoteText: true, noteName: displayNoteName(path) },
          });
        } finally {
          if (creating.current === attempt) creating.current = null;
        }
      })();
    },
    [store, accountId, workspaceId, navigate, onError, onCreationStart],
  );

  return { create, error };
}
