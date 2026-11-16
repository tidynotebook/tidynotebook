/**
 * What a new note is, as data.
 *
 * A new note is empty, because the one welcome note of an installation is
 * written by the server during setup. A daily note or a note from a template
 * starts with text that its member chose. These rules are pure, so the name
 * choice and the starting text can be
 * tested without a browser and without a store.
 */
import { fillTemplate } from '@notesapp/core';
import { templateContextAt } from './templates.ts';
import type { Draft } from '@notesapp/sync';
import {
  baseNameOf,
  displayNoteName,
  joinNotePath,
  storageNotePath,
} from './note-name.ts';

/** The identifiers that the caller draws for one new note. */
export type NewNoteIds = {
  readonly fileId: string;
  readonly workingCopyId: string;
};

/**
 * The first free path of a name inside one folder: the name itself, then the
 * name with 2, 3 and so on after it. Two paths that differ only in case are
 * one name, as the workspace treats them. New note, Duplicate and the name
 * a heading gives (record 0163) all take a free name this way.
 */
export function freeNamedPath(
  takenPaths: readonly string[],
  folder: string,
  name: string,
): string {
  const taken = new Set(takenPaths.map((path) => path.toLowerCase()));
  const at = (candidate: string): string =>
    joinNotePath(folder, storageNotePath(candidate));
  if (!taken.has(at(name).toLowerCase())) return at(name);
  let index = 2;
  while (taken.has(at(`${name} ${String(index)}`).toLowerCase())) index += 1;
  return at(`${name} ${String(index)}`);
}

/**
 * Picks a free name for a new note inside one folder.
 *
 * The person is not asked first: the note opens with its name field ready,
 * so a name is chosen by typing over this one.
 */
export function freeNotePath(
  takenPaths: readonly string[],
  folder: string,
): string {
  return freeNamedPath(takenPaths, folder, 'New note');
}

/** Picks a free name for the copy of a note beside it, `Plan copy` first. */
export function freeCopyPath(
  takenPaths: readonly string[],
  folder: string,
  baseName: string,
): string {
  return freeNamedPath(takenPaths, folder, `${baseName} copy`);
}

/**
 * The local draft of one new note.
 *
 * The text is empty unless the caller supplies a chosen template.
 */
export function newNoteDraft(input: {
  readonly accountId: string;
  readonly workspaceId: string;
  readonly path: string;
  readonly ids: NewNoteIds;
  readonly text?: string | undefined;
}): Draft {
  return {
    accountId: input.accountId,
    workspaceId: input.workspaceId,
    workingCopyId: input.ids.workingCopyId,
    fileId: input.ids.fileId,
    baseRevisionId: null,
    // A new note is empty. The welcome note of a first run is a server seed.
    text: input.text ?? '',
    path: input.path,
    deleted: false,
    sequence: 1,
  };
}

/** Fill only a template the person chose, using the new note's actual name. */
export function newNoteTemplateText(
  template: string | undefined,
  path: string,
  instant: Date,
): string {
  return template === undefined
    ? ''
    : fillTemplate(
        template,
        templateContextAt(instant, displayNoteName(baseNameOf(path))),
      );
}
