/** Served OAuth policy, identity isolation, and replica races (record 0226). */
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { inspect } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configureClient,
  getOAuthMetadata,
  registerOAuthClient,
  exchangeOAuthToken,
  giveOAuthConsent,
  signInWithPassword,
} from '@notesapp/api-client';
import {
  bootstrapOwner,
  createApp,
  createAuth,
  loadServerConfig,
  recoverAccount,
} from '@notesapp/server';
import {
  openPool,
  resolveOAuthToken,
  expireOAuthClients,
  oauthRequestTransaction,
} from '@notesapp/storage-server';
import { maxOAuthClients, lockedAccountKeeps } from '@notesapp/core';
import {
  createDisposableDatabase,
  openSession,
  seedWorkspace,
} from './support/database.ts';
import { testEnvironment } from './support/server.ts';

const consoleLines: string[] = [];
const logLines: string[] = [];
const protectedValues = new Set<string>();
const digest = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex');
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const resource = 'https://mcp.notes.invalid/mcp';
const issuer = 'http://127.0.0.1/api/auth';
const callback = 'https://client.example/callback';
const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-oauth-'));
const config = loadServerConfig({
  ...testEnvironment(storageRoot),
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_MCP_ORIGIN: 'https://mcp.notes.invalid',
  NOTESAPP_LOG_LEVEL: 'warn',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_RATE_LIMIT_MAX: '2000',
  NOTESAPP_BREACH_CHECK: 'off',
});
await bootstrapOwner({
  config,
  email: 'oauth@notes.invalid',
  name: 'OAuth owner',
  password: 'oauth-owner-password-safe',
});
const admin = await openSession(database.migrationUrl);
const identity = await openSession(database.authUrl);
const runtime = openPool({ connectionString: database.runtimeUrl });
const authPool = openPool({ connectionString: database.authUrl });
let fetches = 0;
let metadataMode: 'valid' | 'redirect' | 'large' | 'jwt' = 'valid';
const app = await createApp(config, {
  logStream: {
    write: (line) => {
      logLines.push(line);
    },
  },
  oauthFetch: async (input) => {
    fetches += 1;
    // A fetch must not run inside an OAuth pair transaction on either replica.
    const locks = await admin.query<{
      count: number;
    }>(`select count(*)::int as count from pg_locks
    where locktype = 'advisory' and granted and objsubid = 2
      and classid::bigint = (hashtext('notesapp:oauth-pair')::bigint & 4294967295)`);
    assert.equal(locks[0]?.count, 0, 'client metadata fetch under a pair lock');
    if (metadataMode === 'redirect')
      return new Response(null, {
        status: 302,
        headers: { location: 'https://other.example/' },
      });
    if (metadataMode === 'large')
      return new Response('x'.repeat(100_000), {
        headers: { 'content-type': 'application/json' },
      });
    return new Response(
      JSON.stringify({
        client_id:
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        client_name: 'Claimed client',
        redirect_uris: [callback],
        token_endpoint_auth_method:
          metadataMode === 'jwt' ? 'private_key_jwt' : 'none',
      }),
      {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
      },
    );
  },
});
const replica = await createApp(config, {
  logStream: {
    write: (line) => {
      logLines.push(line);
    },
  },
  oauthFetch: () => {
    throw new Error('A token replica must not fetch client metadata.');
  },
});
await app.listen({ host: '127.0.0.1', port: 0 });
const address = app.server.address();
assert.ok(address && typeof address !== 'string');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
const login = await signInWithPassword({
  body: { email: 'oauth@notes.invalid', password: 'oauth-owner-password-safe' },
  headers: { origin: config.origin },
});
assert.ok(login.response);
let cookie = login.response.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
assert.ok(cookie.includes('notesapp_session'));
const user = (
  await admin.query<{ id: string }>(
    "select id from auth_user where email = 'oauth@notes.invalid'",
  )
)[0];
assert.ok(user);
const userId = user.id;
for (const value of [
  verifier,
  challenge,
  resource,
  callback,
  userId,
  'oauth-state',
  'DCR client',
  config.authSecret,
  'oauth-owner-password-safe',
  'oauth-recovered-password-safe',
  '{not a JSON value',
])
  protectedValues.add(value);
await identity.query(
  "insert into auth_verification(id,identifier,value,expires_at,created_at,updated_at) values($1,$2,$3,now()+interval '1 hour',now(),now())",
  [randomUUID(), randomUUID(), '{not a JSON value'],
);

function body(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object');
  return Object.fromEntries(Object.entries(value));
}
async function register(): Promise<string> {
  const registered = await registerOAuthClient({
    body: {
      client_name: 'DCR client',
      redirect_uris: [callback],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  });
  assert.equal(
    registered.response?.status,
    201,
    JSON.stringify(registered.error),
  );
  assert.ok(registered.data);
  protectedValues.add(registered.data.client_id);
  return registered.data.client_id;
}
function authorization(
  clientId: string,
  changes: Record<string, string> = {},
): string {
  return `/api/auth/oauth2/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callback,
    scope: 'notes:read notes:write offline_access',
    resource,
    state: 'oauth-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...changes,
  })}`;
}
async function code(
  clientId: string,
  accepted = 'notes:read offline_access',
  forceConsent = false,
): Promise<string> {
  const answer = await app.inject({
    method: 'GET',
    url: authorization(clientId, forceConsent ? { prompt: 'consent' } : {}),
    headers: { cookie },
  });
  assert.equal(answer.statusCode, 302, answer.body);
  const location = String(answer.headers.location);
  assert.ok(
    location.startsWith('/oauth/consent?') ||
      location.startsWith('http://127.0.0.1/oauth/consent?'),
    location,
  );
  const query = new URL(location, config.origin).search.slice(1);
  const consent = await giveOAuthConsent({
    headers: { cookie, origin: config.origin },
    body: { accept: true, oauth_query: query, scope: accepted },
  });
  assert.equal(consent.response?.status, 200, JSON.stringify(consent.error));
  const redirect = new URL(consent.data?.url ?? '');
  assert.equal(redirect.origin, new URL(callback).origin);
  assert.equal(redirect.searchParams.get('iss'), issuer);
  assert.equal(redirect.searchParams.get('state'), 'oauth-state');
  const value = redirect.searchParams.get('code');
  assert.ok(value);
  protectedValues.add(value);
  protectedValues.add(digest(value));
  return value;
}
async function tokens(clientId: string) {
  const authorizationCode = await code(clientId);
  const exchanged = await exchangeOAuthToken({
    body: {
      grant_type: 'authorization_code',
      client_id: clientId,
      code: authorizationCode,
      code_verifier: verifier,
      redirect_uri: callback,
      resource,
    },
  });
  assert.equal(
    exchanged.response?.status,
    200,
    JSON.stringify(exchanged.error),
  );
  assert.ok(exchanged.data?.refresh_token);
  assert.equal(exchanged.data.scope, 'notes:read offline_access');
  assert.equal(exchanged.data.expires_in, 3600);
  assert.doesNotMatch(exchanged.data.access_token, /\./);
  for (const value of [
    exchanged.data.access_token,
    exchanged.data.refresh_token,
  ]) {
    protectedValues.add(value);
    protectedValues.add(digest(value));
  }
  return {
    access: exchanged.data.access_token,
    refresh: exchanged.data.refresh_token,
    code: authorizationCode,
  };
}
async function refresh(clientId: string, secret: string, target = app) {
  return target.inject({
    method: 'POST',
    url: '/api/auth/oauth2/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: secret,
      resource,
    }).toString(),
  });
}
async function lockedWrite(statement: string, values: unknown[] = []) {
  await identity.query('begin');
  try {
    const clients = await identity.query<{ client_id: string }>(
      'select client_id from auth_oauth_client order by client_id',
    );
    for (const client of clients)
      await identity.query('select notesapp_oauth_lock_pair($1,$2)', [
        client.client_id,
        userId,
      ]);
    await identity.query(statement, values);
    await identity.query('commit');
  } catch (error) {
    await identity.query('rollback');
    throw error;
  }
}

const consoleMocks = (['error', 'warn', 'log', 'info', 'debug'] as const).map(
  (name) =>
    mock.method(console, name, (...values: unknown[]) => {
      consoleLines.push(
        inspect(values, {
          depth: 10,
          maxArrayLength: null,
          maxStringLength: null,
        }),
      );
    }),
);

try {
  await test('discovery names the exact issuer and the two grants', async () => {
    const metadata = await getOAuthMetadata();
    assert.equal(
      metadata.response?.status,
      200,
      JSON.stringify(metadata.error),
    );
    assert.equal(metadata.data?.issuer, issuer);
    assert.deepEqual(metadata.data?.grant_types_supported, [
      'authorization_code',
      'refresh_token',
    ]);
    assert.deepEqual(metadata.data?.code_challenge_methods_supported, ['S256']);
    assert.equal(metadata.data?.client_id_metadata_document_supported, true);
    assert.deepEqual(metadata.data?.scopes_supported, [
      'notes:read',
      'notes:write',
      'offline_access',
    ]);
    assert.deepEqual(metadata.data?.response_types_supported, ['code']);
    assert.equal(
      metadata.data?.authorization_response_iss_parameter_supported,
      true,
    );
    assert.deepEqual(metadata.data?.token_endpoint_auth_methods_supported, [
      'none',
      'client_secret_basic',
      'client_secret_post',
    ]);
    const fields = body(metadata.data);
    for (const [name, value] of Object.entries(fields)) {
      if (name.endsWith('_endpoint') && typeof value === 'string') {
        const path = new URL(value).pathname;
        const result = await app.inject({
          method: name === 'authorization_endpoint' ? 'GET' : 'POST',
          url: path,
        });
        assert.notEqual(result.statusCode, 404, name);
      }
    }
    for (const name of [
      'introspection_endpoint',
      'introspection_endpoint_auth_methods_supported',
      'userinfo_endpoint',
      'jwks_uri',
      'end_session_endpoint',
    ])
      assert.equal(fields[name], undefined, name);
    for (const url of [
      '/.well-known/oauth-authorization-server',
      '/api/auth/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
      '/api/auth/.well-known/openid-configuration',
    ]) {
      const answer = await app.inject({ url });
      assert.equal(answer.statusCode, 404, url);
    }
  });
  const clientId = await register();
  await test('DCR does not expose administration or a different grant', async () => {
    for (const grant of [
      'client_credentials',
      'password',
      'implicit',
      'urn:ietf:params:oauth:grant-type:device_code',
      'urn:ietf:params:oauth:grant-type:token-exchange',
    ]) {
      const answer = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `grant_type=${encodeURIComponent(grant)}`,
      });
      assert.equal(answer.statusCode, 400);
      assert.deepEqual(answer.json(), { error: 'unsupported_grant_type' });
      assert.equal(answer.headers['cache-control'], 'no-store');
    }
    for (const url of [
      '/api/auth/oauth2/create-client',
      '/api/auth/oauth2/delete-client',
      '/api/auth/oauth2/introspect',
    ])
      assert.equal(
        (await app.inject({ method: 'POST', url, payload: {} })).statusCode,
        404,
      );
  });
  await test('PKCE S256 and the exact resource are required before consent', async () => {
    for (const changes of [
      { code_challenge_method: 'plain' },
      { code_challenge: '' },
      { resource: 'https://other.example/mcp' },
      { scope: 'openid notes:read' },
    ]) {
      const answer = await app.inject({
        url: authorization(clientId, changes),
        headers: { cookie },
      });
      assert.equal(answer.statusCode, 400, answer.body);
      assert.ok('error' in answer.json());
    }
    const authorizationCode = await code(clientId);
    const refused = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: authorizationCode,
        code_verifier: 'b'.repeat(43),
        redirect_uri: callback,
        resource,
      }).toString(),
    });
    assert.equal(refused.statusCode, 400, refused.body);
    assert.equal(body(refused.json()).error, 'invalid_grant');
    assert.equal(refused.json().error_description, undefined);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: authorizationCode,
        redirect_uri: callback,
        resource,
      }).toString(),
    });
    assert.equal(missing.statusCode, 400, missing.body);
    assert.equal(missing.json().error, 'invalid_request');
    assert.equal(
      missing.json().error_description,
      'Either code_verifier or client_secret is required',
    );
  });
  await test('the generated SDK keeps a served OAuth refusal', async () => {
    const refused = await exchangeOAuthToken({
      body: {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: 'unknown-refresh',
        resource,
      },
    });
    assert.equal(refused.response?.status, 400);
    assert.equal(refused.error?.error, 'invalid_grant');
    assert.equal(body(refused.error).code, undefined);
  });
  await test('form errors keep OAuth format while identity errors keep problem details', async () => {
    for (const payload of [
      'not-json',
      'grant_type=refresh_token&grant_type=authorization_code',
      'grant_type=refresh_token&extra=1',
    ]) {
      const refused = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload,
      });
      assert.equal(refused.statusCode, 400, refused.body);
      assert.equal(refused.json().error, 'invalid_request');
      assert.equal(refused.json().code, undefined);
    }
    const identityError = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: {},
    });
    assert.match(
      String(identityError.headers['content-type']),
      /^application\/problem\+json/,
    );
  });
  await test('consent denies a request and can reduce write to read', async () => {
    const denied = await app.inject({
      url: authorization(clientId),
      headers: { cookie },
    });
    const query = new URL(
      String(denied.headers.location),
      config.origin,
    ).search.slice(1);
    const answer = await giveOAuthConsent({
      headers: { cookie, origin: config.origin },
      body: { accept: false, oauth_query: query },
    });
    assert.equal(answer.response?.status, 200);
    const redirect = new URL(answer.data?.url ?? '');
    assert.equal(redirect.searchParams.get('error'), 'access_denied');
    assert.equal(redirect.searchParams.get('iss'), issuer);
    const granted = await tokens(clientId);
    assert.deepEqual(
      (await resolveOAuthToken(runtime, digest(granted.access), resource))
        ?.scopes,
      ['notes:read', 'offline_access'],
    );
    assert.equal(
      await resolveOAuthToken(
        runtime,
        digest(granted.access),
        'https://other.example/mcp',
      ),
      null,
    );
    const lives = await identity.query<{
      access_seconds: number;
      refresh_seconds: number;
    }>(
      `select extract(epoch from a.expires_at-a.created_at)::int as access_seconds,
      extract(epoch from r.expires_at-r.created_at)::int as refresh_seconds from auth_oauth_access_token a
      join auth_oauth_refresh_token r on r.id=a.refresh_id where a.token=$1`,
      [digest(granted.access)],
    );
    assert.equal(lives[0]?.access_seconds, 3600);
    assert.equal(lives[0]?.refresh_seconds, 30 * 24 * 60 * 60);
    const publicClient = await app.inject({
      url: `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
      headers: { cookie },
    });
    assert.equal(publicClient.statusCode, 200, publicClient.body);
    assert.equal(publicClient.json().client_secret, undefined);
    const stored = await identity.query<{ token: string }>(
      'select token from auth_oauth_access_token where token = $1',
      [digest(granted.access)],
    );
    assert.equal(stored[0]?.token, digest(granted.access));
  });
  await test('one consent identity survives step-up and a second authorization', async () => {
    const id = await register();
    const first = await tokens(id);
    const original = await resolveOAuthToken(
      runtime,
      digest(first.access),
      resource,
    );
    assert.ok(original);
    await code(id, 'notes:read notes:write offline_access');
    await code(id, 'notes:read offline_access', true);
    const rows = await identity.query<{ id: string; scopes: string[] }>(
      'select id,scopes from auth_oauth_consent where client_id=$1 and user_id=$2',
      [id, userId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, original.grantId);
    assert.deepEqual(rows[0]?.scopes, ['notes:read', 'offline_access']);
    assert.equal(
      (await resolveOAuthToken(runtime, digest(first.access), resource))
        ?.grantId,
      original.grantId,
    );
  });
  await test('direct consent deletion revokes tokens and pending codes and cannot revive old tokens', async () => {
    const id = await register();
    const granted = await tokens(id);
    const pending = await code(id);
    await identity.query(
      'delete from auth_oauth_consent where client_id=$1 and user_id=$2',
      [id, userId],
    );
    assert.equal(
      await resolveOAuthToken(runtime, digest(granted.access), resource),
      null,
    );
    assert.equal((await refresh(id, granted.refresh)).statusCode, 400);
    assert.equal(
      (
        await identity.query(
          'select id from auth_verification where identifier=$1',
          [digest(pending)],
        )
      ).length,
      0,
    );
    await tokens(id);
    assert.equal(
      await resolveOAuthToken(runtime, digest(granted.access), resource),
      null,
    );
    assert.equal((await refresh(id, granted.refresh)).statusCode, 400);
  });
  await test('only an authenticated unexpired replay removes the consent', async () => {
    const id = await register();
    const granted = await tokens(id);
    const rotated = await refresh(id, granted.refresh);
    assert.equal(rotated.statusCode, 200);
    const consent = async () =>
      (
        await identity.query(
          'select id from auth_oauth_consent where client_id=$1',
          [id],
        )
      ).length;
    const other = await register();
    for (const [presented, token] of [
      [other, granted.refresh],
      [id, 'unknown-refresh'],
    ]) {
      assert.equal(
        (await refresh(presented ?? '', token ?? '')).statusCode,
        400,
      );
      assert.equal(await consent(), 1);
    }
    const badAuth = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: id,
        client_secret: 'bad-secret',
        refresh_token: granted.refresh,
        resource,
      }).toString(),
    });
    assert.equal(badAuth.json().error, 'invalid_client');
    assert.equal(await consent(), 1);
    const replayed = await refresh(id, granted.refresh);
    assert.equal(replayed.json().error, 'invalid_grant');
    assert.equal(await consent(), 0);
    const next = await app.inject({
      url: authorization(id),
      headers: { cookie },
    });
    assert.match(String(next.headers.location), /oauth\/consent\?/);
  });
  await test('an ordinarily revoked refresh keeps the consent and other live credentials', async () => {
    const id = await register();
    const other = await register();
    const revoked = await tokens(id);
    const retained = await tokens(id);
    const answer = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/revoke',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        token: revoked.refresh,
        client_id: id,
      }).toString(),
    });
    assert.equal(answer.statusCode, 200, answer.body);
    const snapshot = async () => ({
      consent: await identity.query(
        'select * from auth_oauth_consent where client_id=$1',
        [id],
      ),
      access: await identity.query(
        'select * from auth_oauth_access_token where client_id=$1 order by id',
        [id],
      ),
      refresh: await identity.query(
        'select * from auth_oauth_refresh_token where client_id=$1 order by id',
        [id],
      ),
    });
    const before = await snapshot();
    const state = await identity.query<{
      rotated_at: Date | null;
      revoked: Date | null;
    }>(
      'select rotated_at,revoked from auth_oauth_refresh_token where token=$1',
      [digest(revoked.refresh)],
    );
    assert.equal(state[0]?.rotated_at, null);
    assert.ok(state[0]?.revoked);
    const badAuth = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: id,
        client_secret: 'bad-secret',
        refresh_token: revoked.refresh,
        resource,
      }).toString(),
    });
    assert.equal(badAuth.json().error, 'invalid_client');
    assert.deepEqual(await snapshot(), before);
    const wrongClient = await refresh(other, revoked.refresh);
    assert.equal(wrongClient.statusCode, 400, wrongClient.body);
    assert.equal(wrongClient.json().error, 'invalid_grant');
    assert.deepEqual(await snapshot(), before);
    const refused = await refresh(id, revoked.refresh);
    assert.equal(refused.statusCode, 400, refused.body);
    assert.equal(refused.json().error, 'invalid_grant');
    assert.deepEqual(await snapshot(), before);
    assert.ok(
      await resolveOAuthToken(runtime, digest(retained.access), resource),
    );
    const renewed = await refresh(id, retained.refresh, replica);
    assert.equal(renewed.statusCode, 200, renewed.body);
    assert.equal(
      (
        await identity.query(
          'select id from auth_oauth_consent where client_id=$1',
          [id],
        )
      ).length,
      1,
    );
  });
  await test('ordinary revoked refresh attempts persist across replicas and credential rollback', async () => {
    const id = await register();
    const revoked = await tokens(id);
    const retained = await tokens(id);
    const revocation = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/revoke',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        token: revoked.refresh,
        client_id: id,
      }).toString(),
    });
    assert.equal(revocation.statusCode, 200, revocation.body);
    const snapshot = async () => ({
      consent: await identity.query(
        'select * from auth_oauth_consent where client_id=$1',
        [id],
      ),
      access: await identity.query(
        'select * from auth_oauth_access_token where client_id=$1 order by id',
        [id],
      ),
      refresh: await identity.query(
        'select * from auth_oauth_refresh_token where client_id=$1 order by id',
        [id],
      ),
    });
    const before = await snapshot();
    const limitedConfig = {
      ...config,
      rateLimit: { ...config.rateLimit, max: 2 },
    };
    const first = await createApp(limitedConfig);
    const second = await createApp(limitedConfig);
    try {
      for (const [n, target] of [first, second, first, second].entries()) {
        const answer = await target.inject({
          method: 'POST',
          url: '/api/auth/oauth2/token',
          remoteAddress: '198.51.100.47',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          payload: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: id,
            refresh_token: revoked.refresh,
            resource,
            ...(n === 3 ? {} : { client_secret: 'bad-secret' }),
          }).toString(),
        });
        if (n < 2) {
          assert.equal(answer.json().error, 'invalid_client', answer.body);
        } else {
          assert.equal(answer.statusCode, 429, answer.body);
          assert.match(
            String(answer.headers['content-type']),
            /^application\/json/,
          );
          assert.deepEqual(answer.json(), { error: 'temporarily_unavailable' });
        }
        assert.deepEqual(await snapshot(), before);
      }
      const counted = await admin.query<{ count: number }>(
        'select count from attempt_counters where key=$1',
        ['198.51.100.47|/oauth2/token'],
      );
      assert.equal(counted[0]?.count, 4);
      const renewed = await refresh(id, retained.refresh, replica);
      assert.equal(renewed.statusCode, 200, renewed.body);
      assert.equal(
        (
          await identity.query(
            'select id from auth_oauth_consent where client_id=$1',
            [id],
          )
        ).length,
        1,
      );
    } finally {
      await first.close();
      await second.close();
    }
  });
  await test('mixed grant credentials refuse pending and redeemed codes without a write', async () => {
    for (const rotated of [false, true]) {
      const id = await register();
      const original = await tokens(id);
      if (rotated) {
        const renewed = await refresh(id, original.refresh);
        assert.equal(renewed.statusCode, 200, renewed.body);
      } else {
        const revoked = await app.inject({
          method: 'POST',
          url: '/api/auth/oauth2/revoke',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          payload: new URLSearchParams({
            token: original.refresh,
            client_id: id,
          }).toString(),
        });
        assert.equal(revoked.statusCode, 200, revoked.body);
      }
      const retained = await tokens(id);
      const pending = await code(id);
      const snapshot = async () => ({
        consent: await identity.query(
          'select * from auth_oauth_consent where client_id=$1',
          [id],
        ),
        access: await identity.query(
          'select * from auth_oauth_access_token where client_id=$1 order by id',
          [id],
        ),
        refresh: await identity.query(
          'select * from auth_oauth_refresh_token where client_id=$1 order by id',
          [id],
        ),
        codes: await identity.query(
          'select * from auth_verification where identifier=any($1::text[]) order by id',
          [[digest(pending), digest(retained.code)]],
        ),
      });
      const before = await snapshot();
      assert.equal(before.codes.length, 1);
      for (const extra of [pending, retained.code])
        for (const grant of ['refresh_token', 'authorization_code']) {
          const answer = await app.inject({
            method: 'POST',
            url: '/api/auth/oauth2/token',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            payload: new URLSearchParams({
              grant_type: grant,
              client_id: id,
              refresh_token: original.refresh,
              code: extra,
              code_verifier: verifier,
              redirect_uri: callback,
              resource,
            }).toString(),
          });
          assert.equal(answer.statusCode, 400, answer.body);
          assert.match(
            String(answer.headers['content-type']),
            /^application\/json/,
          );
          assert.deepEqual(answer.json(), { error: 'invalid_request' });
          assert.deepEqual(await snapshot(), before);
        }
      const plain = await refresh(id, original.refresh);
      assert.equal(plain.json().error, 'invalid_grant');
      if (rotated) {
        assert.equal(
          (
            await identity.query(
              'select id from auth_oauth_consent where client_id=$1',
              [id],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await identity.query(
              'select id from auth_verification where identifier=$1',
              [digest(pending)],
            )
          ).length,
          0,
        );
        assert.equal(
          await resolveOAuthToken(runtime, digest(retained.access), resource),
          null,
        );
      } else {
        assert.deepEqual(await snapshot(), before);
        assert.equal((await refresh(id, retained.refresh)).statusCode, 200);
      }
    }
  });
  await test('expired consumed and unconsumed refresh tokens keep the consent', async () => {
    for (const consumed of [false, true]) {
      const id = await register();
      const granted = await tokens(id);
      if (consumed)
        assert.equal((await refresh(id, granted.refresh)).statusCode, 200);
      await lockedWrite(
        "update auth_oauth_refresh_token set expires_at=now()-interval '1 second' where token=$1",
        [digest(granted.refresh)],
      );
      const refused = await refresh(id, granted.refresh);
      assert.equal(refused.json().error, 'invalid_grant');
      assert.equal(
        (
          await identity.query(
            'select id from auth_oauth_consent where client_id=$1',
            [id],
          )
        ).length,
        1,
      );
    }
  });
  await test('registration refuses assertion authentication through DCR and CIMD', async () => {
    const dcr = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/register',
      payload: {
        redirect_uris: [callback],
        token_endpoint_auth_method: 'private_key_jwt',
      },
    });
    assert.equal(dcr.statusCode, 400);
    assert.equal(dcr.json().error, 'invalid_client_metadata');
    metadataMode = 'jwt';
    try {
      const cimd = await app.inject({
        url: authorization('https://jwt.example/client.json'),
        headers: { cookie },
      });
      assert.equal(cimd.statusCode, 400);
      assert.equal(
        (
          await identity.query(
            'select id from auth_oauth_client where client_id=$1',
            ['https://jwt.example/client.json'],
          )
        ).length,
        0,
      );
    } finally {
      metadataMode = 'valid';
    }
  });
  await test('CIMD uses the MCP profile and refuses redirects and large bodies', async () => {
    for (const mode of ['redirect', 'large'] as const) {
      metadataMode = mode;
      const refused = await app.inject({
        url: authorization(`https://${mode}.example/client.json`),
        headers: { cookie },
      });
      assert.equal(refused.statusCode, 400, refused.body);
    }
    metadataMode = 'valid';
    const granted = await tokens('https://cimd.example/client.json');
    const before = fetches;
    const rotated = await refresh(
      'https://cimd.example/client.json',
      granted.refresh,
      replica,
    );
    assert.equal(rotated.statusCode, 200, rotated.body);
    assert.equal(fetches, before, 'a token request performs no CIMD fetch');
    const stored = await identity.query<{ client_discovery_id: string }>(
      'select client_discovery_id from auth_oauth_client where client_id = $1',
      ['https://cimd.example/client.json'],
    );
    assert.equal(stored[0]?.client_discovery_id, 'cimd');
    const owner = await identity.query<{
      user_id: string | null;
      reference_id: string | null;
    }>(
      'select user_id,reference_id from auth_oauth_client where client_id=$1',
      ['https://cimd.example/client.json'],
    );
    assert.equal(owner[0]?.user_id, null);
    assert.equal(owner[0]?.reference_id, null);
    const privateClient = await app.inject({
      url: authorization('https://127.0.0.1/client.json'),
      headers: { cookie },
    });
    assert.equal(privateClient.statusCode, 400);
  });
  await test('DCR stays unowned with a cookie and removing its maker keeps another account grant', async () => {
    const accountId = randomUUID();
    await seedWorkspace(database, randomUUID(), [{ accountId, role: 'owner' }]);
    const fixture = createAuth(
      config,
      { mail: null, sessionAllowed: () => Promise.resolve(false) },
      authPool,
    );
    const context = await fixture.auth.$context;
    const creator = await context.internalAdapter.createUser(
      {
        name: 'Registry maker',
        email: 'registry-maker@notes.invalid',
        emailVerified: true,
      },
      { method: 'email-password' },
    );
    await context.internalAdapter.createAccount({
      providerId: 'credential',
      accountId: creator.id,
      userId: creator.id,
      password: await context.password.hash('registry-maker-password-safe'),
    });
    await admin.query(
      'insert into account_identities(auth_user_id,account_id) values($1,$2)',
      [creator.id, accountId],
    );
    await fixture.close();
    protectedValues.add(creator.id);
    protectedValues.add('registry-maker-password-safe');
    const signedIn = await signInWithPassword({
      body: {
        email: 'registry-maker@notes.invalid',
        password: 'registry-maker-password-safe',
      },
      headers: { origin: config.origin },
    });
    assert.equal(
      signedIn.response?.status,
      200,
      JSON.stringify(signedIn.error),
    );
    assert.ok(signedIn.response);
    const creatorCookie = signedIn.response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const registered = await registerOAuthClient({
      headers: { cookie: creatorCookie, origin: config.origin },
      body: {
        client_name: 'Shared client',
        redirect_uris: [callback],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
      },
    });
    assert.equal(
      registered.response?.status,
      201,
      JSON.stringify(registered.error),
    );
    assert.ok(registered.data);
    const id = registered.data.client_id;
    protectedValues.add(id);
    const owner = await identity.query<{
      user_id: string | null;
      reference_id: string | null;
    }>(
      'select user_id,reference_id from auth_oauth_client where client_id=$1',
      [id],
    );
    assert.equal(owner[0]?.user_id, null);
    assert.equal(owner[0]?.reference_id, null);
    for (const [field, value] of [
      ['user_id', creator.id],
      ['reference_id', 'owned-reference'],
    ]) {
      const refused = await identity.failure(
        `update auth_oauth_client set ${field}=$1 where client_id=$2`,
        [value, id],
      );
      assert.equal(refused.code, '23514');
    }
    const wrongHeader = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/register',
      headers: { authorization: 'Bearer unused-initial-token' },
      payload: { redirect_uris: [callback] },
    });
    assert.equal(wrongHeader.statusCode, 400);
    assert.equal(wrongHeader.json().error, 'invalid_request');
    const originalCookie = cookie;
    let creatorTokens: Awaited<ReturnType<typeof tokens>>;
    try {
      cookie = creatorCookie;
      creatorTokens = await tokens(id);
    } finally {
      cookie = originalCookie;
    }
    const retained = await tokens(id);
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/accounts/${accountId}`,
      headers: { cookie, origin: config.origin },
    });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal(
      await resolveOAuthToken(runtime, digest(creatorTokens.access), resource),
      null,
    );
    assert.equal((await refresh(id, creatorTokens.refresh)).statusCode, 400);
    assert.ok(
      await resolveOAuthToken(runtime, digest(retained.access), resource),
    );
    assert.equal(
      (await refresh(id, retained.refresh, replica)).statusCode,
      200,
    );
    assert.equal(
      (
        await identity.query(
          'select id from auth_oauth_client where client_id=$1',
          [id],
        )
      ).length,
      1,
    );
  });
  await test('two replicas serialize refresh rotation and old-token reuse revokes all tokens', async () => {
    const granted = await tokens(clientId);
    const first = await refresh(clientId, granted.refresh);
    assert.equal(first.statusCode, 200, first.body);
    const current = body(first.json()).refresh_token;
    assert.equal(typeof current, 'string');
    if (typeof current !== 'string') throw new Error('No refresh token.');
    const results = await Promise.all([
      refresh(clientId, granted.refresh),
      refresh(clientId, current, replica),
    ]);
    assert.ok(results.some((answer) => answer.statusCode === 400));
    assert.equal(
      await resolveOAuthToken(runtime, digest(granted.access), resource),
      null,
    );
    const live = await identity.query<{ count: number }>(
      'select count(*)::int as count from auth_oauth_access_token where client_id = $1',
      [clientId],
    );
    assert.equal(live[0]?.count, 0);
    assert.equal((await refresh(clientId, current)).statusCode, 400);
  });
  await test('password change racing refresh leaves no valid token and no deadlock', async () => {
    const granted = await tokens(clientId);
    await Promise.all([
      refresh(clientId, granted.refresh, replica),
      admin.query(
        'update auth_account set password = password || $2 where user_id = $1',
        [userId, '-changed'],
      ),
    ]);
    assert.equal(
      await resolveOAuthToken(runtime, digest(granted.access), resource),
      null,
    );
    assert.equal((await refresh(clientId, granted.refresh)).statusCode, 400);
    const live = await identity.query<{ count: number }>(
      'select count(*)::int as count from auth_oauth_access_token where user_id = $1',
      [userId],
    );
    assert.equal(live[0]?.count, 0);
  });
  await admin.query(
    "insert into accounts(id,installation_role,limit_bytes) values($1,'administrator',10000000)",
    [randomUUID()],
  );
  await test('a locked account refuses new consent and codes but refreshes an existing grant', async () => {
    const id = await register();
    const granted = await tokens(id);
    const request = await app.inject({
      url: authorization(id),
      headers: { cookie },
    });
    const query = new URL(
      String(request.headers.location),
      config.origin,
    ).search.slice(1);
    await admin.query(
      "update accounts set standing='locked',installation_role='member' where id=(select account_id from account_identities where auth_user_id=$1)",
      [userId],
    );
    try {
      const refused = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/consent',
        headers: { cookie, origin: config.origin },
        payload: { accept: true, oauth_query: query },
      });
      assert.equal(refused.statusCode, 403, refused.body);
      assert.equal(refused.json().error, 'access_denied');
      const rotated = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/token',
        headers: {
          cookie,
          origin: config.origin,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: id,
          refresh_token: granted.refresh,
          resource,
        }).toString(),
      });
      assert.equal(rotated.statusCode, 200, rotated.body);
      const access = body(rotated.json()).access_token;
      assert.equal(typeof access, 'string');
      if (typeof access !== 'string') throw new Error('No token.');
      const resolved = await resolveOAuthToken(
        runtime,
        digest(access),
        resource,
      );
      assert.equal(resolved?.standing, 'locked');
      assert.equal(lockedAccountKeeps('getAccount'), true);
      assert.equal(lockedAccountKeeps('listFiles'), false);
      assert.equal(lockedAccountKeeps('commitChangeset'), false);
      const automatic = await app.inject({
        url: authorization(id, { scope: 'notes:read offline_access' }),
        headers: { cookie },
      });
      assert.ok(automatic.statusCode >= 400, automatic.body);
      const refusedCode = await identity.failure(
        `insert into auth_verification(id,identifier,value,expires_at,created_at,updated_at) values($1,$2,$3,now()+interval '1 minute',now(),now())`,
        [
          randomUUID(),
          digest(randomUUID()),
          JSON.stringify({
            type: 'authorization_code',
            query: { client_id: id },
            userId,
          }),
        ],
      );
      assert.equal(refusedCode.code, '42501');
      const existing = await resolveOAuthToken(
        runtime,
        digest(granted.access),
        resource,
      );
      assert.equal(existing?.standing, 'locked');
    } finally {
      await admin.query(
        "update accounts set standing='active',installation_role='administrator' where id=(select account_id from account_identities where auth_user_id=$1)",
        [userId],
      );
    }
    const fresh = await tokens(id);
    assert.equal((await refresh(id, fresh.refresh)).statusCode, 200);
  });
  await test('disable, removal and recovery revoke every grant', async () => {
    // A second enabled administrator permits a state change of the first account.

    for (const change of ["state='disabled'", 'removed_at=now()']) {
      const id = await register();
      const granted = await tokens(id);
      await admin.query(
        `update accounts set ${change} where id=(select account_id from account_identities where auth_user_id=$1)`,
        [userId],
      );
      assert.equal(
        await resolveOAuthToken(runtime, digest(granted.access), resource),
        null,
      );
      assert.equal((await refresh(id, granted.refresh)).statusCode, 400);
      assert.equal(
        (
          await identity.query(
            'select id from auth_oauth_consent where client_id=$1',
            [id],
          )
        ).length,
        0,
      );
      await admin.query(
        "update accounts set state='enabled',removed_at=null where id=(select account_id from account_identities where auth_user_id=$1)",
        [userId],
      );
      assert.equal(
        await resolveOAuthToken(runtime, digest(granted.access), resource),
        null,
      );
    }
    const id = await register();
    const granted = await tokens(id);
    await recoverAccount({
      config,
      email: 'oauth@notes.invalid',
      password: 'oauth-recovered-password-safe',
    });
    assert.equal(
      await resolveOAuthToken(runtime, digest(granted.access), resource),
      null,
    );
    assert.equal((await refresh(id, granted.refresh)).statusCode, 400);
    assert.equal(
      (
        await identity.query(
          'select id from auth_oauth_consent where user_id=$1',
          [userId],
        )
      ).length,
      0,
    );
    const signedIn = await signInWithPassword({
      body: {
        email: 'oauth@notes.invalid',
        password: 'oauth-recovered-password-safe',
      },
      headers: { origin: config.origin },
    });
    assert.equal(signedIn.response?.status, 200);
    cookie = signedIn.response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  });
  await test('identity role bypass cannot issue or revoke without the pair lock', async () => {
    const refused = await identity.failure(
      `insert into auth_oauth_access_token(id, token, client_id, user_id, expires_at, created_at, scopes)
      values ('bypass', $1, $2, $3, now() + interval '1 hour', now(), array['notes:read'])`,
      [digest('bypass'), clientId, userId],
    );
    assert.equal(refused.code, '42501');
    const granted = await tokens(clientId);
    for (const table of [
      'auth_oauth_access_token',
      'auth_oauth_refresh_token',
    ]) {
      const token =
        table === 'auth_oauth_access_token' ? granted.access : granted.refresh;
      assert.equal(
        (
          await identity.failure(`delete from ${table} where token=$1`, [
            digest(token),
          ])
        ).code,
        '42501',
      );
      assert.equal(
        (
          await identity.failure(
            `update ${table} set revoked=now() where token=$1`,
            [digest(token)],
          )
        ).code,
        '42501',
      );
    }
    const runtimeRead = await openSession(database.runtimeUrl);
    try {
      assert.equal(
        (await runtimeRead.failure('select * from auth_oauth_refresh_token'))
          .code,
        '42501',
      );
    } finally {
      await runtimeRead.close();
    }
  });
  await test('tokens expire and revocation keeps no valid child access token', async () => {
    const granted = await tokens(clientId);
    await lockedWrite(
      "update auth_oauth_access_token set expires_at = now() - interval '1 second' where token = $1",
      [digest(granted.access)],
    );
    assert.equal(
      await resolveOAuthToken(runtime, digest(granted.access), resource),
      null,
    );
    const revoked = await app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/revoke',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        token: granted.refresh,
        client_id: clientId,
        token_type_hint: 'refresh_token',
      }).toString(),
    });
    assert.equal(revoked.statusCode, 200, revoked.body);
    assert.equal(revoked.body, '');
    for (const token of [granted.refresh, 'unknown-revocation']) {
      const again = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/revoke',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ token, client_id: clientId }).toString(),
      });
      assert.equal(again.statusCode, 200, again.body);
      assert.equal(again.body, '');
    }
    assert.equal((await refresh(clientId, granted.refresh)).statusCode, 400);
  });
  await test('revocation is empty and keeps the consent for every token kind and hint', async () => {
    const id = await register();
    const other = await register();
    const revoke = async (
      token: string,
      client: string,
      hint: string | undefined,
      secret?: string,
    ) => {
      const fields = new URLSearchParams({ token, client_id: client });
      if (hint !== undefined) fields.set('token_type_hint', hint);
      if (secret !== undefined) fields.set('client_secret', secret);
      return app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/revoke',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: fields.toString(),
      });
    };
    for (const hint of [undefined, 'access_token', 'refresh_token']) {
      const granted = await tokens(id);
      const failed = await revoke(granted.refresh, id, hint, 'bad-secret');
      assert.equal(failed.json().error, 'invalid_client');
      assert.ok(
        await resolveOAuthToken(runtime, digest(granted.access), resource),
      );
      for (const token of [granted.access, granted.refresh]) {
        const wrong = await revoke(token, other, hint);
        assert.equal(wrong.statusCode, 200, wrong.body);
        assert.equal(wrong.body, '');
        assert.ok(
          await resolveOAuthToken(runtime, digest(granted.access), resource),
        );
      }
      const access = await revoke(granted.access, id, hint);
      assert.equal(access.statusCode, 200, access.body);
      assert.equal(access.body, '');
      assert.equal(
        await resolveOAuthToken(runtime, digest(granted.access), resource),
        null,
      );
      const second = await tokens(id);
      const refreshAnswer = await revoke(second.refresh, id, hint);
      assert.equal(refreshAnswer.statusCode, 200, refreshAnswer.body);
      assert.equal(refreshAnswer.body, '');
      assert.equal(
        await resolveOAuthToken(runtime, digest(second.access), resource),
        null,
      );
      assert.equal(
        (
          await identity.query(
            'select id from auth_oauth_consent where client_id=$1',
            [id],
          )
        ).length,
        1,
      );
      for (const token of [second.refresh, 'unknown-token'])
        for (const client of [id, other]) {
          const answer = await revoke(token, client, hint);
          assert.equal(answer.statusCode, 200, answer.body);
          assert.equal(answer.body, '');
        }
    }
    const provider = createAuth(
      config,
      { mail: null, sessionAllowed: () => Promise.resolve(true) },
      authPool,
    );
    try {
      const before = await identity.query(
        'select id,revoked from auth_oauth_refresh_token order by id',
      );
      const response = await provider.auth.handler(
        new Request(`${config.origin}/api/auth/oauth2/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: randomUUID(),
            client_id: id,
          }).toString(),
        }),
      );
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: 'invalid_request',
        error_description: 'token not found',
      });
      assert.deepEqual(
        await identity.query(
          'select id,revoked from auth_oauth_refresh_token order by id',
        ),
        before,
      );
    } finally {
      await provider.close();
    }
  });
  await test('revocation keeps the shared rate refusal and retry header without credential writes', async () => {
    const id = await register();
    const granted = await tokens(id);
    const before = {
      consent: await identity.query(
        'select * from auth_oauth_consent where client_id=$1',
        [id],
      ),
      access: await identity.query(
        'select * from auth_oauth_access_token where client_id=$1 order by id',
        [id],
      ),
      refresh: await identity.query(
        'select * from auth_oauth_refresh_token where client_id=$1 order by id',
        [id],
      ),
    };
    const limitedConfig = {
      ...config,
      rateLimit: { ...config.rateLimit, max: 2 },
    };
    const first = await createApp(limitedConfig);
    const second = await createApp(limitedConfig);
    try {
      for (const [n, target] of [first, second, first, second].entries()) {
        const token = [
          randomUUID(),
          randomUUID(),
          granted.refresh,
          granted.access,
        ][n];
        assert.ok(token);
        const answer = await target.inject({
          method: 'POST',
          url: '/api/auth/oauth2/revoke',
          remoteAddress: '198.51.100.48',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          payload: new URLSearchParams({ token, client_id: id }).toString(),
        });
        if (n < 2) {
          assert.equal(answer.statusCode, 200, answer.body);
          assert.equal(answer.body, '');
        } else {
          assert.equal(answer.statusCode, 429, answer.body);
          assert.match(
            String(answer.headers['content-type']),
            /^application\/json/,
          );
          assert.deepEqual(answer.json(), { error: 'temporarily_unavailable' });
          assert.ok(Number(answer.headers['x-retry-after']) > 0);
        }
        assert.deepEqual(
          {
            consent: await identity.query(
              'select * from auth_oauth_consent where client_id=$1',
              [id],
            ),
            access: await identity.query(
              'select * from auth_oauth_access_token where client_id=$1 order by id',
              [id],
            ),
            refresh: await identity.query(
              'select * from auth_oauth_refresh_token where client_id=$1 order by id',
              [id],
            ),
          },
          before,
        );
      }
    } finally {
      await first.close();
      await second.close();
    }
  });
  await test('token requests bound lock waits and write nothing on timeout', async () => {
    const id = await register();
    const granted = await tokens(id);
    const held = await authPool.connect();
    try {
      await held.query('begin');
      await held.query('select notesapp_oauth_lock_pair($1,$2)', [id, userId]);
      const refused = await refresh(id, granted.refresh, replica);
      assert.equal(refused.statusCode, 503, refused.body);
      assert.equal(refused.json().error, 'temporarily_unavailable');
      assert.equal(
        (
          await held.query(
            'select revoked from auth_oauth_refresh_token where token=$1',
            [digest(granted.refresh)],
          )
        ).rows[0]?.revoked,
        null,
      );
    } finally {
      await held.query('rollback');
      held.release();
    }
    assert.equal((await refresh(id, granted.refresh)).statusCode, 200);
    await assert.rejects(
      oauthRequestTransaction(authPool, null, async (client) => {
        const settings = await client.query(
          "select current_setting('lock_timeout') as lock,current_setting('statement_timeout') as statement",
        );
        assert.equal(settings.rows[0].lock, '2s');
        assert.equal(settings.rows[0].statement, '5s');
        await client.query("set local statement_timeout='1ms'");
        try {
          await client.query(
            'select sum(n) from generate_series(1,100000000) n',
          );
        } catch (error) {
          throw new Error('The adapter wraps this fault.', { cause: error });
        }
      }),
      (error: unknown) =>
        error !== null &&
        typeof error === 'object' &&
        'kind' in error &&
        error.kind === 'timeout',
    );
  });
  await test('both client-secret methods use the provider authentication boundary', async () => {
    for (const method of ['client_secret_basic', 'client_secret_post']) {
      const registered = await registerOAuthClient({
        body: {
          redirect_uris: [callback],
          token_endpoint_auth_method: method,
          grant_types: ['authorization_code', 'refresh_token'],
        },
      });
      assert.equal(
        registered.response?.status,
        201,
        JSON.stringify(registered.error),
      );
      const id = registered.data?.client_id;
      const secret = registered.data?.client_secret;
      assert.ok(id && secret);
      protectedValues.add(id);
      protectedValues.add(secret);
      const authorizationCode = await code(id);
      const fields = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        code_verifier: verifier,
        redirect_uri: callback,
        resource,
      });
      const headers: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded',
      };
      if (method === 'client_secret_basic')
        headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
      else {
        fields.set('client_id', id);
        fields.set('client_secret', secret);
      }
      const granted = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/token',
        headers,
        payload: fields.toString(),
      });
      assert.equal(granted.statusCode, 200, granted.body);
      const token = body(granted.json()).refresh_token;
      assert.equal(typeof token, 'string');
      if (typeof token !== 'string') throw new Error('No token.');
      const rotationFields = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token,
        resource,
      });
      if (method === 'client_secret_post') {
        rotationFields.set('client_id', id);
        rotationFields.set('client_secret', secret);
      }
      const rotated = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/token',
        headers,
        payload: rotationFields.toString(),
      });
      assert.equal(rotated.statusCode, 200, rotated.body);
      const badHeaders = { ...headers };
      const badFields = new URLSearchParams(rotationFields);
      if (method === 'client_secret_basic')
        badHeaders.authorization = `Basic ${Buffer.from(`${id}:bad`).toString('base64')}`;
      else badFields.set('client_secret', 'bad');
      const refused = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/token',
        headers: badHeaders,
        payload: badFields.toString(),
      });
      assert.equal(refused.json().error, 'invalid_client');
      assert.equal(
        (
          await identity.query(
            'select id from auth_oauth_consent where client_id=$1',
            [id],
          )
        ).length,
        1,
      );
      const replayed = await app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/token',
        headers,
        payload: rotationFields.toString(),
      });
      assert.equal(replayed.json().error, 'invalid_grant');
      assert.equal(
        (
          await identity.query(
            'select id from auth_oauth_consent where client_id=$1',
            [id],
          )
        ).length,
        0,
      );
    }
  });
  await test('DCR and CIMD consume one address counter before client work across replicas', async () => {
    const limitedConfig = {
      ...config,
      rateLimit: { ...config.rateLimit, max: 2 },
    };
    let transportCalls = 0;
    const limited = await createApp(limitedConfig, {
      oauthFetch: () => {
        transportCalls += 1;
        throw new Error('The address limit must run first.');
      },
    });
    const second = await createApp(limitedConfig);
    try {
      for (const target of [limited, second]) {
        const answer = await target.inject({
          method: 'POST',
          url: '/api/auth/oauth2/register',
          remoteAddress: '198.51.100.45',
          payload: {
            redirect_uris: [callback],
            token_endpoint_auth_method: 'none',
          },
        });
        assert.equal(answer.statusCode, 201, answer.body);
      }
      const cimd = await limited.inject({
        url: authorization('https://limited.example/client.json'),
        remoteAddress: '198.51.100.45',
        headers: { cookie },
      });
      assert.equal(cimd.statusCode, 400, cimd.body);
      assert.equal(transportCalls, 0);
      const dcr = await second.inject({
        method: 'POST',
        url: '/api/auth/oauth2/register',
        remoteAddress: '198.51.100.45',
        payload: {
          redirect_uris: [callback],
          token_endpoint_auth_method: 'none',
        },
      });
      assert.equal(dcr.statusCode, 429, dcr.body);
    } finally {
      await limited.close();
      await second.close();
    }
  });
  await test('the daily sweep removes unused clients on one replica only', async () => {
    const unused = await register();
    await identity.query(
      "update auth_oauth_client set created_at = now() - interval '31 days' where client_id = $1",
      [unused],
    );
    const swept = await Promise.all([
      expireOAuthClients(authPool),
      expireOAuthClients(authPool),
    ]);
    assert.equal(
      swept.reduce((sum, count) => sum + count, 0),
      1,
    );
    assert.equal(
      (
        await identity.query(
          'select id from auth_oauth_client where client_id = $1',
          [unused],
        )
      ).length,
      0,
    );
  });
  await test('one locked total bound covers DCR and unique CIMD addresses', async () => {
    const current = await identity.query<{ count: number }>(
      'select count(*)::int as count from auth_oauth_client',
    );
    for (
      let n = current[0]?.count ?? maxOAuthClients;
      n < maxOAuthClients - 1;
      n += 1
    )
      await identity.query(
        'insert into auth_oauth_client(id,client_id,redirect_uris,created_at) values ($1,$1,array[$2],now())',
        [`filler-${String(n)}`, callback],
      );
    const race = await Promise.all([
      app.inject({
        url: authorization('https://last-slot.example/client.json'),
        headers: { cookie },
      }),
      replica.inject({
        method: 'POST',
        url: '/api/auth/oauth2/register',
        payload: {
          redirect_uris: [callback],
          token_endpoint_auth_method: 'none',
        },
      }),
    ]);
    assert.equal(
      race.filter((answer) => answer.statusCode < 400).length,
      1,
      race.map((answer) => answer.body).join(' '),
    );
    const before = fetches;
    const answers = await Promise.all([
      app.inject({
        url: authorization('https://one-full.example/client.json'),
        headers: { cookie },
      }),
      app.inject({
        url: authorization('https://two-full.example/client.json'),
        headers: { cookie },
      }),
      app.inject({
        method: 'POST',
        url: '/api/auth/oauth2/register',
        payload: {
          redirect_uris: [callback],
          token_endpoint_auth_method: 'none',
        },
      }),
    ]);
    assert.ok(answers.every((answer) => answer.statusCode >= 400));
    assert.equal(fetches, before);
    assert.equal(
      (
        await identity.query<{ count: number }>(
          'select count(*)::int as count from auth_oauth_client',
        )
      )[0]?.count,
      maxOAuthClients,
    );
  });
  await test('known CIMD clients revalidate at capacity but keep the address bound', async () => {
    const id = 'https://cimd.example/client.json';
    assert.equal(
      (
        await identity.query<{ count: number }>(
          'select count(*)::int as count from auth_oauth_client',
        )
      )[0]?.count,
      maxOAuthClients,
    );
    let calls = 0;
    const restarted = await createApp(
      { ...config, rateLimit: { ...config.rateLimit, max: 2 } },
      {
        oauthFetch: () => {
          calls += 1;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                client_id: id,
                client_name: 'Revalidated client',
                redirect_uris: [callback],
                token_endpoint_auth_method: 'none',
              }),
              {
                headers: {
                  'content-type': 'application/json',
                  'cache-control': 'no-store',
                },
              },
            ),
          );
        },
      },
    );
    try {
      const authorized = await restarted.inject({
        url: authorization(id),
        remoteAddress: '198.51.100.46',
        headers: { cookie },
      });
      assert.equal(authorized.statusCode, 302, authorized.body);
      assert.equal(calls, 1);
      const lookup = `/api/auth/oauth2/public-client?${new URLSearchParams({ client_id: id })}`;
      const publicClient = await restarted.inject({
        url: lookup,
        remoteAddress: '198.51.100.46',
        headers: { cookie },
      });
      assert.equal(publicClient.statusCode, 200, publicClient.body);
      assert.equal(publicClient.json().client_name, 'Revalidated client');
      assert.equal(calls, 2);
      const refused = await restarted.inject({
        url: lookup,
        remoteAddress: '198.51.100.46',
        headers: { cookie },
      });
      assert.equal(refused.statusCode, 400, refused.body);
      assert.equal(
        calls,
        2,
        'the address counter refuses before an existing client fetch',
      );
      assert.equal(
        (
          await identity.query<{ count: number }>(
            'select count(*)::int as count from auth_oauth_client',
          )
        )[0]?.count,
        maxOAuthClients,
      );
    } finally {
      await restarted.close();
    }
  });
  await test('no OAuth route answers when the setting is absent', async () => {
    const disabled = await createApp({ ...config, mcpOrigin: null });
    try {
      for (const [method, url] of [
        ['GET', '/.well-known/oauth-authorization-server/api/auth'],
        ['GET', '/api/auth/oauth2/authorize'],
        ['POST', '/api/auth/oauth2/register'],
        ['POST', '/api/auth/oauth2/token'],
        ['POST', '/api/auth/oauth2/revoke'],
        ['POST', '/api/auth/oauth2/consent'],
        ['POST', '/api/auth/oauth2/continue'],
        ['GET', '/api/auth/oauth2/public-client'],
      ] as const)
        assert.equal(
          (await disabled.inject({ method, url })).statusCode,
          404,
          url,
        );
    } finally {
      await disabled.close();
    }
  });
  await test('protocol faults log no SQL parameters or credentials', () => {
    assert.equal(
      consoleLines.length,
      0,
      consoleLines.map((line) => line.slice(0, 80)).join(' '),
    );
    const logs = [...consoleLines, ...logLines].join('');
    for (const value of protectedValues)
      assert.equal(
        logs.includes(value),
        false,
        'The server logged a protected value.',
      );
    const failures = logLines
      .map((line) => body(JSON.parse(line)))
      .filter((record) => record.event === 'http.request.failed');
    assert.ok(
      failures.some(
        (record) =>
          record.operationId === 'oauth2Authorize' &&
          record.errorName === 'unexpected',
      ),
    );
    assert.ok(
      failures.some(
        (record) =>
          record.operationId === 'exchangeOAuthToken' &&
          record.errorName === 'timeout',
      ),
    );
    for (const failure of failures)
      for (const name of ['err', 'error', 'cause', 'message', 'sql', 'params'])
        assert.equal(failure[name], undefined, name);
  });
} finally {
  for (const mocked of consoleMocks) mocked.mock.restore();
  await app.close();
  await replica.close();
  await runtime.end();
  await authPool.end();
  await identity.close();
  await admin.close();
  await database.destroy();
  await rm(storageRoot, { recursive: true, force: true });
}
