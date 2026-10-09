/**
 * The Billing section of Settings through the served composition and the
 * built application (record 0211).
 *
 * One installation names an account portal and one names none. Each check
 * reads what the server answers and passes it through the module that the
 * page reads, so the section, its side list and its one action follow the
 * served account. The build is read too, so the words that a person reads are
 * the words that ship.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createOwner,
  getAccount,
  openAccountPortal,
} from '@notesapp/api-client';
import { createApp, loadServerConfig } from '@notesapp/server';
import { directoryFiles } from '../../apps/web/src/pwa/precache.ts';
import {
  settingsSections,
  visibleSettingsSections,
} from '../../apps/web/src/lib/page-sections.ts';
import { portalHome } from '../../apps/web/src/lib/portal.ts';
import { createDisposableDatabase } from './support/database.ts';

const portal = 'https://billing.example.test';
const operatorToken = 'settings-billing-operator-token-0123456789abcdef';
const distribution = join(import.meta.dirname, '../../apps/web/dist/web');

function cookieHeader(values: readonly string[]): string {
  return values
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

/**
 * Runs one installation, with or without a portal, signs its owner in, and
 * hands the session to the check. The installation closes after the check.
 */
async function withInstallation(
  settings: Readonly<Record<string, string>>,
  check: (headers: { origin: string; cookie: string }) => Promise<void>,
): Promise<void> {
  const database = await createDisposableDatabase();
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-billing-test-'));
  const app = await createApp(
    loadServerConfig({
      NOTESAPP_ORIGIN: 'http://127.0.0.1',
      NOTESAPP_DATABASE_URL: database.runtimeUrl,
      NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
      NOTESAPP_STORAGE_ROOT: directory,
      NOTESAPP_AUTH_SECRET: 'settings-billing-test-secret-0123456789',
      NOTESAPP_LOG_LEVEL: 'silent',
      NOTESAPP_MAX_BODY_BYTES: '8388608',
      NOTESAPP_MAX_HEADER_BYTES: '16384',
      NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
      NOTESAPP_RATE_LIMIT_MAX: '10000',
      ...settings,
    }),
  );
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address: string | AddressInfo | null = app.server.address();
    if (address === null || typeof address === 'string')
      throw new Error('The test server did not bind a TCP port.');
    configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
    const origin = { origin: 'http://127.0.0.1' };
    const created = await createOwner({
      headers: origin,
      body: { email: 'owner@notes.invalid', password: 'owner-password-123456' },
    });
    assert.equal(created.response?.status, 201);
    await check({
      ...origin,
      cookie: cookieHeader(created.response?.headers.getSetCookie() ?? []),
    });
  } finally {
    await app.close();
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}

/** The keys of the sections that Settings shows for the served account. */
async function servedSections(headers: {
  origin: string;
  cookie: string;
}): Promise<readonly string[]> {
  const account = await getAccount({ headers });
  assert.ok(account.data !== undefined, JSON.stringify(account.error));
  return visibleSettingsSections(account.data).map((section) => section.key);
}

await test('an installation with a portal shows Billing, and Open billing opens the portal', async () => {
  await withInstallation(
    {
      NOTESAPP_OPERATOR_TOKEN: operatorToken,
      NOTESAPP_ACCOUNT_PORTAL_URL: portal,
    },
    async (headers) => {
      const keys = await servedSections(headers);
      assert.deepEqual(
        keys,
        settingsSections.map((section) => section.key),
      );
      assert.equal(keys.indexOf('billing'), keys.indexOf('account') + 1);
      // Open billing asks for the root of the portal, and the answer leaves
      // for the portal with a single-use token.
      const opened = await openAccountPortal({
        headers,
        body: { path: portalHome },
      });
      assert.equal(opened.error, undefined, JSON.stringify(opened.error));
      const url = new URL(opened.data?.url ?? 'http://x/');
      assert.equal(url.origin, portal);
      assert.equal(url.pathname, '/');
      assert.notEqual(url.searchParams.get('token') ?? '', '');
    },
  );
});

await test('an installation with no portal shows no Billing section', async () => {
  await withInstallation({}, async (headers) => {
    const keys = await servedSections(headers);
    assert.ok(!keys.includes('billing'));
    assert.deepEqual(
      keys,
      settingsSections
        .map((section) => section.key)
        .filter((key) => key !== 'billing'),
    );
    const opened = await openAccountPortal({
      headers,
      body: { path: portalHome },
    });
    assert.equal(opened.response?.status, 404);
  });
});

await test('the built application names the portal Billing and the removal Delete', async () => {
  const files = await directoryFiles(distribution);
  assert.ok(
    files.length > 0,
    'The browser build is absent. Run pnpm build before this test.',
  );
  const scripts = await Promise.all(
    files
      .filter((file) => file.url.endsWith('.js'))
      .map((file) => readFile(join(distribution, file.url), 'utf8')),
  );
  const shipped = scripts.join('\n');
  for (const words of [
    'Open billing',
    'See and change your plan, your payment method and your invoices.',
    'Delete my account',
  ])
    assert.ok(shipped.includes(words), words);
  // The old names would send a person to a control that no longer exists.
  for (const words of ['Open the account portal', 'Remove my account'])
    assert.ok(!shipped.includes(words), words);
});
