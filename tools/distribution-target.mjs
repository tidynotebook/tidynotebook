/** Select the reviewed Linux glibc distribution records. */
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { readJson, record, root } from './workspace.mjs';

/** @param {string} [architecture] */
export function distributionArchitecture(architecture = process.arch) {
  if (!['x64', 'arm64'].includes(architecture) || process.platform !== 'linux')
    throw new Error(
      `Unsupported distribution target: ${process.platform}/${architecture}.`,
    );
  return architecture;
}

/** @param {string} file @param {string} [architecture] */
export async function distributionManifest(file, architecture) {
  const manifest = await readJson(file);
  if (
    ![
      'native-sources.json',
      'base-packages.json',
      'base-sources.json',
      'runner-sources.json',
    ].includes(basename(file))
  )
    return manifest;
  const arch = distributionArchitecture(architecture);
  if (basename(file) === 'native-sources.json') {
    if (
      manifest.package !== 'tidynotebook-native' ||
      manifest.platform !== 'linux-x64-glibc'
    )
      throw new Error('The reviewed native source target differs.');
    if (arch === 'arm64') {
      manifest.platform = 'linux-arm64-glibc';
    }
  }
  if (arch === 'arm64') {
    for (const key of ['packages', 'binaries']) {
      const rows = manifest[key];
      if (Array.isArray(rows))
        manifest[key] = rows.map((value) => {
          const row = record(value);
          if (typeof row.name === 'string')
            row.name = row.name.replace(/:amd64$/, ':arm64');
          return row;
        });
    }
  }
  return manifest;
}

/** Refuse stale source records before downloading archives.
 * @param {string} entry @param {string} [architecture] @param {string} [buildFile] */
export async function validateNativeConsumer(
  entry,
  architecture,
  buildFile = '/opt/notesapp-native/build.json',
) {
  const manifest = await distributionManifest(
    join(root, 'tools/native-sources.json'),
    architecture,
  );
  const build = await readJson(buildFile);
  const require = createRequire(join(entry, 'package.json'));
  const versions = record(require('sharp').versions);
  if (
    build.package !== manifest.package ||
    build.packageVersion !== manifest.packageVersion ||
    build.platform !== manifest.platform ||
    !isDeepStrictEqual(build.versions, manifest.versions) ||
    versions.vips !== record(manifest.versions).vips
  )
    throw new Error('The native source does not match the installed library.');
}

if (import.meta.main) {
  const [file, output, entry] = process.argv.slice(2);
  if (!file || !output || !entry)
    throw new Error('Give the manifest, output and consumer folders.');
  await validateNativeConsumer(entry);
  await writeFile(
    output,
    JSON.stringify(await distributionManifest(file), null, 2) + '\n',
  );
}
