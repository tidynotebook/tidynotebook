import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { root } from './workspace.mjs';

for (const tool of ['bash', 'jq']) {
  const result = spawnSync(tool, ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw new Error(
      `The published image guide test needs ${tool}. Install ${tool} and add it to PATH.`,
    );
}

const script = join(root, 'tools/ops/select-image.sh');
const commit = 'a'.repeat(40);
const manifest = {
  repository: 'tidynotebook/tidynotebook',
  tag: 'v0.3.5',
  version: '0.3.5',
  source: { commit },
  image: {
    reference: 'ghcr.io/tidynotebook/core',
    digest: 'sha256:' + 'b'.repeat(64),
  },
};

/** @param {string} tag @param {unknown} asset @param {string} [checkout]
 * @param {string} [top] The root folder that the fake Git answers. */
function selectImage(tag, asset, checkout = commit, top) {
  mkdirSync(join(root, '.tooling'), { recursive: true });
  const cwd = mkdtempSync(join(root, '.tooling/published-image-guide-'));
  try {
    mkdirSync(join(cwd, 'bin'));
    writeFileSync(
      join(cwd, 'asset.json'),
      typeof asset === 'string' ? asset : JSON.stringify(asset),
    );
    writeFileSync(
      join(cwd, 'bin/git'),
      `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]!=='rev-parse')process.exit(2);console.log(a[1]==='--show-toplevel'?${JSON.stringify(top ?? '')}||process.cwd():a[1]==='HEAD'?'${checkout}':'${commit}');\n`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(cwd, 'bin/gh'),
      `#!${process.execPath}\nimport {appendFileSync,copyFileSync} from 'node:fs';\nconst a=process.argv.slice(2);appendFileSync('cli.log',JSON.stringify(a)+'\\n');if(a[0]!=='release'||a[1]!=='download')process.exit(2);copyFileSync('asset.json',a[a.indexOf('--dir')+1]+'/release-manifest.json');\n`,
      { mode: 0o700 },
    );
    writeFileSync(
      join(cwd, 'bin/docker'),
      '#!/bin/sh\nprintf docker >> cli.log\n',
      { mode: 0o700 },
    );
    const result = spawnSync('bash', [script, tag], {
      cwd,
      env: { ...process.env, PATH: join(cwd, 'bin') + ':' + process.env.PATH },
      encoding: 'utf8',
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls: existsSync(join(cwd, 'cli.log'))
        ? readFileSync(join(cwd, 'cli.log'), 'utf8')
        : '',
      directory: existsSync(join(cwd, '.tooling/published-release')),
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

await test('the guide selects the image with the tested script', () => {
  const guide = readFileSync(
    join(root, 'docs/guide/published-images.md'),
    'utf8',
  );
  assert.match(guide, /^tools\/ops\/select-image\.sh v\S+$/m);
});

await test('the script selects the official digest from the fixed checkout and manifest', () => {
  const result = selectImage('v0.3.5', manifest);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(
      '^NOTESAPP_IMAGE=ghcr.io/tidynotebook/core@sha256:' +
        'b'.repeat(64) +
        '\\n$',
    ),
  );
});

await test('the script refuses invalid tags before directory or CLI use', () => {
  for (const tag of [
    '',
    '../../escape',
    '--repo=other',
    'v01.3.5',
    '0.3.5',
    'v0.3.5-beta',
    'v0.3.5/path',
  ]) {
    const result = selectImage(tag, manifest);
    assert.notEqual(result.status, 0, tag);
    assert.equal(result.stdout, '', tag);
    assert.equal(result.calls, '', tag);
    assert.equal(result.directory, false, tag);
  }
});

await test('the script refuses to run outside the root folder of the checkout', () => {
  const result = selectImage('v0.3.5', manifest, commit, '/elsewhere');
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.calls, '');
  assert.equal(result.directory, false);
});

await test('the script refuses a different checkout or malformed official asset', () => {
  assert.notEqual(selectImage('v0.3.5', manifest, 'c'.repeat(40)).status, 0);
  for (const asset of [
    'invalid json',
    JSON.stringify(manifest) + '\n' + JSON.stringify(manifest),
    { ...manifest, tag: 'v0.3.6' },
    { ...manifest, version: '0.3.6' },
    { ...manifest, repository: 'other/repository' },
    { ...manifest, source: { commit: 'c'.repeat(40) } },
    {
      ...manifest,
      image: {
        ...manifest.image,
        reference: 'ghcr.io/tidynotebook/tidynotebook',
      },
    },
    {
      ...manifest,
      image: { ...manifest.image, reference: 'ghcr.io/other/core' },
    },
    { ...manifest, image: { ...manifest.image, digest: 'sha256:bad' } },
    {
      ...manifest,
      image: { ...manifest.image, digest: manifest.image.digest + '\n' },
    },
    { ...manifest, image: { reference: manifest.image.reference } },
  ]) {
    const result = selectImage('v0.3.5', asset);
    assert.notEqual(result.status, 0, JSON.stringify(asset));
    assert.equal(result.stdout, '', JSON.stringify(asset));
  }
});

await test('a missing guide test tool stops with a clear install action', () => {
  mkdirSync(join(root, '.tooling'), { recursive: true });
  const bin = mkdtempSync(join(root, '.tooling/published-image-tools-'));
  try {
    for (const tool of ['bash', 'jq']) {
      const result = spawnSync(
        process.execPath,
        ['--test', join(root, 'tools/published-image-guide.test.mjs')],
        {
          env: { ...process.env, PATH: bin, NODE_TEST_CONTEXT: undefined },
          encoding: 'utf8',
        },
      );
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.match(
        result.stdout + result.stderr,
        new RegExp(`needs ${tool}\\. Install ${tool} and add it to PATH\\.`),
      );
      if (tool === 'bash')
        writeFileSync(
          join(bin, 'bash'),
          `#!${process.execPath}\nconsole.log('Fixture Bash version');\n`,
          { mode: 0o700 },
        );
    }
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});
