/**
 * Proves the sync notice stream through a real proxy in front of two server
 * processes (issue 191, records 0126, 0129, 0130).
 *
 * The proxy is the pinned Caddy image of `docker-compose.yml` with the
 * directives of `docker/Caddyfile`, and it sends every request to the first
 * process while that one answers. The device uses the browser transport of
 * `packages/api-client/src/socket.ts`. The run proves three things:
 *
 * 1. the upgrade passes the proxy, and a commit on the other process wakes
 *    the device;
 * 2. a drain of the first process stops the stream, and the transport
 *    reconnects through the proxy to the second process;
 * 3. after the reconnect, a commit wakes the device again.
 *
 * It needs Docker and the test database service, like `pnpm perf:service`.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import SocketClient from 'ws';
import {
  connectSyncNotices,
  createFile,
  encodeSyncNoticesMessage,
  getHealth,
  listWorkspaces,
  signInWithPassword,
  type SyncNoticesServerMessage,
} from '@notesapp/api-client';
import { bootstrapOwner, loadServerConfig } from '@notesapp/server';
import {
  authRole,
  createDocumentService,
  createTestDatabase,
  dropTestDatabase,
  runMigrations,
  runtimeRole,
  testAuthPassword,
  testDatabaseUrl,
  testRuntimePassword,
  withCredentials,
} from '@notesapp/storage-server';
import { firstSave } from '../../tests/integration/support/documents.ts';

const password = 'proxy-password-0123456789abcdef';

/** The pinned proxy image, read from the Compose file so it has one source. */
async function caddyImage(): Promise<string> {
  const compose = await readFile('docker-compose.yml', 'utf8');
  const image = /image: (caddy@sha256:[0-9a-f]{64})/.exec(compose)?.[1];
  if (image === undefined)
    throw new Error('The Compose file names no Caddy image.');
  return image;
}

/** Starts one built server process and waits until it listens. */
function startServer(
  environment: Record<string, string>,
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.startsWith('NOTESAPP_'),
          ),
        ),
        ...environment,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    createInterface({ input: child.stdout ?? process.stdin }).on(
      'line',
      (line) => {
        if (line.startsWith('notesapp: listening on ')) resolve(child);
      },
    );
    child.once('exit', () => {
      reject(new Error('A server stopped before it listened.'));
    });
  });
}

/** Waits until a condition holds, or fails with its name after a bound. */
async function until(
  condition: () => boolean | Promise<boolean>,
  what: string,
): Promise<void> {
  const started = Date.now();
  while (!(await condition())) {
    if (Date.now() - started > 30_000) throw new Error(`Timed out: ${what}.`);
    await delay(50);
  }
}

const serverUrl = testDatabaseUrl;
const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const migrationUrl = await createTestDatabase(serverUrl, name);
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-proxy-'));
const children: ChildProcess[] = [];
const proxyName = `notesapp-proxy-${randomUUID().slice(0, 8)}`;
let failed = false;
try {
  await runMigrations({
    documents: createDocumentService(),
    databaseUrl: migrationUrl,
    runtimePassword: testRuntimePassword,
    authPassword: testAuthPassword,
  });
  const base = 20_000 + Math.floor(Math.random() * 20_000);
  const [proxyPort, firstPort, secondPort] = [base, base + 1, base + 2];
  const origin = `http://127.0.0.1:${String(proxyPort)}`;
  const shared = {
    NOTESAPP_ORIGIN: origin,
    NOTESAPP_HOST: '127.0.0.1',
    NOTESAPP_DATABASE_URL: withCredentials(
      migrationUrl,
      runtimeRole,
      testRuntimePassword,
    ),
    NOTESAPP_AUTH_DATABASE_URL: withCredentials(
      migrationUrl,
      authRole,
      testAuthPassword,
    ),
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: randomBytes(32).toString('base64url'),
    NOTESAPP_LOG_LEVEL: 'warn',
    NOTESAPP_MAX_BODY_BYTES: '1048576',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_BREACH_CHECK: 'off',
    NOTESAPP_SHUTDOWN_GRACE_MS: '0',
    NOTESAPP_TRUSTED_PROXIES: '127.0.0.1',
  };
  const email = 'proxy@notes.invalid';
  await bootstrapOwner({
    config: loadServerConfig({ ...shared, NOTESAPP_PORT: String(firstPort) }),
    email,
    name: 'Proxy',
    password,
  });

  const first = await startServer({
    ...shared,
    NOTESAPP_PORT: String(firstPort),
  });
  children.push(first);
  const second = await startServer({
    ...shared,
    NOTESAPP_PORT: String(secondPort),
  });
  children.push(second);

  // The directives of docker/Caddyfile, with two upstreams on this host.
  const caddyfile = join(storageRoot, 'Caddyfile');
  await writeFile(
    caddyfile,
    `{\n\tadmin off\n\tauto_https off\n}\n\n:${String(proxyPort)} {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:${String(firstPort)} 127.0.0.1:${String(secondPort)} {\n\t\tlb_policy first\n\t\tlb_try_duration 5s\n\t\tfail_duration 30s\n\t}\n}\n`,
    'utf8',
  );
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--rm',
      '--name',
      proxyName,
      '--network',
      'host',
      '-v',
      `${caddyfile}:/etc/caddy/Caddyfile:ro`,
      await caddyImage(),
    ],
    { stdio: 'ignore' },
  );
  await until(
    async () =>
      (await getHealth({ baseUrl: origin }).catch(() => null))?.response
        ?.status === 200,
    'the proxy answers',
  );

  const signed = await signInWithPassword({
    baseUrl: origin,
    headers: { origin },
    body: { email, password },
  });
  const cookie = (signed.response?.headers.getSetCookie() ?? [])
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
  const workspaceId =
    (await listWorkspaces({ baseUrl: origin, headers: { cookie, origin } }))
      .data?.workspaces[0]?.workspaceId ?? '';

  // The browser adds the cookie and the origin to the upgrade by itself.
  const socketClass = class extends SocketClient {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers: { cookie, origin } });
    }
  };
  const messages: SyncNoticesServerMessage[] = [];
  let generation = 0;
  let opens = 0;
  const transport = connectSyncNotices(
    origin,
    {
      onOpen: () => {
        opens += 1;
      },
      onMessage: (message) => {
        if (message === null) return;
        messages.push(message);
        if (message.kind === 'ready') {
          generation += 1;
          transport.send(
            encodeSyncNoticesMessage({
              kind: 'subscribe',
              generation,
              workspaceIds: [workspaceId],
            }),
          );
        }
      },
      onClose: () => {},
    },
    { socketClass },
  );

  const commitOn = async (port: number): Promise<void> => {
    const direct = `http://127.0.0.1:${String(port)}`;
    const made = await createFile({
      baseUrl: direct,
      headers: { cookie, origin },
      path: { workspaceId },
      body: {
        fileId: randomUUID(),
        path: `proxy/${randomUUID()}.md`,
        document: firstSave('# Proxy\n'),
        revisionId: randomUUID(),
        mutationId: randomUUID(),
        deviceId: 'proxy-writer',
      },
    });
    if (made.error !== undefined)
      throw new Error(`A commit on port ${String(port)} failed.`);
  };
  const changes = (): number =>
    messages.filter((message) => message.kind === 'changed').length;

  await until(
    () => messages.some((message) => message.kind === 'subscribed'),
    'the set is accepted through the proxy',
  );
  await commitOn(secondPort);
  await until(
    () => changes() === 1,
    'a commit on the second process wakes the device',
  );
  process.stdout.write(
    '1. The upgrade passes the proxy, and the other process wakes the device.\n',
  );

  first.kill('SIGINT');
  await until(
    () =>
      messages.some(
        (message) => message.kind === 'stop' && message.reason === 'draining',
      ),
    'the drain stops the stream',
  );
  await until(
    () =>
      opens >= 2 &&
      messages.filter((message) => message.kind === 'subscribed').length >= 2,
    'the transport reconnects to the second process',
  );
  process.stdout.write(
    '2. A drain stops the stream, and the transport reconnects through the proxy.\n',
  );

  await commitOn(secondPort);
  await until(
    () => changes() === 2,
    'a commit after the reconnect wakes the device',
  );
  process.stdout.write(
    '3. After the reconnect, a commit wakes the device again.\n',
  );
  transport.close();
} catch (error) {
  failed = true;
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
} finally {
  try {
    execFileSync('docker', ['rm', '-f', proxyName], { stdio: 'ignore' });
  } catch {
    // The proxy never started.
  }
  for (const child of children) child.kill('SIGINT');
  await delay(500);
  await rm(storageRoot, { recursive: true, force: true });
  await dropTestDatabase(serverUrl, name).catch(() => {});
}
if (failed) process.exitCode = 1;
else process.stdout.write('The proxy path passed.\n');
