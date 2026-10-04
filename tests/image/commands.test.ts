/**
 * The commands of the image entry point, run in the real image.
 *
 * Issue 282 and record 0202. `docker/entrypoint.sh` takes one optional
 * command. `migrate` applies the migrations with the migration role and exits.
 * `serve` starts the server with the runtime role and reads no migration
 * setting, so a serving replica holds no migration credential. With no
 * command, the container migrates and then serves, as a self-hosted
 * installation always did.
 *
 * The deploy profile of the migration refuses a disposable test database, so
 * this file cannot use the test service of `compose.test.yaml`. It starts its
 * own PostgreSQL, from the image that `docker-compose.yml` names, on an
 * internal network of its own, and removes everything at the end. It asks for
 * readiness through `docker/healthcheck.mjs`, the probe that the image ships.
 *
 * Build the image first, then run this file:
 *
 * ```sh
 * docker compose build
 * pnpm test:image
 * ```
 *
 * `NOTESAPP_IMAGE` names the image, as it does for `docker-compose.yml`.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';

/** The image under test. */
const image = process.env['NOTESAPP_IMAGE'] || 'notesapp:latest';

/** The result of one finished command. */
type Finished = {
  readonly code: number | null;
  readonly output: string;
};

/** Runs one Docker command to its end, and keeps what it wrote. */
async function docker(args: readonly string[]): Promise<Finished> {
  return await new Promise((accept, reject) => {
    const child = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: string[] = [];
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => chunks.push(chunk));
    child.stderr.on('data', (chunk: string) => chunks.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => accept({ code, output: chunks.join('') }));
  });
}

/** Runs one Docker command that must succeed, and answers its output. */
async function dockerOk(args: readonly string[]): Promise<string> {
  const result = await docker(args);
  if (result.code !== 0)
    throw new Error(
      `docker ${args.join(' ')} failed with ${String(result.code)}:\n${result.output}`,
    );
  return result.output.trim();
}

/**
 * Waits until a condition holds.
 *
 * The test waits for a state and never for a fixed time. The deadline is long
 * because a container start on a busy runner can take many seconds.
 */
async function until(
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((accept) => setTimeout(accept, 250));
  }
  throw new Error(`The container never reached this state: ${description}`);
}

/** The PostgreSQL image of the deployment, read from its Compose file. */
async function postgresImage(): Promise<string> {
  const compose = await readFile(
    resolve(import.meta.dirname, '../../docker-compose.yml'),
    'utf8',
  );
  const match = /^\s+image:\s+(postgres@sha256:[0-9a-f]{64})\s*$/m.exec(
    compose,
  );
  if (match?.[1] === undefined)
    throw new Error('docker-compose.yml names no pinned PostgreSQL image.');
  return match[1];
}

const run = randomBytes(6).toString('hex');
const network = `notesapp-image-test-${run}`;
const database = `notesapp-image-test-db-${run}`;
const containers: string[] = [database];
const secretRoot = await mkdtemp(join(tmpdir(), 'notesapp-image-test-'));

const postgresPassword = randomBytes(18).toString('hex');
const runtimePassword = randomBytes(18).toString('hex');
const authPassword = randomBytes(18).toString('hex');

/**
 * Writes one directory of secret files, readable by the user of the image.
 *
 * The files reach a container through `docker cp` and not through a bind
 * mount, because the Docker daemon does not always see the temporary
 * directory of the test, for example on a remote daemon.
 */
async function secretDirectory(
  name: string,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const directory = join(secretRoot, name);
  await mkdir(directory, { mode: 0o755 });
  for (const [file, value] of Object.entries(files))
    await writeFile(join(directory, file), value, { mode: 0o644 });
  return directory;
}

/** The three secrets of the migration, and nothing that serves. */
const migrationFiles = {
  migration_database_url: `postgres://postgres:${postgresPassword}@${database}:5432/notesapp`,
  runtime_database_password: runtimePassword,
  auth_database_password: authPassword,
};
const migrationSecrets = await secretDirectory('migration', migrationFiles);

/** The three secrets of the server, and no migration credential. */
const servingSecrets = await secretDirectory('serving', {
  runtime_database_url: `postgres://notesapp_app:${runtimePassword}@${database}:5432/notesapp`,
  auth_database_url: `postgres://notesapp_auth:${authPassword}@${database}:5432/notesapp`,
  auth_secret: randomBytes(32).toString('hex'),
});

/** The settings that the server reads, as `docker-compose.yml` gives them. */
const serverEnvironment = [
  ['NOTESAPP_ORIGIN', 'http://localhost:3000'],
  ['NOTESAPP_DATABASE_URL_FILE', '/run/secrets/runtime_database_url'],
  ['NOTESAPP_AUTH_DATABASE_URL_FILE', '/run/secrets/auth_database_url'],
  ['NOTESAPP_AUTH_SECRET_FILE', '/run/secrets/auth_secret'],
  ['NOTESAPP_LOG_LEVEL', 'warn'],
  ['NOTESAPP_MAX_BODY_BYTES', '1048576'],
  ['NOTESAPP_MAX_HEADER_BYTES', '16384'],
  ['NOTESAPP_REQUEST_TIMEOUT_MS', '60000'],
  ['NOTESAPP_SHUTDOWN_GRACE_MS', '0'],
].flatMap(([name, value]) => ['--env', `${name ?? ''}=${value ?? ''}`]);

/**
 * Creates one container of the image, copies its secrets to
 * `/run/secrets`, where Compose puts them, and starts it in the background.
 */
async function startContainer(
  name: string,
  options: {
    readonly environment: readonly string[];
    readonly secrets: readonly string[];
    readonly command: readonly string[];
  },
): Promise<void> {
  containers.push(name);
  await dockerOk([
    'create',
    '--name',
    name,
    '--network',
    network,
    ...options.environment,
    image,
    ...options.command,
  ]);
  for (const directory of options.secrets)
    await dockerOk(['cp', `${directory}/.`, `${name}:/run/secrets`]);
  await dockerOk(['start', name]);
}

/**
 * Waits for a container to end, and answers its exit code and its log.
 *
 * A container that keeps running, such as one that serves after a command
 * that should exit, fails at the deadline of `until` instead of holding the
 * suite open.
 */
async function finish(name: string): Promise<Finished> {
  await until(`${name} exits`, async () => !(await running(name)));
  const code = Number(
    await dockerOk(['inspect', '--format', '{{.State.ExitCode}}', name]),
  );
  return { code, output: await dockerOk(['logs', name]) };
}

/** Whether the shipped health check of a container reports ready. */
async function ready(name: string): Promise<boolean> {
  const result = await docker(['exec', name, 'node', '/app/healthcheck.mjs']);
  return result.code === 0;
}

/** Whether a container still runs. */
async function running(name: string): Promise<boolean> {
  const state = await dockerOk([
    'inspect',
    '--format',
    '{{.State.Running}}',
    name,
  ]);
  return state === 'true';
}

/** Removes every container, the network and the secrets of this run. */
async function removeEverything(): Promise<void> {
  await docker(['rm', '--force', '--volumes', ...containers]);
  await docker(['network', 'rm', network]);
  await rm(secretRoot, { recursive: true, force: true });
}

try {
  await dockerOk(['image', 'inspect', '--format', '{{.Id}}', image]);
  await dockerOk(['network', 'create', '--internal', network]);
  await dockerOk([
    'run',
    '--detach',
    '--name',
    database,
    '--network',
    network,
    '--env',
    `POSTGRES_PASSWORD=${postgresPassword}`,
    '--env',
    'POSTGRES_DB=notesapp',
    await postgresImage(),
  ]);
  await until('the database accepts connections', async () => {
    const probe = await docker([
      'exec',
      database,
      'pg_isready',
      '-U',
      'postgres',
      '-d',
      'notesapp',
      '-h',
      '127.0.0.1',
      '-q',
    ]);
    return probe.code === 0;
  });
} catch (failure: unknown) {
  await removeEverything();
  throw failure;
}

/** The serving replica, which starts before its migration as on the cloud. */
const replica = `notesapp-image-test-serve-${run}`;

await test('serve before the migrations listens and does not report ready', async () => {
  // The cloud starts its replicas and its migration apart, so a replica can
  // start first. The readiness probe checks the schema version, so the
  // replica listens but does not report ready, and nothing sends it traffic.
  await startContainer(replica, {
    environment: serverEnvironment,
    secrets: [servingSecrets],
    command: ['/app/entrypoint.sh', 'serve'],
  });
  await until('the early replica listens', async () => {
    if (!(await running(replica)))
      throw new Error(await dockerOk(['logs', replica]));
    return /notesapp: listening on/.test(await dockerOk(['logs', replica]));
  });
  assert.equal(await ready(replica), false, 'the replica is not ready');
});

await test('migrate applies the migrations with the migration role and exits', async () => {
  // The migration gets its own secrets and none of the server settings.
  const name = `notesapp-image-test-migrate-${run}`;
  await startContainer(name, {
    environment: [],
    secrets: [migrationSecrets],
    command: ['/app/entrypoint.sh', 'migrate'],
  });
  const result = await finish(name);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /migrations applied to notesapp/);
  assert.doesNotMatch(result.output, /listening on/, 'it started no server');
});

await test('serve reports ready after the migration with no migration credential', async () => {
  // The same replica becomes ready once the schema is there. It never
  // restarted, and it never held a migration secret or a migration setting.
  await until('the serving replica is ready', async () => {
    if (!(await running(replica)))
      throw new Error(await dockerOk(['logs', replica]));
    return await ready(replica);
  });
  const restarts = await dockerOk([
    'inspect',
    '--format',
    '{{.RestartCount}}',
    replica,
  ]);
  assert.equal(restarts, '0');
  for (const file of Object.keys(migrationFiles)) {
    const present = await docker([
      'exec',
      replica,
      'test',
      '-e',
      `/run/secrets/${file}`,
    ]);
    assert.notEqual(present.code, 0, `${file} is not in the replica`);
  }
  assert.doesNotMatch(await dockerOk(['exec', replica, 'env']), /MIGRATION/);
  assert.doesNotMatch(await dockerOk(['logs', replica]), /migrations applied/);
});

await test('no command migrates and then serves, as before', async () => {
  // A self-hosted container gives no command and holds every secret.
  const name = `notesapp-image-test-default-${run}`;
  await startContainer(name, {
    environment: serverEnvironment,
    secrets: [migrationSecrets, servingSecrets],
    command: [],
  });
  await until('the self-hosted container is ready', async () => {
    if (!(await running(name))) throw new Error(await dockerOk(['logs', name]));
    return await ready(name);
  });
  assert.match(await dockerOk(['logs', name]), /migrations applied/);
});

await test('an unknown command starts nothing and names the commands', async () => {
  const name = `notesapp-image-test-unknown-${run}`;
  await startContainer(name, {
    environment: serverEnvironment,
    secrets: [migrationSecrets, servingSecrets],
    command: ['/app/entrypoint.sh', 'start'],
  });
  const result = await finish(name);
  assert.equal(result.code, 2, result.output);
  assert.match(result.output, /Give migrate, serve, or no command/);
  assert.doesNotMatch(result.output, /migrations applied|listening on/);
});

await removeEverything();
