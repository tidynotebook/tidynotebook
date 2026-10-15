import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { Agent, createServer } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { join } from 'node:path';
import test, { after } from 'node:test';
import {
  nativeSourceDownloadDefaults,
  prepareNativeSources,
} from './native-sources.mjs';
import { root } from './workspace.mjs';

await mkdir(join(root, '.tooling'), { recursive: true });
const directory = await mkdtemp(join(root, '.tooling/native-source-test-'));
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-noenc',
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-keyout',
    join(directory, 'key.pem'),
    '-out',
    join(directory, 'cert.pem'),
  ],
  { stdio: 'pipe' },
);
const key = await readFile(join(directory, 'key.pem'));
const cert = await readFile(join(directory, 'cert.pem'));
const bytes = Buffer.from('pinned native source');
const sha256 = createHash('sha256').update(bytes).digest('hex');

/** @param {import('node:test').TestContext} t @param {(request:import('node:http').IncomingMessage,response:import('node:http').ServerResponse,count:number)=>void} handle @param {boolean} [tcp] */
async function fixture(t, handle, tcp = false) {
  const work = await mkdtemp(join(directory, 'download-'));
  let requests = 0;
  let connections = 0;
  const server = tcp
    ? createTcpServer()
    : createServer({ key, cert }, (request, response) =>
        handle(request, response, ++requests),
      );
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set();
  server.on('connection', (socket) => {
    connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(undefined)),
  );
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The local source server has no port.');
  const url = `https://127.0.0.1:${address.port}/source.tar.gz`;
  const agent = new Agent({ ca: cert, keepAlive: false });
  const manifestFile = join(work, 'input.json');
  const output = join(work, 'output');
  await writeFile(
    manifestFile,
    JSON.stringify({ sources: [{ file: 'source.tar.gz', url, sha256 }] }),
  );
  t.after(async () => {
    agent.destroy();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  });
  const options = {
    agent,
    connectTimeoutMs: 200,
    idleTimeoutMs: 200,
    requestTimeoutMs: 2_000,
    retryDelaysMs: [1, 2, 3],
  };
  return {
    url,
    output,
    manifestFile,
    options,
    requests: () => requests,
    connections: () => connections,
    download: () =>
      prepareNativeSources(output, undefined, manifestFile, options),
    saved: () => readFile(join(output, 'source.tar.gz')),
    files: () => readdir(output),
  };
}

await test('production download bounds and backoff stay fixed', () => {
  assert.deepEqual(nativeSourceDownloadDefaults, {
    connectTimeoutMs: 30_000,
    idleTimeoutMs: 30_000,
    requestTimeoutMs: 300_000,
    retryDelaysMs: [2_000, 5_000, 10_000],
  });
  assert.ok(Object.isFrozen(nativeSourceDownloadDefaults));
  assert.ok(Object.isFrozen(nativeSourceDownloadDefaults.retryDelaysMs));
});

await test(
  'a connection reset retries the same source and saves checked bytes',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (request, response, count) => {
      assert.equal(request.url, '/source.tar.gz');
      if (count === 1) request.socket.destroy();
      else response.end(bytes);
    });
    await f.download();
    assert.equal(f.requests(), 2);
    assert.deepEqual(await f.saved(), bytes);
    assert.deepEqual((await f.files()).sort(), [
      'manifest.json',
      'source.tar.gz',
    ]);
  },
);

await test(
  'a reset during the body discards partial bytes before retry',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (_request, response, count) => {
      if (count === 1) response.write('partial', () => response.destroy());
      else response.end(bytes);
    });
    await f.download();
    assert.equal(f.requests(), 2);
    assert.deepEqual(await f.saved(), bytes);
  },
);

for (const phase of ['headers', 'body']) {
  await test(
    `a stalled ${phase} request times out and retries`,
    { timeout: 5_000 },
    async (t) => {
      const f = await fixture(t, (_request, response, count) => {
        if (count > 1) response.end(bytes);
        else if (phase === 'body') response.write('partial');
      });
      await f.download();
      assert.equal(f.requests(), 2);
      assert.deepEqual(await f.saved(), bytes);
    },
  );
}

await test(
  '503 retries without reading the error body',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (_request, response, count) => {
      if (count === 1) response.writeHead(503).write('private error body');
      else response.end(bytes);
    });
    await f.download();
    assert.equal(f.requests(), 2);
    assert.deepEqual(await f.saved(), bytes);
  },
);

for (const cause of ['503', 'reset']) {
  await test(
    `persistent ${cause} gives up after four attempts and names the source`,
    { timeout: 5_000 },
    async (t) => {
      const f = await fixture(t, (request, response) => {
        if (cause === 'reset') request.socket.destroy();
        else response.writeHead(503).end('private error body');
      });
      await assert.rejects(f.download(), (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /source\.tar\.gz/);
        assert.match(error.message, /127\.0\.0\.1/);
        assert.match(error.message, /4 attempts/);
        assert.match(error.message, cause === 'reset' ? /ECONNRESET/ : /503/);
        assert.doesNotMatch(error.message, /private error body/);
        return true;
      });
      assert.equal(f.requests(), 4);
      assert.deepEqual(await f.files(), []);
    },
  );
}

await test(
  'a stalled TLS connection gives up within the connection bound',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, () => {}, true);
    await assert.rejects(
      f.download(),
      /source\.tar\.gz.*127\.0\.0\.1.*connection and headers time out/,
    );
    assert.equal(f.connections(), 4);
    assert.deepEqual(await f.files(), []);
  },
);

await test(
  'the hard request cap stops a body that keeps sending data',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (_request, response) => {
      response.write('partial');
      const interval = setInterval(() => response.write('more'), 5);
      response.on('close', () => clearInterval(interval));
    });
    f.options.requestTimeoutMs = 100;
    await assert.rejects(
      f.download(),
      /source\.tar\.gz.*127\.0\.0\.1.*request time limit/,
    );
    assert.equal(f.requests(), 4);
    assert.deepEqual(await f.files(), []);
  },
);

await test(
  '404 is refused without a retry or error body content',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (_request, response) =>
      response.writeHead(404).end('private error body'),
    );
    await assert.rejects(f.download(), (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /source\.tar\.gz.*127\.0\.0\.1.*404/);
      assert.doesNotMatch(error.message, /private error body/);
      return true;
    });
    assert.equal(f.requests(), 1);
    assert.deepEqual(await f.files(), []);
  },
);

await test(
  'an untrusted certificate is refused without a retry',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (_request, response) => response.end(bytes));
    const agent = new Agent({ keepAlive: false });
    t.after(() => agent.destroy());
    await assert.rejects(
      prepareNativeSources(f.output, undefined, f.manifestFile, {
        ...f.options,
        agent,
      }),
      /source\.tar\.gz.*127\.0\.0\.1.*certificate/i,
    );
    assert.equal(f.requests(), 0);
    assert.equal(f.connections(), 1);
    assert.deepEqual(await f.files(), []);
  },
);

await test(
  'a hash mismatch never retries or writes source output',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (_request, response) =>
      response.end('changed source'),
    );
    await assert.rejects(f.download(), /hash differs: source\.tar\.gz/);
    assert.equal(f.requests(), 1);
    assert.deepEqual(await f.files(), []);
  },
);

await test('a checked cache needs no upstream request', async (t) => {
  const f = await fixture(t, (_request, response) =>
    response.writeHead(503).end(),
  );
  await mkdir(f.output);
  await writeFile(join(f.output, 'source.tar.gz'), bytes);
  await prepareNativeSources(f.output, f.output, f.manifestFile, f.options);
  assert.equal(f.requests(), 0);
  assert.deepEqual(await f.saved(), bytes);
});

for (const cached of [undefined, 'corrupt archive']) {
  await test(`a ${cached === undefined ? 'missing' : 'corrupt'} cache fetches and checks the archive`, async (t) => {
    const f = await fixture(t, (_request, response) => response.end(bytes));
    if (cached !== undefined) {
      await mkdir(f.output);
      await writeFile(join(f.output, 'source.tar.gz'), cached);
    }
    await prepareNativeSources(f.output, f.output, f.manifestFile, f.options);
    assert.equal(f.requests(), 1);
    assert.deepEqual(await f.saved(), bytes);
    await prepareNativeSources(f.output, f.output, f.manifestFile, f.options);
    assert.equal(f.requests(), 1);
  });
}

await test('a corrupt cache and a wrong fetched hash leave no archive', async (t) => {
  const f = await fixture(t, (_request, response) =>
    response.end('wrong upstream bytes'),
  );
  await mkdir(f.output);
  await writeFile(join(f.output, 'source.tar.gz'), 'corrupt archive');
  await assert.rejects(
    prepareNativeSources(f.output, f.output, f.manifestFile, f.options),
    /hash differs: source\.tar\.gz/,
  );
  assert.equal(f.requests(), 1);
  assert.deepEqual(await f.files(), []);
});

await test('the image copies checked cache bytes to its notices', async (t) => {
  const f = await fixture(t, (_request, response) =>
    response.writeHead(503).end(),
  );
  const cache = join(f.output, 'cache');
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, 'source.tar.gz'), bytes);
  await prepareNativeSources(f.output, cache, f.manifestFile, f.options);
  assert.equal(f.requests(), 0);
  assert.deepEqual(await f.saved(), bytes);
});

await test(
  'HTTPS redirects retain integrity and refuse a move to HTTP',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (request, response) => {
      if (request.url === '/source.tar.gz')
        response.writeHead(302, { location: '/checked' }).end();
      else response.end(bytes);
    });
    await f.download();
    assert.equal(f.requests(), 2);
    assert.deepEqual(await f.saved(), bytes);
    const unsafe = await fixture(t, (_request, response) =>
      response.writeHead(302, { location: 'http://127.0.0.1/unsafe' }).end(),
    );
    await assert.rejects(unsafe.download(), /redirect is invalid/);
    assert.equal(unsafe.requests(), 1);
  },
);

await test(
  'redirect loops stop at the existing limit without a retry',
  { timeout: 5_000 },
  async (t) => {
    const f = await fixture(t, (_request, response) =>
      response.writeHead(302, { location: '/source.tar.gz' }).end(),
    );
    await assert.rejects(f.download(), /redirect is invalid/);
    assert.equal(f.requests(), 9);
    assert.deepEqual(await f.files(), []);
  },
);

after(() => rm(directory, { recursive: true, force: true }));
