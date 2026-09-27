/**
 * The rules of the owner surface of a published link.
 *
 * Every rule that the publish dialog and the Published links screen follow
 * lives here, because Node cannot strip JSX and a rule inside a `.tsx` file
 * therefore has no unit test. The two components hold state, markup, and the
 * calls to the generated operations, and nothing else.
 *
 * The scope rule is not repeated here. `isNoteInScope` of `@notesapp/core` is
 * the one rule that decides what a folder link opens, and the count that the
 * folder dialog states reads that same rule, so the sentence a person confirms
 * and the notes the server later serves cannot disagree.
 *
 * `publishedLinkAddress` is the one place in this application that builds the
 * address a person copies. The client needs the whole address, because the
 * person pastes it somewhere else, and no operation of the contract answers
 * one. The clean home for that value is the create answer of the contract, and
 * until it holds one this function keeps the knowledge in a single tested
 * function rather than in a screen. The application never calls the address:
 * it is text that a person copies. The path itself comes from
 * `lib/reader-path.ts`, which the installed worker reads as well.
 */
import {
  isNoteInScope,
  maxPublishedLinksPerWorkspace,
  type PublicationScope,
} from '@notesapp/core';
import { problemSentence } from '../../lib/problem-text.ts';
import { readerPathPrefix } from '../../lib/reader-path.ts';
import { displayNoteName } from '../../lib/note-name.ts';
import { minPasswordLength } from '../../lib/password-policy.ts';
import { relativeTime } from '../../lib/relative-time.ts';

/**
 * The one name of the owner screen.
 *
 * The sidebar, the command palette and the screen itself read it here, so the
 * shell names the screen without loading it.
 */
export const publishedLinksTitle = 'Published links';

/**
 * The address that the owner copies, once.
 *
 * The origin is the origin that serves this application, which is the origin
 * that serves the reader path as well. An empty token answers an empty text,
 * so a failed create can never produce an address that looks usable.
 */
export function publishedLinkAddress(origin: string, token: string): string {
  if (token === '') return '';
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}${readerPathPrefix}${token}`;
}

/** How long a new link lasts, as the dialog offers it. */
export type ExpiryChoice = 'never' | 'day' | 'week' | 'month';

/** The choices of the expiry field, in the order the field shows them. */
export const expiryChoices: readonly {
  readonly value: ExpiryChoice;
  readonly label: string;
}[] = [
  { value: 'never', label: 'No expiry' },
  { value: 'day', label: 'In 1 day' },
  { value: 'week', label: 'In 7 days' },
  { value: 'month', label: 'In 30 days' },
];

/** How many milliseconds each choice adds, or `null` for no expiry. */
const expirySpans: Readonly<Record<ExpiryChoice, number | null>> = {
  never: null,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
};

/**
 * Reads one expiry choice from the value of the field.
 *
 * A value that is not a choice reads as `never`. The field offers four values
 * and nothing else, so an unknown value is a defect and not an instruction:
 * the safe answer is the link that the person can still revoke, never an
 * instant that nobody asked for.
 */
export function parseExpiryChoice(value: string): ExpiryChoice {
  const found = expiryChoices.find((choice) => choice.value === value);
  return found === undefined ? 'never' : found.value;
}

/**
 * The instant that one choice means, or `null` for a link with no expiry.
 *
 * The answer is the instant that the contract takes. The function is pure and
 * reads the current instant as a number, so a test states both ends.
 */
export function expiryInstant(
  choice: ExpiryChoice,
  now: number,
): string | null {
  const span = expirySpans[choice];
  if (span === null) return null;
  return new Date(now + span).toISOString();
}

/** A whole phrase for a number of notes, never a bare suffix. */
export function noteCountPhrase(count: number): string {
  if (count <= 0) return 'no note';
  if (count === 1) return '1 note';
  return `${String(count)} notes`;
}

/** How many notes of this list one link opens now. */
export function notesInScope(
  scope: PublicationScope,
  notes: readonly { readonly fileId: string; readonly path: string }[],
): number {
  return notes.filter((note) =>
    isNoteInScope(scope, { ...note, deleted: false }),
  ).length;
}

/**
 * What a folder link publishes, stated before the person confirms it.
 *
 * Three short sentences, because the reach of a folder link is the one fact
 * that a person can get wrong: it lists the names, it opens what is there
 * now, and it opens what arrives later.
 */
export function folderScopeSentences(noteCount: number): readonly string[] {
  return [
    'This link lists the name of every note in this folder.',
    `It opens ${noteCountPhrase(noteCount)} now.`,
    'It also opens every note that you add to this folder later.',
  ];
}

/** What a note link publishes. */
export const noteScopeSentence =
  'This link opens one note. A person who has the link reads it without an account.';

/**
 * The rule of the password field, stated before anything is sent.
 *
 * The length is the one policy of `../../lib/password-policy.ts`, which the
 * setup screen reads as well, so the two fields cannot state two rules. This
 * field adds the one fact that the setup field does not have: an empty value
 * is an answer here, and it makes a link that opens without a password.
 */
export const linkPasswordRule = `Leave this empty for a link that opens without a password. A password needs at least ${String(minPasswordLength)} characters.`;

/** One link of the owner list, in the shape that the screen reads. */
export type OwnedLink = {
  readonly publicationId: string;
  readonly scope: PublicationScope;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly passwordProtected: boolean;
  /** Whether an administrator took the link down after a report (0119). */
  readonly takenDown: boolean;
};

/**
 * The name of what one link opens.
 *
 * A note link names its note through the note list, so a rename shows the
 * new name. A note that left the list keeps its link, and the row says so, so
 * the person can revoke it.
 */
export function linkTitle(
  scope: PublicationScope,
  notes: readonly { readonly fileId: string; readonly path: string }[],
): string {
  if (scope.kind === 'folder') return scope.path;
  const note = notes.find((entry) => entry.fileId === scope.fileId);
  return note === undefined
    ? 'A note that is not in your notes'
    : displayNoteName(note.path);
}

/**
 * The facts about one link, in the order the row states them.
 *
 * It carries what the link opens, whether a password guards it, when it
 * stops, and when the owner made it. No instant reaches the person as it is
 * stored: every one of them is how long ago, or how long from now.
 *
 * They are separate facts and not one joined sentence, because a row shows
 * one name and a small number of facts, and a screen that reads four of them
 * joined by a middle dot is reading a string that nothing can lay out. The
 * screen shows the first two and keeps the rest for the tooltip of the row.
 *
 * A link that an administrator took down says so first, because it opens
 * nothing now and its owner cannot make it live again (record 0119).
 */
export function linkFacts(
  link: OwnedLink,
  noteCount: number,
  now: number,
): readonly string[] {
  const parts: string[] = link.takenDown ? [takenDownFact] : [];
  parts.push(
    link.scope.kind === 'folder'
      ? `Folder with ${noteCountPhrase(noteCount)}`
      : 'One note',
  );
  if (link.passwordProtected) parts.push('Password');
  parts.push(expiryPhrase(link.expiresAt, now));
  const made = relativeTime(link.createdAt, now);
  if (made !== '') parts.push(`published ${made}`);
  return parts;
}

/** The fact of a link that an administrator took down. */
export const takenDownFact = 'Taken down by an administrator';

/** How many facts of a link one row shows before the rest go to its tooltip. */
export const shownLinkFacts = 2;

/** When a link stops, in words. */
export function expiryPhrase(expiresAt: string | null, now: number): string {
  if (expiresAt === null) return 'No expiry';
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return 'No expiry';
  if (at <= now) return 'Expired';
  // Under a minute reads as `just now` on the shared scale, which says the
  // wrong thing about a link that has not stopped yet.
  if (at - now < 60_000) return 'Stops in a moment';
  const when = relativeTime(expiresAt, now);
  return when === '' ? 'No expiry' : `Stops ${when}`;
}

/**
 * The links in the order the screen lists them.
 *
 * The newest link comes first, because a person who has just published one
 * looks for it at the top. Two links made in the same millisecond, which one
 * import can produce, keep a stable order by their name.
 */
export function sortLinks<T extends OwnedLink>(
  links: readonly T[],
  titleOf: (link: T) => string,
): readonly T[] {
  return [...links].sort((left, right) => {
    const leftAt = Date.parse(left.createdAt);
    const rightAt = Date.parse(right.createdAt);
    const leftOk = Number.isFinite(leftAt);
    const rightOk = Number.isFinite(rightAt);
    if (leftOk && rightOk && leftAt !== rightAt) return rightAt - leftAt;
    if (leftOk !== rightOk) return leftOk ? -1 : 1;
    const leftName = titleOf(left);
    const rightName = titleOf(right);
    return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
  });
}

/**
 * The one sentence for a create that the server refused.
 *
 * The workspace limit is the one cause that the shared sentences answer
 * wrongly: they speak of the room that notes take, and this refusal is about
 * the number of links. Every other cause keeps the shared sentence.
 */
export function publishFailureSentence(
  code: string | null,
  status: number | null,
): string {
  if (code === 'quota_exceeded')
    return `This workspace holds ${String(maxPublishedLinksPerWorkspace)} published links. Revoke a link, then publish again.`;
  return problemSentence(code, status);
}
