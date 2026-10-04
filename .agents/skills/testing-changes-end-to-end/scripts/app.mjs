/**
 * Starts, stops and reports the local application of one worktree.
 *
 * Usage, from anywhere inside the worktree:
 *
 *     node .agents/skills/testing-changes-end-to-end/scripts/app.mjs start [--port <port>] [--object-store s3]
 *     node .agents/skills/testing-changes-end-to-end/scripts/app.mjs status
 *     node .agents/skills/testing-changes-end-to-end/scripts/app.mjs restart
 *     node .agents/skills/testing-changes-end-to-end/scripts/app.mjs stop
 *
 * `start` runs `tools/dev-app.mjs` of this worktree in the background: it
 * builds this worktree, makes a new database on the shared test PostgreSQL
 * service, makes a new file store, creates an owner, and serves the whole
 * application on one port. The script waits until the server listens and
 * prints one JSON object: the origin, the sign-in email and password, the
 * port, the process and the log. It writes the same object to
 * `.local-app/app.json`, which `session.mjs` reads.
 *
 * `--object-store s3` keeps the uploads and the imports of the run in a
 * bucket of its own on the test MinIO service instead of its file store
 * (record 0192). `restart` keeps the store of the run.
 *
 * Every worktree keeps its own `.local-app/` and takes a free port, so two
 * worktrees run two applications that share nothing but the PostgreSQL
 * service, and each run there has a database of its own.
 *
 * `stop` sends the application SIGTERM and waits while it removes its
 * database and its file store. `restart` stops and starts on the same port,
 * which a change needs, because the application serves the build that
 * `start` made.
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** The worktree root: scripts, the skill, `skills`, `.agents`, the root. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const stateDirectory = join(root, '.local-app');
const stateFile = join(stateDirectory, 'app.json');
const logFile = join(stateDirectory, 'app.log');

// A first start builds every package and the web bundle, which takes one to
// three minutes on a laptop. Ten minutes covers a cold cache and a slow disk
// and still ends a start that hangs.
const startTimeoutMs = 10 * 60 * 1000;
// The application removes its database and its file store when it stops,
// which takes a few seconds. One minute covers a slow database.
const stopTimeoutMs = 60 * 1000;
// The log is read twice a second while the application starts.
const pollMs = 500;

/** @typedef {{ origin: string, email: string, password: string, port: number, pid: number, log: string, commit: string, changedFiles: number, objectStore: 'filesystem' | 's3' }} AppState */

/**
 * The commit that a start builds, and how many files differ from it.
 *
 * `status` prints both, so a caller can tell whether the code changed since
 * the build that the application serves.
 */
function sourceState() {
  const git = (/** @type {string[]} */ ...args) =>
    spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim();
  const changed = git('status', '--porcelain');
  return {
    commit: git('rev-parse', '--short', 'HEAD'),
    changedFiles: changed === '' ? 0 : changed.split('\n').length,
  };
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/** @param {number} pid */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * The application that `start` recorded, or `null` when it recorded none.
 *
 * @returns {AppState | null}
 */
function readState() {
  if (!existsSync(stateFile)) return null;
  /** @type {unknown} */
  const value = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (value === null || typeof value !== 'object') return null;
  /** @param {string} key @returns {string} */
  const text = (key) => {
    /** @type {unknown} */
    const field = Reflect.get(value, key);
    if (typeof field !== 'string')
      throw new Error(`${stateFile} lacks ${key}.`);
    return field;
  };
  /** @param {string} key @returns {number} */
  const count = (key) => {
    /** @type {unknown} */
    const field = Reflect.get(value, key);
    if (typeof field !== 'number')
      throw new Error(`${stateFile} lacks ${key}.`);
    return field;
  };
  return {
    origin: text('origin'),
    email: text('email'),
    password: text('password'),
    port: count('port'),
    pid: count('pid'),
    log: text('log'),
    commit: text('commit'),
    changedFiles: count('changedFiles'),
    objectStore:
      Reflect.get(value, 'objectStore') === 's3' ? 's3' : 'filesystem',
  };
}

/**
 * A port that nothing listens on now, chosen by the operating system.
 *
 * @returns {Promise<number>}
 */
function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => done(port));
    });
  });
}

/** @param {string} text @param {string} label */
function lineValue(text, label) {
  const line = text.split('\n').find((entry) => entry.startsWith(label));
  return line === undefined ? null : line.slice(label.length).trim();
}

/**
 * @param {number | null} requestedPort
 * @param {'filesystem' | 's3'} objectStore
 * @returns {Promise<AppState & { reused?: true }>}
 */
async function start(requestedPort, objectStore) {
  const running = readState();
  if (running !== null && isAlive(running.pid))
    return { reused: true, ...running };
  mkdirSync(stateDirectory, { recursive: true });
  const source = sourceState();
  const port = requestedPort ?? (await freePort());
  const log = openSync(logFile, 'w');
  const child = spawn(
    process.execPath,
    [
      'tools/dev-app.mjs',
      '--port',
      String(port),
      '--object-store',
      objectStore,
    ],
    { cwd: root, detached: true, stdio: ['ignore', log, log] },
  );
  closeSync(log);
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  child.unref();
  const deadline = Date.now() + startTimeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const text = readFileSync(logFile, 'utf8');
    const origin = lineValue(text, 'Open ');
    const email = lineValue(text, 'Email: ');
    const password = lineValue(text, 'Password: ');
    if (origin !== null && email !== null && password !== null) {
      /** @type {AppState} */
      const state = {
        origin,
        email,
        password,
        port,
        pid: child.pid ?? 0,
        log: logFile,
        ...source,
        objectStore,
      };
      writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
      return state;
    }
    if (exited)
      throw new Error(
        `The application stopped before it listened. Read ${logFile}.`,
      );
  }
  if (child.pid !== undefined) process.kill(child.pid, 'SIGTERM');
  throw new Error(
    `The application did not listen in ${startTimeoutMs / 60000} minutes. Read ${logFile}.`,
  );
}

async function stop() {
  const running = readState();
  if (running === null) return { stopped: false, reason: 'no application' };
  if (isAlive(running.pid)) {
    process.kill(running.pid, 'SIGTERM');
    const deadline = Date.now() + stopTimeoutMs;
    while (isAlive(running.pid)) {
      if (Date.now() > deadline)
        throw new Error(
          `Process ${running.pid} did not stop in one minute. Read ${running.log}.`,
        );
      await sleep(pollMs);
    }
  }
  rmSync(stateFile, { force: true });
  return { stopped: true, port: running.port };
}

/**
 * @param {readonly string[]} args
 * @param {'filesystem' | 's3'} fallback
 * @returns {'filesystem' | 's3'}
 */
function storeArgument(args, fallback) {
  const at = args.indexOf('--object-store');
  if (at === -1) return fallback;
  const value = args[at + 1];
  if (value !== 'filesystem' && value !== 's3')
    throw new Error('--object-store takes filesystem or s3.');
  return value;
}

/** @param {readonly string[]} args */
function portArgument(args) {
  const at = args.indexOf('--port');
  if (at === -1) return null;
  const port = Number(args[at + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('--port takes a port from 1 to 65535.');
  return port;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'start')
    return start(portArgument(args), storeArgument(args, 'filesystem'));
  if (command === 'stop') return stop();
  if (command === 'restart') {
    const running = readState();
    const port = portArgument(args) ?? running?.port ?? null;
    const store = storeArgument(args, running?.objectStore ?? 'filesystem');
    await stop();
    return start(port, store);
  }
  if (command === 'status') {
    const running = readState();
    return running === null
      ? { running: false }
      : { running: isAlive(running.pid), ...running, now: sourceState() };
  }
  throw new Error(
    'Usage: app.mjs start [--port <port>] [--object-store s3] | status | restart | stop',
  );
}

try {
  process.stdout.write(`${JSON.stringify(await main(), null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
