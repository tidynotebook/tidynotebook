/** Connected app controls, account isolation and the shared bound (0226). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  configureClient,
  signInWithPassword,
  createInvitation,
  registerAccount,
  getAccount,
  registerOAuthClient,
  giveOAuthConsent,
  exchangeOAuthToken,
  listConnectedApps,
  revokeConnectedApp,
  serveMcp,
  type ConnectedApp,
} from '@notesapp/api-client';
import { bootstrapOwner, createApp, loadServerConfig } from '@notesapp/server';
import {
  openPool,
  resolveOAuthToken,
  oauthRequestTransaction,
} from '@notesapp/storage-server';
import { maxOAuthGrants } from '@notesapp/core';
import { createDisposableDatabase, openSession } from './support/database.ts';
import { testEnvironment } from './support/server.ts';
import {
  connectedAppFacts,
  connectedAppIdentity,
} from '../../apps/web/src/lib/connected-apps.ts';
import {
  settingsSections,
  visibleSettingsSections,
} from '../../apps/web/src/lib/page-sections.ts';

const database = await createDisposableDatabase();
const root = await mkdtemp(join(tmpdir(), 'notesapp-connected-apps-'));
const config = loadServerConfig({
  ...testEnvironment(root),
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_MCP_ORIGIN: 'https://mcp.notes.invalid',
  NOTESAPP_RATE_LIMIT_MAX: '10000',
  NOTESAPP_BREACH_CHECK: 'off',
});
await bootstrapOwner({
  config,
  email: 'apps-owner@notes.invalid',
  name: 'Apps owner',
  password: 'connected-apps-owner-password',
});
const app = await createApp(config, {
  oauthFetch: () => {
    throw new Error('Consent must use stored client metadata.');
  },
});
const replica = await createApp(config);
await app.listen({ host: '127.0.0.1', port: 0 });
const address = app.server.address();
assert.ok(address !== null && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${String(address.port)}`;
configureClient(baseUrl, undefined);
const origin = { origin: config.origin };
function cookieHeader(response: Response | undefined): string {
  assert.ok(response);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
const ownerResponse = await signInWithPassword({
  headers: origin,
  body: {
    email: 'apps-owner@notes.invalid',
    password: 'connected-apps-owner-password',
  },
});
assert.equal(ownerResponse.response?.status, 200);
const owner = { ...origin, cookie: cookieHeader(ownerResponse.response) };
const admin = await openSession(database.migrationUrl);
const authPool = openPool({ connectionString: database.authUrl });
const runtime = openPool({ connectionString: database.runtimeUrl });
const resource = `${config.mcpOrigin}/mcp`;
const redirect = 'https://client.example/callback';
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const digest = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
type Person = {
  headers: Record<string, string>;
  userId: string;
  accountId: string;
};
async function newPerson(): Promise<Person> {
  const email = `apps-${randomUUID()}@notes.invalid`;
  const invitation = await createInvitation({
    headers: owner,
    body: { email },
  });
  assert.ok(invitation.data?.link);
  const registered = await registerAccount({
    headers: origin,
    body: {
      invitation: new URL(invitation.data.link).hash.slice(1),
      password: 'connected-apps-member-password',
    },
  });
  assert.equal(
    registered.response?.status,
    201,
    JSON.stringify(registered.error),
  );
  const headers = { ...origin, cookie: cookieHeader(registered.response) };
  const account = await getAccount({ headers });
  assert.ok(account.data);
  const users = await admin.query<{ id: string }>(
    'select id from auth_user where email=$1',
    [email],
  );
  assert.ok(users[0]);
  return { headers, userId: users[0].id, accountId: account.data.accountId };
}
async function newClient(name = 'My connected app'): Promise<string> {
  const response = await registerOAuthClient({
    body: {
      client_name: name,
      redirect_uris: [redirect],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  });
  assert.ok(response.data, JSON.stringify(response.error));
  return response.data.client_id;
}
async function consentQuery(person: Person, clientId: string): Promise<string> {
  const answer = await app.inject({
    method: 'GET',
    url: `/api/auth/oauth2/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, scope: 'notes:read notes:write offline_access', resource, prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256' })}`,
    headers: person.headers,
  });
  assert.equal(answer.statusCode, 302, answer.body);
  const location = answer.headers.location;
  assert.equal(typeof location, 'string');
  return new URL(String(location), config.origin).search.slice(1);
}
async function connect(
  person: Person,
  clientId: string,
  scope = 'notes:read offline_access',
): Promise<string> {
  const consent = await giveOAuthConsent({
    headers: person.headers,
    body: {
      accept: true,
      oauth_query: await consentQuery(person, clientId),
      scope,
    },
  });
  assert.equal(consent.response?.status, 200, JSON.stringify(consent.error));
  const code = new URL(consent.data?.url ?? '').searchParams.get('code');
  assert.ok(code);
  return code;
}
async function exchange(clientId: string, code: string) {
  return exchangeOAuthToken({
    body: {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirect,
      resource,
    },
  });
}
async function listed(person: Person): Promise<ConnectedApp[]> {
  const answer = await listConnectedApps({ headers: person.headers });
  assert.equal(answer.response?.status, 200, JSON.stringify(answer.error));
  assert.equal(answer.response?.headers.get('cache-control'), 'no-store');
  assert.ok(answer.data);
  return answer.data.apps;
}
async function seedConsent(person: Person, clientId: string): Promise<void> {
  await oauthRequestTransaction(authPool, null, async (client) => {
    await client.query(
      "insert into auth_oauth_consent(id,client_id,user_id,scopes,created_at,updated_at) values($1,$2,$3,ARRAY['notes:read','offline_access'],now(),now())",
      [randomUUID(), clientId, person.userId],
    );
  });
}

await test('the served list holds account metadata and the Settings decisions', async () => {
  const person = await newPerson();
  const peer = await newPerson();
  const clientId = await newClient('<b>Famous brand</b>');
  await connect(person, clientId);
  await connect(peer, clientId, 'notes:read notes:write offline_access');
  const apps = await listed(person);
  assert.equal(apps.length, 1);
  assert.equal(apps[0]?.clientName, '<b>Famous brand</b>');
  assert.deepEqual(apps[0]?.scopes, ['notes:read']);
  assert.ok(apps[0]);
  assert.equal(
    connectedAppFacts(apps[0], Date.now()),
    'Read access to all your workspaces. Not used yet.',
  );
  assert.equal(connectedAppIdentity(apps[0]), 'Client identity: Not verified.');
  assert.deepEqual(Object.keys(apps[0]).sort(), [
    'clientId',
    'clientName',
    'grantId',
    'lastUsedAt',
    'scopes',
  ]);
  const peerApps = await listed(peer);
  assert.deepEqual(peerApps[0]?.scopes, ['notes:read', 'notes:write']);
  const account = await getAccount({ headers: person.headers });
  assert.equal(account.data?.mcpAuthorization, true);
  assert.ok(account.data);
  const sectionKeys = visibleSettingsSections(account.data).map(
    (section) => section.key,
  );
  assert.deepEqual(
    sectionKeys,
    settingsSections
      .map((section) => section.key)
      .filter((key) => key !== 'billing'),
  );
  assert.equal(
    sectionKeys.indexOf('connected-apps'),
    sectionKeys.indexOf('api-keys') + 1,
  );
  assert.equal(
    sectionKeys.indexOf('sessions'),
    sectionKeys.indexOf('connected-apps') + 1,
  );
  const stranger = await listConnectedApps();
  assert.equal(stranger.response?.status, 401);
  const revokeOther = await revokeConnectedApp({
    headers: peer.headers,
    path: { grantId: apps[0].grantId },
  });
  assert.equal(revokeOther.response?.status, 404);
  assert.equal((await listed(person)).length, 1);
  assert.equal((await listed(peer)).length, 1);
});

await test('an MCP access token is not a credential for connected app operations', async () => {
  const person = await newPerson();
  const clientId = await newClient();
  const tokens = await exchange(
    clientId,
    await connect(person, clientId, 'notes:read notes:write offline_access'),
  );
  assert.ok(tokens.data?.refresh_token, JSON.stringify(tokens.error));
  const accessToken = tokens.data.access_token;
  const identity = await resolveOAuthToken(
    runtime,
    digest(accessToken),
    resource,
  );
  assert.ok(identity, 'the issued MCP access token must be valid');
  const apps = await listed(person);
  assert.ok(apps[0]);
  const grantId = apps[0].grantId;
  async function storedState(): Promise<string> {
    const rows = await admin.query<{ kind: string; value: unknown }>(
      `select kind, value from (
        select 'consent' as kind, to_jsonb(c) as value from auth_oauth_consent c where client_id=$1 and user_id=$2
        union all select 'access', to_jsonb(t) from auth_oauth_access_token t where client_id=$1 and user_id=$2
        union all select 'refresh', to_jsonb(t) from auth_oauth_refresh_token t where client_id=$1 and user_id=$2
      ) held order by kind, value->>'id'`,
      [clientId, person.userId],
    );
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  const before = await storedState();
  for (const withCookie of [false, true]) {
    const headers = {
      ...(withCookie ? person.headers : origin),
      authorization: `Bearer ${accessToken}`,
    };
    for (const operation of [
      () => listConnectedApps({ headers }),
      () => revokeConnectedApp({ headers, path: { grantId } }),
    ]) {
      const answer = await operation();
      assert.equal(answer.response?.status, 401);
      assert.equal(answer.data, undefined);
      assert.equal(await storedState(), before);
      assert.deepEqual(await listed(person), apps);
      assert.deepEqual(
        await resolveOAuthToken(runtime, digest(accessToken), resource),
        identity,
        'a refused account operation must leave the MCP token valid',
      );
    }
  }
});

await test('last use belongs to the pair and changes only at code exchange and refresh', async () => {
  const person = await newPerson();
  const peer = await newPerson();
  const clientId = await newClient();
  const code = await connect(person, clientId);
  await connect(peer, clientId);
  assert.equal((await listed(person))[0]?.lastUsedAt, null);
  const tokens = await exchange(clientId, code);
  assert.ok(tokens.data?.refresh_token, JSON.stringify(tokens.error));
  assert.notEqual((await listed(person))[0]?.lastUsedAt, null);
  assert.equal((await listed(peer))[0]?.lastUsedAt, null);
  // Move the stored use, rather than wait for a clock tick.
  await admin.query(
    "update auth_oauth_consent set last_used_at=now()-interval '3 hours' where client_id=$1 and user_id=$2",
    [clientId, person.userId],
  );
  const prior = (await listed(person))[0];
  assert.ok(prior);
  assert.match(connectedAppFacts(prior, Date.now()), /Last used 3 hours ago/);
  assert.ok(
    await resolveOAuthToken(
      runtime,
      digest(tokens.data.access_token),
      resource,
    ),
  );
  assert.equal(
    (await listed(person))[0]?.lastUsedAt,
    prior.lastUsedAt,
    'MCP token resolution must leave the grant use unchanged',
  );
  const refreshed = await exchangeOAuthToken({
    body: {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: tokens.data.refresh_token,
      resource,
    },
  });
  assert.equal(
    refreshed.response?.status,
    200,
    JSON.stringify(refreshed.error),
  );
  const after = (await listed(person))[0];
  assert.ok(after);
  assert.notEqual(after.lastUsedAt, prior.lastUsedAt);
  assert.match(connectedAppFacts(after, Date.now()), /Last used just now/);
  assert.equal((await listed(peer))[0]?.lastUsedAt, null);
});

await test('token resolution keeps the daily client bound and token issue alone writes consent use', async () => {
  const person = await newPerson();
  const clientId = await newClient();
  const code = await connect(person, clientId);
  assert.equal((await listed(person))[0]?.lastUsedAt, null);
  await admin.query(
    'create table oauth_use_writes (client_id text not null, source text not null)',
  );
  await admin.query(`create function count_oauth_use_write() returns trigger
    language plpgsql as $$ begin
      insert into public.oauth_use_writes values (NEW.client_id, TG_TABLE_NAME);
      return NEW;
    end $$`);
  for (const table of ['auth_oauth_client', 'auth_oauth_consent'] as const)
    await admin.query(`create trigger count_oauth_use_write after update of last_used_at
      on ${table} for each row execute function count_oauth_use_write()`);
  const counts = async () => {
    const rows = await admin.query<{ clients: number; consents: number }>(
      `select count(*) filter (where source='auth_oauth_client')::int as clients,
        count(*) filter (where source='auth_oauth_consent')::int as consents
        from oauth_use_writes where client_id=$1`,
      [clientId],
    );
    return rows[0];
  };
  const call = (token: string) =>
    serveMcp({
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_workspaces', arguments: {} },
      },
    });
  try {
    const tokens = await exchange(clientId, code);
    assert.ok(tokens.data?.refresh_token, JSON.stringify(tokens.error));
    const firstUse = (await listed(person))[0]?.lastUsedAt;
    assert.ok(firstUse);
    assert.equal((await counts())?.consents, 1);
    await admin.query(
      'update auth_oauth_client set last_used_at=null where client_id=$1',
      [clientId],
    );
    await admin.query('delete from oauth_use_writes');
    for (let index = 0; index < 2; index += 1) {
      assert.equal(
        (await call(tokens.data.access_token)).response?.status,
        200,
      );
      assert.deepEqual(await counts(), { clients: 1, consents: 0 });
      assert.equal((await listed(person))[0]?.lastUsedAt, firstUse);
    }
    const refreshed = await exchangeOAuthToken({
      body: {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: tokens.data.refresh_token,
        resource,
      },
    });
    assert.equal(
      refreshed.response?.status,
      200,
      JSON.stringify(refreshed.error),
    );
    assert.ok(refreshed.data);
    const nextUse = (await listed(person))[0]?.lastUsedAt;
    assert.ok(nextUse);
    assert.notEqual(nextUse, firstUse);
    assert.equal((await counts())?.consents, 1);
    await admin.query('delete from oauth_use_writes');
    for (let index = 0; index < 2; index += 1) {
      assert.equal(
        (await call(refreshed.data.access_token)).response?.status,
        200,
      );
      assert.deepEqual(await counts(), { clients: 0, consents: 0 });
      assert.equal((await listed(person))[0]?.lastUsedAt, nextUse);
    }
  } finally {
    for (const table of ['auth_oauth_client', 'auth_oauth_consent'] as const)
      await admin.query(`drop trigger count_oauth_use_write on ${table}`);
    await admin.query('drop function count_oauth_use_write()');
    await admin.query('drop table oauth_use_writes');
  }
});

await test('a locked account lists and revokes its grant, tokens and pending code', async () => {
  const person = await newPerson();
  const peer = await newPerson();
  const clientId = await newClient();
  const tokens = await exchange(clientId, await connect(person, clientId));
  const peerTokens = await exchange(clientId, await connect(peer, clientId));
  assert.ok(tokens.data?.refresh_token);
  assert.ok(peerTokens.data);
  const pending = await connect(person, clientId);
  const apps = await listed(person);
  assert.ok(apps[0]);
  await admin.query("update accounts set standing='locked' where id=$1::uuid", [
    person.accountId,
  ]);
  const refreshed = await exchangeOAuthToken({
    body: {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: tokens.data.refresh_token,
      resource,
    },
  });
  assert.equal(
    refreshed.response?.status,
    200,
    JSON.stringify(refreshed.error),
  );
  assert.ok(refreshed.data?.refresh_token);
  assert.equal((await listed(person)).length, 1);
  const noOrigin = await revokeConnectedApp({
    headers: { cookie: person.headers.cookie ?? '' },
    path: { grantId: apps[0].grantId },
  });
  assert.equal(noOrigin.response?.status, 403);
  const revoked = await revokeConnectedApp({
    headers: person.headers,
    path: { grantId: apps[0].grantId },
  });
  assert.equal(revoked.response?.status, 200, JSON.stringify(revoked.error));
  const refused = await serveMcp({
    headers: {
      authorization: `Bearer ${refreshed.data.access_token}`,
      accept: 'application/json, text/event-stream',
    },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_workspaces', arguments: {} },
    },
  });
  assert.equal(refused.response?.status, 401);
  assert.deepEqual(refused.error, { error: 'invalid_token' });
  assert.equal(
    refused.response?.headers.get('www-authenticate'),
    `Bearer resource_metadata="${config.mcpOrigin}/.well-known/oauth-protected-resource/mcp", scope="notes:read"`,
  );
  assert.equal(revoked.response?.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await listed(person), []);
  assert.equal(
    await resolveOAuthToken(
      runtime,
      digest(tokens.data.access_token),
      resource,
    ),
    null,
  );
  assert.equal(
    await resolveOAuthToken(
      runtime,
      digest(refreshed.data.access_token),
      resource,
    ),
    null,
  );
  const repeat = await exchangeOAuthToken({
    body: {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshed.data.refresh_token,
      resource,
    },
  });
  assert.equal(repeat.response?.status, 400);
  const pendingAnswer = await exchange(clientId, pending);
  assert.equal(pendingAnswer.response?.status, 400);
  assert.ok(
    await resolveOAuthToken(
      runtime,
      digest(peerTokens.data.access_token),
      resource,
    ),
  );
  assert.equal((await listed(peer)).length, 1);
  const absent = await revokeConnectedApp({
    headers: person.headers,
    path: { grantId: apps[0].grantId },
  });
  assert.equal(absent.response?.status, 404);
});

await test('the bound refuses a new pair, permits repeat consent, and frees a revoked slot', async () => {
  const person = await newPerson();
  for (let index = 0; index < maxOAuthGrants - 1; index += 1)
    await seedConsent(person, await newClient());
  const last = await newClient();
  await connect(person, last);
  const extra = await newClient();
  const denied = await giveOAuthConsent({
    headers: person.headers,
    body: {
      accept: true,
      oauth_query: await consentQuery(person, extra),
      scope: 'notes:read offline_access',
    },
  });
  assert.equal(denied.response?.status, 400);
  assert.deepEqual(denied.error, {
    error: 'invalid_request',
    error_description: 'oauth_grant_limit',
  });
  assert.equal((await listed(person)).length, maxOAuthGrants);
  const tamperedQuery = new URLSearchParams(await consentQuery(person, extra));
  tamperedQuery.set('state', 'tampered');
  const badSignature = await giveOAuthConsent({
    headers: person.headers,
    body: {
      accept: true,
      oauth_query: tamperedQuery.toString(),
      scope: 'notes:read offline_access',
    },
  });
  assert.equal(badSignature.response?.status, 400);
  assert.deepEqual(badSignature.error, { error: 'invalid_request' });
  await connect(person, last);
  assert.equal((await listed(person)).length, maxOAuthGrants);
  const held = (await listed(person)).find((entry) => entry.clientId === last);
  assert.ok(held);
  assert.equal(
    (
      await revokeConnectedApp({
        headers: person.headers,
        path: { grantId: held.grantId },
      })
    ).response?.status,
    200,
  );
  await connect(person, extra);
  assert.equal((await listed(person)).length, maxOAuthGrants);
});

await test('two replicas cannot create two final grants in one remaining slot', async () => {
  const person = await newPerson();
  for (let index = 0; index < maxOAuthGrants - 1; index += 1)
    await seedConsent(person, await newClient());
  const first = await newClient();
  const second = await newClient();
  const queries = await Promise.all([
    consentQuery(person, first),
    consentQuery(person, second),
  ]);
  const results = await Promise.all(
    [app, replica].map((target, index) =>
      target.inject({
        method: 'POST',
        url: '/api/auth/oauth2/consent',
        headers: { ...person.headers, 'content-type': 'application/json' },
        payload: {
          accept: true,
          oauth_query: queries[index],
          scope: 'notes:read offline_access',
        },
      }),
    ),
  );
  assert.deepEqual(
    results.map((answer) => answer.statusCode).sort((a, b) => a - b),
    [200, 400],
  );
  const refused = results.find((answer) => answer.statusCode === 400);
  assert.ok(refused);
  assert.deepEqual(refused.json(), {
    error: 'invalid_request',
    error_description: 'oauth_grant_limit',
  });
  assert.equal((await listed(person)).length, maxOAuthGrants);
  // Direct identity writes pass the same bound even without the preflight.
  const fault = await admin.failure(
    "insert into auth_oauth_consent(id,client_id,user_id,scopes,created_at,updated_at) values($1,$2,$3,ARRAY['notes:read'],now(),now())",
    [randomUUID(), await newClient(), person.userId],
  );
  assert.equal(fault.code, 'P0001');
  assert.equal(fault.message, 'oauth_grant_limit');
});

await test('repeat consent waits before row work while token issue holds the account lock', async () => {
  const person = await newPerson();
  const clientId = await newClient();
  await connect(person, clientId);
  const query = await consentQuery(person, clientId);
  const issuer = await authPool.connect();
  let pending: ReturnType<typeof giveOAuthConsent> | null = null;
  try {
    await issuer.query('begin');
    await issuer.query('select notesapp_oauth_lock_pair($1,$2)', [
      clientId,
      person.userId,
    ]);
    pending = giveOAuthConsent({
      headers: person.headers,
      body: {
        accept: true,
        oauth_query: query,
        scope: 'notes:read offline_access',
      },
    });
    const deadline = Date.now() + 1500;
    let waiting = false;
    while (Date.now() < deadline) {
      const observation = await authPool.query<{ waiting: boolean }>(
        `select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event='advisory' and query like 'select notesapp_oauth_lock_pair%') as waiting`,
      );
      if (observation.rows[0]?.waiting === true) {
        waiting = true;
        break;
      }
    }
    assert.equal(
      waiting,
      true,
      'consent must wait on its advisory lock before it takes any grant row',
    );
    const heldRows = await authPool.query<{ held: boolean }>(
      `select exists(select 1 from pg_locks l join pg_stat_activity s on s.pid=l.pid where s.datname=current_database() and s.wait_event='advisory' and l.relation='auth_oauth_consent'::regclass and l.mode='RowExclusiveLock' and l.granted) as held`,
    );
    assert.equal(
      heldRows.rows[0]?.held,
      false,
      'a waiting consent must hold no row write lock',
    );
    await issuer.query(
      `insert into auth_oauth_access_token(id,token,client_id,user_id,scopes,resources,created_at,expires_at) values($1,$2,$3,$4,ARRAY['notes:read'],ARRAY[$5],now(),now()+interval '1 hour')`,
      [randomUUID(), digest(randomUUID()), clientId, person.userId, resource],
    );
    await issuer.query('commit');
    const response = await pending;
    assert.equal(
      response.response?.status,
      200,
      JSON.stringify(response.error),
    );
    const grant = (await listed(person))[0];
    assert.ok(grant);
    assert.match(connectedAppFacts(grant, Date.now()), /Last used just now/);
  } finally {
    await issuer.query('rollback');
    issuer.release();
    await pending;
  }
});

await test('tampered consent changes no grant, and a missing client is refused without a fetch', async () => {
  const person = await newPerson();
  const first = await newClient();
  const other = await newClient();
  await connect(person, first);
  const before = await listed(person);
  const query = new URLSearchParams(await consentQuery(person, first));
  query.set('client_id', other);
  const tampered = await giveOAuthConsent({
    headers: person.headers,
    body: {
      accept: true,
      oauth_query: query.toString(),
      scope: 'notes:read notes:write offline_access',
    },
  });
  assert.equal(tampered.response?.status, 400, JSON.stringify(tampered.error));
  assert.deepEqual(await listed(person), before);
  const missingQuery = await consentQuery(person, other);
  await admin.query('delete from auth_oauth_client where client_id=$1', [
    other,
  ]);
  const missing = await giveOAuthConsent({
    headers: person.headers,
    body: {
      accept: true,
      oauth_query: missingQuery,
      scope: 'notes:read offline_access',
    },
  });
  assert.equal(missing.response?.status, 400);
  assert.deepEqual(missing.error, { error: 'invalid_client' });
  assert.deepEqual(await listed(person), before);
});

await test('the runtime role gets narrow metadata and no OAuth table access', async () => {
  const person = await newPerson();
  const clientId = await newClient();
  await connect(person, clientId);
  const anonymous = await openSession(database.runtimeUrl);
  const owned = await openSession(database.runtimeUrl, person.accountId);
  try {
    assert.deepEqual(
      await anonymous.query('select * from notesapp_account_connected_apps()'),
      [],
    );
    const row = (
      await owned.query<{ grant_id: string }>(
        'select * from notesapp_account_connected_apps()',
      )
    )[0];
    assert.ok(row);
    assert.deepEqual(
      await anonymous.query(
        'select notesapp_revoke_connected_app($1) as revoked',
        [row.grant_id],
      ),
      [{ revoked: false }],
    );
    for (const table of [
      'auth_oauth_consent',
      'auth_oauth_access_token',
      'auth_oauth_refresh_token',
      'auth_oauth_client',
    ])
      assert.equal(
        (await owned.failure(`select * from ${table}`)).code,
        '42501',
      );
    assert.deepEqual(
      await owned.query('select notesapp_revoke_connected_app($1) as revoked', [
        row.grant_id,
      ]),
      [{ revoked: true }],
    );
    assert.deepEqual(await listed(person), []);
  } finally {
    await Promise.all([anonymous.close(), owned.close()]);
  }
});

await test('MCP off hides Settings and answers 404 before authentication', async () => {
  const off = await createApp({ ...config, mcpOrigin: null });
  await off.listen({ host: '127.0.0.1', port: 0 });
  const address = off.server.address();
  assert.ok(address !== null && typeof address !== 'string');
  configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
  try {
    for (const headers of [undefined, owner]) {
      assert.equal(
        (
          await listConnectedApps({
            ...(headers === undefined ? {} : { headers }),
          })
        ).response?.status,
        404,
      );
      assert.equal(
        (
          await revokeConnectedApp({
            ...(headers === undefined ? {} : { headers }),
            path: { grantId: 'unknown' },
          })
        ).response?.status,
        404,
      );
    }
    const account = await getAccount({ headers: owner });
    assert.equal(account.data?.mcpAuthorization, false);
    assert.ok(account.data);
    assert.ok(
      !visibleSettingsSections(account.data).some(
        (section) => section.key === 'connected-apps',
      ),
    );
  } finally {
    configureClient(baseUrl, undefined);
    await off.close();
  }
});

await test('the served Settings bundle includes the connected app controls', async () => {
  const assets = resolve(import.meta.dirname, '../../apps/web/dist/web/assets');
  const names = await readdir(assets);
  const name = names.find(
    (name) => name.startsWith('account-settings-') && name.endsWith('.js'),
  );
  assert.ok(name);
  const answer = await app.inject({ method: 'GET', url: `/assets/${name}` });
  assert.equal(answer.statusCode, 200);
  assert.equal(answer.body, await readFile(join(assets, name), 'utf8'));
  for (const text of [
    'Name claimed by app:',
    'Revoke connected app?',
    'Revoke access',
    'No connected apps.',
  ])
    assert.ok(answer.body.includes(text), text);
});

await Promise.all([
  app.close(),
  replica.close(),
  admin.close(),
  authPool.end(),
  runtime.end(),
]);
await rm(root, { recursive: true, force: true });
await database.destroy();
