/**
 * Delivery of the built browser assets and the security headers of every
 * answer.
 *
 * The build directory is written by hand here, so the checks describe the
 * contract between the build step and the server rather than one particular
 * Vite release.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { createHandlers, type HandlerMap } from '@notesapp/server';
import { LogRecorder, startTestServer } from './support/server.ts';

/** The inline theme script of the shell, as `index.html` carries it. */
const inlineScript =
  "\n      document.documentElement.dataset.theme = 'dark';\n    ";
const inlineScriptHash = `sha256-${createHash('sha256')
  .update(inlineScript, 'utf8')
  .digest('base64')}`;

const shellHtml =
  '<!doctype html><html><head><title>tidy notebook</title>' +
  `<script>${inlineScript}</script>` +
  '<script type="module" src="/assets/main-AbCdEfGh.js"></script>' +
  '</head><body></body></html>';
const frameHtml =
  '<!doctype html><html><head><title>Diagram preview</title>' +
  '<style>body{margin:0}</style></head><body></body></html>';
// Large enough that the build step compresses it.
const scriptBody = `export const shell = ${JSON.stringify('x'.repeat(4096))};\n`;
// A source map that names a private source path. If it ever reached a caller,
// the path would leak, so the body is a witness that no map is served.
const sourceMapBody = JSON.stringify({
  version: 3,
  sources: ['../src/secret-source.ts'],
  mappings: 'AAAA',
});

// The build writes the name of the asset cache of the worker into the worker,
// and that name carries a digest of the precached bytes. Two deployments
// therefore write two bodies under the one address, which is why the answer
// below must be revalidated and must carry a tag of its own.
const workerBody =
  "self.addEventListener;const cache='notesapp-app-1111111111111111';\n";
const nextWorkerBody =
  "self.addEventListener;const cache='notesapp-app-22222222222222222222';\n";

/** Writes a build directory that looks like the emitted one. */
async function writeBuild(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-web-dist-'));
  await mkdir(join(directory, 'assets'), { recursive: true });
  await mkdir(join(directory, 'src', 'diagram'), { recursive: true });
  await writeFile(join(directory, 'index.html'), shellHtml, 'utf8');
  await writeFile(join(directory, 'src/diagram/frame.html'), frameHtml, 'utf8');
  await writeFile(
    join(directory, 'assets/main-AbCdEfGh.js'),
    scriptBody,
    'utf8',
  );
  await writeFile(join(directory, 'service-worker.js'), workerBody, 'utf8');
  // The build writes a hidden source map next to each chunk. It reaches the
  // image, so the server must refuse to serve it.
  await writeFile(
    join(directory, 'assets/main-AbCdEfGh.js.map'),
    sourceMapBody,
    'utf8',
  );
  // The precompressed neighbours that `tools/precompress-assets.mjs` writes.
  const bytes = Buffer.from(scriptBody, 'utf8');
  await writeFile(
    join(directory, 'assets/main-AbCdEfGh.js.gz'),
    gzipSync(bytes, { level: 9 }),
  );
  await writeFile(
    join(directory, 'assets/main-AbCdEfGh.js.br'),
    brotliCompressSync(bytes),
  );
  return directory;
}

await test('every answer carries the base security headers', async () => {
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  try {
    const health = await server.app.inject({
      method: 'GET',
      url: '/api/health',
    });
    assert.equal(health.statusCode, 200);
    assert.equal(health.headers['x-content-type-options'], 'nosniff');
    assert.equal(
      health.headers['referrer-policy'],
      'strict-origin-when-cross-origin',
    );
    assert.equal(health.headers['x-frame-options'], 'DENY');
    assert.match(String(health.headers['permissions-policy']), /camera=\(\)/);
    assert.equal(
      health.headers['content-security-policy'],
      "default-src 'none'; base-uri 'none'; form-action 'none'; " +
        "frame-ancestors 'none'",
    );
    // A plain HTTP deployment must not lock itself out of its own address.
    assert.equal(health.headers['strict-transport-security'], undefined);

    // A refused answer carries them too. A probe answers any host (record
    // 0199), so a normal operation stands for the refusal.
    const refused = await server.app.inject({
      method: 'GET',
      url: '/api/installation',
      headers: { host: 'attacker.invalid' },
    });
    assert.equal(refused.statusCode, 400);
    assert.equal(refused.headers['x-content-type-options'], 'nosniff');
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('an https deployment declares strict transport security', async () => {
  const server = await startTestServer({
    environment: {
      NOTESAPP_ORIGIN: 'https://notes.invalid',
      NOTESAPP_ADDITIONAL_ORIGINS: '',
    },
  });
  try {
    const answer = await server.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'notes.invalid' },
    });
    assert.equal(answer.statusCode, 200);
    assert.equal(
      answer.headers['strict-transport-security'],
      'max-age=31536000; includeSubDomains',
    );
  } finally {
    await server.close();
  }
});

await test('the shell names its inline script by hash and forbids inline script', async () => {
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  try {
    const answer = await server.app.inject({
      method: 'GET',
      url: '/notes/one',
    });
    assert.equal(answer.statusCode, 200);
    assert.equal(answer.headers['content-type'], 'text/html; charset=utf-8');
    const policy = String(answer.headers['content-security-policy']);
    assert.ok(
      policy.includes(`script-src 'self' '${inlineScriptHash}'`),
      policy,
    );
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
    assert.match(policy, /img-src 'self' blob: data: https:/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.equal(answer.headers['cache-control'], 'no-cache');
    assert.equal(answer.headers['x-frame-options'], 'DENY');
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('the framed diagram document may be framed by the shell only', async () => {
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  try {
    const answer = await server.app.inject({
      method: 'GET',
      url: '/src/diagram/frame.html',
    });
    assert.equal(answer.statusCode, 200);
    const policy = String(answer.headers['content-security-policy']);
    assert.match(policy, /frame-ancestors 'self'/);
    // A top-level open of the frame is sandboxed by the answer itself.
    assert.match(policy, /^sandbox allow-scripts; /);
    assert.match(policy, /script-src 'self' 'unsafe-inline'/);
    assert.equal(answer.headers['x-frame-options'], 'SAMEORIGIN');
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('a hashed asset is served compressed, immutable and measured', async () => {
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  const url = '/assets/main-AbCdEfGh.js';
  try {
    const raw = await server.app.inject({ method: 'GET', url });
    assert.equal(raw.statusCode, 200);
    assert.equal(raw.headers['content-encoding'], undefined);
    assert.equal(
      raw.headers['cache-control'],
      'public, max-age=31536000, immutable',
    );
    assert.equal(raw.headers['vary'], 'Accept-Encoding');
    assert.equal(
      Number(raw.headers['content-length']),
      Buffer.byteLength(scriptBody),
    );
    assert.ok(String(raw.headers['etag']).startsWith('"'));

    const brotli = await server.app.inject({
      method: 'GET',
      url,
      headers: { 'accept-encoding': 'gzip, br' },
    });
    assert.equal(brotli.statusCode, 200);
    assert.equal(brotli.headers['content-encoding'], 'br');
    const compressedLength = Number(brotli.headers['content-length']);
    assert.ok(
      compressedLength < Buffer.byteLength(scriptBody),
      `expected ${String(compressedLength)} to be smaller than the raw body`,
    );
    assert.equal(brotli.rawPayload.byteLength, compressedLength);

    const gzipped = await server.app.inject({
      method: 'GET',
      url,
      headers: { 'accept-encoding': 'gzip' },
    });
    assert.equal(gzipped.headers['content-encoding'], 'gzip');

    // A caller that refuses both encodings still gets the file.
    const identity = await server.app.inject({
      method: 'GET',
      url,
      headers: { 'accept-encoding': 'br;q=0, gzip;q=0' },
    });
    assert.equal(identity.statusCode, 200);
    assert.equal(identity.headers['content-encoding'], undefined);

    // Each representation carries its own tag, and a matching tag saves the body.
    assert.notEqual(raw.headers['etag'], brotli.headers['etag']);
    const revalidated = await server.app.inject({
      method: 'GET',
      url,
      headers: { 'if-none-match': String(raw.headers['etag']) },
    });
    assert.equal(revalidated.statusCode, 304);
    assert.equal(revalidated.body, '');
    assert.equal(revalidated.headers['etag'], raw.headers['etag']);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('a source map is never served, even when it is in the build', async () => {
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  try {
    const answer = await server.app.inject({
      method: 'GET',
      url: '/assets/main-AbCdEfGh.js.map',
    });
    // The map file exists on disk, but the server refuses it and does not fall
    // back to the application shell.
    assert.equal(answer.statusCode, 404);
    assert.notEqual(answer.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(answer.body.includes('secret-source.ts'), false);
    assert.equal(answer.body.includes('mappings'), false);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('a missing asset is 404 and never the application shell', async () => {
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  const missing = '/assets/shell-Z9Y8X7W6.js';
  try {
    // The shell is the wrong kind of bytes for a script, and every answer
    // carries `nosniff`, so a shell served here would be refused by the
    // browser and the page would report a module that cannot load instead of
    // the file that is missing.
    const answer = await server.app.inject({ method: 'GET', url: missing });
    assert.equal(answer.statusCode, 404);
    assert.notEqual(answer.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(answer.body.includes('<!doctype html>'), false);

    // A browser states what it will do with the bytes, and the answer is the
    // same, because the address decides and not the caller.
    const stated = await server.app.inject({
      method: 'GET',
      url: missing,
      headers: { 'sec-fetch-dest': 'script', 'sec-fetch-mode': 'cors' },
    });
    assert.equal(stated.statusCode, 404);
    assert.notEqual(stated.headers['content-type'], 'text/html; charset=utf-8');

    // Every other missing address is still a page of the router on the device.
    const page = await server.app.inject({
      method: 'GET',
      url: '/w/one/notes/two',
      headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' },
    });
    assert.equal(page.statusCode, 200);
    assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');

    // The installed worker asks again on behalf of a page it controls, and
    // that request names the worker as the caller. A page must not depend on
    // the hop it took, so the same address still receives the shell.
    const throughWorker = await server.app.inject({
      method: 'GET',
      url: '/w/one/notes/two',
      headers: {
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
      },
    });
    assert.equal(throughWorker.statusCode, 200);
    assert.equal(
      throughWorker.headers['content-type'],
      'text/html; charset=utf-8',
    );
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('a reader address never receives the application shell', async () => {
  // Decision 0047. Every address under the reader boundary answers the one
  // document of a published link or the one refusal of its subresources. The
  // last segment of a mangled reader address holds no dot, so the shell rule
  // alone would hand the reader the application, which asks a person with no
  // account to sign in. No publication store exists in this build, so every
  // token is unknown and the document says that the link is not available.
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  // Longer than the router bound that this server once carried, which turned
  // a padded address into an engine notice with the whole address in it.
  const longToken = 'a'.repeat(600);
  const note = '00000000-0000-4000-8000-000000000000';
  try {
    const page = await server.app.inject({
      method: 'GET',
      url: `/published/${longToken}`,
      headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' },
    });
    assert.equal(page.statusCode, 200);
    assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(page.headers['cache-control'], 'private, no-store');
    assert.ok(page.body.includes('This link is not available.'));
    // The shell, and nothing of it, reaches a reader.
    assert.equal(page.body.includes('type="module"'), false);
    assert.equal(page.body.includes(longToken), false);

    // A picture is a subresource, so it keeps the one refusal of 0047 and it
    // never answers a document of any kind.
    const attachment = await server.app.inject({
      method: 'GET',
      url: `/published/${longToken}/attachments/${note}/${note}`,
      headers: { 'sec-fetch-dest': 'image', 'sec-fetch-mode': 'no-cors' },
    });
    assert.equal(attachment.statusCode, 404);
    assert.match(
      String(attachment.headers['content-type']),
      /^application\/problem\+json/,
    );
    const problem: unknown = attachment.json();
    assert.ok(problem !== null && typeof problem === 'object');
    assert.equal(
      Object.fromEntries(Object.entries(problem)).code,
      'published_link_unavailable',
    );

    // An address under the boundary that names no operation at all is not a
    // page of the router either. It takes the not-found problem.
    for (const url of ['/published', '/published/one/two']) {
      const answer = await server.app.inject({ method: 'GET', url });
      assert.equal(answer.statusCode, 404, url);
      assert.match(
        String(answer.headers['content-type']),
        /^application\/problem\+json/,
        url,
      );
      assert.equal(answer.body.includes('<!doctype html>'), false, url);
    }

    // A note whose name starts with the same letters is still a page.
    const application = await server.app.inject({
      method: 'GET',
      url: '/published-notes',
    });
    assert.equal(application.statusCode, 200);
    assert.equal(
      application.headers['content-type'],
      'text/html; charset=utf-8',
    );
    assert.ok(application.body.includes('type="module"'));
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('the service worker is revalidated on every load', async () => {
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  try {
    const answer = await server.app.inject({
      method: 'GET',
      url: '/service-worker.js',
    });
    assert.equal(answer.statusCode, 200);
    assert.equal(answer.headers['cache-control'], 'no-cache');
    assert.equal(
      answer.headers['content-type'],
      'application/javascript; charset=utf-8',
    );
    // The browser enforces this policy on the worker, so the worker must be
    // allowed to reach its own origin during its precache install.
    const policy = String(answer.headers['content-security-policy']);
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /connect-src 'self'/);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('a rebuilt worker reaches a browser that holds the old one', async () => {
  const directory = await writeBuild();
  const server = await startTestServer({ webDist: directory });
  try {
    const first = await server.app.inject({
      method: 'GET',
      url: '/service-worker.js',
    });
    assert.equal(first.statusCode, 200);
    const tag = String(first.headers['etag']);
    assert.match(first.body, /notesapp-app-1111111111111111/);

    await writeFile(
      join(directory, 'service-worker.js'),
      nextWorkerBody,
      'utf8',
    );
    const second = await server.app.inject({
      method: 'GET',
      url: '/service-worker.js',
      headers: { 'if-none-match': tag },
    });
    // The browser learns the new cache name from this answer, so a stale one
    // would keep the device on the assets of the last deployment.
    assert.equal(second.statusCode, 200);
    assert.notEqual(String(second.headers['etag']), tag);
    assert.match(second.body, /notesapp-app-22222222222222222222/);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('an unexpected server error is logged with the failure', async () => {
  const recorder = new LogRecorder();
  const failure = 'the readiness probe pool is closed';
  const server = await startTestServer({
    environment: { NOTESAPP_LOG_LEVEL: 'error' },
    logStream: recorder,
    handlers: (config): HandlerMap => ({
      ...createHandlers(config),
      getHealth: () => {
        throw new Error(failure);
      },
    }),
  });
  try {
    const answer = await server.app.inject({
      method: 'GET',
      url: '/api/health',
    });
    assert.equal(answer.statusCode, 500);
    const problem: unknown = JSON.parse(answer.body);
    assert.ok(
      typeof problem === 'object' && problem !== null && 'code' in problem,
      'the answer is a problem document',
    );
    assert.equal(problem.code, 'internal_error');

    const logged = recorder
      .records()
      .filter((record) => record.level === 50)
      .find(
        (record) =>
          record.event === 'http.request.failed' &&
          record.errorName === 'Error',
      );
    assert.ok(
      logged !== undefined,
      `no error record named the event: ${recorder.lines.join('\n')}`,
    );
    // The record carries the request id, so a report from the user can be
    // matched to the stack that produced it.
    assert.equal(logged.requestId, answer.headers['x-request-id']);
    // The client answer still says nothing about the cause.
    assert.equal(answer.body.includes(failure), false);
  } finally {
    await server.close();
  }
});
