/**
 * The account settings, against a real server and database.
 *
 * Record 0103 adds the spell check to the settings that follow an account,
 * and it lets one write change one setting. This file proves the default of
 * an account that never chose, the member that a write keeps, and the
 * refusal of a write that names nothing, through the served operations and a
 * real session.
 *
 * Start the service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  getAccount,
  signInWithPassword,
  updatePreferences,
} from '@notesapp/api-client';
import { defaultSpellCheck } from '@notesapp/core';
import {
  bootstrapOwner,
  createAuth,
  createAuthPool,
  createAuthProtocol,
  createHandlers,
  createIdentityAdapter,
  loadServerConfig,
  type ServerConfig,
  sessionAllowedBy,
} from '@notesapp/server';
import {
  createDocumentService,
  openAttachmentStore,
  openIdentityStore,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import { createDisposableDatabase } from './support/database.ts';
import { startTestServer } from './support/server.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

function cookieHeader(values: readonly string[]): string {
  return values
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-preferences-'));
const environment = (): Record<string, string> => ({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'preferences-test-secret-value-0123456789',
  NOTESAPP_LOG_LEVEL: 'error',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
});
const config: ServerConfig = loadServerConfig(environment());
const identity = openIdentityStore(database.runtimeUrl);
const content = openWorkspaceStore(
  database.runtimeUrl,
  createDocumentService(),
  { poolSize: 2 },
);
const attachments = openAttachmentStore(database.runtimeUrl, storageRoot, {
  poolSize: 2,
});
const authPool = createAuthPool(config);
const auth = createAuth(
  config,
  { mail: null, sessionAllowed: sessionAllowedBy(identity) },
  authPool,
);
const adapter = createIdentityAdapter({
  auth: auth.auth,
  identity,
  servedOrigins: config.servedOrigins,
});
const server = await startTestServer({
  environment: environment(),
  handlers: (value) =>
    createHandlers(value, undefined, { store: identity, content, attachments }),
  identity: adapter.resolver,
  protocols: [createAuthProtocol(config, auth.auth)],
});
configureClient(server.baseUrl, undefined);

const email = 'preferences-owner@notes.invalid';
const password = 'owner-password-123456';
await bootstrapOwner({ config, email, name: 'Settings Owner', password });
const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email, password },
});
const cookie = cookieHeader(
  responseOf(signedIn.response).headers.getSetCookie(),
);
const headers = { origin: 'http://127.0.0.1', cookie };

/** The settings that the account answers now. */
async function preferencesNow(): Promise<unknown> {
  const account = await getAccount({ headers });
  assert.equal(account.error, undefined, JSON.stringify(account.error));
  return account.data?.preferences;
}

await test('an account that never chose has its spelling checked', async () => {
  assert.equal(defaultSpellCheck, true);
  assert.deepEqual(await preferencesNow(), {
    appearance: 'system',
    themeFamily: 'default',
    spellCheck: true,
    themes: [],
  });
});

await test('a write keeps every setting that it does not name', async () => {
  const off = await updatePreferences({
    headers,
    body: { spellCheck: false },
  });
  assert.equal(off.error, undefined, JSON.stringify(off.error));
  assert.deepEqual(off.data, {
    appearance: 'system',
    themeFamily: 'default',
    spellCheck: false,
    themes: [],
  });

  // The theme write of a client that knows no spell check leaves it off.
  const theme = await updatePreferences({
    headers,
    body: { appearance: 'dark', themeFamily: 'ink' },
  });
  assert.equal(theme.error, undefined, JSON.stringify(theme.error));
  assert.deepEqual(await preferencesNow(), {
    appearance: 'dark',
    themeFamily: 'ink',
    spellCheck: false,
    themes: [],
  });

  const on = await updatePreferences({ headers, body: { spellCheck: true } });
  assert.equal(on.error, undefined, JSON.stringify(on.error));
  assert.deepEqual(await preferencesNow(), {
    appearance: 'dark',
    themeFamily: 'ink',
    spellCheck: true,
    themes: [],
  });
});

await test('a refused write changes nothing', async () => {
  const empty = await updatePreferences({ headers, body: {} });
  assert.equal(responseOf(empty.response).status, 400);
  const refused = await updatePreferences({
    headers,
    body: { themeFamily: 'Not a slug', spellCheck: false },
  });
  assert.equal(responseOf(refused.response).status, 400);
  assert.deepEqual(await preferencesNow(), {
    appearance: 'dark',
    themeFamily: 'ink',
    spellCheck: true,
    themes: [],
  });
});

await server.close();
await auth.close();
await authPool.end();
await attachments.close();
await content.close();
await identity.close();
await rm(storageRoot, { recursive: true, force: true });
