/**
 * The rows of the folder tree picker, as data (issue 517, item 4).
 *
 * Every folder choice of the application reads the same tree as the sidebar:
 * a root row for no folder, then each folder under its parent with a twisty
 * and an indent. The rules here are pure, so `folder-tree.test.ts` states the
 * rows, the keys and the filter without a browser.
 */
import { folderOf } from './note-name.ts';

/** One visible row of the picker. The root row has the empty path. */
export type FolderTreeRow = {
  readonly path: string;
  readonly name: string;
  /** The level of the row, 1 for the root row and for each top folder. */
  readonly level: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  /** The row cannot be chosen, such as a folder that moves into itself. */
  readonly disabled: boolean;
};

/** The parents of a folder path, nearest last, without the root. */
export function folderAncestors(path: string): readonly string[] {
  const parents: string[] = [];
  for (let parent = folderOf(path); parent !== ''; parent = folderOf(parent))
    parents.unshift(parent);
  return parents;
}

/**
 * The folders that are open when the picker opens: the chosen folder and its
 * parents, so the choice and its children are in view.
 */
export function initiallyExpanded(path: string): ReadonlySet<string> {
  return new Set(path === '' ? [] : [...folderAncestors(path), path]);
}

/**
 * The visible rows of the tree.
 *
 * A filter keeps every folder whose name contains it, with all parents of a
 * match, and shows them open, so a match never hides under a closed parent.
 * The root row stays first unless the caller leaves it out.
 */
export function folderTreeRows(input: {
  readonly folders: readonly string[];
  readonly expanded: ReadonlySet<string>;
  readonly filter?: string | undefined;
  readonly includeRoot?: boolean | undefined;
  readonly rootName: string;
  readonly isDisabled?: ((path: string) => boolean) | undefined;
}): readonly FolderTreeRow[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const all = [...new Set(input.folders.filter((folder) => folder !== ''))];
  // Every parent of a known folder is a folder, even if no list names it.
  for (const folder of [...all])
    for (const parent of folderAncestors(folder))
      if (!all.includes(parent)) all.push(parent);
  const children = new Map<string, string[]>();
  for (const folder of all) {
    const parent = folderOf(folder);
    const list = children.get(parent) ?? [];
    list.push(folder);
    children.set(parent, list);
  }
  for (const list of children.values())
    list.sort((left, right) => collator.compare(nameOf(left), nameOf(right)));
  const query = (input.filter ?? '').trim().toLocaleLowerCase();
  const visible =
    query === ''
      ? null
      : new Set(
          all
            .filter((folder) =>
              nameOf(folder).toLocaleLowerCase().includes(query),
            )
            .flatMap((folder) => [folder, ...folderAncestors(folder)]),
        );
  const disabled = input.isDisabled ?? ((): boolean => false);
  const rows: FolderTreeRow[] = [];
  if (input.includeRoot !== false)
    rows.push({
      path: '',
      name: input.rootName,
      level: 1,
      hasChildren: false,
      expanded: false,
      disabled: disabled(''),
    });
  const walk = (parent: string, level: number): void => {
    for (const folder of children.get(parent) ?? []) {
      if (visible !== null && !visible.has(folder)) continue;
      const hasChildren = (children.get(folder) ?? []).some(
        (child) => visible === null || visible.has(child),
      );
      const expanded =
        hasChildren && (visible !== null || input.expanded.has(folder));
      rows.push({
        path: folder,
        name: nameOf(folder),
        level,
        hasChildren,
        expanded,
        disabled: disabled(folder),
      });
      if (expanded) walk(folder, level + 1);
    }
  };
  walk('', 1);
  return rows;
}

/** What one key does on a focused row of the picker. */
export type FolderTreeKeyAction =
  | { readonly kind: 'focus'; readonly path: string }
  | { readonly kind: 'expand'; readonly path: string }
  | { readonly kind: 'collapse'; readonly path: string }
  | { readonly kind: 'choose'; readonly path: string }
  | { readonly kind: 'none' };

/**
 * The action of one key, following the sidebar tree (record 0164): Up, Down,
 * Home and End move, Right opens a folder or goes to its first child, Left
 * closes it or goes to its parent, Enter and Space choose the row.
 */
export function folderTreeKeyAction(
  key: string,
  rows: readonly FolderTreeRow[],
  path: string,
): FolderTreeKeyAction {
  const index = rows.findIndex((row) => row.path === path);
  const row = rows[index];
  if (row === undefined) return { kind: 'none' };
  const focus = (target: FolderTreeRow | undefined): FolderTreeKeyAction =>
    target === undefined
      ? { kind: 'none' }
      : { kind: 'focus', path: target.path };
  switch (key) {
    case 'ArrowDown':
      return focus(rows[index + 1]);
    case 'ArrowUp':
      return focus(rows[index - 1]);
    case 'Home':
      return focus(rows[0]);
    case 'End':
      return focus(rows.at(-1));
    case 'ArrowRight':
      if (!row.hasChildren) return { kind: 'none' };
      return row.expanded
        ? focus(rows[index + 1])
        : { kind: 'expand', path: row.path };
    case 'ArrowLeft': {
      if (row.expanded) return { kind: 'collapse', path: row.path };
      if (row.level === 1) return { kind: 'none' };
      const parent = folderOf(row.path);
      return focus(rows.find((candidate) => candidate.path === parent));
    }
    case 'Enter':
    case ' ':
      return row.disabled
        ? { kind: 'none' }
        : { kind: 'choose', path: row.path };
    default:
      return { kind: 'none' };
  }
}

/** The last segment of a folder path. */
function nameOf(folder: string): string {
  return folder.split('/').at(-1) ?? folder;
}
