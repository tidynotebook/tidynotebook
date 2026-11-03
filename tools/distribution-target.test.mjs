import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { dependencyNotices } from './distribution-notices.mjs';
import {
  distributionArchitecture,
  distributionManifest,
  validateNativeConsumer,
} from './distribution-target.mjs';
import { readJson, record, root } from './workspace.mjs';

await test('reviewed targets preserve amd64 bytes and change only arm64 identities', async () => {
  for (const file of [
    'native-sources.json',
    'base-packages.json',
    'runner-sources.json',
    'base-sources.json',
  ]) {
    const path = join(root, 'tools', file);
    const baseline = await readJson(path);
    const amd64 = await distributionManifest(path, 'x64');
    assert.equal(
      JSON.stringify(amd64, null, 2) + '\n',
      JSON.stringify(baseline, null, 2) + '\n',
    );
    const arm64 = await distributionManifest(path, 'arm64');
    /** @type {unknown} */
    const expected = JSON.parse(
      JSON.stringify(baseline)
        .replaceAll(':amd64', ':arm64')
        .replaceAll('linux-x64', 'linux-arm64'),
    );
    assert.deepEqual(arm64, expected);
  }
  const pagefind = join(root, 'tools/pagefind-sources.json');
  assert.deepEqual(
    await distributionManifest(pagefind, 's390x'),
    await readJson(pagefind),
  );
  for (const architecture of ['amd64', 's390x', 'arm', 'unknown', ''])
    assert.throws(() => distributionArchitecture(architecture), /Unsupported/);
});

await test('both source-built targets refuse stale versions and target identities', async () => {
  const directory = await mkdtemp(join(root, '.tooling/native-consumer-'));
  try {
    await mkdir(join(directory, 'node_modules/sharp'), { recursive: true });
    await writeFile(
      join(directory, 'node_modules/sharp/package.json'),
      JSON.stringify({ name: 'sharp', main: 'index.cjs' }),
    );
    await writeFile(
      join(directory, 'node_modules/sharp/index.cjs'),
      "module.exports = {versions:{vips:'8.18.7'}};",
    );
    const buildFile = join(directory, 'build.json');
    for (const arch of ['x64', 'arm64']) {
      const manifest = await distributionManifest(
        join(root, 'tools/native-sources.json'),
        arch,
      );
      await writeFile(buildFile, JSON.stringify(manifest));
      await validateNativeConsumer(directory, arch, buildFile);
      for (const changed of [
        { package: 'unreviewed' },
        { packageVersion: '0' },
        { platform: 'linux-unknown-glibc' },
        { versions: { ...record(manifest.versions), heif: '1.23.5' } },
        { versions: { ...record(manifest.versions), png: '1.6.58' } },
        { versions: { ...record(manifest.versions), expat: '2.8.5' } },
      ]) {
        await writeFile(buildFile, JSON.stringify({ ...manifest, ...changed }));
        await assert.rejects(
          validateNativeConsumer(directory, arch, buildFile),
          /does not match/,
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test('native source manifests refuse an unreviewed package or platform', async () => {
  const directory = await mkdtemp(join(root, '.tooling/native-target-'));
  try {
    const path = join(directory, 'native-sources.json');
    const baseline = await readJson(join(root, 'tools/native-sources.json'));
    for (const changed of [
      { package: '@img/unreviewed' },
      { platform: 'linux-arm64-glibc' },
    ]) {
      await writeFile(path, JSON.stringify({ ...baseline, ...changed }));
      for (const architecture of ['x64', 'arm64'])
        await assert.rejects(
          distributionManifest(path, architecture),
          /reviewed native source target differs/,
        );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test('arm64 notice fallbacks require the reviewed version, source and terms', async () => {
  const directory = await mkdtemp(join(root, '.tooling/arm64-notices-'));
  try {
    const fallbacks = await readJson(
      join(root, 'tools/third-party/fallbacks.json'),
    );
    for (const name of [
      '@img/sharp-libvips-linux-arm64',
      '@pagefind/linux-arm64',
    ]) {
      const fallback = record(fallbacks[name]);
      const versions = fallback.versions;
      assert.ok(Array.isArray(versions));
      const pkg = {
        name,
        version: String(versions[0]),
        repository: fallback.repository,
        license: fallback.license,
      };
      const baseline = { ...pkg };
      for (const change of [
        {},
        { version: '0.0.0' },
        { license: 'MIT-0' },
        { repository: 'https://example.com' },
      ]) {
        await writeFile(
          join(directory, 'package.json'),
          JSON.stringify({ ...baseline, ...change }),
        );
        if (Object.keys(change).length === 0) {
          const notices = await dependencyNotices(directory);
          assert.equal(
            notices[0]?.notices[0]?.text,
            await readFile(
              join(root, 'tools/third-party', String(fallback.file)),
              'utf8',
            ),
          );
        } else
          await assert.rejects(dependencyNotices(directory), /does not match/);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
