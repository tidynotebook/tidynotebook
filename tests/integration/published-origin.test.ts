/**
 * The published origin, the report of a link and its takedown, through the
 * served composition (records 0118, 0119 and 0123).
 *
 * The installation serves the application on 127.0.0.1 and published pages
 * on pages.test. Each check reads what a browser gets from one origin: the
 * status, the cookie, the redirect and the document. The report checks read
 * the stored row as well, because a report must hold no token.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  configureClient,
  createFile,
  createInvitation,
  createOwner,
  createPublishedLink,
  dismissReport,
  listPublishedLinks,
  listReports,
  listWorkspaces,
  registerAccount,
  takeDownReportedLink,
} from '@notesapp/api-client';
import {
  createApp,
  loadServerConfig,
  publishedDocumentContentPolicy,
} from '@notesapp/server';
import {
  openWorkspaceStore,
  createDocumentService,
} from '@notesapp/storage-server';
import { firstSave } from './support/documents.ts';
import { createDisposableDatabase, openSession } from './support/database.ts';

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

/** A built application with one stylesheet, one font and one script. */
async function writeBuild(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-origin-web-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(
    join(directory, 'index.html'),
    '<!doctype html><html><head><link rel="stylesheet" href="/assets/app-Origin01.css"></head><body><script type="module" src="/assets/main-Origin01.js"></script></body></html>',
  );
  await writeFile(join(directory, 'assets/app-Origin01.css'), 'body{}');
  await writeFile(join(directory, 'assets/geist-Origin01.woff2'), 'font');
  await writeFile(join(directory, 'assets/main-Origin01.js'), 'void 0;');
  return directory;
}

const application = 'http://127.0.0.1';
const pages = 'http://pages.test';
const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-origin-test-'));
const webDist = await writeBuild();
const config = loadServerConfig({
  NOTESAPP_ORIGIN: application,
  NOTESAPP_PUBLISHED_ORIGIN: pages,
  NOTESAPP_DATABASE_URL: database.runtimeUrl,
  NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
  NOTESAPP_STORAGE_ROOT: storageRoot,
  NOTESAPP_AUTH_SECRET: 'published-origin-test-secret-0123456789',
  NOTESAPP_LOG_LEVEL: 'silent',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
  NOTESAPP_RATE_LIMIT_MAX: '10000',
});
const app = await createApp(config, { webDist });
await app.listen({ host: '127.0.0.1', port: 0 });
const address: string | AddressInfo | null = app.server.address();
if (address === null || typeof address === 'string')
  throw new Error('The test server did not bind a TCP port.');
configureClient(`http://127.0.0.1:${String(address.port)}`, undefined);
const origin = { origin: application };

// The first account administers the installation.
const adminPassword = 'admin-password-123456';
const created = await createOwner({
  headers: origin,
  body: { email: 'admin@notes.invalid', password: adminPassword },
});
assert.equal(responseOf(created.response).status, 201);
const admin = {
  ...origin,
  cookie: cookieHeader(responseOf(created.response).headers.getSetCookie()),
};

// A member owns the notes and the links.
const memberEmail = 'member@notes.invalid';
const memberPassword = 'member-password-123456';
const invited = await createInvitation({
  headers: admin,
  body: { email: memberEmail },
});
const registered = await registerAccount({
  headers: origin,
  body: {
    invitation: new URL(invited.data?.link ?? 'http://x/').hash.slice(1),
    password: memberPassword,
  },
});
assert.equal(responseOf(registered.response).status, 201);
const member = {
  ...origin,
  cookie: cookieHeader(responseOf(registered.response).headers.getSetCookie()),
};
const workspaces = await listWorkspaces({ headers: member });
const workspaceId = workspaces.data?.workspaces[0]?.workspaceId ?? '';
assert.notEqual(workspaceId, '');

/** Writes one note of the member and publishes it, and answers the token. */
async function publishNote(text: string): Promise<{
  token: string;
  fileId: string;
  publicationId: string;
}> {
  const fileId = randomUUID();
  const note = await createFile({
    headers: member,
    path: { workspaceId },
    body: {
      fileId,
      revisionId: randomUUID(),
      path: `notes/${fileId}.md`,
      document: firstSave(text),
      mutationId: randomUUID(),
      deviceId: 'origin-test-device',
    },
  });
  assert.equal(note.error, undefined, JSON.stringify(note.error));
  const link = await createPublishedLink({
    headers: member,
    path: { workspaceId },
    body: { scope: { kind: 'note', fileId } },
  });
  assert.equal(link.error, undefined, JSON.stringify(link.error));
  return {
    token: link.data?.token ?? '',
    fileId,
    publicationId: link.data?.link.publicationId ?? '',
  };
}

/** One request to the published origin. */
function onPages(
  method: 'GET' | 'POST',
  url: string,
  extra: { body?: string; headers?: Record<string, string> } = {},
) {
  return app.inject({
    method,
    url,
    headers: { host: 'pages.test', ...extra.headers },
    ...(extra.body === undefined ? {} : { payload: extra.body }),
  });
}

/** Sends the report form of one token on the published origin. */
function report(token: string, reason: string, note = '') {
  return onPages('POST', `/published/${token}/report`, {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ reason, note }).toString(),
  });
}

/** Every stored report of the installation, as text, through the owner role. */
async function storedReports(): Promise<string[]> {
  const session = await openSession(database.migrationUrl);
  try {
    const rows = await session.query<{ row: string }>(
      'select row_to_json(r)::text as row from publication_reports r',
    );
    return rows.map((row) => row.row);
  } finally {
    await session.close();
  }
}

const first = await publishNote('# Offer\n\nSend your bank password here.\n');

await test('the published origin answers no API route, no shell and no script', async () => {
  for (const [method, url] of [
    ['GET', '/api/account'],
    ['GET', '/api/health'],
    ['GET', '/api/setup'],
    ['POST', '/api/auth/sign-in/email'],
    ['GET', '/'],
    ['GET', '/index.html'],
    ['GET', '/login'],
    ['GET', '/assets/main-Origin01.js'],
  ] as const) {
    const response = await onPages(method, url, {
      headers: { cookie: member.cookie, origin: pages },
    });
    assert.equal(response.statusCode, 404, `${method} ${url}`);
    assert.equal(response.json().code, 'route_not_found', `${method} ${url}`);
  }
  // The page names its stylesheet and font, and those are served.
  assert.equal(
    (await onPages('GET', '/assets/app-Origin01.css')).statusCode,
    200,
  );
  assert.equal(
    (await onPages('GET', '/assets/geist-Origin01.woff2')).statusCode,
    200,
  );
});

await test('the published origin sets no cookie, even for a right password', async () => {
  const signIn = await onPages('POST', '/api/auth/sign-in/email', {
    headers: { 'content-type': 'application/json', origin: pages },
    body: JSON.stringify({ email: memberEmail, password: memberPassword }),
  });
  assert.equal(signIn.statusCode, 404);
  assert.equal(signIn.headers['set-cookie'], undefined);
  const page = await onPages('GET', `/published/${first.token}`);
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers['set-cookie'], undefined);
});

await test('the application origin moves a reader address with a temporary redirect', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/published/${first.token}?note=${first.fileId}`,
    headers: { host: '127.0.0.1' },
  });
  assert.equal(response.statusCode, 307);
  assert.equal(
    response.headers.location,
    `${pages}/published/${first.token}?note=${first.fileId}`,
  );
  const reportPage = await app.inject({
    method: 'GET',
    url: `/published/${first.token}/report`,
    headers: { host: '127.0.0.1' },
  });
  assert.equal(reportPage.statusCode, 307);
});

await test('the published origin serves the page of a link with its report link', async () => {
  const page = await onPages('GET', `/published/${first.token}`);
  assert.equal(page.statusCode, 200);
  assert.ok(page.body.includes('Send your bank password here.'));
  assert.ok(page.body.includes(`href="/published/${first.token}/report"`));
  assert.ok(page.body.includes('href="/assets/app-Origin01.css"'));
});

await test('a write that names the published origin is refused', async () => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/publications`,
    headers: {
      host: '127.0.0.1',
      origin: pages,
      cookie: member.cookie,
      'content-type': 'application/json',
    },
    payload: JSON.stringify({ scope: { kind: 'note', fileId: first.fileId } }),
  });
  assert.equal(response.statusCode, 403);
});

await test('the report page is a form with no script', async () => {
  const page = await onPages('GET', `/published/${first.token}/report`);
  assert.equal(page.statusCode, 200);
  assert.ok(page.body.includes('<form'));
  assert.ok(page.body.includes('name="reason"'));
  assert.ok(!/<script|\son[a-z]+=/i.test(page.body));
  assert.equal(
    page.headers['content-security-policy'],
    publishedDocumentContentPolicy,
  );
});

await test('a report stores one row that holds no token, and an unknown token stores nothing', async () => {
  const stored = await report(
    first.token,
    'phishing',
    ' It asks for my bank password. ',
  );
  const unknown = await report('A'.repeat(43), 'phishing', 'Nothing here.');
  assert.equal(stored.statusCode, 200);
  assert.equal(unknown.statusCode, 200);
  // One answer, so a report walks no token.
  assert.equal(stored.body, unknown.body);
  const rows = await storedReports();
  assert.equal(rows.length, 1);
  assert.ok(rows[0]?.includes('It asks for my bank password.'));
  assert.ok(!rows[0]?.includes(first.token), 'the row holds the token');
});

await test('a member cannot read or act on a report', async () => {
  assert.equal(
    responseOf((await listReports({ headers: member })).response).status,
    403,
  );
});

await test('an administrator opens the address and takes the link down', async () => {
  const listed = await listReports({ headers: admin });
  assert.equal(listed.error, undefined, JSON.stringify(listed.error));
  const [open] = listed.data?.reports ?? [];
  assert.ok(open !== undefined);
  assert.equal(open.address, `${pages}/published/${first.token}`);
  assert.equal(open.publicationId, first.publicationId);
  assert.equal(open.linkState, 'live');
  assert.equal(open.reason, 'phishing');
  const taken = await takeDownReportedLink({
    headers: admin,
    path: { reportId: open.reportId },
  });
  assert.equal(responseOf(taken.response).status, 200);
  // The link opens nothing now, and every open report of it closed.
  const page = await onPages('GET', `/published/${first.token}`);
  assert.ok(page.body.includes('This link is not available.'));
  assert.ok(!page.body.includes('bank password'));
  assert.deepEqual((await listReports({ headers: admin })).data?.reports, []);
  // The owner sees the takedown.
  const links = await listPublishedLinks({
    headers: member,
    path: { workspaceId },
  });
  const link = links.data?.links.find(
    (entry) => entry.publicationId === first.publicationId,
  );
  assert.equal(link?.takenDown, true);
});

await test('the administrator reads no other row of that workspace after a takedown', async () => {
  const theirs = await listWorkspaces({ headers: admin });
  assert.ok(
    (theirs.data?.workspaces ?? []).every(
      (entry) => entry.workspaceId !== workspaceId,
    ),
  );
  const links = await listPublishedLinks({
    headers: admin,
    path: { workspaceId },
  });
  assert.notEqual(responseOf(links.response).status, 200);
  const session = await openSession(database.migrationUrl);
  try {
    const memberships = await session.query<{ count: string }>(
      'select count(*)::text as count from memberships where workspace_id = $1',
      [workspaceId],
    );
    assert.equal(memberships[0]?.count, '1');
    const audit = await session.query<{ action: string }>(
      "select action from account_audit_events where action = 'take_down_link'",
    );
    assert.equal(audit.length, 1);
  } finally {
    await session.close();
  }
});

await test('a taken down link stays down, whatever the owner writes', async () => {
  const session = await openSession(database.runtimeUrl);
  try {
    const members = await session.query<{ id: string }>(
      'select owner_account_id as id from publications where id = $1',
      [first.publicationId],
    );
    assert.equal(members.length, 0, 'the runtime role reads no link');
  } finally {
    await session.close();
  }
  const owner = await openSession(database.migrationUrl);
  let ownerId = '';
  try {
    const rows = await owner.query<{ id: string }>(
      'select owner_account_id::text as id from publications where id = $1',
      [first.publicationId],
    );
    ownerId = rows[0]?.id ?? '';
  } finally {
    await owner.close();
  }
  const runtime = await openSession(database.runtimeUrl, ownerId);
  try {
    const refused = await runtime.failure(
      'update publications set revoked_at = null where id = $1',
      [first.publicationId],
    );
    assert.equal(refused.code, '42501');
  } finally {
    await runtime.close();
  }
});

await test('one link keeps at most 20 open reports', async () => {
  const second = await publishNote('# Another\n\nText.\n');
  for (let index = 0; index < 25; index += 1)
    assert.equal((await report(second.token, 'spam')).statusCode, 200);
  const listed = await listReports({ headers: admin });
  assert.equal(listed.data?.reports.length, 20);
  const [one] = listed.data?.reports ?? [];
  assert.ok(one !== undefined);
  const closed = await dismissReport({
    headers: admin,
    path: { reportId: one.reportId },
  });
  assert.equal(responseOf(closed.response).status, 200);
  assert.equal(
    (await listReports({ headers: admin })).data?.reports.length,
    19,
  );
  // The link stays live after a report closes.
  const page = await onPages('GET', `/published/${second.token}`);
  assert.ok(page.body.includes('Text.'));
});

await test('the retention run keeps a taken down link for 30 days', async () => {
  const store = openWorkspaceStore(
    database.runtimeUrl,
    createDocumentService(),
    {
      poolSize: 1,
    },
  );
  try {
    await store.cleanupPublications(new Date(Date.now() + 3_600_000));
    const kept = await listPublishedLinks({
      headers: member,
      path: { workspaceId },
    });
    assert.ok(
      kept.data?.links.some(
        (entry) => entry.publicationId === first.publicationId,
      ),
    );
    await store.cleanupPublications(new Date(Date.now() + 31 * 86_400_000));
    const gone = await listPublishedLinks({
      headers: member,
      path: { workspaceId },
    });
    assert.ok(
      (gone.data?.links ?? []).every(
        (entry) => entry.publicationId !== first.publicationId,
      ),
    );
    // Its reports went with it.
    assert.ok(
      (await storedReports()).every(
        (row) => !row.includes(first.publicationId),
      ),
    );
  } finally {
    await store.close();
  }
});

await app.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
await rm(webDist, { recursive: true, force: true });
