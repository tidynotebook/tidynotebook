/** The note outline and inbound links share one side region. */
import type { ReactNode } from 'react';
import type { LocalStore } from '@notesapp/sync';
import { Inset, CollapsibleSection } from '@notesapp/ui';
import { OutlinePanel } from './outline.tsx';
import { Backlinks } from './backlinks.tsx';
import {
  noteSideRegionClassName,
  noteOutlineScrollClassName,
} from '../../lib/note-column.ts';
export function NoteSide({
  store,
  accountId,
  workspaceId,
  fileId,
  text,
  outlineOpen,
  onOutlineChange,
  backlinksOpen,
  onBacklinksChange,
}: {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly text: string;
  readonly outlineOpen: boolean;
  readonly onOutlineChange: (open: boolean) => void;
  readonly backlinksOpen: boolean;
  readonly onBacklinksChange: (open: boolean) => void;
}): ReactNode {
  return (
    <aside
      className={noteSideRegionClassName()}
      aria-label="Note outline and inbound links"
    >
      <div className={noteOutlineScrollClassName()}>
        <OutlinePanel
          text={text}
          open={outlineOpen}
          onToggle={onOutlineChange}
        />
      </div>
      <Inset
        as="div"
        className="max-h-1/2 shrink-0 overflow-y-auto overscroll-contain"
      >
        <CollapsibleSection
          id="notes-backlinks"
          title="Links to this note"
          open={backlinksOpen}
          onToggle={onBacklinksChange}
        >
          <Backlinks
            store={store}
            accountId={accountId}
            workspaceId={workspaceId}
            fileId={fileId}
          />
        </CollapsibleSection>
      </Inset>
    </aside>
  );
}
