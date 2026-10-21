/**
 * What the note screen does with one activated Markdown link.
 *
 * The editor reports the raw destination that the author wrote. This module
 * turns that text into one decision and nothing else: it opens no window, it
 * navigates nowhere, and it reads no storage. The note screen performs the
 * decision, so the rule stays testable without a browser.
 *
 * The shared Markdown policy checks external schemes and internal targets.
 */

import { classifyUrl } from '@notesapp/markdown';

/** The one action that an activated link destination asks for. */
export type LinkAction =
  /** Open the note with this identifier. */
  | { readonly kind: 'note-id'; readonly fileId: string }
  /** Open the note at this resolved workspace path. */
  | { readonly kind: 'note-path'; readonly path: string }
  /** Open this address in a new tab. */
  | { readonly kind: 'external'; readonly url: string }
  /** Do nothing: the destination names no reachable target. */
  | { readonly kind: 'none' };

const noAction: LinkAction = { kind: 'none' };

/**
 * Decides what one activated link destination asks the application to do.
 *
 * `/notes/<id>` opens that note. An allowed absolute address opens in a new
 * tab. A relative destination names another note by its name, with the `.md`
 * storage suffix removed. Everything else asks for nothing.
 */
export function resolveLinkAction(
  destination: string,
  sourcePath = '',
): LinkAction {
  const target = classifyUrl(destination, sourcePath);
  if (target.kind === 'note') return { kind: 'note-id', fileId: target.id };
  if (target.kind === 'external') return { kind: 'external', url: target.href };
  if (target.kind === 'relative' && target.path.endsWith('.md'))
    return { kind: 'note-path', path: target.path };
  return noAction;
}

/** The copy shown when a written note name matches no note. */
export const missingNoteNotice = 'No note has that name yet.';

/** The message for an address that the shared policy refuses. */
export const blockedLinkNotice =
  'This link is blocked because its address is unsafe or invalid.';
