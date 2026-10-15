import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  areaReadingList,
  contractReferences,
  coreReadingList,
  keyFiles,
  operatorInterface,
  classifyImpact,
  operatorSurfacePath,
} from './agent-context.mjs';

// The fixtures below are disposable trees under the system temporary
// directory. They are never committed as application code.
const script = fileURLToPath(new URL('./agent-context.mjs', import.meta.url));

const guide = `# packages/core

## Key files

| File            | Purpose          |
| --------------- | ---------------- |
| \`src/index.ts\`  | The public entry |
| \`src/model.ts\`  | The domain model |
`;

/** The operator path item of the fixture and the schema it reaches. */
const operatorPath = 'packages/api-contract/paths/api_operator_accounts.yaml';
const operatorSchema = 'packages/api-contract/components/schemas/Account.yaml';
const otherSchema = 'packages/api-contract/components/schemas/Note.yaml';

/**
 * Builds a fixture tree and runs the script over it.
 *
 * The tree is `core/` inside a temporary directory, so a sibling checkout
 * sits at `../cloud` of the tree and never outside the fixture. A key that
 * starts with `../` writes beside the tree.
 *
 * @param {Record<string, string>} overrides
 * @param {string[]} paths
 * @param {{ tree?: string }} [options] The tree to run in, under the
 *   temporary directory.
 * @returns {{ status: number; output: string }}
 */
function run(overrides, paths, options = {}) {
  const outer = mkdtempSync(join(tmpdir(), 'notesapp-context-'));
  const directory = join(outer, 'core');
  try {
    /** @type {Record<string, string>} */
    const files = { 'packages/core/AGENTS.md': guide };
    for (const [file] of coreReadingList) files[file] = '# Fixture\n';
    for (const name of ['src/index.ts', 'src/model.ts'])
      files[`packages/core/${name}`] = 'export {};\n';
    files['apps/web/AGENTS.md'] = '# apps/web\n';
    for (const [, file] of areaReadingList) files[file] = '# Fixture\n';
    files[operatorInterface.guide[0]] = '# Fixture\n';
    files['packages/api-contract/AGENTS.md'] = '# packages/api-contract\n';
    files[operatorPath] =
      "get:\n  parameters:\n    - $ref: '../components/schemas/Account.yaml'\n";
    files[operatorSchema] = 'type: object\n';
    files[otherSchema] = 'type: object\n';
    for (const [name, content] of Object.entries({ ...files, ...overrides })) {
      if (content === '') continue;
      const file = join(directory, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const result = spawnSync(
      process.execPath,
      [script, '--root', join(outer, options.tree ?? 'core'), ...paths],
      { encoding: 'utf8' },
    );
    return {
      status: result.status ?? 1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    rmSync(outer, { recursive: true, force: true });
  }
}

/**
 * The listed files of one run, in order.
 *
 * @param {string} output
 * @returns {string[]}
 */
function listedFiles(output) {
  return output
    .split('\n')
    .filter((line) => /^ {2}\d+\. /.test(line))
    .map((line) => line.replace(/^ {2}\d+\. /, '').split(': ')[0] ?? '');
}

await test('the key files table gives one row per pointed at file', () => {
  assert.deepEqual(keyFiles(guide), [
    { path: 'src/index.ts', purpose: 'The public entry' },
    { path: 'src/model.ts', purpose: 'The domain model' },
  ]);
});

await test('a text with no key files section gives no row', () => {
  assert.deepEqual(keyFiles('# apps/web\n\n## Purpose\n\n| a | b |\n'), []);
});

await test('a path lists the core files, its guide, then the key files', () => {
  const result = run({}, ['packages/core/src/model.ts']);
  assert.equal(result.status, 0, result.output);
  const listed = result.output
    .split('\n')
    .filter((line) => /^ {2}\d+\. /.test(line))
    .map((line) => line.replace(/^ {2}\d+\. /, '').split(':')[0]);
  assert.deepEqual(listed, [
    ...coreReadingList.map(([file]) => file),
    operatorInterface.guide[0],
    'packages/core/AGENTS.md',
    'packages/core/src/index.ts',
    'packages/core/src/model.ts',
  ]);
});

await test('a path under an area lists the guide of that area', () => {
  const result = run({}, ['apps/web/src/features/notes/notes-home.tsx']);
  assert.equal(result.status, 0, result.output);
  const listed = result.output
    .split('\n')
    .filter((line) => /^ {2}\d+\. /.test(line))
    .map((line) => line.replace(/^ {2}\d+\. /, '').split(':')[0]);
  assert.deepEqual(listed, [
    ...coreReadingList.map(([file]) => file),
    'docs/development/design.md',
    'apps/web/AGENTS.md',
  ]);
});

await test('a path of the documentation site lists the design guide', () => {
  const result = run({}, ['apps/docs/src/page.ts']);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /docs\/development\/design\.md/);
});

await test('a path outside every area lists no area guide', () => {
  const result = run({}, ['packages/core/src/model.ts']);
  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /docs\/development\/design\.md/);
});

await test('no path lists every nested guide', () => {
  const result = run({}, []);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /apps\/web\/AGENTS\.md/);
  assert.match(result.output, /packages\/core\/AGENTS\.md/);
});

await test('a guide that points at a missing file fails', () => {
  const result = run({ 'packages/core/src/model.ts': '' }, ['packages/core']);
  assert.equal(result.status, 1);
  assert.match(result.output, /packages\/core\/src\/model\.ts/);
});

await test('a missing core file fails', () => {
  const result = run({ 'docs/decisions/README.md': '' }, ['packages/core']);
  assert.equal(result.status, 1);
  assert.match(result.output, /docs\/decisions\/README\.md/);
});

await test('a reference of a contract file resolves against its folder', () => {
  assert.deepEqual(
    contractReferences(
      operatorPath,
      "$ref: '../components/schemas/Account.yaml'\n$ref: './Other.yaml#/x'\n$ref: '#/local'\n",
    ),
    [operatorSchema, 'packages/api-contract/paths/Other.yaml'],
  );
});

await test('an operator path item lists the page of the operator interface', () => {
  const result = run({}, [operatorPath]);
  assert.equal(result.status, 0, result.output);
  assert.ok(
    listedFiles(result.output).includes(operatorInterface.guide[0]),
    result.output,
  );
});

await test('a schema that an operator path item reaches lists the page', () => {
  const result = run({}, [operatorSchema]);
  assert.equal(result.status, 0, result.output);
  assert.ok(
    listedFiles(result.output).includes(operatorInterface.guide[0]),
    result.output,
  );
});

await test('a schema that no operator path item reaches lists no page', () => {
  const result = run({}, [otherSchema]);
  assert.equal(result.status, 0, result.output);
  assert.ok(
    !listedFiles(result.output).includes(operatorInterface.guide[0]),
    result.output,
  );
});

await test('the portal path item lists the page', () => {
  const portal = 'packages/api-contract/paths/api_account_portal.yaml';
  const result = run({ [portal]: 'post:\n  tags: [accounts]\n' }, [portal]);
  assert.equal(result.status, 0, result.output);
  assert.ok(
    listedFiles(result.output).includes(operatorInterface.guide[0]),
    result.output,
  );
});

await test('each source file of the operator interface lists the page', () => {
  for (const file of operatorInterface.files) {
    const result = run({ [file]: '// Fixture\n' }, [file]);
    assert.equal(result.status, 0, result.output);
    assert.ok(
      listedFiles(result.output).includes(operatorInterface.guide[0]),
      `${file}: ${result.output}`,
    );
  }
});

await test('the guide of a cloud checkout beside the tree is listed', () => {
  const result = run({ '../cloud/AGENTS.md': '# cloud\n' }, [operatorPath]);
  assert.equal(result.status, 0, result.output);
  const listed = listedFiles(result.output);
  assert.deepEqual(listed.filter((file) => file.endsWith('.md')).slice(-3), [
    operatorInterface.guide[0],
    operatorInterface.sibling[0],
    'packages/api-contract/AGENTS.md',
  ]);
});

await test('an absent cloud checkout lists no guide of it and passes', () => {
  const result = run({}, [operatorPath]);
  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /cloud\/AGENTS\.md/);
});

await test('a worktree finds the cloud checkout beside its main checkout', () => {
  // `outer/core` is the main checkout, `outer/wt/one` a worktree of it, and
  // `outer/cloud` the cloud checkout beside the main checkout.
  const tree = {
    'packages/api-contract/AGENTS.md': '# packages/api-contract\n',
    [operatorPath]: 'get: {}\n',
    [operatorInterface.guide[0]]: '# Fixture\n',
    ...Object.fromEntries(
      coreReadingList.map(([file]) => [file, '# Fixture\n']),
    ),
  };
  const result = run(
    {
      '.git/worktrees/one/commondir': '../..\n',
      '../wt/one/.git': 'gitdir: ../../core/.git/worktrees/one\n',
      ...Object.fromEntries(
        Object.entries(tree).map(([file, text]) => [`../wt/one/${file}`, text]),
      ),
      '../cloud/AGENTS.md': '# cloud\n',
    },
    [operatorPath],
    { tree: 'wt/one' },
  );
  assert.equal(result.status, 0, result.output);
  assert.ok(
    listedFiles(result.output).includes('../../cloud/AGENTS.md'),
    result.output,
  );
});

await test('a missing page of the operator interface fails', () => {
  const result = run({ [operatorInterface.guide[0]]: '' }, [operatorPath]);
  assert.equal(result.status, 1);
  assert.match(result.output, /docs\/development\/operator-api\.md/);
});

await test('semantic, storage, migration, and image changes load operator context', () => {
  for (const path of [
    'packages/core/src/identity/controls.ts',
    'packages/core/src/workspaces/usage.ts',
    'packages/storage-server/src/stores/accounts.ts',
    'packages/storage-server/migrations/0001.sql',
    'docker/healthcheck.mjs',
    'Dockerfile',
    '.dockerignore',
    'docker-compose.yml',
    'package.json',
  ]) {
    assert.equal(operatorSurfacePath(path), true, path);
    const result = run({}, [path]);
    assert.equal(result.status, 0, result.output);
    assert.ok(
      listedFiles(result.output).includes(operatorInterface.guide[0]),
      path,
    );
  }
  assert.equal(operatorSurfacePath('apps/web/src/features/note.tsx'), false);
  const impact = classifyImpact([
    'packages/storage-server/migrations/0001.sql',
    'apps/web/src/features/note.tsx',
  ]);
  assert.equal(impact.operator, true);
  assert.equal(impact.migration, true);
  assert.equal(impact.ui, true);
});

await test('published HTML and shared Markdown changes require screen evidence', () => {
  for (const path of [
    'apps/server/src/routes/published-document.ts',
    'packages/markdown/src/render.ts',
  ])
    assert.equal(classifyImpact([path]).ui, true, path);
});

await test('image ignore, deployment, and package inputs carry image and operator impact', () => {
  for (const path of ['.dockerignore', 'docker-compose.yml', 'package.json']) {
    const impact = classifyImpact([path]);
    assert.equal(impact.image, true, path);
    assert.equal(impact.operator, true, path);
  }
});

await test('only named document paths select the short gate', () => {
  assert.equal(
    classifyImpact(['docs/development/verification.md', 'CHANGELOG.md'])
      .documentsOnly,
    true,
  );
  for (const path of [
    'README.md',
    'docs/example.mjs',
    'rules/link.sh',
    'package.json',
    '.github/workflows/ci.yml',
    'unknown.md',
  ]) {
    assert.equal(
      classifyImpact(['docs/README.md', path]).documentsOnly,
      false,
      path,
    );
  }
  assert.equal(classifyImpact([]).documentsOnly, false);
});

await test('every image input and unknown path selects image proof', () => {
  for (const path of [
    'apps/server/src/main.ts',
    'apps/web/public/fonts/geist-latin.woff2',
    'packages/core/src/product.ts',
    'tools/native-sources.mjs',
    'tools/base-sources.json',
    '.pnpmfile.cjs',
    'pnpm-workspace.yaml',
    '.npmrc',
    'tsconfig.json',
    'patches/mermaid.patch',
    'tests/image/commands.test.ts',
    '.github/workflows/ci.yml',
    'new-input',
  ]) {
    assert.equal(classifyImpact([path]).image, true, path);
  }
  for (const path of [
    'docs/README.md',
    'CHANGELOG.md',
    'apps/docs/src/main.ts',
    'tools/agent-context.test.mjs',
    'tests/integration/sync.test.ts',
  ]) {
    assert.equal(classifyImpact([path]).image, false, path);
  }
});
