/**
 * The reader path of a published link, against a real server and a real
 * database.
 *
 * This file proves the handler half of plan 007: the owner operations, the
 * document that a reader receives, the picture that travels with it, the
 * headers of decision 0047, and the retention run. Every call of the owner
 * goes through a generated operation with a session cookie, and every call of
 * the reader goes through a generated operation with no cookie at all, which
 * is what a person with no account has.
 *
 * Start the service first:
 *
 * ```sh
 * sudo -n docker compose -f compose.test.yaml up -d --wait
 * ```
 */
import assert from 'node:assert/strict';
import { firstSave } from './support/documents.ts';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  configureClient,
  createFile,
  createPublishedLink,
  finalizeAttachment,
  getAccount,
  getPublishedAttachment,
  getPublishedPage,
  listPublishedLinks,
  listWorkspaces,
  openPublishedPage,
  revokePublishedLink,
  signInWithPassword,
  unlockPublishedLink,
  uploadAttachment,
} from '@notesapp/api-client';
import {
  bootstrapOwner,
  createAuth,
  createAuthPool,
  createAuthProtocol,
  createHandlers,
  createIdentityAdapter,
  createPublicationCleanup,
  createPublicationHasher,
  loadServerConfig,
  publishedDocumentContentPolicy,
  type ServerConfig,
  sessionAllowedBy,
} from '@notesapp/server';
import {
  createDocumentService,
  openAttachmentStore,
  openIdentityStore,
  openWorkspaceStore,
} from '@notesapp/storage-server';
import { isSafeMathStyle } from '@notesapp/markdown';
import sharp from 'sharp';
import { createDisposableDatabase } from './support/database.ts';
import { LogRecorder, startTestServer } from './support/server.ts';

const root = resolve(fileURLToPath(import.meta.url), '../../..');

/** The HTTP response of a generated call, or a clear test failure. */
function responseOf(response: Response | undefined): Response {
  if (response === undefined)
    throw new Error('The generated client returned no HTTP response.');
  return response;
}

/** Reads one property of an unknown value without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

/** The stable application error code of a failed generated call. */
function problemCode(error: unknown): string {
  const code = readProperty(error, 'code');
  return typeof code === 'string' ? code : '';
}

/** Turns the Set-Cookie values of an answer into a Cookie request header. */
function cookieHeader(values: readonly string[]): string {
  return values
    .map((entry) => (entry.split(';')[0] ?? '').trim())
    .filter((entry) => entry !== '' && !entry.endsWith('='))
    .join('; ');
}

/** The headers of the browser of the owner. A write also names the origin. */
function owner(): Record<string, string> {
  return { origin: 'http://127.0.0.1', cookie };
}

/** The client identifiers that every write carries. */
function ids(): { mutationId: string; deviceId: string } {
  return { mutationId: randomUUID(), deviceId: 'published-test-device' };
}

const database = await createDisposableDatabase();
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-published-test-'));

const identity = openIdentityStore(database.runtimeUrl);
const content = openWorkspaceStore(
  database.runtimeUrl,
  createDocumentService(),
  { poolSize: 4 },
);
const attachments = openAttachmentStore(database.runtimeUrl, storageRoot, {
  poolSize: 4,
});

/** The environment of this test deployment. */
function environment(): Record<string, string> {
  return {
    NOTESAPP_ORIGIN: 'http://127.0.0.1',
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: 'published-test-secret-value-0123456789abcd',
    NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost',
    NOTESAPP_LOG_LEVEL: 'info',
    NOTESAPP_MAX_BODY_BYTES: '8388608',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS: '5000',
  };
}

const config: ServerConfig = loadServerConfig(environment());
const authPool = createAuthPool(config);
const auth = createAuth(
  config,
  { mail: null, sessionAllowed: sessionAllowedBy(identity) },
  authPool,
);
const hasher = createPublicationHasher(auth.auth);
const adapter = createIdentityAdapter({
  auth: auth.auth,
  identity,
  servedOrigins: config.servedOrigins,
});
const logs = new LogRecorder();

/** The stylesheet that a built shell document would name. */
const stylesheet = '/assets/published-test.css';

const server = await startTestServer({
  environment: environment(),
  handlers: (value) =>
    createHandlers(value, undefined, {
      store: identity,
      content,
      attachments,
      publications: {
        store: content,
        attachments,
        hasher,
        stylesheets: () => [stylesheet],
        recordRefusal: (cause) => causes.push(cause),
      },
    }),
  identity: adapter.resolver,
  logStream: logs,
  protocols: [createAuthProtocol(config, auth.auth)],
});
configureClient(server.baseUrl, undefined);

/** The refusal causes that the operator log received. */
const causes: string[] = [];

const ownerEmail = 'published-owner@notes.invalid';
const ownerPassword = 'a-strong-published-password';
await bootstrapOwner({
  config,
  email: ownerEmail,
  name: 'PublishedOwner',
  password: ownerPassword,
});
const signedIn = await signInWithPassword({
  headers: { origin: 'http://127.0.0.1' },
  body: { email: ownerEmail, password: ownerPassword },
});
const cookie = cookieHeader(
  responseOf(signedIn.response).headers.getSetCookie(),
);
assert.ok(cookie.length > 0, 'the test needs a session cookie');

const account = await getAccount({ headers: owner() });
assert.match(account.data?.accountId ?? '', /^[0-9a-f-]{36}$/);
const listed = await listWorkspaces({ headers: owner() });
const workspaceId = listed.data?.workspaces[0]?.workspaceId ?? '';
assert.match(workspaceId, /^[0-9a-f-]{36}$/);

/** Uploads one picture and gives it a stored path and a revision. */
async function publishPicture(path: string): Promise<string> {
  const bytes = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 10, g: 20, b: 30, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const uploaded = await uploadAttachment({
    headers: owner(),
    path: { workspaceId },
    body: { file: new File([bytes], 'photo.png', { type: 'image/png' }) },
  });
  const object = uploaded.data;
  assert.ok(object !== undefined, 'the picture was refused');
  const revisionId = randomUUID();
  const finalized = await finalizeAttachment({
    headers: owner(),
    path: { workspaceId, objectId: object.objectId },
    body: {
      fileId: randomUUID(),
      revisionId,
      path,
      digest: object.digest,
      ...ids(),
    },
  });
  assert.equal(responseOf(finalized.response).status, 200);
  return revisionId;
}

/** Writes one note and answers its identifier. */
async function writeNote(path: string, text: string): Promise<string> {
  const fileId = randomUUID();
  const created = await createFile({
    headers: owner(),
    path: { workspaceId },
    body: {
      fileId,
      revisionId: randomUUID(),
      path,
      document: firstSave(text),
      ...ids(),
    },
  });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  return fileId;
}

const pictureRevision = await publishPicture('attachments/photo.png');

const secretNoteId = await writeNote(
  'notes/salary/2026.md',
  '# Pay\n\nPrivate.\n',
);
const dayTwoId = await writeNote(
  'notes/trip/day-two.md',
  '# Day two\n\nThe second day.\n',
);
const dayOneText = [
  '# Day one',
  '',
  'The first day. <script>alert(1)</script>',
  '',
  '<img src="x" onerror="alert(1)">',
  '',
  '![A photo](../../attachments/photo.png)',
  '',
  '![Outside](https://elsewhere.invalid/tracker.png)',
  '',
  '- [x] packed',
  '- [ ] left',
  '',
  '| One | Two |',
  '| --- | --- |',
  '| a   | b   |',
  '',
  '```ts',
  'const kept = 1;',
  '```',
  '',
  '```mermaid',
  'graph TD;',
  '  A-->B;',
  '```',
  '',
  '[The second day](day-two.md)',
  '',
  `[The salary](/notes/${secretNoteId})`,
  '',
].join('\n');
const dayOneId = await writeNote('notes/trip/day-one.md', dayOneText);
const formulasText = [
  '# Formulas',
  '',
  '$$',
  '\\begin{aligned}',
  'a &= b^2 + \\frac{c}{d} \\\\',
  'e_1 &= \\sqrt{f}',
  '\\end{aligned}',
  '$$',
  '',
  '<span style="position:fixed;inset:0">Over the page</span>',
  '',
].join('\n');
const formulasId = await writeNote('notes/trip/formulas.md', formulasText);

/** Publishes one link and answers its token. */
async function publish(
  scope: { kind: 'note'; fileId: string } | { kind: 'folder'; path: string },
  password?: string,
): Promise<{ token: string; publicationId: string }> {
  const created = await createPublishedLink({
    headers: owner(),
    path: { workspaceId },
    body: password === undefined ? { scope } : { scope, password },
  });
  assert.equal(created.error, undefined, JSON.stringify(created.error));
  const answer = created.data;
  assert.ok(answer !== undefined, 'the link was refused');
  return {
    token: answer.token,
    publicationId: answer.link.publicationId,
  };
}

/** The document of one reader address, and its answer. */
async function readPage(
  token: string,
  query: { note?: string; ticket?: string } = {},
): Promise<{ html: string; response: Response }> {
  const answer = await getPublishedPage({ path: { token }, query });
  return {
    html: String(answer.data ?? ''),
    response: responseOf(answer.response),
  };
}

const folder = await publish({ kind: 'folder', path: 'notes/trip' });

await test('the owner sees the token once and never again', async () => {
  const links = await listPublishedLinks({
    headers: owner(),
    path: { workspaceId },
  });
  const entries = links.data?.links ?? [];
  assert.ok(entries.length >= 1);
  const serialized = JSON.stringify(entries);
  assert.ok(!serialized.includes(folder.token));
  // No entry reports how often the link was opened, because the reader path
  // counts nothing (decision 0031).
  assert.ok(!serialized.includes('count'));
  const entry = entries.find(
    (link) => link.publicationId === folder.publicationId,
  );
  assert.deepEqual(entry?.scope, { kind: 'folder', path: 'notes/trip' });
  assert.equal(entry?.passwordProtected, false);
});

await test('a reader with no session reads the list of a folder link', async () => {
  const page = await readPage(folder.token);
  assert.equal(page.response.status, 200);
  assert.match(page.response.headers.get('content-type') ?? '', /^text\/html/);
  assert.ok(page.html.includes('day-one'));
  assert.ok(page.html.includes('day-two'));
  // The list names the notes of the scope and nothing outside it.
  assert.ok(!page.html.includes('2026'));
  // A stored path suffix never reaches a person.
  assert.ok(!page.html.includes('.md'));
});

await test('the page carries a private cache directive and its own policy', async () => {
  const page = await readPage(folder.token, { note: dayOneId });
  const headers = page.response.headers;
  assert.equal(headers.get('cache-control'), 'private, no-store');
  assert.ok(!(headers.get('cache-control') ?? '').includes('public'));
  assert.equal(headers.get('referrer-policy'), 'no-referrer');
  assert.equal(headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(
    headers.get('content-security-policy'),
    publishedDocumentContentPolicy,
  );
  assert.equal(headers.get('x-frame-options'), 'DENY');
});

await test('the page loads the one built application stylesheet', async () => {
  const page = await readPage(folder.token, { note: dayOneId });
  assert.ok(page.html.includes(`<link rel="stylesheet" href="${stylesheet}">`));
  assert.equal(page.html.split('rel="stylesheet"').length - 1, 1);
});

await test('a script and an event attribute never travel, a picture does', async () => {
  const page = await readPage(folder.token, { note: dayOneId });
  // The one sanitized renderer drops every raw HTML node with its attributes,
  // so no element and no attribute of the source reaches the reader.
  assert.ok(!page.html.includes('<script'));
  assert.ok(!page.html.includes('onerror'));
  assert.ok(!page.html.includes('src="x"'));
  // Decision 0067. An external picture over HTTPS keeps its address, sends no
  // referrer and loads when the reader reaches it. The content policy of the
  // page names the same one scheme.
  assert.ok(
    page.html.includes(
      '<img src="https://elsewhere.invalid/tracker.png" alt="Outside" loading="lazy" referrerpolicy="no-referrer">',
    ),
  );
  // The words around a dropped element stay, so nothing of the author is lost.
  assert.ok(page.html.includes('The first day.'));
  assert.ok(page.html.includes('alert(1)'));
  assert.ok(page.html.includes('const kept = 1;'));
  assert.ok(page.html.includes('<table>'));
  assert.ok(page.html.includes('type="checkbox"'));
});

await test('a formula keeps the styles that place it, and an author style does not travel', async () => {
  const page = await readPage(folder.token, { note: formulasId });
  // Decision 0140. The page lets a style attribute apply, and no other
  // inline style.
  const policy = page.response.headers.get('content-security-policy') ?? '';
  assert.ok(policy.split('; ').includes("style-src-attr 'unsafe-inline'"));
  assert.ok(policy.split('; ').includes("style-src 'self'"));
  assert.ok(page.html.includes('class="katex-display"'));
  const styles = [...page.html.matchAll(/\sstyle="([^"]*)"/g)].map(
    (match) => match[1] ?? '',
  );
  // KaTeX places each row of the aligned block and each script by style.
  assert.ok(styles.length > 0, 'the formula carries its layout');
  for (const style of styles) assert.ok(isSafeMathStyle(style), style);
  assert.ok(!page.html.includes('position:fixed'));
  assert.ok(!page.html.includes('<style'));
  // The words of the dropped element stay.
  assert.ok(page.html.includes('Over the page'));
});

await test('a mermaid fence stays a placeholder on the server path', async () => {
  const page = await readPage(folder.token, { note: dayOneId });
  assert.ok(page.html.includes('data-diagram="mermaid"'));
  assert.ok(page.html.includes('graph TD;'));
  assert.ok(!page.html.includes('<svg'));
});

await test('a link inside the scope resolves and one outside it does not', async () => {
  const page = await readPage(folder.token, { note: dayOneId });
  assert.ok(
    page.html.includes(`href="/published/${folder.token}?note=${dayTwoId}"`),
  );
  // The note outside the scope keeps its words and loses its address, so the
  // page offers no sign-in screen and discloses no note.
  assert.ok(page.html.includes('<span data-blocked="link">The salary</span>'));
  assert.ok(!page.html.includes(secretNoteId));
});

await test('a picture of a note in scope travels to a reader', async () => {
  const page = await readPage(folder.token, { note: dayOneId });
  const address = `/published/${folder.token}/attachments/${dayOneId}/${pictureRevision}`;
  assert.ok(page.html.includes(`src="${address}"`));
  const picture = await getPublishedAttachment({
    path: {
      token: folder.token,
      fileId: dayOneId,
      revisionId: pictureRevision,
    },
  });
  const response = responseOf(picture.response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

await test('a picture named through a note outside the scope is refused', async () => {
  const refused = await getPublishedAttachment({
    path: {
      token: folder.token,
      fileId: secretNoteId,
      revisionId: pictureRevision,
    },
  });
  assert.equal(responseOf(refused.response).status, 404);
  assert.equal(problemCode(refused.error), 'published_link_unavailable');
  assert.ok(causes.includes('out_of_scope'));
});

await test('a note outside the scope is not a page of this link', async () => {
  const page = await readPage(folder.token, { note: secretNoteId });
  assert.equal(page.response.status, 200);
  assert.ok(page.html.includes('This link is not available.'));
  assert.ok(!page.html.includes('Private.'));
});

await test('no log record of a reader request holds a part of the address', () => {
  const lines = logs.lines.join('\n');
  assert.ok(lines.includes('/published/[redacted]'));
  assert.ok(!lines.includes(folder.token));
  assert.ok(!lines.includes(dayOneId));
  assert.ok(!lines.includes(pictureRevision));
});

await test('a link over one note opens that note and lists nothing', async () => {
  const note = await publish({ kind: 'note', fileId: dayTwoId });
  const page = await readPage(note.token);
  assert.ok(page.html.includes('The second day.'));
  assert.ok(!page.html.includes('All notes'));
  // The link opens one note, so a second note of the workspace is outside it.
  const other = await readPage(note.token, { note: dayOneId });
  assert.ok(other.html.includes('This link is not available.'));
});

await test('a password link shows a form and answers one set of words', async () => {
  const locked = await publish(
    { kind: 'folder', path: 'notes/trip' },
    'a-strong-link-password',
  );
  const shut = await readPage(locked.token);
  assert.equal(shut.response.status, 200);
  assert.ok(shut.html.includes('This link needs a password.'));
  assert.ok(shut.html.includes('name="password"'));
  assert.ok(!shut.html.includes('day-two'));

  const wrong = await openPublishedPage({
    path: { token: locked.token },
    body: { password: 'the wrong password' },
  });
  const wrongHtml = String(wrong.data ?? '');
  assert.equal(responseOf(wrong.response).status, 200);
  // The same words and the same form as a link that was never opened.
  assert.ok(wrongHtml.includes('This link needs a password.'));
  assert.ok(!wrongHtml.includes('day-two'));

  const right = await openPublishedPage({
    path: { token: locked.token },
    body: { password: 'a-strong-link-password' },
  });
  const rightHtml = String(right.data ?? '');
  assert.equal(responseOf(right.response).status, 200);
  assert.ok(rightHtml.includes('day-two'));
  // Every address of the page carries the ticket, because the page holds no
  // script that could add one (decision 0046).
  assert.match(rightHtml, /ticket=[A-Za-z0-9_-]{22,}/);
  // The server sets no cookie for a reader.
  assert.equal(responseOf(right.response).headers.get('set-cookie'), null);
});

await test('a wrong password and an unknown token answer one refusal', async () => {
  const locked = await publish(
    { kind: 'note', fileId: dayTwoId },
    'another-strong-password',
  );
  const wrong = await unlockPublishedLink({
    path: { token: locked.token },
    body: { password: 'not the password' },
  });
  const unknown = await unlockPublishedLink({
    path: { token: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    body: { password: 'not the password' },
  });
  for (const answer of [wrong, unknown]) {
    assert.equal(responseOf(answer.response).status, 404);
    assert.equal(problemCode(answer.error), 'published_link_unavailable');
  }
  const granted = await unlockPublishedLink({
    path: { token: locked.token },
    body: { password: 'another-strong-password' },
  });
  const ticket = granted.data?.ticket ?? '';
  assert.match(ticket, /^[A-Za-z0-9_-]{22,64}$/);
  const opened = await readPage(locked.token, { ticket });
  assert.ok(opened.html.includes('The second day.'));
});

await test('a revoked link stops opening at the next request', async () => {
  const link = await publish({ kind: 'note', fileId: dayTwoId });
  const before = await readPage(link.token);
  assert.ok(before.html.includes('The second day.'));
  const removed = await revokePublishedLink({
    headers: owner(),
    path: { workspaceId, publicationId: link.publicationId },
  });
  assert.equal(removed.data?.removed, true);
  const after = await readPage(link.token);
  assert.equal(after.response.status, 200);
  assert.ok(after.html.includes('This link is not available.'));
});

await test('the hourly run removes a record that stopped', async () => {
  const link = await publish({ kind: 'note', fileId: dayTwoId });
  await revokePublishedLink({
    headers: owner(),
    path: { workspaceId, publicationId: link.publicationId },
  });
  const cleanup = createPublicationCleanup(content);
  // The cutoff is an instant after the revocation, as the hourly run of the
  // next hour would be.
  const removed = await cleanup(new Date(Date.now() + 60_000));
  assert.ok(removed.expiredLinks >= 1);
  const links = await listPublishedLinks({
    headers: owner(),
    path: { workspaceId },
  });
  assert.ok(
    !(links.data?.links ?? []).some(
      (entry) => entry.publicationId === link.publicationId,
    ),
  );
});

await test('the retention run adds no second scheduler and no timer', async () => {
  // Plan 007 item 29. The run is one job file that the hourly run of the
  // composition calls, so the process still holds one timer.
  const source = await readFile(
    resolve(root, 'apps/server/src/app.ts'),
    'utf8',
  );
  assert.equal(source.split('setInterval(').length - 1, 1);
  assert.ok(source.includes('cleanupPublications()'));
  const job = await readFile(
    resolve(root, 'apps/server/src/jobs/publication-cleanup.ts'),
    'utf8',
  );
  assert.ok(!job.includes('setInterval'));
  assert.ok(!job.includes('setTimeout'));
});

await test('the reader route file holds no actor of any kind', async () => {
  // Refusal 2 of decision 0031. The file imports no actor helper, so it holds
  // no `Actor` and no write use case compiles in it.
  const source = await readFile(
    resolve(root, 'apps/server/src/routes/published.ts'),
    'utf8',
  );
  assert.ok(!source.includes('requireActor'));
  // The check reads the import statements, so a word of a comment cannot pass
  // it and cannot fail it either.
  const imports = source.match(/^import[\s\S]*?;$/gm) ?? [];
  assert.ok(imports.length > 0);
  for (const statement of imports) {
    assert.ok(!statement.includes('auth/actor.ts'), statement);
    assert.ok(!/\bActor\b/.test(statement), statement);
  }
  // The owner route is the file that does hold one.
  const ownerSource = await readFile(
    resolve(root, 'apps/server/src/routes/publications.ts'),
    'utf8',
  );
  assert.ok(ownerSource.includes('requireActor'));
});

await test('createHandlers returns every published handler', () => {
  const handlers = createHandlers(config, undefined, {
    store: identity,
    content,
    attachments,
    publications: {
      store: content,
      attachments,
      hasher,
      stylesheets: () => [],
      recordRefusal: () => undefined,
    },
  });
  for (const id of [
    'getPublishedPage',
    'openPublishedPage',
    'unlockPublishedLink',
    'getPublishedAttachment',
    'createPublishedLink',
    'listPublishedLinks',
    'revokePublishedLink',
  ] as const)
    assert.equal(typeof handlers[id], 'function', id);
});

await test('the hasher of a link is the hasher of the account path', async () => {
  // Plan 007 item 20. The adapter runs over the Better Auth context that
  // `cli/recover-account.ts` reaches, so a library move fails this test.
  const digest = await hasher.hash('a-strong-link-password');
  assert.notEqual(digest, 'a-strong-link-password');
  assert.equal(await hasher.verify(digest, 'a-strong-link-password'), true);
  assert.equal(await hasher.verify(digest, 'a-strong-link-passwore'), false);
  const context = await auth.auth.$context;
  assert.equal(
    await context.password.verify({
      hash: digest,
      password: 'a-strong-link-password',
    }),
    true,
  );
});

await server.close();
await auth.close();
await authPool.end();
await attachments.close();
await content.close();
await identity.close();
await database.destroy();
await rm(storageRoot, { recursive: true, force: true });
