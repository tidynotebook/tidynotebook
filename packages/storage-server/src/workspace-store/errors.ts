/**
 * The shared error mapping of the workspace store.
 *
 * Every repository reports a database fault through the same funnel here, so no
 * statement text, no bound parameter, and no PostgreSQL detail line can reach a
 * log. It also holds the identifier guard that every repository runs before a
 * value reaches SQL.
 */
import {
  OperationalError,
  fail,
  type OperationalErrorKind,
  type Result,
} from '@notesapp/core';
import { markdownLimitCode } from '../markdown-limits.ts';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The workspace is not available to this actor.
 *
 * The row access policies hide a workspace that the account is not a member
 * of, so storage cannot tell a missing workspace from a hidden one, and it
 * must not try: the answer would disclose that the workspace exists. This is
 * not an infrastructure failure, so it is a separate error. An HTTP adapter
 * maps it to 404.
 */
export class WorkspaceUnavailableError extends Error {
  readonly workspaceId: string;

  constructor(workspaceId: string) {
    super('notesapp: the workspace is not available to this actor.');
    this.name = 'WorkspaceUnavailableError';
    this.workspaceId = workspaceId;
  }
}

/**
 * A PostgreSQL failure, reduced to the fields that carry no stored content.
 *
 * `detail`, `hint`, `where`, the statement, and its bound parameters are
 * deliberately absent: PostgreSQL echoes the offending values in `detail`, and
 * the driver keeps the parameters.
 */
export type PostgresFailure = {
  readonly code: string;
  readonly constraint: string | null;
  readonly table: string | null;
  readonly routine: string | null;
};

/** Reads the PostgreSQL failure out of a thrown value and its causes. */
export function postgresFailure(value: unknown): PostgresFailure | null {
  let current: unknown = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return null;
    if ('code' in current && typeof current.code === 'string') {
      return {
        code: current.code,
        constraint:
          'constraint' in current && typeof current.constraint === 'string'
            ? current.constraint
            : null,
        table:
          'table' in current && typeof current.table === 'string'
            ? current.table
            : null,
        routine:
          'routine' in current && typeof current.routine === 'string'
            ? current.routine
            : null,
      };
    }
    if (!('cause' in current)) return null;
    current = current.cause;
  }
  return null;
}

/**
 * A content free description of a database failure.
 *
 * The driver's own error, and the wrapper that Drizzle puts around it, carry
 * the failed statement, its bound parameters, and the PostgreSQL `detail` and
 * `hint` fields. All four echo note text and file paths, and a logger that
 * walks `cause` would write them out. This class therefore becomes the cause
 * of every `OperationalError` that this package throws. It keeps only the
 * SQLSTATE, the constraint, the table, and the server routine.
 */
export class DatabaseFailure extends Error {
  readonly sqlState: string | null;
  readonly constraintName: string | null;
  readonly tableName: string | null;
  readonly routine: string | null;

  constructor(failure: PostgresFailure | null, fallback: string) {
    super(
      failure === null
        ? `notesapp: ${fallback}`
        : `notesapp: PostgreSQL rejected a statement with SQLSTATE ${failure.code}`,
    );
    this.name = 'DatabaseFailure';
    this.sqlState = failure?.code ?? null;
    this.constraintName = failure?.constraint ?? null;
    this.tableName = failure?.table ?? null;
    this.routine = failure?.routine ?? null;
  }
}

/**
 * Whether the database refused a write because the owner of the workspace,
 * or the account itself, is locked (NA004, records 0189 and 0201).
 *
 * The refusal comes from a driver failure, or from the `DatabaseFailure`
 * that this package keeps of one, so both are read.
 */
export function isLockedRefusal(value: unknown): boolean {
  if (postgresFailure(value)?.code === 'NA004') return true;
  let current: unknown = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current instanceof DatabaseFailure) return current.sqlState === 'NA004';
    if (typeof current !== 'object' || current === null) return false;
    if (!('cause' in current)) return false;
    current = current.cause;
  }
  return false;
}

/** The name of a thrown value, without any of its content. */
function failureName(value: unknown): string {
  if (value instanceof Error) return value.name;
  return typeof value;
}

/**
 * Failure codes that mean the database cannot be reached or cannot be used.
 *
 * The first four are Node socket codes that the driver reports in the same
 * `code` field as a SQLSTATE. `3D000` is a missing database, `28000` and
 * `28P01` are a refused login, `08*` is a broken connection, and `57P03` is a
 * server that is still starting.
 */
const unavailableCodes = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  '3D000',
  '28000',
  '28P01',
  '57P03',
]);

/** The infrastructure failure kind of one database failure code. */
function failureKind(code: string): OperationalErrorKind {
  if (code === '40001' || code === '40P01') return 'serialization';
  if (code === '57014') return 'timeout';
  if (unavailableCodes.has(code) || code.startsWith('08')) return 'unavailable';
  return 'unexpected';
}

/** Wraps an unexpected failure as an infrastructure failure. */
export function operational(value: unknown): OperationalError {
  if (value instanceof OperationalError) return value;
  const failure = postgresFailure(value);
  const kind = failure === null ? 'unexpected' : failureKind(failure.code);
  // The cause is rebuilt, never forwarded, so no statement text, no bound
  // parameter, and no PostgreSQL detail line can reach a log.
  return new OperationalError(kind, 'notesapp: the workspace store failed.', {
    cause: new DatabaseFailure(failure, `a ${failureName(value)} was thrown`),
  });
}

/**
 * Maps a SQL failure that is an expected domain outcome.
 *
 * Only the named constraints below are expected outcomes of a valid request.
 * Every other failure stays an infrastructure failure, so a defect cannot hide
 * behind a domain error code.
 */
export function domainFailure(
  value: unknown,
  fileIds: readonly string[],
): Result<never> | null {
  // A note that the Markdown package refuses is an expected outcome of a
  // valid save, so it leaves this layer as a domain failure with a message
  // for the author rather than as a server fault.
  const refused = markdownLimitCode(value);
  if (refused !== null) return fail<never>(refused, fileIds);
  const failure = postgresFailure(value);
  if (failure === null) return null;
  // A write to a workspace whose owner is locked (record 0201).
  if (failure.code === 'NA004') return fail<never>('account_locked', fileIds);
  const constraint = failure.constraint ?? '';
  if (failure.code === '23505') {
    if (constraint === 'live_paths_path_key')
      return fail<never>('path_conflict', fileIds);
    if (constraint === 'changesets_mutation_key') {
      return fail<never>('mutation_reused', fileIds);
    }
    if (constraint.startsWith('mutation_receipts')) {
      return fail<never>('mutation_reused', fileIds);
    }
    return null;
  }
  if (failure.code === '23503') {
    if (
      constraint === 'revision_parents_parent_fk' ||
      constraint === 'revision_parents_child_fk' ||
      constraint === 'revisions_restored_from_fk' ||
      constraint === 'revisions_content_fk' ||
      constraint === 'revisions_file_fk' ||
      constraint === 'files_head_revision_fk'
    ) {
      return fail<never>('invalid_graph', fileIds);
    }
    return null;
  }
  if (failure.code === '23514' && constraint.startsWith('revision_parents')) {
    return fail<never>('invalid_graph', fileIds);
  }
  return null;
}

/**
 * Whether a value has the shape of a UUID.
 *
 * A caller that answers nothing for an unknown identifier reads this, and a
 * caller whose transport already validated the value asserts it below.
 */
export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

/** Rejects an identifier that is not a UUID before it reaches SQL. */
export function assertUuid(value: string, what: string): void {
  if (!isUuid(value)) {
    throw new OperationalError(
      'unexpected',
      `notesapp: ${what} is not a UUID; the transport must validate it.`,
    );
  }
}

/**
 * Wraps a failure to take a connection of the pool.
 *
 * A connection that never opened has no SQLSTATE: the pool answers a plain
 * timeout when it waited out `connectionTimeoutMillis`, and a socket failure
 * carries a Node code and not a PostgreSQL one. Both mean the same thing to a
 * caller, which is that the database cannot be reached right now, so both
 * report `unavailable` and never `unexpected`. A caller can act on that: the
 * request can be sent again, and an operator can look at the database and at
 * the size of the pool.
 */
export function unreachable(value: unknown): OperationalError {
  if (value instanceof OperationalError) return value;
  const failure = postgresFailure(value);
  const kind = failure === null ? 'unavailable' : failureKind(failure.code);
  return new OperationalError(
    kind === 'unexpected' ? 'unavailable' : kind,
    'notesapp: the workspace store could not take a connection.',
    {
      cause: new DatabaseFailure(failure, `a ${failureName(value)} was thrown`),
    },
  );
}
