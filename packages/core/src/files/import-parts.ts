/**
 * The parts of a workspace archive that an import sends (record 0192).
 *
 * A proxy in front of the server refuses a large request body, so an import
 * sends its archive in parts and then completes it. The browser cuts the
 * archive with `importPartRanges`, and the server checks each part with
 * `importPartAllowed` and the whole set with `importPartsProblem`, so the two
 * sides read one rule.
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

/** The parts of an archive of `size` bytes, in order. */
export function importPartRanges(size: number): readonly ImportPartRange[] {
  if (!Number.isSafeInteger(size) || size <= 0) return [];
  const ranges: ImportPartRange[] = [];
  for (let start = 0; start < size; start += importPartBytes) {
    const end = Math.min(size, start + importPartBytes);
    ranges.push({
      partNumber: ranges.length + 1,
      size: end - start,
      start,
      end,
    });
  }
  return ranges;
}

/** Whether one part can belong to an import at all. */
export function importPartAllowed(partNumber: number, size: number): boolean {
  return (
    Number.isSafeInteger(partNumber) &&
    partNumber >= 1 &&
    partNumber <= maxImportParts &&
    Number.isSafeInteger(size) &&
    size >= 1 &&
    size <= importPartBytes
  );
}

/** What is wrong with the parts of an import that completes. */
export type ImportPartsProblem =
  /** No part arrived. */
  | 'no_parts'
  /** A number between the first and the last part has no part. */
  | 'missing_part'
  /** A part before the last one holds less than `importPartBytes`. */
  | 'short_part'
  /** The parts together hold more than one archive can. */
  | 'too_large';

/**
 * What is wrong with the parts of an import, or `null` when they make one
 * archive.
 *
 * The parts make one archive when they are numbered from 1 with no gap,
 * every part but the last is full, and the sum is inside `maxArchiveBytes`.
 */
export function importPartsProblem(
  parts: readonly ImportPart[],
): ImportPartsProblem | null {
  if (parts.length === 0) return 'no_parts';
  const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  let total = 0;
  for (const [index, part] of ordered.entries()) {
    if (part.partNumber !== index + 1) return 'missing_part';
    const last = index === ordered.length - 1;
    if (!last && part.size !== importPartBytes) return 'short_part';
    total += part.size;
  }
  return total > maxArchiveBytes ? 'too_large' : null;
}

/** The bytes of the archive that the parts make. */
export function importPartsBytes(parts: readonly ImportPart[]): number {
  return parts.reduce((total, part) => total + part.size, 0);
}
