/**
 * The one folder choice of the application (issue 517, item 4).
 *
 * `FolderTreePicker` is the tree of `folder-tree-view.tsx`, loaded when a
 * folder choice first shows. `FolderField` shows the chosen folder and opens
 * that tree in place under it.
 */
import { lazy, Suspense, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronDownIcon,
  FolderIcon,
  fieldClassName,
  LoadingState,
} from '@notesapp/ui';

export type { FolderTreePickerProps } from './folder-tree-view.tsx';
import type { FolderTreePickerProps } from './folder-tree-view.tsx';

const FieldPopover = lazy(() => import('./folder-field-popover.ts'));

const FolderTreeView = lazy(() => import('./folder-tree-view.tsx'));

/** The folder tree with its filter field and New folder here. */
export function FolderTreePicker(props: FolderTreePickerProps): ReactNode {
  return (
    <Suspense
      fallback={<LoadingState shape="list" rows={3} label="Loading folders" />}
    >
      <FolderTreeView {...props} />
    </Suspense>
  );
}

/**
 * A field that shows the chosen folder and opens its tree choice.
 *
 * The tree opens as a desktop popup or inline in the phone sheet. A folder
 * choice is never a second step. Choosing a row or Escape closes the tree
 * and gives the focus back to the field. Escape does not close the dialog.
 */
export function FolderField({
  id,
  label,
  value,
  onChange,
  folders,
  rootName = 'All notes',
  includeRoot = true,
  error,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (folder: string) => void;
  readonly folders: readonly string[];
  readonly rootName?: string | undefined;
  readonly includeRoot?: boolean | undefined;
  readonly error?: string | undefined;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const shown = value === '' ? rootName : (value.split('/').at(-1) ?? value);
  return (
    <div
      className="mb-3.5"
      data-dialog-escape={open ? 'local' : undefined}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <span id={`${id}-label`} className="mb-1.5 block text-label text-strong">
        {label}
      </span>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-labelledby={`${id}-label ${id}`}
        aria-expanded={open}
        aria-controls={open ? `${id}-tree` : undefined}
        title={value === '' ? rootName : value}
        className={fieldClassName({
          invalid: error !== undefined,
          className: 'flex cursor-pointer items-center gap-2 text-left',
        })}
        onClick={() => setOpen((now) => !now)}
      >
        <span className="inline-flex shrink-0 text-muted" aria-hidden="true">
          <FolderIcon />
        </span>
        <span className="min-w-0 flex-1 truncate">{shown}</span>
        <span className="inline-flex shrink-0 text-muted" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>
      {error === undefined ? null : (
        <p className="mb-0 mt-1 text-secondary text-danger" role="alert">
          {error}
        </p>
      )}
      {open ? (
        <Suspense fallback={null}>
          <FieldPopover id={`${id}-tree`} anchor={buttonRef} onClose={close}>
            <FolderTreePicker
              folders={folders}
              selected={value}
              label={label}
              rootName={rootName}
              includeRoot={includeRoot}
              autoFocus
              onSelect={(folder) => {
                onChange(folder);
                close();
              }}
            />
          </FieldPopover>
        </Suspense>
      ) : null}
    </div>
  );
}
