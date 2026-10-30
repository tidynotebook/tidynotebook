import {
  Inline,
  Inset,
  bareFieldClassName,
  Button,
  Dialog,
  EmptyState,
  FileTextIcon,
  LoadingState,
  Notice,
  rowClassName,
  SearchIcon,
} from '@notesapp/ui';
/**
 * The one command palette of the application.
 *
 * `Cmd or Ctrl + P` opens it, and `Cmd or Ctrl + O` stays as an alias for
 * the people who learned it. There is no second search surface: the header
 * affordance opens this same dialog at every width, so a phone can search.
 *
 * An empty query lists the notes that changed last. A query lists the notes
 * whose name matches, then the notes whose text matches, then the actions.
 * The list is one `listbox`; the input keeps focus and points at the
 * highlighted row with `aria-activedescendant`.
 *
 * A content match shows the part of the note that matched. The excerpt is a
 * list of plain parts, so the marked words are real elements and no markup
 * from a note is ever put into the page.
 *
 * Every row reads `rowClassName`, the one recipe of a row, and every action
 * carries the glyph it carries in the sidebar and in the menus, from
 * `./action-icons.tsx` (decision 0065). A note row states its folder as a
 * quiet fact at the end of the row, so two notes with one name are told
 * apart.
 *
 * An action with a second step, such as Insert from template, does not
 * close the palette: the one list turns into the choices of that action,
 * with the same search field and the same keys (record 0149). Backspace in
 * an empty field goes back to the actions, and Escape closes the palette.
 */
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { searchFiles as searchRemote } from '@notesapp/api-client';
import type { LocalStore } from '@notesapp/sync';

import { actionIcon, emptyStateIcon } from './action-icons.tsx';
import { KeyHint } from './key-hint.tsx';
import {
  activeRowIndex,
  searchContent,
  paletteNoteLabel,
  pickAnnouncement,
  rankActions,
  rankChoices,
  rankNotes,
  type NoteMatch,
  type PaletteAction,
  type PaletteChoice,
  type PaletteHit,
  type PaletteNote,
} from '../lib/palette-items.ts';

import {
  currentContentSearch,
  startContentSearch,
  type ContentSearchAnswer,
} from '../lib/content-search-state.ts';

/**
 * The search of the device reads the plain text of each note through the
 * Markdown parser, which the first screen does not need, so it loads with
 * the first search (record 0177).
 */
function loadDeviceSearch(): Promise<
  (typeof import('./device-search.ts'))['searchLocal']
> {
  return import('./device-search.ts').then((module) => module.searchLocal);
}

/** How many notes the list can hold at once. */
const noteLimit = 12;

/** How long the palette waits after a keystroke before it searches. */
const searchDelayMs = 150;

/** One row of the rendered list. */
type Row =
  | { readonly kind: 'note'; readonly id: string; readonly match: NoteMatch }
  | {
      readonly kind: 'action';
      readonly id: string;
      readonly action: PaletteAction;
    }
  | {
      readonly kind: 'choice';
      readonly id: string;
      readonly choice: PaletteChoice;
    };

/** The class of the quiet label above a group of rows. */

/** Reads the content matches of one query from this device and the server. */
function useContentHits(
  query: string,
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string,
): {
  readonly hits: readonly PaletteHit[];
  readonly offline: boolean;
  readonly pending: boolean;
} {
  const request = useMemo(
    () => ({ query, store, accountId, workspaceId }),
    [query, store, accountId, workspaceId],
  );
  const [answer, setAnswer] = useState<ContentSearchAnswer | null>(null);

  useEffect(() => {
    const needle = query.trim();
    if (needle === '') return;
    let cancel = (): void => {};
    const timer = window.setTimeout(() => {
      const search = startContentSearch(
        request,
        () =>
          searchContent(
            async () =>
              store === null || accountId === null
                ? []
                : (await loadDeviceSearch())(
                    needle,
                    await store.listSearchFiles(accountId, workspaceId),
                  ),
            navigator.onLine
              ? async () => {
                  const result = await searchRemote({
                    path: { workspaceId },
                    query: { query: needle, limit: 50 },
                  });
                  return result.error !== undefined || result.data === undefined
                    ? []
                    : result.data.hits;
                }
              : null,
          ),
        setAnswer,
      );
      cancel = search.cancel;
      void search.done;
    }, searchDelayMs);
    return () => {
      cancel();
      window.clearTimeout(timer);
    };
  }, [query, store, accountId, workspaceId, request]);

  const current = currentContentSearch(request, answer);
  return {
    hits: current?.hits ?? [],
    offline: current?.offline ?? false,
    pending: query.trim() !== '' && current === null,
  };
}

/** What the palette passes to the body of its open dialog. */
type PaletteProps = {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly notes: readonly PaletteNote[];
  readonly store: LocalStore | null;
  readonly accountId: string | null;
  /**
   * Reads the actions. The open palette reads them once, so the rows of a
   * note follow its state at the moment the palette opens.
   */
  readonly actions: () => readonly PaletteAction[];
};

/**
 * The command palette dialog.
 *
 * The body of the dialog mounts when the palette opens and goes when it
 * closes, so every open starts with an empty field, the first row chosen and
 * the list of actions, and no row of an earlier open can answer a fast Enter.
 * The work a person chose stays here, because it runs after the body is gone.
 */
export function CommandPalette({
  open,
  onOpenChange,
  ...props
}: PaletteProps & {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactNode {
  // The work a person chose. It runs once the dialog has closed, and not in
  // the press that chose it. The dialog makes the page inert while it is open
  // and gives the focus back to what opened it as it closes, so an action
  // that ran inside the dialog could not take the focus: a format action lost
  // the caret of the note, a dialog that an action opened lost its field, and
  // a template went nowhere. React runs the clean up of the dialog that
  // closes before the effects of the same commit, so this effect runs on a
  // page that is live again, with the focus back where it was.
  const [chosen, setChosen] = useState<{ readonly run: () => void } | null>(
    null,
  );
  useEffect(() => {
    if (open || chosen === null) return;
    setChosen(null);
    chosen.run();
  }, [open, chosen]);

  if (!open) return null;
  return (
    <PaletteDialog
      {...props}
      onClose={() => onOpenChange(false)}
      closeThen={(work) => {
        setChosen({ run: work });
        onOpenChange(false);
      }}
    />
  );
}

/** The open palette: its field, its one list and its keys. */
function PaletteDialog({
  workspaceId,
  workspaceName,
  notes,
  store,
  accountId,
  actions: readActions,
  onClose,
  closeThen,
}: PaletteProps & {
  readonly onClose: () => void;
  /** Closes the palette, then runs one piece of work. */
  readonly closeThen: (work: () => void) => void;
}): ReactNode {
  const navigate = useNavigate();
  const actions = useMemo(() => readActions(), [readActions]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  // The action whose choices the palette lists, by its identifier, so the
  // step reads the newest choices of that action at every render: the list
  // can still be loading when the step opens.
  const [stepId, setStepId] = useState<string | null>(null);
  const stepAction =
    stepId === null
      ? null
      : (actions.find((action) => action.id === stepId) ?? null);
  const step = stepAction?.pick ?? null;
  // The choices are built once for each step that opens, and again only when
  // the action gives new ones.
  const stepChoices = useMemo(() => step?.choices() ?? null, [step]);
  const content = useContentHits(
    step === null ? query : '',
    store,
    accountId,
    workspaceId,
  );

  const rows = useMemo<readonly Row[]>(() => {
    if (stepChoices !== null)
      return stepChoices.status === 'ready'
        ? rankChoices(query, stepChoices.choices).map((choice): Row => ({
            kind: 'choice',
            id: `palette-choice-${choice.id}`,
            choice,
          }))
        : [];
    const noteRows = rankNotes(query, notes, content.hits, noteLimit).map(
      (match): Row => ({
        kind: 'note',
        id: `palette-note-${match.fileId}`,
        match,
      }),
    );
    const actionRows = rankActions(query, actions).map((action): Row => ({
      kind: 'action',
      id: `palette-action-${action.id}`,
      action,
    }));
    return [...noteRows, ...actionRows];
  }, [stepChoices, query, notes, content.hits, actions]);

  useEffect(() => {
    setSelected(0);
  }, [query, stepId]);

  // An action that leaves while its step is open, such as the actions of a
  // note that closed, takes the palette back to the list of actions.
  useEffect(() => {
    if (stepId !== null && step === null) setStepId(null);
  }, [stepId, step]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected, rows]);

  const run = (row: Row | undefined): void => {
    if (row === undefined) return;
    if (row.kind === 'note') {
      const fileId = row.match.fileId;
      closeThen(() => {
        void navigate(`/w/${workspaceId}/notes/${fileId}`);
      });
      return;
    }
    if (row.kind === 'choice') {
      const choose = step?.choose;
      const id = row.choice.id;
      if (choose !== undefined)
        closeThen(() => {
          choose(id);
        });
      return;
    }
    const { action } = row;
    if (action.pick !== undefined) {
      // The palette stays open and lists the choices of the action.
      setStepId(action.id);
      setQuery('');
      inputRef.current?.focus();
      return;
    }
    closeThen(action.run);
  };

  // The marked row, which is always a row of the list (`activeRowIndex`).
  const active = activeRowIndex(selected, rows.length);
  const activeId = rows[active]?.id;
  // The first row of each kind carries a quiet section label, so notes and
  // actions read as two groups without leaving the one listbox. The choices
  // of a step carry the name of their action, so a person reads where they
  // are.
  const firstNote = rows.findIndex((row) => row.kind === 'note');
  const firstAction = rows.findIndex((row) => row.kind === 'action');
  const firstChoice = rows.findIndex((row) => row.kind === 'choice');
  const placeholder = step?.placeholder ?? 'Search notes, or type an action';
  const announcement =
    step === null || stepAction === null || stepChoices === null
      ? ''
      : pickAnnouncement(stepAction.label, step, stepChoices, rows.length);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Search notes and run actions"
      titleId="command-palette-title"
      hideTitle
      width="medium"
    >
      <Inline
        gap={2}
        padX={4}
        padY={1}
        align="center"
        as="div"
        className="border-b border-edge-line"
      >
        <span className="shrink-0 text-muted" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          className={bareFieldClassName()}
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-controls="command-palette-list"
          aria-activedescendant={activeId}
          autoComplete="off"
          onChange={(event): void => setQuery(event.target.value)}
          onKeyDown={(event): void => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected(rows.length === 0 ? 0 : (active + 1) % rows.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected(
                rows.length === 0
                  ? 0
                  : (active - 1 + rows.length) % rows.length,
              );
            } else if (event.key === 'Home') {
              event.preventDefault();
              setSelected(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              setSelected(Math.max(rows.length - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              run(rows[active]);
            } else if (
              event.key === 'Backspace' &&
              stepId !== null &&
              query === ''
            ) {
              event.preventDefault();
              setStepId(null);
            }
          }}
        />
        <span className="hidden shrink-0 sm:inline">
          <KeyHint keys="Escape" />
        </span>
      </Inline>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {stepChoices?.status === 'ready' && stepChoices.notice !== null ? (
        <Inset
          padX={4}
          padY={2}
          as="p"
          className="border-b border-edge-line text-secondary text-muted"
        >
          {stepChoices.notice}
        </Inset>
      ) : null}
      {step === null ? (
        <Inset pad={4} as="p" className="text-secondary text-muted">
          In {workspaceName}
          {content.offline ? ' · Offline, results from this device' : ''}
        </Inset>
      ) : null}
      <Inset
        ref={listRef}
        id="command-palette-list"
        pad={2}
        as="ul"
        className="max-h-80 list-none overflow-y-auto empty:hidden"
        role="listbox"
        aria-label={stepAction?.label ?? 'Results'}
      >
        {rows.map((row, index) => (
          <Fragment key={row.id}>
            {index === firstNote ? (
              <Inset
                as="li"
                padX={2}
                padY={1}
                role="presentation"
                className="text-group text-muted"
              >
                Notes
              </Inset>
            ) : null}
            {index === firstAction ? (
              <Inset
                as="li"
                padX={2}
                padY={1}
                role="presentation"
                className="text-group text-muted"
              >
                Actions
              </Inset>
            ) : null}
            {index === firstChoice ? (
              <Inset
                as="li"
                padX={2}
                padY={1}
                role="presentation"
                className="text-group text-muted"
              >
                {stepAction?.label}
              </Inset>
            ) : null}
            <li
              id={row.id}
              role="option"
              aria-selected={index === active}
              className={rowClassName({
                selected: index === active,
                className: '',
              })}
              onMouseEnter={() => setSelected(index)}
              onMouseDown={(event): void => {
                event.preventDefault();
                run(row);
              }}
            >
              <span
                className="inline-flex shrink-0 items-center text-muted"
                aria-hidden="true"
              >
                {row.kind === 'action' ? (
                  actionIcon(row.action.icon)
                ) : (
                  <FileTextIcon />
                )}
              </span>
              {row.kind === 'choice' ? (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    {row.choice.label}
                  </span>
                  {row.choice.detail === null ? null : (
                    <span className="shrink-0 truncate text-muted">
                      {row.choice.detail}
                    </span>
                  )}
                </>
              ) : row.kind === 'note' ? (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">
                      {paletteNoteLabel(row.match.path).name}
                    </span>
                    {row.match.excerpt === null ? null : (
                      <span className="truncate text-muted">
                        {row.match.excerpt.map((part, at) =>
                          part.marked ? (
                            <mark
                              key={at}
                              className="bg-transparent text-label text-accent"
                            >
                              {part.text}
                            </mark>
                          ) : (
                            <span key={at}>{part.text}</span>
                          ),
                        )}
                      </span>
                    )}
                  </span>
                  {paletteNoteLabel(row.match.path).folder === null ? null : (
                    <span className="max-w-1/3 shrink-0 truncate text-muted">
                      {paletteNoteLabel(row.match.path).folder}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    {row.action.label}
                  </span>
                  {row.action.keys === undefined ? null : (
                    <span className="shrink-0">
                      <KeyHint keys={row.action.keys} />
                    </span>
                  )}
                </>
              )}
            </li>
          </Fragment>
        ))}
      </Inset>
      {step === null || stepChoices === null ? (
        content.pending ? (
          <Inset as="p" className="text-secondary text-muted" role="status">
            Searching...
          </Inset>
        ) : rows.length === 0 ? (
          <Inset as="p" className="text-secondary text-muted" role="status">
            No note and no action matches that.
          </Inset>
        ) : null
      ) : stepChoices.status === 'loading' ? (
        <Inset padX={2} padY={2} as="div">
          <LoadingState shape="list" rows={3} label={stepChoices.label} />
        </Inset>
      ) : stepChoices.status === 'unavailable' ? (
        <Inset padX={2} padY={2} as="div">
          <Notice tone="info" message={stepChoices.message} />
        </Inset>
      ) : stepChoices.choices.length === 0 ? (
        // A list that is not complete states so above and claims no empty
        // folder.
        stepChoices.notice !== null ? null : (
          <EmptyState
            icon={
              stepAction === null ? undefined : emptyStateIcon(stepAction.icon)
            }
            title={step.empty.title}
            description={step.empty.description}
            action={
              step.empty.action === null ? undefined : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const fill = step.empty.action;
                    if (fill !== null) closeThen(fill.run);
                  }}
                >
                  {step.empty.action.label}
                </Button>
              )
            }
          />
        )
      ) : rows.length === 0 ? (
        <Inset as="p" className="text-secondary text-muted">
          {step.noMatch}
        </Inset>
      ) : null}
    </Dialog>
  );
}
