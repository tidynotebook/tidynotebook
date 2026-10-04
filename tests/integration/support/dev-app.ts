/** The local application runtime. The wrapper builds before this file loads. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { bootstrapOwner, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase, type TestDatabase } from './database.ts';

/**
 * The name of the variable that carries more settings of a local run.
 *
 * The run passes no `NOTESAPP_` variable of the shell to the server, so a
 * setting of the shell of a developer never reaches it by chance. A setting
 * that a run needs, such as the account portal of a check in a browser, comes
 * in this one variable instead, as a JSON object, and `app.mjs start
 * --setting NAME=VALUE` writes it.
 */
export const devSettingsVariable = 'DEV_APP_SETTINGS';

/**
 * The extra settings of a local run, from the text of `DEV_APP_SETTINGS`.
 *
 * Each name is a `NOTESAPP_` setting and each value a text. A setting that
 * the run states itself, such as the database or the origin, cannot be
 * replaced, because the run owns those. Anything else stops the start.
 */
export function devSettings(
  text: string | undefined,
  owned: readonly string[],
): Record<string, string> {
  if (text === undefined || text === '') return {};
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${devSettingsVariable} must be a JSON object.`);
  const settings: Record<string, string> = {};
  for (const [name, setting] of Object.entries(value)) {
    if (!/^NOTESAPP_[A-Z0-9_]+$/.test(name) || typeof setting !== 'string')
      throw new Error(
        `${devSettingsVariable} names ${name}, which is not a NOTESAPP_ setting with a text value.`,
      );
    if (owned.includes(name))
      throw new Error(
        `${devSettingsVariable} cannot replace ${name}, which the local run sets.`,
      );
    settings[name] = setting;
  }
  return settings;
}

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

/** Creates and removes only the state that belongs to this run. */
export async function main(port: number): Promise<void> {
  let database: TestDatabase | undefined;
  let storageRoot: string | undefined;
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
    const base = devEnvironment(
      database,
      storageRoot,
      port,
      randomBytes(32).toString('base64url'),
    );
    const environment = {
      ...base,
      ...devSettings(process.env[devSettingsVariable], Object.keys(base)),
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
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (import.meta.main) {
  try {
    await main(Number(process.argv[2]));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'The local application could not start.'}\n`,
    );
    process.exitCode = 1;
  }
}
