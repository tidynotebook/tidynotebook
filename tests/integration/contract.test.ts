/**
 * Contract checks between the generated client and a real listening server.
 *
 * Every application request goes through a generated operation. A request that
 * no operation can express, such as a forged Host header or an unknown path,
 * uses the framework's in-process `app.inject()` utility. That utility is not
 * a handwritten HTTP call: it builds no URL, serializes no body, and sends no
 * traffic. It is the only supported way to reach the boundary rules that sit
 * outside the contract surface.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configureClient,
  getHealth,
  getPublishedAttachment,
  getPublishedPage,
  getReadiness,
  getRootHealth,
  getRootReadiness,
  getSyncProtocol,
  unlockPublishedLink,
} from '@notesapp/api-client';
import { operations } from '@notesapp/api-contract';
import { supportedSyncVersions, syncProtocolVersion } from '@notesapp/core';
import { createHandlers, loadServerConfig } from '@notesapp/server';
import {
  completeTestHandlers,
  LogRecorder,
  startTestServer,
  testEnvironment,
} from './support/server.ts';

/** Reads one property of an unknown value without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

/** The HTTP response of a generated call, or a clear test failure. */
function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

/** Checks that a value carries every required problem member. */
function asProblem(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object', 'expected a problem');
  for (const key of ['type', 'title', 'code', 'requestId'])
    assert.equal(typeof readProperty(value, key), 'string', key);
  assert.equal(typeof readProperty(value, 'status'), 'number');
  return Object.fromEntries(Object.entries(value));
}

const server = await startTestServer();
configureClient(server.baseUrl, undefined);

await test('health answers through the generated operation', async () => {
  const result = await getHealth();
  assert.equal(result.error, undefined);
  assert.deepEqual(result.data, { status: 'ok' });
  const response = responseOf(result.response);
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('content-type') ?? '',
    /^application\/json/,
  );
  assert.match(response.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
});

await test('readiness reports the configuration check', async () => {
  const result = await getReadiness();
  assert.equal(result.error, undefined);
  assert.equal(result.data?.status, 'ok');
  const checks = result.data?.checks ?? [];
  assert.equal(checks.length, 1);
  assert.equal(checks[0]?.name, 'configuration');
  assert.equal(checks[0]?.status, 'ok');
  assert.ok((checks[0]?.detail ?? '').length > 0);
});

await test('a summary report omits the detail of every check', async () => {
  const result = await getReadiness({ query: { detail: 'summary' } });
  assert.equal(result.error, undefined);
  assert.equal(result.data?.checks[0]?.detail, undefined);
});

await test('the root address and the API address give one answer', async () => {
  // Issue 24. A load balancer and an orchestrator probe a fixed root path, so
  // the contract declares that address as well. One implementation answers
  // both ids, and this check proves that the two answers stay equal.
  const [health, rootHealth] = await Promise.all([
    getHealth(),
    getRootHealth(),
  ]);
  assert.equal(responseOf(health.response).status, 200);
  assert.equal(responseOf(rootHealth.response).status, 200);
  assert.deepEqual(rootHealth.data, health.data);
  assert.equal(
    responseOf(rootHealth.response).headers.get('content-type'),
    responseOf(health.response).headers.get('content-type'),
  );

  const [ready, rootReady] = await Promise.all([
    getReadiness(),
    getRootReadiness(),
  ]);
  assert.equal(responseOf(ready.response).status, 200);
  assert.equal(responseOf(rootReady.response).status, 200);
  assert.deepEqual(rootReady.data, ready.data);
});

await test('the root readiness address takes the same detail parameter', async () => {
  const result = await getRootReadiness({ query: { detail: 'summary' } });
  assert.equal(result.error, undefined);
  assert.equal(result.data?.checks[0]?.detail, undefined);
});

await test('the root address rejects a query that the operation does not declare', async () => {
  const response = await server.app.inject({
    method: 'GET',
    url: '/health?bogus=1',
    headers: { host: '127.0.0.1' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(asProblem(response.json()).code, 'invalid_request');
});

await test('a forged Host header is rejected at the root address too', async () => {
  const response = await server.app.inject({
    method: 'GET',
    url: '/ready',
    headers: { host: 'evil.example' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(asProblem(response.json()).code, 'host_not_allowed');
});

await test('the server echoes a caller supplied request id', async () => {
  const result = await getHealth({
    headers: { 'x-request-id': 'trace-abc.123' },
  });
  assert.equal(result.error, undefined);
  assert.equal(
    responseOf(result.response).headers.get('x-request-id'),
    'trace-abc.123',
  );
});

await test('an invalid header value is rejected with problem details', async () => {
  const result = await getReadiness({
    headers: { 'x-request-id': 'not a valid id' },
  });
  assert.equal(result.data, undefined);
  const response = responseOf(result.response);
  assert.equal(response.status, 400);
  assert.match(
    response.headers.get('content-type') ?? '',
    /^application\/problem\+json/,
  );
  const problem = asProblem(result.error);
  assert.equal(problem.code, 'invalid_request');
  assert.equal(problem.status, 400);
  const issues: unknown = problem.issues;
  assert.ok(Array.isArray(issues) && issues.length > 0);
  assert.equal(typeof readProperty(issues[0], 'path'), 'string');
  assert.equal(typeof readProperty(issues[0], 'message'), 'string');
  // A malformed correlation id is never echoed back.
  assert.match(response.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
});

await test('an unknown query parameter is rejected', async () => {
  const query: { detail?: 'summary' | 'full' } = {};
  Object.assign(query, { unexpected: 'value' });
  const result = await getReadiness({ query });
  assert.equal(responseOf(result.response).status, 400);
  assert.equal(asProblem(result.error).code, 'invalid_request');
});

await test('an operation without query parameters rejects one', async () => {
  const response = await server.app.inject({
    method: 'GET',
    url: '/api/health?bogus=1',
    headers: { host: '127.0.0.1' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(asProblem(response.json()).code, 'invalid_request');
});

await test('an operation without a request body rejects one', async () => {
  const response = await server.app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { host: '127.0.0.1', 'content-type': 'application/json' },
    payload: '{"unexpected":true}',
  });
  assert.equal(response.statusCode, 400);
  assert.equal(asProblem(response.json()).code, 'invalid_request');
});

await test('a body over the configured limit is rejected', async () => {
  // The configured limit is 1024 bytes. No operation accepts a request body
  // yet, so the boundary rejects the body before the limit can apply. The
  // status that a body over the limit produces is unit tested in
  // `apps/server/src/plugins/problem.test.ts`, and an operation that accepts a
  // body must declare 413 and 415 or generation fails.
  const response = await server.app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { host: '127.0.0.1', 'content-type': 'application/json' },
    payload: JSON.stringify({ filler: 'x'.repeat(4096) }),
  });
  assert.equal(response.statusCode, 400);
  assert.equal(asProblem(response.json()).code, 'invalid_request');
});

await test('a method that no operation serves answers 404', async () => {
  const response = await server.app.inject({
    method: 'POST',
    url: '/api/health',
    headers: { host: '127.0.0.1', 'content-type': 'application/json' },
    payload: '{}',
  });
  assert.equal(response.statusCode, 404);
  assert.equal(asProblem(response.json()).code, 'route_not_found');
});

await test('a forged Host header is rejected', async () => {
  const response = await server.app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { host: 'evil.example' },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(asProblem(response.json()).code, 'host_not_allowed');
});

await test('a request that names no served Host is rejected', async () => {
  // The in-process utility always supplies a Host, so an unserved default
  // value is the closest reachable form of an absent Host. The unit tests
  // cover an absent and an empty header value directly.
  const narrow = await startTestServer({
    environment: { NOTESAPP_ADDITIONAL_ORIGINS: '' },
  });
  try {
    const response = await narrow.app.inject({
      method: 'GET',
      url: '/api/health',
    });
    assert.equal(response.statusCode, 400);
    assert.equal(asProblem(response.json()).code, 'host_not_allowed');
  } finally {
    await narrow.close();
  }
});

await test('a bracketed IPv6 Host with a port is served', async () => {
  const sixth = await startTestServer({
    environment: { NOTESAPP_ADDITIONAL_ORIGINS: 'http://[::1]' },
  });
  try {
    const response = await sixth.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: '[::1]:8080' },
    });
    assert.equal(response.statusCode, 200);
  } finally {
    await sixth.close();
  }
});

await test('an unknown path answers with problem details', async () => {
  const response = await server.app.inject({
    method: 'GET',
    url: '/api/missing',
    headers: { host: '127.0.0.1' },
  });
  assert.equal(response.statusCode, 404);
  assert.equal(asProblem(response.json()).code, 'route_not_found');
});

await test('the sync protocol answers without a session', async () => {
  // Record 0086. A client reads this list before it pushes or pulls, so the
  // answer must come from the list that `startSnapshot` enforces, and it must
  // need no session: a client checks it before it knows its session state.
  const result = await getSyncProtocol();
  assert.equal(result.error, undefined);
  assert.equal(responseOf(result.response).status, 200);
  assert.deepEqual(result.data, { versions: [...supportedSyncVersions] });
  assert.ok(result.data?.versions.includes(syncProtocolVersion));
});

await test('a server without the protocol operation answers route not found', async () => {
  // A deployment from before record 0086 has no such route. The client reads
  // exactly this answer as a legacy server that serves version 1 only, so the
  // status and the code of an unknown API path are part of that rule.
  const response = await server.app.inject({
    method: 'GET',
    url: '/api/sync/protocol-from-a-later-release',
    headers: { host: '127.0.0.1' },
  });
  assert.equal(response.statusCode, 404);
  assert.equal(asProblem(response.json()).code, 'route_not_found');
});

await test('HEAD on a GET route answers without a body', async () => {
  const response = await server.app.inject({
    method: 'HEAD',
    url: '/api/health',
    headers: { host: '127.0.0.1' },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type']?.toString() ?? '', /json/);
  assert.equal(response.body, '');
});

await test('a cancelled request produces no data', async () => {
  const controller = new AbortController();
  const pending = getHealth({ signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.data, undefined);
  assert.equal(asProblem(result.error).code, 'request_aborted');
  assert.ok(controller.signal.aborted);
});

await test('every operation has exactly one handler and back', () => {
  const config = loadServerConfig(testEnvironment('/tmp'));
  const handlerIds = Object.keys(
    completeTestHandlers(createHandlers(config)),
  ).sort();
  // An operation that a protocol library serves has no contract handler. It
  // carries a protocol marker instead, and `registerOperations` mounts it
  // through that adapter's exact path list.
  const operationIds = operations
    .filter((operation) => operation.protocol === null)
    .map((operation) => operation.id)
    .sort();
  assert.deepEqual(handlerIds, operationIds);
  assert.equal(new Set(handlerIds).size, handlerIds.length);
  assert.ok(operationIds.length > 0);
  assert.ok(
    operations.some((operation) => operation.protocol === 'better-auth'),
    'the contract must declare the authentication protocol fragment',
  );
});

/**
 * The reader path of a published link, and the one refusal it gives.
 *
 * Plan 007 item 39. Decision 0031 makes the empty security requirement the
 * first of four refusals that keep a write out of the reader path, so a later
 * change that guards a reader operation, or that opens an owner operation,
 * must fail here.
 */
const readerPrefix = '/published/';
const openOperations = [
  'createOwner',
  'getHealth',
  'getReadiness',
  'getRootHealth',
  'getRootReadiness',
  'getSetupStatus',
];

await test('every reader operation declares an empty security requirement', () => {
  const readers = operations.filter((operation) =>
    operation.path.startsWith(readerPrefix),
  );
  assert.deepEqual(readers.map((operation) => operation.id).sort(), [
    'getPublishedAttachment',
    'getPublishedPage',
    'openPublishedPage',
    'unlockPublishedLink',
  ]);
  for (const reader of readers)
    assert.deepEqual(reader.security, [], reader.id);
});

await test('every operation outside the open list names a security scheme', () => {
  const open = operations
    .filter(
      (operation) =>
        operation.protocol === null && operation.security.length === 0,
    )
    .map((operation) => operation.id)
    .sort();
  const readers = operations
    .filter((operation) => operation.path.startsWith(readerPrefix))
    .map((operation) => operation.id);
  assert.deepEqual(open, [...openOperations, ...readers].sort());
});

await test('the owner operations of a published link keep the session', () => {
  for (const id of [
    'createPublishedLink',
    'listPublishedLinks',
    'revokePublishedLink',
  ]) {
    const operation = operations.find((entry) => entry.id === id);
    assert.ok(operation !== undefined, id);
    assert.deepEqual(operation.security, [{ sessionCookie: [] }], id);
  }
});

await test('an unguarded owner call is refused before any handler runs', async () => {
  const response = await server.app.inject({
    method: 'GET',
    url: '/api/workspaces/00000000-0000-4000-8000-000000000000/publications',
    headers: { host: '127.0.0.1' },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(asProblem(response.json()).code, 'unauthenticated');
});

await test('the page of a published link always answers a page', async () => {
  // Record 0047. The address that a person opens answers one document for
  // every state of a link, so no error code and no request identifier reaches
  // a screen. No publication store exists in this build, so every token is
  // unknown, and the document says that the link is not available.
  const token = 'aaaaaaaaaaaaaaaaaaaaaa';
  const answer = await getPublishedPage({ path: { token } });
  const response = responseOf(answer.response);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const html = String(answer.data);
  assert.ok(html.includes('This link is not available.'));
  assert.ok(!html.includes('published_link_unavailable'));
  assert.ok(!html.includes('<script'));
});

await test('a mistyped address reads like an unknown one', async () => {
  // Record 0047. The token of a reader address takes any single segment, so
  // the boundary refuses none of them and every one reads alike. The longest
  // one is longer than the bound that the router once held, which answered a
  // padded address with an engine notice instead of the page.
  for (const token of [
    'short',
    'a'.repeat(120),
    'not a token',
    'b'.repeat(600),
  ]) {
    const answer = await getPublishedPage({ path: { token } });
    assert.equal(responseOf(answer.response).status, 200, token);
    assert.ok(String(answer.data).includes('This link is not available.'));
  }
});

await test('every reader subresource answers one refusal', async () => {
  // Decision 0030. A link that never existed, a revoked link, an expired link
  // and a wrong password all take this answer. No publication store exists in
  // this build, so every token is unknown, which is the first of the four.
  const token = 'aaaaaaaaaaaaaaaaaaaaaa';
  const note = '00000000-0000-4000-8000-000000000000';
  const [unlock, attachment] = await Promise.all([
    unlockPublishedLink({ path: { token }, body: { password: 'x' } }),
    getPublishedAttachment({
      path: { token, fileId: note, revisionId: note },
    }),
  ]);
  const answers = [unlock, attachment];
  for (const answer of answers) {
    assert.equal(answer.data, undefined);
    assert.equal(responseOf(answer.response).status, 404);
    assert.match(
      responseOf(answer.response).headers.get('content-type') ?? '',
      /^application\/problem\+json/,
    );
  }
  const bodies = answers.map((answer) => asProblem(answer.error));
  for (const body of bodies) {
    assert.equal(body.code, 'published_link_unavailable');
    assert.equal(body.status, 404);
    assert.equal(body.title, 'This link is not available.');
    assert.equal(body.detail, 'This link is not available.');
    // The body names no note, no folder, no account and no ticket.
    assert.deepEqual(Object.keys(body).sort(), [
      'code',
      'detail',
      'instance',
      'requestId',
      'status',
      'title',
      'type',
    ]);
  }
  // Only the request identifier and the address of the call differ.
  const shapes = bodies.map((body) => {
    const { instance, requestId, ...rest } = body;
    assert.equal(typeof instance, 'string');
    assert.equal(typeof requestId, 'string');
    return rest;
  });
  assert.deepEqual(shapes[0], shapes[1]);
});

await test('a wrong password reads like an unknown token', async () => {
  const token = 'aaaaaaaaaaaaaaaaaaaaaa';
  const [short, long] = await Promise.all([
    unlockPublishedLink({ path: { token }, body: { password: 'x' } }),
    unlockPublishedLink({
      path: { token },
      body: { password: 'a longer guess that is wrong' },
    }),
  ]);
  const first = asProblem(short.error);
  const second = asProblem(long.error);
  assert.equal(first.code, second.code);
  assert.equal(first.status, second.status);
  assert.equal(first.detail, second.detail);
});

await server.close();

// A degraded readiness probe proves the declared 503 answer.
const degraded = await startTestServer({
  handlers: (config) =>
    createHandlers(config, [
      () =>
        Promise.resolve({
          name: 'database',
          status: 'degraded',
          detail: 'The database connection is not open.',
        }),
    ]),
});
configureClient(degraded.baseUrl, undefined);

await test('a degraded check answers 503 with problem details', async () => {
  const result = await getReadiness();
  assert.equal(result.data, undefined);
  const response = responseOf(result.response);
  assert.equal(response.status, 503);
  assert.match(
    response.headers.get('content-type') ?? '',
    /^application\/problem\+json/,
  );
  const problem = asProblem(result.error);
  assert.equal(problem.code, 'not_ready');
  assert.equal(problem.status, 503);
});

await degraded.close();

// The injected handler answers with a member that the contract forbids.
const recorder = new LogRecorder();
const leaky = await startTestServer({
  environment: { NOTESAPP_LOG_LEVEL: 'error' },
  logStream: recorder,
  handlers: (config) => ({
    ...createHandlers(config),
    getHealth: () =>
      Promise.resolve({
        status: 200,
        mediaType: 'application/json',
        body: { status: 'ok', leaked: 'internal detail' },
      }),
  }),
});
configureClient(leaky.baseUrl, undefined);

await test('an unexpected response member is rejected by the server', async () => {
  const result = await getHealth();
  assert.equal(result.data, undefined);
  assert.equal(responseOf(result.response).status, 500);
  const problem = asProblem(result.error);
  assert.equal(problem.code, 'invalid_response');
  assert.equal(problem.status, 500);
  // The rejected body must not reach the caller.
  assert.equal(JSON.stringify(problem).includes('leaked'), false);
  assert.match(String(problem.requestId), /^[0-9a-f-]{36}$/);
});

await test('the rejected response is logged at error level with its id', () => {
  const records = recorder.records().filter((record) => record.level === 50);
  assert.equal(records.length >= 1, true, recorder.lines.join('\n'));
  const record = records[0] ?? {};
  assert.equal(record.operationId, 'getHealth');
  assert.match(String(record.requestId), /^[0-9a-f-]{36}$/);
  // A log record never repeats the rejected content.
  assert.equal(recorder.lines.join('\n').includes('leaked'), false);
});

await leaky.close();

// A bearer token provider must reach the server without appearing in the log.
const audited = new LogRecorder();
const logged = await startTestServer({
  environment: { NOTESAPP_LOG_LEVEL: 'info' },
  logStream: audited,
});
configureClient(logged.baseUrl, () => Promise.resolve('bearer-token-value'));

await test('the token provider reaches the server and stays out of the log', async () => {
  const result = await getHealth();
  assert.equal(result.error, undefined);
  assert.ok(audited.lines.length > 0);
  assert.equal(audited.lines.join('\n').includes('bearer-token-value'), false);
});

await logged.close();

// A password reset token is part of a browser navigation path. Both the
// Fastify request serializer and the content-free request record see it.
const resetAudit = new LogRecorder();
const resetLogged = await startTestServer({
  environment: { NOTESAPP_LOG_LEVEL: 'info' },
  logStream: resetAudit,
});

await test('every log record redacts the password reset token', async () => {
  const token = 'live-password-reset-token';
  const redacted = '/api/auth/reset-password/[redacted]?[redacted]';
  const response = await resetLogged.app.inject({
    method: 'GET',
    url: `/api/auth/reset-password/${token}?callbackURL=/notes`,
    headers: { host: '127.0.0.1' },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(resetAudit.lines.join('\n').includes(token), false);

  const urls = resetAudit.records().flatMap((record) => {
    const request = readProperty(record, 'req');
    return [readProperty(record, 'url'), readProperty(request, 'url')].filter(
      (value): value is string => typeof value === 'string',
    );
  });
  assert.equal(urls.length >= 1, true, resetAudit.lines.join('\n'));
  assert.equal(
    urls.every((url) => url === redacted),
    true,
  );
});

await resetLogged.close();

/**
 * Every answer that a handler can produce outside the contract.
 *
 * A pre-serialized string, a byte buffer, and an undeclared media type all
 * bypass a schema check unless the boundary inspects the answer before the
 * framework writes it, so each one gets its own case.
 */
const leakingAnswers: readonly {
  readonly name: string;
  readonly mediaType: string;
  readonly body: unknown;
}[] = [
  {
    name: 'an undeclared response media type',
    mediaType: 'application/vnd.notes+json',
    body: { status: 'ok', leaked: 'internal detail' },
  },
  {
    name: 'a pre-serialized JSON string',
    mediaType: 'application/json',
    body: JSON.stringify({ status: 'ok', leaked: 'internal detail' }),
  },
  {
    name: 'an HTML string',
    mediaType: 'text/html',
    body: '<p>leaked internal detail</p>',
  },
  {
    name: 'a byte buffer',
    mediaType: 'application/octet-stream',
    body: Buffer.from('leaked internal detail'),
  },
];

for (const answer of leakingAnswers) {
  const audit = new LogRecorder();
  const rejecting = await startTestServer({
    environment: { NOTESAPP_LOG_LEVEL: 'error' },
    logStream: audit,
    handlers: (config) => ({
      ...createHandlers(config),
      getHealth: () =>
        Promise.resolve({
          status: 200,
          mediaType: answer.mediaType,
          body: answer.body,
        }),
    }),
  });
  configureClient(rejecting.baseUrl, undefined);

  await test(`${answer.name} is rejected and logged`, async () => {
    const result = await getHealth();
    assert.equal(result.data, undefined);
    const response = responseOf(result.response);
    assert.equal(response.status, 500);
    assert.match(
      response.headers.get('content-type') ?? '',
      /^application\/problem\+json/,
    );
    const problem = asProblem(result.error);
    assert.equal(problem.code, 'invalid_response');
    assert.equal(JSON.stringify(problem).includes('leaked'), false);
    const errors = audit.records().filter((record) => record.level === 50);
    assert.equal(errors.length >= 1, true, audit.lines.join('\n'));
    assert.equal(errors[0]?.operationId, 'getHealth');
    assert.match(String(errors[0]?.requestId), /^[0-9a-f-]{36}$/);
    // The rejected answer never reaches a log record either.
    assert.equal(audit.lines.join('\n').includes('leaked'), false);
  });

  await rejecting.close();
}

/**
 * The response check covers the root addresses.
 *
 * Issue 24. The root addresses used to be hand registered routes with no
 * operation id, so `preSerialization` returned early and never compared their
 * answer with the contract. Each one is a contract operation now, so an answer
 * that leaves the contract is refused and logged under that operation id.
 */
const rootAddresses: readonly {
  readonly operationId: 'getRootHealth' | 'getRootReadiness';
  readonly call: () => Promise<{
    readonly data?: unknown;
    readonly error?: unknown;
    readonly response?: Response;
  }>;
}[] = [
  { operationId: 'getRootHealth', call: () => getRootHealth() },
  { operationId: 'getRootReadiness', call: () => getRootReadiness() },
];

for (const address of rootAddresses) {
  const audit = new LogRecorder();
  const guarded = await startTestServer({
    environment: { NOTESAPP_LOG_LEVEL: 'error' },
    logStream: audit,
    handlers: (config) => ({
      ...createHandlers(config),
      [address.operationId]: () =>
        Promise.resolve({
          status: 200,
          mediaType: 'application/json',
          body: { status: 'ok', leaked: 'internal detail' },
        }),
    }),
  });
  configureClient(guarded.baseUrl, undefined);

  await test(`the response check refuses an undeclared member of ${address.operationId}`, async () => {
    const result = await address.call();
    assert.equal(result.data, undefined);
    assert.equal(responseOf(result.response).status, 500);
    const problem = asProblem(result.error);
    assert.equal(problem.code, 'invalid_response');
    assert.equal(JSON.stringify(problem).includes('leaked'), false);
    const errors = audit.records().filter((record) => record.level === 50);
    assert.equal(errors.length >= 1, true, audit.lines.join('\n'));
    assert.equal(errors[0]?.operationId, address.operationId);
    assert.equal(audit.lines.join('\n').includes('leaked'), false);
  });

  await guarded.close();
}
