import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { record, root } from './workspace.mjs';

/** @param {unknown} value
 * @returns {value is {load: (source: string) => unknown}} */
function yamlModule(value) {
  return typeof record(value).load === 'function';
}

/** Read the actual workflow with the installed YAML parser. */
async function workflowJobs() {
  const web = createRequire(join(root, 'apps/web/package.json'));
  const mermaid = createRequire(web.resolve('mermaid'));
  const parser = createRequire(mermaid.resolve('chevrotain'));
  /** @type {unknown} */
  const yaml = parser('js-yaml');
  assert.ok(yamlModule(yaml));
  const source = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8');
  return record(record(yaml.load(source)).jobs);
}

/** GitHub's supported job environment contexts. A runner does not exist yet.
 * https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
 * @param {Record<string, unknown>} jobs */
function checkJobContexts(jobs) {
  const allowed = new Set([
    'github',
    'needs',
    'strategy',
    'matrix',
    'vars',
    'secrets',
    'inputs',
  ]);
  for (const [name, value] of Object.entries(jobs)) {
    const environment = record(value).env;
    if (environment === undefined) continue;
    for (const setting of Object.values(record(environment))) {
      if (typeof setting !== 'string') continue;
      for (const expression of setting.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
        // GitHub escapes a quote inside a string by writing it twice.
        const source = expression[1]?.replace(/'(?:[^']|'')*'/g, '') ?? '';
        for (const context of source.matchAll(
          /(?<![\w.])([A-Za-z_]\w*)\s*(?:\.|\[)/g,
        )) {
          assert.ok(
            allowed.has(context[1] ?? ''),
            `${name} job environment cannot read ${context[1]}`,
          );
        }
      }
    }
  }
}

await test('job context checks permit quoted text and refuse a runner value', () => {
  checkJobContexts({
    image: {
      env: {
        NAME: "${{ format('foo.bar and it''s runner.temp', github.event.repository.name) }}",
      },
    },
  });
  assert.throws(
    () => checkJobContexts({ image: { env: { PATH: '${{ runner.temp }}' } } }),
    /job environment cannot read runner/,
  );
});

/** A Compose check must not take installation settings from the caller. */
function cleanEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(NOTESAPP_|POSTGRES_|COMPOSE_)/.test(name),
    ),
  );
}

/** Check the configuration only. Never start a container or remove data.
 * @param {string} directory */
function composeConfig(directory) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--env-file',
      join(directory, '.env'),
      '-f',
      join(root, 'docker-compose.yml'),
      'config',
      '--format',
      'json',
    ],
    { cwd: directory, env: cleanEnvironment(), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return record(JSON.parse(result.stdout));
}

/** The actual Compose output must keep all data inside the test directory.
 * @param {Record<string, unknown>} config @param {string} directory
 * @param {string} origin */
function checkIsolation(config, directory, origin) {
  const services = record(config.services);
  const app = record(services.app);
  const postgres = record(services.postgres);
  const environment = record(app.environment);
  assert.equal(environment.NOTESAPP_ORIGIN, origin);
  assert.ok(Array.isArray(app.ports));
  assert.equal(record(app.ports[0]).host_ip, '127.0.0.1');
  assert.ok(Array.isArray(app.volumes));
  const storage = app.volumes
    .map(record)
    .find((volume) => volume.target === '/var/lib/notesapp');
  assert.ok(storage && typeof storage.source === 'string');
  assert.ok(storage.source.startsWith(`${directory}/`));
  assert.ok(Array.isArray(postgres.volumes));
  const database = record(postgres.volumes[0]);
  assert.ok(typeof database.source === 'string');
  assert.ok(database.source.startsWith(`${directory}/`));
  const secrets = record(config.secrets);
  assert.equal(Object.keys(secrets).length, 7);
  for (const value of Object.values(secrets)) {
    const secret = record(value);
    assert.ok(typeof secret.file === 'string');
    assert.ok(secret.file.startsWith(`${directory}/`));
  }
}

/** A fake command for the quick start script, written into `bin`.
 * @param {string} bin @param {string} name @param {string} body */
async function fakeCommand(bin, name, body) {
  await writeFile(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
}

/** Run the quick start script from a copy in a disposable checkout.
 * `sudo` runs its command as it is, `id` answers root, and `chown` records
 * its arguments, so the test needs no privilege.
 * @param {string} directory */
async function runQuickstart(directory) {
  await mkdir(join(directory, 'tools/ops'), { recursive: true });
  for (const name of ['quickstart.sh', 'create-secrets.sh'])
    await writeFile(
      join(directory, 'tools/ops', name),
      await readFile(join(root, 'tools/ops', name)),
      { mode: 0o700 },
    );
  const bin = join(directory, 'bin');
  await mkdir(bin, { recursive: true });
  await fakeCommand(bin, 'sudo', 'exec "$@"');
  await fakeCommand(bin, 'id', 'echo 0');
  await fakeCommand(
    bin,
    'chown',
    `echo "$@" >> '${join(directory, 'chown.log')}'`,
  );
  return spawnSync('bash', [join(directory, 'tools/ops/quickstart.sh')], {
    cwd: directory,
    env: { ...cleanEnvironment(), PATH: `${bin}:${process.env.PATH ?? ''}` },
    encoding: 'utf8',
  });
}

await test('the guide prepares the quick start with the tested script', async () => {
  const guide = await readFile(join(root, 'docs/guide/quickstart.md'), 'utf8');
  assert.match(guide, /^tools\/ops\/quickstart\.sh$/m);
});

await test('the quick start script produces a valid isolated Compose configuration', async () => {
  await mkdir(join(root, '.tooling'), { recursive: true });
  const directory = await mkdtemp(join(root, '.tooling/quickstart-test-'));
  try {
    const result = await runQuickstart(directory);
    assert.equal(result.status, 0, result.stderr);
    // The container changes the owner of PGDATA only. Its database user
    // must pass through this bind root before it can reach that private leaf.
    const data = join(directory, '.tooling/quickstart');
    assert.equal(
      (await stat(join(data, 'postgres'))).mode & 0o777,
      0o711,
      'the PostgreSQL user must be able to pass through the bind root',
    );
    for (const path of [data, join(data, 'secrets'), join(data, 'storage')])
      assert.equal((await stat(path)).mode & 0o777, 0o700);
    assert.equal((await stat(join(directory, '.env'))).mode & 0o777, 0o600);
    const owners = await readFile(join(directory, 'chown.log'), 'utf8');
    assert.match(owners, new RegExp(`^10001:10001 ${data}/storage$`, 'm'));
    checkIsolation(
      composeConfig(directory),
      directory,
      'http://127.0.0.1:3000',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test('the quick start script never changes an existing installation', async () => {
  await mkdir(join(root, '.tooling'), { recursive: true });
  const directory = await mkdtemp(join(root, '.tooling/quickstart-test-'));
  try {
    await writeFile(join(directory, '.env'), 'NOTESAPP_ORIGIN=kept\n');
    const withEnvironment = await runQuickstart(directory);
    assert.notEqual(withEnvironment.status, 0);
    assert.match(withEnvironment.stderr, /\.env exists/);
    assert.equal(
      await readFile(join(directory, '.env'), 'utf8'),
      'NOTESAPP_ORIGIN=kept\n',
    );
    await rm(join(directory, '.env'));
    await mkdir(join(directory, '.tooling/quickstart'), { recursive: true });
    const withData = await runQuickstart(directory);
    assert.notEqual(withData.status, 0);
    assert.match(withData.stderr, /quickstart exists/);
    await assert.rejects(stat(join(directory, '.env')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test('the image CI job supplies every required Compose setting', async () => {
  await mkdir(join(root, '.tooling'), { recursive: true });
  const directory = await mkdtemp(join(root, '.tooling/compose-ci-test-'));
  try {
    const jobs = await workflowJobs();
    checkJobContexts(jobs);
    const image = record(jobs.image);
    const settings = Object.entries(record(image.env)).map(([name, value]) => {
      assert.ok(typeof value === 'string');
      return `${name}=${value}`;
    });
    assert.ok(Array.isArray(image.steps));
    const steps = image.steps.map(record);
    const setupIndex = steps.findIndex(
      (step) => step.name === 'Set isolated deployment paths',
    );
    const setup = steps[setupIndex];
    assert.ok(
      setup && typeof setup.run === 'string',
      'the image job has no runner path setup',
    );
    const firstUse = steps.findIndex(
      (step) =>
        typeof step.run === 'string' &&
        /\$NOTESAPP_(SECRETS|DATABASE|STORAGE)_DIR/.test(step.run),
    );
    assert.ok(
      firstUse > setupIndex,
      'the image job uses paths before runner setup',
    );
    const environmentFile = join(directory, 'github-env');
    await writeFile(environmentFile, '');
    execFileSync('bash', ['-eu', '-c', setup.run], {
      cwd: directory,
      env: {
        ...cleanEnvironment(),
        RUNNER_TEMP: directory,
        GITHUB_ENV: environmentFile,
      },
      stdio: 'pipe',
    });
    settings.push((await readFile(environmentFile, 'utf8')).trim());
    await writeFile(join(directory, '.env'), `${settings.join('\n')}\n`);
    checkIsolation(
      composeConfig(directory),
      directory,
      'https://notes.example.com',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
