/** Daily notes use the same template list rules and preview as note creation. */
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useParams } from 'react-router';
import type { DailyNoteSettings } from '@notesapp/core';
import {
  Button,
  DialogBody,
  DialogFooter,
  LoadingState,
  Notice,
  TextField,
  TemplateIcon,
  rowClassName,
} from '@notesapp/ui';
import { useLocalStore, useSession } from '../../app.tsx';
import { useFiles } from '../../shell/files.tsx';
import { readNoteText } from '../../shell/note-text.ts';
import { templateChoices } from '../../lib/templates.ts';
import {
  templatePreviewText,
  templatePreviewHighlights,
} from '../../lib/template-note.ts';
import { dailyNotePreview, effectiveTemplateId } from '../../lib/daily-note.ts';
import { displayNoteName } from '../../lib/note-name.ts';
import { SettingChoiceRow } from '../accounts/settings-section.tsx';
import { SettingsDialog } from '../accounts/settings-dialog.tsx';
import { useTemplates } from '../templates/templates.tsx';
import { today } from './daily-notes.tsx';
const TemplatePreview = lazy(() => import('../templates/template-preview.tsx'));

export function DailyTemplatePicker({
  settings,
  onSave,
}: {
  readonly settings: DailyNoteSettings;
  readonly onSave: (settings: DailyNoteSettings) => void;
}): ReactNode {
  const files = useFiles();
  const current = effectiveTemplateId(settings, files.notes);
  const note = files.notes.find((note) => note.fileId === current);
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingChoiceRow
        label="Template"
        help="Fills each new daily note."
        value={
          note === undefined
            ? 'No template'
            : displayNoteName(note.path.split('/').at(-1) ?? note.path)
        }
        disabled={files.loading}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <TemplateSelection
          settings={settings}
          selected={current}
          onClose={() => setOpen(false)}
          onSave={(templateFileId) => {
            onSave({ ...settings, templateFileId });
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function TemplateSelection({
  settings,
  selected: initial,
  onClose,
  onSave,
}: {
  readonly settings: DailyNoteSettings;
  readonly selected: string | null;
  readonly onClose: () => void;
  readonly onSave: (id: string | null) => void;
}): ReactNode {
  const files = useFiles();
  const templates = useTemplates();
  const store = useLocalStore().store;
  const accountId = useSession().account?.accountId ?? null;
  const { workspaceId = '' } = useParams();
  const [selected, setSelected] = useState(initial);
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{
    id: string;
    text: string | null;
  } | null>(null);
  const [instant] = useState(() => new Date());
  const folder =
    templates.settings.status === 'ready'
      ? templates.settings.settings.folder
      : null;
  const choices = useMemo(
    () => (folder === null ? [] : templateChoices(files.notes, folder, null)),
    [files.notes, folder],
  );
  const current = files.notes.find((note) => note.fileId === initial);
  const outside =
    current !== undefined &&
    !choices.some((choice) => choice.id === current.fileId)
      ? current
      : null;
  const matching = choices.filter((choice) =>
    `${choice.label} ${choice.detail ?? ''}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const chosen = files.notes.find((note) => note.fileId === selected);
  const ready = preview?.id === selected ? preview : null;
  useEffect(() => {
    if (selected === null || store === null || accountId === null) return;
    let cancelled = false;
    void readNoteText(store, accountId, workspaceId, selected).then((text) => {
      if (!cancelled) setPreview({ id: selected, text });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, store, accountId, workspaceId, attempt]);
  const previewPath = dailyNotePreview(today(), settings);
  const name = previewPath.split('/').at(-1) ?? previewPath;
  const choose = (id: string | null): void => {
    if (id !== selected) setPreview(null);
    setSelected(id);
  };
  return (
    <SettingsDialog
      open
      onClose={onClose}
      title="Choose template"
      titleId="daily-template-title"
    >
      <DialogBody>
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <TextField
              id="daily-template-search"
              listSearch
              label="Search templates"
              value={search}
              onChange={setSearch}
              autoFocus
            />
            <div
              className="lg:h-80 lg:overflow-y-auto"
              role="group"
              aria-label="Templates"
              onKeyDown={(event) => {
                if (
                  !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
                )
                  return;
                const buttons = [
                  ...event.currentTarget.querySelectorAll('button'),
                ];
                const at = buttons.findIndex(
                  (button) => button === event.target,
                );
                if (at < 0) return;
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? buttons.length - 1
                      : (at +
                          (event.key === 'ArrowDown' ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }}
            >
              <button
                type="button"
                className={rowClassName({
                  selected: selected === null,
                  className: 'w-full text-left',
                })}
                aria-pressed={selected === null}
                onClick={() => choose(null)}
              >
                No template
              </button>
              {outside === null ? null : (
                <button
                  type="button"
                  className={rowClassName({
                    selected: selected === outside.fileId,
                    className: 'w-full text-left',
                  })}
                  aria-pressed={selected === outside.fileId}
                  onClick={() => choose(outside.fileId)}
                >
                  {displayNoteName(
                    outside.path.split('/').at(-1) ?? outside.path,
                  )}{' '}
                  <span className="text-secondary text-muted">
                    Current template
                  </span>
                </button>
              )}
              {folder === null ? (
                <Notice
                  tone="info"
                  message="Template settings are not available yet."
                />
              ) : files.loading ? (
                <LoadingState label="Reading templates" />
              ) : matching.length === 0 ? (
                <p className="text-secondary text-muted">
                  {choices.length === 0
                    ? `No templates in ${folder}. Add a note to this folder to use it as a template.`
                    : 'No matching templates.'}
                </p>
              ) : (
                matching.map((choice) => (
                  <button
                    type="button"
                    key={choice.id}
                    className={rowClassName({
                      selected: selected === choice.id,
                      className: 'w-full text-left',
                    })}
                    aria-pressed={selected === choice.id}
                    onClick={() => choose(choice.id)}
                  >
                    <TemplateIcon />
                    <span className="min-w-0 flex-1 truncate">
                      {choice.label}
                    </span>
                    {choices.some(
                      (other) =>
                        other.id !== choice.id && other.label === choice.label,
                    ) ? (
                      <span className="text-secondary text-muted">
                        {choice.detail}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            {files.limitNotice === null ? null : (
              <Notice tone="info" message="Some templates may be missing." />
            )}
          </div>
          <section
            aria-label="Template preview"
            className="min-w-0 lg:h-96 lg:overflow-y-auto"
          >
            <h3 className="mb-2 mt-0 text-group text-muted lg:sr-only">
              Preview
            </h3>
            {selected === null ? (
              <p className="mt-0 text-secondary text-muted">
                Daily notes will start empty.
              </p>
            ) : store === null || accountId === null || chosen === undefined ? (
              <Notice
                tone="info"
                message="The template is not available on this device."
              />
            ) : ready === null ? (
              <LoadingState label="Reading template" />
            ) : ready.text === null ? (
              <>
                <Notice
                  tone="problem"
                  message="The template could not be read."
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPreview(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  Try again
                </Button>
              </>
            ) : (
              <Suspense fallback={<LoadingState label="Loading preview" />}>
                <TemplatePreview
                  store={store}
                  accountId={accountId}
                  workspaceId={workspaceId}
                  path={chosen.path}
                  text={templatePreviewText(ready.text, name, instant)}
                  label="Daily note preview"
                  expandOnPhone
                  highlights={templatePreviewHighlights(
                    ready.text,
                    name,
                    instant,
                  )}
                />
              </Suspense>
            )}
          </section>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={
            selected !== null &&
            (ready?.text === null ||
              ready === null ||
              chosen === undefined ||
              store === null ||
              accountId === null)
          }
          onClick={() => onSave(selected)}
        >
          Done
        </Button>
      </DialogFooter>
    </SettingsDialog>
  );
}
