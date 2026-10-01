/**
 * Registration by invitation and administration, through the served
 * composition (records 0108 to 0112).
 *
 * The server runs with no mail transport, so an invitation answers its link
 * once. Each check reads what a person gets: the status, the problem code,
 * and whether a session works afterwards.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createInvitation,
  createOwner,
  getAccount,
  getInstallation,
  listAccounts,
  listInvitations,
  readInvitation,
  registerAccount,
  removeAccount,
  removeOwnAccount,
  revokeInvitation,
  signInWithPassword,
  updateAccount,
  updateInstallation,
} from '@notesapp/api-client';
import { defaultAccountLimitBytes } from '@notesapp/core';
import {
  createApp,
  createAuth,
  createAuthPool,
  inviteAccount,
  loadServerConfig,
  promoteAccount,
  registerIdentity,
  type MailMessage,
} from '@notesapp/server';
import { openIdentityStore } from '@notesapp/storage-server';
import { createDisposableDatabase, openSession } from './support/database.ts';

function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

/** The stable application error code of a failed generated call. */
function problemOf(error: unknown): Record<string, unknown> {
  if (error === null || typeof error !== 'object') return {};
  return Object.fromEntries(Object.entries(error));
}

function cookieHeader(values: readonly string[]): string {
  return values
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-admin-test-'));
const environment = {
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'administration-test-secret-0123456789',
  NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '8388608',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
  // Each check signs in often, so the attempt limit stays out of the way.
  NOTESAPP_RATE_LIMIT_MAX: '10000',
};
const config = loadServerConfig(environment);
const app = await createApp(config);
await app.listen({ host: '127.0.0.1', port: 0 });
const address: string | AddressInfo | null = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('The test server did not bind a TCP port.');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
const origin = { origin: 'http://127.0.0.1' };

/** Signs in and answers the cookie, or an empty text when refused. */
async function signIn(email: string, password: string): Promise<string> {
  const signed = await signInWithPassword({
    headers: origin,
    body: { email, password },
  });
  if (responseOf(signed.response).status !== 200) return '';
  return cookieHeader(responseOf(signed.response).headers.getSetCookie());
}

/** The token that an invitation link carries in its fragment. */
function tokenOf(link: string | null | undefined): string {
  const token = new URL(link ?? 'http://x/').hash.slice(1);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  return token;
}

const adminEmail = 'admin@notes.invalid';
const adminPassword = 'admin-password-123456';
const created = await createOwner({
  headers: origin,
  body: { email: adminEmail, password: adminPassword },
});
assert.equal(responseOf(created.response).status, 201);
const admin = {
  ...origin,
  cookie: cookieHeader(responseOf(created.response).headers.getSetCookie()),
};

/** Invites one address as the administrator and answers its token. */
async function invite(email: string): Promise<string> {
  const made = await createInvitation({ headers: admin, body: { email } });
  assert.equal(made.error, undefined, JSON.stringify(made.error));
  assert.equal(made.data?.invitation.email, email);
  assert.equal(made.data?.invitation.mailed, false);
  return tokenOf(made.data?.link);
}

/** Invites and registers one member, and answers its session. */
async function member(): Promise<{
  email: string;
  password: string;
  headers: { origin: string; cookie: string };
  accountId: string;
}> {
  const email = `member-${randomUUID()}@notes.invalid`;
  const password = 'member-password-123456';
  const token = await invite(email);
  const registered = await registerAccount({
    headers: origin,
    body: { invitation: token, password, name: 'Member' },
  });
  assert.equal(responseOf(registered.response).status, 201);
  const headers = {
    ...origin,
    cookie: cookieHeader(
      responseOf(registered.response).headers.getSetCookie(),
    ),
  };
  const account = await getAccount({ headers });
  assert.equal(account.error, undefined);
  return { email, password, headers, accountId: account.data?.accountId ?? '' };
}

await test('the first account is an administrator with the default limit', async () => {
  const account = await getAccount({ headers: admin });
  assert.equal(account.data?.installationRole, 'administrator');
  assert.equal(
    account.data?.storage.limitBytes,
    Number(defaultAccountLimitBytes),
  );
  assert.ok((account.data?.storage.usedBytes ?? 0) > 0, 'the welcome note');
  const installation = await getInstallation({ headers: admin });
  assert.deepEqual(installation.data, {
    registrationPolicy: 'invitation',
    mailConfigured: false,
    invitationLifetimeHours: config.accounts.invitationLifetimeHours,
    defaultLimitBytes: Number(defaultAccountLimitBytes),
    mail: {
      source: 'none',
      host: null,
      port: null,
      security: null,
      username: null,
      sender: null,
      passwordStored: false,
    },
    legalDocuments: { source: 'none', terms: null, privacy: null },
  });
});

await test('an invited person reads the address and makes a member account', async () => {
  const email = `joiner-${randomUUID()}@notes.invalid`;
  const token = await invite(email);
  const read = await readInvitation({
    headers: origin,
    body: { invitation: token },
  });
  assert.deepEqual(read.data, { email });
  const registered = await registerAccount({
    headers: origin,
    body: { invitation: token, password: 'joiner-password-123456' },
  });
  assert.equal(responseOf(registered.response).status, 201);
  const cookie = cookieHeader(
    responseOf(registered.response).headers.getSetCookie(),
  );
  const account = await getAccount({ headers: { ...origin, cookie } });
  assert.equal(account.data?.email, email);
  assert.equal(account.data?.installationRole, 'member');
  // The person signs in again with the password they chose.
  assert.notEqual(await signIn(email, 'joiner-password-123456'), '');
});

await test('a used, revoked or unknown invitation answers the same refusal', async () => {
  const email = `refusal-${randomUUID()}@notes.invalid`;
  const used = await invite(email);
  const first = await registerAccount({
    headers: origin,
    body: { invitation: used, password: 'refusal-password-12345' },
  });
  assert.equal(responseOf(first.response).status, 201);
  const revokedEmail = `revoked-${randomUUID()}@notes.invalid`;
  const made = await createInvitation({
    headers: admin,
    body: { email: revokedEmail },
  });
  const revoked = tokenOf(made.data?.link);
  const revoke = await revokeInvitation({
    headers: admin,
    path: { invitationId: made.data?.invitation.invitationId ?? '' },
  });
  assert.equal(responseOf(revoke.response).status, 200);
  const unknown = 'A'.repeat(43);
  const answers = [];
  for (const token of [used, revoked, unknown]) {
    const read = await readInvitation({
      headers: origin,
      body: { invitation: token },
    });
    const registered = await registerAccount({
      headers: origin,
      body: { invitation: token, password: 'another-password-12345' },
    });
    for (const answer of [read, registered]) {
      const problem = problemOf(answer.error);
      assert.equal(responseOf(answer.response).status, 403);
      assert.equal(problem['code'], 'invitation_invalid');
      answers.push(`${String(problem['title'])} ${String(problem['detail'])}`);
    }
  }
  // Every refusal reads the same, so none says which cause applied.
  assert.equal(new Set(answers).size, 1);
});

await test('two acceptances of one invitation make one account and leave nothing else', async () => {
  const email = `race-${randomUUID()}@notes.invalid`;
  const token = await invite(email);
  const passwords = ['race-password-aaaaaa', 'race-password-bbbbbb'];
  const results = await Promise.all(
    passwords.map((password) =>
      registerAccount({
        headers: origin,
        body: { invitation: token, password },
      }),
    ),
  );
  const statuses = results.map((entry) => responseOf(entry.response).status);
  assert.deepEqual(
    [...statuses].sort((left, right) => left - right),
    [201, 403],
  );
  const winner = passwords[statuses.indexOf(201)] ?? '';
  const loser = passwords[statuses.indexOf(403)] ?? '';
  assert.notEqual(await signIn(email, winner), '');
  assert.equal(await signIn(email, loser), '');
  const session = await openSession(database.migrationUrl);
  try {
    const users = await session.query(
      'select 1 from auth_user where email = $1',
      [email],
    );
    assert.equal(users.length, 1);
  } finally {
    await session.close();
  }
});

await test('a failed link deletes the identity user that it made', async () => {
  const pool = createAuthPool(config);
  const auth = createAuth(
    config,
    {
      mail: null,
      allowSignUp: true,
      sessionAllowed: () => Promise.resolve(false),
    },
    pool,
  );
  const email = `compensated-${randomUUID()}@notes.invalid`;
  try {
    // A store that refuses every ground, as the database refuses a used
    // invitation after the identity user exists.
    const refused = await registerIdentity(
      auth.auth,
      {
        register: () => Promise.resolve(null),
        invitationAddress: () => Promise.resolve(email),
        accountOf: () => Promise.resolve(null),
        registrationPolicy: () => Promise.resolve('invitation'),
      },
      {
        email,
        name: 'Compensated',
        password: 'compensated-password-1',
        ground: { kind: 'invitation', tokenDigest: 'c'.repeat(64) },
        limitBytes: defaultAccountLimitBytes,
      },
    );
    assert.deepEqual(refused, {
      ok: false,
      error: { code: 'invitation_invalid', fileIds: [] },
    });
    const session = await openSession(database.migrationUrl);
    try {
      const users = await session.query(
        'select 1 from auth_user where email = $1',
        [email],
      );
      assert.equal(users.length, 0);
    } finally {
      await session.close();
    }
  } finally {
    await auth.close();
    await pool.end();
  }
});

await test('a member reaches no administration operation', async () => {
  const joined = await member();
  for (const answer of [
    await listAccounts({ headers: joined.headers }),
    await listInvitations({ headers: joined.headers }),
    await getInstallation({ headers: joined.headers }),
    await createInvitation({
      headers: joined.headers,
      body: { email: `x-${randomUUID()}@notes.invalid` },
    }),
    await updateAccount({
      headers: joined.headers,
      path: { accountId: joined.accountId },
      body: { installationRole: 'administrator' },
    }),
  ]) {
    assert.equal(responseOf(answer.response).status, 403);
    assert.equal(problemOf(answer.error)['code'], 'forbidden');
  }
});

await test('a disabled member loses the session and cannot sign in until enabled', async () => {
  const joined = await member();
  const disabled = await updateAccount({
    headers: admin,
    path: { accountId: joined.accountId },
    body: { state: 'disabled' },
  });
  assert.equal(disabled.data?.state, 'disabled');
  const after = await getAccount({ headers: joined.headers });
  assert.equal(responseOf(after.response).status, 401);
  const refused = await signInWithPassword({
    headers: origin,
    body: { email: joined.email, password: joined.password },
  });
  // The refusal names the cause, so the person asks an administrator.
  assert.equal(responseOf(refused.response).status, 403);
  assert.equal(problemOf(refused.error)['code'], 'account_unavailable');
  const enabled = await updateAccount({
    headers: admin,
    path: { accountId: joined.accountId },
    body: { state: 'enabled' },
  });
  assert.equal(enabled.data?.state, 'enabled');
  assert.notEqual(await signIn(joined.email, joined.password), '');
});

await test('the last enabled administrator cannot demote or remove themselves', async () => {
  const self = (await getAccount({ headers: admin })).data?.accountId ?? '';
  const demoted = await updateAccount({
    headers: admin,
    path: { accountId: self },
    body: { installationRole: 'member' },
  });
  assert.equal(responseOf(demoted.response).status, 409);
  assert.equal(problemOf(demoted.error)['code'], 'last_administrator');
  const removed = await removeOwnAccount({
    headers: admin,
    body: { password: adminPassword },
  });
  assert.equal(responseOf(removed.response).status, 409);
  assert.equal(problemOf(removed.error)['code'], 'last_administrator');
  assert.equal(
    (await getAccount({ headers: admin })).data?.installationRole,
    'administrator',
  );
});

await test('open registration names every part the installation lacks', async () => {
  const refused = await updateInstallation({
    headers: admin,
    body: { registrationPolicy: 'open' },
  });
  assert.equal(responseOf(refused.response).status, 422);
  const problem = problemOf(refused.error);
  assert.equal(problem['code'], 'open_registration_unavailable');
  assert.deepEqual(problem['missing'], [
    'mail',
    'published-origin',
    'legal-documents',
  ]);
  const kept = await updateInstallation({
    headers: admin,
    body: { registrationPolicy: 'invitation' },
  });
  assert.equal(kept.data?.registrationPolicy, 'invitation');
});

await test('a person removes their own account with the password', async () => {
  const joined = await member();
  const wrong = await removeOwnAccount({
    headers: joined.headers,
    body: { password: 'not-the-password-123' },
  });
  assert.equal(responseOf(wrong.response).status, 403);
  const removed = await removeOwnAccount({
    headers: joined.headers,
    body: { password: joined.password },
  });
  assert.equal(responseOf(removed.response).status, 200);
  assert.equal(
    responseOf((await getAccount({ headers: joined.headers })).response).status,
    401,
  );
  assert.equal(await signIn(joined.email, joined.password), '');
  const listed = await listAccounts({ headers: admin });
  assert.ok(
    !(listed.data?.accounts ?? []).some(
      (entry) => entry.accountId === joined.accountId,
    ),
  );
});

await test('an administrator removes another account and lists the rest', async () => {
  const joined = await member();
  const listed = await listAccounts({ headers: admin });
  const seen = listed.data?.accounts.find(
    (entry) => entry.accountId === joined.accountId,
  );
  assert.equal(seen?.email, joined.email);
  assert.equal(seen?.self, false);
  assert.ok(seen?.lastActiveAt !== null);
  assert.equal(listed.data?.accounts.filter((entry) => entry.self).length, 1);
  const removed = await removeAccount({
    headers: admin,
    path: { accountId: joined.accountId },
  });
  assert.equal(responseOf(removed.response).status, 200);
  assert.equal(
    responseOf((await getAccount({ headers: joined.headers })).response).status,
    401,
  );
  const again = await removeAccount({
    headers: admin,
    path: { accountId: joined.accountId },
  });
  assert.equal(responseOf(again.response).status, 404);
});

await test('the operator invites by mail or prints the link, and promotes', async () => {
  const sent: MailMessage[] = [];
  const mailed = await inviteAccount({
    config,
    email: `Mailed-${randomUUID()}@Notes.Invalid`,
    mail: {
      send: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    },
  });
  assert.equal(mailed.link, null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, mailed.email);
  const mailedToken = tokenOf(
    (sent[0]?.text ?? '').split('\n').find((line) => line.startsWith('http')),
  );
  const read = await readInvitation({
    headers: origin,
    body: { invitation: mailedToken },
  });
  assert.equal(read.data?.email, mailed.email);

  const printed = await inviteAccount({
    config,
    email: `printed-${randomUUID()}@notes.invalid`,
    mail: null,
  });
  const token = tokenOf(printed.link);
  const registered = await registerAccount({
    headers: origin,
    body: { invitation: token, password: 'printed-password-12345' },
  });
  assert.equal(responseOf(registered.response).status, 201);
  const promoted = await promoteAccount({ config, email: printed.email });
  const identity = openIdentityStore(config.databaseUrl, { poolSize: 1 });
  try {
    const cookie = cookieHeader(
      responseOf(registered.response).headers.getSetCookie(),
    );
    const account = await getAccount({ headers: { ...origin, cookie } });
    assert.equal(account.data?.accountId, promoted);
    assert.equal(account.data?.installationRole, 'administrator');
  } finally {
    await identity.close();
  }
});

await app.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
