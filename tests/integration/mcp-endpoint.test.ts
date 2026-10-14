/** The served MCP boundary and the capability of one tool call (0225, 0227). */
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configureClient,
  signInWithPassword,
  registerOAuthClient,
  giveOAuthConsent,
  exchangeOAuthToken,
  getMcpMetadata,
  getRootMcpMetadata,
  createApiKey,
  serveMcp,
} from '@notesapp/api-client';
import {
  bootstrapOwner,
  createApp,
  loadServerConfig,
  withToolDelegation,
  type McpTool,
} from '@notesapp/server';
import { openIdentityStore } from '@notesapp/storage-server';
import { createDisposableDatabase, openSession } from './support/database.ts';
import { testEnvironment } from './support/server.ts';

const database = await createDisposableDatabase();
const root = await mkdtemp(join(tmpdir(), 'notesapp-mcp-'));
const logs: string[] = [];
const notices: unknown[][] = [];
const config = loadServerConfig({
  ...testEnvironment(root),
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_MCP_ORIGIN: 'http://mcp.notes.invalid',
  NOTESAPP_PUBLISHED_ORIGIN: 'http://pages.notes.invalid',
  NOTESAPP_BREACH_CHECK: 'off',
  NOTESAPP_MAX_BODY_BYTES: '8192',
  NOTESAPP_RATE_LIMIT_MAX: '2000',
  NOTESAPP_LOG_LEVEL: 'warn',
});
await bootstrapOwner({
  config,
  email: 'mcp@notes.invalid',
  name: 'MCP owner',
  password: 'mcp-owner-safe-password',
});
const tools: readonly McpTool[] = [
  {
    definition: {
      name: 'test_write',
      description: 'Test only.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    scope: 'notes:write',
    operations: ['listWorkspaces'],
    run: async (_input, context) => {
      const answer = await context.call('listWorkspaces');
      assert.equal(answer.status, 200);
      return {
        content: [{ type: 'text', text: 'The test call is complete.' }],
      };
    },
  },
];
const app = await createApp(config, {
  logStream: { write: (line) => logs.push(line) },
});
const fixture = await createApp(config, {
  mcpTools: tools,
  logStream: { write: (line) => logs.push(line) },
});
const identity = openIdentityStore(database.runtimeUrl);
const admin = await openSession(database.migrationUrl);
await app.listen({ host: '127.0.0.1', port: 0 });
const address = app.server.address();
assert.ok(address && typeof address !== 'string');
configureClient(`http://127.0.0.1:${address.port}`, undefined);
const signedIn = await signInWithPassword({
  headers: { origin: config.origin },
  body: { email: 'mcp@notes.invalid', password: 'mcp-owner-safe-password' },
});
assert.equal(signedIn.response?.status, 200);
const cookie = signedIn.response.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
const resource = `${config.mcpOrigin}/mcp`;
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const protectedValues = [cookie, config.authSecret, 'mcp-owner-safe-password'];

async function token(scopes = 'notes:read') {
  const client = await registerOAuthClient({
    body: {
      redirect_uris: ['https://client.example/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
    },
  });
  assert.equal(client.response?.status, 201, JSON.stringify(client.error));
  assert.ok(client.data);
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: client.data.client_id,
    redirect_uri: 'https://client.example/callback',
    resource,
    scope: scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'mcp-test-state',
  });
  const authorized = await app.inject({
    url: `/api/auth/oauth2/authorize?${query}`,
    headers: { cookie },
  });
  assert.equal(authorized.statusCode, 302, authorized.body);
  const consent = await giveOAuthConsent({
    headers: { cookie, origin: config.origin },
    body: {
      accept: true,
      oauth_query: new URL(
        String(authorized.headers.location),
        config.origin,
      ).search.slice(1),
      scope: scopes,
    },
  });
  assert.equal(consent.response?.status, 200, JSON.stringify(consent.error));
  const code = new URL(consent.data?.url ?? '').searchParams.get('code');
  assert.ok(code);
  const granted = await exchangeOAuthToken({
    body: {
      grant_type: 'authorization_code',
      client_id: client.data.client_id,
      code,
      code_verifier: verifier,
      redirect_uri: 'https://client.example/callback',
      resource,
    },
  });
  assert.equal(granted.response?.status, 200, JSON.stringify(granted.error));
  assert.ok(granted.data);
  protectedValues.push(granted.data.access_token);
  return granted.data.access_token;
}
const read = await token();
const write = await token('notes:read notes:write');
const headers = (credential = read) => ({
  host: 'mcp.notes.invalid',
  authorization: `Bearer ${credential}`,
  accept: 'application/json, text/event-stream',
});
const legacy = (method = 'tools/list', params?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});
const modern = (method = 'tools/list', params: Record<string, unknown> = {}) =>
  legacy(method, {
    ...params,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  });
const modernHeaders = (method: string, credential = read, name?: string) => ({
  ...headers(credential),
  'mcp-protocol-version': '2026-07-28',
  'mcp-method': method,
  ...(name === undefined ? {} : { 'mcp-name': name }),
});
function json(answer: {
  headers: Record<string, unknown>;
  body: string;
  json: () => unknown;
}) {
  assert.match(String(answer.headers['content-type']), /^application\/json/);
  assert.doesNotMatch(String(answer.headers['content-type']), /event-stream/);
  assert.notEqual(answer.body, '');
  return answer.json();
}
function errorBody(
  answer: {
    headers: Record<string, unknown>;
    body: string;
    json: () => unknown;
  },
  code?: number,
) {
  const body = json(answer);
  assert.ok(body !== null && typeof body === 'object');
  assert.deepEqual(Object.keys(body).sort(), ['error', 'id', 'jsonrpc']);
  assert.equal(Reflect.get(body, 'id'), null);
  assert.equal(Reflect.get(body, 'jsonrpc'), '2.0');
  const failure: unknown = Reflect.get(body, 'error');
  assert.ok(failure !== null && typeof failure === 'object');
  assert.equal(typeof Reflect.get(failure, 'code'), 'number');
  assert.equal(typeof Reflect.get(failure, 'message'), 'string');
  if (code !== undefined) assert.equal(Reflect.get(failure, 'code'), code);
}
const consoleMocks = (['warn', 'error', 'log', 'info', 'debug'] as const).map(
  (name) =>
    mock.method(console, name, (...values: unknown[]) => {
      notices.push(values);
    }),
);
try {
  await test('generated MCP calls preserve the served protocol refusals', async () => {
    const unauthorized = await serveMcp({ body: legacy() });
    assert.equal(unauthorized.response?.status, 401);
    assert.deepEqual(unauthorized.error, { error: 'invalid_token' });
    const refused = await serveMcp({
      headers: { ...headers(), origin: 'https://foreign.example' },
      body: legacy(),
    });
    assert.equal(refused.response?.status, 403);
    assert.deepEqual(refused.error, {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'The request is not valid. Check the request and try again.',
      },
    });
  });
  await test('the metadata addresses give one canonical resource through generated operations', async () => {
    const results = await Promise.all([getMcpMetadata(), getRootMcpMetadata()]);
    for (const result of results) {
      assert.equal(result.response?.status, 200, JSON.stringify(result.error));
      assert.deepEqual(result.data, {
        resource,
        authorization_servers: [`${config.origin}/api/auth`],
        scopes_supported: ['notes:read', 'notes:write'],
        bearer_methods_supported: ['header'],
      });
    }
  });
  await test('a missing token, cookie, key and another resource receive the read challenge', async () => {
    const key = await createApiKey({
      headers: { cookie, origin: config.origin },
      body: { name: 'MCP refusal', expiresInDays: 1 },
    });
    assert.equal(key.response?.status, 201, JSON.stringify(key.error));
    assert.ok(key.data);
    protectedValues.push(key.data.token);
    const foreign = await createApp({
      ...config,
      mcpOrigin: 'http://other.notes.invalid',
    });
    try {
      for (const [target, credential] of [
        [app, {}],
        [app, { cookie }],
        [app, { authorization: `Bearer ${key.data.token}` }],
        [app, { authorization: 'Bearer invalid' }],
        [foreign, { authorization: `Bearer ${read}` }],
      ] as const) {
        const answer = await target.inject({
          method: 'POST',
          url: '/mcp',
          headers: { host: '127.0.0.1', ...credential },
          payload: legacy(),
        });
        assert.equal(answer.statusCode, 401, answer.body);
        assert.deepEqual(json(answer), { error: 'invalid_token' });
        assert.match(
          String(answer.headers['www-authenticate']),
          /scope="notes:read"/,
        );
        assert.match(
          String(answer.headers['www-authenticate']),
          /resource_metadata="http:\/\/(mcp|other)\.notes\.invalid\/\.well-known\/oauth-protected-resource\/mcp"/,
        );
      }
    } finally {
      await foreign.close();
    }
  });
  await test('the modern and earlier stateless protocols show the empty production registry', async () => {
    for (const [payload, requestHeaders] of [
      [legacy(), headers()],
      [modern(), modernHeaders('tools/list')],
    ] as const) {
      const answer = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: requestHeaders,
        payload,
      });
      assert.equal(answer.statusCode, 200, answer.body);
      const body = json(answer);
      assert.ok(body && typeof body === 'object');
      const result: unknown = Reflect.get(body, 'result');
      assert.ok(result && typeof result === 'object');
      assert.deepEqual(Reflect.get(result, 'tools'), []);
      if ('mcp-protocol-version' in requestHeaders) {
        assert.equal(Reflect.get(result, 'resultType'), 'complete');
        assert.equal(Reflect.get(result, 'cacheScope'), 'private');
        assert.equal(Reflect.get(result, 'ttlMs'), 0);
      } else assert.deepEqual(result, { tools: [] });
      assert.equal(answer.headers['mcp-session-id'], undefined);
    }
    const discovery = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: modernHeaders('server/discover'),
      payload: modern('server/discover'),
    });
    assert.equal(discovery.statusCode, 200, discovery.body);
    const body = json(discovery);
    assert.ok(body && typeof body === 'object');
    assert.ok(Reflect.get(body, 'result'));
  });
  await test('a read grant sees every test tool but a write call gets the scope challenge', async () => {
    const listed = await fixture.inject({
      method: 'POST',
      url: '/mcp',
      headers: headers(),
      payload: legacy(),
    });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal(listed.json().result.tools[0].name, 'test_write');
    for (const [payload, requestHeaders] of [
      [legacy('tools/call', { name: 'test_write', arguments: {} }), headers()],
      [
        modern('tools/call', { name: 'test_write', arguments: {} }),
        modernHeaders('tools/call', read, 'test_write'),
      ],
    ] as const) {
      const answer = await fixture.inject({
        method: 'POST',
        url: '/mcp',
        headers: requestHeaders,
        payload,
      });
      assert.equal(answer.statusCode, 403, answer.body);
      assert.deepEqual(json(answer), { error: 'insufficient_scope' });
      assert.equal(
        answer.headers['www-authenticate'],
        `Bearer resource_metadata="${config.mcpOrigin}/.well-known/oauth-protected-resource/mcp", scope="notes:read notes:write", error="insufficient_scope"`,
      );
    }
    for (const [payload, requestHeaders] of [
      [
        legacy('tools/call', { name: 'test_write', arguments: {} }),
        headers(write),
      ],
      [
        modern('tools/call', { name: 'test_write', arguments: {} }),
        modernHeaders('tools/call', write, 'test_write'),
      ],
    ] as const) {
      const answer = await fixture.inject({
        method: 'POST',
        url: '/mcp',
        headers: requestHeaders,
        payload,
      });
      assert.equal(answer.statusCode, 200, answer.body);
      json(answer);
      assert.equal(answer.json().result.isError, undefined);
    }
  });
  await test('a notification receives 202 with no body or content type', async () => {
    const answer = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: headers(),
      payload: { jsonrpc: '2.0', method: 'notifications/initialized' },
    });
    assert.equal(answer.statusCode, 202, answer.body);
    assert.equal(answer.body, '');
    assert.equal(answer.headers['content-type'], undefined);
  });
  await test('Origin accepts only the MCP and application origins', async () => {
    for (const origin of [
      'http://evil.example',
      'null',
      'http://pages.notes.invalid',
    ]) {
      const answer = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...headers(), origin },
        payload: legacy(),
      });
      assert.equal(answer.statusCode, 403, answer.body);
      errorBody(answer, -32600);
    }
    for (const origin of [
      config.origin,
      'http://localhost',
      config.mcpOrigin ?? '',
    ]) {
      const answer = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { ...headers(), origin },
        payload: legacy(),
      });
      assert.equal(answer.statusCode, 200, answer.body);
    }
  });
  await test('host, media, body size, malformed JSON and protocol version refusals stay JSON', async () => {
    const cases = [
      {
        headers: { ...headers(), host: 'evil.example' },
        payload: JSON.stringify(legacy()),
        status: 400,
      },
      {
        headers: { ...headers(), 'content-type': 'text/plain' },
        payload: 'text',
        status: 415,
      },
      {
        headers: { ...headers(), 'content-type': 'application/json' },
        payload: 'x'.repeat(8193),
        status: 413,
      },
      {
        headers: { ...headers(), 'content-type': 'application/json' },
        payload: '{broken',
        status: 400,
      },
      {
        headers: {
          ...modernHeaders('tools/list'),
          'mcp-protocol-version': 'unknown',
        },
        payload: JSON.stringify(modern()),
        status: 400,
      },
    ];
    for (const entry of cases) {
      const answer = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'application/json', ...entry.headers },
        payload: entry.payload,
      });
      assert.equal(answer.statusCode, entry.status, answer.body);
      errorBody(answer);
    }
    const stream = await app.inject({
      method: 'GET',
      url: '/mcp',
      headers: headers(),
    });
    assert.equal(stream.statusCode, 405, stream.body);
    errorBody(stream);
    const subscription = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: modernHeaders('subscriptions/listen'),
      payload: modern('subscriptions/listen', { subscriptions: [] }),
    });
    assert.ok(
      subscription.statusCode >= 400 || subscription.json().error,
      subscription.body,
    );
    json(subscription);
  });
  await test('a delegation is limited to its named operations and the life of its call', async () => {
    const grant = await identity.oauthTokenIdentity(
      createHash('sha256').update(read).digest('hex'),
      resource,
    );
    assert.ok(grant);
    let late: (() => Promise<number>) | undefined;
    await withToolDelegation(
      grant,
      ['listWorkspaces', 'revokeOtherSessions'],
      async () => {
        const accepted = await app.inject({ url: '/api/workspaces' });
        assert.equal(accepted.statusCode, 200, accepted.body);
        const forbidden = await app.inject({ url: '/api/account' });
        assert.equal(forbidden.statusCode, 401, forbidden.body);
        const session = await app.inject({
          method: 'DELETE',
          url: '/api/account/sessions/others',
        });
        assert.equal(session.statusCode, 401, session.body);
        // The descendant holds its async context after the call, but no right.
        const { AsyncResource } = await import('node:async_hooks');
        const resource = new AsyncResource('mcp-test');
        late = () =>
          resource.runInAsyncScope(
            async () =>
              (await app.inject({ url: '/api/workspaces' })).statusCode,
          );
      },
    );
    assert.ok(late);
    assert.equal(await late(), 401);
    const forged = await app.inject({
      url: '/api/workspaces',
      headers: {
        'x-mcp-delegation': JSON.stringify({
          ...grant,
          operations: ['listWorkspaces'],
        }),
      },
    });
    assert.equal(forged.statusCode, 401, forged.body);
  });
  await test('grant and account limits each hold across two app instances', async () => {
    const limited = { ...config, rateLimit: { windowSeconds: 3600, max: 2 } };
    const first = await createApp(limited);
    const second = await createApp(limited);
    try {
      // Remove only this file's disposable counters before each independent bound.
      for (const kind of ['grant', 'account']) {
        await admin.query(
          "delete from attempt_counters where key like 'mcp-%'",
        );
        const credentials =
          kind === 'grant' ? [read, read, read] : [read, write, read];
        for (const [n, credential] of credentials.entries()) {
          if (kind === 'grant' && n === 2)
            await admin.query(
              "delete from attempt_counters where key like 'mcp-account:%'",
            );
          const answer = await (n % 2 === 0 ? first : second).inject({
            method: 'POST',
            url: '/mcp',
            headers: headers(credential),
            payload: legacy(),
          });
          assert.equal(answer.statusCode, n < 2 ? 200 : 429, answer.body);
          if (n === 2) errorBody(answer, -32000);
        }
        const grant = await identity.oauthTokenIdentity(
          createHash('sha256').update(read).digest('hex'),
          resource,
        );
        assert.ok(grant);
        const grantKey = `mcp-grant:${createHash('sha256').update(grant.grantId).digest('hex')}`;
        const key =
          kind === 'grant' ? grantKey : `mcp-account:${grant.accountId}`;
        const counted = await admin.query<{ count: number }>(
          'select count from attempt_counters where key=$1',
          [key],
        );
        assert.equal(counted[0]?.count, 3);
      }
    } finally {
      await first.close();
      await second.close();
    }
  });
  await test('MCP and its metadata answer 404 when the setting is absent', async () => {
    const disabled = await createApp({ ...config, mcpOrigin: null });
    try {
      for (const url of [
        '/mcp',
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp',
      ])
        assert.equal((await disabled.inject({ url })).statusCode, 404, url);
    } finally {
      await disabled.close();
    }
  });
  await test('no SDK notice or credential reaches a console or server log', () => {
    assert.deepEqual(notices, []);
    for (const value of protectedValues)
      assert.equal(logs.join('').includes(value), false);
  });
} finally {
  for (const mocked of consoleMocks) mocked.mock.restore();
  await app.close();
  await fixture.close();
  await identity.close();
  await admin.close();
  await database.destroy();
  await rm(root, { recursive: true, force: true });
}
