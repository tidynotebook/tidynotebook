/** Build notices from the installed production dependency graph. */
import {
  cp,
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, record, root } from './workspace.mjs';
import { prepareNativeSources } from './native-sources.mjs';

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value : '';
}

/** @param {string} name @param {string} from */
async function installedPackage(name, from) {
  for (let directory = from; ; directory = dirname(directory)) {
    try {
      return await realpath(join(directory, 'node_modules', name));
    } catch (error) {
      if (record(error).code !== 'ENOENT') throw error;
    }
    if (directory === dirname(directory)) return null;
  }
}

/** @param {Record<string, unknown>} manifest */
function licenseOf(manifest) {
  const declared = text(manifest.license);
  if (declared !== '') return declared;
  const licenses = manifest.licenses;
  if (Array.isArray(licenses))
    return licenses.map((item) => text(record(item).type)).join(' OR ');
  throw new Error(`No license is declared for ${text(manifest.name)}.`);
}

/** @param {Record<string, unknown>} manifest */
function sourceOf(manifest) {
  const repository = manifest.repository;
  return (
    typeof repository === 'string' ? repository : text(record(repository).url)
  )
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git(?:#.*)?$/, '');
}

/** @param {string} directory @returns {Promise<string[]>} */
async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const file = join(directory, entry.name);
        return entry.isDirectory()
          ? filesBelow(file)
          : entry.isFile()
            ? [file]
            : [];
      }),
    )
  ).flat();
}

/**
 * A complete graph can contain unused modules. It is a conservative input
 * inventory, not a claim that every dependency appears in a bundle.
 * @param {string} entry
 */
export async function dependencyNotices(entry) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {{name: string, version: string, license: string, source: string, notices: {file: string, text: string}[]}[]} */
  const packages = [];
  /** @param {string} directory */
  async function visit(directory) {
    directory = await realpath(directory);
    if (seen.has(directory)) return;
    seen.add(directory);
    const manifest = await readJson(join(directory, 'package.json'));
    const name = text(manifest.name);
    if (!name.startsWith('@notesapp/')) {
      // Record 0219: ELK is installed by Mermaid but is absent from output.
      if (name === 'elkjs') return;
      const named = (await readdir(directory, { withFileTypes: true })).filter(
        (file) =>
          /^(?:license|licence|copying|notice|copyright)(?:[.-]|$)/i.test(
            file.name,
          ),
      );
      const files = (
        await Promise.all(
          named.map(async (file) =>
            file.isDirectory()
              ? (await filesBelow(join(directory, file.name))).map((path) =>
                  path.slice(directory.length + 1),
                )
              : file.isFile()
                ? [file.name]
                : [],
          ),
        )
      )
        .flat()
        .sort();
      const notices = await Promise.all(
        files.map(async (file) => ({
          file,
          text: await readFile(join(directory, file), 'utf8'),
        })),
      );
      for (const file of ['README.md', 'Readme.md', 'readme.md']) {
        try {
          const readme = await readFile(join(directory, file), 'utf8');
          const match = /^(?:#{1,3} )?licen[cs]e[^\n]*\n(?:[=-]+\n)?/im.exec(
            readme,
          );
          if (match)
            notices.push({
              file: `${file} license section`,
              text: readme.slice(match.index),
            });
          break;
        } catch (error) {
          if (record(error).code !== 'ENOENT') throw error;
        }
      }
      const fallbacks = await readJson(
        join(root, 'tools/third-party/fallbacks.json'),
      );
      const fallback = record(fallbacks[name]);
      const versions = fallback.versions;
      const fallbackFile = text(fallback.file);
      const completeReadme = notices.some(
        (notice) =>
          /Copyright/i.test(notice.text) &&
          /Permission is hereby granted/.test(notice.text),
      );
      if (files.length === 0 && !completeReadme && fallbackFile !== '') {
        if (
          !Array.isArray(versions) ||
          !versions.includes(manifest.version) ||
          text(fallback.license) !== licenseOf(manifest) ||
          text(fallback.repository) !== sourceOf(manifest)
        )
          throw new Error(
            `The reviewed notice does not match ${name}@${text(manifest.version)}.`,
          );
        const notice = await readFile(
          join(root, 'tools/third-party', fallbackFile),
          'utf8',
        );
        if (notice.trim() === '')
          throw new Error(`The reviewed notice is empty for ${name}.`);
        notices.push({ file: 'upstream license', text: notice });
      } else if (files.length === 0 && !completeReadme)
        throw new Error(`No complete notice is available for ${name}.`);
      // Khroma omits the SPDX field but its package carries its full MIT text.
      const license =
        name === 'khroma' &&
        files.some((file) => file.toLowerCase() === 'license')
          ? 'MIT'
          : licenseOf(manifest);
      if (notices.length === 0)
        throw new Error(`No notice is available for ${name}.`);
      packages.push({
        name,
        version: text(manifest.version),
        license,
        source: sourceOf(manifest),
        notices,
      });
    }
    const required = record(manifest.dependencies);
    const optional = record(manifest.optionalDependencies);
    for (const name of Object.keys({ ...required, ...optional }).sort()) {
      const child = await installedPackage(name, directory);
      if (child === null) {
        if (Object.hasOwn(required, name))
          throw new Error(`The installed dependency ${name} is missing.`);
        continue;
      }
      await visit(child);
    }
  }
  await visit(resolve(entry));
  return packages.sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'),
  );
}

/** @param {string} entry @param {string} output @param {string} [scope] */
export async function writeNotices(entry, output, scope = 'server image') {
  await mkdir(output, { recursive: true });
  const packages = await dependencyNotices(entry);
  await writeFile(
    join(output, 'inventory.json'),
    JSON.stringify(
      {
        scope:
          'Installed production input graph. Unused dependencies can appear. ELK is excluded from distributed assets.',
        packages,
      },
      null,
      2,
    ) + '\n',
  );
  await cp(join(root, 'LICENSE'), join(output, 'LICENSE'));
  await cp(
    join(root, 'packages/ui/THIRD_PARTY_LICENSES.md'),
    join(output, 'palettes-and-fonts.txt'),
  );
  await cp(join(root, 'tools/third-party'), join(output, 'borrowed-work'), {
    recursive: true,
  });
  const notices = packages
    .map(
      (pkg) =>
        `${pkg.name}@${pkg.version}\nLicense: ${pkg.license}\nSource: ${pkg.source}\n\n${pkg.notices.map((notice) => `${notice.file}\n${notice.text}`).join('\n\n')}`,
    )
    .join('\n\n========================================\n\n');
  await writeFile(join(output, 'THIRD-PARTY-NOTICES.txt'), notices + '\n');
  await writeFile(
    join(output, 'SOURCE.txt'),
    `Scope: ${scope}.\nFirst-party source and build inputs are under AGPL-3.0-only.\nSource repository: https://github.com/tidynotebook/tidynotebook\nPublic releases identify the exact source commit in the release manifest.\n` +
      (scope === 'server image'
        ? 'The image includes /app/licenses/core-source.tar.gz.\nNative preferred source, upstream scripts and patches are in /app/licenses/native-source.\nThe custom native libraries and their exact-source license files are in /opt/notesapp-native.\nThe build inventory is /opt/notesapp-native/build.json.\nThe native shared libraries can be replaced by modified compatible libraries.\nYou may debug changes to these LGPL libraries.\nDebian source descriptors and archives, Node source and release sums are in /app/licenses/base-source.\nThe fixed runner Debian source is in /app/licenses/runner-source.\nThe original base binary inventory is in base-source/original-binaries.json.\nThe runner manifest records only the fixed security package changes.\nDebian copyright notices stay in /usr/share/doc. Node and bundled library notices stay in /usr/local/LICENSE.\nOriginal base layer npm graph notices are in /app/licenses/base-npm.\nThe active runner filesystem excludes unused npm and npx tools.\nTo rebuild the application, unpack core-source.tar.gz and run docker build --target builder .\nUse dpkg-source -x with a Debian source descriptor to unpack its source and Debian build recipes.\nThe Node source archive includes BUILDING.md and the npm source tree.\n'
        : 'This browser output includes notices and first-party source directions.\nThe server image source bundle has a separate filesystem scope.\n'),
  );
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [entry, output] = process.argv.slice(2);
  if (entry === undefined) {
    await writeNotices(
      join(root, 'apps/web'),
      join(root, 'apps/web/dist/web/licenses'),
      'web app',
    );
    try {
      await realpath(join(root, 'apps/docs/dist/site'));
    } catch (error) {
      if (record(error).code !== 'ENOENT') throw error;
      process.exit(0);
    }
    await writeNotices(
      join(root, 'apps/docs'),
      join(root, 'apps/docs/dist/site/licenses'),
      'documentation site',
    );
    const pagefind = (await dependencyNotices(join(root, 'apps/docs'))).find(
      (pkg) => pkg.name === 'pagefind',
    );
    const sourceManifest = await readJson(
      join(root, 'tools/pagefind-sources.json'),
    );
    if (pagefind?.version !== sourceManifest.packageVersion)
      throw new Error(
        'The Pagefind source does not match the documentation build.',
      );
    await prepareNativeSources(
      join(root, 'apps/docs/dist/site/licenses/pagefind-source'),
      undefined,
      join(root, 'tools/pagefind-sources.json'),
    );
    await writeFile(
      join(root, 'apps/docs/dist/site/licenses/PAGEFIND-SOURCE.txt'),
      'The search WebAssembly program uses GPL-3.0-only code in pagefind_microjson.\nIts terms are in borrowed-work/pagefind-wasm-notices.txt.\nIts preferred source and build inputs are in pagefind-source/.\nThe manifest keeps source archive and crate SHA-256 hashes.\nUnpack the Pagefind repository and the Snowball archive beside each other.\nThe Pagefind pagefind_web/Cargo.lock identifies the included crate sources.\nThe Pagefind pagefind_web/local_build.sh builds the search program.\nThe upstream release workflow names wasm-pack and Rust build inputs.\nThe tested build uses nightly-2026-04-12 (rustc 1.97.0-nightly bf4fbfb7a), rust-src, wasm32-unknown-unknown and wasm-pack 0.14.0, plus Node and a C build toolchain.\nThe upstream build uses the compiler standard library as a general system build input.\nThe generic and English source builds use the unchanged Wasm crate lock graph and pass actual documentation index searches.\nThis bundle does not promise byte-identical output from the upstream release pipeline.\n',
    );
  } else if (output !== undefined)
    await writeNotices(resolve(entry), resolve(output));
  else throw new Error('Give both the package and the notice folder.');
}
