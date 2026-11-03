/** Validate the source records before the build uses them. */
import { sourceRows } from '../tools/native-sources.mjs';
import { readJson, record } from '../tools/workspace.mjs';

export async function nativeInputs() {
  const manifest = await readJson('/sources/manifest.json');
  /** @type {Record<string, string>} */
  const versions = {};
  for (const [name, version] of Object.entries(record(manifest.versions))) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(name) ||
      typeof version !== 'string' ||
      !/^[0-9][a-zA-Z0-9.+-]*$/.test(version)
    )
      throw new Error('Invalid native build version.');
    versions[name] = version;
  }
  if (
    manifest.package !== 'tidynotebook-native' ||
    manifest.packageVersion !== '1'
  )
    throw new Error('Invalid native build identity.');
  return {
    package: manifest.package,
    packageVersion: manifest.packageVersion,
    versions,
    sources: sourceRows(manifest.sources),
  };
}
