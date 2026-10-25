import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  EmptyState,
  focusOutline,
  LoadingState,
  Notice,
} from '@notesapp/ui';
import { useLocalStore, useSession } from '../../app.tsx';
import { useFiles } from '../../shell/files.tsx';
import { readNoteText } from '../../shell/note-text.ts';
import { templateChoices, templateProblems } from '../../lib/templates.ts';
import { useCreateNote } from '../notes/new-note.tsx';
import { useTemplates } from './templates.tsx';

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
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        From template
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

/** A frame owns this dialog so transformed navigation cannot constrain it. */
export function NewFromTemplateDialog({
  workspaceId,
  folder,
  open,
  onClose,
}: {
  readonly workspaceId: string;
  readonly folder: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const store = useLocalStore().store;
  const accountId = useSession().account?.accountId ?? null;
  const newNote = useCreateNote(store, accountId, workspaceId);
  const [chosen, setChosen] = useState<{
    readonly folder: string;
    readonly text?: string;
  } | null>(null);
  const create = newNote.create;
  // The closed dialog must release focus before the new editor mounts.
  useEffect(() => {
    if (open || chosen === null) return;
    setChosen(null);
    create(chosen.folder, chosen.text);
  }, [open, chosen, create]);
  const id = useId();
  return (
    <>
      {newNote.error === null ? null : (
        <Notice tone="problem" message={newNote.error} />
      )}
      <Dialog
        open={open}
        onClose={onClose}
        title="New note from template"
        titleId={id}
        width="medium"
      >
        {open ? (
          <TemplateChoices
            workspaceId={workspaceId}
            folder={folder}
            onClose={onClose}
            onChoose={(destination, text) => {
              setChosen(
                text === undefined
                  ? { folder: destination }
                  : { folder: destination, text },
              );
              onClose();
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function TemplateChoices({
  workspaceId,
  folder,
  onClose,
  onChoose,
}: {
  readonly workspaceId: string;
  readonly folder: string;
  readonly onClose: () => void;
  readonly onChoose: (destination: string, text?: string) => void;
}): ReactNode {
  const files = useFiles();
  const templates = useTemplates();
  const store = useLocalStore().store;
  const accountId = useSession().account?.accountId ?? null;

  const [selected, setSelected] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [preview, setPreview] = useState<{
    readonly fileId: string;
    readonly text: string | null;
  } | null>(null);
  const settings = templates.settings;
  const templateFolder =
    settings.status === 'ready' ? settings.settings.folder : '';
  const choices = templateChoices(files.notes, templateFolder, null);
  const selectedLabel =
    choices.find((choice) => choice.id === selected)?.label ?? 'the template';
  const readyPreview = preview?.fileId === selected ? preview : null;
  useEffect(() => {
    if (selected === null || store === null || accountId === null) return;
    let cancelled = false;
    void readNoteText(store, accountId, workspaceId, selected).then((text) => {
      if (!cancelled) setPreview({ fileId: selected, text });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, store, accountId, workspaceId, previewAttempt]);
  return (
    <>
      <DialogBody>
        <p className="m-0 mb-3 text-control text-muted">
          Create in: {folder === '' ? 'workspace root' : folder}. Choose a
          template to preview its text. Date, time and title fields fill when
          you create the note.
        </p>
        {settings.status === 'loading' || files.loading ? (
          <LoadingState
            shape="list"
            rows={3}
            label="The templates are loading."
          />
        ) : settings.status === 'unavailable' ? (
          <Notice tone="problem" message={templateProblems.settings} />
        ) : (
          <>
            {files.limitNotice !== null ? (
              <Notice tone="info" message={templateProblems.partial} />
            ) : null}
            {choices.length === 0 && files.limitNotice === null ? (
              <EmptyState
                title="No templates yet"
                description={`A template is a note in ${templateFolder}. Create one there, then return here. You can change the template folder in Settings.`}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onChoose(templateFolder);
                    }}
                  >
                    New template
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {choices.map((choice) => (
                  <Button
                    key={choice.id}
                    variant={selected === choice.id ? 'secondary' : 'ghost'}
                    size="sm"
                    ariaPressed={selected === choice.id}
                    onClick={() => setSelected(choice.id)}
                  >
                    {choice.label}
                    {choice.detail === null ? '' : ` (${choice.detail})`}
                  </Button>
                ))}
              </div>
            )}
            {selected === null ? null : readyPreview === null ? (
              <LoadingState
                shape="note"
                label="The template preview is loading."
              />
            ) : readyPreview.text === null ? (
              <>
                <Notice tone="problem" message={templateProblems.text} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPreview(null);
                    setPreviewAttempt((attempt) => attempt + 1);
                  }}
                >
                  Retry preview
                </Button>
              </>
            ) : (
              <section
                aria-label={`Preview of ${selectedLabel}`}
                className="mt-3"
              >
                <h2 className="m-0 text-ui font-medium">
                  Preview of {selectedLabel}
                </h2>
                <pre
                  tabIndex={0}
                  className={`max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-app p-3 text-control ${focusOutline}`}
                >
                  {readyPreview.text === ''
                    ? 'This template is empty.'
                    : readyPreview.text}
                </pre>
              </section>
            )}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={
            readyPreview === null ||
            readyPreview.text === null ||
            store === null
          }
          onClick={() => {
            if (readyPreview?.text === null || readyPreview?.text === undefined)
              return;
            onChoose(folder, readyPreview.text);
          }}
        >
          Create note
        </Button>
      </DialogFooter>
    </>
  );
}
