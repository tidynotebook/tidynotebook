import { spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { filesIn, root } from './workspace.mjs';

/** Put measured slow integration files on separate shards. Node sorts its
 * own shard inputs, so this schedule must be selected before Node starts.
 * @param {string[]} files
 * @param {string | undefined} shard */
export function selectedTests(files, shard) {
  const slow = ['sync.test.ts', 'oauth-startup.test.ts', 'revisions.test.ts'];
  /** @param {string} file */
  const rank = (file) => {
    const index = slow.indexOf(basename(file));
    return index < 0 ? slow.length : index;
  };
  const ordered = [...files].sort(
    (left, right) =>
      rank(left) - rank(right) || (left < right ? -1 : left > right ? 1 : 0),
  );
  if (shard === undefined) return ordered;
  const [index = 0, count = 0] = shard.split('/').map(Number);
  if (
    !/^[1-9]\d*\/[1-9]\d*$/.test(shard) ||
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(count) ||
    index > count
  )
    throw new Error('Give a shard as index/count with index within count.');
  return ordered.filter((_, offset) => offset % count === index - 1);
}

if (import.meta.main) {
  const [kind, ...args] = process.argv.slice(2);
  if (
    kind !== 'integration' ||
    args.length > 1 ||
    (args[0] !== undefined && !args[0].startsWith('--shard='))
  )
    throw new Error(
      'Usage: node tools/run-tests.mjs integration [--shard=index/count]',
    );
  const candidates = (await filesIn(resolve(root, 'tests/integration'))).filter(
    (file) => /\.test\.(?:ts|mjs)$/.test(file),
  );
  const files = selectedTests(candidates, args[0]?.slice('--shard='.length));
  if (files.length > 0) {
    const result = spawnSync(
      process.execPath,
      [
        '--config-file=' + resolve(root, 'node-test.config.json'),
        ...(process.env.NOTESAPP_COVERAGE === 'off'
          ? ['--no-experimental-test-coverage']
          : []),
        ...files,
      ],
      { cwd: root, stdio: 'inherit' },
    );
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.exitCode = result.status ?? 1;
  } else
    process.stdout.write('No integration tests are selected for this shard.\n');
}
