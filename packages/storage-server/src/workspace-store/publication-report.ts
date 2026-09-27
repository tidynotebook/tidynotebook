/**
 * The second write of the published boundary: a report (records 0119, 0123).
 *
 * Every other call of the reader path reads, apart from the unlock of
 * `publication-unlock.ts`. A report is one statement that calls one function
 * of the migration. The function takes the digest of the token, stores one
 * report row for a link that opens now, and reads and writes nothing else.
 * A token of no link stores nothing, and the caller cannot tell the two
 * apart, so a report walks no token.
 */
import type pg from 'pg';
import type { ReportReason } from '@notesapp/core';
import { isSecretDigest } from './publication-row.ts';
import { operational, postgresFailure, unreachable } from './errors.ts';

/** What one report carries. */
export type PublicationReport = {
  /** The digest of the token that the address named. */
  readonly tokenDigest: string;
  readonly reason: ReportReason;
  /** The note of the reader, or `null` for none. */
  readonly note: string | null;
  /** The address of the link, sealed with a key of the server, or `null`. */
  readonly sealedAddress: string | null;
};

/** Stores one report, or nothing for a token that opens no link. */
export async function reportPublication(
  pool: pg.Pool,
  report: PublicationReport,
): Promise<void> {
  // A digest of another shape names no link, because the token column
  // carries the same rule as a check constraint.
  if (!isSecretDigest(report.tokenDigest)) return;
  try {
    await pool.query(
      'select public.notesapp_report_publication($1, $2, $3, $4)',
      [report.tokenDigest, report.reason, report.note, report.sealedAddress],
    );
  } catch (error) {
    if (postgresFailure(error) !== null) throw operational(error);
    throw unreachable(error);
  }
}
