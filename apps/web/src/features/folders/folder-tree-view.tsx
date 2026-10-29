/**
 * The one folder choice of the application (issue 517, item 4).
 *
 * Every place that asks for a folder shows this tree: the template
 * destination, the parent of New folder, Move to folder and the folder fields
 * of Settings. It reads like the sidebar tree, with the same twisty, indent,
 * row recipe and keys (`lib/folder-tree.ts`), and `role="tree"`.
 *
 * New folder here names a folder inside the chosen one and chooses it. Like
 * New folder of the sidebar it writes nothing: the folder exists once the
 * caller puts a note or a folder inside it.
 *
 * `folder-tree-picker.tsx` loads this module when a folder choice first
 * shows, so the tree stays out of the first route.
 */
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  fieldClassName,
  DialogHeaderAction,
  isTouchInput,
  FolderPlusIcon,
  SearchIcon,
  TextField,
} from '@notesapp/ui';
import {
  folderTreeKeyAction,
  folderTreeRows,
  initiallyExpanded,
} from '../../lib/folder-tree.ts';
import { childFolderPath } from '../../lib/folder-selection.ts';
import {
  cleanNoteBaseName,
  noteBaseNameProblem,
  noteNameProblem,
} from '../../lib/note-name.ts';
import {
  rowActionClassName,
  rowSpacerClassName,
  treeIndentClassName,
  treeItemClassName,
  treeItemsClassName,
  treeRowClassName,
  treeRowLeadingClassName,
  treeRowNameClassName,
} from '../../lib/tree-row.ts';

/** The filter field appears when the workspace has more folders than this. */
const filterFrom = 8;

export type FolderTreePickerProps = {
  /** Every folder that exists, as stored paths. */
  readonly folders: readonly string[];
  /** The chosen folder, or the empty path for the root. */
  readonly selected: string;
  readonly onSelect: (folder: string) => void;
  /** The accessible name of the tree. */
  readonly label: string;
  /** The name of the root row, which stands for no folder. */
  readonly rootName?: string | undefined;
  /** Leaves out the root row when no folder is no valid choice. */
  readonly includeRoot?: boolean | undefined;
  /** A row that cannot be chosen, such as a folder that moves into itself. */
  readonly isDisabled?: ((folder: string) => boolean) | undefined;
  /** The quiet words at the end of a disabled row, if any. */
  readonly disabledNote?: ((folder: string) => string | null) | undefined;
  /** Puts the focus on the chosen row when the tree appears. */
  readonly autoFocus?: boolean | undefined;
  /** A place shown with a quiet label even when another folder is selected. */
  readonly currentFolder?: string | undefined;
  readonly searchPlacement?: 'header' | 'row' | undefined;
};

/** The folder tree with its filter field and New folder here. */
export default function FolderTreeView({
  folders,
  selected,
  onSelect,
  label,
  rootName = 'All notes',
  includeRoot = true,
  isDisabled,
  disabledNote,
  autoFocus = false,
  currentFolder,
  searchPlacement = 'row',
}: FolderTreePickerProps): ReactNode {
  const id = useId();
  const searchButton = useRef<HTMLButtonElement | null>(null);
  const [expanded, setExpanded] = useState(() => initiallyExpanded(selected));
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState('');
  const [named, setNamed] = useState<readonly string[]>([]);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const draftRow = useRef<HTMLDivElement | null>(null);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const moveFocus = useRef(autoFocus);
  const all = useMemo(
    // A chosen folder that only New folder here named is still a row.
    () => [...new Set([...folders, ...named, selected])],
    [folders, named, selected],
  );
  const rows = useMemo(
    () =>
      folderTreeRows({
        folders: all,
        expanded,
        filter,
        includeRoot,
        rootName,
        isDisabled,
      }),
    [all, expanded, filter, includeRoot, rootName, isDisabled],
  );
  const current =
    focusPath !== null && rows.some((row) => row.path === focusPath)
      ? focusPath
      : rows.some((row) => row.path === selected)
        ? selected
        : (rows[0]?.path ?? null);

  // A choice that the caller sets, such as the folder of the moved row when
  // a dialog opens, is shown with its parents open.
  useEffect(() => {
    setExpanded((now) => {
      const wanted = [...initiallyExpanded(selected)];
      return wanted.every((path) => now.has(path))
        ? now
        : new Set([...now, ...wanted]);
    });
  }, [selected]);
  useEffect(() => {
    if (!moveFocus.current || current === null) return;
    moveFocus.current = false;
    rowRefs.current.get(current)?.focus();
  }, [current]);

  const focusRow = (path: string): void => {
    moveFocus.current = true;
    setFocusPath(path);
    rowRefs.current.get(path)?.focus();
  };
  const toggle = (path: string, open: boolean): void => {
    setExpanded((now) => {
      const next = new Set(now);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  };
  const choose = (path: string): void => {
    setFocusPath(path);
    onSelect(path);
  };

  const cancelCreate = (): void => {
    setCreating(null);
    setName('');
    setProblem(null);
  };
  useEffect(() => {
    if (creating === null) return;
    const outside = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !draftRow.current?.contains(event.target)
      ) {
        setCreating(null);
        setName('');
        setProblem(null);
      }
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [creating]);

  const createFolder = (): void => {
    if (creating === null) return;
    const child = cleanNoteBaseName(name);
    const nameProblem = noteBaseNameProblem(child);
    if (nameProblem !== null) {
      setProblem(
        nameProblem
          .replaceAll('note name', 'folder name')
          .replace('Use Move to folder.', 'Make one folder at a time.'),
      );
      return;
    }
    const folder = childFolderPath(creating, child);
    const pathProblem = noteNameProblem(folder);
    if (pathProblem !== null) {
      setProblem(pathProblem.replaceAll('note name', 'folder name'));
      return;
    }
    if (all.some((one) => one.toLowerCase() === folder.toLowerCase())) {
      setProblem(`A folder named ${folder} already exists.`);
      return;
    }
    setNamed((now) => [...now, folder]);
    if (creating !== '') toggle(creating, true);
    setCreating(null);
    setName('');
    setProblem(null);
    setFilter('');
    moveFocus.current = true;
    choose(folder);
  };

  const parentName =
    selected === '' ? null : (selected.split('/').at(-1) ?? selected);

  const draftLevel =
    creating === ''
      ? 1
      : (rows.find((row) => row.path === creating)?.level ?? 0) + 1;
  const inlineRow =
    creating === null ? null : (
      <div
        ref={draftRow}
        className={treeIndentClassName(draftLevel)}
        role="treeitem"
        aria-level={draftLevel}
        aria-label="New folder"
        data-dialog-escape="local"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            createFolder();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelCreate();
            window.requestAnimationFrame(() => createButton.current?.focus());
          }
        }}
      >
        <div className={treeRowClassName()}>
          <span className={rowSpacerClassName} aria-hidden="true" />
          <span className="inline-flex shrink-0" aria-hidden="true">
            <FolderIcon />
          </span>
          <input
            id={`${id}-new-folder`}
            aria-label="Folder name"
            placeholder="Folder name"
            className={fieldClassName({
              invalid: problem !== null,
              className: 'min-w-0 flex-1',
            })}
            value={name}
            autoComplete="off"
            autoFocus
            aria-invalid={problem !== null}
            aria-describedby={
              problem === null ? undefined : `${id}-new-folder-error`
            }
            onChange={(event) => {
              setName(event.target.value);
              setProblem(null);
            }}
          />
          <Button
            variant="ghost"
            icon={<CheckIcon />}
            label="Create folder"
            className="size-11 shrink-0"
            onClick={createFolder}
          />
        </div>
        {problem === null ? null : (
          <p
            id={`${id}-new-folder-error`}
            className="ui-field-error pl-12 text-secondary text-danger"
            role="alert"
          >
            {problem}
          </p>
        )}
      </div>
    );

  const canSearch = all.filter((folder) => folder !== '').length > filterFrom;
  const searchControl = canSearch ? (
    <span
      className="inline-flex shrink-0"
      data-dialog-escape={searching ? 'local' : undefined}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && searching) {
          event.preventDefault();
          event.stopPropagation();
          setFilter('');
          setSearching(false);
          window.requestAnimationFrame(() => searchButton.current?.focus());
        } else if (
          ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(
            event.key,
          )
        )
          event.stopPropagation();
      }}
    >
      <Button
        variant="ghost"
        size={searchPlacement === 'header' ? 'md' : 'sm'}
        icon={<SearchIcon />}
        label="Search folders"
        buttonRef={searchButton}
        ariaExpanded={searching}
        ariaControls={searching ? `${id}-filter` : undefined}
        onClick={() => {
          setSearching(true);
          if (!isTouchInput())
            window.requestAnimationFrame(() =>
              document.getElementById(`${id}-filter`)?.focus(),
            );
        }}
      />
    </span>
  ) : null;
  return (
    <div>
      {searchPlacement === 'header' ? (
        <DialogHeaderAction>{searchControl}</DialogHeaderAction>
      ) : null}
      {canSearch && searching ? (
        <div
          data-dialog-escape="local"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setFilter('');
              setSearching(false);
              window.requestAnimationFrame(() => searchButton.current?.focus());
            }
          }}
        >
          <TextField
            id={`${id}-filter`}
            listSearch
            label="Search folders"
            hideLabel
            placeholder="Filter folders"
            autoFocus
            value={filter}
            onChange={setFilter}
          />
        </div>
      ) : null}
      <div
        role="tree"
        aria-label={label}
        className={`${treeItemsClassName} max-h-72 overflow-y-auto`}
        onKeyDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('input, button')
          )
            return;
          if (current === null) return;
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const action = folderTreeKeyAction(event.key, rows, current);
          if (action.kind === 'none') return;
          event.preventDefault();
          event.stopPropagation();
          if (action.kind === 'focus') focusRow(action.path);
          else if (action.kind === 'expand') toggle(action.path, true);
          else if (action.kind === 'collapse') toggle(action.path, false);
          else choose(action.path);
        }}
      >
        {rows.length === 0 ? (
          <p className="m-0 px-2 py-2 text-secondary text-muted">
            No folder matches "{filter}".
          </p>
        ) : null}
        {creating === '' && !includeRoot ? inlineRow : null}
        {rows.map((row) => {
          const chosen = row.path === selected;
          return (
            <Fragment key={row.path === '' ? '\u0000root' : row.path}>
              <div
                ref={(element) => {
                  if (element === null) rowRefs.current.delete(row.path);
                  else rowRefs.current.set(row.path, element);
                }}
                role="treeitem"
                aria-level={row.level}
                aria-selected={chosen}
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                aria-disabled={row.disabled ? true : undefined}
                tabIndex={row.path === current ? 0 : -1}
                className={`${treeIndentClassName(row.level)} ${treeItemClassName}`}
                onFocus={() => setFocusPath(row.path)}
                onClick={() => {
                  if (!row.disabled) choose(row.path);
                }}
              >
                <div className={treeRowClassName({ open: chosen })}>
                  <div className={treeRowLeadingClassName}>
                    {row.hasChildren ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={`${row.expanded ? 'Close' : 'Open'} ${row.name}`}
                        className={rowActionClassName}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(row.path, !row.expanded);
                          focusRow(row.path);
                        }}
                      >
                        <span
                          className="inline-flex text-muted"
                          aria-hidden="true"
                        >
                          {row.expanded ? (
                            <ChevronDownIcon />
                          ) : (
                            <ChevronRightIcon />
                          )}
                        </span>
                      </button>
                    ) : (
                      <span className={rowSpacerClassName} aria-hidden="true" />
                    )}
                    <div
                      className={`${treeRowNameClassName} ${row.path === currentFolder || row.disabled ? 'pointer-coarse:flex-wrap pointer-coarse:gap-y-0' : ''} ${row.disabled ? 'cursor-default text-muted' : ''}`}
                    >
                      <span className="inline-flex shrink-0" aria-hidden="true">
                        <FolderIcon />
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate ${row.path === currentFolder || row.disabled ? 'pointer-coarse:line-clamp-2 pointer-coarse:whitespace-normal pointer-coarse:break-words' : ''}`}
                      >
                        {row.name}
                      </span>
                      {row.path === currentFolder || row.disabled ? (
                        <span className="shrink-0 text-secondary text-muted pointer-coarse:basis-full pointer-coarse:pl-6">
                          {row.path === currentFolder
                            ? 'Current folder'
                            : disabledNote?.(row.path)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {searchPlacement === 'row' && row === rows[0]
                    ? searchControl
                    : null}
                  {chosen ? (
                    <span
                      className="inline-flex shrink-0 items-center pr-1"
                      aria-hidden="true"
                    >
                      <CheckIcon />
                    </span>
                  ) : searchPlacement === 'row' &&
                    row === rows[0] &&
                    canSearch ? (
                    <span className="w-5 shrink-0" aria-hidden="true" />
                  ) : null}
                </div>
              </div>
              {creating === row.path ? inlineRow : null}
            </Fragment>
          );
        })}
      </div>
      {creating === null ? (
        <div className="mt-1 border-0 border-t border-solid border-edge-subtle pt-1">
          <Button
            variant="ghost"
            icon={<FolderPlusIcon />}
            buttonRef={createButton}
            className="w-full justify-start"
            onClick={() => {
              setFilter('');
              if (selected !== '') toggle(selected, true);
              setCreating(selected);
            }}
          >
            {parentName === null
              ? 'New folder here'
              : `New folder in ${parentName}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
