/**
 * The template folder of the member, as a field of the Settings page (record
 * 0149).
 *
 * The folder is text, so it applies when the person leaves the field,
 * presses Enter, or leaves the page, as the daily note folder does: a half
 * typed folder would change the list of the palette at every keystroke. The
 * line under the field counts the templates of the typed folder, and
 * `templateFolderToStore` decides what is stored.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  cleanFolderPath,
  templateFolderProblem,
  type TemplateSettings,
} from '@notesapp/core';
import { LoadingState, Notice, TextField } from '@notesapp/ui';
import { useFiles } from '../../shell/files.tsx';
import { useStoreOnLeave } from '../../shell/store-on-leave.ts';
import {
  templateChoices,
  templateCountLine,
  templateFolderSentences,
  templateFolderToStore,
} from '../../lib/templates.ts';
import { useTemplates } from './templates.tsx';

/** The folder field, stored when the person leaves it. */
function FolderField({
  settings,
  onSave,
}: {
  readonly settings: TemplateSettings;
  readonly onSave: (next: TemplateSettings) => void;
}): ReactNode {
  const files = useFiles();
  const [folder, setFolder] = useState(settings.folder);
  // A stored folder that changes, from this section or from another device,
  // is what the field shows next.
  useEffect(() => {
    setFolder(settings.folder);
  }, [settings.folder]);

  const cleaned = cleanFolderPath(folder);
  const problem = templateFolderProblem(cleaned);
  const count = useMemo(
    () => templateChoices(files.notes, cleaned, null).length,
    [files.notes, cleaned],
  );
  const leave = useStoreOnLeave((): void => {
    const next = templateFolderToStore(folder, settings);
    if (next !== null) onSave({ folder: next });
  });

  return (
    <div onBlur={leave.onBlur} onKeyDown={leave.onKeyDown}>
      <TextField
        id="template-folder"
        label="Folder"
        value={folder}
        onChange={setFolder}
        error={problem === null ? undefined : templateFolderSentences[problem]}
      />
      <p className="mb-3 mt-0 text-control text-muted" aria-live="polite">
        {problem !== null || files.loading
          ? ''
          : templateCountLine(count, files.limitNotice === null)}
      </p>
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
