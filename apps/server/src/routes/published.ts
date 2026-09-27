/**
 * The reader path of a published link.
 *
 * This file is the second refusal of decision 0031. It imports no actor
 * helper, so it holds no `Actor` and no write use case compiles in it. Every
 * operation it serves declares an empty security requirement, so the identity
 * hook of `plugins/register.ts` never runs for one.
 *
 * Three addresses live here, and the reader carries its credentials in each of
 * them, as decision 0046 states. The token is a path segment, the reading
 * ticket is a query value, and the note of a folder link is another. Nothing
 * of the reader is a header and nothing of the reader is a cookie.
 *
 * **The page always answers a page.** Decision 0047 gives `getPublishedPage`
 * one answer for every state of a link: the note, the list of a folder, the
 * password form, or the one sentence. `routes/published-document.ts` writes
 * that document and this file decides which state it shows.
 *
 * **The two subresources keep the one refusal.** A picture cannot show a
 * sentence and the unlock answers a program, so both take
 * `PublishedLinkUnavailableError` for every cause.
 *
 * **The domain decides, this file serves.** `readPublishedPage` and
 * `resolvePublishedAttachment` of `packages/core` hold every rule about what a
 * link opens. This file digests the secrets of the address, renders the note
 * through the one sanitized renderer, builds the addresses of the page, and
 * writes the headers of decision 0047.
 */
import {
  isReportReason,
  readPublishedPage,
  reportNote,
  reportReasons,
  resolvePublishedAttachment,
  type PasswordHasher,
  type PublicationStore,
  type PublishedAttachmentReference,
  type PublishedNote,
  type PublishedPage,
  type ReaderRefusalCause,
  type SecretDigest,
} from '@notesapp/core';
import { renderMarkdown, type NoteTarget } from '@notesapp/markdown';
import type {
  AttachmentStore,
  PublicationReport,
  PublicationUnlockAttempt,
  PublicationUnlockResult,
} from '@notesapp/storage-server';
import { PublishedLinkUnavailableError } from '../plugins/problem.ts';
import { publishedDocumentHeaders } from '../plugins/security-headers.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import {
  contentDisposition,
  dispositionKind,
  downloadName,
} from '../plugins/content-disposition.ts';
import {
  publishedDocument,
  readableNoteName,
  type PublishedPageView,
} from './published-document.ts';
import { readOptionalText, readText } from './files.ts';
import { newPublishedSecret } from '../auth/publication-secrets.ts';

/** What the reader path needs from the composition. */
export type PublishedDependencies = {
  /** The read-only store of the reader path, which is the port of 0031. */
  readonly store: PublicationStore;
  /** The first write of the boundary: a password becomes a reading ticket. */
  readonly unlock: (
    attempt: PublicationUnlockAttempt,
  ) => Promise<PublicationUnlockResult>;
  /** The second write of the boundary: one report (record 0119). */
  readonly report: (report: PublicationReport) => Promise<void>;
  /**
   * The sealed full address of the link of one token, which a report keeps
   * so that an administrator can open the link (record 0123).
   */
  readonly sealLink: (token: string) => string;
  /** The bytes of an attachment revision. */
  readonly attachments: AttachmentStore;
  /** The digest rule of a token and of a ticket. */
  readonly secrets: SecretDigest;
  /** The password rule of a link. */
  readonly hasher: PasswordHasher;
  /** The stylesheets of the built application document. */
  readonly stylesheets: () => readonly string[];
  /** The instant of one request. */
  readonly clock: () => number;
  /** Where the cause of a refusal goes, for the operator only. */
  readonly recordRefusal: (cause: ReaderRefusalCause) => void;
};

/** The name of a download whose stored path holds none. */
const fallbackAttachmentName = 'image';

/** One query value of a request, or `null`. */
function queryValue(request: { readonly query: unknown }, name: string) {
  return readOptionalText(request.query, name);
}

/**
 * The address of one state of this link.
 *
 * Every address that the page writes comes from here, so the ticket travels
 * with every one of them and no page can forget it. A reader that holds no
 * ticket writes none, and the page of a link with no password therefore holds
 * no query at all.
 */
function pageAddress(
  token: string,
  ticket: string | null,
  note: string | null,
): string {
  const query = new URLSearchParams();
  if (note !== null) query.set('note', note);
  if (ticket !== null) query.set('ticket', ticket);
  const text = query.toString();
  return `/published/${encodeURIComponent(token)}${text === '' ? '' : `?${text}`}`;
}

/** The address of the report page of this link. */
function reportAddress(token: string): string {
  return `/published/${encodeURIComponent(token)}/report`;
}

/** The address of one picture of one note of this link. */
function attachmentAddress(
  token: string,
  ticket: string | null,
  fileId: string,
  revisionId: string,
): string {
  const base = `/published/${encodeURIComponent(token)}/attachments/${encodeURIComponent(fileId)}/${encodeURIComponent(revisionId)}`;
  return ticket === null
    ? base
    : `${base}?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * The note of the page that a link between two notes names, or `null`.
 *
 * A link by identifier names the note directly. A portable link names a stored
 * path, so the note of that path is looked up in the notes that this link
 * opens. A note that the link does not open answers `null`, and the renderer
 * then keeps the words of the link and drops its address.
 */
function noteOfTarget(
  notes: readonly PublishedNote[],
  target: NoteTarget,
): PublishedNote | null {
  if (target.id !== null)
    return notes.find((note) => note.fileId === target.id) ?? null;
  if (target.path !== null)
    return notes.find((note) => note.path === target.path) ?? null;
  return null;
}

/** Renders one note of a page into sanitized HTML with its own addresses. */
function renderPublishedNote(
  page: Extract<PublishedPage, { kind: 'note' }>,
  token: string,
  ticket: string | null,
): Promise<string> {
  const revisions = new Map<string, string>(
    page.attachments.map((entry: PublishedAttachmentReference) => [
      entry.reference,
      entry.revisionId,
    ]),
  );
  return renderMarkdown(page.note.text, {
    sourcePath: page.note.path,
    attachmentHref: (reference) => {
      const revisionId = revisions.get(reference);
      // A reference that the current head does not name has no address here,
      // so the picture becomes its own words instead of a broken address.
      return revisionId === undefined
        ? null
        : attachmentAddress(token, ticket, page.note.fileId, revisionId);
    },
    noteHref: (target) => {
      const note = noteOfTarget(page.notes, target);
      return note === null
        ? null
        : `${pageAddress(token, ticket, note.fileId)}${target.fragment}`;
    },
  });
}

/** Turns what the domain answered into what the document shows. */
async function viewOf(
  page: PublishedPage,
  token: string,
  ticket: string | null,
): Promise<PublishedPageView> {
  if (page.kind === 'unavailable') return { kind: 'unavailable' };
  if (page.kind === 'locked') return { kind: 'locked' };
  if (page.kind === 'list')
    return {
      kind: 'list',
      notes: page.notes.map((note) => ({
        name: readableNoteName(note.path),
        href: pageAddress(token, ticket, note.fileId),
      })),
    };
  return {
    kind: 'note',
    name: readableNoteName(page.note.path),
    body: await renderPublishedNote(page, token, ticket),
    // A link over one note has one page, so it offers no list to return to.
    listHref:
      page.link.scope.kind === 'folder'
        ? pageAddress(token, ticket, null)
        : null,
  };
}

/** Builds the handlers of the reader path. */
export function createPublishedHandlers(
  dependencies?: PublishedDependencies,
): HandlerMap {
  if (dependencies === undefined) return refusingHandlers();
  const parts = dependencies;

  /** The document answer of one state of a link. */
  const answerPage = async (
    view: PublishedPageView,
    token: string,
    ticket: string | null,
    note: string | null,
  ): Promise<HandlerResult> => ({
    status: 200,
    mediaType: 'text/html',
    body: publishedDocument({
      view,
      stylesheets: parts.stylesheets(),
      // The form returns to the address that the reader is on, so an unlock
      // of a folder link opens the note that the reader asked for.
      formAction: pageAddress(token, null, note),
      reportHref: reportAddress(token),
    }),
    headers: publishedDocumentHeaders,
  });

  /** The state of one address, as one read of the domain answers it. */
  const readPage = (
    token: string,
    ticket: string | null,
    note: string | null,
  ): Promise<PublishedPage> =>
    readPublishedPage(
      {
        store: parts.store,
        clock: parts.clock,
        refusals: { record: parts.recordRefusal },
      },
      {
        tokenDigest: parts.secrets.digest(token),
        ticketDigest: ticket === null ? null : parts.secrets.digest(ticket),
      },
      note,
    );

  return {
    getPublishedPage: async (request): Promise<HandlerResult> => {
      const token = readText(request.params, 'token');
      const ticket = queryValue(request, 'ticket');
      const note = queryValue(request, 'note');
      const page = await readPage(token, ticket, note);
      return answerPage(await viewOf(page, token, ticket), token, ticket, note);
    },

    openPublishedPage: async (request): Promise<HandlerResult> => {
      const token = readText(request.params, 'token');
      const note = queryValue(request, 'note');
      const password = readText(request.body, 'password');
      const ticket = newPublishedSecret();
      const unlocked = await parts.unlock({
        tokenDigest: parts.secrets.digest(token),
        ticketDigest: parts.secrets.digest(ticket),
        now: new Date(parts.clock()),
        verify: (digest) => parts.hasher.verify(digest, password),
      });
      if (!unlocked.ok) {
        parts.recordRefusal(unlocked.cause);
        // The same words and the same form as a link that was never opened.
        const page = await readPage(token, null, note);
        return answerPage(await viewOf(page, token, null), token, null, note);
      }
      const page = await readPage(token, ticket, note);
      return answerPage(await viewOf(page, token, ticket), token, ticket, note);
    },

    unlockPublishedLink: async (request): Promise<HandlerResult> => {
      const token = readText(request.params, 'token');
      const password = readText(request.body, 'password');
      const ticket = newPublishedSecret();
      const unlocked = await parts.unlock({
        tokenDigest: parts.secrets.digest(token),
        ticketDigest: parts.secrets.digest(ticket),
        now: new Date(parts.clock()),
        verify: (digest) => parts.hasher.verify(digest, password),
      });
      if (!unlocked.ok) {
        parts.recordRefusal(unlocked.cause);
        throw new PublishedLinkUnavailableError();
      }
      return {
        status: 200,
        mediaType: 'application/json',
        body: { ticket, expiresAt: unlocked.ticket.expiresAt },
      };
    },

    getReportPage: (request): Promise<HandlerResult> => {
      const token = readText(request.params, 'token');
      // The form is the same for every token, so it states nothing about
      // the link.
      return Promise.resolve({
        status: 200,
        mediaType: 'text/html',
        body: publishedDocument({
          view: { kind: 'report', reasons: reportReasons },
          stylesheets: parts.stylesheets(),
          formAction: reportAddress(token),
        }),
        headers: publishedDocumentHeaders,
      });
    },

    reportPublishedLink: async (request): Promise<HandlerResult> => {
      const token = readText(request.params, 'token');
      const reason = readText(request.body, 'reason');
      // The contract names the reasons, and the core names them again, so a
      // reason that is not one of them stores nothing.
      if (isReportReason(reason))
        await parts.report({
          tokenDigest: parts.secrets.digest(token),
          reason,
          note: reportNote(readOptionalText(request.body, 'note')),
          sealedAddress: parts.sealLink(token),
        });
      // One answer for a stored report and for a token of no link.
      return {
        status: 200,
        mediaType: 'text/html',
        body: publishedDocument({
          view: { kind: 'reported' },
          stylesheets: parts.stylesheets(),
          formAction: reportAddress(token),
        }),
        headers: publishedDocumentHeaders,
      };
    },

    getPublishedAttachment: async (request, reply): Promise<HandlerResult> => {
      const token = readText(request.params, 'token');
      const fileId = readText(request.params, 'fileId');
      const revisionId = readText(request.params, 'revisionId');
      const ticket = queryValue(request, 'ticket');
      const tokenDigest = parts.secrets.digest(token);
      const allowed = await resolvePublishedAttachment(
        {
          store: parts.store,
          clock: parts.clock,
          refusals: { record: parts.recordRefusal },
        },
        {
          tokenDigest,
          ticketDigest: ticket === null ? null : parts.secrets.digest(ticket),
        },
        { fileId, revisionId },
      );
      // The domain proved the token, the note in scope and the reference. The
      // store proves the token again before it reads a byte, so no caller of
      // it can widen the read by naming another workspace.
      if (!allowed.ok) throw new PublishedLinkUnavailableError();
      const bytes = await parts.attachments.readPublishedAttachmentRevision(
        tokenDigest,
        allowed.value.link.workspaceId,
        allowed.value.revisionId,
      );
      if (bytes === null) throw new PublishedLinkUnavailableError();
      reply.header('content-length', String(bytes.size));
      reply.header('etag', `"${bytes.revisionId}"`);
      return {
        status: 200,
        mediaType: bytes.mediaType,
        body: bytes.stream,
        headers: [
          [
            'content-disposition',
            contentDisposition({
              kind: dispositionKind(bytes.mediaType),
              name: downloadName(bytes.path),
              fallback: fallbackAttachmentName,
            }),
          ],
          // A picture of a published note sits behind the same secret address
          // as its note, so no shared cache keeps it either.
          ['cache-control', 'private, no-store'],
          ['referrer-policy', 'no-referrer'],
        ],
      };
    },
  };
}

/**
 * The handlers of a deployment that was built without a publication store.
 *
 * A test that checks the service operations leaves the store out. The page
 * then answers the one document of a link that opens nothing, because every
 * token is unknown in such a build, and the two subresources refuse.
 */
function refusingHandlers(): HandlerMap {
  const refuse = (): Promise<HandlerResult> =>
    Promise.reject(new PublishedLinkUnavailableError());
  const page = (): Promise<HandlerResult> =>
    Promise.resolve({
      status: 200,
      mediaType: 'text/html',
      body: publishedDocument({
        view: { kind: 'unavailable' },
        stylesheets: [],
        formAction: '/published/',
      }),
      headers: publishedDocumentHeaders,
    });
  return {
    getPublishedPage: page,
    openPublishedPage: page,
    getReportPage: page,
    reportPublishedLink: page,
    unlockPublishedLink: refuse,
    getPublishedAttachment: refuse,
  };
}
