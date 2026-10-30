import { SettingsDialog } from '../accounts/settings-dialog.tsx';
/**
 * The daily note settings of the member, as fields of the Settings page
 * (records 0099, 0100 and 0101).
 *
 * The Settings page holds every setting of the product. These belong to the
 * member in the open workspace, and the provider of `daily-notes.tsx` reads
 * and stores them, so the sidebar and this section read one value.
 *
 * Template choices and layouts apply with Done. Back cancels a draft.
 * The start choice applies when the person selects it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  cleanFolderPath,
  dailyNoteLayoutProblem,
  type DailyNoteSettings,
} from '@notesapp/core';
import {
  Switch,
  SettingEditRow,
  Button,
  DialogBody,
  FolderIcon,
  DialogFooter,
  LoadingState,
  Notice,
  TextField,
} from '@notesapp/ui';
import { FolderTreePicker } from '../folders/folder-tree-picker.tsx';
import { knownFolderPaths } from '../../lib/folder-selection.ts';
import { useFiles } from '../../shell/files.tsx';
import { DailyTemplatePicker } from './daily-template-picker.tsx';
import {
  dailyNotePreview,
  layoutProblemSentences,
  layoutToStore,
} from '../../lib/daily-note.ts';
import { SettingChoiceRow } from '../accounts/settings-section.tsx';
import { today, useDailyNotes } from './daily-notes.tsx';

/** The folder and the name format, applied with Done. */
function LayoutFields({
  settings,
  onSave,
}: {
  readonly settings: DailyNoteSettings;
  readonly onSave: (next: DailyNoteSettings) => void;
}): ReactNode {
  const [folder, setFolder] = useState(settings.folder);
  const [format, setFormat] = useState(settings.format);
  const [editing, setEditing] = useState<'folder' | 'format' | null>(null);
  const formatButton = useRef<HTMLButtonElement | null>(null);
  const files = useFiles();
  useEffect(() => {
    setFolder(settings.folder);
    setFormat(settings.format);
  }, [settings.folder, settings.format]);
  const problem = dailyNoteLayoutProblem({
    folder: cleanFolderPath(folder),
    format,
  });
  const sentence =
    problem === null ? undefined : layoutProblemSentences[problem];
  const close = (): void => {
    setFolder(settings.folder);
    setFormat(settings.format);
    setEditing(null);
    if (editing === 'format')
      window.requestAnimationFrame(() => formatButton.current?.focus());
  };
  const save = (): void => {
    const next = layoutToStore({ folder, format }, settings);
    if (next !== null) onSave({ ...settings, ...next });
    setEditing(null);
    if (editing === 'format')
      window.requestAnimationFrame(() => formatButton.current?.focus());
  };
  return (
    <>
      <SettingChoiceRow
        label="Folder"
        valueIcon={<FolderIcon />}
        help="New daily notes go here."
        value={settings.folder === '' ? 'All notes' : settings.folder}
        onClick={() => setEditing('folder')}
      />
      {editing === 'format' ? (
        <SettingEditRow
          label="Edit name format"
          onCancel={close}
          disabled={problem !== null || format === settings.format}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <TextField
            id="daily-format"
            label="Name format"
            value={format}
            onChange={setFormat}
            autoFocus
            hint={
              problem === null
                ? `Use YYYY, MM and DD for the date. Today: ${dailyNotePreview(today(), { folder: '', format })}`
                : undefined
            }
            error={
              problem !== null && problem !== 'folder' ? sentence : undefined
            }
          />
        </SettingEditRow>
      ) : (
        <SettingChoiceRow
          label="Name format"
          buttonRef={formatButton}
          help={`Today's note: ${dailyNotePreview(today(), settings)}`}
          value={settings.format}
          onClick={() => setEditing('format')}
        />
      )}
      <SettingsDialog
        open={editing === 'folder'}
        onClose={close}
        title="Save in"
        titleId="daily-layout-title"
        headerActions
        width="small"
        align="sheet"
      >
        <DialogBody>
          <FolderTreePicker
            label="Folders"
            searchPlacement="header"
            folders={knownFolderPaths(
              files.notes.map((note) => note.path),
              files.emptyFolders,
            )}
            selected={folder}
            onSelect={setFolder}
            autoFocus
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={problem !== null} onClick={save}>
            Done
          </Button>
        </DialogFooter>
      </SettingsDialog>
    </>
  );
}

/** The template field, the start choice, the folder and the name format. */
export function DailyNoteSettingsFields(): ReactNode {
  const daily = useDailyNotes();
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
      <LayoutFields settings={settings} onSave={daily.save} />
      <DailyTemplatePicker settings={settings} onSave={daily.save} />
      <Switch
        label="Open today's note when the app opens"
        checked={settings.openOnStart}
        onChange={(checked) => {
          daily.save({ ...settings, openOnStart: checked });
        }}
      />
      {daily.saveProblem === null ? null : (
        <Notice tone="problem" message={daily.saveProblem} />
      )}
    </>
  );
}
