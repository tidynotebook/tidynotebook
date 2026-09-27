/**
 * The one served origin list, proved across the two checks that read it.
 *
 * Issue 18 and issue 19. The cookie write check compared one configured value
 * while the trusted list of the identity routes accepted a scheme and a port
 * that it invented for every allowed host, so the two answered differently for
 * the same origin. Both now read `config.servedOrigins`. See
 * [decision 0039](../../docs/decisions/0039-one-list-of-served-origins.md).
 *
 * This file sends the same candidate origin down both paths against a real
 * listening server, and it compares the two answers. The write path reaches
 * `requireWriteOrigin` in `apps/server/src/auth/actor.ts`. The sign-in path
 * carries no cookie, so no check of this application runs on it and the
 * trusted list of the protocol library alone decides it.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  signInWithPassword,
  updatePreferences,
} from '@notesapp/api-client';
import { bootstrapOwner, createApp, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase } from './support/database.ts';

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
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-origins-test-'));
const config = loadServerConfig({
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost',
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'origins-test-secret-value-0123456789ab',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
});
const app = await createApp(config);
await app.listen({ host: '127.0.0.1', port: 0 });
const address: string | AddressInfo | null = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('The test server did not bind a TCP port.');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);

const email = 'origins-owner@notes.invalid';
const password = 'origins-owner-password-1';
await bootstrapOwner({ config, email, name: 'Origins Owner', password });
const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email, password },
});
const cookie = cookieHeader(
  responseOf(signedIn.response).headers.getSetCookie(),
);
assert.ok(cookie.length > 0, 'the owner holds a session cookie');

/**
 * The origins that each check is asked about.
 *
 * Two of them are served. The other four are the neighbours that the trusted
 * list used to invent: the other scheme, the port 3000 of each served host,
 * and a stranger.
 */
const candidates = [
  'http://127.0.0.1',
  'http://localhost',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'https://127.0.0.1',
  'http://notes.invalid',
] as const;

/** The answer of the cookie write check, through a guarded write operation. */
async function writeAccepts(origin: string): Promise<boolean> {
  const result = await updatePreferences({
    headers: { origin, cookie },
    body: { appearance: 'system', themeFamily: 'ink' },
  });
  const status = responseOf(result.response).status;
  if (status !== 200 && status !== 403)
    throw new Error(`The guarded write answered ${String(status)}.`);
  return status === 200;
}

/** The answer of the trusted list, through a sign-in that carries no cookie. */
async function signInAccepts(origin: string): Promise<boolean> {
  const result = await signInWithPassword({
    headers: { origin },
    body: { email, password },
  });
  const status = responseOf(result.response).status;
  if (status !== 200 && status !== 403)
    throw new Error(`The sign-in route answered ${String(status)}.`);
  return status === 200;
}

await test('the write check and the trusted list accept the same origins', async () => {
  for (const origin of candidates) {
    const write = await writeAccepts(origin);
    const signIn = await signInAccepts(origin);
    assert.equal(
      write,
      signIn,
      `the two checks disagree about ${origin}: the write says ${String(write)} and the sign-in says ${String(signIn)}`,
    );
  }
});

await test('every served origin is accepted and nothing else is', async () => {
  for (const origin of candidates) {
    const served = config.servedOrigins.some(
      (entry) => entry.origin === origin,
    );
    assert.equal(await writeAccepts(origin), served, origin);
    assert.equal(await signInAccepts(origin), served, origin);
  }
});

await test('an invented port of a served host is refused', async () => {
  // The trusted list used to add the port 3000 to every allowed host, so the
  // shipped defaults trusted an origin that no operator named.
  assert.equal(
    config.servedOrigins.some(
      (entry) => entry.origin === 'http://localhost:3000',
    ),
    false,
  );
  assert.equal(await writeAccepts('http://localhost:3000'), false);
  assert.equal(await signInAccepts('http://localhost:3000'), false);
});

await test('an invented scheme of a served host is refused', async () => {
  assert.equal(await writeAccepts('https://127.0.0.1'), false);
  assert.equal(await signInAccepts('https://127.0.0.1'), false);
});

await test('the Host allowlist serves the host name of each served origin', async () => {
  for (const host of ['127.0.0.1', 'localhost', '127.0.0.1:8080']) {
    const answer = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host },
    });
    assert.equal(answer.statusCode, 200, host);
  }
  const refused = await app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { host: 'notes.invalid' },
  });
  assert.equal(refused.statusCode, 400);
});

await app.close();
await rm(storageRoot, { recursive: true, force: true });
await database.destroy();
