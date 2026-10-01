/**
 * The document that a reader of a published link receives.
 *
 * Decision 0031 makes the published page one HTML document that the server
 * builds, and decision 0047 makes it the answer for every state of a link: the
 * note, the list of a folder, the password form, or the sentence that says the
 * link is not available. Record 0146 adds the one sentence under it that says
 * what to do next. This module writes that document and nothing
 * else. It reads no store, it resolves no address, and it holds no rule about
 * what a link opens, so a unit test drives every state of it.
 *
 * **The body is already safe.** The note arrives as the output of
 * `renderMarkdown`, which is the one sanitized renderer of the product. Every
 * other value that this module writes passes `escapeText` or `escapeAttribute`
 * first, so no name and no address can end an element or start an attribute.
 *
 * **The page holds no script.** There is no inline script, no module, and no
 * event attribute, so the content policy of `plugins/security-headers.ts` can
 * refuse every script source. The password form is therefore a plain form that
 * sends the form encoding of HTML, and the server answers this document again.
 *
 * **Presentation comes from the built application stylesheet.** The document
 * loads the stylesheet of the shell, so the page cannot drift from the theme.
 * The note body is generated markup that a class attribute cannot reach, so
 * the one class string below styles it through descendant variants, with every
 * value from the named scale and the central theme. That is the case the root
 * `AGENTS.md` names when it permits a typed adapter to set presentation in
 * TypeScript. `apps/web/src/tailwind.css` registers this file as a source, so
 * the build emits exactly these utilities, and
 * `tests/integration/published-styles.test.ts` proves that it does. The root
 * states no appearance, so the stylesheet paints the Default palette of the
 * preference of the device of the reader (record 0151).
 */

import type { ReportReason } from '@notesapp/core';

/** Text that a person reads, with every markup character removed. */
export function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** One attribute value, with the quote and the markup characters removed. */
export function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/**
 * The name of a note, as a person reads it.
 *
 * The stored path carries the folder and the one `.md` suffix, and both are
 * storage. A person reads the last segment without the suffix.
 */
export function readableNoteName(path: string): string {
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last.endsWith('.md') ? last.slice(0, -3) : last;
}

/** One note that a folder link lists. */
export type PublishedListEntry = {
  readonly name: string;
  readonly href: string;
};

/** What the page shows. */
export type PublishedPageView =
  /** The link opens nothing now, whatever the cause. */
  | { readonly kind: 'unavailable' }
  /** The link asks for a password. The words never state whether one failed. */
  | { readonly kind: 'locked' }
  /** One note, with the way back to the list of a folder link. */
  | {
      readonly kind: 'note';
      readonly name: string;
      /** The sanitized HTML of the note. */
      readonly body: string;
      /** The address of the list of this link, or `null` for a note link. */
      readonly listHref: string | null;
    }
  /** Every note that a folder link opens. */
  | {
      readonly kind: 'list';
      readonly notes: readonly PublishedListEntry[];
    }
  /** The report form of a link (record 0119). */
  | {
      readonly kind: 'report';
      readonly reasons: readonly ReportReason[];
    }
  /** The answer after a report, whatever the report stored. */
  | { readonly kind: 'reported' };

/** What the document needs besides the view. */
export type PublishedDocumentInput = {
  readonly view: PublishedPageView;
  /** The stylesheets of the built application document, in order. */
  readonly stylesheets: readonly string[];
  /** Where the form of this state sends its fields. */
  readonly formAction: string;
  /**
   * The address of the report page of this link, or `null`. A note and a
   * list carry it, so a reader can report what the link shows.
   */
  readonly reportHref?: string | null;
};

/**
 * The sentence of a link that opens nothing.
 *
 * It is the sentence of the refusal shape of the contract, so the page and the
 * two subresources of the reader path say one thing. Decision 0030 needs the
 * four causes to read alike, and one sentence is how that reads on a screen.
 */
export const unavailableSentence = 'This link is not available.';

/** The sentence of a link that asks for a password. */
export const lockedSentence = 'This link needs a password.';

/**
 * The words under the heading of a link that opens nothing.
 *
 * Record 0146 allows this one more sentence. It is the same for each of the
 * four causes of decision 0030, so it tells a reader what to do next and
 * nothing about why the link failed.
 */
export const unavailableHint =
  'Ask the person who sent you the link for a new one.';

/**
 * The words under the heading of a link that asks for a password. A wrong
 * password answers them again, unchanged (record 0146).
 */
export const lockedHint = 'Enter the password that you got with the link.';

/** The words of the empty list of a folder link. */
export const emptyListSentence = 'This folder holds no notes.';

/** The heading of the report page. */
export const reportHeading = 'Report this page';

/** The sentence under the heading of the report page. */
const reportSentence =
  'Tell the administrators of this server why this page is harmful. They can take the link down.';

/** The words of the report link at the foot of a page. */
const reportLinkWords = 'Report this page';

/** The sentence after a report. It is the same whatever the report stored. */
export const reportedSentence =
  'Thank you. The administrators of this server read each report.';

/** The words of each reason, in the order of the form. */
export const reportReasonWords: Readonly<Record<ReportReason, string>> = {
  phishing: 'It asks for a password, a payment or personal data',
  malware: 'It holds a harmful file',
  illegal: 'It holds illegal content',
  harassment: 'It attacks or threatens a person',
  spam: 'It is spam',
  other: 'Another reason',
};

/** The heading of the list of a folder link. */
const listHeading = 'Notes';

/** The words of the link back to the list of a folder link. */
const listLinkWords = 'All notes';

/** The layout of the one column of a page that shows content. */
export const pageClasses =
  'mx-auto max-w-note px-gutter py-8 sm:px-gutter-wide';

/**
 * The layout of a page that shows no content: a link that opens nothing and
 * a link that asks for a password.
 *
 * It is the narrow column in the middle of the screen of the screens before a
 * session, `AuthFrame` in `apps/web/src/features/accounts/accounts.tsx`, so a
 * reader meets one short block and not one line at the top of an empty page.
 */
const gateClasses =
  'mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-gutter py-10 sm:px-gutter-wide';

/** The heading of a page that shows no content, the title of a page. */
const gateHeadingClasses =
  'mb-2 mt-0 text-xl font-semibold tracking-heading text-strong';

/** The one sentence under the heading of a page that shows no content. */
const gateHintClasses = 'm-0 text-control text-muted';

/**
 * The typography of the note body.
 *
 * The markup comes from the sanitized renderer, so no class attribute of this
 * server reaches it. A descendant variant is the utility that does, and every
 * value below is a named step of the central theme: the note type scale, the
 * standard spacing scale, the tracking scale, and the semantic colours of the
 * theme registry.
 *
 * This page is the second renderer of one note, so its structure reads the
 * same as the editor of `packages/editor`: the same heading tightening, the
 * same quote bar, and a divider that a person can see on every palette.
 */
export const noteBodyClasses = [
  'text-note',
  '[&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:text-note-h1 [&_h1]:font-note-heading [&_h1]:tracking-display [&_h1]:text-strong',
  '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-note-h2 [&_h2]:font-note-heading [&_h2]:tracking-heading [&_h2]:text-strong',
  '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-note-h3 [&_h3]:font-note-heading [&_h3]:tracking-heading [&_h3]:text-strong',
  '[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:text-note-h4 [&_h4]:font-note-heading [&_h4]:text-strong',
  '[&_h5]:mt-4 [&_h5]:mb-2 [&_h5]:text-note-h5 [&_h5]:font-note-heading [&_h5]:text-strong',
  '[&_h6]:mt-4 [&_h6]:mb-2 [&_h6]:text-note-h6 [&_h6]:font-note-heading [&_h6]:text-strong',
  '[&_p]:my-4',
  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6',
  '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6',
  // A nested ordered list takes the next style of the one cycle of
  // `packages/markdown/src/ordered-markers.ts`, as the live preview draws it
  // (record 0089). A deeper selector wins, so each level states its own style,
  // through two turns of the cycle. `published-styles.test.ts` holds the copy.
  '[&_ol_ol]:list-lower-alpha [&_ol_ol_ol]:list-lower-roman',
  '[&_ol_ol_ol_ol]:list-decimal [&_ol_ol_ol_ol_ol]:list-lower-alpha [&_ol_ol_ol_ol_ol_ol]:list-lower-roman',
  '[&_li]:my-1',
  '[&_a]:text-accent [&_a]:underline',
  '[&_strong]:font-semibold',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-edge-line [&_blockquote]:pl-4 [&_blockquote]:text-muted',
  // An alert is a quote that states a tone, and the note surface draws the
  // same three colours for the five tones of GitHub. The title word states
  // which tone a person is reading.
  '[&_blockquote.notes-alert]:text-ink',
  '[&_blockquote[data-alert=note]]:border-accent [&_blockquote[data-alert=important]]:border-accent',
  '[&_blockquote[data-alert=tip]]:border-success',
  '[&_blockquote[data-alert=warning]]:border-danger [&_blockquote[data-alert=caution]]:border-danger',
  '[&_.notes-alert-title]:mb-1 [&_.notes-alert-title]:font-note-heading',
  '[&_blockquote[data-alert=note]_.notes-alert-title]:text-accent [&_blockquote[data-alert=important]_.notes-alert-title]:text-accent',
  '[&_blockquote[data-alert=tip]_.notes-alert-title]:text-success',
  '[&_blockquote[data-alert=warning]_.notes-alert-title]:text-danger [&_blockquote[data-alert=caution]_.notes-alert-title]:text-danger',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-card [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-note-mono',
  '[&_code]:font-mono [&_code]:text-note-mono',
  '[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-lg',
  '[&_hr]:my-8 [&_hr]:border-edge-line',
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-edge-line [&_th]:bg-surface [&_th]:p-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-strong',
  '[&_td]:border [&_td]:border-edge-line [&_td]:p-2',
  '[&_input]:mr-2',
].join(' ');

/**
 * The classes of the one heading that this server writes.
 *
 * It is the largest text of a published page, which is what the name of a
 * note is in the application, so it takes the step and the tracking of that
 * name (decision 0015).
 */
const pageHeadingClasses =
  'mb-6 text-3xl font-semibold tracking-display text-strong';

/** The classes of one link that this server writes. */
export const linkClasses = 'text-accent underline';

/** The classes of the list of a folder link. */
const listClasses = 'my-4 flex flex-col gap-2';

/** The classes of the report form. */
const formClasses = 'my-4 flex flex-col gap-2';

/** The classes of the password form, under the words of its page. */
const passwordFormClasses = 'mt-6 flex flex-col gap-4';

/** The classes of the password field and its label, as `TextField` sets them. */
const passwordFieldGroupClasses = 'flex flex-col gap-1.5';

/** The classes of the label above the password field. */
const labelClasses = 'text-control font-medium text-strong';

/** The classes of the group of reasons of the report form. */
const reasonGroupClasses = 'm-0 flex flex-col gap-2 border-0 p-0';

/** The classes of one reason of the report form, a radio and its words. */
const reasonClasses = 'flex items-center gap-2 text-ui text-ink';

/** The classes of the foot of a page, which holds the report link. */
export const footClasses = 'mt-12 text-control text-muted';

/**
 * The classes of the one button of this page, and of its one field.
 *
 * They are the primary button and the field of
 * `packages/ui/src/control-classes.ts`, written out. This server runs in Node
 * and `@notesapp/ui` is browser code that imports React, so the boundary of
 * `tools/check-boundaries.mjs` refuses the import and the strings have to be
 * written twice. Two copies of one fact drift, so
 * `tests/integration/published-styles.test.ts` reads both and holds this copy
 * to the recipe, class for class.
 *
 * The one difference the test allows is the motion scale. Decision 0054 keeps
 * every transition, duration and easing in `packages/ui/src/motion.ts`, and
 * `tools/check-design-rules.mjs` refuses one anywhere else, including here, so
 * this page states no motion and the test subtracts the named transition
 * before it compares.
 */
export const publishedButtonClasses =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-control font-medium no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 bg-accent-fill text-on-accent hover:bg-accent-fill-hover min-h-11 px-3 md:min-h-8';

/** The classes of the password field. See {@link publishedButtonClasses}. */
export const publishedFieldClasses =
  'w-full min-h-11 rounded-md border bg-app px-3 text-ui pointer-coarse:text-base text-strong outline-none focus-visible:ring-2 focus-visible:ring-focus/25 md:min-h-8 border-edge-line focus-visible:border-focus';

/** The classes of the document frame, which the shell document also writes. */
export const bodyClasses =
  'm-0 bg-app font-sans text-ui leading-relaxed text-ink antialiased';

/** Every class name that this document writes, for the stylesheet test. */
export const publishedDocumentClasses: readonly string[] = [
  bodyClasses,
  pageClasses,
  gateClasses,
  gateHeadingClasses,
  gateHintClasses,
  pageHeadingClasses,
  noteBodyClasses,
  linkClasses,
  listClasses,
  formClasses,
  passwordFormClasses,
  passwordFieldGroupClasses,
  labelClasses,
  reasonGroupClasses,
  reasonClasses,
  footClasses,
  publishedButtonClasses,
  publishedFieldClasses,
].flatMap((group) => group.split(' '));

/** The `<title>` of one state of the page. */
function titleOf(view: PublishedPageView): string {
  if (view.kind === 'note') return view.name;
  if (view.kind === 'list') return listHeading;
  if (view.kind === 'report') return reportHeading;
  // A link that opens nothing and a link that asks for a password both name
  // the product and never the note, so a browser tab discloses nothing.
  return 'Notesapp';
}

/** The classes of the main region of one state of the page. */
function mainClassesOf(view: PublishedPageView): string {
  return view.kind === 'unavailable' || view.kind === 'locked'
    ? gateClasses
    : pageClasses;
}

/** The heading and the one sentence of a page that shows no content. */
function gateHeading(heading: string, hint: string): string {
  return [
    `<h1 class="${gateHeadingClasses}">${escapeText(heading)}</h1>`,
    `<p class="${gateHintClasses}">${escapeText(hint)}</p>`,
  ].join('\n');
}

/** The main region of one state of the page. */
function mainOf(input: PublishedDocumentInput): string {
  const view = input.view;
  if (view.kind === 'unavailable')
    return gateHeading(unavailableSentence, unavailableHint);
  if (view.kind === 'locked') return passwordForm(input.formAction);
  if (view.kind === 'report') return reportForm(input.formAction, view.reasons);
  if (view.kind === 'reported') return `<p>${escapeText(reportedSentence)}</p>`;
  if (view.kind === 'list') {
    if (view.notes.length === 0)
      return [
        `<h1 class="${pageHeadingClasses}">${escapeText(listHeading)}</h1>`,
        `<p>${escapeText(emptyListSentence)}</p>`,
      ].join('\n');
    const items = view.notes
      .map(
        (note) =>
          `<li><a class="${linkClasses}" href="${escapeAttribute(note.href)}">${escapeText(note.name)}</a></li>`,
      )
      .join('\n');
    return [
      `<h1 class="${pageHeadingClasses}">${escapeText(listHeading)}</h1>`,
      `<ul class="${listClasses}">`,
      items,
      '</ul>',
    ].join('\n');
  }
  const back =
    view.listHref === null
      ? ''
      : `<p><a class="${linkClasses}" href="${escapeAttribute(view.listHref)}">${escapeText(listLinkWords)}</a></p>\n`;
  return `${back}<article class="${noteBodyClasses}">${view.body}</article>`;
}

/**
 * The password form.
 *
 * It holds no script, so it sends the form encoding of HTML to the address of
 * the page itself. A wrong password answers this same form and these same
 * words, so the answer states nothing about the password or about the link.
 */
function passwordForm(action: string): string {
  return [
    gateHeading(lockedSentence, lockedHint),
    `<form class="${passwordFormClasses}" method="post" action="${escapeAttribute(action)}">`,
    `<div class="${passwordFieldGroupClasses}">`,
    `<label class="${labelClasses}" for="published-password">Password</label>`,
    `<input class="${publishedFieldClasses}" id="published-password" name="password" type="password" autocomplete="off" autofocus required maxlength="512">`,
    '</div>',
    `<button class="${publishedButtonClasses}" type="submit">Open</button>`,
    '</form>',
  ].join('\n');
}

/**
 * The report form (record 0119).
 *
 * It holds no script, so it sends the form encoding of HTML to its own
 * address. The first reason is chosen at the start, so the form always sends
 * one reason of the fixed list.
 */
function reportForm(action: string, reasons: readonly ReportReason[]): string {
  const choices = reasons
    .map(
      (reason, index) =>
        `<label class="${reasonClasses}"><input type="radio" name="reason" value="${escapeAttribute(reason)}"${index === 0 ? ' checked' : ''}>${escapeText(reportReasonWords[reason])}</label>`,
    )
    .join('\n');
  return [
    `<h1 class="${pageHeadingClasses}">${escapeText(reportHeading)}</h1>`,
    `<p>${escapeText(reportSentence)}</p>`,
    `<form class="${formClasses}" method="post" action="${escapeAttribute(action)}">`,
    `<fieldset class="${reasonGroupClasses}">`,
    `<legend class="${labelClasses}">Reason</legend>`,
    choices,
    '</fieldset>',
    `<label class="${labelClasses}" for="report-note">More details (optional)</label>`,
    `<textarea class="${publishedFieldClasses}" id="report-note" name="note" rows="4" maxlength="2000"></textarea>`,
    `<button class="${publishedButtonClasses}" type="submit">Send report</button>`,
    '</form>',
  ].join('\n');
}

/** The foot of a page that shows content, with its report link. */
function footOf(input: PublishedDocumentInput): string {
  const shows = input.view.kind === 'note' || input.view.kind === 'list';
  if (!shows || input.reportHref === undefined || input.reportHref === null)
    return '';
  return `\n<footer class="${footClasses}"><a class="${linkClasses}" href="${escapeAttribute(input.reportHref)}">${escapeText(reportLinkWords)}</a></footer>`;
}

/** Builds the whole document of one state of a published link. */
export function publishedDocument(input: PublishedDocumentInput): string {
  const styles = input.stylesheets
    .map(
      (href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">\n    `,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${escapeText(titleOf(input.view))}</title>
    ${styles}</head>
  <body class="${bodyClasses}">
    <main class="${mainClassesOf(input.view)}">
${mainOf(input)}${footOf(input)}
    </main>
  </body>
</html>
`;
}
