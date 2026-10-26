/**
 * The daily note settings of the member, as fields of the Settings page
 * (records 0099, 0100 and 0101).
 *
 * The Settings page holds every setting of the product. These belong to the
 * member in the open workspace, and the provider of `daily-notes.tsx` reads
 * and stores them, so the sidebar and this section read one value.
 *
 * The template and the start choice apply when a person picks them. The
 * folder and the name format are text, so they apply when the person leaves
 * the fields, presses Enter, or leaves the page: a half typed format would
 * move the daily notes of the calendar at every keystroke. The preview under
 * them names the note of today as the typed layout writes it, and
 * `layoutToStore` decides what is stored.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  cleanFolderPath,
  dailyNoteLayoutProblem,
  type DailyNoteSettings,
} from '@notesapp/core';
import {
  Checkbox,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  LoadingState,
  Notice,
  SelectField,
  TextField,
} from '@notesapp/ui';
import { FolderPicker } from '../folders/folder-picker.tsx';
import { knownFolderPaths } from '../../lib/folder-selection.ts';
import { useFiles } from '../../shell/files.tsx';
import { useStoreOnLeave } from '../../shell/store-on-leave.ts';
import {
  dailyNotePreview,
  effectiveTemplateId,
  layoutProblemSentences,
  layoutToStore,
  noTemplateValue,
  templateChoices,
  templateOfChoice,
} from '../../lib/daily-note.ts';
import { today, useDailyNotes } from './daily-notes.tsx';

/** The folder and the name format, stored when the person leaves them. */
function LayoutFields({
  settings,
  onSave,
}: {
  readonly settings: DailyNoteSettings;
  readonly onSave: (next: DailyNoteSettings) => void;
}): ReactNode {
  const [folder, setFolder] = useState(settings.folder);
  const files = useFiles();
  const [editing, setEditing] = useState<'folder' | 'format' | null>(null);
  const [format, setFormat] = useState(settings.format);
  // A stored layout that changes, from this section or from another device,
  // is what the fields show next.
  useEffect(() => {
    setFolder(settings.folder);
    setFormat(settings.format);
  }, [settings.folder, settings.format]);

  const layout = { folder: cleanFolderPath(folder), format };
  const problem = dailyNoteLayoutProblem(layout);
  const sentence =
    problem === null ? undefined : layoutProblemSentences[problem];

  // The typed layout is stored when it is whole and new.
  const leave = useStoreOnLeave((): void => {
    const next = layoutToStore({ folder, format }, settings);
    if (next !== null) onSave({ ...settings, ...next });
  });

  return (
    <div
      className="mt-4"
      onBlur={leave.onBlur}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) leave.onKeyDown(event);
      }}
    >
      <div className="mb-3 flex items-center gap-2 text-control">
        <span className="min-w-0 flex-1 break-words">
          Folder: {folder === '' ? 'No folder' : folder}
        </span>
        <Button variant="secondary" onClick={() => setEditing('folder')}>
          Change
        </Button>
      </div>
      <div className="mb-3 flex items-center gap-2 text-control">
        <span className="min-w-0 flex-1 break-words">
          Name format: {format}
        </span>
        <Button variant="secondary" onClick={() => setEditing('format')}>
          Change
        </Button>
      </div>
      <Dialog
        open={editing !== null}
        onClose={() => {
          leave.onBlur();
          setEditing(null);
        }}
        title={editing === 'folder' ? 'Save in' : 'Name format'}
        titleId="daily-layout-title"
        width="small"
        align="sheet"
      >
        <DialogBody>
          {editing === 'folder' ? (
            <>
              <TextField
                id="daily-folder"
                label="Folder name"
                value={folder}
                onChange={setFolder}
                error={problem === 'folder' ? sentence : undefined}
              />
              <FolderPicker
                folders={knownFolderPaths(
                  files.notes.map((note) => note.path),
                  files.emptyFolders,
                )}
                selected={folder}
                onSelect={setFolder}
                onDone={() => {
                  if (problem === null) {
                    leave.onBlur();
                    setEditing(null);
                  }
                }}
              />
            </>
          ) : (
            <TextField
              id="daily-format"
              label="Name format"
              value={format}
              onChange={setFormat}
              hint="Use YYYY, MM and DD for the date."
              error={
                problem !== null && problem !== 'folder' ? sentence : undefined
              }
            />
          )}
        </DialogBody>
        {editing === 'format' ? (
          <DialogFooter>
            <Button
              disabled={problem !== null}
              onClick={() => {
                leave.onBlur();
                setEditing(null);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        ) : null}
      </Dialog>
      <p className="mb-3 mt-0 text-control text-muted" aria-live="polite">
        {problem === null
          ? `Today's note: ${dailyNotePreview(today(), layout)}`
          : ''}
      </p>
    </div>
  );
}

/** The template field, the start choice, the folder and the name format. */
export function DailyNoteSettingsFields(): ReactNode {
  const files = useFiles();
  const daily = useDailyNotes();
  const choices = useMemo(() => templateChoices(files.notes), [files.notes]);
  const state = daily.settings;

  if (state.status === 'loading')
    return (
      <LoadingState
        shape="list"
        rows={2}
        label="The daily note settings are loading."
      />
    );
  if (state.status === 'unavailable')
    return (
      <Notice
        tone="info"
        message="The daily note settings did not load. Connect to the internet to change them."
      />
    );
  const settings = state.settings;
  return (
    <>
      <SelectField
        id="daily-template"
        label="Template"
        value={effectiveTemplateId(settings, files.notes) ?? noTemplateValue}
        options={choices}
        onChange={(value) => {
          daily.save({ ...settings, templateFileId: templateOfChoice(value) });
        }}
      />
      <Checkbox
        id="daily-open-on-start"
        label="Open today's note when the app opens"
        checked={settings.openOnStart}
        onChange={(checked) => {
          daily.save({ ...settings, openOnStart: checked });
        }}
      />
      <LayoutFields settings={settings} onSave={daily.save} />
      {daily.saveProblem === null ? null : (
        <Notice className="mt-3" tone="problem" message={daily.saveProblem} />
      )}
    </>
  );
}
