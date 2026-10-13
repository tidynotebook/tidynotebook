import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { root } from './workspace.mjs';

const script = join(root, 'tools/ops/create-secrets.sh');

/** The nine files of the script, in the order that it writes them. */
const names = [
  'postgres_password',
  'migration_database_url',
  'runtime_database_password',
  'auth_database_password',
  'runtime_database_url',
  'auth_database_url',
  'auth_secret',
  'backup_key',
  'installation_id',
];

/** The pattern that `tools/ops/backup.sh` holds an installation ID to. */
const installationId =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

/**
 * Run the script on `<directory>/secrets` of a disposable directory. `id`
 * answers the given user and `chown` records its arguments, so the test needs
 * no privilege. `inspect` reads the result before the directory goes.
 * @param {{
 *   uid?: string;
 *   args?: (secrets: string) => string[];
 *   prepare?: (secrets: string) => void;
 *   inspect: (run: {
 *     status: number | null;
 *     stderr: string;
 *     secrets: string;
 *     owners: string;
 *   }) => void;
 * }} options
 */
function createSecrets({ uid = '0', args, prepare, inspect }) {
  mkdirSync(join(root, '.tooling'), { recursive: true });
  const directory = mkdtempSync(join(root, '.tooling/create-secrets-'));
  try {
    const bin = join(directory, 'bin');
    const log = join(directory, 'chown.log');
    mkdirSync(bin);
    writeFileSync(log, '');
    writeFileSync(join(bin, 'id'), `#!/bin/sh\necho ${uid}\n`, {
      mode: 0o700,
    });
    writeFileSync(join(bin, 'chown'), `#!/bin/sh\necho "$@" >> '${log}'\n`, {
      mode: 0o700,
    });
    const secrets = join(directory, 'secrets');
    prepare?.(secrets);
    const result = spawnSync(
      'bash',
      [script, ...(args?.(secrets) ?? [secrets])],
      {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
        encoding: 'utf8',
      },
    );
    inspect({
      status: result.status,
      stderr: result.stderr,
      secrets,
      owners: readFileSync(log, 'utf8'),
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

await test('the script writes every secret with mode 0600 and the owner of the image', () => {
  createSecrets({
    inspect: ({ status, stderr, secrets, owners }) => {
      assert.equal(status, 0, stderr);
      assert.equal(statSync(secrets).mode & 0o777, 0o700);
      /** @type {Record<string, string>} */
      const values = {};
      for (const name of names) {
        assert.equal(statSync(join(secrets, name)).mode & 0o777, 0o600, name);
        assert.match(
          owners,
          new RegExp(`^10001:10001 ${secrets}/${name}$`, 'm'),
        );
        values[name] = readFileSync(join(secrets, name), 'utf8').trim();
      }
      assert.equal(
        values.migration_database_url,
        `postgres://postgres:${values.postgres_password}@postgres:5432/notesapp`,
      );
      assert.equal(
        values.runtime_database_url,
        `postgres://notesapp_app:${values.runtime_database_password}@postgres:5432/notesapp`,
      );
      assert.equal(
        values.auth_database_url,
        `postgres://notesapp_auth:${values.auth_database_password}@postgres:5432/notesapp`,
      );
      assert.notEqual(
        values.runtime_database_password,
        values.auth_database_password,
      );
      for (const name of [
        'postgres_password',
        'runtime_database_password',
        'auth_database_password',
      ])
        assert.match(values[name] ?? '', /^[0-9a-f]{48}$/, name);
      assert.match(values.auth_secret ?? '', /^[0-9a-f]{64}$/);
      assert.ok((values.backup_key ?? '').length >= 32);
      assert.match(values.installation_id ?? '', installationId);
    },
  });
});

await test('the script refuses to run without root and writes nothing', () => {
  createSecrets({
    uid: '1000',
    inspect: ({ status, stderr, secrets, owners }) => {
      assert.notEqual(status, 0);
      assert.match(stderr, /run this command with sudo/);
      assert.throws(() => statSync(secrets));
      assert.equal(owners, '');
    },
  });
});

await test('the script never replaces a secret that exists', () => {
  createSecrets({
    prepare: (secrets) => {
      mkdirSync(secrets);
      writeFileSync(join(secrets, 'auth_secret'), 'kept\n');
    },
    inspect: ({ status, stderr, secrets, owners }) => {
      assert.notEqual(status, 0);
      assert.match(stderr, /auth_secret exists/);
      assert.equal(
        readFileSync(join(secrets, 'auth_secret'), 'utf8'),
        'kept\n',
      );
      assert.throws(() => statSync(join(secrets, 'postgres_password')));
      assert.equal(owners, '');
    },
  });
});

await test('the script refuses an option or a missing directory name', () => {
  for (const args of [[], ['--force'], ['a', 'b']])
    createSecrets({
      args: () => args,
      inspect: ({ status, stderr, owners }) => {
        assert.notEqual(status, 0, args.join(' '));
        assert.match(stderr, /name one directory/);
        assert.equal(owners, '');
      },
    });
});
