/**
 * The parts of a workspace archive that an import sends (record 0192).
 *
 * A proxy in front of the server refuses a large request body, so an import
 * sends its archive in parts and then completes it. The browser cuts the
 * archive with `importPartRanges`, and the server checks each part with
 * `importPartSize` and the whole set with `importPartsProblem`, so the two
 * sides read one rule. Both read the size of the archive that the start
 * declared, so the parts can never hold more than the start checked.
 *
 * Every part but the last holds exactly `importPartBytes`. An S3 store refuses
 * a part under its own minimum before the last one, and a fixed size keeps a
 * part number the same place in the archive on every replica.
 */
import { maxArchiveBytes } from './archive.ts';

/** The bytes of each part of an import but the last one. */
export const importPartBytes = 50 * 1024 * 1024;

/** The most parts of one import: the archive bound in full parts. */
export const maxImportParts = Math.ceil(maxArchiveBytes / importPartBytes);

/** One part that a store holds: its number from 1, and its bytes. */
export type ImportPart = {
  readonly partNumber: number;
  readonly size: number;
};

/** One part of an archive that a browser sends, as a byte range. */
export type ImportPartRange = ImportPart & {
  /** The first byte of the part in the archive. */
  readonly start: number;
  /** The byte after the last byte of the part. */
  readonly end: number;
};

/**
 * The parts of an archive of `size` bytes, in order, each of `partBytes`
 * but the last. A browser passes the part size that the server answered.
 */
export function importPartRanges(
  size: number,
  partBytes: number = importPartBytes,
): readonly ImportPartRange[] {
  if (!Number.isSafeInteger(size) || size <= 0) return [];
  if (!Number.isSafeInteger(partBytes) || partBytes <= 0) return [];
  const ranges: ImportPartRange[] = [];
  for (let start = 0; start < size; start += partBytes) {
    const end = Math.min(size, start + partBytes);
    ranges.push({
      partNumber: ranges.length + 1,
      size: end - start,
      start,
      end,
    });
  }
  return ranges;
}

/**
 * The bytes that part `partNumber` of an archive of `archiveBytes` holds, or
 * `null` when the archive has no such part.
 */
export function importPartSize(
  archiveBytes: number,
  partNumber: number,
): number | null {
  if (!Number.isSafeInteger(partNumber) || partNumber < 1) return null;
  return importPartRanges(archiveBytes)[partNumber - 1]?.size ?? null;
}

/** What is wrong with the parts of an import that completes. */
export type ImportPartsProblem =
  /** The declared archive is past the bound of one archive. */
  | 'too_large'
  /** A part of the declared archive has not arrived. */
  | 'missing_part'
  /** A part holds other bytes than its place in the archive, or has none. */
  | 'wrong_part';

/**
 * What is wrong with the parts of an import, or `null` when they make the
 * archive of `archiveBytes` that the start declared.
 *
 * The parts make that archive when each part of `importPartRanges` is there
 * with its size, and no other part is.
 */
export function importPartsProblem(
  parts: readonly ImportPart[],
  archiveBytes: number,
): ImportPartsProblem | null {
  if (archiveBytes > maxArchiveBytes) return 'too_large';
  const expected = importPartRanges(archiveBytes);
  const held = new Map(parts.map((part) => [part.partNumber, part.size]));
  if (
    parts.some((part) => importPartSize(archiveBytes, part.partNumber) === null)
  )
    return 'wrong_part';
  for (const range of expected) {
    const size = held.get(range.partNumber);
    if (size === undefined) return 'missing_part';
    if (size !== range.size) return 'wrong_part';
  }
  return expected.length === 0 ? 'missing_part' : null;
}
