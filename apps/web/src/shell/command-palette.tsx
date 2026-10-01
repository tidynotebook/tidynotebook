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
import { searchLocal, type LocalStore } from '@notesapp/sync';
import {
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
import { displayNoteName } from '../lib/note-name.ts';
import { folderOf } from '../lib/relative-time.ts';
import { actionIcon, emptyStateIcon } from './action-icons.tsx';
import { KeyHint } from './key-hint.tsx';
import {
  activeRowIndex,
  mergeHits,
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
const groupLabelClassName =
  'px-2 pb-1 pt-2 text-control font-medium text-muted first:pt-1';

/** Reads the content matches of one query from this device and the server. */
function useContentHits(
  query: string,
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string,
): { readonly hits: readonly PaletteHit[]; readonly offline: boolean } {
  const [hits, setHits] = useState<readonly PaletteHit[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const needle = query.trim();
    if (needle === '') {
      setHits([]);
      setOffline(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async (): Promise<void> => {
        const localPromise =
          store === null || accountId === null
            ? Promise.resolve([])
            : store
                .listSearchFiles(accountId, workspaceId)
                .then((files) => searchLocal(needle, files));
        const remotePromise = navigator.onLine
          ? searchRemote({
              path: { workspaceId },
              query: { query: needle, limit: 50 },
            })
          : Promise.resolve(null);
        try {
          const [localHits, remoteResult] = await Promise.all([
            localPromise,
            remotePromise,
          ]);
          if (cancelled) return;
          const remoteHits =
            remoteResult === null ||
            remoteResult.error !== undefined ||
            remoteResult.data === undefined
              ? []
              : remoteResult.data.hits;
          setOffline(remoteResult === null);
          setHits(mergeHits(remoteHits, localHits));
        } catch {
          if (!cancelled) setHits([]);
        }
      })();
    }, searchDelayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, store, accountId, workspaceId]);

  return { hits, offline };
}

/** What the palette passes to the body of its open dialog. */
type PaletteProps = {
  readonly workspaceId: string;
  readonly notes: readonly PaletteNote[];
  readonly store: LocalStore | null;
  readonly accountId: string | null;
  readonly actions: readonly PaletteAction[];
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
  notes,
  store,
  accountId,
  actions,
  onClose,
  closeThen,
}: PaletteProps & {
  readonly onClose: () => void;
  /** Closes the palette, then runs one piece of work. */
  readonly closeThen: (work: () => void) => void;
}): ReactNode {
  const navigate = useNavigate();
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
      <div className="flex items-center gap-cluster border-b border-edge-line px-gutter">
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
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {stepChoices?.status === 'ready' && stepChoices.notice !== null ? (
        <p className="m-0 border-b border-edge-line px-gutter py-2 text-control text-muted">
          {stepChoices.notice}
        </p>
      ) : null}
      {content.offline ? (
        <p className="m-0 border-b border-edge-line px-gutter py-2 text-control text-muted">
          No connection. These results come from this device.
        </p>
      ) : null}
      <ul
        ref={listRef}
        id="command-palette-list"
        className="m-0 max-h-80 list-none overflow-y-auto p-2 empty:hidden"
        role="listbox"
        aria-label={stepAction?.label ?? 'Results'}
      >
        {rows.map((row, index) => (
          <Fragment key={row.id}>
            {index === firstNote ? (
              <li role="presentation" className={groupLabelClassName}>
                Notes
              </li>
            ) : null}
            {index === firstAction ? (
              <li role="presentation" className={groupLabelClassName}>
                Actions
              </li>
            ) : null}
            {index === firstChoice ? (
              <li role="presentation" className={groupLabelClassName}>
                {stepAction?.label}
              </li>
            ) : null}
            <li
              id={row.id}
              role="option"
              aria-selected={index === active}
              className={rowClassName({
                selected: index === active,
                className: 'md:min-h-8',
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
                      {displayNoteName(row.match.path)}
                    </span>
                    {row.match.excerpt === null ? null : (
                      <span className="truncate text-muted">
                        {row.match.excerpt.map((part, at) =>
                          part.marked ? (
                            <mark
                              key={at}
                              className="bg-transparent font-medium text-accent"
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
                  {folderOf(row.match.path) === null ? null : (
                    <span className="shrink-0 truncate text-muted">
                      {folderOf(row.match.path)}
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
      </ul>
      {step === null || stepChoices === null ? (
        rows.length === 0 ? (
          <p className="m-4 text-control text-muted">
            No note and no action matches that.
          </p>
        ) : null
      ) : stepChoices.status === 'loading' ? (
        <div className="px-2 pb-2">
          <LoadingState shape="list" rows={3} label={stepChoices.label} />
        </div>
      ) : stepChoices.status === 'unavailable' ? (
        <div className="px-2 pb-2">
          <Notice tone="info" message={stepChoices.message} />
        </div>
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
        <p className="m-4 text-control text-muted">{step.noMatch}</p>
      ) : null}
    </Dialog>
  );
}
