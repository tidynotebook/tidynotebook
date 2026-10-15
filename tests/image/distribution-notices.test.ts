/** Read notices and source archives from the real runner image. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const run = promisify(execFile);
const image = process.env['NOTESAPP_IMAGE'] || 'notesapp:latest';

await test('the runner has a complete dependency graph and no schema tools', async () => {
  const script = String.raw`
    import {readFileSync} from 'node:fs';
    import {createHash} from 'node:crypto';
    import {checkRuntimeDependencies} from '/app/runtime-dependencies.mjs';
    const result=await checkRuntimeDependencies('/app/server');
    const sha256=createHash('sha256').update(readFileSync('/app/runtime-dependencies.mjs')).digest('hex');
    process.stdout.write(JSON.stringify({...result,sha256}));
  `;
  const result = await run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'node',
    image,
    '--input-type=module',
    '--eval',
    script,
  ]);
  const value: unknown = JSON.parse(result.stdout);
  assert.ok(typeof value === 'object' && value !== null);
  assert.ok(
    'packages' in value &&
      typeof value.packages === 'number' &&
      value.packages > 1,
  );
  const source = await readFile(
    join(import.meta.dirname, '../../tools/runtime-dependencies.mjs'),
  );
  assert.ok('sha256' in value);
  assert.equal(value.sha256, createHash('sha256').update(source).digest('hex'));
});

function sourceFile(manifest: unknown, suffix: string): string {
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('sources' in manifest) ||
    !Array.isArray(manifest.sources)
  )
    throw new Error('The image source manifest is invalid.');
  for (const value of manifest.sources) {
    const row: unknown = value;
    if (
      typeof row === 'object' &&
      row !== null &&
      'file' in row &&
      typeof row.file === 'string' &&
      /^[\w.+~-]+$/.test(row.file) &&
      row.file.endsWith(suffix)
    )
      return row.file;
  }
  throw new Error('The image source archive is missing.');
}

await test('the runner carries full notices and its exact build source', async () => {
  const script = String.raw`
    import assert from 'node:assert/strict';
    import {readFileSync,readdirSync,statSync} from 'node:fs';
    import {createHash} from 'node:crypto';
    import {execFileSync} from 'node:child_process';
    import {createRequire} from 'node:module';
    import {dirname,join} from 'node:path';
    assert.ok(process.getuid()>0);
    for(const file of ['/usr/bin/mount','/usr/bin/umount']) {
      const metadata=statSync(file);
      assert.equal(metadata.uid,0);assert.equal(metadata.gid,0);
      assert.equal(metadata.mode & 0o6000,0);assert.equal(metadata.mode & 0o022,0);
    }
    const capabilities=/^CapBnd:\s*([a-fA-F0-9]+)$/m.exec(readFileSync('/proc/self/status','utf8'))?.[1];assert.ok(capabilities);
    assert.equal(BigInt('0x'+capabilities) & (1n<<21n),0n);
    const license=readFileSync('/app/LICENSE','utf8');
    assert.match(license,/GNU AFFERO GENERAL PUBLIC LICENSE/);
    assert.equal(readFileSync('/app/licenses/LICENSE','utf8'),license);
    assert.match(readFileSync('/app/licenses/THIRD-PARTY-NOTICES.txt','utf8'),/sharp@/);
    assert.match(readFileSync('/app/licenses/borrowed-work/sharp-libvips-notices.txt','utf8'),/Mozilla Public License 1.1/);
    const source=JSON.parse(readFileSync('/app/licenses/native-source/manifest.json','utf8'));
    const require=createRequire('/app/server/package.json');
    const sharpRequire=createRequire(require.resolve('sharp'));
    const library=sharpRequire.resolve('@img/sharp-libvips-linux-x64/package');
    assert.equal(source.platform,process.platform+'-'+process.arch+'-glibc');
    assert.equal(source.packageVersion,JSON.parse(readFileSync(library,'utf8')).version);
    assert.deepEqual(source.versions,JSON.parse(readFileSync(join(dirname(library),'versions.json'),'utf8')));
    for(const row of source.sources){
      assert.equal(createHash('sha256').update(readFileSync('/app/licenses/native-source/'+row.file)).digest('hex'),row.sha256);
    }
    const rsvg=source.sources.find(row=>row.file.endsWith('librsvg-2.63.2.tar.xz'));
    assert.ok(rsvg);
    assert.equal(createHash('sha256').update(readFileSync('/inspection/librsvg.tar.xz')).digest('hex'),rsvg.sha256);
    const lock=readFileSync('/inspection/librsvg.lock','utf8');
    for(const block of lock.split('[[package]]')) {
      const name=/^name = "([^"]+)"$/m.exec(block)?.[1];
      const version=/^version = "([^"]+)"$/m.exec(block)?.[1];
      const checksum=/^checksum = "([^"]+)"$/m.exec(block)?.[1];
      if(checksum!==undefined)assert.ok(source.sources.some(row=>row.file===name+'-'+version+'.crate'&&row.sha256===checksum),'librsvg crate '+name);
    }
    const base=JSON.parse(readFileSync('/app/licenses/base-source/manifest.json','utf8'));
    const fixed=JSON.parse(readFileSync('/app/licenses/runner-source/manifest.json','utf8'));
    assert.equal(fixed.image,base.image);
    const fixedSources=new Set(fixed.packages.map(row=>row.name));
    const expectedSources=[...base.packages.filter(row=>!fixedSources.has(row.name)),...fixed.packages];
    const actual=execFileSync('dpkg-query',['-W','-f=$'+'{source:Package}\t$'+'{source:Version}\n'],{encoding:'utf8'}).trim().split('\n');
    assert.deepEqual([...new Set(actual)].sort(),expectedSources.map(row=>row.name+'\t'+row.version).sort());
    const original=JSON.parse(readFileSync('/app/licenses/base-source/original-binaries.json','utf8'));
    assert.equal(original.image,base.image);
    const expectedBinaries=original.packages.map(row=>fixed.binaries.find(change=>change.name===row.name)??row);
    assert.equal(expectedBinaries.length,original.packages.length);
    const actualBinaries=execFileSync('dpkg-query',['-W','-f=$'+'{binary:Package}\t$'+'{Version}\t$'+'{source:Package}\t$'+'{source:Version}\n'],{encoding:'utf8'}).trim().split('\n');
    assert.deepEqual(actualBinaries.sort(),expectedBinaries.map(row=>[row.name,row.version,row.sourcePackage,row.sourceVersion].join('\t')).sort());
    assert.equal(process.versions.node,base.nodeVersion);
    assert.deepEqual(readdirSync('/opt'),[]);
    assert.deepEqual(readdirSync('/usr/local/lib/node_modules').sort(),[]);
    assert.deepEqual(readdirSync('/usr/local/bin').sort(),['docker-entrypoint.sh','node','nodejs']);
    const npmInventory=JSON.parse(readFileSync('/app/licenses/base-npm/inventory.json','utf8'));
    assert.equal(npmInventory.packages.find(row=>row.name==='npm')?.version,base.npmVersion);
    assert.match(readFileSync('/app/licenses/base-npm/THIRD-PARTY-NOTICES.txt','utf8'),/spdx-exceptions@2.5.0/);
    assert.equal(createHash('sha256').update(readFileSync('/usr/local/bin/docker-entrypoint.sh')).digest('hex'),base.dockerEntrypointSha256);
    for(const {manifest,directory,keyring} of [{manifest:base,directory:'/app/licenses/base-source',keyring:'/app/licenses/borrowed-work/debian-source-keys.gpg'},{manifest:fixed,directory:'/app/licenses/runner-source',keyring:'/app/licenses/borrowed-work/runner-source-keys.gpg'}]) {
    for(const row of manifest.sources)assert.equal(createHash('sha256').update(readFileSync(directory+'/'+row.file)).digest('hex'),row.sha256);
    for(const pkg of manifest.packages) {
      const descriptor=pkg.files.find(file=>file.endsWith('.dsc'));assert.ok(descriptor);
      const file=directory+'/'+descriptor;
      execFileSync('gpgv',['--keyring',keyring,file],{stdio:['ignore','pipe','pipe']});
      const body=readFileSync(file,'utf8');
      assert.equal(/^Source: (.+)$/m.exec(body)?.[1],pkg.name);
      assert.equal(/^Version: (.+)$/m.exec(body)?.[1],pkg.version);
      const checksum=body.split('Checksums-Sha256:\n')[1];assert.ok(checksum);
      for(const line of checksum.split('\n')) {
        if(!line.startsWith(' '))break;
        const [hash,size,name]=line.trim().split(/\s+/);
        const bytes=readFileSync(directory+'/'+name);
        assert.equal(bytes.length,Number(size));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
      }
    }
    }
    execFileSync('gpgv',['--keyring','/app/licenses/base-source/node-release-pubring.kbx','/app/licenses/base-source/node-SHASUMS256.txt.sig','/app/licenses/base-source/node-SHASUMS256.txt'],{stdio:['ignore','pipe','pipe']});
    const nodeSource=base.sources.find(row=>row.file==='node-v'+base.nodeVersion+'.tar.xz');assert.ok(nodeSource);
    assert.ok(readFileSync('/app/licenses/base-source/node-SHASUMS256.txt','utf8').includes(nodeSource.sha256+'  '+nodeSource.file));
    assert.equal(createHash('sha256').update(readFileSync('/inspection/node.tar.xz')).digest('hex'),nodeSource.sha256);
    assert.equal(readFileSync('/inspection/node-LICENSE','utf8'),readFileSync('/usr/local/LICENSE','utf8'));
    assert.equal(JSON.parse(readFileSync('/inspection/npm-package.json','utf8')).version,base.npmVersion);
    const list=execFileSync('tar',['-tzf','/app/licenses/core-source.tar.gz'],{encoding:'utf8'}).split('\n');
    for(const file of ['LICENSE','Dockerfile','pnpm-lock.yaml','pnpm-workspace.yaml','apps/server/src/main.ts','apps/web/src/diagram/frame-main.ts','patches/mermaid@12.0.0.patch','apps/web/public/fonts/geist-latin.woff2','apps/web/public/fonts/geist-mono-latin.woff2'])assert.ok(list.includes(file),file);
    assert.ok(!list.some(file=>file.includes('node_modules/')||file.startsWith('.env')||file.startsWith('.tooling/')||file.startsWith('../')));
    assert.equal(execFileSync('tar',['-xOzf','/app/licenses/core-source.tar.gz','LICENSE'],{encoding:'utf8'}),license);
    console.log('runner notices, core build source and native source hashes pass');
  `;
  const repository = join(import.meta.dirname, '../..');
  await mkdir(join(repository, '.tooling'), { recursive: true });
  const directory = await mkdtemp(
    join(repository, '.tooling/source-inspection-'),
  );
  const inspection = join(directory, 'inspection');
  await mkdir(inspection, { mode: 0o755 });
  let container;
  try {
    container = (
      await run('docker', [
        'create',
        '--entrypoint',
        'node',
        image,
        '--input-type=module',
        '-e',
        script,
      ])
    ).stdout.trim();
    for (const kind of ['native', 'base'])
      await run('docker', [
        'cp',
        `${container}:/app/licenses/${kind}-source/manifest.json`,
        join(directory, `${kind}.json`),
      ]);
    const native: unknown = JSON.parse(
      await readFile(join(directory, 'native.json'), 'utf8'),
    );
    const base: unknown = JSON.parse(
      await readFile(join(directory, 'base.json'), 'utf8'),
    );
    if (
      typeof base !== 'object' ||
      base === null ||
      !('nodeVersion' in base) ||
      typeof base.nodeVersion !== 'string'
    )
      throw new Error('The image Node source identity is missing.');
    const rsvg = sourceFile(native, 'librsvg-2.63.2.tar.xz');
    const node = sourceFile(base, 'node-v' + base.nodeVersion + '.tar.xz');
    for (const [origin, target] of [
      ['native-source/' + rsvg, 'librsvg.tar.xz'],
      ['base-source/' + node, 'node.tar.xz'],
    ] as const)
      await run('docker', [
        'cp',
        `${container}:/app/licenses/${origin}`,
        join(inspection, target),
      ]);
    // The host has the inspection tools; the slim runner needs no xz tool.
    for (const [archive, member, target] of [
      ['librsvg.tar.xz', 'librsvg-2.63.2/Cargo.lock', 'librsvg.lock'],
      ['node.tar.xz', 'node-v' + base.nodeVersion + '/LICENSE', 'node-LICENSE'],
      [
        'node.tar.xz',
        'node-v' + base.nodeVersion + '/deps/npm/package.json',
        'npm-package.json',
      ],
    ] as const) {
      const result = await run('tar', [
        '-xOf',
        join(inspection, archive),
        member,
      ]);
      await writeFile(join(inspection, target), result.stdout, {
        mode: 0o644,
      });
    }
    await run('docker', ['cp', inspection, `${container}:/inspection`]);
    const result = await run('docker', ['start', '--attach', container], {
      maxBuffer: 1024 * 1024,
    });
    assert.equal(
      (
        await run('docker', [
          'inspect',
          '--format',
          '{{.State.ExitCode}}',
          container,
        ])
      ).stdout.trim(),
      '0',
    );
    assert.match(result.stdout, /native source hashes pass/);
  } finally {
    if (container !== undefined) await run('docker', ['rm', container]);
    await rm(directory, { recursive: true, force: true });
  }
});

await test('the bundled first-party source rebuilds the builder context', async () => {
  const repository = join(import.meta.dirname, '../..');
  await mkdir(join(repository, '.tooling'), { recursive: true });
  const directory = await mkdtemp(join(repository, '.tooling/source-rebuild-'));
  let container;
  try {
    container = (await run('docker', ['create', image])).stdout.trim();
    await run('docker', [
      'cp',
      `${container}:/app/licenses/core-source.tar.gz`,
      join(directory, 'source.tar.gz'),
    ]);
    await run('tar', [
      '-xzf',
      join(directory, 'source.tar.gz'),
      '-C',
      directory,
    ]);
    for (const file of [
      'Dockerfile',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.pnpmfile.cjs',
      'tools/runtime-dependencies.mjs',
      'patches/mermaid@12.0.0.patch',
      'apps/web/src/diagram/frame-main.ts',
    ])
      assert.equal(
        await readFile(join(directory, file), 'utf8'),
        await readFile(join(repository, file), 'utf8'),
        file,
      );
    for (const file of [
      'apps/web/public/fonts/geist-latin.woff2',
      'apps/web/public/fonts/geist-mono-latin.woff2',
    ])
      assert.deepEqual(
        await readFile(join(directory, file)),
        await readFile(join(repository, file)),
        file,
      );
    for (const bundle of ['native', 'base', 'runner']) {
      const cache = join(directory, 'tools/native-source-cache', bundle);
      await mkdir(cache, { recursive: true });
      await run('docker', [
        'cp',
        `${container}:/app/licenses/${bundle}-source/.`,
        cache,
      ]);
    }
    // Limit only archive collection: package installation still needs its
    // registry. No missing or changed bundled archive can be fetched again.
    const dockerfile = await readFile(join(directory, 'Dockerfile'), 'utf8');
    const collectors = /^RUN node tools\/native-sources\.mjs /gm;
    assert.equal([...dockerfile.matchAll(collectors)].length, 3);
    const offlineDockerfile = join(directory, 'Dockerfile.offline');
    await writeFile(
      offlineDockerfile,
      dockerfile.replace(
        collectors,
        'RUN --network=none node tools/native-sources.mjs ',
      ),
    );
    await run(
      'docker',
      [
        'build',
        '--platform',
        'linux/amd64',
        '--target',
        'builder',
        '-f',
        offlineDockerfile,
        directory,
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );
  } finally {
    if (container !== undefined) await run('docker', ['rm', container]);
    await rm(directory, { recursive: true, force: true });
  }
});
