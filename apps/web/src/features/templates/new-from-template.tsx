/**
 * New note from template: one dialog from the choice to Create note (issue
 * 517, item 3).
 *
 * The list on the left holds the template names. The details on the right
 * hold the name of the new note, the folder that receives it, and the note as
 * it will read: the template filled with the date, the time and the typed
 * name, drawn by the same read-only note surface as a version in History. On
 * a phone the same sheet shows the list, then the details with Back. The
 * folder choice is the tree of `folder-tree-picker.tsx`, opened in place, so
 * no step replaces the dialog.
 */
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  Dialog,
  LoadingState,
  Notice,
  TemplateIcon,
} from '@notesapp/ui';
import { useLocalStore, useSession } from '../../app.tsx';
import { useCreateNote } from '../notes/new-note.tsx';

// The list and the details load when the dialog first opens.
const TemplateChoices = lazy(() => import('./template-choices.tsx'));

/** Preview and choose a template before making a note in the stated folder. */
export function NewFromTemplate({
  workspaceId,
  folder,
}: {
  readonly workspaceId: string;
  readonly folder: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        icon={<TemplateIcon />}
        onClick={() => setOpen(true)}
      >
        Use template
      </Button>
      <NewFromTemplateDialog
        workspaceId={workspaceId}
        folder={folder}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** What Create note asks for once the dialog has closed. */
export type Chosen = {
  readonly folder: string;
  readonly text?: string;
  readonly name?: string;
};

/** A frame owns this dialog so transformed navigation cannot constrain it. */
export function NewFromTemplateDialog({
  workspaceId,
  folder,
  open,
  onClose,
  onError,
  onCreationStart,
}: {
  readonly workspaceId: string;
  readonly folder: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onError?: ((message: string | null) => void) | undefined;
  readonly onCreationStart?:
    (() => (message: string | null) => boolean | void) | undefined;
}): ReactNode {
  const store = useLocalStore().store;
  const accountId = useSession().account?.accountId ?? null;
  const newNote = useCreateNote(
    store,
    accountId,
    workspaceId,
    onError,
    onCreationStart,
  );
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const create = newNote.create;
  // The closed dialog must release focus before the new editor mounts.
  useEffect(() => {
    if (open || chosen === null) return;
    setChosen(null);
    create(chosen.folder, chosen.text, chosen.name);
  }, [open, chosen, create]);
  const id = useId();
  return (
    <>
      {onError !== undefined ||
      onCreationStart !== undefined ||
      newNote.error === null ? null : (
        <Notice tone="problem" message={newNote.error} />
      )}
      <Dialog
        open={open}
        onClose={onClose}
        title="New note from template"
        titleId={id}
        width="template"
        align="sheet"
        hideTitle
      >
        {open ? (
          <Suspense
            fallback={
              <LoadingState shape="list" rows={3} label="Loading templates" />
            }
          >
            <TemplateChoices
              workspaceId={workspaceId}
              folder={folder}
              onClose={onClose}
              onChoose={(next) => {
                setChosen(next);
                onClose();
              }}
            />
          </Suspense>
        ) : null}
      </Dialog>
    </>
  );
}
