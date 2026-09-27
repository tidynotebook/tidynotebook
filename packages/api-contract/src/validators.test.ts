/**
 * Checks of the shared definition document and of the validator cache.
 *
 * The generated index states a repeated schema once and points at it. These
 * tests prove that the pointers resolve, that expanding them gives back a
 * self-contained schema, and that the boundary still refuses what it refused
 * when every copy was written out.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import {
  operations,
  sharedDefinitions,
  type JsonSchema,
} from './generated/contract.ts';
import { compileCounts } from './validators.ts';
import {
  describeIssues,
  requestValidator,
  responseMediaTypes,
  responseValidator,
} from './index.ts';

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * True when a value carries every declared member of an Ajv schema object.
 *
 * `expand` builds a new object out of parsed members, so nothing in its
 * result proves that Ajv can compile it. This guard checks each member that
 * the schema object declares, and the compile calls below take only what it
 * accepted.
 */
function isSchemaObject(value: unknown): value is JsonSchema {
  if (!isRecord(value)) return false;
  for (const key of ['id', '$id', '$schema']) {
    const member: unknown = value[key];
    if (member !== undefined && typeof member !== 'string') return false;
  }
  return value['$async'] !== true;
}

const document: Json = sharedDefinitions;
const declaredDefinitions: unknown = document['$defs'];
if (!isRecord(declaredDefinitions))
  throw new Error('The shared definition document holds no $defs map.');
const definitions: Json = declaredDefinitions;
const pointerPrefix = `${String(document['$id'])}#/$defs/`;

/** Replaces every pointer into the shared document with what it names. */
function expand(value: unknown, seen: readonly string[] = []): unknown {
  if (Array.isArray(value)) return value.map((item) => expand(item, seen));
  if (!isRecord(value)) return value;
  const reference = value.$ref;
  if (typeof reference === 'string') {
    assert.ok(
      reference.startsWith(pointerPrefix),
      `the reference ${reference} does not name the shared document`,
    );
    const name = reference.slice(pointerPrefix.length);
    assert.ok(name in definitions, `the definition ${name} does not exist`);
    assert.ok(!seen.includes(name), `the definition ${name} refers to itself`);
    const rest = Object.entries(value).filter(([key]) => key !== '$ref');
    const target = expand(definitions[name], [...seen, name]);
    assert.ok(isRecord(target), `the definition ${name} is not an object`);
    return { ...Object.fromEntries(rest), ...target };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, member]) => [key, expand(member, seen)]),
  );
}

/** Every schema the index states, one per request slot and per response. */
function everySchema(): JsonSchema[] {
  const schemas: JsonSchema[] = [];
  for (const operation of operations) {
    schemas.push(
      operation.request.params,
      operation.request.query,
      operation.request.headers,
    );
    if (operation.request.body !== null) schemas.push(operation.request.body);
    for (const response of operation.responses) schemas.push(response.schema);
  }
  return schemas;
}

/** One schema with every shared pointer replaced by what it names. */
function expandSchema(schema: JsonSchema): JsonSchema {
  const expanded = expand(schema);
  assert.ok(isSchemaObject(expanded), 'an expanded schema is not compilable');
  return expanded;
}

await test('every shared pointer resolves to a definition', () => {
  const expanded = everySchema().map((schema) => expand(schema));
  assert.equal(expanded.length, everySchema().length);
  assert.ok(expanded.length > 400);
});

await test('an expanded schema holds no reference of its own', () => {
  const text = JSON.stringify(everySchema().map((schema) => expand(schema)));
  assert.equal(text.includes('"$ref"'), false);
});

await test('an expanded schema compiles and behaves like the pointer form', () => {
  const ajv = new Ajv2020({ allErrors: false, strict: true });
  ajvFormats.default(ajv);
  const shared = new Ajv2020({ allErrors: false, strict: true });
  ajvFormats.default(shared);
  shared.addSchema(sharedDefinitions);
  const problem = {
    type: 'about:blank',
    title: 'The request did not match the contract.',
    status: 400,
    detail: 'x',
    instance: '/api/health',
    code: 'invalid_request',
    requestId: '00000000-0000-4000-8000-000000000000',
  };
  const operation = operations.find((entry) => entry.id === 'getHealth');
  assert.ok(operation !== undefined);
  const declared = operation.responses.find(
    (response) => response.mediaType === 'application/problem+json',
  );
  assert.ok(declared !== undefined);
  const pointerForm = shared.compile(declared.schema);
  const expandedForm = ajv.compile(expandSchema(declared.schema));
  assert.equal(pointerForm(problem), true);
  assert.equal(expandedForm(problem), true);
  const broken = { ...problem, status: 'four hundred' };
  assert.equal(pointerForm(broken), false);
  assert.equal(expandedForm(broken), false);
  assert.deepEqual(
    describeIssues(pointerForm.errors),
    describeIssues(expandedForm.errors),
  );
});

await test('a shared definition still refuses an invalid response body', () => {
  const validate = responseValidator(
    'getHealth',
    400,
    'application/problem+json',
  );
  assert.ok(validate !== undefined);
  assert.equal(validate({}), false);
  assert.deepEqual(describeIssues(validate.errors), [
    { path: '/', message: "must have required property 'type'" },
  ]);
});

await test('the shared error schema is written once', () => {
  assert.ok(isRecord(definitions.ProblemDetails));
  const text = JSON.stringify(operations);
  // The index states the pointer, never the schema behind it.
  assert.equal(text.includes('RFC 9457 problem details'), false);
  const pointer = `${pointerPrefix}ProblemDetails`;
  const copies = text.split(JSON.stringify(pointer)).length - 1;
  assert.ok(copies > 200, `${String(copies)} pointers to the error schema`);
});

await test('a schema that many slots share compiles once', () => {
  assert.ok(compileCounts.validators > 400);
  // 434 slots and responses needed 434 compilations before the cache existed.
  assert.ok(
    compileCounts.schemas < compileCounts.validators / 5,
    `${String(compileCounts.schemas)} compilations for ${String(compileCounts.validators)} validators`,
  );
});

/**
 * The one refusal of the reader path of a published link.
 *
 * Decision 0030 needs a missing link, a revoked link, an expired link and a
 * wrong password to read alike. The shape is closed and every member that
 * could carry a difference is fixed, so the boundary refuses an answer that
 * carries one. These cases hold that rule at the contract, where a later
 * author reads it first.
 */
const refusal = {
  type: 'https://notesapp.invalid/problems/published_link_unavailable',
  title: 'This link is not available.',
  status: 404,
  detail: 'This link is not available.',
  instance: '/published/aaaaaaaaaaaaaaaaaaaaaa',
  code: 'published_link_unavailable',
  requestId: '00000000-0000-4000-8000-000000000000',
};

await test('every reader subresource refuses with one shape', () => {
  // Record 0047 gives the page one answer for every state of a link, so the
  // page declares no refusal at all. The two subresources keep it: a picture
  // cannot show a sentence, and the unlock answers a program.
  for (const id of ['unlockPublishedLink', 'getPublishedAttachment'] as const) {
    const validate = responseValidator(id, 404, 'application/problem+json');
    assert.ok(validate !== undefined, id);
    assert.equal(validate(refusal), true, id);
  }
});

await test('the page of a published link answers one document', () => {
  for (const id of ['getPublishedPage', 'openPublishedPage'] as const) {
    assert.deepEqual(responseMediaTypes(id, 200), ['text/html'], id);
    assert.equal(
      responseValidator(id, 404, 'application/problem+json'),
      undefined,
      id,
    );
  }
});

await test('the refusal takes no member that tells the causes apart', () => {
  const validate = responseValidator(
    'unlockPublishedLink',
    404,
    'application/problem+json',
  );
  assert.ok(validate !== undefined);
  // A neighbouring body that names a cause, a note, or a count.
  assert.equal(validate({ ...refusal, reason: 'wrong password' }), false);
  assert.equal(validate({ ...refusal, fileIds: [] }), false);
  assert.equal(validate({ ...refusal, issues: [] }), false);
  assert.equal(
    validate({ ...refusal, detail: 'The password is wrong.' }),
    false,
  );
  assert.equal(validate({ ...refusal, title: 'This link expired.' }), false);
  assert.equal(validate({ ...refusal, code: 'not_found' }), false);
  assert.equal(validate({ ...refusal, status: 403 }), false);
  assert.equal(
    validate({
      ...refusal,
      type: 'https://notesapp.invalid/problems/not_found',
    }),
    false,
  );
  const { detail: _detail, ...withoutDetail } = refusal;
  assert.equal(validate(withoutDetail), false);
});

await test('the token of a link appears in one answer only', () => {
  const created = responseValidator(
    'createPublishedLink',
    201,
    'application/json',
  );
  assert.ok(created !== undefined);
  const link = {
    publicationId: '00000000-0000-4000-8000-000000000000',
    scope: { kind: 'note', fileId: '00000000-0000-4000-8000-000000000001' },
    createdAt: '2026-09-16T00:00:00.000Z',
    expiresAt: null,
    passwordProtected: false,
    takenDown: false,
  };
  assert.equal(created({ link, token: 'aaaaaaaaaaaaaaaaaaaaaa' }), true);
  // The answer states the token once, so a second copy is refused.
  assert.equal(created({ link }), false);
  const listed = responseValidator(
    'listPublishedLinks',
    200,
    'application/json',
  );
  assert.ok(listed !== undefined);
  assert.equal(listed({ links: [link] }), true);
  assert.equal(
    listed({ links: [{ ...link, token: 'aaaaaaaaaaaaaaaaaaaaaa' }] }),
    false,
  );
  // Not even a part of it.
  assert.equal(listed({ links: [{ ...link, tokenPrefix: 'aaaa' }] }), false);
});

await test('a published scope is one note or one folder, never both', () => {
  const validate = requestValidator('createPublishedLink', 'body');
  assert.ok(validate !== undefined);
  const note = { kind: 'note', fileId: '00000000-0000-4000-8000-000000000001' };
  const folder = { kind: 'folder', path: 'Work' };
  assert.equal(validate({ scope: note }), true);
  assert.equal(validate({ scope: folder }), true);
  assert.equal(validate({ scope: { ...note, path: 'Work' } }), false);
  assert.equal(validate({ scope: { kind: 'note' } }), false);
  assert.equal(validate({ scope: { kind: 'workspace' } }), false);
  // A password is optional, and it keeps the one policy of the product.
  assert.equal(
    validate({ scope: note, password: 'a long enough password' }),
    true,
  );
  assert.equal(validate({ scope: note, password: 'short' }), false);
  assert.equal(
    validate({ scope: note, token: 'aaaaaaaaaaaaaaaaaaaaaa' }),
    false,
  );
});

await test('a reader gives any password and takes the same refusal', () => {
  const validate = requestValidator('unlockPublishedLink', 'body');
  assert.ok(validate !== undefined);
  // A short guess is a wrong password, not a malformed request, so the
  // answer of a guess never differs from the answer of an unknown link.
  assert.equal(validate({ password: 'x' }), true);
  assert.equal(validate({ password: '' }), false);
  assert.equal(validate({}), false);
});

await test('the daily note settings name a note or no template', () => {
  const validate = requestValidator('updateDailyNoteSettings', 'body');
  assert.ok(validate !== undefined);
  const note = '00000000-0000-4000-8000-000000000001';
  const layout = { folder: 'Daily notes', format: 'YYYY-MM-DD' };
  assert.equal(
    validate({ templateFileId: note, openOnStart: true, ...layout }),
    true,
  );
  assert.equal(
    validate({ templateFileId: null, openOnStart: false, ...layout }),
    true,
  );
  // The top of the workspace is an empty folder.
  assert.equal(
    validate({
      templateFileId: null,
      openOnStart: false,
      folder: '',
      format: 'YYYY/MM/DD',
    }),
    true,
  );
  // Every member is stated, so a write never leaves one at a stale value.
  assert.equal(validate({ templateFileId: note, ...layout }), false);
  assert.equal(validate({ openOnStart: true, ...layout }), false);
  assert.equal(
    validate({ templateFileId: null, openOnStart: true, folder: 'Daily' }),
    false,
  );
  assert.equal(
    validate({ templateFileId: 'Daily', openOnStart: true, ...layout }),
    false,
  );
  assert.equal(
    validate({ templateFileId: null, openOnStart: 'yes', ...layout }),
    false,
  );
  // A name needs at least one character.
  assert.equal(
    validate({
      templateFileId: null,
      openOnStart: true,
      folder: '',
      format: '',
    }),
    false,
  );
  // The settings belong to the caller, so a body cannot name an account.
  assert.equal(
    validate({
      templateFileId: null,
      openOnStart: true,
      ...layout,
      accountId: note,
    }),
    false,
  );
});

await test('a settings write names only the settings it changes', () => {
  const validate = requestValidator('updatePreferences', 'body');
  assert.ok(validate !== undefined);
  assert.equal(validate({ appearance: 'dark', themeFamily: 'ink' }), true);
  // The spell check is written alone, so it never carries a stale theme,
  // and a theme write never carries a stale spell check (record 0103).
  assert.equal(validate({ spellCheck: false }), true);
  assert.equal(validate({ appearance: 'light' }), true);
  assert.equal(
    validate({ appearance: 'system', themeFamily: 'ink', spellCheck: true }),
    true,
  );
  // A write that names nothing is not a write.
  assert.equal(validate({}), false);
  assert.equal(validate({ spellCheck: 'no' }), false);
  assert.equal(validate({ spellCheck: true, language: 'en' }), false);
});
