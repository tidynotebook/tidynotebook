/**
 * What the templates of a workspace are on this device (record 0149).
 *
 * A template is a live note below the template folder of the member, and
 * `isTemplatePath` of `@notesapp/core` is the one test of that. Every rule
 * here reads the note list that the frame already holds: which notes the
 * palette lists, what each row states, what a fill reads from the clock of
 * the device, and how this device keeps the last answer of the server. The
 * rules are pure, so they are tested without a browser.
 */
import {
  cleanFolderPath,
  isTemplatePath,
  templateFolderProblem,
  type CalendarDate,
  type ClockTime,
  type TemplateContext,
  type TemplateFolderProblem,
  type TemplateSettings,
} from '@notesapp/core';
import { dateOfInstant } from './calendar-month.ts';
import { cachedObject, type MemberSettingsState } from './member-settings.ts';
import { baseNameOf, displayNoteName, folderOf } from './note-name.ts';
import type { PaletteChoice, PalettePick } from './palette-items.ts';

/** The facts of a note that these rules read. */
export type TemplateCandidate = {
  readonly fileId: string;
  readonly path: string;
};

/** A creation destination belongs to the workspace where it was chosen. */
export type TemplateDestination = {
  readonly workspaceId: string;
  readonly folder: string;
};

/** Gate the dialog during the render before workspace-change effects run. */
export function templateDestinationFor(
  workspaceId: string,
  destination: TemplateDestination | null,
): string | null {
  return destination?.workspaceId === workspaceId ? destination.folder : null;
}

/** The name of the template settings in their browser settings key. */
export const templateSettingsName = 'templates';

/** The text that this device keeps for one answer of the server. */
export function formatCachedTemplateSettings(
  settings: TemplateSettings,
): string {
  return JSON.stringify({ folder: settings.folder });
}

/** The settings of a cached copy, or `null` when the copy does not parse. */
export function parseCachedTemplateSettings(
  source: string | null,
): TemplateSettings | null {
  const row = cachedObject(source);
  if (row === null) return null;
  const folder = row['folder'];
  // A folder that the server would not store is no copy of an answer.
  if (typeof folder !== 'string' || templateFolderProblem(folder) !== null)
    return null;
  return { folder };
}

/**
 * The templates that the palette lists, as rows of its second step.
 *
 * Every live note below the folder is a template, also in a subfolder, and
 * the open note is not, because a note never inserts itself. A row names the
 * note, and its subfolder below the template folder is the quiet fact at its
 * end, so two templates with one name are told apart. The rows sort by name,
 * then by subfolder, so a person finds a name where they expect it.
 */
export function templateChoices(
  notes: readonly TemplateCandidate[],
  folder: string,
  openFileId: string | null,
): readonly PaletteChoice[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  return notes
    .filter(
      (note) => note.fileId !== openFileId && isTemplatePath(note.path, folder),
    )
    .map((note): PaletteChoice => {
      const below = folderOf(note.path).slice(folder.length + 1);
      return {
        id: note.fileId,
        label: displayNoteName(baseNameOf(note.path)),
        detail: below === '' ? null : below,
      };
    })
    .sort(
      (left, right) =>
        collator.compare(left.label, right.label) ||
        collator.compare(left.detail ?? '', right.detail ?? ''),
    );
}

/**
 * The line under the folder field: how many templates the typed folder holds,
 * as a count and a whole phrase.
 */
export function templateCountLine(count: number, complete: boolean): string {
  if (!complete) return templateProblems.partial;
  if (count === 0) return 'This folder has no templates yet.';
  if (count === 1) return 'This folder has 1 template.';
  return `This folder has ${String(count)} templates.`;
}

/** The note list of the frame, as these rules read it. */
export type TemplateNoteList = {
  readonly notes: readonly TemplateCandidate[];
  /** True while the first read of the list has not answered. */
  readonly loading: boolean;
  /** False when the workspace holds more notes than the list. */
  readonly complete: boolean;
};

/**
 * The second step of Insert from template in the command palette.
 *
 * The palette lists the templates of the folder of the member. While the
 * settings or the note list load it says so, and with no settings at all it
 * states the one cause (record 0038). A list that is not complete can miss a
 * template, so the step says so, and it never claims that the folder is
 * empty. A complete folder with no note is an empty state whose one action
 * makes the first template in that folder.
 */
export function templatePalettePick(input: {
  readonly settings: MemberSettingsState<TemplateSettings>;
  readonly list: TemplateNoteList;
  readonly openFileId: string | null;
  readonly choose: (templateFileId: string) => void;
  readonly newTemplate: (folder: string) => void;
}): PalettePick {
  const { settings, list } = input;
  const folder = settings.status === 'ready' ? settings.settings.folder : '';
  return {
    placeholder: 'Search templates',
    choices: () => {
      if (settings.status === 'unavailable')
        return { status: 'unavailable', message: templateProblems.settings };
      if (settings.status === 'loading' || list.loading)
        return { status: 'loading', label: 'The templates are loading.' };
      return {
        status: 'ready',
        choices: templateChoices(list.notes, folder, input.openFileId),
        notice: list.complete ? null : templateProblems.partial,
      };
    },
    empty: {
      title: 'No templates',
      description: `Add a note to the folder ${folder} to use it as a template. You can change the folder in Settings.`,
      action: {
        label: 'New template',
        run: () => {
          input.newTemplate(folder);
        },
      },
    },
    noMatch: 'No template matches that.',
    choose: input.choose,
  };
}

/** The time of an instant on the clock of this device. */
export function timeOfInstant(instant: Date): ClockTime {
  return {
    hour: instant.getHours(),
    minute: instant.getMinutes(),
    second: instant.getSeconds(),
  };
}

/**
 * What a template reads when this device fills it at one instant.
 *
 * The date is the date of that instant, unless the caller states the date of
 * the note, as a daily note does (record 0102). The time is always the time
 * of the fill.
 */
export function templateContextAt(
  instant: Date,
  title: string,
  date: CalendarDate = dateOfInstant(instant),
): TemplateContext {
  return { date, time: timeOfInstant(instant), title };
}

/**
 * The folder to store from what the person typed, or `null` when there is
 * nothing to store.
 *
 * The folder applies when the person leaves the field, presses Enter, or
 * leaves the page, and not at every keystroke. A folder that cannot hold the
 * templates is not stored, and neither is the folder that the server holds.
 */
export function templateFolderToStore(
  typed: string,
  stored: TemplateSettings,
): string | null {
  const folder = cleanFolderPath(typed);
  if (templateFolderProblem(folder) !== null) return null;
  return folder === stored.folder ? null : folder;
}

/** What a person reads when a typed folder cannot hold the templates. */
export const templateFolderSentences: Readonly<
  Record<TemplateFolderProblem, string>
> = {
  empty: 'Type the name of a folder.',
  folder: 'That folder name cannot be stored. Change the name and try again.',
};

/**
 * What a person reads when a template does not reach the note, one sentence
 * for one cause. Each one states what happened and what to do next.
 */
export const templateProblems = {
  settings:
    'The template settings did not load. Connect to the internet and try again.',
  text: 'The template is not on this device, so it was not inserted. Connect to the internet and try again.',
  partial:
    'The list of notes is not complete, so some templates can be missing.',
} as const;

/**
 * What a person reads when the server refused a change of the folder.
 *
 * The server answers `invalid_path` for a folder that it cannot store, which
 * has its own sentence. Every other refusal takes the one sentence of the
 * problem that the caller already chose.
 */
export function templateSettingsProblem(
  status: number,
  general: string,
): string {
  return status === 422 ? templateFolderSentences.folder : general;
}
