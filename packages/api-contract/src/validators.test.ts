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

await test('the template settings name one folder', () => {
  const validate = requestValidator('updateTemplateSettings', 'body');
  assert.ok(validate !== undefined);
  assert.equal(validate({ folder: 'Templates' }), true);
  assert.equal(validate({ folder: 'Work/Templates' }), true);
  // The top of the workspace is no template folder.
  assert.equal(validate({ folder: '' }), false);
  assert.equal(validate({ folder: 'x'.repeat(1025) }), false);
  assert.equal(validate({}), false);
  assert.equal(validate({ folder: 'Templates', extra: true }), false);
  assert.equal(validate({ folder: 7 }), false);
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

await test('a number in a path arrives as text and is read as a number', () => {
  // The number of a part of an import is a path segment (record 0192).
  const validate = requestValidator('sendWorkspaceImportPart', 'params');
  assert.ok(validate !== undefined);
  const params: Json = {
    workspaceId: '00000000-0000-4000-8000-000000000001',
    importId: '00000000-0000-4000-8000-000000000002',
    partNumber: '3',
  };
  assert.equal(validate(params), true);
  assert.equal(params['partNumber'], 3);
  for (const partNumber of ['0', '10001', 'x', '1.5'])
    assert.equal(validate({ ...params, partNumber }), false, partNumber);
  // A text path segment stays text.
  assert.equal(typeof params['workspaceId'], 'string');
});

await test('a write of the controls names the revision that it read', () => {
  const validate = requestValidator('setOperatorAccountControls', 'body');
  assert.ok(validate !== undefined);
  assert.equal(validate({ revision: 3, standing: 'locked' }), true);
  assert.equal(
    validate({
      revision: 1,
      standing: 'locked',
      removalAt: '2026-11-04T00:00:00Z',
      limitBytes: 10_000_000_000,
      textLimitBytes: 2_000_000_000,
      publishedTransferLimitBytes: null,
      downloadLimitBytes: 20_000_000_000,
      features: { teams: false },
    }),
    true,
  );
  // A write with no revision could replace a newer state (record 0189).
  assert.equal(validate({ standing: 'active' }), false);
  // A revision alone changes nothing, so it is not a write.
  assert.equal(validate({ revision: 1 }), false);
  assert.equal(validate({ revision: 0, standing: 'active' }), false);
  assert.equal(validate({ revision: 1, standing: 'paused' }), false);
  // The storage limit is never absent, so it takes no null.
  assert.equal(validate({ revision: 1, limitBytes: null }), false);
  assert.equal(validate({ revision: 1, textLimitBytes: 0 }), false);
  assert.equal(validate({ revision: 1, features: {} }), false);
  assert.equal(validate({ revision: 1, features: { sharing: true } }), false);
  assert.equal(validate({ revision: 1, accountId: 'x' }), false);
  // An administrator writes the same shape through updateAccount.
  const update = requestValidator('updateAccount', 'body');
  assert.ok(update !== undefined);
  assert.equal(update({ controls: { revision: 2, standing: 'active' } }), true);
  assert.equal(update({ controls: { standing: 'active' } }), false);
});

await test('a portal path cannot leave the portal', () => {
  const validate = requestValidator('openAccountPortal', 'body');
  assert.ok(validate !== undefined);
  assert.equal(validate({ path: '/' }), true);
  assert.equal(validate({ path: '/plans' }), true);
  assert.equal(validate({ path: '/billing/plans/' }), true);
  // A second slash would name another host once it follows the portal.
  assert.equal(validate({ path: '//evil.example' }), false);
  assert.equal(validate({ path: '/a//b' }), false);
  assert.equal(validate({ path: '/../admin' }), false);
  assert.equal(validate({ path: '/plans?x=1' }), false);
  assert.equal(validate({ path: 'plans' }), false);
  assert.equal(validate({ path: '/' + 'a'.repeat(256) }), false);
  assert.equal(validate({}), false);
});

await test('a handoff is redeemed with its token alone', () => {
  const validate = requestValidator('redeemAccountHandoff', 'body');
  assert.ok(validate !== undefined);
  assert.equal(validate({ token: 'a'.repeat(43) }), true);
  assert.equal(validate({ token: 'a'.repeat(42) }), false);
  assert.equal(validate({ token: 'a'.repeat(42) + '=' }), false);
  assert.equal(validate({ token: 'a'.repeat(43), accountId: 'x' }), false);
});

await test('operator account answers include the existing installation role', () => {
  const account = {
    accountId: '00000000-0000-4000-8000-000000000000',
    email: 'member@notes.invalid',
    state: 'enabled',
    createdAt: '2026-10-08T00:00:00.000Z',
    controls: {
      revision: 1,
      standing: 'active',
      removalAt: null,
      limitBytes: 1,
      textLimitBytes: null,
      publishedTransferLimitBytes: null,
      downloadLimitBytes: null,
      features: { teams: true, collaboration: true },
    },
    usage: {
      usedBytes: 0,
      textBytes: 0,
      month: '2026-10',
      publishedTransferBytes: 0,
      downloadBytes: 0,
    },
  };
  for (const id of [
    'findOperatorAccount',
    'readOperatorAccount',
    'setOperatorAccountControls',
  ] as const) {
    const validate = responseValidator(id, 200, 'application/json');
    assert.ok(validate !== undefined, id);
    assert.equal(validate({ ...account, role: 'member' }), true, id);
    assert.equal(validate({ ...account, role: 'administrator' }), true, id);
    assert.equal(validate(account), false, id);
    assert.equal(validate({ ...account, role: 'owner' }), false, id);
    assert.equal(validate({ ...account, role: null }), false, id);
    assert.equal(
      validate({ ...account, role: 'member', workspaceId: account.accountId }),
      false,
      id,
    );
  }
  const write = requestValidator('setOperatorAccountControls', 'body');
  assert.ok(write !== undefined);
  assert.equal(write({ revision: 1, standing: 'active' }), true);
  assert.equal(
    write({ revision: 1, standing: 'active', role: 'administrator' }),
    false,
  );
});

await test('every operator operation takes the operator token alone', () => {
  const operator = operations.filter((operation) =>
    operation.path.startsWith('/api/operator/'),
  );
  assert.deepEqual(operator.map((operation) => operation.id).sort(), [
    'findOperatorAccount',
    'listOperatorAccountEvents',
    'readOperatorAccount',
    'readOperatorTotals',
    'redeemAccountHandoff',
    'removeOperatorAccount',
    'setOperatorAccountControls',
  ]);
  for (const operation of operator) {
    assert.deepEqual(operation.security, [{ operatorToken: [] }], operation.id);
    // The operator API reaches no note, no workspace and no published link
    // (record 0190), so no operator address names one.
    assert.doesNotMatch(operation.path, /workspace|file|publication/);
    assert.ok(responseMediaTypes(operation.id, 404).length > 0, operation.id);
    assert.ok(responseMediaTypes(operation.id, 401).length > 0, operation.id);
  }
  // No other operation takes the operator token.
  for (const operation of operations)
    if (!operation.path.startsWith('/api/operator/'))
      assert.ok(
        operation.security.every(
          (requirement) => !('operatorToken' in requirement),
        ),
        operation.id,
      );
});

await test('OAuth forms and RFC 6749 errors keep their declared boundary', () => {
  const request = requestValidator('exchangeOAuthToken', 'body');
  assert.ok(request);
  assert.equal(
    request({
      grant_type: 'refresh_token',
      refresh_token: 'opaque',
      client_id: 'public',
      resource: 'https://mcp.example/mcp',
    }),
    true,
  );
  assert.equal(
    request({ grant_type: 'refresh_token', unexpected: 'value' }),
    false,
  );
  assert.equal(request({ grant_type: ['refresh_token'] }), false);
  for (const grant of ['authorization_code', 'refresh_token']) {
    assert.equal(
      request({ grant_type: grant, code: 'code', refresh_token: 'refresh' }),
      false,
    );
    assert.equal(
      request({ grant_type: grant, code: '', refresh_token: '' }),
      false,
    );
  }
  assert.equal(
    request({ grant_type: 'authorization_code', refresh_token: 'refresh' }),
    false,
  );
  assert.equal(request({ grant_type: 'refresh_token', code: 'code' }), false);
  assert.equal(
    request({ grant_type: 'authorization_code', code: 'code' }),
    true,
  );
  assert.equal(request({ grant_type: 'unsupported', code: 'code' }), true);
  const response = responseValidator(
    'exchangeOAuthToken',
    400,
    'application/json',
  );
  assert.ok(response);
  assert.equal(response({ error: 'invalid_grant' }), true);
  assert.equal(
    response({
      error: 'invalid_request',
      error_description: 'The request is refused.',
    }),
    true,
  );
  assert.equal(response({ code: 'invalid_grant', status: 400 }), false);
  assert.deepEqual(responseMediaTypes('revokeOAuthToken', 200), []);
  assert.deepEqual(
    operations.find((operation) => operation.id === 'revokeOAuthToken')
      ?.noContent,
    [200],
  );
});

await test('MCP refusals have one JSON media type and closed protocol bodies', () => {
  const rpc = {
    jsonrpc: '2.0',
    id: null,
    error: { code: -32600, message: 'The request is not valid.' },
  };
  for (const id of ['serveMcp', 'openMcp'] as const) {
    const challenge = responseValidator(id, 401, 'application/json');
    const forbidden = responseValidator(id, 403, 'application/json');
    const refusal = responseValidator(id, 400, 'application/json');
    assert.ok(challenge && forbidden && refusal);
    assert.equal(challenge({ error: 'invalid_token' }), true);
    assert.equal(challenge(rpc), false);
    assert.equal(forbidden({ error: 'insufficient_scope' }), true);
    assert.equal(forbidden(rpc), true);
    assert.equal(refusal(rpc), true);
    assert.equal(refusal({ ...rpc, id: 1 }), false);
    assert.equal(refusal({ ...rpc, extra: true }), false);
    assert.equal(
      refusal({ ...rpc, error: { ...rpc.error, extra: true } }),
      false,
    );
    assert.equal(refusal({ error: 'invalid_token' }), false);
    for (const status of [400, 401, 403, 405, 413, 415, 429])
      assert.deepEqual(responseMediaTypes(id, status), ['application/json']);
  }
  assert.deepEqual(responseMediaTypes('serveMcp', 202), []);
});
