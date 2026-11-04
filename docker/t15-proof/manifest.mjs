import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const prefix = '/opt/notesapp-native/';
const paths = new Set([
  prefix + 'bin/native-boundary-proof',
  '/app/entrypoint.sh',
  '/app/entrypoint.sh.original',
  prefix + 'proof-manifest.json',
  prefix + 'build.json',
]);
for (const name of readdirSync(prefix + 'lib'))
  paths.add(prefix + 'lib/' + name);
for (const name of readdirSync(prefix + 'proof-fixtures'))
  paths.add(prefix + 'proof-fixtures/' + name);
for (const input of [
  prefix + 'bin/native-boundary-proof',
  prefix + 'lib/libvips-cpp.so.8.18.7',
]) {
  const dependencies = execFileSync('/usr/bin/ldd', [input], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LD_LIBRARY_PATH: prefix + 'lib' },
  });
  if (dependencies.includes('not found')) throw new Error('Missing library');
  for (const path of dependencies.matchAll(/(?:=> |^\s*)(\/[^\s]+)/gm)) {
    if (path[1] === undefined) throw new Error('Missing library path');
    paths.add(path[1]);
  }
}
/** @type {Record<string, string>} */
const sourceInputs = {};
for (const name of [
  'Dockerfile',
  'preflight.c',
  'policy.h',
  'suite.h',
  'sha256.h',
  'wrapper.c',
  'report.h',
  'manifest.mjs',
  'fixtures.mjs',
  'base-receipt.json',
  'fixture-manifest.json',
]) {
  sourceInputs[name] = createHash('sha256')
    .update(readFileSync('/proof-src/' + name))
    .digest('hex');
}
/** @type {unknown} */
const baseReceipt = JSON.parse(
  readFileSync('/proof-src/base-receipt.json', 'utf8'),
);
/** @type {unknown} */
const nativeReceipt = JSON.parse(readFileSync(prefix + 'build.json', 'utf8'));
const policyPath = prefix + 'proof-policy.json';
writeFileSync(
  policyPath,
  JSON.stringify(
    {
      scope: 'local diagnostic only',
      architecture: process.arch,
      sourceInputs,
      base: baseReceipt,
      native: nativeReceipt,
      compiler: readFileSync('/compiler-out/compiler.txt', 'utf8'),
      probeFlags:
        '-std=c11 -O2 -Wall -Wextra -Werror -Wl,-z,relro,-z,now -Wl,--disable-new-dtags,-rpath,/opt/notesapp-native/lib -ldl',
      wrapperFlags: '-std=c11 -O2 -static -Wall -Wextra -Werror',
      uid: 10001,
      gid: 10001,
      platformGo: false,
      publicationGo: false,
    },
    null,
    2,
  ) + '\n',
  { mode: 0o444 },
);
paths.add(policyPath);
const lines = [...paths]
  .sort()
  .map(
    (path) =>
      createHash('sha256').update(readFileSync(path)).digest('hex') +
      '  ' +
      path,
  );
writeFileSync(prefix + 'proof-hashes', lines.join('\n') + '\n', {
  mode: 0o444,
});
