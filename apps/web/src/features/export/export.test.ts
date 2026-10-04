import assert from 'node:assert/strict';
import test from 'node:test';
import {
  downloadName,
  downloadRefusalMessage,
  exportCheckMessage,
  importRefusalMessage,
  transferFailureMessage,
} from './export.ts';

await test('the download name comes from the encoded form of the header', () => {
  assert.equal(
    downloadName(
      `attachment; filename="Gr__e.md"; filename*=UTF-8''Gr%C3%BC%C3%9Fe.md`,
      'note.md',
    ),
    'Grüße.md',
  );
});

await test('the quoted form is used when no encoded form is there', () => {
  assert.equal(
    downloadName('attachment; filename="plan.md"', 'note.md'),
    'plan.md',
  );
});

await test('a missing or unreadable header falls back to the given name', () => {
  assert.equal(downloadName(null, 'note.md'), 'note.md');
  assert.equal(downloadName('attachment', 'notes.zip'), 'notes.zip');
  assert.equal(
    downloadName(`attachment; filename*=UTF-8''%E0%A4%A`, 'note.md'),
    'note.md',
  );
});

await test('each refusal of an import names its cause and the next step', () => {
  // Issue 243. An archive of more files than the import took read as a
  // content failure, and the person read a general sentence.
  assert.equal(
    importRefusalMessage({ code: 'archive_too_many_files' }),
    'The zip file has more than 65534 files. Put the files in smaller zip files and import each one.',
  );
  assert.equal(
    importRefusalMessage({ code: 'archive_too_large' }),
    `A file in the zip file is larger than tidy notebook can take, or all the files together are. Remove the large files or put the files in smaller zip files, then import again.`,
  );
  assert.equal(
    importRefusalMessage({ code: 'archive_invalid' }),
    `This file is not a zip file that tidy notebook can read. Make the zip file again and import it.`,
  );
  const messages = [
    'path_conflict',
    'unauthenticated',
    'payload_too_large',
    'archive_too_many_files',
    'archive_too_large',
    'archive_invalid',
    'unsupported_media_type',
    'quota_exceeded',
    'unrenderable_note',
    'request_timeout',
    'not_found',
  ].map((code) => importRefusalMessage({ code }));
  assert.equal(
    new Set(messages).size,
    messages.length,
    'one cause, one message',
  );
  for (const message of messages)
    assert.doesNotMatch(message, /[\u2013\u2014]|_/);
});

await test('a part that stops and a lost import ask for the zip file again', () => {
  // Record 0192. The zip file goes up in parts, so a part can stop on its
  // way and the server can lose an import that waited for a day.
  assert.equal(
    importRefusalMessage({ code: 'request_timeout' }),
    'The zip file stopped on its way to the server. Check the connection, then import again.',
  );
  assert.equal(
    importRefusalMessage({ code: 'not_found' }),
    'The server no longer holds this import. Import the zip file again.',
  );
});

await test('a refused note of an import shows the note and the cause that the server names', () => {
  // Review of the audit of 2026-10-02. The import answered every limit of
  // the grammar as a note that is too large, and the screen read the
  // general sentence, so a person did not learn which note to change.
  const detail =
    'The note "trip/Day 1" in the zip file has too many levels of lists, quotes or HTML. Remove some levels, then import again.';
  assert.equal(
    importRefusalMessage({ code: 'unrenderable_note', detail }),
    detail,
  );
  // An answer with no detail still names the cause and the next step.
  assert.equal(
    importRefusalMessage({ code: 'unrenderable_note' }),
    'A note in the zip file cannot be read as Markdown. Change the note, then import again.',
  );
});

await test('an unknown refusal of an import gets the general sentence', () => {
  assert.equal(
    importRefusalMessage({ code: 'internal_error' }),
    'The import did not finish. Check the zip file and try again.',
  );
  assert.equal(
    importRefusalMessage(null),
    'The import did not finish. Check the zip file and try again.',
  );
});

await test('a screen shows the sentence of a refused transfer', () => {
  // Issue 243. The screen read the general problem text, which names a lost
  // connection for an error that carries no problem code.
  assert.equal(
    transferFailureMessage(
      new Error(importRefusalMessage({ code: 'archive_invalid' })),
    ),
    `This file is not a zip file that tidy notebook can read. Make the zip file again and import it.`,
  );
  assert.equal(
    transferFailureMessage({ code: 'internal_error' }),
    'The request did not finish. Try again.',
  );
});

await test('an export past the bounds of one zip file says what to do', () => {
  assert.equal(
    downloadRefusalMessage({ code: 'export_too_large' }),
    'This workspace holds more than one zip file can take: 65534 files or 4095 MiB. Move some notes to another workspace, then export each workspace.',
  );
  assert.equal(
    downloadRefusalMessage({ code: 'internal_error' }),
    'The download did not start. Try again.',
  );
});

await test('an archive job that waits says when to try again', () => {
  // Record 0170. One import or export of an account runs at once, and a few
  // of the installation.
  assert.equal(
    importRefusalMessage({ code: 'archive_job_running' }),
    'An import or an export of your account runs now. Wait until it ends, then try again.',
  );
  assert.equal(
    downloadRefusalMessage({ code: 'archive_jobs_busy' }),
    'The server runs as many imports and exports as it can now. Try again in a minute.',
  );
  assert.equal(
    importRefusalMessage({ code: 'storage_full' }),
    'The server has no room for this zip file now. Try again later, or ask the administrator for more room.',
  );
  // Only the server knows how many files of a stopped import came in.
  assert.equal(
    importRefusalMessage({
      code: 'import_incomplete',
      detail: '3 files of 5 came in before the import stopped.',
    }),
    '3 files of 5 came in before the import stopped.',
  );
});

await test('the check of an export names its cause by the status of its answer', () => {
  // Record 0178. The browser reads the export address itself, so the check
  // before it is the one place where a refusal can reach the person.
  assert.equal(
    exportCheckMessage(401),
    'Sign in again to download your notes.',
  );
  assert.equal(
    exportCheckMessage(422),
    downloadRefusalMessage({ code: 'export_too_large' }),
  );
  assert.equal(
    exportCheckMessage(429),
    downloadRefusalMessage({ code: 'archive_job_running' }),
  );
  assert.equal(
    exportCheckMessage(404),
    'This workspace is not on the server any more.',
  );
  assert.equal(
    exportCheckMessage(0),
    'The server could not be reached. Connect to the network and try again.',
  );
  assert.equal(
    exportCheckMessage(500),
    'The download did not start. Try again.',
  );
});
