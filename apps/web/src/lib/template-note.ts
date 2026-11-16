/**
 * The name and the preview of a note from a template (issue 517, item 3).
 *
 * The template dialog proposes a name, checks the typed one, and fills the
 * template for its preview with the same fill that creation runs
 * (`newNoteTemplateText`). The rules are pure, so `template-note.test.ts`
 * states them without a browser.
 */
import { fillTemplate, formatCalendarDate } from '@notesapp/core';
import { dateOfInstant } from './calendar-month.ts';
import { freeNamedPath } from './new-note-draft.ts';
import {
  baseNameOf,
  cleanNoteBaseName,
  displayNoteName,
  joinNotePath,
  noteBaseNameProblem,
  noteNameProblem,
  storageNotePath,
} from './note-name.ts';
import { templateContextAt } from './templates.ts';

/**
 * The name that the template dialog proposes: the template name and the date
 * of the instant, made free in the destination folder, so "Weekly review
 * 2026-10-27" and then "Weekly review 2026-10-27 2" (issue 517, item 3).
 */
export function templateNoteName(
  takenPaths: readonly string[],
  folder: string,
  templateName: string,
  instant: Date,
): string {
  const name = `${templateName} ${formatCalendarDate(dateOfInstant(instant))}`;
  return displayNoteName(
    baseNameOf(freeNamedPath(takenPaths, folder, cleanNoteBaseName(name))),
  );
}

/**
 * States why a typed name cannot name a new note in `folder`, or `null`.
 *
 * The rules are those of rename: the name field holds one file name, the
 * whole path must be valid, and no other note of the folder may use the name
 * in any case.
 */
export function newNoteNameProblem(
  name: string,
  folder: string,
  takenPaths: readonly string[],
): string | null {
  const cleaned = cleanNoteBaseName(name);
  const own = noteBaseNameProblem(cleaned);
  if (own !== null) return own;
  const path = joinNotePath(folder, storageNotePath(cleaned));
  const whole = noteNameProblem(displayNoteName(path));
  if (whole !== null) return whole;
  const wanted = path.toLowerCase();
  if (takenPaths.some((taken) => taken.toLowerCase() === wanted))
    return `A note named ${cleaned} is already in this folder. Choose a different name.`;
  return null;
}

/**
 * The text of a new note from a template, as its preview shows it: the same
 * fill that creation runs, with the typed name as the title.
 */
export function templatePreviewText(
  template: string,
  name: string,
  instant: Date,
): string {
  return fillTemplate(
    template,
    templateContextAt(instant, cleanNoteBaseName(name)),
  );
}

/** Values of known placeholders, including custom date formats, for preview marks. */
export function templatePreviewHighlights(
  template: string,
  name: string,
  instant: Date,
): readonly string[] {
  return Array.from(template.matchAll(/\{\{[^{}]*\}\}/g), ([placeholder]) => {
    const value = templatePreviewText(placeholder, name, instant);
    return value === placeholder ? '' : value;
  }).filter((value) => value !== '');
}
