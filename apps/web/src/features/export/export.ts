/**
 * Downloads of exported Markdown.
 *
 * A browser saves a file in one way only: an anchor that points at a local
 * object URL and is clicked. The bytes therefore come from the generated
 * operation, become a blob URL, and the URL is revoked as soon as the click
 * is handed to the browser. No request URL is built here.
 *
 * The download name comes from the answer. The server states it in the
 * content disposition, which is the one place that knows the stored path.
 */
import type { ImportResult } from '../../lib/import-result.ts';
import {
  abortWorkspaceImport,
  completeWorkspaceImport,
  exportNote,
  exportWorkspaceAddress,
  inspectWorkspaceExport,
  sendWorkspaceImportPart,
  startWorkspaceImport,
} from '@notesapp/api-client';
import {
  importPartRanges,
  maxArchiveBytes,
  maxArchiveEntries,
  productName,
} from '@notesapp/core';

/** The byte bound of one archive, in whole MiB, as a person reads it. */
const archiveMiB = Math.floor(maxArchiveBytes / (1024 * 1024));

/** The problem code of a failed generated call, or an empty string. */
function problemCode(error: unknown): string {
  if (error === null || typeof error !== 'object') return '';
  const code: unknown = Object.fromEntries(Object.entries(error))['code'];
  return typeof code === 'string' ? code : '';
}

/** The message of an archive job that waits for another one, or `null`. */
function archiveJobMessage(code: string): string | null {
  if (code === 'archive_job_running')
    return 'An import or an export of your account runs now. Wait until it ends, then try again.';
  if (code === 'archive_jobs_busy')
    return 'The server runs as many imports and exports as it can now. Try again in a minute.';
  return null;
}

/** The detail of a problem, which states the counts of an import. */
function problemDetail(error: unknown): string {
  if (error === null || typeof error !== 'object') return '';
  const detail: unknown = Object.fromEntries(Object.entries(error))['detail'];
  return typeof detail === 'string' ? detail : '';
}

/** The message of a refused download. */
export function downloadRefusalMessage(error: unknown): string {
  const code = problemCode(error);
  if (code === 'not_found') return 'This note is not on the server any more.';
  if (code === 'unauthenticated')
    return 'Sign in again to download your notes.';
  // Issue 243. The export refuses a workspace past the bounds that the import
  // reads too, so every zip file that it writes comes back.
  if (code === 'export_too_large')
    return `This workspace holds more than one zip file can take: ${String(maxArchiveEntries)} files or ${String(archiveMiB)} MiB. Move some notes to another workspace, then export each workspace.`;
  const busy = archiveJobMessage(code);
  if (busy !== null) return busy;
  return 'The download did not start. Try again.';
}

/** The error of a refused download. */
function refuse(error: unknown): Error {
  return new Error(downloadRefusalMessage(error));
}

/**
 * The message of each refusal of an import that a person can act on.
 *
 * Each problem code of the import has its own sentence, so the person reads
 * the real cause and the next step (issue 243). A code that is not here gets
 * the general sentence.
 */
const importRefusals: Readonly<Record<string, string>> = {
  path_conflict:
    'A note or an image in this workspace has the same name as a file in the zip file. Rename or move it, then import again.',
  unauthenticated: 'Sign in again to import your notes.',
  payload_too_large:
    'The zip file is too large. Put the files in smaller zip files and import each one.',
  archive_too_many_files: `The zip file has more than ${String(maxArchiveEntries)} files. Put the files in smaller zip files and import each one.`,
  archive_too_large: `A file in the zip file is larger than ${productName} can take, or all the files together are. Remove the large files or put the files in smaller zip files, then import again.`,
  archive_invalid: `This file is not a zip file that ${productName} can read. Make the zip file again and import it.`,
  unsupported_media_type:
    'The zip file can hold only Markdown files and images. Remove the other files and import again.',
  storage_full:
    'The server has no room for this zip file now. Try again later, or ask the administrator for more room.',
  quota_exceeded:
    'Your account has no room for these files. Delete some notes or images, then import again.',
  unrenderable_note:
    'A note in the zip file cannot be read as Markdown. Change the note, then import again.',
  // The zip file goes up in parts (record 0192). A part that stops, and an
  // import that the server no longer holds, both ask for the whole file.
  request_timeout:
    'The zip file stopped on its way to the server. Check the connection, then import again.',
  not_found:
    'The server no longer holds this import. Import the zip file again.',
};

/** The message of a refused import. */
export function importRefusalMessage(error: unknown): string {
  const code = problemCode(error);
  // The server states how many files came in, or which note it refused and
  // why, which only it knows.
  if (
    (code === 'import_incomplete' || code === 'unrenderable_note') &&
    problemDetail(error) !== ''
  )
    return problemDetail(error);
  return (
    archiveJobMessage(code) ??
    importRefusals[code] ??
    'The import did not finish. Check the zip file and try again.'
  );
}

/**
 * The sentence that a screen shows for a failed download or import.
 *
 * Each function of this module refuses with an `Error` whose message is the
 * sentence of the cause. The general problem text of the application reads a
 * problem code, and an `Error` has none, so it named a lost connection for
 * every refusal (issue 243). A screen reads the sentence here instead.
 */
export function transferFailureMessage(failure: unknown): string {
  return failure instanceof Error && failure.message !== ''
    ? failure.message
    : 'The request did not finish. Try again.';
}

/** The error of a refused import. */
function refuseImport(error: unknown): Error {
  return new Error(importRefusalMessage(error));
}

/**
 * The download name that the answer states, or the given fallback.
 *
 * The header carries the name twice: once in ASCII between quotes and once
 * percent encoded as UTF-8. The encoded form is preferred, because it is the
 * one that keeps every character of the name.
 */
export function downloadName(
  disposition: string | null,
  fallback: string,
): string {
  if (disposition === null) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded !== undefined) {
    try {
      const name = decodeURIComponent(encoded.trim());
      if (name !== '') return name;
    } catch {
      // A header this client cannot read falls back to the quoted form.
    }
  }
  const quoted = /filename="([^"]*)"/i.exec(disposition)?.[1];
  return quoted === undefined || quoted === '' ? fallback : quoted;
}

/**
 * The answer as a blob.
 *
 * The generated client parses an answer by its media type: a zip arrives as a
 * blob, and Markdown arrives as text. Both are saved the same way, so the
 * text form is wrapped here.
 */
function asBlob(data: unknown, mediaType: string): Blob {
  if (data instanceof Blob) return data;
  return new Blob([typeof data === 'string' ? data : ''], {
    type: mediaType,
  });
}

/** Hands one blob to the browser as a saved file. */
export function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // The click is queued before this runs, so the browser keeps the bytes.
  URL.revokeObjectURL(url);
}

/** Saves one note as a Markdown file on this device. */
export async function downloadNote(
  workspaceId: string,
  fileId: string,
): Promise<void> {
  const answer = await exportNote({ path: { workspaceId, fileId } });
  if (answer.error !== undefined || answer.data === undefined)
    throw refuse(answer.error);
  save(
    asBlob(answer.data, 'text/markdown'),
    downloadName(
      answer.response?.headers.get('content-disposition') ?? null,
      'note.md',
    ),
  );
}

/**
 * The message of an export that its check refused, by the status alone.
 *
 * The check is a HEAD, whose answer has no body, so the status names the
 * cause (record 0178).
 */
export function exportCheckMessage(status: number): string {
  if (status === 401) return 'Sign in again to download your notes.';
  if (status === 403)
    return 'Your role in this workspace does not allow an export.';
  if (status === 404) return 'This workspace is not on the server any more.';
  if (status === 422)
    return downloadRefusalMessage({ code: 'export_too_large' });
  if (status === 429)
    return downloadRefusalMessage({ code: 'archive_job_running' });
  if (status === 0)
    return 'The server could not be reached. Connect to the network and try again.';
  return 'The download did not start. Try again.';
}

/**
 * Saves every live note of the workspace as one zip archive.
 *
 * The browser reads the export address itself, so it saves the archive to
 * the disk of the device as it arrives, in every browser and at any size
 * (record 0178). The address comes from the generated builder, so no code
 * here writes it. The check before it plans the archive and runs no job, so
 * a refusal reaches the person as a sentence instead of a failed download.
 */
export async function downloadAll(workspaceId: string): Promise<void> {
  const checked = await inspectWorkspaceExport({ path: { workspaceId } });
  const status = checked.response?.status ?? 0;
  if (checked.error !== undefined || status !== 200)
    throw new Error(exportCheckMessage(status));
  const anchor = document.createElement('a');
  anchor.href = exportWorkspaceAddress({ workspaceId });
  // An empty name keeps the name that the answer states.
  anchor.download = '';
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Imports one portable workspace archive. The server moves a picture into
 * the attachments folder and turns a wiki link into a standard link, and
 * names the files that it left out (record 0172).
 *
 * The archive goes up in parts of the size that the server states, because
 * a proxy in front of the server refuses a large body (record 0192). Each
 * part is a slice of the file, so the browser never holds the whole archive
 * in memory, and the completion reads it on the server. When a part or the
 * completion fails, the import is removed at once, so its parts do not hold
 * the storage of the server.
 */
export async function importAll(
  workspaceId: string,
  file: File,
): Promise<ImportResult> {
  const started = await startWorkspaceImport({
    path: { workspaceId },
    body: { size: file.size },
  });
  if (started.error !== undefined || started.data === undefined)
    throw refuseImport(started.error);
  const { importId, partBytes } = started.data;
  const abandon = async (error: unknown): Promise<never> => {
    // The removal is a courtesy: the daily cleanup of the server takes an
    // import that it leaves, so its own failure changes no answer.
    await abortWorkspaceImport({ path: { workspaceId, importId } }).catch(
      () => undefined,
    );
    throw refuseImport(error);
  };
  for (const part of importPartRanges(file.size, partBytes)) {
    const sent = await sendWorkspaceImportPart({
      path: { workspaceId, importId, partNumber: part.partNumber },
      body: file.slice(part.start, part.end),
    }).catch((failure: unknown) => ({ error: failure }));
    if (sent.error !== undefined) return abandon(sent.error);
  }
  const answer = await completeWorkspaceImport({
    path: { workspaceId, importId },
  });
  if (answer.error !== undefined || answer.data === undefined)
    return abandon(answer.error);
  return answer.data;
}
