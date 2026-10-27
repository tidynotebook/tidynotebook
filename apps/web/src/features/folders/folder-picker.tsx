import type { ReactNode } from 'react';
import { Button, CheckIcon, FolderIcon, rowClassName } from '@notesapp/ui';

/** A plain destination list. An empty path means no folder. */
export function FolderPicker({
  folders,
  selected,
  onSelect,
  onDone,
}: {
  readonly folders: readonly string[];
  readonly selected: string;
  readonly onSelect: (folder: string) => void;
  readonly onDone: () => void;
}): ReactNode {
  return (
    <div>
      <div
        role="group"
        aria-label="Save in"
        className="flex max-h-80 flex-col overflow-auto"
      >
        {['', ...folders].map((folder) => (
          <button
            key={folder}
            type="button"
            className={rowClassName({
              selected: selected === folder,
              className: 'w-full',
            })}
            aria-pressed={selected === folder}
            onClick={() => onSelect(folder)}
          >
            <FolderIcon />
            <span className="min-w-0 flex-1 break-words text-left">
              {folder === '' ? 'No folder' : folder}
            </span>
            {selected === folder ? <CheckIcon /> : null}
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
