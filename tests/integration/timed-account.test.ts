import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createOwner,
  createInvitation,
  registerAccount,
  getAccount,
  getSetupStatus,
  createApiKey,
  createPublishedLink,
  getPublishedPage,
  listFiles,
  listWorkspaces,
  inspectWorkspaceExport,
  exportWorkspace,
  readOperatorAccount,
  setOperatorAccountControls,
} from '@notesapp/api-client';
import { createApp, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase, openSession } from './support/database.ts';

const database = await createDisposableDatabase();
const directory = await mkdtemp(join(tmpdir(), 'notesapp-trial-test-'));
const operatorToken = `operator-${randomUUID()}-${randomUUID()}`;
const app = await createApp(
  loadServerConfig({
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: directory,
    NOTESAPP_AUTH_SECRET: 'trial-account-test-secret-0123456789',
    NOTESAPP_LOG_LEVEL: 'silent',
    NOTESAPP_MAX_BODY_BYTES: '8388608',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_BREACH_CHECK: 'off',
    NOTESAPP_RATE_LIMIT_MAX: '10000',
    NOTESAPP_ACCOUNT_LIMIT_BYTES: '10000000000',
    NOTESAPP_NEW_ACCOUNT_TEXT_LIMIT_BYTES: '2000000000',
    NOTESAPP_NEW_ACCOUNT_PUBLISHED_TRANSFER_LIMIT_BYTES: '10000000000',
    NOTESAPP_NEW_ACCOUNT_DOWNLOAD_LIMIT_BYTES: '20000000000',
    NOTESAPP_NEW_ACCOUNT_TEAMS: 'false',
    NOTESAPP_NEW_ACCOUNT_COLLABORATION: 'false',
    NOTESAPP_NEW_ACCOUNT_TRIAL_SECONDS: '1209600',
    NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER: '30d',
    NOTESAPP_OPERATOR_TOKEN: operatorToken,
    NOTESAPP_ACCOUNT_PORTAL_URL: 'https://billing.example.test',
  }),
);
await app.listen({ host: '127.0.0.1', port: 0 });
const address = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('No test port.');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
const origin = { origin: 'http://127.0.0.1' };
const operator = { authorization: `Bearer ${operatorToken}` };
function cookies(response: Response | undefined): string {
  assert.ok(response);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
try {
  await test('trial authorization covers an existing session and API key before the sweep; locked export remains available', async () => {
    assert.equal(
      (await getSetupStatus()).data?.newAccountTrialSeconds,
      1209600,
    );
    const first = await createOwner({
      headers: origin,
      body: {
        email: 'trial-admin@notes.invalid',
        password: 'trial-admin-safe-password',
      },
    });
    assert.equal(first.response?.status, 201);
    const admin = { ...origin, cookie: cookies(first.response) };
    const adminAccount = await getAccount({ headers: admin });
    assert.equal(adminAccount.data?.controls.trialState, 'none');
    assert.equal(adminAccount.data?.controls.trialEndsAt, null);
    assert.equal(adminAccount.data?.controls.textLimitBytes, null);
    assert.equal(adminAccount.data?.controls.publishedTransferLimitBytes, null);
    assert.equal(adminAccount.data?.controls.downloadLimitBytes, null);
    assert.deepEqual(adminAccount.data?.controls.features, {
      teams: true,
      collaboration: true,
    });
    const invite = await createInvitation({
      headers: admin,
      body: { email: 'trial-member@notes.invalid' },
    });
    assert.ok(invite.data?.link);
    const registered = await registerAccount({
      headers: origin,
      body: {
        invitation: new URL(invite.data.link).hash.slice(1),
        password: 'trial-member-safe-password',
      },
    });
    assert.equal(registered.response?.status, 201);
    const headers = { ...origin, cookie: cookies(registered.response) };
    const account = (await getAccount({ headers })).data;
    assert.ok(account);
    assert.equal(account.controls.trialState, 'active');
    assert.equal(account.controls.standing, 'active');
    assert.equal(account.controls.removalAt, null);
    assert.equal(account.controls.limitBytes, 10000000000);
    assert.equal(account.controls.textLimitBytes, 2000000000);
    assert.equal(account.controls.publishedTransferLimitBytes, 10000000000);
    assert.equal(account.controls.downloadLimitBytes, 20000000000);
    assert.deepEqual(account.controls.features, {
      teams: false,
      collaboration: false,
    });
    const listed = await listWorkspaces({ headers });
    const workspaceId = listed.data?.workspaces[0]?.workspaceId;
    assert.ok(workspaceId);
    const notes = await listFiles({ headers, path: { workspaceId } });
    const fileId = notes.data?.files[0]?.fileId;
    assert.ok(fileId);
    const published = await createPublishedLink({
      headers,
      path: { workspaceId },
      body: { scope: { kind: 'note', fileId } },
    });
    assert.ok(published.data);
    const token = published.data.token;
    const publicRead = async (): Promise<string> =>
      String((await getPublishedPage({ path: { token } })).data ?? '');
    assert.ok(!(await publicRead()).includes('This link is not available.'));
    const key = (await createApiKey({ headers, body: { name: 'Trial key' } }))
      .data;
    assert.ok(key);
    const keyHeaders = { authorization: `Bearer ${key.token}` };
    assert.equal(
      (await listFiles({ headers: keyHeaders, path: { workspaceId } })).response
        ?.status,
      200,
    );
    const setup = await openSession(database.migrationUrl);
    try {
      await setup.query(
        'update accounts set trial_ends_at=statement_timestamp() where id=$1',
        [account.accountId],
      );
    } finally {
      await setup.close();
    }
    for (const auth of [headers, keyHeaders]) {
      assert.equal(
        (await listFiles({ headers: auth, path: { workspaceId } })).response
          ?.status,
        423,
      );
    }
    assert.ok((await publicRead()).includes('This link is not available.'));
    const expired = (await getAccount({ headers })).data;
    assert.equal(expired?.controls.trialState, 'expired');
    assert.equal(expired?.controls.standing, 'locked');
    assert.ok(expired?.controls.removalAt);
    assert.equal(
      (await inspectWorkspaceExport({ headers, path: { workspaceId } }))
        .response?.status,
      200,
    );
    assert.equal(
      (await exportWorkspace({ headers, path: { workspaceId } })).response
        ?.status,
      200,
    );
    const current = (
      await readOperatorAccount({
        headers: operator,
        path: { accountId: account.accountId },
      })
    ).data;
    assert.ok(current);
    assert.equal(current.controls.trialState, 'expired');
    const paid = await setOperatorAccountControls({
      headers: operator,
      path: { accountId: account.accountId },
      body: { revision: current.controls.revision, standing: 'active' },
    });
    assert.equal(paid.response?.status, 200);
    assert.equal(paid.data?.controls.trialState, 'ended');
    assert.ok(!(await publicRead()).includes('This link is not available.'));
    assert.equal(
      (await listFiles({ headers: keyHeaders, path: { workspaceId } })).response
        ?.status,
      200,
    );
  });
} finally {
  await app.close();
  await database.destroy();
  await rm(directory, { recursive: true, force: true });
}
