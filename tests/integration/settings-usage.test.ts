/** The Settings meters use the limits and use that the real server answers. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createOwner,
  getAccount,
  setOperatorAccountControls,
} from '@notesapp/api-client';
import { createApp, loadServerConfig } from '@notesapp/server';
import { meterClassNames, meterWidthClassName } from '@notesapp/ui';
import { directoryFiles } from '../../apps/web/src/pwa/precache.ts';
import { formatBytes, storageLine } from '../../apps/web/src/lib/accounts.ts';
import { transferUsage } from '../../apps/web/src/lib/monthly-limits.ts';
import { createDisposableDatabase } from './support/database.ts';

await test('Settings meters follow served account limits, and absent transfer limits have no meter', async () => {
  const database = await createDisposableDatabase();
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-settings-usage-'));
  const token = 'settings-usage-operator-token-0123456789abcdef';
  const app = await createApp(
    loadServerConfig({
      NOTESAPP_ORIGIN: 'http://127.0.0.1',
      NOTESAPP_DATABASE_URL: database.runtimeUrl,
      NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
      NOTESAPP_STORAGE_ROOT: directory,
      NOTESAPP_AUTH_SECRET: 'settings-usage-secret-0123456789abcdef',
      NOTESAPP_OPERATOR_TOKEN: token,
      NOTESAPP_LOG_LEVEL: 'silent',
      NOTESAPP_MAX_BODY_BYTES: '8388608',
      NOTESAPP_MAX_HEADER_BYTES: '16384',
      NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
      NOTESAPP_RATE_LIMIT_MAX: '10000',
    }),
  );
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    assert.ok(address !== null && typeof address !== 'string');
    configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
    const created = await createOwner({
      headers: { origin: 'http://127.0.0.1' },
      body: { email: 'owner@notes.invalid', password: 'owner-password-123456' },
    });
    assert.equal(created.response?.status, 201);
    const headers = {
      cookie: (created.response?.headers.getSetCookie() ?? [])
        .map((value) => value.split(';')[0] ?? '')
        .join('; '),
    };
    const first = await getAccount({ headers });
    assert.ok(first.data !== undefined, JSON.stringify(first.error));
    const storedBytes = first.data.storage.usedBytes;
    const downloadedBytes = Number(
      first.response?.headers.get('content-length'),
    );
    assert.ok(
      downloadedBytes > 0,
      'The first account read counts toward downloads.',
    );
    assert.ok(storedBytes > 0, 'The new account holds its initial notes.');
    assert.deepEqual(transferUsage(first.data.month, first.data.controls), []);
    const changed = await setOperatorAccountControls({
      headers: { authorization: `Bearer ${token}` },
      path: { accountId: first.data.accountId },
      body: {
        revision: first.data.controls.revision,
        limitBytes: storedBytes,
        publishedTransferLimitBytes: 2048,
        downloadLimitBytes: 4096,
      },
    });
    assert.equal(changed.error, undefined, JSON.stringify(changed.error));
    const answer = await getAccount({ headers });
    assert.ok(answer.data !== undefined, JSON.stringify(answer.error));
    const account = answer.data;
    const uses = [
      {
        label: 'Storage',
        value: account.storage.usedBytes,
        max: account.storage.limitBytes,
        text: storageLine(account.storage),
      },
      ...transferUsage(account.month, account.controls),
    ];
    assert.deepEqual(
      uses.map((use) => [use.label, use.max]),
      [
        ['Storage', storedBytes],
        ['Published pages transfer this month', 2048],
        ['Downloads this month', 4096],
      ],
    );
    assert.deepEqual(
      uses.map((use) => use.value),
      [storedBytes, 0, downloadedBytes],
    );
    assert.equal(
      meterWidthClassName(
        account.storage.usedBytes,
        account.storage.limitBytes,
      ),
      'w-full',
    );
    assert.equal(
      meterWidthClassName(account.month.publishedTransferBytes, 2048),
      'w-0',
    );
    assert.notEqual(
      meterWidthClassName(account.month.downloadBytes, 4096),
      'w-0',
    );
    assert.deepEqual(
      uses.map((use) => use.text),
      [
        `${formatBytes(storedBytes)} of ${formatBytes(storedBytes)} used`,
        'This month: 0 bytes of 2 KB sent by published pages',
        `This month: ${formatBytes(downloadedBytes)} of 4 KB downloaded`,
      ],
    );
    const files = await directoryFiles(
      join(import.meta.dirname, '../../apps/web/dist/web'),
    );
    const screen = files.find((file) =>
      /\/account-settings-[^/]+\.js$/.test(file.url),
    );
    assert.ok(screen !== undefined);
    const script = await app.inject({
      method: 'GET',
      url: screen.url,
      headers: { host: '127.0.0.1' },
    });
    assert.equal(script.statusCode, 200);
    assert.ok(script.body.includes('Storage'));
    const scripts = await Promise.all(
      files
        .filter((file) => file.url.endsWith('.js'))
        .map(async (file) => {
          const served = await app.inject({
            method: 'GET',
            url: file.url,
            headers: { host: '127.0.0.1' },
          });
          assert.equal(served.statusCode, 200);
          return served.body;
        }),
    );
    const shipped = scripts.join('\n');
    assert.match(shipped, /role:["'`]meter["'`]/);
    for (const use of uses) assert.ok(shipped.includes(use.label), use.label);
    for (const attribute of [
      'aria-valuemin',
      'aria-valuemax',
      'aria-valuenow',
      'aria-valuetext',
      'Almost full',
    ])
      assert.ok(shipped.includes(attribute), attribute);
    // The real server serves the stylesheet that paints each whole class.
    const shell = await app.inject({
      method: 'GET',
      url: '/settings',
      headers: { host: '127.0.0.1' },
    });
    assert.equal(shell.statusCode, 200);
    const href = /href="([^"]+\.css)"/.exec(shell.body)?.[1];
    assert.ok(href !== undefined);
    const stylesheet = await app.inject({
      method: 'GET',
      url: href,
      headers: { host: '127.0.0.1' },
    });
    assert.equal(stylesheet.statusCode, 200);
    for (let value = 0; value <= 12; value += 1)
      for (const classes of Object.values(meterClassNames(value, 12)))
        for (const name of classes.split(' ')) {
          const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)}`;
          assert.ok(stylesheet.body.includes(selector), name);
        }
  } finally {
    await app.close();
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});
