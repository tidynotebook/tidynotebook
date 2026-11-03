/** Runs inside the built runner with no network access. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  );
  return Object.fromEntries(Object.entries(value));
}
/** @param {unknown} value */
function rows(value) {
  assert.ok(Array.isArray(value));
  return value.map(record);
}
/** @param {unknown} value */
function text(value) {
  assert.equal(typeof value, 'string');
  return String(value);
}
/** @param {string} file */
async function json(file) {
  return record(JSON.parse(await readFile(file, 'utf8')));
}
assert.equal(process.platform, 'linux');
assert.ok(['x64', 'arm64'].includes(process.arch));
const arch = process.arch;
const require = createRequire('/app/server/package.json');
/** @type {unknown} */
const sharp = require('sharp');
assert.ok(typeof sharp === 'function' && 'versions' in sharp);
const native = await json('/app/licenses/native-source/manifest.json');
const prefix = '/opt/notesapp-native';
const build = await json(`${prefix}/build.json`);
assert.equal(native.package, 'tidynotebook-native');
assert.equal(native.packageVersion, '1');
assert.equal(native.platform, `linux-${arch}-glibc`);
for (const key of ['package', 'packageVersion', 'platform', 'versions'])
  assert.deepEqual(build[key], native[key]);
const fixed = {
  heif: '1.23.7',
  png: '1.6.59',
  expat: '2.10.0',
  vips: '8.18.7',
};
const actual = record(
  JSON.parse(
    execFileSync(`${prefix}/bin/native-versions`, { encoding: 'utf8' }),
  ),
);
const loaded = process.report.getReport();
assert.ok(loaded && typeof loaded === 'object');
assert.ok('sharedObjects' in loaded && Array.isArray(loaded.sharedObjects));
const sharedObjects = await Promise.all(
  loaded.sharedObjects
    .filter((file) => file.startsWith('/'))
    .map((file) => realpath(file)),
);
for (const [name, version] of Object.entries(fixed)) {
  const row = record(actual[name]);
  assert.equal(row.version, version);
  assert.equal(record(native.versions)[name], version);
  const file = await realpath(text(row.path));
  assert.ok(file.startsWith(`${prefix}/lib/`), file);
  assert.ok(sharedObjects.includes(file), `Sharp does not load ${file}`);
}
assert.equal(record(sharp.versions).vips, fixed.vips);
const addonFiles = Object.keys(require.cache).filter(
  (file) => file.endsWith('.node') && file.includes('/sharp/'),
);
assert.equal(addonFiles.length, 1);
const addon = addonFiles[0];
assert.ok(addon?.includes('/sharp/src/build/Release/sharp-'));
assert.equal(require(addon).libvipsVersion().isGlobal, true);
const links = execFileSync('ldd', [addon], { encoding: 'utf8' });
assert.ok(!links.includes('not found'), links);
for (const row of rows(build.libraries)) {
  const file = `${prefix}/lib/${text(row.file)}`;
  assert.equal(
    createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
    row.sha256,
  );
  assert.ok(links.includes(`${prefix}/lib/${text(row.file)}`), links);
  for (const dependency of row.needed)
    assert.ok(links.includes(dependency), links);
}
// No prebuilt Sharp add-on or old embedded libvips is retained as a fallback.
for (const item of await readdir('/app/server/node_modules', {
  recursive: true,
  withFileTypes: true,
})) {
  if (!item.isFile()) continue;
  const file = join(item.parentPath, item.name);
  if (/sharp.*\.node$/.test(item.name)) assert.equal(file, addon);
  assert.ok(!item.name.startsWith('libvips'), file);
}
const nativeNotices = await readFile(
  `${prefix}/THIRD-PARTY-NOTICES.txt`,
  'utf8',
);
for (const name of ['heif', 'png', 'expat', 'vips'])
  assert.ok(nativeNotices.includes(name));
for (const folder of ['native-source', 'base-source', 'runner-source']) {
  const manifest = await json(`/app/licenses/${folder}/manifest.json`);
  assert.ok(rows(manifest.sources).length > 0);
  for (const row of rows(manifest.sources)) {
    assert.match(text(row.file), /^[\w.+~-]+$/);
    const bytes = await readFile(`/app/licenses/${folder}/${text(row.file)}`);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      row.sha256,
      row.file,
    );
  }
}
const original = await json('/app/licenses/base-source/original-binaries.json');
const runner = await json('/app/licenses/runner-source/manifest.json');
const base = await json('/app/licenses/base-source/manifest.json');
assert.equal(original.image, base.image);
assert.equal(runner.image, base.image);
assert.equal(process.versions.node, base.nodeVersion);
const expected = new Map(
  rows(original.packages).map((row) => [text(row.name), row]),
);
for (const row of rows(runner.binaries)) {
  assert.ok(expected.has(text(row.name)));
  expected.set(text(row.name), row);
}
const installed = execFileSync(
  'dpkg-query',
  [
    '-W',
    '-f=${binary:Package}\t${Version}\t${source:Package}\t${source:Version}\n',
  ],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n');
assert.equal(installed.length, expected.size);
for (const line of installed) {
  const [binary, version, sourcePackage, sourceVersion] = line.split('\t');
  assert.deepEqual(expected.get(binary), {
    name: binary,
    version,
    sourcePackage,
    sourceVersion,
  });
  assert.ok(
    rows(base.packages).some(
      (row) => row.name === sourcePackage && row.version === sourceVersion,
    ) ||
      rows(runner.packages).some(
        (row) => row.name === sourcePackage && row.version === sourceVersion,
      ),
  );
}
for (const folder of [
  '/app/licenses',
  '/app/licenses/base-npm',
  '/app/web/dist/web/licenses',
]) {
  const inventory = await json(`${folder}/inventory.json`);
  const combined = await readFile(`${folder}/THIRD-PARTY-NOTICES.txt`, 'utf8');
  assert.ok(rows(inventory.packages).length > 0);
  for (const row of rows(inventory.packages)) {
    assert.ok(rows(row.notices).length > 0, row.name);
    for (const notice of rows(row.notices)) {
      assert.ok(text(notice.text).trim().length > 0, row.name);
      assert.ok(combined.includes(text(notice.text)), row.name);
    }
  }
}
process.stdout.write(`Distribution sources and notices pass: linux/${arch}\n`);

// Exercise the shipped child, not the contributor's prebuilt Sharp package.
const inspection = record(
  await import('/app/server/dist/jobs/inspect-image.js'),
);
const inspectImage = inspection.inspectImage;
assert.ok(typeof inspectImage === 'function');
const scratch = await mkdtemp(join(tmpdir(), 'native-image-proof-'));
const sample = () =>
  sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r: 40, g: 60, b: 80 },
    },
  });
async function inspect(bytes, mediaType = 'image/png') {
  const file = join(scratch, 'image');
  await writeFile(file, bytes);
  return inspectImage(file, mediaType);
}
try {
  for (const format of ['png', 'jpeg', 'gif', 'webp']) {
    assert.deepEqual(
      await inspect(
        await sample().toFormat(format).toBuffer(),
        `image/${format}`,
      ),
      { ok: true, mediaType: `image/${format}`, width: 2, height: 2 },
    );
  }
  for (const bytes of [
    await sample().avif().toBuffer(),
    await sample().tiff().toBuffer(),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>',
    ),
  ]) {
    assert.equal((await inspect(bytes)).error, 'unsupported_media_type');
  }
  const pixels = Buffer.alloc(2 * 4 * 3, 40);
  pixels.fill(80, 2 * 2 * 3);
  for (const format of ['gif', 'webp']) {
    const frames = Buffer.from(
      await sharp(pixels, {
        raw: { width: 2, height: 4, channels: 3, pageHeight: 2 },
      })
        .toFormat(format)
        .toBuffer(),
    );
    assert.equal((await sharp(frames, { animated: true }).metadata()).pages, 2);
    assert.deepEqual(await inspect(frames, `image/${format}`), {
      ok: true,
      mediaType: `image/${format}`,
      width: 2,
      height: 4,
    });
  }
  const large = Buffer.from(
    await sharp({
      create: {
        width: 10_000,
        height: 4_000,
        channels: 3,
        background: 'white',
      },
    })
      .png()
      .toBuffer(),
  );
  assert.deepEqual(await inspect(large), {
    ok: true,
    mediaType: 'image/png',
    width: 10_000,
    height: 4_000,
  });
  assert.equal(
    (await inspect(await sample().jpeg().toBuffer())).error,
    'inconsistent_media_type',
  );
  assert.equal(
    (await inspect(Buffer.from('89504e470d0a1a0a0000000d494844', 'hex'))).error,
    'invalid_image',
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
process.stdout.write(
  `Native image worker formats and limits pass: linux/${arch}\n`,
);
