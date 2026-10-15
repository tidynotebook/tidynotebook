import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve, relative, sep } from 'node:path';
import { filesIn, root, workspaces } from './workspace.mjs';

/** Parse the optional shard before selecting named tests. @param {string[]} args */
export function testArguments(args) {
  const shards = args.filter((arg) => arg.startsWith('--shard='));
  const shard = shards[0]?.slice('--shard='.length);
  if (
    shards.length > 1 ||
    (shard !== undefined && !/^[1-9]\d*\/[1-9]\d*$/.test(shard))
  )
    throw new Error('Give one shard as --shard=index/count.');
  if (shard !== undefined) {
    const [index = 0, count = 0] = shard.split('/').map(Number);
    if (
      !Number.isSafeInteger(index) ||
      !Number.isSafeInteger(count) ||
      index > count
    )
      throw new Error('The shard index must be within its count.');
  }
  return {
    names: args.filter((arg) => arg !== '--' && !arg.startsWith('--shard=')),
    flags: shard === undefined ? [] : [`--test-shard=${shard}`],
  };
}

async function main() {
  const [kind, ...args] = process.argv.slice(2);
  if (kind !== 'unit' && kind !== 'integration') {
    process.stderr.write(
      'Usage: node tools/run-tests.mjs <unit|integration> [test-name ...]\n',
    );
    process.exit(1);
  }
  const { names, flags } = testArguments(args);
  let candidates;
  if (kind === 'integration') {
    candidates = await filesIn(resolve(root, 'tests/integration'));
  } else {
    const cwd = resolve(process.cwd());
    const packages = await workspaces();
    const selected =
      cwd === resolve(root)
        ? packages
        : packages.filter((item) => item.path === cwd);
    if (cwd !== resolve(root) && selected.length === 0) {
      process.stderr.write(
        'Run unit tests from the root or a workspace package.\n',
      );
      process.exit(1);
    }
    candidates = (
      await Promise.all(
        selected.map((item) => filesIn(resolve(item.path, 'src'))),
      )
    ).flat();
    if (cwd === resolve(root))
      candidates.push(
        ...(await filesIn(resolve(root, 'tools'))).filter(
          (file) => dirname(file) === resolve(root, 'tools'),
        ),
      );
  }
  candidates = candidates.filter((file) => /\.test\.(?:ts|mjs)$/.test(file));
  /** @param {string} file @param {string} name */
  const matches = (file, name) =>
    basename(file).replace(/\.test\.(?:ts|mjs)$/, '') === name ||
    relative(root, file).split(sep).join('/') === name;
  for (const name of names) {
    if (!candidates.some((file) => matches(file, name))) {
      process.stderr.write(`No ${kind} test matches: ${name}\n`);
      process.exit(1);
    }
  }
  const selected = candidates.filter(
    (file) => names.length === 0 || names.some((name) => matches(file, name)),
  );
  // The test runner measures coverage and prints the report after the results.
  // The report shows the product source only, so it excludes the tests
  // themselves, the generated clients, and the build output. Set
  // NOTESAPP_COVERAGE to `off` to hide the report while you work. Coverage is a
  // measurement here, not a gate, so no threshold flag belongs in this list.
  const coverageArgs =
    process.env.NOTESAPP_COVERAGE === 'off'
      ? []
      : [
          '--experimental-test-coverage',
          '--test-coverage-exclude=**/*.test.ts',
          '--test-coverage-exclude=**/*.test.mjs',
          '--test-coverage-exclude=**/generated/**',
          '--test-coverage-exclude=**/dist/**',
          '--test-coverage-exclude=tests/**',
        ];
  if (selected.length === 0) {
    process.stdout.write(`No ${kind} tests exist yet.\n`);
  } else {
    const result = spawnSync(
      process.execPath,
      ['--test', ...flags, ...coverageArgs, ...selected.sort()],
      {
        cwd: root,
        stdio: 'inherit',
      },
    );
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.exitCode = result.status ?? 1;
  }
}
if (import.meta.main) await main();
