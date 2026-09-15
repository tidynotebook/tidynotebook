/**
 * Pure rules for the folder that receives a new item.
 *
 * One selected folder is the parent of New note and of New folder (record
 * 0029). The selection follows the note that is open, so a create action puts
 * its result next to the note a person is reading (record 0034), and the tree
 * marks that folder so the parent is never a guess.
 */

import { folderOf, folderPaths, joinNotePath } from './note-name.ts';

/** Every folder that a note or an empty folder makes visible in the tree. */
export function knownFolderPaths(
  notePaths: readonly string[],
  emptyFolders: readonly string[],
): readonly string[] {
  const emptyFolderLeaves = emptyFolders.map((folder) =>
    joinNotePath(folder, 'empty.md'),
  );
  return folderPaths([...notePaths, ...emptyFolderLeaves]);
}

/** Keeps a selected folder only while the tree still contains it. */
export function selectedFolderOrRoot(
  selected: string,
  folders: readonly string[],
): string {
  return selected === '' || folders.includes(selected) ? selected : '';
}

/** Joins one direct child name to its selected parent. */
export function childFolderPath(parent: string, child: string): string {
  return joinNotePath(parent, child);
}

/**
 * The create parent after the open note changed.
 *
 * A person who opens a note is working in the folder of that note, so that
 * folder becomes the parent of the next New note and New folder. The person
 * can still select any other folder afterwards; the next note they open moves
 * the selection again. When no note is open the selection stays where the
 * person put it.
 */
export function selectionForOpenNote(
  selected: string,
  openNotePath: string | null,
): string {
  if (openNotePath === null) return selected;
  return folderOf(openNotePath);
}
