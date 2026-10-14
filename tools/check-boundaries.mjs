import { builtinModules } from 'node:module';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parseSync } from 'oxc-parser';
import { filesIn, record, root, workspaces } from './workspace.mjs';

// A separate root permits disposable negative checks without application fixtures.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--root')) {
  process.stderr.write(
    'Usage: node tools/check-boundaries.mjs [--root <directory>]\n',
  );
  process.exit(1);
}
const directory = resolve(args[1] ?? root);
const packages = await workspaces(directory);
/** @type {Record<string, string[]>} */
const allowed = {
  web: [
    'api-client',
    'core',
    'storage-browser',
    'sync',
    'markdown',
    'editor',
    'ui',
    'logging',
  ],
  server: ['api-contract', 'core', 'storage-server', 'markdown', 'logging'],
  'api-contract': [],
  'api-client': [],
  core: [],
  // Accepted index updates parse Markdown inside the same database
  // transaction that advances a head. This server-only adapter may therefore
  // use the shared pure parser, and the edge stays acyclic.
  // The deployment builds its document service here, so the server and the
  // migration command share one adapter over the document package (0081).
  'storage-server': ['core', 'markdown', 'note-document'],
  // The device holds the document of each note, so it reads the same byte
  // API that the server uses (records 0081, 0085).
  'storage-browser': ['core', 'sync', 'note-document'],
  // The device derives its own backlinks from the note bodies it holds, so
  // it reads links with the one shared extractor that the server index uses
  // (record 0037). The edge stays acyclic, because markdown reaches core only.
  sync: ['core', 'api-client', 'markdown'],
  markdown: ['core'],
  logging: [],
  // The editor binds one live note document to its view (record 0082).
  editor: ['core', 'markdown', 'ui', 'note-document'],
  // The document package owns Yjs behind a byte API and imports no workspace
  // package. Core receives it through a port, never through an import.
  'note-document': [],
  ui: [],
  'sdk-codegen': ['api-contract'],
  // The documentation site of record 0152 renders the guide with the one
  // renderer and the recipes of the interface, and it reads the stylesheet
  // that the build of the web application writes, so it builds after it.
  docs: ['markdown', 'ui', 'web'],
};
// Core belongs here. The design requires core to run in the browser, so core
// must stay free of Node built-in modules and server-only packages.
const browser = new Set([
  'web',
  'api-client',
  'core',
  'storage-browser',
  'sync',
  'markdown',
  'editor',
  'ui',
  'logging',
  'note-document',
]);
const serverOnly = new Set(['server', 'storage-server']);
// Recognized test files may use these modules. Production files may not.
const testModules = new Set([
  'node:test',
  'node:test/reporters',
  'node:assert',
  'node:assert/strict',
]);
const builtinNames = new Set(
  builtinModules.flatMap((name) => {
    const bare = name.replace(/^node:/, '');
    return [bare, bare.split('/')[0] ?? bare];
  }),
);
const nodeOnly = new Set([
  'pg',
  'fastify',
  'fastify-plugin',
  'drizzle-orm',
  'drizzle-kit',
  'better-auth',
  'sharp',
  'dotenv',
]);
const coreForbidden = new Set([
  'react',
  'react-dom',
  'fastify',
  'drizzle-orm',
  'dexie',
]);
const httpLibraries = new Set([
  'axios',
  'ky',
  'got',
  'superagent',
  'node-fetch',
  'undici',
  '@hey-api/client-fetch',
]);
// A WebSocket library opens a socket or serves one. The generated socket
// entry states every address and message (record 0126), so a library enters
// only through a file that this list names: the one mount of the server
// (record 0129), the one browser transport (record 0130), and the one test
// client.
const socketLibraries = new Set([
  'ws',
  'isomorphic-ws',
  '@fastify/websocket',
  'partysocket',
  'reconnecting-websocket',
  'socket.io',
  'socket.io-client',
]);
const socketFiles = new Set([
  'apps/server/src/plugins/websocket.ts',
  'packages/api-client/src/socket.ts',
  'tests/integration/support/notices.ts',
]);
// These files connect maintained protocols or cache static application assets.
// They remain subject to imports, dependency direction, and package cycle checks.
const protocolFiles = new Set([
  'apps/server/src/auth/better-auth.ts',
  'apps/server/src/mcp/protocol.ts',
]);
// The installed worker routes by address, so it reads a URL that no generated
// operation produced. `routing.ts` holds those decisions and the worker holds
// their effects.
const assetFiles = new Set([
  'apps/web/src/pwa/service-worker.ts',
  'apps/web/src/pwa/routing.ts',
]);
// Build configuration runs in Node during the build and is never shipped to
// a browser, so it may read the file system and compose paths. Every other
// rule, including the dependency direction, still applies to it.
// `precache.ts` is the build step that compiles the installed worker and
// names its precache. It sits with the worker it builds, and the declaration
// build of apps/web excludes it, so no browser bundle can reach it.
const buildFiles = new Set([
  'apps/web/vite.config.ts',
  'apps/web/src/pwa/precache.ts',
]);
// The handwritten client configuration named in the plan. It may pass a fetch
// implementation and a base URL to the generated client. It must not call fetch
// itself, so the call rule below stays active for it.
const clientConfigFiles = new Set(['packages/api-client/src/configure.ts']);
// Decision 0018 split packages/storage-browser/src/local-store.ts, once 2,609
// lines, into one area module per concern behind the one `openLocalStore`
// port: drafts, versions, queue and receipts, recovery, preferences, the
// cached-file reads, and the snapshot. A non-test source file in this package
// stays under this ceiling, so the monolith cannot grow back. The cap sits
// well above the largest area module, so an honest addition never trips it;
// a file that reaches it must become a new area module of src/local-store/.
// The rule is scoped to storage-browser, because later steps of the same epic
// split the other large files that this cap must not yet flag.
const storageBrowserSourcePrefix = 'packages/storage-browser/src/';
const storageBrowserLineCap = 900;
// Decision 0018 split packages/storage-server/src/workspace-store.ts, once
// 1,923 lines, into one repository per context behind the one
// `openWorkspaceStore` port: the transaction unit of work, the shared error
// funnel and listing paging, and the notes, history, trash, search, sync, and
// membership repositories, composed by the directory index. A non-test source
// file in this directory stays under this ceiling, so the monolith cannot grow
// back. The cap sits well above the largest module, so an honest addition never
// trips it; a file that reaches it must become a new repository or a shared
// helper of the directory. The rule is scoped to this directory, not the whole
// package, so the split it guards stays independent of the unrelated files of
// the package, such as the schema and the identity store.
const workspaceStoreSourcePrefix =
  'packages/storage-server/src/workspace-store/';
const workspaceStoreLineCap = 900;
// Decision 0018 splits the largest apps/web feature files and gives each
// feature its own directory. The web source now reads as shell/ (the app
// frame), lib/ (pure helpers with no React), and features/<feature>/ (one
// directory per feature, each with its components, hooks, and the pure logic
// tested next to it). This cap holds every file under features/<feature>/: a
// non-test feature source file stays under the ceiling, so a split file cannot
// collapse back into a monolith. A file that reaches the cap must move a
// concern into a sibling module or a new per-feature directory.
// NOTE: the cap is modest on purpose. It sits above note-editor.tsx, the editor
// host that stays the largest feature file, so an honest addition never trips
// it while the file that reaches it must be split. The prefix matches the
// per-feature directories, because a nested path still starts with it.
const featuresSourcePrefix = 'apps/web/src/features/';
const featuresLineCap = 1600;
// Decision 0018 keeps apps/web/src/lib/ pure: a helper there holds no React and
// reaches no screen. A lib file that imports react, react-dom, or a relative
// path into shell/ or features/ would turn the frame edge around, so the check
// forbids it. The rule stays inside lib/, because shell/ and features/ may
// import lib/ freely. A stricter cross-feature ban (one feature may reach
// another only through app/ or lib/) is not added here: shell/ composes every
// feature and several features still share helpers by direct import, so that
// ban would flag true edges today. It waits until those edges move behind lib/.
const webLibPrefix = 'apps/web/src/lib/';
// Record 0153. The client script of the documentation site runs in the
// browser with no bundler, so it imports the modules of its own folder and
// nothing else: no package, and no Node module.
const docsClientPrefix = 'apps/docs/src/client/';
// The search index of that site is a file that the build writes beside the
// pages, not a module of the source, so the one module that loads it computes
// its address from the base path of the site.
const indexLoaderFiles = new Set(['apps/docs/src/client/search-index.ts']);
const webReactPackages = new Set(['react', 'react-dom']);
const webScreenPrefixes = ['apps/web/src/shell/', 'apps/web/src/features/'];
// Record 0082. Yjs stays behind the note document package: only that package
// imports it at run time, and a type-only import is the one other use. The
// editor alone reads the live document through the private bridge entry and
// alone imports the CodeMirror binding, so no Yjs value reaches core, sync,
// storage, or a web feature.
const yjsOwner = 'note-document';
const yjsPackages = new Set(['yjs', 'lib0']);
const editorBinding = 'y-codemirror.next';
const editorBridgeEntry = '@notesapp/note-document/editor-bridge';
const bridgeReaders = new Set(['editor']);
// The one package with a second entry point, and the one entry it may add.
const secondEntries = new Map([[yjsOwner, './editor-bridge']]);
/** The test data that a test file of any package may import (record 0155). */
const sharedTestDataPrefix = 'packages/markdown/test-data/';
const generated = [
  'packages/api-client/src/generated/',
  'packages/api-contract/src/generated/',
];
/** @type {string[]} */
const failures = [];
/** @type {Map<string, Set<string>>} */
const graph = new Map();
// First Node-only or server-only use found in each package, for reach reports.
/** @type {Map<string, string>} */
const nodeUse = new Map();
/** @param {string} file @param {string} reason */
const fail = (file, reason) =>
  failures.push(`${relative(directory, file)}: ${reason}`);
/** @param {string} name */
const short = (name) => name.replace(/^@notesapp\//, '');
/** @param {string} specifier */
const packageName = (specifier) =>
  specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] ?? specifier);
/** @param {string} file */
const owner = (file) =>
  packages.find(
    (item) => file === item.path || file.startsWith(item.path + sep),
  );
/** @param {string} specifier */
const isNodeModule = (specifier) =>
  specifier.startsWith('node:') ||
  builtinNames.has(specifier) ||
  builtinNames.has(packageName(specifier));
// Reports why a specifier keeps its importer out of the browser.
/** @param {string} specifier @returns {string | null} */
function browserBlocker(specifier) {
  const dependency = packageName(specifier);
  if (isNodeModule(specifier)) return `Node module ${specifier}`;
  if (
    nodeOnly.has(dependency) ||
    dependency.startsWith('@fastify/') ||
    dependency.startsWith('@better-auth/')
  )
    return `Node-only package ${dependency}`;
  if (dependency.startsWith('@notesapp/') && serverOnly.has(short(dependency)))
    return `server-only package ${dependency}`;
  return null;
}
// A recognized test file: `*.test.ts`, `*.test.tsx`, or `*.test.mjs` anywhere,
// plus every file in the repository-root `tests/` tree.
/** @param {string} path @returns {boolean} */
const isTestPath = (path) =>
  /\.test\.(?:tsx?|mjs)$/.test(path) || path.startsWith('tests/');
// A test file must sit where a command runs it: a package `src` tree, the
// repository-root `tests` tree, or directly in `tools` for a root tool test.
/** @param {string} file @param {string} path @returns {boolean} */
function isTestLocation(file, path) {
  if (path.startsWith('tests/') || /^tools\/[^/]+$/.test(path)) return true;
  const item = owner(file);
  return item !== undefined && file.startsWith(resolve(item.path, 'src') + sep);
}
/** @param {string} specifier @returns {boolean} */
const isTestSpecifier = (specifier) =>
  /(?:^|\/)[^/]*\.test\.(?:tsx?|mjs)$/.test(specifier) ||
  /(?:^|\/)tests\//.test(specifier);

for (const item of packages) {
  const name = String(item.manifest.name);
  const key = short(name);
  if (!name.startsWith('@notesapp/') || !(key in allowed))
    fail(item.path, 'Unknown workspace package.');
  if (graph.has(name)) fail(item.path, `Duplicate package name ${name}.`);
  const edges = new Set();
  graph.set(name, edges);
  const exports = record(item.manifest.exports);
  const extraEntry = secondEntries.get(key);
  if (
    !('.' in exports) ||
    Object.keys(exports).some((entry) => entry !== '.' && entry !== extraEntry)
  )
    fail(
      item.path,
      'Expose only the public package entry point through exports["."].',
    );
  for (const required of ['typecheck', 'build', 'test:unit']) {
    if (typeof record(item.manifest.scripts)[required] !== 'string')
      fail(item.path, `Missing ${required} script.`);
  }
  for (const group of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const dependency of Object.keys(record(item.manifest[group]))) {
      if (dependency.startsWith('@notesapp/')) {
        edges.add(dependency);
        if (!allowed[key]?.includes(short(dependency)))
          fail(item.path, `Forbidden dependency ${dependency}.`);
      }
      if (key === 'core' && coreForbidden.has(dependency))
        fail(item.path, `Core cannot depend on ${dependency}.`);
      // Test helpers stay in devDependencies and never reach the browser build.
      if (group === 'devDependencies') continue;
      const blocker = browserBlocker(dependency);
      if (!blocker) continue;
      if (browser.has(key))
        fail(item.path, `Browser runtime cannot depend on ${dependency}.`);
      if (!nodeUse.has(name)) nodeUse.set(name, `${blocker} in ${group}`);
    }
  }
}

/**
 * @param {string} file
 * @param {string} specifier
 * @param {boolean} isTest
 * @param {boolean} isGenerated
 * @param {boolean} [isTypeOnly]
 */
function checkImport(file, specifier, isTest, isGenerated, isTypeOnly = false) {
  const importPath = relative(directory, file).split(sep).join('/');
  if (
    specifier.startsWith('@modelcontextprotocol/') &&
    !importPath.startsWith('apps/server/src/mcp/')
  )
    fail(
      file,
      'The MCP SDK belongs only in apps/server/src/mcp/ (record 0225).',
    );
  const item = owner(file);
  if (!item) return;
  const isBuild = buildFiles.has(
    relative(directory, file).split(sep).join('/'),
  );
  const name = String(item.manifest.name);
  const key = short(name);
  const dependency = packageName(specifier);
  const filePath = relative(directory, file).split(sep).join('/');
  // Decision 0018 keeps apps/web/src/lib/ pure. React never enters it.
  if (filePath.startsWith(webLibPrefix) && webReactPackages.has(dependency))
    fail(
      file,
      'A file in apps/web/src/lib/ is pure. It cannot import React (decision 0018).',
    );
  if (filePath.startsWith(docsClientPrefix) && !isTest) {
    const target = relative(directory, resolve(file, '..', specifier))
      .split(sep)
      .join('/');
    if (!specifier.startsWith('.') || !target.startsWith(docsClientPrefix))
      fail(
        file,
        `The client script of the docs site imports only modules of ${docsClientPrefix} (record 0153), not ${specifier}.`,
      );
  }
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    // Handwritten relative imports carry an explicit `.ts` extension, so the
    // resolved path decides whether the target is a test file.
    const target = resolve(file, '..', specifier);
    const targetPath = relative(directory, target).split(sep).join('/');
    if (!isTest && isTestPath(targetPath))
      fail(file, `Production source cannot import test file ${specifier}.`);
    // The shared Markdown corpus is test data that every reader of a note
    // checks itself against (record 0155), so a test file may read it from
    // the package that owns it. Production source never may.
    const sharedTestData =
      isTest && targetPath.startsWith(sharedTestDataPrefix);
    if (owner(target) !== item && !sharedTestData)
      fail(file, 'Relative or absolute imports cannot leave a package.');
    // A lib helper is pure, so it never reaches back into a screen.
    if (
      filePath.startsWith(webLibPrefix) &&
      webScreenPrefixes.some((prefix) => targetPath.startsWith(prefix))
    )
      fail(
        file,
        'A file in apps/web/src/lib/ is pure. It cannot import a shell/ or features/ module (decision 0018).',
      );
    // Decision 0018 removed apps/server/src/http/. A cross-cutting Fastify
    // concern lives in apps/server/src/plugins/ and a resource controller lives
    // in apps/server/src/routes/. An import that still points at the old
    // directory must fail here rather than surface later as a type error.
    // NOTE: a routes/ file may not import a store, but the checker does not
    // forbid one routes/ file from importing another. handlers.ts is the
    // aggregator that composes every resource controller, and export, history,
    // search, sync, attachments, and workspaces reuse helpers from files.ts and
    // accounts.ts. A blanket routes-to-routes ban would flag all of these true
    // edges, so this rule stays scoped to the removed http/ path.
    if (/^apps\/server\/src\/http(?:\/|$)/.test(targetPath))
      fail(
        file,
        'apps/server/src/http is removed. Import from plugins/ or routes/ (decision 0018).',
      );
    return;
  }
  if (!isTest && isTestSpecifier(specifier))
    fail(file, `Production source cannot import test file ${specifier}.`);
  if (specifier.startsWith('#')) {
    fail(file, 'Package import aliases are not part of the public boundary.');
    return;
  }
  if (specifier === editorBridgeEntry && !bridgeReaders.has(key))
    fail(
      file,
      'Only packages/editor reads the private editor bridge (record 0082).',
    );
  if (yjsPackages.has(dependency) && key !== yjsOwner && !isTypeOnly)
    fail(
      file,
      `Only packages/note-document imports ${dependency} at run time (record 0082).`,
    );
  if (dependency === editorBinding && !bridgeReaders.has(key))
    fail(file, `Only packages/editor imports ${editorBinding} (record 0082).`);
  if (dependency.startsWith('@notesapp/')) {
    graph.get(name)?.add(dependency);
    if (specifier !== dependency && specifier !== editorBridgeEntry)
      fail(file, `Deep import ${specifier} is forbidden.`);
    if (!allowed[key]?.includes(short(dependency)))
      fail(file, `Forbidden import ${dependency}.`);
  }
  if (
    dependency === 'pino' &&
    filePath !== 'apps/server/src/logging.ts' &&
    key !== 'logging'
  )
    fail(
      file,
      'Pino belongs in the shared logging package or the server sink adapter.',
    );
  const blocker = browserBlocker(specifier);
  if (blocker && !isBuild && !(isTest && testModules.has(specifier))) {
    if (browser.has(key))
      fail(file, `Browser source cannot import ${specifier}.`);
    if (!isTest && !nodeUse.has(name)) nodeUse.set(name, blocker);
  }
  if (
    key === 'core' &&
    (coreForbidden.has(dependency) || dependency === '@notesapp/api-client')
  )
    fail(file, `Core cannot import ${dependency}.`);
  // Generated output owns the fetch transport and its client package.
  if (!isGenerated && httpLibraries.has(dependency))
    fail(file, `Use generated operations instead of ${dependency}.`);
  if (socketLibraries.has(dependency) && !socketFiles.has(filePath))
    fail(
      file,
      `Use the generated socket entry instead of ${dependency}, or name this adapter file in the socket list.`,
    );
  // A declaration package declares the module it describes, but only for a
  // type-only import. TypeScript resolves `import type ... from 'mdast'`
  // through `@types/mdast`, and nothing is loaded at run time. A value import
  // of the same name needs the runtime package, so `import x from 'lodash'`
  // still fails when only `@types/lodash` is declared. A mixed import such as
  // `import { type A, B }` is a value import and is treated as one.
  const groups = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];
  /** @param {string} candidate @returns {boolean} */
  const declared = (candidate) =>
    groups.some((group) => candidate in record(item.manifest[group]));
  if (
    !specifier.startsWith('node:') &&
    !builtinModules.includes(specifier) &&
    dependency !== name &&
    !declared(dependency) &&
    !(isTypeOnly && declared(`@types/${dependency}`))
  )
    fail(file, `Undeclared dependency ${dependency}.`);
}

// A TypeScript node that carries only type syntax. Everything below it is a
// type position. The listed nodes are value expressions that hold a type in one
// of their children, so the walk continues into them normally.
const typeValueNodes = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'TSTypeAssertion',
  'TSImportEqualsDeclaration',
  'TSExternalModuleReference',
  'TSExportAssignment',
  'TSParameterProperty',
]);
/** @param {string} type @returns {boolean} */
const isTypeNode = (type) => type.startsWith('TS') && !typeValueNodes.has(type);

/**
 * @typedef {(
 *   node: Record<string, unknown>,
 *   parent: Record<string, unknown> | null,
 *   key: string,
 *   inType: boolean,
 * ) => void} Visitor
 */
/**
 * @param {unknown} value
 * @param {Visitor} visit
 * @param {Record<string, unknown> | null} [parent]
 * @param {string} [key]
 * @param {boolean} [inType]
 */
function walk(value, visit, parent = null, key = '', inType = false) {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, parent, key, inType);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const node = record(value);
  const type = typeof node.type === 'string' ? node.type : '';
  if (!type) {
    for (const [name, child] of Object.entries(node))
      walk(child, visit, parent, name, inType);
    return;
  }
  visit(node, parent, key, inType);
  const nested = inType || isTypeNode(type);
  for (const [name, child] of Object.entries(node))
    walk(child, visit, node, name, nested);
}

const transportNames = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
]);
// A transport name in value position is a usable reference, so an alias such as
// `const send = fetch` is handwritten traffic too. A property key, a member
// property, a type position, an import or export name, and a declared name are
// not references to the global transport.
/**
 * @param {Record<string, unknown> | null} parent
 * @param {string} key
 * @param {boolean} inType
 * @returns {boolean}
 */
function isValueReference(parent, key, inType) {
  if (inType || parent === null) return false;
  const type = String(parent.type);
  const computed = parent.computed === true;
  if (type === 'MemberExpression' && key === 'property' && !computed)
    return false;
  if (
    ['Property', 'PropertyDefinition', 'MethodDefinition'].includes(type) &&
    key === 'key' &&
    !computed
  )
    return false;
  if (type.endsWith('Specifier')) return false;
  if (['id', 'params', 'label'].includes(key)) return false;
  // A call or new expression reports its own message below.
  if (['CallExpression', 'NewExpression'].includes(type) && key === 'callee')
    return false;
  return true;
}

const sources = (
  await Promise.all(
    ['apps', 'packages', 'tools', 'tests/integration'].map((folder) =>
      filesIn(resolve(directory, folder)),
    ),
  )
)
  .flat()
  .filter((file) => /\.(?:[cm]?[jt]s|tsx|jsx)$/.test(file));
for (const file of sources) {
  const path = relative(directory, file).split(sep).join('/');
  const isGenerated = generated.some((prefix) => path.startsWith(prefix));
  const isTest = isTestPath(path);
  const item = owner(file);
  // Application code owns the generated HTTP boundary. The repository-root
  // `tests/` tree is application test code, so the transport rules apply there
  // too: a test calls a generated operation or the framework's in-process
  // inject utility, never a transport by hand. Only the generator workspace is
  // outside this rule, because it produces the boundary rather than using it.
  const isApplication =
    (Boolean(item) && item?.manifest.name !== '@notesapp/sdk-codegen') ||
    path.startsWith('tests/');
  const protocol = protocolFiles.has(path);
  const asset = assetFiles.has(path);
  const clientConfig = clientConfigFiles.has(path);
  if (isTest && !isTestLocation(file, path))
    fail(
      file,
      'Test files must live under a package src tree or the root tests tree.',
    );
  const contents = await readFile(file, 'utf8');
  // A storage-browser source file stays small so the split local store cannot
  // collapse back into one file (decision 0018). Tests are exempt.
  if (
    !isTest &&
    path.startsWith(storageBrowserSourcePrefix) &&
    contents.split('\n').length > storageBrowserLineCap
  )
    fail(
      file,
      `A storage-browser source file must stay under ${storageBrowserLineCap} lines (decision 0018). Split it into an area module of packages/storage-browser/src/local-store/.`,
    );
  // A workspace-store source file stays small so the split store cannot
  // collapse back into one file (decision 0018). Tests are exempt.
  if (
    !isTest &&
    path.startsWith(workspaceStoreSourcePrefix) &&
    contents.split('\n').length > workspaceStoreLineCap
  )
    fail(
      file,
      `A workspace-store source file must stay under ${workspaceStoreLineCap} lines (decision 0018). Split it into a repository or a shared helper of packages/storage-server/src/workspace-store/.`,
    );
  // An apps/web feature source file stays small so a split feature cannot
  // collapse back into one file (decision 0018). Tests are exempt.
  if (
    !isTest &&
    path.startsWith(featuresSourcePrefix) &&
    contents.split('\n').length > featuresLineCap
  )
    fail(
      file,
      `An apps/web feature source file must stay under ${featuresLineCap} lines (decision 0018). Move a concern into a sibling module or a per-feature directory of ${featuresSourcePrefix}.`,
    );
  const parsed = parseSync(file, contents);
  if (parsed.errors.length) {
    fail(file, 'Source must parse before boundary validation.');
    continue;
  }
  walk(parsed.program, (node, parent, key, inType) => {
    const type = String(node.type);
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
        'ImportExpression',
        'TSImportType',
      ].includes(type)
    ) {
      const source = record(node.source ?? node.argument);
      // `import type`, `export type`, and a type-position `import(...)` load
      // nothing at run time. Every other form does.
      const isTypeOnly =
        type === 'TSImportType' ||
        node.importKind === 'type' ||
        node.exportKind === 'type';
      if (typeof source.value === 'string')
        checkImport(file, source.value, isTest, isGenerated, isTypeOnly);
      else if (type === 'ImportExpression' && !indexLoaderFiles.has(path))
        fail(file, 'Dynamic imports must use a literal path.');
    }
    // TypeScript `import name = require('module')` is an import too.
    if (type === 'TSImportEqualsDeclaration') {
      const reference = record(node.moduleReference);
      if (reference.type === 'TSExternalModuleReference') {
        const expression = record(reference.expression);
        if (typeof expression.value === 'string')
          checkImport(
            file,
            expression.value,
            isTest,
            isGenerated,
            node.importKind === 'type',
          );
        else
          fail(file, 'import = require(...) must use a literal module path.');
      }
    }
    if (type === 'CallExpression' && record(node.callee).name === 'require') {
      const argumentsList = node.arguments;
      const source = Array.isArray(argumentsList)
        ? record(argumentsList[0])
        : {};
      if (typeof source.value === 'string')
        checkImport(file, source.value, isTest, isGenerated);
      else fail(file, 'require must use a literal module path.');
    }
    // A bare pool has no listener for the error of an idle client, which
    // stops the process, and its end resolves before its sockets close.
    // `openPool` of `packages/storage-server/src/pool.ts` answers both, so it
    // is the one place that constructs a pool.
    if (
      type === 'NewExpression' &&
      !isTest &&
      relative(directory, file).split(sep).join('/') !==
        'packages/storage-server/src/pool.ts'
    ) {
      const target = record(node.callee);
      const named =
        target.name === 'Pool' ||
        (String(target.type) === 'MemberExpression' &&
          record(target.property).name === 'Pool');
      if (named)
        fail(file, 'Open a connection pool with openPool of storage-server.');
    }
    if (!isApplication || isGenerated) return;
    const callee = String(record(node.callee).name);
    if (
      ['CallExpression', 'NewExpression'].includes(type) &&
      !protocol &&
      !asset
    ) {
      // A bare call, and a member call such as `globalThis.fetch(...)` or
      // `new self.WebSocket(...)`.
      const target = record(node.callee);
      const property = record(target.property);
      const name = transportNames.has(callee)
        ? callee
        : String(target.type) === 'MemberExpression' &&
            target.computed !== true &&
            String(property.type) === 'Identifier' &&
            transportNames.has(String(property.name))
          ? String(property.name)
          : '';
      if (name)
        fail(
          file,
          `Handwritten ${name} is outside the generated HTTP boundary.`,
        );
    }
    // The client configuration may pass a transport implementation on, so a
    // reference is accepted there. A call from it is not.
    // Destructuring renames a transport: `const { fetch: send } = globalThis`.
    // The pattern key is the reference, so the object literal rule above cannot
    // see it. An object literal such as `{ fetch: value }` stays accepted.
    if (type === 'ObjectPattern' && !protocol && !asset && !clientConfig) {
      const properties = Array.isArray(node.properties) ? node.properties : [];
      for (const entry of properties) {
        const property = record(entry);
        if (String(property.type) !== 'Property' || property.computed === true)
          continue;
        const propertyKey = record(property.key);
        const name =
          String(propertyKey.type) === 'Identifier'
            ? String(propertyKey.name)
            : typeof propertyKey.value === 'string'
              ? propertyKey.value
              : '';
        if (transportNames.has(name))
          fail(
            file,
            `Transport reference ${name} is outside the generated HTTP boundary.`,
          );
      }
    }
    // `Reflect.get(globalThis, 'fetch')` reaches the same transport.
    if (type === 'CallExpression' && !protocol && !asset && !clientConfig) {
      const target = record(node.callee);
      const property = record(target.property);
      const argumentsList = Array.isArray(node.arguments) ? node.arguments : [];
      const second = record(argumentsList[1]);
      if (
        String(target.type) === 'MemberExpression' &&
        target.computed !== true &&
        String(record(target.object).name) === 'Reflect' &&
        String(property.name) === 'get' &&
        typeof second.value === 'string' &&
        transportNames.has(second.value)
      )
        fail(file, 'Computed HTTP transport access is forbidden.');
    }
    if (
      type === 'Identifier' &&
      transportNames.has(String(node.name)) &&
      isValueReference(parent, key, inType) &&
      !protocol &&
      !asset &&
      !clientConfig
    )
      fail(
        file,
        `Transport reference ${String(node.name)} is outside the generated HTTP boundary.`,
      );
    if (
      type === 'MemberExpression' &&
      record(node.property).type === 'Literal' &&
      ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].includes(
        String(record(node.property).value),
      ) &&
      !protocol &&
      !asset &&
      !clientConfig
    )
      fail(file, 'Computed HTTP transport access is forbidden.');
    if (
      type === 'NewExpression' &&
      ['URL', 'URLSearchParams'].includes(callee) &&
      ['@notesapp/web', '@notesapp/sync', '@notesapp/api-client'].includes(
        String(item?.manifest.name),
      ) &&
      !protocol &&
      !asset &&
      !clientConfig
    )
      fail(file, 'Application URL construction belongs in generated output.');
    if (
      asset &&
      type === 'Literal' &&
      typeof node.value === 'string' &&
      /(?:^|\/)api(?:\/|$)/.test(node.value)
    )
      fail(file, 'The asset worker cannot cache application API paths.');
  });
}
// A browser package must stay browser-safe through every workspace package it
// imports, not only in its own files.
for (const item of packages) {
  const name = String(item.manifest.name);
  if (!browser.has(short(name))) continue;
  const seen = new Set([name]);
  /** @type {string[][]} */
  const queue = [[name]];
  while (queue.length) {
    const chain = queue.shift();
    const current = chain?.at(-1);
    if (!chain || current === undefined) break;
    const blocker = nodeUse.get(current);
    if (blocker !== undefined && chain.length > 1)
      failures.push(
        `${name}: Browser package reaches ${blocker} through ${chain.join(' -> ')}.`,
      );
    for (const next of graph.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...chain, next]);
    }
  }
}
/** @type {Set<string>} */
const done = new Set();
/** @param {string} name @param {string[]} chain */
function visit(name, chain) {
  if (chain.includes(name)) {
    failures.push(`Package cycle: ${[...chain, name].join(' -> ')}`);
    return;
  }
  if (done.has(name)) return;
  for (const dependency of graph.get(name) ?? []) {
    if (!graph.has(dependency))
      failures.push(`${name}: Missing workspace ${dependency}.`);
    else visit(dependency, [...chain, name]);
  }
  done.add(name);
}
for (const name of graph.keys()) visit(name, []);
if (failures.length) {
  process.stderr.write(`${[...new Set(failures)].join('\n')}\n`);
  process.exitCode = 1;
} else
  process.stdout.write(
    `Boundary checks passed for ${packages.length} packages and ${sources.length} source files.\n`,
  );
