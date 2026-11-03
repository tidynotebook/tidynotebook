import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { dependencyNotices } from './distribution-notices.mjs';
import { sourceMatches, sourceRows } from './native-sources.mjs';
import { root, readJson, record } from './workspace.mjs';

await test('an installed graph retains notices and refuses a missing required package', async () => {
  await mkdir(join(root, '.tooling'), { recursive: true });
  const directory = await mkdtemp(join(root, '.tooling/notices-test-'));
  try {
    await mkdir(join(directory, 'node_modules/fixture'), { recursive: true });
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        name: '@notesapp/fixture',
        dependencies: { fixture: '1.0.0' },
        optionalDependencies: { absent: '1.0.0' },
      }),
    );
    await writeFile(
      join(directory, 'node_modules/fixture/package.json'),
      JSON.stringify({
        name: 'fixture',
        version: '1.0.0',
        license: 'MIT',
        repository: 'https://example.com/fixture',
      }),
    );
    await writeFile(
      join(directory, 'node_modules/fixture/LICENSE'),
      'Copyright fixture author\nFull license text\n',
    );
    const graph = await dependencyNotices(directory);
    assert.equal(graph.length, 1);
    assert.equal(graph[0]?.name, 'fixture');
    assert.equal(
      graph[0]?.notices[0]?.text,
      'Copyright fixture author\nFull license text\n',
    );
    await rm(join(directory, 'node_modules/fixture/LICENSE'));
    await assert.rejects(dependencyNotices(directory), /No complete notice/);
    await writeFile(
      join(directory, 'node_modules/fixture/package.json'),
      JSON.stringify({
        name: '@npmcli/agent',
        version: '4.0.2',
        license: 'ISC',
        repository: 'https://github.com/npm/agent',
      }),
    );
    const fallbackGraph = await dependencyNotices(directory);
    assert.match(
      fallbackGraph[0]?.notices[0]?.text ?? '',
      /Declared license: ISC/,
    );
    assert.match(
      fallbackGraph[0]?.notices[0]?.text ?? '',
      /no copyright or license notice/,
    );
    await writeFile(
      join(directory, 'node_modules/fixture/package.json'),
      JSON.stringify({
        name: '@npmcli/agent',
        version: '4.0.2',
        license: 'MIT',
        repository: 'https://github.com/npm/agent',
      }),
    );
    await assert.rejects(
      dependencyNotices(directory),
      /reviewed notice does not match/,
    );
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        name: '@notesapp/fixture',
        dependencies: { missingRequiredFixture: '1.0.0' },
      }),
    );
    await assert.rejects(
      dependencyNotices(directory),
      /missingRequiredFixture is missing/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test('source hashes refuse changed bytes and source rows refuse paths', () => {
  const bytes = Buffer.from('abc');
  assert.ok(
    sourceMatches(
      bytes,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    ),
  );
  assert.equal(
    sourceMatches(
      Buffer.from('abcd'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    ),
    false,
  );
  assert.throws(
    () =>
      sourceRows([
        {
          file: '../escape',
          url: 'https://example.com',
          sha256: 'a'.repeat(64),
        },
      ]),
    /invalid/,
  );
  assert.throws(
    () =>
      sourceRows([
        {
          file: 'source.tar.gz',
          url: 'http://example.com',
          sha256: 'a'.repeat(64),
        },
      ]),
    /invalid/,
  );
});

await test('source rows refuse reserved and duplicate names', () => {
  for (const file of ['.', '..', 'manifest.json'])
    assert.throws(
      () =>
        sourceRows([
          { file, url: 'https://example.com', sha256: 'a'.repeat(64) },
        ]),
      /invalid/,
    );
  const row = {
    file: 'source.tar.gz',
    url: 'https://example.com',
    sha256: 'a'.repeat(64),
  };
  assert.throws(() => sourceRows([row, row]), /invalid/);
});

await test('custom native source keeps the Sharp API version and complete sources', async () => {
  const manifest = await readJson(join(root, 'tools/native-sources.json'));
  const require = createRequire(join(root, 'apps/server/package.json'));
  assert.equal(manifest.package, 'tidynotebook-native');
  assert.equal(manifest.packageVersion, '1');
  assert.equal(manifest.platform, 'linux-x64-glibc');
  /** @type {unknown} */
  const consumer = require('sharp');
  if (typeof consumer !== 'function' || !('versions' in consumer))
    throw new Error('The active sharp consumer has no version facts.');
  assert.equal(record(consumer.versions).vips, record(manifest.versions).vips);
  assert.ok(
    sourceRows(manifest.sources).length >
      Object.keys(manifest.versions ?? {}).length,
  );
  assert.match(
    await readFile(
      join(root, 'tools/third-party/sharp-libvips-notices.txt'),
      'utf8',
    ),
    /Mozilla Public License 1.1/,
  );
});

await test('the installed Mermaid registry retains standard layouts and falls back for ELK', async () => {
  const require = createRequire(join(root, 'apps/web/package.json'));
  const module = record(
    require('mermaid/dist/chunks/mermaid.core/chunk-GNY47TPC.mjs'),
  );
  const select = module.getRegisteredLayoutAlgorithm;
  if (typeof select !== 'function')
    throw new Error('The layout registry is missing.');
  for (const name of ['elk', 'elk.layered', 'elk.force', 'elk.mrtree'])
    assert.equal(select(name), 'dagre');
  for (const name of ['dagre', 'swimlane', 'cose-bilkent'])
    assert.equal(select(name), name);
  assert.equal(select('elk', { fallback: 'swimlane' }), 'swimlane');
});

await test('base source inputs match the pinned image and Node build input', async () => {
  const manifest = await readJson(join(root, 'tools/base-sources.json'));
  const dockerfile = await readFile(join(root, 'Dockerfile'), 'utf8');
  if (
    typeof manifest.image !== 'string' ||
    typeof manifest.nodeVersion !== 'string'
  )
    throw new Error('The base source identity is missing.');
  assert.equal(
    (await readFile(join(root, '.node-version'), 'utf8')).trim(),
    manifest.nodeVersion,
  );
  assert.equal(
    dockerfile.split('FROM ' + manifest.image + ' AS ').length - 1,
    2,
  );
  const rows = sourceRows(manifest.sources);
  assert.ok(
    rows.some(
      (row) => row.file === 'node-v' + manifest.nodeVersion + '.tar.xz',
    ),
  );
  const signatures = await readJson(
    join(root, 'tools/third-party/debian-source-signatures.json'),
  );
  assert.ok(typeof signatures.keyringSha256 === 'string');
  assert.ok(
    sourceMatches(
      await readFile(join(root, 'tools/third-party/debian-source-keys.gpg')),
      signatures.keyringSha256,
    ),
  );
});

await test('the runner security source records only the two fixed Debian inputs', async () => {
  const base = await readJson(join(root, 'tools/base-sources.json'));
  const original = await readJson(join(root, 'tools/base-packages.json'));
  const fixed = await readJson(join(root, 'tools/runner-sources.json'));
  assert.equal(original.image, base.image);
  assert.equal(fixed.image, base.image);
  if (!Array.isArray(fixed.binaries) || !Array.isArray(original.packages))
    throw new Error('The binary inventory is missing.');
  const binaries = fixed.binaries.map(record);
  const names = binaries.map((row) => {
    if (typeof row.name !== 'string')
      throw new Error('The fixed binary name is missing.');
    return row.name;
  });
  assert.deepEqual(
    names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ['libpcre2-8-0:amd64', 'perl-base'],
  );
  const dockerfile = await readFile(join(root, 'Dockerfile'), 'utf8');
  for (const row of binaries) {
    if (typeof row.name !== 'string' || typeof row.version !== 'string')
      throw new Error('The fixed binary identity is missing.');
    assert.ok(
      original.packages.some((value) => record(value).name === row.name),
    );
    assert.ok(dockerfile.includes(row.name.split(':')[0] + '=' + row.version));
  }
  assert.ok(sourceRows(fixed.sources).length > 0);
  const signatures = await readJson(
    join(root, 'tools/third-party/runner-source-signatures.json'),
  );
  if (typeof signatures.keyringSha256 !== 'string')
    throw new Error('The source keyring identity is missing.');
  assert.ok(
    sourceMatches(
      await readFile(join(root, 'tools/third-party/runner-source-keys.gpg')),
      signatures.keyringSha256,
    ),
  );
});
