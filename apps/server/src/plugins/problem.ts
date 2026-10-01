/**
 * RFC 9457 problem details for every failure that leaves the HTTP boundary.
 *
 * A problem carries a stable `code` that a client can branch on, the request
 * id, and a short explanation. It never carries note content, a secret, a
 * rejected value, or a stack trace.
 */
import type { ValidationIssue } from '@notesapp/api-contract';
import type { DomainError, DomainErrorCode, Result } from '@notesapp/core';
import {
  markdownLimitCode,
  WorkspaceUnavailableError,
} from '@notesapp/storage-server';
import { readProperty } from '../values.ts';

/** Media type of every error response. */
export const problemMediaType = 'application/problem+json';

/** Stable application error codes. Add a code, never reuse one. */
export type ProblemCode =
  | 'invalid_request'
  | 'host_not_allowed'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'request_timeout'
  | 'unauthenticated'
  | 'forbidden'
  | 'origin_required'
  | 'not_found'
  | 'published_link_unavailable'
  | 'stale_head'
  | 'path_conflict'
  | 'mutation_reused'
  | 'purged'
  | 'snapshot_required'
  | 'precondition_required'
  | 'invalid_path'
  | 'invalid_graph'
  | 'invalid_content'
  | 'too_many_files'
  | 'unrenderable_note'
  | 'epoch_mismatch'
  | 'unseen_work'
  | 'document_malformed'
  | 'document_dependency_missing'
  | 'document_unsupported'
  | 'document_too_large'
  | 'sync_protocol_unsupported'
  | 'notices_unavailable'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'route_not_found'
  | 'not_ready'
  | 'shutting_down'
  | 'invalid_response'
  | 'internal_error'
  | 'last_administrator'
  | 'invitation_invalid'
  | 'account_exists'
  | 'open_registration_unavailable'
  | 'password_breached'
  | 'registration_closed'
  | 'verification_invalid'
  | 'proof_invalid'
  | 'consent_required'
  | 'address_unverified'
  | 'account_unavailable'
  | 'theme_limit'
  | 'setting_locked'
  | 'setting_required'
  | 'legal_document_unfinished'
  | 'mail_failed';

/** Problem details body. Extra members are permitted by RFC 9457. */
export type Problem = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: ProblemCode;
  readonly requestId: string;
  readonly issues?: readonly ValidationIssue[];
  /** Files that a content failure refers to. Identifiers only. */
  readonly fileIds?: readonly string[];
  /** The parts that open registration lacks (record 0114). */
  readonly missing?: readonly string[];
  /** The blanks of a template that a legal text still holds (record 0148). */
  readonly blanks?: readonly string[];
  /** The kind of a failed test message (record 0148). */
  readonly reason?: string;
};

const titles: Readonly<Record<ProblemCode, string>> = {
  invalid_request: 'The request did not match the contract.',
  host_not_allowed: 'The Host header is not served by this deployment.',
  payload_too_large: 'The request body is larger than the configured limit.',
  unsupported_media_type: 'The request media type is not supported.',
  epoch_mismatch: 'The note holds another generation of its document.',
  unseen_work: 'The deletion would hide text that this device has not seen.',
  document_malformed: 'The document work of the save is not readable.',
  document_dependency_missing:
    'The document work names work that the document does not hold.',
  document_unsupported:
    'The document work writes something other than the text of the note.',
  document_too_large: 'The document work passes a bound of the workspace.',
  sync_protocol_unsupported:
    'This deployment does not serve the sync protocol version of the caller.',
  notices_unavailable: 'This deployment does not open the notice stream now.',
  request_timeout: 'The request body stopped before it was complete.',
  unauthenticated: 'The request carries no usable session or token.',
  forbidden: 'The actor may not perform this operation.',
  origin_required:
    'A cookie authenticated write must name the configured origin.',
  not_found: 'The requested resource does not exist.',
  published_link_unavailable: 'This link is not available.',
  stale_head: 'The accepted head of a file has moved on.',
  path_conflict: 'Another live file already holds that path.',
  mutation_reused:
    'That mutation identity was already used for another operation.',
  purged: 'The file was permanently deleted and cannot be written again.',
  snapshot_required:
    'The snapshot expired or the cursor predates the retained window. Start a fresh snapshot.',
  precondition_required: 'The operation needs a precondition.',
  invalid_path: 'The path does not follow the workspace path rules.',
  invalid_graph: 'The submitted revisions are not a valid change.',
  invalid_content: 'The submitted content does not match its digest.',
  too_many_files: 'The change rewrites more files than one request may hold.',
  unrenderable_note: 'The note cannot be read as Markdown.',
  quota_exceeded: 'The account has no room left for new content.',
  last_administrator:
    'The installation keeps at least one enabled administrator.',
  invitation_invalid: 'This invitation is not valid.',
  account_exists: 'An account already signs in with this address.',
  open_registration_unavailable:
    'The installation lacks a part that open registration needs.',
  password_breached: 'This password is in a list of leaked passwords.',
  registration_closed: 'This installation takes new accounts by invitation.',
  verification_invalid: 'This verification link is not valid.',
  proof_invalid: 'The proof of work of this sign-up does not count.',
  consent_required: 'The current legal documents need consent.',
  address_unverified: 'The address of this account is not proved yet.',
  account_unavailable: 'This account cannot sign in.',
  theme_limit: 'The account keeps as many imported themes as it may.',
  setting_locked: 'The server environment sets this setting.',
  setting_required: 'Open registration needs this setting.',
  legal_document_unfinished: 'The text still holds a blank of the template.',
  mail_failed: 'The mail server did not take the message.',
  rate_limited: 'Too many attempts were made in a short time.',
  route_not_found: 'No operation serves this method and path.',
  not_ready: 'The service cannot accept traffic yet.',
  shutting_down: 'The service is stopping and accepts no new traffic.',
  invalid_response: 'The service produced a response outside the contract.',
  internal_error: 'The service failed to complete the request.',
};

/** Request contract failure raised by the boundary validator. */
export class RequestContractError extends Error {
  readonly slot: string;
  readonly issues: readonly ValidationIssue[];

  constructor(slot: string, issues: readonly ValidationIssue[]) {
    super(`The ${slot} of the request did not match the contract.`);
    this.name = 'RequestContractError';
    this.slot = slot;
    this.issues = issues;
  }
}

/** Request body media type that the operation does not accept. */
export class RequestMediaTypeError extends Error {
  readonly accepted: string;

  constructor(accepted: string) {
    super(`This operation accepts only ${accepted} request bodies.`);
    this.name = 'RequestMediaTypeError';
    this.accepted = accepted;
  }
}

/**
 * The request carries no usable session.
 *
 * The answer never says whether an address exists or whether the session
 * expired, because both would help an attacker.
 */
export class UnauthenticatedError extends Error {
  constructor(detail = 'Sign in before calling this operation.') {
    super(detail);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * The actor is known but may not perform the operation.
 *
 * A denied role and a denied rule such as the removal of the last owner both
 * use this failure, so an answer never discloses which of the two applied.
 */
export class ForbiddenError extends Error {
  constructor(detail = 'The actor may not perform this operation.') {
    super(detail);
    this.name = 'ForbiddenError';
  }
}

/**
 * A cookie authenticated write that names no origin.
 *
 * A browser always sends `Origin` or `Sec-Fetch-Site` on a write. A request
 * with neither did not come from a browser page.
 */
export class OriginRequiredError extends Error {
  constructor(
    detail = 'A cookie authenticated write must name the configured origin.',
  ) {
    super(detail);
    this.name = 'OriginRequiredError';
  }
}

/**
 * A precondition that the operation needs, and the request did not carry.
 *
 * A write of an existing file needs the entity tag of the head that the client
 * read. Without it the server would have to guess, and a lost update would
 * follow, so the request is answered with 428 and repeated with the tag.
 */
export class PreconditionRequiredError extends Error {
  constructor(detail = 'The operation needs a precondition.') {
    super(detail);
    this.name = 'PreconditionRequiredError';
  }
}

/**
 * A payload that exceeds the configured size or pixel limit.
 */
export class PayloadTooLargeError extends Error {
  constructor(detail = titles.payload_too_large) {
    super(detail);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * A request body that stopped arriving.
 *
 * A route that reads a streamed body bounds the gap between two chunks. The
 * bound is not a bound on the whole body, because a large file over a slow
 * link is not a fault. See `plugins/body-idle-timeout.ts`.
 */
export class RequestTimeoutError extends Error {
  constructor(detail = titles.request_timeout) {
    super(detail);
    this.name = 'RequestTimeoutError';
  }
}

/**
 * A media type that the operation does not accept.
 */
export class UnsupportedMediaTypeError extends Error {
  constructor(detail = titles.unsupported_media_type) {
    super(detail);
    this.name = 'UnsupportedMediaTypeError';
  }
}

/**
 * Submitted content that is invalid or malformed.
 */
export class InvalidContentError extends Error {
  readonly fileIds: readonly string[];

  constructor(
    detail = titles.invalid_content,
    fileIds: readonly string[] = [],
  ) {
    super(detail);
    this.name = 'InvalidContentError';
    this.fileIds = fileIds;
  }
}

/**
 * An expected outcome of a content operation, on its way out of the boundary.
 *
 * The core returns a `DomainError` rather than throwing one. A handler that
 * cannot continue turns it into this error, so the mapping from a domain code
 * to a status and a problem code lives in one table below.
 */
export class DomainProblemError extends Error {
  readonly domain: DomainError;

  constructor(error: DomainError) {
    super(domainTitles[error.code]);
    this.name = 'DomainProblemError';
    this.domain = error;
  }
}

/**
 * The value of a domain result, or its failure as a problem response.
 *
 * Every handler that answers a domain failure with the table below reads its
 * result through this one function.
 */
export function unwrapDomain<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw new DomainProblemError(result.error);
}

/**
 * The status and the problem code of every domain failure.
 *
 * The statuses follow RFC 9110: a failed precondition is 412, a state that
 * cannot hold both values is 409, a permanently removed record is 410, a well
 * formed request whose content cannot be accepted is 422, and a workspace
 * without room answers 413 like any other body that is too large for the
 * limit.
 */
const domainStatus: Readonly<
  Record<DomainErrorCode, { status: number; code: ProblemCode }>
> = {
  forbidden: { status: 403, code: 'forbidden' },
  not_found: { status: 404, code: 'not_found' },
  stale_head: { status: 412, code: 'stale_head' },
  path_conflict: { status: 409, code: 'path_conflict' },
  mutation_reused: { status: 409, code: 'mutation_reused' },
  purged: { status: 410, code: 'purged' },
  snapshot_required: { status: 410, code: 'snapshot_required' },
  unsupported_version: { status: 400, code: 'invalid_request' },
  invalid_path: { status: 422, code: 'invalid_path' },
  invalid_graph: { status: 422, code: 'invalid_graph' },
  invalid_content: { status: 422, code: 'invalid_content' },
  too_many_files: { status: 422, code: 'too_many_files' },
  note_too_large: { status: 422, code: 'unrenderable_note' },
  note_too_deep: { status: 422, code: 'unrenderable_note' },
  // The refusals of one document. Each of them leaves the accepted state as
  // it was, so the device keeps its work and acts on the answer.
  epoch_mismatch: { status: 409, code: 'epoch_mismatch' },
  unseen_work: { status: 409, code: 'unseen_work' },
  document_malformed: { status: 422, code: 'document_malformed' },
  document_dependency_missing: {
    status: 422,
    code: 'document_dependency_missing',
  },
  document_unsupported: { status: 422, code: 'document_unsupported' },
  document_too_large: { status: 413, code: 'document_too_large' },
  published_link_unavailable: {
    status: 404,
    code: 'published_link_unavailable',
  },
  quota: { status: 413, code: 'quota_exceeded' },
  last_administrator: { status: 409, code: 'last_administrator' },
  // The one refusal of an invitation. An expired, a used, a revoked and an
  // unknown token all answer it, so the answer states nothing more.
  invitation_invalid: { status: 403, code: 'invitation_invalid' },
  account_exists: { status: 409, code: 'account_exists' },
  open_registration_unavailable: {
    status: 422,
    code: 'open_registration_unavailable',
  },
  // The library answers the same refusal with 400, so the two read alike.
  password_breached: { status: 400, code: 'password_breached' },
  registration_closed: { status: 403, code: 'registration_closed' },
  // The one refusal of a verification link. An expired, a replaced and an
  // unknown token all answer it, so the answer states nothing more.
  verification_invalid: { status: 403, code: 'verification_invalid' },
  // One refusal for a forged, an expired, a reused and a weak proof.
  proof_invalid: { status: 403, code: 'proof_invalid' },
  // The versions that the person saw are not the current ones, or the
  // sign-up gave no consent (record 0120).
  consent_required: { status: 409, code: 'consent_required' },
  // The account keeps as many imported themes as it may (record 0143).
  theme_limit: { status: 409, code: 'theme_limit' },
  // A group that the environment sets, and a part that open registration
  // needs, do not change in the application (record 0148).
  setting_locked: { status: 409, code: 'setting_locked' },
  setting_required: { status: 409, code: 'setting_required' },
  legal_document_unfinished: {
    status: 422,
    code: 'legal_document_unfinished',
  },
};

/** The explanation of one domain failure. It names no path and no content. */
const domainTitles: Readonly<Record<DomainErrorCode, string>> = {
  forbidden: 'The actor may not perform this operation.',
  not_found: 'The requested resource does not exist.',
  stale_head:
    'The accepted head of a file has moved on. Read it again and resolve the difference.',
  path_conflict: 'Another live file already holds one of the requested paths.',
  mutation_reused:
    'That mutation identity was already used for another operation.',
  purged:
    'The file was permanently deleted, so this identifier can never be written again.',
  snapshot_required:
    'The snapshot expired or the cursor predates the retained window. Start a fresh snapshot and keep local work.',
  epoch_mismatch:
    'The note holds another generation of its document. Read the current document, then save again.',
  unseen_work:
    'The deletion would hide text that this device has not seen. Read the text first.',
  document_malformed: 'The document work of the save is not readable.',
  document_dependency_missing:
    'The document work names an insertion or a deletion that the document does not hold.',
  document_unsupported:
    'The document work writes something other than the text of the note.',
  document_too_large:
    'The document work, or the document it would produce, passes a bound of the workspace.',
  unsupported_version:
    'The requested sync protocol version is not served. No data was changed.',
  invalid_path: 'A submitted path does not follow the workspace path rules.',
  invalid_graph:
    'The submitted revisions are not a valid change of the stored history.',
  invalid_content: 'Submitted content does not match its declared digest.',
  too_many_files:
    'The change rewrites more files than one request may hold. Move fewer files at a time.',
  note_too_large: 'This note is too large to render.',
  note_too_deep: 'This note nests too deeply to render.',
  // The one refusal of the reader path. The word is the word of
  // `titles.published_link_unavailable` and of `PublishedRefusal` in the
  // contract, so a refusal that arrives as a domain failure and a refusal that
  // arrives as `PublishedLinkUnavailableError` read the same.
  published_link_unavailable: 'This link is not available.',
  quota: 'The account has no room left for new content.',
  last_administrator:
    'The change would leave the installation with no enabled administrator.',
  invitation_invalid: 'This invitation is not valid. Ask for a new one.',
  account_exists: 'An account already signs in with this address.',
  open_registration_unavailable:
    'The installation lacks a part that open registration needs.',
  password_breached:
    'This password is in a list of leaked passwords. Choose another one.',
  registration_closed:
    'This installation takes new accounts by invitation. Ask an administrator for one.',
  verification_invalid:
    'This link is not valid any more. Sign up again to get a new link.',
  proof_invalid: 'The check of this browser did not finish. Try again.',
  consent_required:
    'The terms or the privacy notice changed. Read them again and accept them.',
  theme_limit:
    'The account already keeps as many imported themes as it may. Delete one first.',
  setting_locked:
    'The server environment sets this setting, so it changes there and not here.',
  setting_required:
    'Open registration needs this setting. Close open registration first.',
  legal_document_unfinished:
    'The text still holds a blank of the template. Fill each blank first.',
};

/**
 * The refusal of the open policy, with the parts that the installation lacks
 * (record 0114). The answer names each missing part, so the administrator
 * knows what to configure.
 */
export class OpenRegistrationUnavailableError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(domainTitles.open_registration_unavailable);
    this.name = 'OpenRegistrationUnavailableError';
    this.missing = [...missing];
  }
}

/**
 * A legal text that still holds a blank of the template (record 0148). The
 * answer names each blank, so the page can show the fields that are left.
 */
export class LegalDocumentUnfinishedError extends Error {
  readonly blanks: readonly string[];

  constructor(blanks: readonly string[]) {
    super(domainTitles.legal_document_unfinished);
    this.name = 'LegalDocumentUnfinishedError';
    this.blanks = [...blanks];
  }
}

/**
 * A test message that did not go (record 0148). The answer names the kind of
 * the failure and never the answer of the mail server, which can name a host
 * or an address.
 */
export class MailFailedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super('The mail server did not take the test message.');
    this.name = 'MailFailedError';
    this.reason = reason;
  }
}

/**
 * The one refusal of the reader path of a published link.
 *
 * A link that never existed, a revoked link, an expired link, a wrong
 * password, a note outside the scope and a picture that no note in scope
 * names all raise this one failure, as decision 0030 requires. The
 * constructor takes nothing, so no caller can put a word in the answer that
 * tells the causes apart, and `PublishedRefusal` in the contract fixes every
 * member of the body, so the boundary refuses an answer that carries one.
 */
export class PublishedLinkUnavailableError extends Error {
  constructor() {
    super(titles.published_link_unavailable);
    this.name = 'PublishedLinkUnavailableError';
  }
}

/** The named resource does not exist, or the actor may not see that it does. */
export class NotFoundError extends Error {
  constructor(detail = 'The requested resource does not exist.') {
    super(detail);
    this.name = 'NotFoundError';
  }
}

/**
 * Response contract failure. The invalid body is dropped here on purpose, so
 * the failure cannot leak the content that the contract rejected.
 */
export class ResponseContractError extends Error {
  readonly status: number;
  readonly mediaType: string;

  constructor(status: number, mediaType: string) {
    super(
      `The service produced a ${String(status)} ${mediaType} response that the contract does not allow.`,
    );
    this.name = 'ResponseContractError';
    this.status = status;
    this.mediaType = mediaType;
  }
}

/** Builds a problem body. */
export function createProblem(input: {
  readonly code: ProblemCode;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly requestId: string;
  readonly issues?: readonly ValidationIssue[];
  readonly fileIds?: readonly string[];
  readonly missing?: readonly string[];
  readonly blanks?: readonly string[];
  readonly reason?: string;
}): Problem {
  const issues = input.issues ?? [];
  const fileIds = input.fileIds ?? [];
  const missing = input.missing ?? [];
  const blanks = input.blanks ?? [];
  return {
    type: `https://notesapp.invalid/problems/${input.code}`,
    title: titles[input.code],
    status: input.status,
    detail: input.detail,
    instance: input.instance,
    code: input.code,
    requestId: input.requestId,
    ...(issues.length > 0 ? { issues } : {}),
    ...(fileIds.length > 0 ? { fileIds } : {}),
    ...(missing.length > 0 ? { missing } : {}),
    ...(blanks.length > 0 ? { blanks } : {}),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

/** Status and code that an unexpected failure maps to. */
export function classifyError(error: unknown): {
  status: number;
  code: ProblemCode;
  detail: string;
  issues: readonly ValidationIssue[];
  fileIds?: readonly string[];
  missing?: readonly string[];
  blanks?: readonly string[];
  reason?: string;
} {
  if (error instanceof LegalDocumentUnfinishedError)
    return {
      status: 422,
      code: 'legal_document_unfinished',
      detail: error.message,
      issues: [],
      blanks: error.blanks,
    };
  if (error instanceof MailFailedError)
    return {
      status: 422,
      code: 'mail_failed',
      detail: error.message,
      issues: [],
      reason: error.reason,
    };
  if (error instanceof OpenRegistrationUnavailableError)
    return {
      status: 422,
      code: 'open_registration_unavailable',
      detail: error.message,
      issues: [],
      missing: error.missing,
    };
  if (error instanceof DomainProblemError) {
    const mapped = domainStatus[error.domain.code];
    return {
      status: mapped.status,
      code: mapped.code,
      detail: domainTitles[error.domain.code],
      issues: [],
      ...(error.domain.fileIds.length > 0
        ? { fileIds: error.domain.fileIds }
        : {}),
    };
  }
  // A Markdown limit that no use case turned into a `Result` still answers
  // with the message for the author rather than with a server fault.
  const refused = markdownLimitCode(error);
  if (refused !== null) {
    const mapped = domainStatus[refused];
    return {
      status: mapped.status,
      code: mapped.code,
      detail: domainTitles[refused],
      issues: [],
    };
  }
  if (error instanceof PreconditionRequiredError)
    return {
      status: 428,
      code: 'precondition_required',
      detail: error.message,
      issues: [],
    };
  // A workspace that the actor cannot see and a workspace that does not exist
  // answer the same way, so the answer never discloses that it exists.
  if (error instanceof WorkspaceUnavailableError)
    return {
      status: 404,
      code: 'not_found',
      detail: titles.not_found,
      issues: [],
    };
  if (error instanceof RequestContractError)
    return {
      status: 400,
      code: 'invalid_request',
      detail: error.message,
      issues: error.issues,
    };
  if (error instanceof ResponseContractError)
    return {
      status: 500,
      code: 'invalid_response',
      detail: titles.invalid_response,
      issues: [],
    };
  if (error instanceof UnauthenticatedError)
    return {
      status: 401,
      code: 'unauthenticated',
      detail: error.message,
      issues: [],
    };
  if (error instanceof ForbiddenError)
    return {
      status: 403,
      code: 'forbidden',
      detail: error.message,
      issues: [],
    };
  if (error instanceof OriginRequiredError)
    return {
      status: 403,
      code: 'origin_required',
      detail: error.message,
      issues: [],
    };
  if (error instanceof PublishedLinkUnavailableError)
    return {
      status: 404,
      code: 'published_link_unavailable',
      detail: error.message,
      issues: [],
    };
  if (error instanceof NotFoundError)
    return {
      status: 404,
      code: 'not_found',
      detail: error.message,
      issues: [],
    };
  if (error instanceof RequestMediaTypeError)
    return {
      status: 415,
      code: 'unsupported_media_type',
      detail: error.message,
      issues: [],
    };
  if (error instanceof UnsupportedMediaTypeError)
    return {
      status: 415,
      code: 'unsupported_media_type',
      detail: error.message,
      issues: [],
    };
  if (error instanceof PayloadTooLargeError)
    return {
      status: 413,
      code: 'payload_too_large',
      detail: error.message,
      issues: [],
    };
  if (error instanceof RequestTimeoutError)
    return {
      status: 408,
      code: 'request_timeout',
      detail: error.message,
      issues: [],
    };
  if (error instanceof InvalidContentError)
    return {
      status: 422,
      code: 'invalid_content',
      detail: error.message,
      issues: [],
      ...(error.fileIds !== undefined ? { fileIds: error.fileIds } : {}),
    };
  const code = fastifyErrorCode(error);
  if (readProperty(error, 'statusCode') === 429)
    return {
      status: 429,
      code: 'rate_limited',
      detail: titles.rate_limited,
      issues: [],
    };
  if (code === 'FST_ERR_CTP_BODY_TOO_LARGE')
    return {
      status: 413,
      code: 'payload_too_large',
      detail: titles.payload_too_large,
      issues: [],
    };
  // A request that declares a JSON body and sends none, which a client can do
  // by setting a content type on a DELETE, is a malformed request rather than
  // a server fault.
  if (
    code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
    code === 'FST_ERR_CTP_INVALID_JSON_BODY'
  )
    return {
      status: 400,
      code: 'invalid_request',
      detail:
        'The request declares a JSON body but carries none, or carries one that is not JSON.',
      issues: [],
    };
  if (
    code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
    code === 'FST_ERR_CTP_EMPTY_TYPE'
  )
    return {
      status: 415,
      code: 'unsupported_media_type',
      detail: titles.unsupported_media_type,
      issues: [],
    };
  return {
    status: 500,
    code: 'internal_error',
    detail: titles.internal_error,
    issues: [],
  };
}

function fastifyErrorCode(error: unknown): string {
  const value = readProperty(error, 'code');
  return typeof value === 'string' ? value : '';
}
