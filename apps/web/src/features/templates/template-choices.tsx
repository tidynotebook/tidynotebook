/**
 * The body of New note from template: the list and the details (issue 517,
 * item 3). `new-from-template.tsx` loads it when the dialog opens, so the
 * dialog adds nothing to the first route.
 */
import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  DialogBody,
  DialogFooter,
  EmptyState,
  rowClassName,
  TextField,
  ChevronLeftIcon,
  LoadingState,
  Notice,
  TemplateIcon,
} from '@notesapp/ui';
import { FolderField } from '../folders/folder-tree-picker.tsx';
import { knownFolderPaths } from '../../lib/folder-selection.ts';
import { useLocalStore, useSession } from '../../app.tsx';
import { useFiles } from '../../shell/files.tsx';
import { readNoteText } from '../../shell/note-text.ts';
import { templateChoices } from '../../lib/templates.ts';
import {
  newNoteNameProblem,
  templateNoteName,
  templatePreviewText,
} from '../../lib/template-note.ts';
import {
  folderOf,
  joinNotePath,
  storageNotePath,
} from '../../lib/note-name.ts';
import { useTemplates } from './templates.tsx';
import type { Chosen } from './new-from-template.tsx';

// The note surface loads only when a preview shows, as it does in History.
const NotePreview = lazy(() => import('../history/version-preview.tsx'));

/** The list and the details: two columns on desktop, two levels on a phone. */
export default function TemplateChoices({
  workspaceId,
  folder,
  onClose,
  onChoose,
}: {
  readonly workspaceId: string;
  readonly folder: string;
  readonly onClose: () => void;
  readonly onChoose: (chosen: Chosen) => void;
}): ReactNode {
  const files = useFiles();
  const templates = useTemplates();
  const store = useLocalStore().store;
  const accountId = useSession().account?.accountId ?? null;
  const [destination, setDestination] = useState(folder);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [showProblem, setShowProblem] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [preview, setPreview] = useState<{
    readonly fileId: string;
    readonly text: string | null;
  } | null>(null);
  // The values of the preview are those of the moment the details opened.
  const [instant, setInstant] = useState(() => new Date());
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
  const repeated = useMemo(() => {
    const seen = new Map<string, number>();
    for (const choice of choices)
      seen.set(choice.label, (seen.get(choice.label) ?? 0) + 1);
    return seen;
  }, [choices]);
  const selectedLabel =
    choices.find((choice) => choice.id === selected)?.label ?? null;
  const readyPreview = preview?.fileId === selected ? preview : null;
  const folders = useMemo(
    () =>
      knownFolderPaths(
        files.notes.map((note) => note.path),
        files.emptyFolders,
      ),
    [files.notes, files.emptyFolders],
  );
  const takenPaths = useMemo(
    () => files.notes.map((note) => note.path),
    [files.notes],
  );
  const inDestination = useMemo(
    () => takenPaths.filter((path) => folderOf(path) === destination),
    [takenPaths, destination],
  );

  // The proposed name follows the template and the folder until the person
  // types one.
  useEffect(() => {
    if (nameTouched || selectedLabel === null) return;
    setName(templateNoteName(takenPaths, destination, selectedLabel, instant));
  }, [nameTouched, selectedLabel, takenPaths, destination, instant]);
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

  const problem = newNoteNameProblem(name, destination, inDestination);
  // The surface draws a new note for each text, so it follows the name a
  // moment after the keys.
  const previewName = useDeferredValue(name);
  const filled =
    readyPreview === null || readyPreview.text === null
      ? null
      : templatePreviewText(readyPreview.text, previewName, instant);
  const canCreate = filled !== null && store !== null;

  const submit = (): void => {
    if (
      selected === null ||
      readyPreview === null ||
      readyPreview.text === null ||
      store === null
    )
      return;
    if (problem !== null) {
      setShowProblem(true);
      document.getElementById('template-note-name')?.focus();
      return;
    }
    onChoose({ folder: destination, text: readyPreview.text, name });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogBody>
        <div className="grid min-w-0 gap-5 lg:grid-cols-3">
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
                        <Button
                          onClick={() => onChoose({ folder: templateFolder })}
                        >
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
                    className="flex max-h-96 flex-col overflow-auto"
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
                          className: 'w-full text-left',
                        })}
                        aria-pressed={selected === choice.id}
                        onClick={() => {
                          if (selected === choice.id) return;
                          setPreview(null);
                          setInstant(new Date());
                          setShowProblem(false);
                          setNameTouched(false);
                          setSelected(choice.id);
                        }}
                      >
                        <TemplateIcon />
                        <span className="min-w-0 flex-1 truncate">
                          {choice.label}
                        </span>
                        {/* Two templates with one name differ by subfolder. */}
                        {(repeated.get(choice.label) ?? 0) > 1 &&
                        choice.detail !== null ? (
                          <span className="shrink-0 text-control text-muted">
                            {choice.detail}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div
            className={
              selected === null
                ? 'hidden min-w-0 lg:col-span-2 lg:block'
                : 'min-w-0 lg:col-span-2'
            }
          >
            {selected === null ? (
              <p className="text-control text-muted">Choose a template</p>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2 lg:hidden">
                  <Button
                    variant="ghost"
                    buttonRef={backRef}
                    icon={<ChevronLeftIcon />}
                    onClick={() => {
                      returnToList.current = true;
                      setSelected(null);
                    }}
                  >
                    Back
                  </Button>
                  <span className="min-w-0 flex-1 truncate text-ui font-semibold text-strong">
                    {selectedLabel}
                  </span>
                </div>
                <div className="grid min-w-0 gap-x-3 sm:grid-cols-2">
                  <TextField
                    id="template-note-name"
                    label="Name"
                    value={name}
                    error={
                      showProblem || (nameTouched && problem !== null)
                        ? (problem ?? undefined)
                        : undefined
                    }
                    onChange={(value) => {
                      setNameTouched(true);
                      setName(value);
                    }}
                  />
                  <FolderField
                    id="template-note-folder"
                    label="Save in"
                    value={destination}
                    folders={folders}
                    onChange={setDestination}
                  />
                </div>
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
                  <section aria-label={`Preview of ${selectedLabel ?? ''}`}>
                    <p className="mb-1.5 mt-0 text-control font-medium text-strong">
                      Preview
                    </p>
                    {filled === '' ? (
                      <p className="text-control text-muted">
                        This template is empty.
                      </p>
                    ) : store === null || accountId === null ? null : (
                      <Suspense
                        fallback={
                          <LoadingState shape="note" label="Loading preview" />
                        }
                      >
                        <NotePreview
                          store={store}
                          accountId={accountId}
                          workspaceId={workspaceId}
                          path={joinNotePath(
                            destination,
                            storageNotePath(name),
                          )}
                          text={filled ?? ''}
                          label="The new note"
                        />
                      </Suspense>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        {selected === null ? null : (
          <p className="m-0 mr-auto hidden self-center text-control text-muted lg:block">
            Date and time are set when you create the note.
          </p>
        )}
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {selected === null ? null : (
          <Button type="submit" disabled={!canCreate}>
            Create note
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
