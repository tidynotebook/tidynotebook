/**
 * Measures the sync notice stream against polling, and holds the targets of
 * issue 191 as bounds (records 0124, 0129).
 *
 * The run makes a disposable database and starts the built server as a child
 * process, so the memory of the server is read apart from the clients. It
 * signs in 25 accounts and opens 8 devices for each, 200 in all, which is the
 * target population. Each device holds one notice stream with the account
 * session and subscribes to the personal workspace of its account.
 *
 * Workloads, each stated once and run in this order:
 *
 * - idle: every device connected and quiet;
 * - writers: 20 accounts commit one note each second, and every device of the
 *   account records the delay from the start of the commit to its notice;
 * - hot: one account commits ten notes each second to one workspace;
 * - slow: one device stops reading during the hot writes, and the other
 *   devices of that account keep their delay;
 * - reconnect: every device drops and connects again at once;
 * - polling: the same writers with the streams closed, and 200 devices that read the
 *   feed every 15 seconds, as a device without the stream does.
 *
 * The bounds fail the run. Everything else is a measured result to record on
 * the issue, never in a document.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import SocketClient from 'ws';
import {
  createFile,
  createInvitation,
  registerAccount,
  getChanges,
  listWorkspaces,
  readSyncNoticesMessage,
  signInWithPassword,
  startSnapshot,
  syncNoticesAddress,
  syncNoticesProtocol,
  encodeSyncNoticesMessage,
  type SyncNoticesServerMessage,
} from '@notesapp/api-client';
import { bootstrapOwner, loadServerConfig } from '@notesapp/server';
import {
  authRole,
  createTestDatabase,
  createDocumentService,
  dropTestDatabase,
  processConnectionLimit,
  runMigrations,
  runtimeRole,
  testAuthPassword,
  testDatabaseUrl,
  testRuntimePassword,
  withCredentials,
} from '@notesapp/storage-server';
import { firstSave } from '../../tests/integration/support/documents.ts';

/**
 * The targets that the owner set on issue 191. The connection bound is the
 * sum of the pool sizes of one server process, so it follows the pools.
 */
export const noticeTargets = {
  devices: 200,
  writers: 20,
  delayP95Ms: 2_000,
  serverMemoryBytes: 512 * 1024 * 1024,
  databaseConnections: processConnectionLimit,
} as const;

const accountsCount = 25;
const devicesPerAccount = noticeTargets.devices / accountsCount;
const pollMs = 15_000;
const password = 'performance-password-0123456789';

/** The value at a fraction of a sorted copy, or 0 for an empty list. */
function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(fraction * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)] ?? 0;
}

/** The resident memory of one process, in bytes. */
async function residentBytes(pid: number): Promise<number> {
  const status = await readFile(`/proc/${String(pid)}/status`, 'utf8');
  const line = status.split('\n').find((entry) => entry.startsWith('VmRSS:'));
  const kilobytes = Number(line?.replace(/[^0-9]/g, '') ?? '0');
  return kilobytes * 1024;
}

/** One device and what it received. */
type Device = {
  readonly account: Account;
  socket: SocketClient | null;
  readonly received: { at: number; message: SyncNoticesServerMessage }[];
  subscribed: Promise<void>;
};

/** One account, its session, and its workspace. */
type Account = {
  readonly email: string;
  readonly cookie: string;
  readonly workspaceId: string;
};

/** Signs one account in and answers its cookie header. */
async function signIn(baseUrl: string, email: string): Promise<string> {
  const signed = await signInWithPassword({
    baseUrl,
    headers: { origin: baseUrl },
    body: { email, password },
  });
  return (signed.response?.headers.getSetCookie() ?? [])
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
}

/** Opens the stream of one device and resolves when its set is accepted. */
function connect(baseUrl: string, device: Device): Promise<void> {
  const socket = new SocketClient(
    syncNoticesAddress(baseUrl),
    [syncNoticesProtocol],
    { headers: { cookie: device.account.cookie, origin: baseUrl } },
  );
  device.socket = socket;
  return new Promise((resolve, reject) => {
    socket.once('unexpected-response', (_request, response) => {
      reject(new Error(`refused ${String(response.statusCode)}`));
    });
    socket.once('error', reject);
    socket.on('message', (data) => {
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data);
      const message = readSyncNoticesMessage(bytes.toString('utf8'));
      if (message === null) return;
      device.received.push({ at: performance.now(), message });
      if (message.kind === 'ready')
        socket.send(
          encodeSyncNoticesMessage({
            kind: 'subscribe',
            generation: 1,
            workspaceIds: [device.account.workspaceId],
          }),
        );
      if (message.kind === 'subscribed') resolve();
    });
  });
}

/** Connects a device, and tries again while its old reservation expires. */
async function connectWithRetry(
  baseUrl: string,
  device: Device,
): Promise<number> {
  const started = performance.now();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await connect(baseUrl, device);
      return performance.now() - started;
    } catch {
      device.socket?.terminate();
      await delay(250);
    }
  }
  throw new Error('A device could not reconnect.');
}

/** Commits one note and answers the time the request started. */
async function commitNote(baseUrl: string, account: Account): Promise<number> {
  return (await commitFile(baseUrl, account)).at;
}

/** Commits one note and answers its file and the time the request started. */
async function commitFile(
  baseUrl: string,
  account: Account,
): Promise<{ readonly at: number; readonly fileId: string }> {
  const started = performance.now();
  const fileId = randomUUID();
  const made = await createFile({
    baseUrl,
    headers: { cookie: account.cookie, origin: baseUrl },
    path: { workspaceId: account.workspaceId },
    body: {
      fileId,
      path: `load/${randomUUID()}.md`,
      document: firstSave('# Load\n'),
      revisionId: randomUUID(),
      mutationId: randomUUID(),
      deviceId: 'load-writer',
    },
  });
  if (made.error !== undefined) throw new Error('A load commit failed.');
  return { at: started, fileId };
}

/**
 * The delays of every notice that followed one set of commits. Each device
 * of the account takes, for each commit, its first notice after the start.
 */
function noticeDelays(
  devices: readonly Device[],
  commits: readonly { account: Account; at: number }[],
): number[] {
  const delays: number[] = [];
  for (const commit of commits)
    for (const device of devices) {
      if (device.account !== commit.account) continue;
      const notice = device.received.find(
        (entry) => entry.message.kind === 'changed' && entry.at >= commit.at,
      );
      if (notice !== undefined) delays.push(notice.at - commit.at);
    }
  return delays;
}

/** Runs `write` each `everyMs` for `forMs`, and collects the commits. */
async function writeFor(
  accounts: readonly Account[],
  everyMs: number,
  forMs: number,
  write: (account: Account) => Promise<number>,
): Promise<{ account: Account; at: number }[]> {
  const commits: { account: Account; at: number }[] = [];
  const end = performance.now() + forMs;
  while (performance.now() < end) {
    const round = await Promise.all(
      accounts.map(async (account) => ({ account, at: await write(account) })),
    );
    commits.push(...round);
    await delay(everyMs);
  }
  return commits;
}

const serverUrl = testDatabaseUrl;
const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const migrationUrl = await createTestDatabase(serverUrl, name);
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-perf-notices-'));
let server: ChildProcess | null = null;
const failures: string[] = [];
try {
  await runMigrations({
    documents: createDocumentService(),
    databaseUrl: migrationUrl,
    runtimePassword: testRuntimePassword,
    authPassword: testAuthPassword,
  });
  const runtimeUrl = withCredentials(
    migrationUrl,
    runtimeRole,
    testRuntimePassword,
  );
  const authUrl = withCredentials(migrationUrl, authRole, testAuthPassword);
  const port = 3000 + Math.floor(Math.random() * 1000) + 5000;
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const environment = {
    NOTESAPP_ORIGIN: baseUrl,
    NOTESAPP_HOST: '127.0.0.1',
    NOTESAPP_PORT: String(port),
    NOTESAPP_DATABASE_URL: runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: randomBytes(32).toString('base64url'),
    NOTESAPP_LOG_LEVEL: 'warn',
    NOTESAPP_MAX_BODY_BYTES: '1048576',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_RATE_LIMIT_MAX: '100000',
    NOTESAPP_BREACH_CHECK: 'off',
    NOTESAPP_SHUTDOWN_GRACE_MS: '0',
  };

  // The accounts come in through the one registration path: the first one as
  // the owner, and each other one through an invitation, as an operator adds
  // them.
  const config = loadServerConfig(environment);
  const admin = new pg.Client({ connectionString: migrationUrl });
  admin.on('error', () => {
    // The drop at the end ends this connection, which is expected.
  });
  await admin.connect();
  await bootstrapOwner({
    config,
    email: 'load-0@notes.invalid',
    name: 'Load 0',
    password,
  });

  const start = (env: Record<string, string>): Promise<ChildProcess> =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) => !key.startsWith('NOTESAPP_'),
            ),
          ),
          ...env,
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
        reject(new Error('The server stopped before it listened.'));
      });
    });
  server = await start(environment);
  const pid = server.pid ?? 0;
  let peakBytes = 0;
  let phaseConnections = 0;
  const sampler = setInterval(() => {
    void residentBytes(pid).then(
      (bytes) => {
        peakBytes = Math.max(peakBytes, bytes);
      },
      () => {},
    );
  }, 250);
  const connectionSampler = setInterval(() => {
    void connections().then(
      (held) => {
        phaseConnections = Math.max(phaseConnections, held);
      },
      () => {},
    );
  }, 100);
  const phasePeak = (): number => {
    const peak = phaseConnections;
    phaseConnections = 0;
    return peak;
  };
  const connections = async (): Promise<number> => {
    const rows = await admin.query<{ held: number }>(
      // The server connects as the runtime role and the identity role. The
      // tool reads with the migration role, which this count leaves out.
      'select count(*)::int as held from pg_stat_activity where datname = $1 and usename in ($2, $3)',
      [name, runtimeRole, authRole],
    );
    return rows.rows[0]?.held ?? 0;
  };
  const commitsOfDatabase = async (): Promise<number> => {
    const rows = await admin.query<{ done: string }>(
      'select xact_commit::text as done from pg_stat_database where datname = $1',
      [name],
    );
    return Number(rows.rows[0]?.done ?? '0');
  };

  // The owner invites every other account over HTTP, and each registers.
  const emails = ['load-0@notes.invalid'];
  const ownerCookie = await signIn(baseUrl, 'load-0@notes.invalid');
  for (let index = 1; index < accountsCount; index += 1) {
    const email = `load-${String(index)}@notes.invalid`;
    const made = await createInvitation({
      baseUrl,
      headers: { cookie: ownerCookie, origin: baseUrl },
      body: { email },
    });
    const token = new URL(made.data?.link ?? 'http://x/').hash.slice(1);
    const registered = await registerAccount({
      baseUrl,
      headers: { origin: baseUrl },
      body: { invitation: token, password },
    });
    if (registered.response?.status !== 201)
      throw new Error(`Account ${String(index)} was not registered.`);
    emails.push(email);
  }
  const accounts: Account[] = [];
  for (const email of emails) {
    const cookie = await signIn(baseUrl, email);
    const listed = await listWorkspaces({
      baseUrl,
      headers: { cookie, origin: baseUrl },
    });
    accounts.push({
      email,
      cookie,
      workspaceId: listed.data?.workspaces[0]?.workspaceId ?? '',
    });
  }

  const devices: Device[] = accounts.flatMap((account) =>
    Array.from({ length: devicesPerAccount }, () => ({
      account,
      socket: null,
      received: [],
      subscribed: Promise.resolve(),
    })),
  );
  const openTimes = await Promise.all(
    devices.map((device) => connectWithRetry(baseUrl, device)),
  );
  const results: Record<string, number> = {
    devicesConnected: devices.length,
    openP95Ms: Math.round(percentile(openTimes, 0.95)),
  };

  // Idle: the stream needs no read while nothing changes.
  // PostgreSQL flushes the counts of a backend a few seconds late, so the
  // window starts after the counts of the connect storm have landed.
  await delay(12_000);
  const idleStart = await commitsOfDatabase();
  await delay(20_000);
  results['idleDatabaseCommitsPerMinute'] = Math.round(
    ((await commitsOfDatabase()) - idleStart) * 3,
  );
  results['idleServerMemoryMb'] = Math.round(
    (await residentBytes(pid)) / 1048576,
  );
  results['idleDatabaseConnections'] = await connections();
  phasePeak();

  // Writers: twenty accounts commit once a second for ten seconds.
  const writers = accounts.slice(0, noticeTargets.writers);
  const writeCommits = await writeFor(writers, 1_000, 10_000, (account) =>
    commitNote(baseUrl, account),
  );
  await delay(2_000);
  const writerDelays = noticeDelays(devices, writeCommits);
  results['writerNoticeP50Ms'] = Math.round(percentile(writerDelays, 0.5));
  results['writerNoticeP95Ms'] = Math.round(percentile(writerDelays, 0.95));
  results['writerNoticesReceived'] = writerDelays.length;
  results['writerNoticesExpected'] = writeCommits.length * devicesPerAccount;

  // Hot and slow: one account writes ten times a second, and one of its
  // devices stops reading.
  const hot = accounts[accounts.length - 1];
  if (hot === undefined) throw new Error('The run has no hot account.');
  const hotDevices = devices.filter((device) => device.account === hot);
  const slow = hotDevices[0];
  slow?.socket?.pause();
  const hotCommits = await writeFor([hot], 100, 3_000, (account) =>
    commitNote(baseUrl, account),
  );
  await delay(2_000);
  const hotDelays = noticeDelays(hotDevices.slice(1), hotCommits);
  results['hotNoticeP95Ms'] = Math.round(percentile(hotDelays, 0.95));
  results['hotCommits'] = hotCommits.length;
  results['hotNoticesPerDevice'] = Math.round(
    hotDelays.length / Math.max(1, hotDevices.length - 1),
  );
  slow?.socket?.resume();

  // Reconnect: every device drops and connects at once.
  for (const device of devices) device.socket?.terminate();
  const reconnectTimes = await Promise.all(
    devices.map((device) => connectWithRetry(baseUrl, device)),
  );
  results['reconnectP95Ms'] = Math.round(percentile(reconnectTimes, 0.95));
  results['reconnectMaxMs'] = Math.round(Math.max(...reconnectTimes));
  results['peakServerMemoryMb'] = Math.round(peakBytes / 1048576);
  results['pushPeakDatabaseConnections'] = phasePeak();
  for (const device of devices) device.socket?.close();

  // Polling: the same writers with every stream closed, and 200 devices that read
  // the feed every 15 seconds from their stored cursor.
  const cursors = new Map<Device, string>();
  // A device starts from the cursor of a snapshot, as a first sync does.
  for (const device of devices) {
    const started = await startSnapshot({
      baseUrl,
      headers: { cookie: device.account.cookie, origin: baseUrl },
      path: { workspaceId: device.account.workspaceId },
      body: { syncVersion: 1 },
    });
    if (started.data === undefined)
      throw new Error('A snapshot did not start.');
    cursors.set(device, started.data.cursor);
  }
  const pollStart = await commitsOfDatabase();
  const discoveries: number[] = [];
  let pollReads = 0;
  let polling = true;
  const pollers = devices.map(async (device, index) => {
    await delay((index / devices.length) * pollMs);
    while (polling) {
      const read = await getChanges({
        baseUrl,
        headers: { cookie: device.account.cookie, origin: baseUrl },
        path: { workspaceId: device.account.workspaceId },
        query: { cursor: cursors.get(device) ?? '0' },
      });
      if (read.error !== undefined) throw new Error('A poll read failed.');
      pollReads += 1;
      const now = performance.now();
      for (const change of read.data?.changes ?? []) {
        if (change.kind === 'membership') continue;
        const commit = pollCommits.find(
          (entry) => entry.fileId === change.fileId,
        );
        if (commit !== undefined) discoveries.push(now - commit.at);
      }
      cursors.set(device, read.data?.nextCursor ?? cursors.get(device) ?? '0');
      await delay(pollMs);
    }
  });
  const pollCommits: { at: number; fileId: string }[] = [];
  const pollEnd = performance.now() + 10_000;
  while (performance.now() < pollEnd) {
    await Promise.all(
      writers.map(async (account) => {
        pollCommits.push(await commitFile(baseUrl, account));
      }),
    );
    await delay(1_000);
  }
  await delay(pollMs + 2_000);
  polling = false;
  await Promise.all(pollers);
  results['pollDiscoveryP50Ms'] = Math.round(percentile(discoveries, 0.5));
  results['pollDiscoveryP95Ms'] = Math.round(percentile(discoveries, 0.95));
  results['pollReadsPerMinute'] = Math.round(
    pollReads / ((performance.now() - (pollEnd - 10_000)) / 60_000),
  );
  results['pollPeakDatabaseConnections'] = phasePeak();
  results['pollDatabaseCommitsPerMinute'] = Math.round(
    ((await commitsOfDatabase()) - pollStart) /
      ((performance.now() - (pollEnd - 10_000)) / 60_000),
  );

  clearInterval(sampler);
  clearInterval(connectionSampler);
  await admin.end();

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  if (results['devicesConnected'] !== noticeTargets.devices)
    failures.push('not every device connected');
  if ((results['writerNoticeP95Ms'] ?? Infinity) >= noticeTargets.delayP95Ms)
    failures.push('writer notice p95 is over the target');
  if ((results['hotNoticeP95Ms'] ?? Infinity) >= noticeTargets.delayP95Ms)
    failures.push('hot notice p95 is over the target');
  if (peakBytes >= noticeTargets.serverMemoryBytes)
    failures.push('server memory is over the target');
  if (
    (results['pushPeakDatabaseConnections'] ?? Infinity) >
    noticeTargets.databaseConnections
  )
    failures.push('database connections are over the pool maximum');
  if (
    (results['pushPeakDatabaseConnections'] ?? Infinity) >
    (results['pollPeakDatabaseConnections'] ?? 0)
  )
    failures.push('push opened more connections than polling');
  if (
    (results['writerNoticesReceived'] ?? 0) <
    (results['writerNoticesExpected'] ?? 1)
  )
    failures.push('a device missed a notice of a writer');
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  failures.push('the run failed before it measured every workload');
} finally {
  server?.kill('SIGINT');
  await rm(storageRoot, { recursive: true, force: true });
  await dropTestDatabase(serverUrl, name).catch(() => {});
}
if (failures.length > 0) {
  process.stderr.write(
    `Notice bounds failed:\n${failures.map((line) => `  ${line}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write('Notice bounds passed.\n');
}
