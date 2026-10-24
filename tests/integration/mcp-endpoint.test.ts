/** The served MCP boundary and the capability of one tool call (0225, 0227). */
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { commitChangeset, type WorkspaceStore } from '@notesapp/core';
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
  createWorkspace,
  createFile,
  createInvitation,
  registerAccount,
  getAccount,
  listWorkspaces,
  getFile,
  updateFile,
  listHistory,
  listDeletedFiles,
  restoreFile,
  deleteFile,
  purgeFiles,
  commitChangeset as sendChangeset,
} from '@notesapp/api-client';
import {
  bootstrapOwner,
  createApp,
  createAppWithHandlers,
  createMcpProtocol,
  createAuth,
  createHandlers,
  createIdentityAdapter,
  loadServerConfig,
  requestActor,
  withToolDelegation,
  type McpTool,
  mcpTools,
} from '@notesapp/server';
import {
  openIdentityStore,
  openCoordination,
  openWorkspaceStore,
  createDocumentService,
} from '@notesapp/storage-server';
import {
  createDisposableDatabase,
  openSession,
  changeset,
  revision,
  memberActor,
} from './support/database.ts';
import { firstSave } from './support/documents.ts';
import {
  startTestServer,
  stubProtocol,
  completeTestHandlers,
  testEnvironment,
} from './support/server.ts';

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
let writeExecutions = 0;
let scopeWorkspaceId = '';
const blockedFileId = randomUUID();
const tools: readonly McpTool[] = [
  {
    definition: {
      name: 'test_read_scope',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    scope: 'notes:read',
    operations: ['listFiles'],
    run: async (_input, context) => {
      const listed = await context.call('listFiles', {
        params: { workspaceId: scopeWorkspaceId },
      });
      assert.equal(listed.status, 200);
      const refused = await context.call('createFile', {
        params: { workspaceId: scopeWorkspaceId },
        body: {
          fileId: blockedFileId,
          revisionId: randomUUID(),
          mutationId: randomUUID(),
          deviceId: 'forbidden-tool',
          path: 'Forbidden.md',
          document: firstSave('Do not write this.'),
        },
      });
      assert.equal(refused.status, 401);
      return { content: [{ type: 'text', text: 'The write is refused.' }] };
    },
  },
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
      writeExecutions += 1;
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
const contentStore = openWorkspaceStore(
  database.runtimeUrl,
  createDocumentService(),
  { poolSize: 2 },
);
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

async function token(scopes = 'notes:read', sessionCookie = cookie) {
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
    headers: { cookie: sessionCookie },
  });
  assert.equal(authorized.statusCode, 302, authorized.body);
  const consent = await giveOAuthConsent({
    headers: { cookie: sessionCookie, origin: config.origin },
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
  await test('the modern and earlier stateless protocols show exactly the ten production note tools', async () => {
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
      assert.deepEqual(
        Reflect.get(result, 'tools'),
        mcpTools.map((tool) => tool.definition),
      );
      if ('mcp-protocol-version' in requestHeaders) {
        assert.equal(Reflect.get(result, 'resultType'), 'complete');
        assert.equal(Reflect.get(result, 'cacheScope'), 'private');
        assert.equal(Reflect.get(result, 'ttlMs'), 0);
      } else
        assert.deepEqual(result, {
          tools: mcpTools.map((tool) => tool.definition),
        });
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
  await test('every batch is refused before a tool or contract operation can run', async () => {
    const before = writeExecutions;
    for (const credential of [read, write])
      for (const era of ['legacy', 'modern']) {
        const call =
          era === 'legacy'
            ? legacy('tools/call', { name: 'test_write', arguments: {} })
            : modern('tools/call', { name: 'test_write', arguments: {} });
        const { id: _notificationId, ...notification } =
          era === 'legacy'
            ? legacy('notifications/initialized')
            : modern('notifications/initialized');
        for (const batch of [
          [],
          [call],
          [legacy('tools/list'), call],
          [notification, call],
          [notification, notification],
        ]) {
          const answer = await fixture.inject({
            method: 'POST',
            url: '/mcp',
            headers: {
              ...(era === 'legacy'
                ? headers(credential)
                : modernHeaders('tools/call', credential, 'test_write')),
              'content-type': 'application/json',
            },
            payload: ` \t\r\n${JSON.stringify(batch)}`,
          });
          assert.equal(answer.statusCode, 400, answer.body);
          errorBody(answer, -32600);
          assert.equal(writeExecutions, before);
        }
      }
  });
  await test('a read grant sees every test tool but a write call gets the scope challenge', async () => {
    const listed = await fixture.inject({
      method: 'POST',
      url: '/mcp',
      headers: headers(),
      payload: legacy(),
    });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.deepEqual(
      listed.json().result.tools.map((tool: { name: string }) => tool.name),
      ['test_read_scope', 'test_write'],
    );
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
  await test('a held identity lookup cannot install an actor after the tool ends', async (t) => {
    const grant = await identity.oauthTokenIdentity(
      createHash('sha256').update(read).digest('hex'),
      resource,
    );
    assert.ok(grant);
    for (const step of ['sessionStanding', 'memberships'])
      await t.test(step, async () => {
        const entered = Promise.withResolvers<void>();
        const released = Promise.withResolvers<void>();
        let membershipLookups = 0;
        let installed = false;
        let operationsRun = 0;
        const auth = await createAuth(
          { ...config, mcpOrigin: null },
          {
            mail: null,
            sessionAllowed: () => Promise.resolve(false),
          },
        );
        const adapter = createIdentityAdapter({
          auth: auth.auth,
          servedOrigins: config.servedOrigins,
          identity: {
            ...identity,
            sessionStanding: async (user) => {
              const current = await identity.sessionStanding(user);
              if (step === 'sessionStanding') {
                entered.resolve();
                await released.promise;
              }
              return current;
            },
            memberships: async (account) => {
              membershipLookups += 1;
              const current = await identity.memberships(account);
              if (step === 'memberships') {
                entered.resolve();
                await released.promise;
              }
              return current;
            },
          },
        });
        const server = await startTestServer({
          handlers: (settings) => ({
            ...createHandlers(settings),
            listWorkspaces: () => {
              operationsRun += 1;
              return Promise.resolve({
                status: 200,
                mediaType: 'application/json',
                body: { workspaces: [] },
              });
            },
          }),
          identity: async (request, operation) => {
            try {
              await adapter.resolver(request, operation);
            } finally {
              installed ||= requestActor(request) !== undefined;
            }
          },
        });
        let pending: Promise<{ statusCode: number; body: string }> | undefined;
        try {
          await withToolDelegation(grant, ['listWorkspaces'], async () => {
            pending = server.app
              .inject({ url: '/api/workspaces' })
              .then((answer) => answer);
            await Promise.race([
              entered.promise,
              pending.then((answer) => {
                throw new Error(
                  `The lookup did not hold: ${String(answer.statusCode)}`,
                );
              }),
            ]);
          });
          released.resolve();
          assert.ok(pending);
          const answer = await pending;
          assert.equal(answer.statusCode, 401, answer.body);
          assert.equal(installed, false);
          assert.equal(operationsRun, 0);
          assert.equal(membershipLookups, step === 'sessionStanding' ? 0 : 1);
        } finally {
          released.resolve();
          await pending;
          await server.close();
          await auth.close();
        }
      });
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
      ]) {
        const answer = await disabled.inject({ url });
        assert.equal(answer.statusCode, 404, url);
        assert.match(
          String(answer.headers['content-type']),
          /^application\/problem\+json/,
        );
        assert.equal(answer.headers['www-authenticate'], undefined);
        assert.deepEqual(answer.json(), {
          type: 'https://notesapp.invalid/problems/route_not_found',
          title: 'No operation serves this method and path.',
          status: 404,
          detail: 'No operation serves this method and path.',
          instance: url,
          code: 'route_not_found',
          requestId: answer.headers['x-request-id'],
        });
      }
    } finally {
      await disabled.close();
    }
  });

  const browserHeaders = { cookie, origin: config.origin };
  const workspaceList = await listWorkspaces({ headers: browserHeaders });
  const workspaceId = workspaceList.data?.workspaces[0]?.workspaceId;
  assert.ok(workspaceId);
  const writeWorkspaceId: string = workspaceId;
  scopeWorkspaceId = workspaceId;
  const grantIdentity = await identity.oauthTokenIdentity(
    createHash('sha256').update(read).digest('hex'),
    resource,
  );
  assert.ok(grantIdentity);
  const fileId = randomUUID();
  const firstVersion = randomUUID();
  const longText = 'a'.repeat(16 * 1024 - 1) + '😀' + 'b'.repeat(20 * 1024);
  async function seedNote(
    workspace: string,
    path: string,
    text: string,
    id = randomUUID(),
    version = randomUUID(),
  ) {
    const entry = revision({ id: version, fileId: id, path, text });
    const input = changeset(workspace, [entry]);
    assert.ok(grantIdentity);
    const accepted = await commitChangeset(
      contentStore,
      memberActor(grantIdentity.accountId, workspace),
      input,
      `mcp-${input.mutationId}`,
    );
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    return id;
  }
  await seedNote(workspaceId, 'folder/Long.md', longText, fileId, firstVersion);
  const backlinkId = await seedNote(
    workspaceId,
    'Reference.md',
    '[Long](folder/Long.md)\nneedleword',
  );
  function object(value: unknown): Record<string, unknown> {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    return Object.fromEntries(Object.entries(value));
  }
  function stringField(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    assert.ok(typeof value === 'string', `The ${key} field must be a string.`);
    return value;
  }
  async function callRead(
    name: string,
    input: Record<string, unknown>,
    era = 'modern',
    credential = read,
    target = app,
  ) {
    const answer = await target.inject({
      method: 'POST',
      url: '/mcp',
      headers:
        era === 'modern'
          ? modernHeaders('tools/call', credential, name)
          : headers(credential),
      payload:
        era === 'modern'
          ? modern('tools/call', { name, arguments: input })
          : legacy('tools/call', { name, arguments: input }),
    });
    assert.equal(answer.statusCode, 200, answer.body);
    assert.equal(answer.headers['set-cookie'], undefined);
    const body = object(json(answer));
    const result = object(body.result);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 64 * 1024);
    return result;
  }
  function success(result: Record<string, unknown>) {
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return object(result.structuredContent);
  }
  function items(body: Record<string, unknown>, name: string) {
    const value = body[name];
    assert.ok(Array.isArray(value));
    return value.map(object);
  }
  await test('each production read tool serves real notes through both protocol eras', async () => {
    for (const era of ['modern', 'legacy']) {
      const workspaces = success(await callRead('list_workspaces', {}, era));
      assert.ok(
        items(workspaces, 'workspaces').some(
          (item) => item.workspaceId === workspaceId,
        ),
      );
      const notes = success(
        await callRead(
          'list_notes',
          { workspaceId, sort: 'path', limit: 1 },
          era,
        ),
      );
      assert.equal(items(notes, 'notes').length, 1);
      assert.ok(typeof notes.nextCursor === 'string');
      const nextNotes = success(
        await callRead(
          'list_notes',
          { workspaceId, sort: 'path', limit: 1, cursor: notes.nextCursor },
          era,
        ),
      );
      const found = [...items(notes, 'notes'), ...items(nextNotes, 'notes')];
      assert.ok(
        found.every(
          (item) =>
            item.workspaceId === workspaceId &&
            typeof item.fileId === 'string' &&
            typeof item.path === 'string' &&
            typeof item.name === 'string',
        ),
      );
      assert.deepEqual(
        found
          .map((item) => stringField(item, 'fileId'))
          .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
        [fileId, backlinkId].sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      );
      const note = success(
        await callRead('read_note', { workspaceId, fileId }, era),
      );
      assert.equal(note.version, firstVersion);
      assert.equal(note.name, 'Long');
      assert.equal(note.text, longText.slice(0, 16 * 1024 - 1));
      const search = success(
        await callRead(
          'search_notes',
          { workspaceId, query: 'needleword' },
          era,
        ),
      );
      assert.deepEqual(
        items(search, 'hits').map((item) => [
          item.workspaceId,
          item.fileId,
          item.name,
        ]),
        [[workspaceId, backlinkId, 'Reference']],
      );
      const backlinks = success(
        await callRead('list_backlinks', { workspaceId, fileId }, era),
      );
      assert.deepEqual(
        items(backlinks, 'backlinks').map((item) => [
          item.workspaceId,
          item.fileId,
          item.name,
        ]),
        [[workspaceId, backlinkId, 'Reference']],
      );
      const history = success(
        await callRead(
          'list_note_history',
          { workspaceId, fileId, limit: 1 },
          era,
        ),
      );
      assert.deepEqual(
        items(history, 'revisions').map((item) => [
          item.workspaceId,
          item.fileId,
          item.version,
        ]),
        [[workspaceId, fileId, firstVersion]],
      );
      assert.ok(
        items(history, 'revisions').every(
          (item) => item.text === undefined && item.document === undefined,
        ),
      );
    }
  });
  await test('long note continuation reads the first version after its head moves', async () => {
    const first = success(await callRead('read_note', { workspaceId, fileId }));
    const movedVersion = randomUUID();
    const moved = await updateFile({
      headers: { ...browserHeaders, 'if-match': `"${firstVersion}"` },
      path: { workspaceId, fileId },
      body: {
        revisionId: movedVersion,
        mutationId: randomUUID(),
        deviceId: 'mcp-page-test',
        path: 'folder/Moved.md',
      },
    });
    assert.equal(moved.response?.status, 200, JSON.stringify(moved.error));
    let whole = stringField(first, 'text');
    let offset = first.nextOffset;
    while (typeof offset === 'number') {
      const page = success(
        await callRead('read_note', {
          workspaceId,
          fileId,
          version: first.version,
          offset,
        }),
      );
      assert.equal(page.version, firstVersion);
      assert.equal(page.name, 'Long');
      whole += stringField(page, 'text');
      offset = page.nextOffset;
    }
    assert.equal(whole, longText);
    assert.equal(
      success(await callRead('read_note', { workspaceId, fileId })).version,
      movedVersion,
    );
    const history = success(
      await callRead('list_note_history', { workspaceId, fileId, limit: 1 }),
    );
    assert.equal(items(history, 'revisions')[0]?.version, movedVersion);
    const earlier = success(
      await callRead('list_note_history', {
        workspaceId,
        fileId,
        limit: 1,
        cursor: history.nextCursor,
      }),
    );
    assert.equal(items(earlier, 'revisions')[0]?.version, firstVersion);
    const noVersion = await callRead('read_note', {
      workspaceId,
      fileId,
      offset: first.nextOffset,
    });
    assert.equal(noVersion.isError, true);
  });
  await test('the serialized answer cap reduces a Unicode text page and keeps all text', async () => {
    const source = '界'.repeat(16 * 1024 * 2);
    const id = await seedNote(workspaceId, 'Unicode.md', source);
    let whole = '';
    let offset: unknown = 0;
    let version: unknown;
    while (typeof offset === 'number') {
      const page = success(
        await callRead('read_note', {
          workspaceId,
          fileId: id,
          offset,
          ...(typeof version === 'string' ? { version } : {}),
        }),
      );
      const part = stringField(page, 'text');
      assert.ok(part.length < 16 * 1024);
      whole += part;
      version = page.version;
      offset = page.nextOffset;
    }
    assert.equal(whole, source);
  });
  await test('a read-tool delegation cannot write through the normal pipeline', async () => {
    for (const era of ['modern', 'legacy']) {
      const answer = await fixture.inject({
        method: 'POST',
        url: '/mcp',
        headers:
          era === 'modern'
            ? modernHeaders('tools/call', read, 'test_read_scope')
            : headers(),
        payload:
          era === 'modern'
            ? modern('tools/call', { name: 'test_read_scope', arguments: {} })
            : legacy('tools/call', { name: 'test_read_scope', arguments: {} }),
      });
      assert.equal(answer.statusCode, 200, answer.body);
      assert.equal(object(object(json(answer)).result).isError, undefined);
    }
    const absent = await getFile({
      headers: browserHeaders,
      path: { workspaceId, fileId: blockedFileId },
    });
    assert.equal(absent.response?.status, 404);
  });
  await test('official suite aliases are unknown in the production registry', async () => {
    for (const name of [
      'test_simple_text',
      'test_error_handling',
      'json_schema_2020_12_tool',
    ]) {
      const result = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: headers(),
        payload: legacy('tools/call', { name, arguments: {} }),
      });
      assert.equal(result.statusCode, 200, result.body);
      assert.equal(object(object(json(result)).error).code, -32601);
    }
  });
  await test('account search continues past ten workspaces with each workspace identity', async () => {
    const wanted: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const made = await createWorkspace({
        headers: browserHeaders,
        body: { name: `Search ${i}` },
      });
      assert.equal(made.response?.status, 201, JSON.stringify(made.error));
      const workspace = made.data?.workspaceId;
      assert.ok(workspace);
      wanted.push(workspace);
      await seedNote(workspace, 'Needle.md', 'crossworkspaceneedle');
    }
    const found: string[] = [];
    let cursor: unknown;
    let pages = 0;
    do {
      const page = success(
        await callRead('search_notes', {
          query: 'crossworkspaceneedle',
          ...(typeof cursor === 'string' ? { cursor } : {}),
        }),
      );
      found.push(
        ...items(page, 'hits').map((item) => stringField(item, 'workspaceId')),
      );
      cursor = page.nextCursor;
      pages += 1;
      assert.ok(pages <= 3);
    } while (typeof cursor === 'string');
    assert.equal(pages, 2);
    assert.deepEqual(
      found.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
      wanted.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
    );
  });
  const callWrite = (
    name: string,
    input: Record<string, unknown>,
    era = 'modern',
  ) => callRead(name, input, era, write);
  function failure(result: Record<string, unknown>, message: RegExp) {
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(result.structuredContent, undefined);
    assert.match(JSON.stringify(result.content), message);
  }
  async function noteState(id: string) {
    const found = await getFile({
      headers: browserHeaders,
      path: { workspaceId: writeWorkspaceId, fileId: id },
    });
    assert.equal(found.response?.status, 200, JSON.stringify(found.error));
    assert.ok(found.data?.head);
    const history = await listHistory({
      headers: browserHeaders,
      path: { workspaceId: writeWorkspaceId, fileId: id },
    });
    assert.ok(history.data);
    return { head: found.data.head, history: history.data };
  }
  async function browserEdit(id: string, text: string) {
    const before = await noteState(id);
    assert.ok(before.head.document && before.head.epoch);
    const documents = createDocumentService();
    const bytes = Buffer.from(before.head.document, 'base64');
    const next = documents.replaceText(bytes, text);
    assert.ok(next.ok);
    const changed = await updateFile({
      headers: { ...browserHeaders, 'if-match': `"${before.head.revisionId}"` },
      path: { workspaceId: writeWorkspaceId, fileId: id },
      body: {
        revisionId: randomUUID(),
        mutationId: randomUUID(),
        deviceId: 'browser-race',
        document: {
          update: Buffer.from(
            documents.delta(next.value.bytes, documents.stateVector(bytes)),
          ).toString('base64'),
          epoch: before.head.epoch,
          observed: Buffer.from(documents.observe(bytes)).toString('base64'),
        },
      },
    });
    assert.equal(changed.response?.status, 200, JSON.stringify(changed.error));
    return noteState(id);
  }
  // Hold the real tool's contract boundary without replacing a handler or a
  // database result. Every request still uses the normal authorization path.
  async function heldIncremental(stage: 'receipt' | 'commit', name: string) {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let receipts = 0;
    let commits = 0;
    let reads = 0;
    const target = await createApp(config, {
      mcpTools: mcpTools.map((entry) =>
        entry.definition.name !== name
          ? entry
          : {
              ...entry,
              run: (input, context) =>
                entry.run(input, {
                  ...context,
                  call: async (id, request) => {
                    if (id === 'getFile') reads += 1;
                    if (id === 'commitChangeset') {
                      commits += 1;
                      if (stage === 'commit' && commits === 1) {
                        entered.resolve();
                        await release.promise;
                      }
                    }
                    const answer = await context.call(id, request);
                    if (id === 'getMutationReceipt') {
                      receipts += 1;
                      if (stage === 'receipt' && receipts === 1) {
                        assert.equal(object(answer.body).status, 'absent');
                        entered.resolve();
                        await release.promise;
                      }
                    }
                    return answer;
                  },
                }),
            },
      ),
    });
    return {
      target,
      entered,
      release,
      counts: () => ({ receipts, commits, reads }),
    };
  }
  async function waitForHeld(
    held: Awaited<ReturnType<typeof heldIncremental>>,
    pending: Promise<unknown>,
  ) {
    await Promise.race([
      held.entered.promise,
      pending.then((answer) => {
        throw new Error(
          `The call ended before the barrier: ${JSON.stringify(answer)}`,
        );
      }),
    ]);
  }
  async function trashIncremental(id: string) {
    const before = await noteState(id);
    assert.ok(before.head.document && before.head.epoch);
    const documents = createDocumentService();
    const removed = await deleteFile({
      headers: { ...browserHeaders, 'if-match': `"${before.head.revisionId}"` },
      path: { workspaceId: writeWorkspaceId, fileId: id },
      body: {
        revisionId: randomUUID(),
        mutationId: randomUUID(),
        deviceId: 'incremental-trash',
        document: {
          update: null,
          epoch: before.head.epoch,
          observed: Buffer.from(
            documents.observe(Buffer.from(before.head.document, 'base64')),
          ).toString('base64'),
        },
      },
    });
    assert.equal(removed.response?.status, 200, JSON.stringify(removed.error));
    return removed.data;
  }
  async function purgeIncremental(id: string) {
    await trashIncremental(id);
    const purged = await purgeFiles({
      headers: browserHeaders,
      path: { workspaceId: writeWorkspaceId },
      body: { mutationId: randomUUID(), fileIds: [id] },
    });
    assert.deepEqual(
      purged.data?.purgedFileIds,
      [id],
      JSON.stringify(purged.error),
    );
  }
  async function incrementalCounts(id: string) {
    return admin.query(
      'select (select count(*) from revisions where file_id=$1) as revisions, (select count(*) from mutation_receipts where workspace_id=$2) as receipts',
      [id, workspaceId],
    );
  }
  await test('incremental calls serve both eras, create separate History versions, and deduplicate a lost answer', async () => {
    for (const era of ['modern', 'legacy']) {
      const id = await seedNote(workspaceId, `incremental/${era}.md`, 'Start');
      const initial = await noteState(id);
      const input = {
        workspaceId,
        fileId: id,
        version: initial.head.revisionId,
        text: 'Next',
      };
      // Treat this answer as lost. The retry has no dependency on its fields.
      success(await callWrite('append_to_note', input, era));
      const after = await noteState(id);
      assert.equal(after.head.text, 'Start\nNext');
      assert.equal(
        after.history.revisions.length,
        initial.history.revisions.length + 1,
      );
      const counts = await incrementalCounts(id);
      const retry = success(await callWrite('append_to_note', input, era));
      assert.equal(retry.earlierAttempt, true);
      assert.equal(retry.changed, false);
      assert.equal(retry.version, undefined);
      assert.equal(retry.text, undefined);
      assert.deepEqual(await incrementalCounts(id), counts);
      const next = success(
        await callWrite(
          'append_to_note',
          { ...input, version: after.head.revisionId },
          era,
        ),
      );
      assert.equal(next.changed, true);
      assert.equal(next.headMoved, false);
      const twice = await noteState(id);
      assert.equal(twice.head.text, 'Start\nNext\nNext');
      assert.equal(
        twice.history.revisions.length,
        initial.history.revisions.length + 2,
      );
    }
  });
  await test('section appends preserve original BOM and line endings through the served contract', async (t) => {
    for (const [style, ending] of [
      ['LF', '\n'],
      ['CRLF', '\r\n'],
      ['CR', '\r'],
    ] as const) {
      for (const bom of ['', '\uFEFF']) {
        await t.test(
          `${style} ${bom === '' ? 'without BOM' : 'with BOM'}`,
          async () => {
            const source = `${bom}# A${ending}body${ending}## Child${ending}child${ending}# B${ending}last${ending}# C`;
            const id = await seedNote(
              workspaceId,
              `incremental/heading-${style}-${bom.length}.md`,
              source,
            );
            const before = await noteState(id);
            assert.equal(before.head.text, source);
            const firstInput = {
              workspaceId,
              fileId: id,
              version: before.head.revisionId,
              heading: '# A',
              text: 'first',
            };
            const first = success(
              await callWrite('append_to_note', firstInput),
            );
            const afterFirst = await noteState(id);
            assert.equal(
              afterFirst.head.text,
              `${bom}# A${ending}body${ending}## Child${ending}child${ending}first\n# B${ending}last${ending}# C`,
            );
            assert.equal(
              afterFirst.history.revisions.length,
              before.history.revisions.length + 1,
            );
            const second = success(
              await callWrite('append_to_note', {
                workspaceId,
                fileId: id,
                version: stringField(first, 'version'),
                heading: '# B',
                text: 'later\r\n',
              }),
            );
            assert.equal(second.changed, true);
            const afterSecond = await noteState(id);
            assert.equal(
              afterSecond.head.text,
              `${bom}# A${ending}body${ending}## Child${ending}child${ending}first\n# B${ending}last${ending}later\r\n# C`,
            );
            assert.equal(
              afterSecond.history.revisions.length,
              before.history.revisions.length + 2,
            );
            const counts = await incrementalCounts(id);
            const retry = success(
              await callWrite('append_to_note', firstInput),
            );
            assert.equal(retry.earlierAttempt, true);
            assert.deepEqual(await incrementalCounts(id), counts);
          },
        );
      }
    }
  });
  await test('retry returns an earlier attempt after its anchor disappears, Trash or purge', async () => {
    for (const state of ['anchor', 'trash', 'purge']) {
      const id = await seedNote(
        workspaceId,
        `incremental/retry-${state}.md`,
        'old anchor',
      );
      const before = await noteState(id);
      const input = {
        workspaceId,
        fileId: id,
        version: before.head.revisionId,
        changes: [
          { operation: 'replace', anchor: 'old anchor', text: 'new text' },
        ],
      };
      success(await callWrite('patch_note', input));
      if (state === 'trash') await trashIncremental(id);
      if (state === 'purge') await purgeIncremental(id);
      const counts = await incrementalCounts(id);
      const earlier = success(await callWrite('patch_note', input));
      assert.equal(earlier.earlierAttempt, true);
      assert.equal(earlier.version, undefined);
      assert.deepEqual(await incrementalCounts(id), counts);
    }
  });
  await test('receipt race after absent handles a removed anchor, Trash and purge with no second write', async (t) => {
    for (const state of ['append', 'anchor', 'trash', 'purge'])
      await t.test(state, { timeout: 15000 }, async () => {
        const id = await seedNote(
          workspaceId,
          `incremental/receipt-race-${state}.md`,
          'old anchor',
        );
        const before = await noteState(id);
        const patch = state === 'anchor';
        const name = patch ? 'patch_note' : 'append_to_note';
        const input = {
          workspaceId,
          fileId: id,
          version: before.head.revisionId,
          ...(patch
            ? {
                changes: [
                  {
                    operation: 'replace',
                    anchor: 'old anchor',
                    text: 'new text',
                  },
                ],
              }
            : { text: 'new text' }),
        };
        const held = await heldIncremental('receipt', name);
        let pending: ReturnType<typeof callRead> | undefined;
        try {
          pending = callRead(name, input, 'modern', write, held.target);
          await waitForHeld(held, pending);
          success(await callWrite(name, input));
          const accepted = await noteState(id);
          assert.equal(
            accepted.history.revisions.length,
            before.history.revisions.length + 1,
          );
          if (state === 'trash') await trashIncremental(id);
          if (state === 'purge') await purgeIncremental(id);
          const counts = await incrementalCounts(id);
          held.release.resolve();
          const answer = success(await pending);
          assert.equal(answer.earlierAttempt, true);
          assert.equal(answer.changed, false);
          assert.deepEqual(await incrementalCounts(id), counts);
          assert.deepEqual(held.counts(), {
            receipts: state === 'append' ? 1 : 2,
            commits: state === 'append' ? 1 : 0,
            reads: 1,
          });
        } finally {
          held.release.resolve();
          await pending;
          await held.target.close();
        }
      });
  });
  await test(
    'two concurrent copies that reach commit use one receipt and one History version',
    { timeout: 15000 },
    async () => {
      const id = await seedNote(
        workspaceId,
        'incremental/commit-retry.md',
        'old anchor',
      );
      const before = await noteState(id);
      const input = {
        workspaceId,
        fileId: id,
        version: before.head.revisionId,
        changes: [{ operation: 'replace', anchor: 'old anchor', text: 'new' }],
      };
      const held = await heldIncremental('commit', 'patch_note');
      let pending: ReturnType<typeof callRead> | undefined;
      try {
        pending = callRead('patch_note', input, 'modern', write, held.target);
        await waitForHeld(held, pending);
        success(await callWrite('patch_note', input));
        const counts = await incrementalCounts(id);
        held.release.resolve();
        assert.equal(success(await pending).earlierAttempt, true);
        const after = await noteState(id);
        assert.equal(after.head.text, 'new');
        assert.equal(
          after.history.revisions.length,
          before.history.revisions.length + 1,
        );
        assert.deepEqual(await incrementalCounts(id), counts);
      } finally {
        held.release.resolve();
        await pending;
        await held.target.close();
      }
    },
  );
  await test('note-state errors with no receipt keep their original refusal and write nothing', async () => {
    const id = await seedNote(workspaceId, 'incremental/refusal.md', 'body');
    const before = await noteState(id);
    const counts = await incrementalCounts(id);
    for (const [name, extra, expected] of [
      [
        'patch_note',
        { changes: [{ operation: 'replace', anchor: 'missing', text: 'x' }] },
        /anchor is not/,
      ],
      [
        'append_to_note',
        { heading: '# Missing', text: 'x' },
        /heading must occur once/,
      ],
    ] as const)
      failure(
        await callWrite(name, {
          workspaceId,
          fileId: id,
          version: before.head.revisionId,
          ...extra,
        }),
        expected,
      );
    assert.deepEqual(await incrementalCounts(id), counts);
    await trashIncremental(id);
    const trashCounts = await incrementalCounts(id);
    failure(
      await callWrite('append_to_note', {
        workspaceId,
        fileId: id,
        version: before.head.revisionId,
        text: 'x',
      }),
      /not available/,
    );
    assert.deepEqual(await incrementalCounts(id), trashCounts);
  });
  await test('incremental document work merges concurrent device edits and preserves named character identities', async (t) => {
    for (const scenario of ['append', 'inside', 'repeated'])
      for (const order of ['device-first', 'tool-first'])
        await t.test(`${scenario} ${order}`, { timeout: 15000 }, async () => {
          const source = scenario === 'repeated' ? 'aba' : 'abcdef';
          const id = await seedNote(
            workspaceId,
            `incremental/merge-${scenario}-${order}.md`,
            source,
          );
          const before = await noteState(id);
          assert.ok(before.head.document && before.head.epoch);
          const documents = createDocumentService();
          const bytes = Buffer.from(before.head.document, 'base64');
          const device = documents.editRanges(bytes, [
            scenario === 'repeated'
              ? { offset: 2, length: 1, text: 'X' }
              : { offset: 3, length: 0, text: 'X' },
          ]);
          assert.ok(device.ok);
          const name = scenario === 'append' ? 'append_to_note' : 'patch_note';
          const input = {
            workspaceId,
            fileId: id,
            version: before.head.revisionId,
            ...(scenario === 'append'
              ? { text: 'TOOL' }
              : {
                  changes: [
                    {
                      operation: 'replace',
                      anchor: scenario === 'repeated' ? 'ab' : 'bcde',
                      text: scenario === 'repeated' ? '' : 'TOOL',
                    },
                  ],
                }),
          };
          const held = await heldIncremental('commit', name);
          const deviceSave = () =>
            sendChangeset({
              headers: browserHeaders,
              path: { workspaceId },
              body: {
                mutationId: randomUUID(),
                deviceId: 'incremental-device',
                expectedHeads: { [id]: before.head.revisionId },
                revisions: [
                  {
                    revisionId: randomUUID(),
                    fileId: id,
                    parents: [before.head.revisionId],
                    path: `incremental/merge-${scenario}-${order}.md`,
                    deleted: false,
                    clientTime: new Date().toISOString(),
                    content: {
                      kind: 'markdown',
                      document: {
                        update: Buffer.from(
                          documents.delta(
                            device.value.bytes,
                            documents.stateVector(bytes),
                          ),
                        ).toString('base64'),
                        epoch: before.head.epoch ?? 1,
                        observed: Buffer.from(
                          documents.observe(bytes),
                        ).toString('base64'),
                      },
                    },
                  },
                ],
              },
            });
          let pending: ReturnType<typeof callRead> | undefined;
          try {
            pending = callRead(name, input, 'modern', write, held.target);
            await waitForHeld(held, pending);
            if (order === 'device-first') {
              const saved = await deviceSave();
              assert.equal(
                saved.response?.status,
                200,
                JSON.stringify(saved.error),
              );
            }
            held.release.resolve();
            const answer = success(await pending);
            assert.equal(answer.headMoved, order === 'device-first');
            if (order === 'tool-first') {
              const saved = await deviceSave();
              assert.equal(
                saved.response?.status,
                200,
                JSON.stringify(saved.error),
              );
            }
            const after = await noteState(id);
            if (scenario === 'append')
              assert.equal(after.head.text, 'abcXdef\nTOOL');
            if (scenario === 'inside') {
              assert.ok(after.head.text?.includes('X'));
              assert.ok(after.head.text?.includes('TOOL'));
              assert.ok(
                after.head.text?.startsWith('a') &&
                  after.head.text.endsWith('f'),
              );
              assert.equal(after.head.text?.length, 7);
            }
            if (scenario === 'repeated') assert.equal(after.head.text, 'X');
            assert.equal(
              after.history.revisions.length,
              before.history.revisions.length + 2,
            );
            assert.equal(after.head.merged, true);
            const entries = after.history.revisions;
            assert.equal(entries[0]?.parents.length, 1);
            assert.equal(entries[0]?.parents[0], entries[1]?.revisionId);
          } finally {
            held.release.resolve();
            await pending;
            await held.target.close();
          }
        });
  });
  await test('incremental commit keeps a concurrent rename and restores concurrent Trash', async (t) => {
    for (const action of ['rename', 'trash'])
      await t.test(action, { timeout: 15000 }, async () => {
        const id = await seedNote(
          workspaceId,
          `incremental/metadata-${action}.md`,
          'body',
        );
        const before = await noteState(id);
        const input = {
          workspaceId,
          fileId: id,
          version: before.head.revisionId,
          text: 'TOOL',
        };
        const held = await heldIncremental('commit', 'append_to_note');
        let pending: ReturnType<typeof callRead> | undefined;
        try {
          pending = callRead(
            'append_to_note',
            input,
            'modern',
            write,
            held.target,
          );
          await waitForHeld(held, pending);
          if (action === 'trash') await trashIncremental(id);
          else {
            const renamed = await updateFile({
              headers: {
                ...browserHeaders,
                'if-match': `"${before.head.revisionId}"`,
              },
              path: { workspaceId, fileId: id },
              body: {
                revisionId: randomUUID(),
                mutationId: randomUUID(),
                deviceId: 'incremental-rename',
                path: 'incremental/renamed.md',
              },
            });
            assert.equal(
              renamed.response?.status,
              200,
              JSON.stringify(renamed.error),
            );
          }
          held.release.resolve();
          const answer = success(await pending);
          assert.equal(answer.deleted, false);
          assert.equal(answer.headMoved, true);
          const after = await noteState(id);
          assert.equal(after.head.text, 'body\nTOOL');
          assert.equal(after.head.deleted, false);
          assert.equal(
            after.history.revisions.length,
            before.history.revisions.length + 2,
          );
          if (action === 'rename')
            assert.equal(answer.path, 'incremental/renamed.md');
          else
            assert.equal(
              after.history.revisions.filter((entry) => entry.deleted).length,
              1,
            );
        } finally {
          held.release.resolve();
          await pending;
          await held.target.close();
        }
      });
  });
  await test(
    'incremental commit rebuilds once after a new document generation',
    { timeout: 15000 },
    async () => {
      const id = await seedNote(
        workspaceId,
        'incremental/generation.md',
        'body',
      );
      const before = await noteState(id);
      const held = await heldIncremental('commit', 'append_to_note');
      let pending: ReturnType<typeof callRead> | undefined;
      try {
        pending = callRead(
          'append_to_note',
          {
            workspaceId,
            fileId: id,
            version: before.head.revisionId,
            text: 'TOOL',
          },
          'modern',
          write,
          held.target,
        );
        await waitForHeld(held, pending);
        // The repair fixture starts a new generation only in this disposable DB.
        const documents = createDocumentService();
        const bytes = documents.start('body');
        await admin.query(
          `with repaired as (
        update note_documents set epoch=epoch+1, bytes=$3, state=$4
        where workspace_id=$1 and file_id=$2 returning epoch
      ), repair_revision as (
        insert into revisions (workspace_id,id,file_id,content_digest,path,deleted,changeset_id,actor_account_id,client_time,message,document_vector,document_epoch)
        select workspace_id,$6,file_id,content_digest,path,false,changeset_id,actor_account_id,clock_timestamp(),'Repair document generation',$7,(select epoch from repaired)
        from revisions where workspace_id=$1 and id=$5 returning id
      ), repair_parent as (
        insert into revision_parents (workspace_id,child_id,parent_id,ordinal)
        select $1,id,$5,0 from repair_revision
      ) update files set head_revision_id=$6 where workspace_id=$1 and id=$2`,
          [
            workspaceId,
            id,
            Buffer.from(bytes),
            Buffer.from(documents.observe(bytes)),
            before.head.revisionId,
            randomUUID(),
            Buffer.from(documents.stateVector(bytes)),
          ],
        );
        held.release.resolve();
        const answer = success(await pending);
        assert.equal(answer.changed, true);
        assert.deepEqual(held.counts(), { receipts: 1, reads: 2, commits: 2 });
        const after = await noteState(id);
        assert.equal(after.head.epoch, 2);
        assert.equal(after.head.text, 'body\nTOOL');
        assert.equal(
          after.history.revisions.length,
          before.history.revisions.length + 2,
        );
      } finally {
        held.release.resolve();
        await pending;
        await held.target.close();
      }
    },
  );
  await test('incremental result past the Markdown text limit writes no version or receipt', async () => {
    const id = await seedNote(
      workspaceId,
      'incremental/text-limit.md',
      'a'.repeat(1024 * 1024),
    );
    const before = await noteState(id);
    const counts = await incrementalCounts(id);
    failure(
      await callWrite('append_to_note', {
        workspaceId,
        fileId: id,
        version: before.head.revisionId,
        text: 'x',
      }),
      /not valid|too large/,
    );
    assert.deepEqual(await incrementalCounts(id), counts);
    assert.deepEqual(await noteState(id), before);
  });
  await test('incremental tools challenge a read grant before any write', async () => {
    for (const name of ['append_to_note', 'patch_note']) {
      const response = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: modernHeaders('tools/call', read, name),
        payload: modern('tools/call', { name, arguments: {} }),
      });
      assert.equal(response.statusCode, 403, response.body);
      assert.match(String(response.headers['www-authenticate']), /notes:write/);
    }
  });

  await test('the four production writes preserve version and retry rules in both protocol eras', async () => {
    for (const era of ['modern', 'legacy']) {
      const path = `writes/${era}.md`;
      const created = success(
        await callWrite(
          'create_note',
          { workspaceId: writeWorkspaceId, path, text: 'Keep old text.' },
          era,
        ),
      );
      const id = stringField(created, 'fileId');
      const version = stringField(created, 'version');
      assert.deepEqual(created, {
        workspaceId: writeWorkspaceId,
        fileId: id,
        version,
        path,
        name: era,
        deleted: false,
        changed: true,
      });
      const first = await noteState(id);
      assert.equal(first.head.text, 'Keep old text.');
      assert.equal(first.head.revisionId, version);
      failure(
        await callWrite(
          'create_note',
          { workspaceId: writeWorkspaceId, path, text: 'Do not replace this.' },
          era,
        ),
        /conflicts/,
      );
      assert.deepEqual(await noteState(id), first);
      for (const oldText of ['missing', 'e']) {
        failure(
          await callWrite(
            'edit_note',
            {
              workspaceId: writeWorkspaceId,
              fileId: id,
              version,
              oldText,
              newText: 'new',
            },
            era,
          ),
          /Read the note again/,
        );
        assert.deepEqual(await noteState(id), first);
      }
      const exactInput = {
        workspaceId: writeWorkspaceId,
        fileId: id,
        version,
        oldText: 'old',
        newText: 'new old',
      };
      const edited = success(await callWrite('edit_note', exactInput, era));
      assert.notEqual(edited.version, version);
      const second = await noteState(id);
      assert.equal(second.head.text, 'Keep new old text.');
      assert.equal(
        second.history.revisions.length,
        first.history.revisions.length + 1,
      );
      // New text still holds old text. The repeated request must not edit twice.
      failure(
        await callWrite('edit_note', exactInput, era),
        /Read the note again/,
      );
      failure(
        await callWrite(
          'move_note',
          {
            workspaceId: writeWorkspaceId,
            fileId: id,
            version,
            path: 'Stale.md',
          },
          era,
        ),
        /Read the note again/,
      );
      failure(
        await callWrite(
          'move_note_to_trash',
          { workspaceId: writeWorkspaceId, fileId: id, version },
          era,
        ),
        /Read the note again/,
      );
      assert.deepEqual(await noteState(id), second);
      const wholeInput = {
        workspaceId: writeWorkspaceId,
        fileId: id,
        version: edited.version,
        text: 'Whole text 😀',
      };
      const whole = success(await callWrite('edit_note', wholeInput, era));
      const third = await noteState(id);
      assert.equal(third.head.text, wholeInput.text);
      failure(
        await callWrite('edit_note', wholeInput, era),
        /Read the note again/,
      );
      assert.deepEqual(await noteState(id), third);
      for (const [name, input] of [
        [
          'edit_note',
          {
            workspaceId: writeWorkspaceId,
            fileId: id,
            version: whole.version,
            text: wholeInput.text,
          },
        ],
        [
          'edit_note',
          {
            workspaceId: writeWorkspaceId,
            fileId: id,
            version: whole.version,
            oldText: 'Whole',
            newText: 'Whole',
          },
        ],
        [
          'move_note',
          {
            workspaceId: writeWorkspaceId,
            fileId: id,
            version: whole.version,
            path,
          },
        ],
      ] as const) {
        const same = success(await callWrite(name, input, era));
        assert.equal(same.version, whole.version);
        assert.equal(same.changed, false);
        assert.deepEqual(await noteState(id), third);
      }
      const moveInput = {
        workspaceId: writeWorkspaceId,
        fileId: id,
        version: whole.version,
        path: `writes/${era}-moved.md`,
      };
      const moved = success(await callWrite('move_note', moveInput, era));
      const fourth = await noteState(id);
      assert.equal(fourth.head.path, moveInput.path);
      assert.equal(fourth.head.text, wholeInput.text);
      assert.equal(
        fourth.history.revisions.length,
        third.history.revisions.length + 1,
      );
      failure(
        await callWrite('move_note', moveInput, era),
        /Read the note again/,
      );
      // A rename also changes the version that an edit or Trash must name.
      failure(
        await callWrite(
          'edit_note',
          {
            workspaceId: writeWorkspaceId,
            fileId: id,
            version: whole.version,
            text: 'Do not revert the move.',
          },
          era,
        ),
        /Read the note again/,
      );
      failure(
        await callWrite(
          'move_note_to_trash',
          { workspaceId: writeWorkspaceId, fileId: id, version: whole.version },
          era,
        ),
        /Read the note again/,
      );
      assert.deepEqual(await noteState(id), fourth);
      const trashInput = {
        workspaceId: writeWorkspaceId,
        fileId: id,
        version: moved.version,
      };
      const trashed = success(
        await callWrite('move_note_to_trash', trashInput, era),
      );
      assert.equal(trashed.deleted, true);
      const missing = await getFile({
        headers: browserHeaders,
        path: { workspaceId: writeWorkspaceId, fileId: id },
      });
      assert.equal(missing.response?.status, 404);
      const history = await listHistory({
        headers: browserHeaders,
        path: { workspaceId: writeWorkspaceId, fileId: id },
      });
      assert.ok(history.data);
      assert.equal(
        history.data.revisions.length,
        fourth.history.revisions.length + 1,
      );
      const trash = await listDeletedFiles({
        headers: browserHeaders,
        path: { workspaceId: writeWorkspaceId },
      });
      assert.ok(trash.data?.files.some((file) => file.fileId === id));
      failure(
        await callWrite('move_note_to_trash', trashInput, era),
        /not available/,
      );
      const repeatedHistory = await listHistory({
        headers: browserHeaders,
        path: { workspaceId: writeWorkspaceId, fileId: id },
      });
      assert.deepEqual(repeatedHistory.data, history.data);
      const restored = await restoreFile({
        headers: browserHeaders,
        path: { workspaceId: writeWorkspaceId, fileId: id },
        body: {
          mutationId: randomUUID(),
          revisionId: randomUUID(),
          deviceId: 'restore-test',
          clientTime: new Date().toISOString(),
        },
      });
      assert.equal(
        restored.response?.status,
        200,
        JSON.stringify(restored.error),
      );
      assert.equal((await noteState(id)).head.text, wholeInput.text);
    }
  });
  await test('concurrent creates at one path accept only one note', async () => {
    const input = {
      workspaceId: writeWorkspaceId,
      path: 'writes/concurrent.md',
      text: 'One note.',
    };
    const attempts = await Promise.all([
      callWrite('create_note', input),
      callWrite('create_note', input),
    ]);
    const accepted = attempts.filter((result) => result.isError === undefined);
    const refused = attempts.filter((result) => result.isError === true);
    assert.equal(accepted.length, 1);
    assert.equal(refused.length, 1);
    assert.ok(accepted[0] && refused[0]);
    failure(refused[0], /conflicts/);
    const note = success(accepted[0]);
    const state = await noteState(stringField(note, 'fileId'));
    assert.equal(state.head.text, input.text);
    assert.equal(state.history.revisions.length, 1);
  });
  await test('every production write called with a read grant receives the full scope challenge', async () => {
    for (const era of ['modern', 'legacy'])
      for (const tool of mcpTools.filter(
        (entry) => entry.scope === 'notes:write',
      )) {
        const name = tool.definition.name;
        const answer = await app.inject({
          method: 'POST',
          url: '/mcp',
          headers:
            era === 'modern'
              ? modernHeaders('tools/call', read, name)
              : headers(),
          payload:
            era === 'modern'
              ? modern('tools/call', { name, arguments: {} })
              : legacy('tools/call', { name, arguments: {} }),
        });
        assert.equal(answer.statusCode, 403, answer.body);
        assert.deepEqual(json(answer), { error: 'insufficient_scope' });
        assert.match(
          String(answer.headers['www-authenticate']),
          /error="insufficient_scope"/,
        );
        assert.match(
          String(answer.headers['www-authenticate']),
          /scope="notes:read notes:write"/,
        );
        assert.match(
          String(answer.headers['www-authenticate']),
          /resource_metadata="http:\/\/mcp\.notes\.invalid\/\.well-known\/oauth-protected-resource\/mcp"/,
        );
        assert.equal(answer.headers['set-cookie'], undefined);
      }
  });
  await test('a browser edit between the tool read and its write refuses edit, move and Trash without a merge', async (t) => {
    for (const era of ['modern', 'legacy'])
      for (const name of ['edit_note', 'move_note', 'move_note_to_trash'])
        await t.test(`${era} ${name}`, async () => {
          const created = success(
            await callWrite(
              'create_note',
              {
                workspaceId: writeWorkspaceId,
                path: `races/${era}-${name}.md`,
                text: 'Before the race.',
              },
              era,
            ),
          );
          const id = stringField(created, 'fileId');
          const entered = Promise.withResolvers<void>();
          const released = Promise.withResolvers<void>();
          // Hold the real tool after its getFile result. All calls still pass
          // through the real delegated contract pipeline of this test app.
          const racing = await createApp(config, {
            mcpTools: mcpTools.map((tool) =>
              tool.definition.name !== name
                ? tool
                : {
                    ...tool,
                    run: (input, context) =>
                      tool.run(input, {
                        call: async (operation, request) => {
                          const answer = await context.call(operation, request);
                          if (operation === 'getFile') {
                            entered.resolve();
                            await released.promise;
                          }
                          return answer;
                        },
                      }),
                  },
            ),
          });
          let pending: ReturnType<typeof callRead> | undefined;
          try {
            const input = {
              workspaceId: writeWorkspaceId,
              fileId: id,
              version: created.version,
              ...(name === 'edit_note'
                ? { text: 'Tool text.' }
                : name === 'move_note'
                  ? { path: `races/${era}-moved.md` }
                  : {}),
            };
            pending = callRead(name, input, era, write, racing);
            await Promise.race([
              entered.promise,
              pending.then((answer) => {
                throw new Error(
                  `The tool did not hold its read: ${JSON.stringify(answer)}`,
                );
              }),
            ]);
            const browser = await browserEdit(id, 'Browser text.');
            released.resolve();
            failure(await pending, /Read the note again/);
            assert.deepEqual(await noteState(id), browser);
            assert.equal(browser.head.merged, false);
          } finally {
            released.resolve();
            await pending;
            await racing.close();
          }
        });
  });

  await test('MCP writes refuse a head moved after the REST condition and before the commit lock', async (t) => {
    const auth = await createAuth(
      { ...config, mcpOrigin: null },
      { mail: null, sessionAllowed: () => Promise.resolve(false) },
    );
    const adapter = createIdentityAdapter({
      auth: auth.auth,
      identity,
      servedOrigins: config.servedOrigins,
    });
    const coordination = openCoordination(database.runtimeUrl);
    const attempts = {
      count: (key: string, window: number) =>
        coordination.countAttempt(key, window),
      read: (key: string, window: number) =>
        coordination.readAttempt(key, window),
    };
    try {
      for (const era of ['modern', 'legacy'])
        for (const name of ['edit_note', 'move_note', 'move_note_to_trash'])
          await t.test(`${era} ${name}`, { timeout: 15000 }, async () => {
            const created = success(
              await callWrite(
                'create_note',
                {
                  workspaceId: writeWorkspaceId,
                  path: `commit-races/${era}-${name}.md`,
                  text: 'Before the commit race.',
                },
                era,
              ),
            );
            const id = stringField(created, 'fileId');
            const version = stringField(created, 'version');
            const atCommit = Promise.withResolvers<void>();
            const release = Promise.withResolvers<void>();
            let transactions = 0;
            let sawConditionalHead = false;
            let conditionalStatus: number | undefined;
            const heldStore: WorkspaceStore = {
              documents: contentStore.documents,
              transact: async (actor, scope, run, options) => {
                transactions += 1;
                const position = transactions;
                // The tool read, receipt read and REST conditionalHead all
                // finish. Hold the commit before it takes the workspace lock.
                if (position === 4) {
                  assert.equal(sawConditionalHead, true);
                  atCommit.resolve();
                  await release.promise;
                }
                return contentStore.transact(
                  actor,
                  scope,
                  (tx) =>
                    run({
                      ...tx,
                      revision: async (revisionId) => {
                        const head = await tx.revision(revisionId);
                        if (position === 3 && revisionId === version) {
                          assert.equal(head?.revisionId, version);
                          sawConditionalHead = true;
                        }
                        return head;
                      },
                    }),
                  options,
                );
              },
            };
            const handlers = createHandlers(config, undefined, {
              store: identity,
              content: heldStore,
            });
            const operation =
              name === 'move_note_to_trash' ? 'deleteFile' : 'updateFile';
            const handler = handlers[operation];
            assert.ok(handler);
            const heldHandler: NonNullable<typeof handler> = async (
              request,
              reply,
            ) => {
              assert.equal(request.headers['if-match'], `"${version}"`);
              return handler(request, reply);
            };
            const racing: Awaited<ReturnType<typeof createAppWithHandlers>> =
              await createAppWithHandlers(config, {
                handlers: completeTestHandlers({
                  ...handlers,
                  [operation]: heldHandler,
                }),
                identity: adapter.resolver,
                attempts,
                protocols: [
                  stubProtocol,
                  createMcpProtocol({
                    config,
                    identity,
                    attempts,
                    app: () => racing,
                  }),
                ],
                webDist: null,
              });
            racing.addHook('onSend', async (request, reply, payload) => {
              if (request.routeOptions.config.operationId === operation)
                conditionalStatus = reply.statusCode;
              return payload;
            });
            let pending: ReturnType<typeof callRead> | undefined;
            try {
              pending = callRead(
                name,
                {
                  workspaceId: writeWorkspaceId,
                  fileId: id,
                  version,
                  ...(name === 'edit_note'
                    ? { oldText: 'Before', newText: 'Tool text before' }
                    : name === 'move_note'
                      ? { path: `commit-races/${era}-tool-moved.md` }
                      : {}),
                },
                era,
                write,
                racing,
              );
              await Promise.race([
                atCommit.promise,
                pending.then((answer) => {
                  throw new Error(
                    `The MCP write ended before its commit: ${JSON.stringify(answer)}`,
                  );
                }),
              ]);
              assert.equal(transactions, 4);
              assert.equal(sawConditionalHead, true);
              // A rename changes the head without changing the observed text.
              // It exposes the old stale-delete rebase as well as stale edits.
              const competing = await updateFile({
                headers: { ...browserHeaders, 'if-match': `"${version}"` },
                path: { workspaceId: writeWorkspaceId, fileId: id },
                body: {
                  revisionId: randomUUID(),
                  mutationId: randomUUID(),
                  deviceId: 'browser-commit-race',
                  path: `commit-races/${era}-browser-${name}.md`,
                },
              });
              assert.equal(
                competing.response?.status,
                200,
                JSON.stringify(competing.error),
              );
              const before = await noteState(id);
              assert.notEqual(before.head.revisionId, version);
              assert.equal(before.head.text, 'Before the commit race.');
              const stored = () =>
                admin.query(
                  `select
                (select count(*) from revisions where workspace_id = $1) as revisions,
                (select count(*) from contents where workspace_id = $1) as contents,
                (select count(*) from changesets where workspace_id = $1) as changesets,
                (select count(*) from mutation_receipts where workspace_id = $1) as receipts,
                (select count(*) from sync_changes where workspace_id = $1) as changes,
                (select to_jsonb(c) from workspace_cursors c where workspace_id = $1) as cursor,
                (select to_jsonb(u) from workspace_usage u where workspace_id = $1) as usage`,
                  [writeWorkspaceId],
                );
              const storedBefore = await stored();
              release.resolve();
              failure(await pending, /Read the note again/);
              assert.equal(conditionalStatus, 412);
              assert.deepEqual(await noteState(id), before);
              assert.deepEqual(await stored(), storedBefore);
            } finally {
              release.resolve();
              await pending;
              await racing.close();
            }
          });
    } finally {
      await coordination.close();
      await auth.close();
    }
  });

  for (const lockCause of ['manual', 'trial'] as const) {
    await test(`an issued MCP token keeps only the locked-account operation list after ${lockCause} expiry`, async () => {
      const invitation = await createInvitation({
        headers: browserHeaders,
        body: { email: `mcp-locked-${lockCause}@notes.invalid` },
      });
      assert.ok(invitation.data?.link);
      const registered = await registerAccount({
        headers: { origin: config.origin },
        body: {
          invitation: new URL(invitation.data.link).hash.slice(1),
          password: 'locked-account-safe-password',
        },
      });
      assert.equal(
        registered.response?.status,
        201,
        JSON.stringify(registered.error),
      );
      const lockedCookie = registered.response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const account = await getAccount({ headers: { cookie: lockedCookie } });
      assert.ok(account.data);
      const owned = await listWorkspaces({ headers: { cookie: lockedCookie } });
      const lockedWorkspace = owned.data?.workspaces[0]?.workspaceId;
      assert.ok(lockedWorkspace);
      const lockedToken = await token('notes:read notes:write', lockedCookie);
      const lockedFile = randomUUID();
      const lockedVersion = randomUUID();
      const madeNote = await createFile({
        headers: { cookie: lockedCookie, origin: config.origin },
        path: { workspaceId: lockedWorkspace },
        body: {
          fileId: lockedFile,
          revisionId: lockedVersion,
          mutationId: randomUUID(),
          deviceId: 'locked-test',
          path: 'Locked note.md',
          document: firstSave('needleword'),
        },
      });
      assert.equal(
        madeNote.response?.status,
        201,
        JSON.stringify(madeNote.error),
      );
      success(
        await callRead(
          'read_note',
          { workspaceId: lockedWorkspace, fileId: lockedFile },
          'modern',
          lockedToken,
        ),
      );
      protectedValues.push(lockedCookie, 'locked-account-safe-password');
      await admin.query(
        lockCause === 'manual'
          ? "update accounts set standing='locked' where id=$1"
          : 'update accounts set trial_ends_at=statement_timestamp(), trial_ended_at=null where id=$1',
        [account.data.accountId],
      );
      try {
        success(await callRead('list_workspaces', {}, 'modern', lockedToken));
        for (const [name, input] of [
          [
            'create_note',
            {
              workspaceId: lockedWorkspace,
              path: 'Refused.md',
              text: 'Refused',
            },
          ],
          [
            'edit_note',
            {
              workspaceId: lockedWorkspace,
              fileId: lockedFile,
              version: lockedVersion,
              text: 'Refused',
            },
          ],
          [
            'move_note',
            {
              workspaceId: lockedWorkspace,
              fileId: lockedFile,
              version: lockedVersion,
              path: 'Moved.md',
            },
          ],
          [
            'move_note_to_trash',
            {
              workspaceId: lockedWorkspace,
              fileId: lockedFile,
              version: lockedVersion,
            },
          ],
          [
            'append_to_note',
            {
              workspaceId: lockedWorkspace,
              fileId: lockedFile,
              version: lockedVersion,
              text: 'Refused',
            },
          ],
          [
            'patch_note',
            {
              workspaceId: lockedWorkspace,
              fileId: lockedFile,
              version: lockedVersion,
              changes: [{ operation: 'insert_at_end', text: 'Refused' }],
            },
          ],
          ['list_notes', { workspaceId: lockedWorkspace }],
          ['read_note', { workspaceId: lockedWorkspace, fileId: lockedFile }],
          [
            'read_note',
            {
              workspaceId: lockedWorkspace,
              fileId: lockedFile,
              version: lockedVersion,
            },
          ],
          [
            'search_notes',
            { workspaceId: lockedWorkspace, query: 'needleword' },
          ],
          ['search_notes', { query: 'needleword' }],
          [
            'list_backlinks',
            { workspaceId: lockedWorkspace, fileId: lockedFile },
          ],
          [
            'list_note_history',
            { workspaceId: lockedWorkspace, fileId: lockedFile },
          ],
        ] as const) {
          const result = await callRead(name, input, 'modern', lockedToken);
          assert.equal(result.isError, true, JSON.stringify(result));
          assert.equal(result.structuredContent, undefined);
          assert.match(JSON.stringify(result.content), /account is locked/);
        }
      } finally {
        await admin.query(
          "update accounts set standing='active', trial_ended_at=clock_timestamp() where id=$1",
          [account.data.accountId],
        );
      }
    });
  }

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
  await contentStore.close();
  await admin.close();
  await database.destroy();
  await rm(root, { recursive: true, force: true });
}
