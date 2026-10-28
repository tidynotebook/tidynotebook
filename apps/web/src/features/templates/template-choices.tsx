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
  DialogFooter,
  EmptyState,
  rowClassName,
  TextField,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  SettingsIcon,
  buttonClassName,
  LoadingState,
  Notice,
  TemplateIcon,
} from '@notesapp/ui';
import { useOpenSettings } from '../../shell/settings-modal.tsx';
import { firstTemplate, lastTemplateKey } from '../../lib/last-template.ts';
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
  templatePreviewHighlights,
} from '../../lib/template-note.ts';
import {
  folderOf,
  joinNotePath,
  storageNotePath,
} from '../../lib/note-name.ts';
import { useTemplates } from './templates.tsx';
import type { Chosen } from './new-from-template.tsx';

// The note surface loads only when a preview shows, as it does in History.
const NotePreview = lazy(() => import('./template-preview.tsx'));

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
  const [details, setDetails] = useState(false);
  const initialized = useRef(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const openSettings = useOpenSettings();
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
  const detailTitle = useRef<HTMLHeadingElement | null>(null);
  const returning = useRef(false);
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
    if (
      initialized.current ||
      settings.status !== 'ready' ||
      files.loading ||
      accountId === null
    )
      return;
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(
        lastTemplateKey(accountId, workspaceId),
      );
    } catch {
      /* Storage can be unavailable. */
    }
    setSelected(firstTemplate(choices, last));
    initialized.current = true;
    searchRef.current?.focus();
  }, [choices, settings.status, files.loading, accountId, workspaceId]);
  useEffect(() => {
    if (details) detailTitle.current?.focus();
    else if (returning.current) {
      returning.current = false;
      (
        searchRef.current ??
        listRef.current?.querySelector<HTMLButtonElement>(
          '[aria-pressed="true"]',
        )
      )?.focus();
    }
  }, [details]);
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
  const highlights = useMemo(
    () =>
      templatePreviewHighlights(readyPreview?.text ?? '', previewName, instant),
    [readyPreview?.text, previewName, instant],
  );
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
    if (accountId !== null) {
      try {
        window.localStorage.setItem(
          lastTemplateKey(accountId, workspaceId),
          selected,
        );
      } catch {
        /* A blocked preference does not stop note creation. */
      }
    }
    onChoose({ folder: destination, text: readyPreview.text, name });
  };

  const choose = (id: string, showDetails: boolean): void => {
    if (selected !== id) {
      setPreview(null);
      setInstant(new Date());
      setShowProblem(false);
      setNameTouched(false);
      setSelected(id);
    }
    if (showDetails) setDetails(true);
  };
  const back = (): void => {
    returning.current = true;
    setDetails(false);
  };
  const manage = (): void => {
    onClose();
    openSettings('templates');
  };
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 px-3 lg:h-13 lg:pl-5">
        <span className="lg:hidden">
          <Button
            variant="ghost"
            icon={details ? <ChevronLeftIcon /> : <CloseIcon />}
            label={details ? 'Back to templates' : 'Close template dialog'}
            onClick={details ? back : onClose}
          />
        </span>
        <h3
          ref={detailTitle}
          tabIndex={-1}
          className="m-0 min-w-0 flex-1 truncate text-ui font-semibold text-strong outline-none max-lg:text-center"
        >
          <span className="hidden lg:inline">New note from template</span>
          <span className="lg:hidden">
            {details ? selectedLabel : 'New note from template'}
          </span>
        </h3>
        <span className={details ? 'hidden lg:inline-flex' : 'inline-flex'}>
          <button
            type="button"
            aria-label="Manage templates"
            title="Manage templates"
            onClick={manage}
            className={buttonClassName({ variant: 'ghost', size: 'sm' })}
          >
            <SettingsIcon />
            <span className="hidden lg:inline">Manage templates</span>
          </button>
        </span>
        <span className={details ? 'inline-flex' : 'hidden lg:inline-flex'}>
          <Button
            variant="ghost"
            icon={<CloseIcon />}
            label="Close template dialog"
            onClick={onClose}
          />
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden px-5 py-3">
        <div className="grid h-full min-h-0 min-w-0 gap-5 lg:grid-cols-3">
          <div
            className={
              details
                ? 'hidden min-h-0 min-w-0 flex-col lg:flex'
                : 'flex min-h-0 min-w-0 flex-col'
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
                {choices.length > 0 ? (
                  <TextField
                    id="search-templates"
                    label="Search templates"
                    value={search}
                    onChange={setSearch}
                    inputRef={searchRef}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        !window.matchMedia('(min-width: 1024px)').matches &&
                        selected !== null
                      ) {
                        event.preventDefault();
                        setDetails(true);
                        return;
                      }
                      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
                        return;
                      event.preventDefault();
                      if (matching.length === 0) return;
                      const index = matching.findIndex(
                        (choice) => choice.id === selected,
                      );
                      const next =
                        matching[
                          ((index < 0
                            ? event.key === 'ArrowDown'
                              ? -1
                              : 0
                            : index) +
                            (event.key === 'ArrowDown' ? 1 : -1) +
                            matching.length) %
                            matching.length
                        ];
                      if (next !== undefined) choose(next.id, false);
                    }}
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
                    className="flex min-h-0 flex-1 flex-col overflow-auto"
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
                      const choice = matching[next];
                      if (choice !== undefined) choose(choice.id, false);
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
                        onClick={() => choose(choice.id, true)}
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
                        <span
                          className="inline-flex text-muted lg:hidden"
                          aria-hidden="true"
                        >
                          <ChevronRightIcon />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div
            className={
              details
                ? 'min-h-0 min-w-0 overflow-y-auto lg:col-span-2'
                : 'hidden min-h-0 min-w-0 overflow-y-auto lg:col-span-2 lg:block'
            }
          >
            {selected === null ? (
              <p className="text-control text-muted">Choose a template</p>
            ) : (
              <>
                <div className="grid min-w-0 gap-x-3 sm:grid-cols-2">
                  <TextField
                    id="template-note-name"
                    label="Name"
                    value={name}
                    reserveErrorSpace
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
                    {store === null || accountId === null ? null : (
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
                          highlights={highlights}
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
      </div>
      <div className={details ? 'shrink-0' : 'hidden shrink-0 lg:block'}>
        <DialogFooter>
          {selected === null ? null : (
            <p className="m-0 mr-auto hidden self-center text-control text-muted lg:block">
              Date and time are set when you create the note.
            </p>
          )}
          <span className="hidden lg:inline-flex">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </span>
          {selected === null ? null : (
            <Button
              className="max-lg:w-full"
              type="submit"
              disabled={!canCreate}
            >
              Create note
            </Button>
          )}
        </DialogFooter>
      </div>
    </form>
  );
}
