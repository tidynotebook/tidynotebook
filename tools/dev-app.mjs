/** Builds the application, starts the test service, and runs the local server. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const defaultPort = 3000;
const usage =
  'Usage: pnpm dev:app [--port <1-65535>] [--object-store filesystem|s3]';
/** @type {import('node:child_process').ChildProcess | null} */
let activeChild = null;
let interrupted = false;

/**
 * Accept an optional port so two local runs can use the same test service,
 * and an optional object store: the file store, or a bucket of its own on the
 * test MinIO service (record 0192).
 *
 * @param {readonly string[]} args
 * @returns {{ port: number, objectStore: 'filesystem' | 's3' }}
 */
export function readOptions(args) {
  let port = defaultPort;
  /** @type {'filesystem' | 's3'} */
  let objectStore = 'filesystem';
  const seen = new Set();
  for (let at = 0; at < args.length; at += 2) {
    const name = args[at];
    const value = args[at + 1] ?? '';
    if (seen.has(name)) throw new Error(usage);
    seen.add(name);
    if (name === '--port' && /^[1-9][0-9]{0,4}$/.test(value)) {
      port = Number(value);
      if (port > 65535)
        throw new Error('The local port must be at most 65535.');
    } else if (
      name === '--object-store' &&
      (value === 'filesystem' || value === 's3')
    ) {
      objectStore = value;
    } else throw new Error(usage);
  }
  return { port, objectStore };
}

/** @param {string} command @param {readonly string[]} args */
async function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  activeChild = child;
  try {
    /** @type {Promise<number | null>} */
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (status) => resolve(status));
    });
    const code = await exited;
    if (code !== 0 && !interrupted)
      throw new Error(`${command} could not complete setup.`);
  } finally {
    activeChild = null;
  }
}

function stop() {
  interrupted = true;
  activeChild?.kill('SIGINT');
}

/** @param {readonly string[]} args */
export async function main(args) {
  const { port, objectStore } = readOptions(args);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    await run('pnpm', ['-r', '--if-present', 'build']);
    if (interrupted) return;
    await run('tools/test-database/ensure-postgres.sh', []);
    if (interrupted) return;
    if (objectStore === 's3') {
      await run('tools/test-database/ensure-minio.sh', []);
      if (interrupted) return;
    }
    await run(process.execPath, [
      'tests/integration/support/dev-app.ts',
      String(port),
      objectStore,
    ]);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'The local application could not start.'}\n`,
    );
    process.exitCode = 1;
  }
}
