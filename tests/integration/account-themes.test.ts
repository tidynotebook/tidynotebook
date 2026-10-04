/**
 * The themes that an account imports, against a real server and database
 * (record 0143).
 *
 * The file of a registered family goes through the one reader of the client,
 * then through the served operations with a real session. This file proves
 * that the account keeps the theme and answers it with its settings, that the
 * contract refuses a colour that is not hex, that the account keeps no more
 * than its limit, that a delete of the theme in use takes the default family
 * back, and that the row policy hides one account's themes from another.
 *
 * Start the service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import {
  configureClient,
  deleteTheme,
  getAccount,
  importTheme,
  signInWithPassword,
  updatePreferences,
} from '@notesapp/api-client';
import {
  customThemeLimit,
  importedFamilyPrefix as coreImportedFamilyPrefix,
} from '@notesapp/core';
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
  openFileObjectStore,
  openIdentityStore,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import {
  findThemeFamily,
  importedFamilyPrefix,
  readThemeFile,
  themeFileText,
  themeNameMaximumLength,
  type ThemeFileData,
} from '@notesapp/ui';
import { createDisposableDatabase } from './support/database.ts';
import { startTestServer } from './support/server.ts';

const root = resolve(fileURLToPath(import.meta.url), '../../..');

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
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-themes-'));
const environment = (): Record<string, string> => ({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'themes-test-secret-value-0123456789abcdef',
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
const attachments = openAttachmentStore(
  database.runtimeUrl,
  openFileObjectStore(storageRoot),
  {
    poolSize: 2,
  },
);
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

const email = 'themes-owner@notes.invalid';
const password = 'owner-password-123456';
await bootstrapOwner({ config, email, name: 'Theme Owner', password });
const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email, password },
});
const cookie = cookieHeader(
  responseOf(signedIn.response).headers.getSetCookie(),
);
const headers = { origin: 'http://127.0.0.1', cookie };

/** The theme file of one registered family, read by the client reader. */
function themeFrom(familyId: string, name: string): ThemeFileData {
  const family = findThemeFamily(familyId);
  assert.ok(family !== null);
  const read = readThemeFile(themeFileText(family));
  assert.ok(read.ok, JSON.stringify(read));
  return { ...read.theme, name };
}

/** The body of an import, which states only the palettes that it has. */
function importBody(theme: ThemeFileData) {
  return {
    name: theme.name,
    ...(theme.light === undefined ? {} : { light: theme.light }),
    ...(theme.dark === undefined ? {} : { dark: theme.dark }),
  };
}

await test('an imported theme follows the account with its settings', async () => {
  const theme = themeFrom('nord', 'Harbour');
  const imported = await importTheme({ headers, body: importBody(theme) });
  assert.equal(imported.error, undefined, JSON.stringify(imported.error));
  assert.equal(responseOf(imported.response).status, 201);
  const kept = imported.data?.themes ?? [];
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.name, 'Harbour');
  assert.deepEqual(kept[0]?.dark, theme.dark);
  assert.deepEqual(kept[0]?.light, theme.light);
  const account = await getAccount({ headers });
  assert.deepEqual(account.data?.preferences.themes, kept);
});

await test('a name counts characters on the client, the contract and the database', async () => {
  // One emoji is two UTF-16 units. The reader of the client, the contract and
  // the database all count it once, so a name at the limit is kept.
  const name = '🌊'.repeat(themeNameMaximumLength);
  const theme = themeFrom('nord', name);
  const kept = await importTheme({ headers, body: importBody(theme) });
  assert.equal(kept.error, undefined, JSON.stringify(kept.error));
  const added = (kept.data?.themes ?? []).find((entry) => entry.name === name);
  assert.ok(added !== undefined);
  const removed = await deleteTheme({
    headers,
    path: { themeId: added.themeId },
  });
  assert.equal(removed.error, undefined, JSON.stringify(removed.error));
});

await test('a colour that is not hex is refused and nothing is kept', async () => {
  const theme = themeFrom('default', 'Broken');
  const dark = theme.dark;
  assert.ok(dark !== undefined);
  const refused = await importTheme({
    headers,
    body: {
      name: 'Broken',
      dark: { ...dark, tokens: { ...dark.tokens, text: 'white' } },
    },
  });
  assert.equal(responseOf(refused.response).status, 400);
  const account = await getAccount({ headers });
  assert.equal(account.data?.preferences.themes.length, 1);
});

await test('a delete of the theme in use takes the default family back', async () => {
  const theme = themeFrom('gruvbox', 'In use');
  const imported = await importTheme({ headers, body: importBody(theme) });
  const added = (imported.data?.themes ?? []).find(
    (entry) => entry.name === 'In use',
  );
  assert.ok(added !== undefined);
  const chosen = await updatePreferences({
    headers,
    body: { themeFamily: `custom-${added.themeId}` },
  });
  assert.equal(chosen.error, undefined, JSON.stringify(chosen.error));
  assert.equal(chosen.data?.themeFamily, `custom-${added.themeId}`);
  const removed = await deleteTheme({
    headers,
    path: { themeId: added.themeId },
  });
  assert.equal(removed.error, undefined, JSON.stringify(removed.error));
  assert.equal(removed.data?.themeFamily, 'default');
  assert.ok(
    !(removed.data?.themes ?? []).some(
      (entry) => entry.themeId === added.themeId,
    ),
  );
  const again = await deleteTheme({
    headers,
    path: { themeId: added.themeId },
  });
  assert.equal(responseOf(again.response).status, 404);
});

await test('a device that missed a delete cannot name the removed theme again', async () => {
  const theme = themeFrom('dracula', 'Removed');
  const imported = await importTheme({ headers, body: importBody(theme) });
  const added = (imported.data?.themes ?? []).find(
    (entry) => entry.name === 'Removed',
  );
  assert.ok(added !== undefined);
  const family = `custom-${added.themeId}`;
  const chosen = await updatePreferences({
    headers,
    body: { themeFamily: family },
  });
  assert.equal(chosen.error, undefined, JSON.stringify(chosen.error));
  const removed = await deleteTheme({
    headers,
    path: { themeId: added.themeId },
  });
  assert.equal(removed.data?.themeFamily, 'default');
  // The other device still names the theme in its next appearance change.
  const stale = await updatePreferences({
    headers,
    body: { appearance: 'dark', themeFamily: family },
  });
  assert.equal(responseOf(stale.response).status, 403);
  const account = await getAccount({ headers });
  assert.equal(account.data?.preferences.themeFamily, 'default');
});

await test('the account keeps no more themes than its limit', async () => {
  const theme = themeFrom('one', 'Many');
  const before = (await getAccount({ headers })).data?.preferences.themes;
  for (let count = before?.length ?? 0; count < customThemeLimit; count += 1) {
    const kept = await importTheme({ headers, body: importBody(theme) });
    assert.equal(kept.error, undefined, JSON.stringify(kept.error));
  }
  const over = await importTheme({ headers, body: importBody(theme) });
  assert.equal(responseOf(over.response).status, 409);
  assert.equal(
    over.error !== undefined && 'code' in over.error ? over.error.code : '',
    'theme_limit',
  );
});

await test('the row policy hides the themes of one account from another', async () => {
  const client = new pg.Client({ connectionString: database.runtimeUrl });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('notesapp.account_id', $1, true)", [
      randomUUID(),
    ]);
    const seen = await client.query('select id from account_themes');
    assert.deepEqual(seen.rows, []);
    await client.query('rollback');
  } finally {
    await client.end();
  }
});

await test('the client, the core and the contract state one set of bounds', async () => {
  // The browser reader cannot import the contract or the core, so the three
  // statements of the name length and of the count meet here.
  const [name, preferences] = await Promise.all([
    readFile(
      join(root, 'packages/api-contract/components/schemas/ThemeName.yaml'),
      'utf8',
    ),
    readFile(
      join(root, 'packages/api-contract/components/schemas/Preferences.yaml'),
      'utf8',
    ),
  ]);
  assert.match(
    name,
    new RegExp(`maxLength: ${String(themeNameMaximumLength)}\\n`),
  );
  assert.match(
    preferences,
    new RegExp(`maxItems: ${String(customThemeLimit)}\\n`),
  );
  // The family of an imported theme has one prefix on both sides.
  assert.equal(coreImportedFamilyPrefix, importedFamilyPrefix);
});

await server.close();
await auth.close();
await authPool.end();
await attachments.close();
await content.close();
await identity.close();
await rm(storageRoot, { recursive: true, force: true });
