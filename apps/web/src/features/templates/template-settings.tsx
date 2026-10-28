import { SettingsDialog } from '../accounts/settings-dialog.tsx';
/**
 * The template folder of the member, as a field of the Settings page (record
 * 0149).
 *
 * The tree selects a folder. Done applies it; Back cancels the draft.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  cleanFolderPath,
  templateFolderProblem,
  type TemplateSettings,
} from '@notesapp/core';
import {
  Button,
  DialogBody,
  FolderIcon,
  DialogFooter,
  LoadingState,
  Notice,
} from '@notesapp/ui';
import { FolderTreePicker } from '../folders/folder-tree-picker.tsx';
import { knownFolderPaths } from '../../lib/folder-selection.ts';
import { useFiles } from '../../shell/files.tsx';
import {
  templateChoices,
  templateCountLine,
  templateFolderToStore,
} from '../../lib/templates.ts';
import { SettingChoiceRow } from '../accounts/settings-section.tsx';
import { useTemplates } from './templates.tsx';

/** The folder choice, applied with Done. */
function FolderField({
  settings,
  onSave,
}: {
  readonly settings: TemplateSettings;
  readonly onSave: (next: TemplateSettings) => void;
}): ReactNode {
  const files = useFiles();
  const [folder, setFolder] = useState(settings.folder);
  const [changing, setChanging] = useState(false);
  // A stored folder that changes, from this section or from another device,
  // is what the field shows next.
  useEffect(() => {
    setFolder(settings.folder);
  }, [settings.folder]);

  const cleaned = cleanFolderPath(folder);
  const problem = templateFolderProblem(cleaned);
  const count = useMemo(
    () => templateChoices(files.notes, settings.folder, null).length,
    [files.notes, settings.folder],
  );
  return (
    <div>
      <SettingChoiceRow
        label="Templates folder"
        valueIcon={<FolderIcon />}
        value={settings.folder}
        help={
          files.loading
            ? 'Loading templates'
            : templateCountLine(count, files.limitNotice === null)
        }
        onClick={() => setChanging(true)}
      />
      <SettingsDialog
        open={changing}
        onClose={() => {
          setFolder(settings.folder);
          setChanging(false);
        }}
        title="Save in"
        titleId="template-folder-title"
        headerActions
        width="small"
        align="sheet"
      >
        <DialogBody>
          <FolderTreePicker
            includeRoot={false}
            label="Folders"
            searchPlacement="header"
            folders={Array.from(
              new Set([
                settings.folder,
                ...knownFolderPaths(
                  files.notes.map((note) => note.path),
                  files.emptyFolders,
                ),
              ]),
            )}
            selected={folder}
            onSelect={setFolder}
            autoFocus
          />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setFolder(settings.folder);
              setChanging(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (problem === null) {
                const next = templateFolderToStore(folder, settings);
                if (next !== null) onSave({ folder: next });
                setChanging(false);
              }
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </SettingsDialog>
    </div>
  );
}

/** The template folder of the member in the open workspace. */
export function TemplateSettingsFields(): ReactNode {
  const templates = useTemplates();
  const state = templates.settings;

  if (state.status === 'loading')
    return (
      <LoadingState
        shape="list"
        rows={1}
        label="The template settings are loading."
      />
    );
  if (state.status === 'unavailable')
    return (
      <Notice
        tone="info"
        message="The template settings did not load. Connect to the internet to change them."
      />
    );
  return (
    <>
      <FolderField settings={state.settings} onSave={templates.save} />
      {templates.saveProblem === null ? null : (
        <Notice
          className="mt-3"
          tone="problem"
          message={templates.saveProblem}
        />
      )}
    </>
  );
}
