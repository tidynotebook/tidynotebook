/** Keep only the shared-library closure and record its actual link graph. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { basename, join } from 'node:path';
import { nativeInputs } from './native-inputs.mjs';

const prefix = '/opt/notesapp-native';
const manifest = await nativeInputs();
await mkdir(join(prefix, 'lib'), { recursive: true });
await mkdir(join(prefix, 'bin'), { recursive: true });
const paths = new Set(['/target/lib/libvips-cpp.so.8.18.7']);
for (const file of paths) {
  const output = execFileSync('ldd', [file], {
    encoding: 'utf8',
    env: { ...process.env, LD_LIBRARY_PATH: '/target/lib' },
  });
  if (output.includes('not found')) throw new Error(output);
  for (const match of output.matchAll(/=> (\/target\/lib\/\S+)/g)) {
    if (match[1]) paths.add(match[1]);
  }
}
const libraries = [];
for (const file of [...paths].sort()) {
  const name = basename(file);
  await copyFile(file, join(prefix, 'lib', name));
  libraries.push({
    file: name,
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
    needed: [
      ...execFileSync('readelf', ['-d', file], { encoding: 'utf8' }).matchAll(
        /\(NEEDED\).*\[([^\]]+)\]/g,
      ),
    ].map((match) => match[1]),
  });
}
execFileSync('cc', [
  '-O2',
  '-Wall',
  '-Wextra',
  '-Werror',
  '/app/docker/native-versions.c',
  '-ldl',
  '-Wl,-rpath,$ORIGIN/../lib',
  '-o',
  join(prefix, 'bin/native-versions'),
]);
const actual = JSON.parse(
  execFileSync(join(prefix, 'bin/native-versions'), { encoding: 'utf8' }),
);
for (const name of ['heif', 'png', 'expat', 'vips']) {
  if (
    actual[name].version !== manifest.versions[name] ||
    !actual[name].path.startsWith(prefix + '/')
  )
    throw new Error(`Loaded native library differs: ${name}`);
}
await writeFile(
  join(prefix, 'build.json'),
  JSON.stringify(
    {
      package: manifest.package,
      packageVersion: manifest.packageVersion,
      platform: `linux-${process.arch}-glibc`,
      versions: manifest.versions,
      toolchain: {
        node: process.versions.node,
        compiler: execFileSync('cc', ['--version'], { encoding: 'utf8' }).split(
          '\n',
        )[0],
        rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
        meson: execFileSync('meson', ['--version'], {
          encoding: 'utf8',
        }).trim(),
        ninja: execFileSync('ninja', ['--version'], {
          encoding: 'utf8',
        }).trim(),
        cargoC: execFileSync('cargo', ['cbuild', '--version'], {
          encoding: 'utf8',
        }).trim(),
      },
      libraries,
      actual,
    },
    null,
    2,
  ) + '\n',
);
// Keep the license files of the exact source trees, including Rust crates.
const notices = [await readFile('/upstream/THIRD-PARTY-NOTICES.md', 'utf8')];
for (const folder of ['/deps', '/vendor']) {
  for (const item of await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (
      !item.isFile() ||
      !/^(?:COPYING|COPYRIGHT|LICEN[CS]E|NOTICE)(?:$|[.-])/i.test(item.name)
    )
      continue;
    const file = join(item.parentPath, item.name);
    // The source trees contain nested build copies. Keep the original files.
    if (file.includes('/_build/') || file.includes('/target/')) continue;
    notices.push(
      `${file.slice(folder.length + 1)}\n\n${await readFile(file, 'utf8')}`,
    );
  }
}
await writeFile(
  join(prefix, 'THIRD-PARTY-NOTICES.txt'),
  notices.join('\n\n========================================\n\n') + '\n',
);
