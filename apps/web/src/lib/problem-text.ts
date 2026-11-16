/**
 * Plain sentences for the problem codes of the service.
 *
 * A code such as `path_conflict` tells an engineer what happened and tells a
 * person nothing. Every code that a screen can meet has one sentence here
 * that says what happened and what to do next. An unknown code falls back to
 * a sentence about the status, so a newer server never prints a raw code.
 */

/** A sentence for one known problem code. */
const sentences: Readonly<Record<string, string>> = {
  api_key_limit:
    'Your account has 25 API keys. Revoke a key before you create another.',
  account_exists: 'An account already uses this address.',
  account_locked:
    'Your account is locked. Your notes are safe. Open the account page to unlock it.',
  account_unavailable:
    'This account cannot sign in. Ask an administrator of this installation.',
  address_unverified:
    'Open the link in the message that went to this address to finish your account. To get a new link, sign up again.',
  // Record 0193: each holds until the next month in UTC.
  download_limit:
    'The download limit of this month is used. Downloads start again next month. You can still write and save notes.',
  storage_busy:
    'The file storage of this server is busy this month. New images and imports start again next month. You can still write and save notes.',
  deleted_remotely:
    'This note was deleted on another device. Open Trash to restore it.',
  forbidden: 'This account cannot do that.',
  internal_error: 'The server had a problem. Try again in a moment.',
  invalid_content: 'The server refused the text of this note.',
  invalid_graph: 'This diagram could not be drawn.',
  invalid_path:
    'That note name cannot be stored. Change the name and try again.',
  invalid_request: 'The server refused the request. Try again.',
  oauth_request_invalid:
    'This access request is not valid. Go back to the client and connect again.',
  invalid_response: 'The answer of the server could not be read. Try again.',
  invitation_invalid: 'This invitation is not valid. Ask for a new one.',
  registration_closed:
    'This installation takes new accounts by invitation. Ask an administrator for one.',
  verification_invalid:
    'This link is not valid any more. Sign up again to get a new link.',
  proof_invalid: 'The check of this browser did not finish. Try again.',
  controls_changed:
    'Somebody changed this account at the same time. Read the page again, then make the change.',
  consent_required:
    'The terms or the privacy notice changed. Read them again and accept them.',
  setting_locked:
    'The server environment sets this, so it changes there and not on this page.',
  setting_required:
    'Anybody can sign up now, and sign-up needs this. Let only invited people make an account first.',
  legal_document_unfinished: 'Fill each blank of the template before you save.',
  mail_password_required:
    'Enter the password of the user name, or leave the user name empty.',
  mail_failed:
    'The mail server did not take the message. Check the settings and try again.',
  last_administrator:
    'The installation needs an administrator. Make another account an administrator first.',
  mutation_reused: 'That save was already sent. Nothing changed.',
  not_found: 'The server could not find this.',
  not_ready: 'The server is still starting. Try again in a moment.',
  open_registration_unavailable:
    'Open sign-up needs a mail server, an address for published pages and legal documents first.',
  origin_required: 'This page is not allowed to reach the server.',
  password_breached:
    'This password is in a list of leaked passwords. Choose another one.',
  path_conflict:
    'Another note already uses that name. Choose a different name.',
  payload_too_large: 'That file is too large to upload.',
  precondition_required: 'This note changed. Reload the note and try again.',
  purged: 'This note was deleted permanently and cannot be opened.',
  quota_exceeded: 'Your account is full. Delete notes to free space.',
  route_not_found: 'That address does not exist on the server.',
  snapshot_required: 'This device needs a fresh copy of your notes.',
  stale_head: 'This note changed. The device reads it again and retries.',
  unauthenticated: 'The session ended. Sign in again.',
  unauthorized: 'The session ended. Sign in again.',
  unrenderable_note:
    'This note has too much Markdown to show formatted. Divide a long paragraph or table, or make the note smaller.',
  unsupported_media_type: 'That file kind is not accepted.',
};

/**
 * The sentence of each limit of the month that refused a request (record
 * 0193). An attachment answers `download_limit` past the download limit of
 * the person and past the read cap of the server, and the problem names
 * which, so one cause has one message.
 */
const limitSentences: Readonly<Record<string, string>> = {
  downloads: sentences['download_limit'] ?? '',
  object_reads:
    'The file storage of this server is busy this month. Images load again next month. You can still write and save notes.',
  object_writes: sentences['storage_busy'] ?? '',
};

/** The codes whose problem names a limit of the month. */
const limitCodes: ReadonlySet<string> = new Set([
  'download_limit',
  'storage_busy',
]);

/**
 * One plain sentence for a problem code and an HTTP status.
 *
 * The code itself never appears in the result. A caller that wants the code
 * for a log writes it to the console. `limit` is the limit of the month that
 * the problem names, if any.
 */
export function problemSentence(
  code: string | null,
  status: number | null,
  limit: string | null = null,
): string {
  if (code !== null && limit !== null && limitCodes.has(code)) {
    const named = limitSentences[limit];
    if (named !== undefined) return named;
  }
  if (code !== null) {
    const known = sentences[code];
    if (known !== undefined) return known;
  }
  if (status === null || status === 0)
    return 'The server could not be reached. Your work stays on this device.';
  if (status === 401 || status === 403)
    return sentences['unauthenticated'] ?? '';
  if (status === 404) return sentences['not_found'] ?? '';
  if (status === 409) return sentences['path_conflict'] ?? '';
  if (status === 413) return sentences['payload_too_large'] ?? '';
  if (status >= 500) return sentences['internal_error'] ?? '';
  return 'The server refused the request. Try again.';
}

/** Whether a code has its own sentence, for tests and for the console. */
export function hasProblemSentence(code: string): boolean {
  return sentences[code] !== undefined;
}

/**
 * One member of a generated failure, read without a claim about its shape.
 *
 * A failure of the generated client is `unknown`: it carries the problem
 * document of the server, a network error, or a value that a middleware put
 * there. Only own enumerable members count, so an inherited member cannot
 * pass a check.
 */
function readProperty(error: unknown, key: string): unknown {
  if (error === null || typeof error !== 'object') return undefined;
  const record: Record<string, unknown> = Object.fromEntries(
    Object.entries(error),
  );
  return record[key];
}

/** The problem code of a generated failure, or `null`. */
export function problemCode(error: unknown): string | null {
  const code = readProperty(error, 'code');
  return typeof code === 'string' && code !== '' ? code : null;
}

/** The limit of the month that a generated failure names, or `null`. */
export function problemLimit(error: unknown): string | null {
  const limit = readProperty(error, 'limit');
  return typeof limit === 'string' && limit !== '' ? limit : null;
}

/** The HTTP status of a generated failure, or `null`. */
export function problemStatus(error: unknown): number | null {
  const status = readProperty(error, 'status');
  return typeof status === 'number' ? status : null;
}
