import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  EmptyState,
  focusOutline,
  rowClassName,
  TextField,
  ChevronLeftIcon,
  buttonClassName,
  LoadingState,
  Notice,
  TemplateIcon,
} from '@notesapp/ui';
import { Link } from 'react-router';
import { FolderPicker } from '../folders/folder-picker.tsx';
import { knownFolderPaths } from '../../lib/folder-selection.ts';
import { useLocalStore, useSession } from '../../app.tsx';
import { useFiles } from '../../shell/files.tsx';
import { readNoteText } from '../../shell/note-text.ts';
import { templateChoices } from '../../lib/templates.ts';
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
  const [title, setTitle] = useState('Choose a template');
  useEffect(() => {
    if (open) setTitle('Choose a template');
  }, [open]);
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
        title={title}
        titleId={id}
        width="large"
        align="sheet"
      >
        {open ? (
          <TemplateChoices
            workspaceId={workspaceId}
            folder={folder}
            onTitle={setTitle}
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

/** The two-step phone sheet becomes two columns on desktop. */
function TemplateChoices({
  workspaceId,
  folder,
  onClose,
  onChoose,
  onTitle,
}: {
  readonly workspaceId: string;
  readonly folder: string;
  readonly onClose: () => void;
  readonly onChoose: (destination: string, text?: string) => void;
  readonly onTitle: (title: string) => void;
}): ReactNode {
  const files = useFiles();
  const templates = useTemplates();
  const store = useLocalStore().store;
  const accountId = useSession().account?.accountId ?? null;
  const [destination, setDestination] = useState(folder);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [preview, setPreview] = useState<{
    readonly fileId: string;
    readonly text: string | null;
  } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const returnToList = useRef(false);
  const settings = templates.settings;
  const templateFolder =
    settings.status === 'ready' ? settings.settings.folder : '';
  const choices = useMemo(
    () => templateChoices(files.notes, templateFolder, null),
    [files.notes, templateFolder],
  );
  const matching = choices.filter((choice) =>
    `${choice.label} ${choice.detail ?? ''}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const selectedLabel =
    choices.find((choice) => choice.id === selected)?.label ??
    'Choose a template';
  const readyPreview = preview?.fileId === selected ? preview : null;
  const folders = useMemo(
    () =>
      knownFolderPaths(
        files.notes.map((note) => note.path),
        files.emptyFolders,
      ),
    [files.notes, files.emptyFolders],
  );
  useEffect(() => {
    onTitle(
      choosingFolder
        ? 'Save in'
        : selected === null
          ? 'Choose a template'
          : selectedLabel,
    );
  }, [choosingFolder, selected, selectedLabel, onTitle]);
  useEffect(() => {
    if (selected !== null) backRef.current?.focus();
    else if (returnToList.current) {
      returnToList.current = false;
      listRef.current?.querySelector('button')?.focus();
    }
  }, [selected]);
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
        {choosingFolder ? (
          <FolderPicker
            folders={folders}
            selected={destination}
            onSelect={setDestination}
            onDone={() => setChoosingFolder(false)}
          />
        ) : (
          <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <div
              className={
                selected === null ? 'min-w-0' : 'hidden min-w-0 lg:block'
              }
            >
              {settings.status === 'loading' || files.loading ? (
                <LoadingState shape="list" rows={3} label="Loading templates" />
              ) : settings.status === 'unavailable' ? (
                <>
                  <Notice
                    tone="problem"
                    message="Templates did not load. Try again."
                  />
                  <Button variant="secondary" onClick={templates.retry}>
                    Try again
                  </Button>
                </>
              ) : (
                <>
                  {files.limitNotice === null ? null : (
                    <Notice
                      tone="info"
                      message="Some templates may be missing."
                    />
                  )}
                  {choices.length > 5 ? (
                    <TextField
                      id="search-templates"
                      label="Search templates"
                      value={search}
                      onChange={setSearch}
                    />
                  ) : null}
                  {choices.length === 0 ? (
                    files.limitNotice !== null ? null : (
                      <EmptyState
                        title="No templates yet"
                        description={`A template is a note in the "${templateFolder}" folder.`}
                        action={
                          <Button onClick={() => onChoose(templateFolder)}>
                            Create a template
                          </Button>
                        }
                      />
                    )
                  ) : matching.length === 0 ? (
                    <p className="text-control text-muted">
                      No template matches "{search}".
                    </p>
                  ) : (
                    <div
                      ref={listRef}
                      className="flex max-h-80 flex-col overflow-auto"
                      role="group"
                      aria-label="Templates"
                      onKeyDown={(event) => {
                        if (
                          !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(
                            event.key,
                          )
                        )
                          return;
                        const rows = Array.from(
                          listRef.current?.querySelectorAll('button') ?? [],
                        );
                        const index = rows.findIndex(
                          (row) => row === event.target,
                        );
                        if (index < 0) return;
                        event.preventDefault();
                        const next =
                          event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? rows.length - 1
                              : (index +
                                  (event.key === 'ArrowDown' ? 1 : -1) +
                                  rows.length) %
                                rows.length;
                        rows[next]?.focus();
                      }}
                    >
                      {matching.map((choice) => (
                        <button
                          key={choice.id}
                          type="button"
                          className={rowClassName({
                            selected: selected === choice.id,
                            className: 'min-h-14 w-full text-left lg:min-h-14',
                          })}
                          aria-pressed={selected === choice.id}
                          onClick={() => {
                            if (selected === choice.id) return;
                            setPreview(null);
                            setSelected(choice.id);
                          }}
                        >
                          <TemplateIcon />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {choice.label}
                            </span>
                            <TemplateFirstLine
                              fileId={choice.id}
                              workspaceId={workspaceId}
                            />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {choices.length === 0 ? null : (
                    <p className="mb-0 mt-3 flex flex-wrap items-center gap-2 text-control text-muted">
                      From the "{templateFolder}" folder.{' '}
                      <Link
                        className={buttonClassName({
                          variant: 'secondary',
                          size: 'sm',
                        })}
                        to={`/w/${workspaceId}/settings#templates-heading`}
                        onClick={onClose}
                      >
                        Manage
                      </Link>
                    </p>
                  )}
                </>
              )}
            </div>
            <div
              className={
                selected === null ? 'hidden min-w-0 lg:block' : 'min-w-0'
              }
            >
              {selected === null ? (
                <p className="text-control text-muted">Choose a template</p>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    buttonRef={backRef}
                    icon={<ChevronLeftIcon />}
                    onClick={() => {
                      returnToList.current = true;
                      setSelected(null);
                    }}
                    className="lg:hidden"
                  >
                    Back
                  </Button>
                  {readyPreview === null ? (
                    <LoadingState shape="note" label="Loading preview" />
                  ) : readyPreview.text === null ? (
                    <>
                      <Notice
                        tone="problem"
                        message="Can't load this template. It is not on this device."
                      />
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setPreview(null);
                          setPreviewAttempt((attempt) => attempt + 1);
                        }}
                      >
                        Try again
                      </Button>
                    </>
                  ) : (
                    <section aria-label={`Preview of ${selectedLabel}`}>
                      <pre
                        tabIndex={0}
                        className={`max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-app p-3 text-control ${focusOutline}`}
                      >
                        {readyPreview.text === ''
                          ? 'This template is empty.'
                          : readyPreview.text}
                      </pre>
                      {/\{\{(?:date|time|title)[^}]*\}\}/.test(
                        readyPreview.text,
                      ) ? (
                        <p className="text-control text-muted">
                          Fields fill in when you create the note.
                        </p>
                      ) : null}
                    </section>
                  )}
                  <div className="mt-3 flex items-center gap-2 text-control">
                    <span className="min-w-0 flex-1 break-words">
                      Folder: {destination === '' ? 'No folder' : destination}
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => setChoosingFolder(true)}
                    >
                      Change
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogBody>
      {choosingFolder ? null : (
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {selected === null ? null : (
            <Button
              disabled={
                readyPreview === null ||
                readyPreview.text === null ||
                store === null
              }
              onClick={() => {
                if (
                  readyPreview?.text === null ||
                  readyPreview?.text === undefined
                )
                  return;
                onChoose(destination, readyPreview.text);
              }}
            >
              Create note
            </Button>
          )}
        </DialogFooter>
      )}
    </>
  );
}

/** Use available device text for the row without fetching every template. */
function TemplateFirstLine({
  fileId,
  workspaceId,
}: {
  readonly fileId: string;
  readonly workspaceId: string;
}): ReactNode {
  const store = useLocalStore().store;
  const accountId = useSession().account?.accountId ?? null;
  const [line, setLine] = useState('');
  useEffect(() => {
    let active = true;
    if (store !== null && accountId !== null)
      void store
        .readCachedNote(accountId, workspaceId, fileId)
        .then((note) => {
          if (active && note !== null && !note.deleted)
            setLine(
              note.text
                .split('\n')
                .map((part) => part.trim())
                .find((part) => part !== '') ?? '',
            );
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [store, accountId, workspaceId, fileId]);
  return line === '' ? null : (
    <span className="block truncate text-control text-muted">{line}</span>
  );
}
