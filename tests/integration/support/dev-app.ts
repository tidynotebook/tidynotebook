/** The local application runtime. The wrapper builds before this file loads. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { bootstrapOwner, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase, type TestDatabase } from './database.ts';
import { createTestBucket, type TestBucket } from './object-store.ts';

/** Keep the public origin and listening socket on the same local port. */
export function devEnvironment(
  database: Pick<TestDatabase, 'runtimeUrl' | 'authUrl'>,
  storageRoot: string,
  port: number,
  authSecret: string,
): Record<string, string> {
  return {
    NOTESAPP_ORIGIN: `http://127.0.0.1:${port}`,
    NOTESAPP_HOST: '127.0.0.1',
    NOTESAPP_PORT: String(port),
    NOTESAPP_DATABASE_URL: database.runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: authSecret,
    NOTESAPP_LOG_LEVEL: 'info',
    NOTESAPP_MAX_BODY_BYTES: '8388608',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_SHUTDOWN_GRACE_MS: '0',
  };
}

/** Starts the built server and waits for its listening report. */
async function serve(
  environment: Record<string, string>,
  onSpawn: (child: ReturnType<typeof spawn>) => void,
  onLine: (line: string) => void,
): Promise<{
  child: ReturnType<typeof spawn>;
  exited: Promise<number | null>;
}> {
  const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => !name.startsWith('NOTESAPP_'),
        ),
      ),
      ...environment,
    },
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  onSpawn(child);
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise<void>((resolve, reject) => {
    lines.on('line', (line) => {
      onLine(line);
      if (line.startsWith('notesapp: listening on ')) resolve();
    });
    void exited.then(
      () => reject(new Error('The local server stopped before it was ready.')),
      reject,
    );
  });
  await ready;
  return { child, exited };
}

/** One running local application and the call that removes it. */
export type LocalApplication = {
  readonly origin: string;
  readonly email: string;
  readonly password: string;
  /** Stops the server, then drops its database and its file store. */
  readonly stop: () => Promise<void>;
};

/**
 * Starts the built application on a new database and file store.
 *
 * The performance tools of `tools/performance/` drive this application in a
 * browser, so each run measures a server that holds only what it seeded.
 * `onLine` takes each line of the server log.
 */
export async function startLocalApplication(
  port: number,
  onLine: (line: string) => void,
): Promise<LocalApplication> {
  const database = await createDisposableDatabase();
  const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-dev-'));
  const remove = async (): Promise<void> => {
    await database.destroy();
    await rm(storageRoot, { recursive: true, force: true });
  };
  try {
    const environment = devEnvironment(
      database,
      storageRoot,
      port,
      randomBytes(32).toString('base64url'),
    );
    const email = 'owner@notes.invalid';
    const password = randomBytes(18).toString('base64url');
    await bootstrapOwner({
      config: loadServerConfig(environment),
      email,
      name: 'Owner',
      password,
    });
    const server = await serve(environment, () => {}, onLine);
    return {
      origin: environment['NOTESAPP_ORIGIN'] ?? '',
      email,
      password,
      stop: async () => {
        if (
          server.child.exitCode === null &&
          server.child.signalCode === null
        ) {
          server.child.kill('SIGINT');
          await server.exited;
        }
        await remove();
      },
    };
  } catch (failure: unknown) {
    await remove();
    throw failure;
  }
}

/**
 * Creates and removes only the state that belongs to this run.
 *
 * With `s3` the run keeps its objects in a bucket of its own on the test
 * MinIO service, which it removes at the end (record 0192).
 */
export async function main(
  port: number,
  objectStore: 'filesystem' | 's3',
): Promise<void> {
  let database: TestDatabase | undefined;
  let storageRoot: string | undefined;
  let bucket: TestBucket | undefined;
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  let child: ReturnType<typeof spawn> | undefined;
  let interrupted = false;
  const stop = (): void => {
    interrupted = true;
    child?.kill('SIGINT');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    database = await createDisposableDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-dev-'));
    if (objectStore === 's3') bucket = await createTestBucket();
    const environment = {
      ...devEnvironment(
        database,
        storageRoot,
        port,
        randomBytes(32).toString('base64url'),
      ),
      ...bucket?.environment,
    };
    const email = 'owner@notes.invalid';
    const password = randomBytes(18).toString('base64url');
    await bootstrapOwner({
      config: loadServerConfig(environment),
      email,
      name: 'Owner',
      password,
    });
    if (interrupted) return;
    server = await serve(
      environment,
      (started) => {
        child = started;
      },
      (line) => {
        process.stdout.write(`${line}\n`);
      },
    );
    process.stdout.write(
      `Open ${environment['NOTESAPP_ORIGIN']}\nEmail: ${email}\nPassword: ${password}\nPress Ctrl+C to stop and remove this run.\n`,
    );
    const code = await server.exited;
    if (!interrupted || code !== 0) process.exitCode = 1;
  } finally {
    if (child?.exitCode === null && child.signalCode === null) {
      child.kill('SIGINT');
      if (server !== undefined) await server.exited;
      else
        await new Promise<void>((resolve) =>
          child?.once('exit', () => resolve()),
        );
    }
    if (database !== undefined) await database.destroy();
    if (storageRoot !== undefined)
      await rm(storageRoot, { recursive: true, force: true });
    if (bucket !== undefined) await bucket.destroy();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (import.meta.main) {
  try {
    await main(
      Number(process.argv[2]),
      process.argv[3] === 's3' ? 's3' : 'filesystem',
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'The local application could not start.'}\n`,
    );
    process.exitCode = 1;
  }
}
