import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkdownLimitError } from '@notesapp/markdown';
import { DatabaseFailure } from '@notesapp/storage-server';
import {
  classifyError,
  createProblem,
  DomainProblemError,
  ImportNoteRefusedError,
  PublishedLinkUnavailableError,
  RequestContractError,
  RequestMediaTypeError,
  ResponseContractError,
} from './problem.ts';

await test('a request contract failure becomes a 400 with its issues', () => {
  const classified = classifyError(
    new RequestContractError('query', [{ path: '/detail', message: 'bad' }]),
  );
  assert.equal(classified.status, 400);
  assert.equal(classified.code, 'invalid_request');
  assert.equal(classified.issues.length, 1);
});

await test('a response contract failure becomes a 500 without issues', () => {
  const classified = classifyError(
    new ResponseContractError(200, 'application/json'),
  );
  assert.equal(classified.status, 500);
  assert.equal(classified.code, 'invalid_response');
  assert.deepEqual(classified.issues, []);
});

await test('an oversized body becomes a 413', () => {
  const classified = classifyError({ code: 'FST_ERR_CTP_BODY_TOO_LARGE' });
  assert.equal(classified.status, 413);
  assert.equal(classified.code, 'payload_too_large');
});

await test('an unsupported media type becomes a 415', () => {
  for (const code of [
    'FST_ERR_CTP_INVALID_MEDIA_TYPE',
    'FST_ERR_CTP_EMPTY_TYPE',
  ]) {
    const classified = classifyError({ code });
    assert.equal(classified.status, 415);
    assert.equal(classified.code, 'unsupported_media_type');
  }
});

await test('a wrong request body media type becomes a 415', () => {
  const classified = classifyError(
    new RequestMediaTypeError('application/json'),
  );
  assert.equal(classified.status, 415);
  assert.equal(classified.code, 'unsupported_media_type');
  assert.match(classified.detail, /application\/json/);
});

await test('a note above the Markdown limits becomes a 422 for the author', () => {
  const cases = [
    [
      'note_too_large',
      'This note is too large. Move some of its text to another note.',
    ],
    [
      'note_too_deep',
      'This note nests too deeply. Remove some levels of lists, quotes or HTML.',
    ],
  ] as const;
  for (const [code, detail] of cases) {
    const classified = classifyError(
      new DomainProblemError({ code, fileIds: ['file-1'] }),
    );
    assert.equal(classified.status, 422);
    assert.equal(classified.code, 'unrenderable_note');
    assert.equal(classified.detail, detail);
    assert.deepEqual(classified.fileIds, ['file-1']);
  }
});

await test('a refused note of an import names the note and its own cause', () => {
  // Review of the audit of 2026-10-02. The import mapped every limit of the
  // grammar to a note that is too large, so a deep note read as a large one.
  const cases = [
    [
      'note_too_large',
      'The note "trip/Day 1" in the zip file is too large. Move some of its text to another note, then import again.',
    ],
    [
      'note_too_deep',
      'The note "trip/Day 1" in the zip file has too many levels of lists, quotes or HTML. Remove some levels, then import again.',
    ],
    [
      'note_too_many_marks',
      'A paragraph of the note "trip/Day 1" in the zip file has too many formatting marks. Divide the paragraph, then import again.',
    ],
    [
      'note_too_many_cells',
      'The tables of the note "trip/Day 1" in the zip file have too many cells. Move some rows to another note, then import again.',
    ],
  ] as const;
  for (const [code, detail] of cases) {
    const classified = classifyError(
      new ImportNoteRefusedError(code, 'trip/Day 1.md'),
    );
    assert.equal(classified.status, 422);
    assert.equal(classified.code, 'unrenderable_note');
    assert.equal(classified.detail, detail);
    assert.doesNotMatch(classified.detail, /\.md|[\u2013\u2014]/);
  }
});

await test('a refused note names its limit in the problem, and no other problem does', () => {
  // Record 0182. Every limit answered the one code unrenderable_note, so a
  // device that kept the refused save could not tell the person the cause.
  for (const code of [
    'note_too_large',
    'note_too_deep',
    'note_too_many_marks',
    'note_too_many_cells',
  ] as const) {
    const domain = classifyError(new DomainProblemError({ code, fileIds: [] }));
    assert.equal(domain.noteRefusal, code);
    const imported = classifyError(new ImportNoteRefusedError(code, 'a.md'));
    assert.equal(imported.noteRefusal, code);
  }
  assert.equal(
    classifyError(new MarkdownLimitError('table-cells', 10, 11)).noteRefusal,
    'note_too_many_cells',
  );
  const other = classifyError(
    new DomainProblemError({ code: 'path_conflict', fileIds: [] }),
  );
  assert.equal(other.noteRefusal, undefined);
  const body = createProblem({
    code: 'unrenderable_note',
    status: 422,
    detail: 'x',
    instance: '/api',
    requestId: 'r',
    noteRefusal: 'note_too_many_marks',
  });
  assert.equal(body.noteRefusal, 'note_too_many_marks');
  assert.equal(
    'noteRefusal' in
      createProblem({
        code: 'forbidden',
        status: 403,
        detail: 'x',
        instance: '/api',
        requestId: 'r',
      }),
    false,
  );
});

await test('a raw Markdown limit error never becomes a 500', () => {
  const cases = [
    [
      'input-size',
      'This note is too large. Move some of its text to another note.',
    ],
    [
      'nesting-depth',
      'This note nests too deeply. Remove some levels of lists, quotes or HTML.',
    ],
    [
      'block-marks',
      'A paragraph of this note has too many formatting marks. Divide the paragraph.',
    ],
    [
      'table-cells',
      'The tables of this note have too many cells. Move some rows to another note.',
    ],
  ] as const;
  for (const [reason, detail] of cases) {
    const classified = classifyError(new MarkdownLimitError(reason, 100, 101));
    assert.equal(classified.status, 422);
    assert.equal(classified.code, 'unrenderable_note');
    assert.equal(classified.detail, detail);
    // The technical sentence of the package never reaches the author.
    assert.equal(classified.detail.includes('Markdown input'), false);
  }
});

await test('any other failure becomes a generic 500', () => {
  for (const error of [new Error('boom'), null, 'text', { code: 42 }]) {
    const classified = classifyError(error);
    assert.equal(classified.status, 500);
    assert.equal(classified.code, 'internal_error');
    assert.equal(classified.detail.includes('boom'), false);
  }
});

await test('a problem carries its issues only when there are some', () => {
  const base = {
    code: 'invalid_request',
    status: 400,
    detail: 'bad',
    instance: '/api/health',
    requestId: 'trace-1',
  } as const;
  assert.equal('issues' in createProblem(base), false);
  const withIssues = createProblem({
    ...base,
    issues: [{ path: '/detail', message: 'bad' }],
  });
  assert.equal(withIssues.issues?.length, 1);
  assert.equal(
    withIssues.type,
    'https://notesapp.invalid/problems/invalid_request',
  );
});

await test('the one reader refusal names no cause', () => {
  // Decision 0030. A missing link, a revoked link, an expired link and a
  // wrong password all raise this failure, and it takes no message, so no
  // caller can put a word in the answer that tells the four apart.
  const classified = classifyError(new PublishedLinkUnavailableError());
  assert.equal(classified.status, 404);
  assert.equal(classified.code, 'published_link_unavailable');
  assert.equal(classified.detail, 'This link is not available.');
  assert.deepEqual(classified.issues, []);
  assert.equal(classified.fileIds, undefined);
  const problem = createProblem({
    code: classified.code,
    status: classified.status,
    detail: classified.detail,
    instance: '/published/aaaaaaaaaaaaaaaaaaaaaa',
    requestId: 'trace-1',
  });
  assert.equal(problem.title, problem.detail);
  assert.equal(
    problem.type,
    'https://notesapp.invalid/problems/published_link_unavailable',
  );
});

await test('a write that the database refuses for a locked owner answers account_locked', () => {
  // The refusal of the database itself, as the driver reports it, and as the
  // store keeps it in the cause of an operational failure (record 0201).
  const driver = Object.assign(new Error('the owner account is locked'), {
    code: 'NA004',
  });
  const kept = new Error('notesapp: the workspace store failed.', {
    cause: new DatabaseFailure(
      { code: 'NA004', constraint: null, table: null, routine: null },
      'a write',
    ),
  });
  for (const error of [driver, kept]) {
    const classified = classifyError(error);
    assert.equal(classified.status, 423);
    assert.equal(classified.code, 'account_locked');
  }
  assert.equal(
    classifyError(Object.assign(new Error('x'), { code: 'NA003' })).status,
    500,
  );
});
