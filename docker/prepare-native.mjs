/** Apply the reviewed changes to the pinned upstream Linux build recipe. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeInputs } from './native-inputs.mjs';

const manifest = await nativeInputs();
await mkdir('/upstream', { recursive: true });
execFileSync('tar', [
  '-xf',
  '/sources/33-v1.3.4.tar.gz',
  '-C',
  '/upstream',
  '--strip-components=1',
]);
let recipe = await readFile('/upstream/build/posix.sh', 'utf8');
/** Refuse an upstream recipe that differs from the reviewed input.
 * @param {string} before @param {string} after */
function replace(before, after) {
  if (recipe.split(before).length !== 2)
    throw new Error(`Native recipe match differs: ${before}`);
  recipe = recipe.replace(before, after);
}
replace('set -e', 'set -eo pipefail');
// Keep the upstream build flags and codec choices. Three fixed libraries stay
// shared, so the runtime proof can query their actual version functions.
replace(
  'CURL="curl --silent --location --retry 3 --retry-max-time 30"',
  'CURL="node /app/docker/native-source.mjs"',
);
for (const component of ['heif', 'png', 'expat']) {
  const start = recipe.indexOf('mkdir ${DEPS}/' + component + '\n');
  const end = recipe.indexOf('\nmkdir ', start + 1);
  const before = recipe.slice(start, end);
  const after =
    component === 'heif'
      ? before.replace('-DBUILD_SHARED_LIBS=FALSE', '-DBUILD_SHARED_LIBS=TRUE')
      : before.replace(
          '--enable-static --disable-shared',
          '--disable-static --enable-shared',
        );
  if (before === after)
    throw new Error(`Native linkage flag missing: ${component}`);
  replace(before, after);
}
// Use the reviewed mirror names of the same pinned source archives.
replace(
  'https://cairographics.org/releases/pixman-',
  'https://xorg.freedesktop.org/archive/individual/lib/pixman-',
);
replace(
  'https://cairographics.org/releases/cairo-',
  'https://cairo.freedesktop.org/releases/cairo-',
);
replace('cargo update --workspace', 'cargo update --workspace --offline');
// The static archives and pkg-config files are needed to compile Sharp.
// The final image receives only the dependency closure, not the build tools.
recipe = recipe.slice(0, recipe.indexOf('# Cleanup\n'));
const versions = Object.entries(manifest.versions)
  .map(
    ([name, version]) =>
      `export VERSION_${name.replaceAll('-', '_').toUpperCase()}='${version}'`,
  )
  .join('\n');
await writeFile('/upstream/versions.properties', versions + '\n');
await writeFile('/upstream/build-fixed.sh', recipe);

// Cargo uses only these source archives. It cannot resolve a newer package or
// download a registry index during the native build.
const vendor = '/vendor';
await mkdir(vendor, { recursive: true });
for (const row of manifest.sources.filter((source) =>
  source.file.endsWith('.crate'),
)) {
  execFileSync('tar', ['-xf', join('/sources', row.file), '-C', vendor]);
  const folder = join(vendor, row.file.slice(0, -6));
  /** @type {Record<string, string>} */
  const files = {};
  for (const item of await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!item.isFile() || item.name === '.cargo-checksum.json') continue;
    const file = join(item.parentPath, item.name);
    files[file.slice(folder.length + 1)] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  }
  await writeFile(
    join(folder, '.cargo-checksum.json'),
    JSON.stringify({ files, package: row.sha256 }),
  );
}
await mkdir('/usr/local/cargo', { recursive: true });
await writeFile(
  '/usr/local/cargo/config.toml',
  '[source.crates-io]\nreplace-with = "reviewed"\n[source.reviewed]\ndirectory = "/vendor"\n[net]\noffline = true\n',
);
