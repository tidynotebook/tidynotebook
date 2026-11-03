/** Compile Sharp against the fixed libraries and remove prebuilt fallbacks. */
import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readJson, record } from '../tools/workspace.mjs';

const require = createRequire('/prod/server/package.json');
const sharpRequire = createRequire(require.resolve('sharp'));
const sharp = dirname(dirname(require.resolve('sharp')));
const manifest = await readJson(join(sharp, 'package.json'));
const buildRoot = '/native-sharp';
await cp(sharp, buildRoot, { recursive: true });
execFileSync(process.execPath, ['install/build.js'], {
  cwd: buildRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_PATH: '/app/node_modules',
    PATH: '/app/node_modules/.bin:' + process.env.PATH,
    PKG_CONFIG_PATH: '/target/lib/pkgconfig',
    LD_LIBRARY_PATH: '/target/lib',
    SHARP_FORCE_GLOBAL_LIBVIPS: '1',
    npm_config_nodedir: '/usr/local',
  },
});
const output = join(buildRoot, 'src/build/Release');
const release = join(sharp, 'src/build/Release');
const addons = (await readdir(output)).filter((file) =>
  /^sharp-linux-(?:x64|arm64)-[0-9.]+\.node$/.test(file),
);
if (addons.length !== 1 || !addons[0])
  throw new Error('Expected one source-built Sharp add-on.');
const addon = await readFile(join(output, addons[0]));
await rm(join(sharp, 'src/build'), { recursive: true, force: true });
await mkdir(release, { recursive: true });
await writeFile(join(release, addons[0]), addon);
const removed = [];
for (const name of Object.keys(record(manifest.optionalDependencies))) {
  if (!name.startsWith('@img/sharp-')) continue;
  let file;
  try {
    file = sharpRequire.resolve(`${name}/package`);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    )
      continue;
    throw error;
  }
  removed.push(dirname(await realpath(file)));
}
for (const item of await readdir('/prod/server/node_modules', {
  recursive: true,
  withFileTypes: true,
})) {
  if (!item.isSymbolicLink()) continue;
  const path = join(item.parentPath, item.name);
  const target = await realpath(path);
  if (removed.includes(target)) await rm(path);
}
for (const directory of removed) await rm(directory, { recursive: true });
const probe = `const s=require('sharp'); if(s.versions.vips!=='8.18.7')process.exit(1);`;
execFileSync(process.execPath, ['-e', probe], {
  cwd: '/prod/server',
  stdio: 'inherit',
  env: { ...process.env, LD_LIBRARY_PATH: '/opt/notesapp-native/lib' },
});
