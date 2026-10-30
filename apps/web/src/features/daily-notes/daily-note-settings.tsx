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
import { useEffect, useState, type ReactNode } from 'react';
import {
  cleanFolderPath,
  dailyNoteLayoutProblem,
  type DailyNoteSettings,
} from '@notesapp/core';
import {
  Switch,
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

  const close = (): void => {
    setFolder(settings.folder);
    setFormat(settings.format);
    setEditing(null);
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
      <SettingChoiceRow
        label="Name format"
        help={`Today's note: ${dailyNotePreview(today(), settings)}`}
        value={settings.format}
        onClick={() => setEditing('format')}
      />
      <SettingsDialog
        open={editing !== null}
        onClose={close}
        title={editing === 'folder' ? 'Save in' : 'Name format'}
        titleId="daily-layout-title"
        headerActions
        width="small"
        align="sheet"
      >
        <DialogBody>
          {editing === 'folder' ? (
            <>
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
            </>
          ) : (
            <TextField
              id="daily-format"
              label="Name format"
              value={format}
              onChange={setFormat}
              hint={
                problem === null
                  ? `Use YYYY, MM and DD for the date. Today: ${dailyNotePreview(today(), { folder: '', format })}`
                  : undefined
              }
              error={
                problem !== null && problem !== 'folder' ? sentence : undefined
              }
            />
          )}
        </DialogBody>
        {editing !== null ? (
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={problem !== null}
              onClick={() => {
                const next = layoutToStore({ folder, format }, settings);
                if (next !== null) onSave({ ...settings, ...next });
                setEditing(null);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        ) : null}
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
