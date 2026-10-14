import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The fixtures below are disposable trees under the system temporary
// directory. They are never committed as application code.
const checker = fileURLToPath(
  new URL('./check-boundaries.mjs', import.meta.url),
);

/**
 * @param {string} name
 * @param {Record<string, string>} [dependencies]
 * @param {Record<string, string>} [devDependencies]
 * @returns {string}
 */
function manifest(name, dependencies = {}, devDependencies = {}) {
  return JSON.stringify({
    name: `@notesapp/${name}`,
    private: true,
    exports: { '.': './src/index.ts' },
    scripts: {
      typecheck: 'tsc -p tsconfig.json',
      build: 'tsc -p tsconfig.json',
      'test:unit': 'node ../../tools/run-tests.mjs unit',
    },
    dependencies,
    devDependencies,
  });
}

/**
 * @param {Record<string, string>} files
 * @returns {{ status: number; output: string }}
 */
function check(files) {
  const directory = mkdtempSync(join(tmpdir(), 'notesapp-boundaries-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const file = join(directory, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const result = spawnSync(process.execPath, [checker, '--root', directory], {
      encoding: 'utf8',
    });
    return {
      status: result.status ?? 1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** @param {Record<string, string>} extra @returns {Record<string, string>} */
const workspace = (extra) => ({
  'packages/core/package.json': manifest('core'),
  'packages/core/src/index.ts': 'export const domain = "core";\n',
  ...extra,
});

/** @param {{ status: number; output: string }} result */
const accepted = (result) => {
  assert.equal(result.status, 0, result.output);
  assert.ok(result.output.includes('Boundary checks passed'), result.output);
};

/** @param {{ status: number; output: string }} result @param {string} reason */
const rejected = (result, reason) => {
  assert.equal(result.status, 1, result.output);
  assert.ok(result.output.includes(reason), result.output);
};

await test('accepts a browser-safe workspace', () => {
  accepted(
    check(
      workspace({
        'packages/sync/package.json': manifest('sync', {
          '@notesapp/core': 'workspace:*',
        }),
        'packages/sync/src/index.ts':
          "import { domain } from '@notesapp/core';\nexport const queue = domain;\n",
      }),
    ),
  );
});

await test('accepts Node test modules in recognized test files', () => {
  accepted(
    check(
      workspace({
        'packages/core/src/domain.test.ts':
          "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { domain } from './index.ts';\ntest('domain', () => assert.equal(domain, 'core'));\n",
        'packages/sync/package.json': manifest('sync', {
          '@notesapp/core': 'workspace:*',
        }),
        'packages/sync/src/index.ts': 'export const queue = 1;\n',
        'packages/sync/src/queue.test.ts':
          "import test from 'node:test';\nimport assert from 'node:assert';\nawait test('queue', () => assert.ok(true));\n",
      }),
    ),
  );
});

await test('rejects other Node modules in test files', () => {
  rejected(
    check(
      workspace({
        'packages/core/src/domain.test.ts':
          "import { readFile } from 'node:fs/promises';\nexport const read = readFile;\n",
      }),
    ),
    'Browser source cannot import node:fs/promises.',
  );
});

await test('rejects a Node built-in module in core', () => {
  rejected(
    check(
      workspace({
        'packages/core/src/index.ts':
          "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n",
      }),
    ),
    'Browser source cannot import node:fs.',
  );
});

await test('rejects a bare Node built-in name in a browser package', () => {
  rejected(
    check(
      workspace({
        'packages/ui/package.json': manifest('ui'),
        'packages/ui/src/index.ts':
          "import { join } from 'path';\nexport const path = join;\n",
      }),
    ),
    'Browser source cannot import path.',
  );
});

await test('rejects Node reach through a workspace package', () => {
  const result = check(
    workspace({
      'packages/core/src/index.ts':
        "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n",
      'packages/sync/package.json': manifest('sync', {
        '@notesapp/core': 'workspace:*',
      }),
      'packages/sync/src/index.ts':
        "import { read } from '@notesapp/core';\nexport const queue = read;\n",
      'apps/web/package.json': manifest('web', {
        '@notesapp/sync': 'workspace:*',
      }),
      'apps/web/src/index.ts':
        "import { queue } from '@notesapp/sync';\nexport const app = queue;\n",
    }),
  );
  rejected(
    result,
    '@notesapp/web: Browser package reaches Node module node:fs through @notesapp/web -> @notesapp/sync -> @notesapp/core.',
  );
  assert.ok(
    result.output.includes(
      '@notesapp/sync: Browser package reaches Node module node:fs through @notesapp/sync -> @notesapp/core.',
    ),
    result.output,
  );
});

await test('rejects a server-only dependency reached by a browser package', () => {
  rejected(
    check(
      workspace({
        'packages/core/package.json': manifest('core', { pg: '8.23.0' }),
      }),
    ),
    'Browser runtime cannot depend on pg.',
  );
});

await test('rejects a Pino import outside the server logging adapter', () => {
  rejected(
    check(
      workspace({
        'apps/server/package.json': manifest('server', { pino: '10.1.0' }),
        'apps/server/src/app.ts':
          "import pino from 'pino';\nexport const logger = pino();\n",
      }),
    ),
    'Pino belongs in the shared logging package or the server sink adapter.',
  );
});

await test('rejects a forbidden core dependency in any group', () => {
  rejected(
    check(
      workspace({
        'packages/core/package.json': manifest('core', {}, { react: '19.2.8' }),
      }),
    ),
    'Core cannot depend on react.',
  );
});

await test('rejects import equals require of a Node module', () => {
  rejected(
    check(
      workspace({
        'packages/core/src/index.ts':
          "import fs = require('node:fs');\nexport const read = fs.readFileSync;\n",
      }),
    ),
    'Browser source cannot import node:fs.',
  );
});

await test('rejects a deep import through import equals require', () => {
  rejected(
    check(
      workspace({
        'packages/markdown/package.json': manifest('markdown', {
          '@notesapp/core': 'workspace:*',
        }),
        'packages/markdown/src/index.ts':
          "import internal = require('@notesapp/core/src/private.js');\nexport const parse = internal;\n",
      }),
    ),
    'Deep import @notesapp/core/src/private.js is forbidden.',
  );
});

await test('rejects a production import of a test file', () => {
  rejected(
    check(
      workspace({
        'packages/core/src/index.ts':
          "export { helper } from './domain.test.ts';\n",
        'packages/core/src/domain.test.ts': 'export const helper = 1;\n',
      }),
    ),
    'Production source cannot import test file ./domain.test.ts.',
  );
});

await test('rejects a deep import', () => {
  rejected(
    check(
      workspace({
        'packages/markdown/package.json': manifest('markdown', {
          '@notesapp/core': 'workspace:*',
        }),
        'packages/markdown/src/index.ts':
          "export { domain } from '@notesapp/core/src/index.js';\n",
      }),
    ),
    'Deep import @notesapp/core/src/index.js is forbidden.',
  );
});

await test('rejects a browser import of a Node module', () => {
  rejected(
    check(
      workspace({
        'packages/storage-browser/package.json': manifest('storage-browser'),
        'packages/storage-browser/src/index.ts':
          "import { createHash } from 'node:crypto';\nexport const digest = createHash;\n",
      }),
    ),
    'Browser source cannot import node:crypto.',
  );
});

await test('accepts a Node module in a named build file', () => {
  accepted(
    check(
      workspace({
        'apps/web/package.json': manifest('web'),
        'apps/web/src/index.ts': 'export const screen = 1;\n',
        'apps/web/src/pwa/precache.ts':
          "import { createHash } from 'node:crypto';\nexport const digest = createHash;\n",
      }),
    ),
  );
});

await test('rejects a Node module in a browser file beside a build file', () => {
  rejected(
    check(
      workspace({
        'apps/web/package.json': manifest('web'),
        'apps/web/src/pwa/lifecycle.ts':
          "import { createHash } from 'node:crypto';\nexport const digest = createHash;\n",
      }),
    ),
    'Browser source cannot import node:crypto.',
  );
});

await test('rejects a handwritten fetch call', () => {
  rejected(
    check(
      workspace({
        'apps/web/package.json': manifest('web'),
        'apps/web/src/index.ts':
          "export const load = async () => fetch('/files');\n",
      }),
    ),
    'Handwritten fetch is outside the generated HTTP boundary.',
  );
});

await test('rejects computed transport access', () => {
  rejected(
    check(
      workspace({
        'apps/web/package.json': manifest('web'),
        'apps/web/src/index.ts':
          "export const transport = globalThis['fetch'];\n",
      }),
    ),
    'Computed HTTP transport access is forbidden.',
  );
});

await test('rejects a relative import that leaves a package', () => {
  rejected(
    check(
      workspace({
        'packages/sync/package.json': manifest('sync'),
        'packages/sync/src/index.ts':
          "export * from '../../core/src/index.ts';\n",
      }),
    ),
    'Relative or absolute imports cannot leave a package.',
  );
});

await test('accepts a test that reads the shared Markdown test data', () => {
  accepted(
    check(
      workspace({
        'packages/markdown/package.json': manifest('markdown'),
        'packages/markdown/src/index.ts': 'export const grammar = 1;\n',
        'packages/markdown/test-data/content.ts':
          'export const corpusMarkdown = "# A";\n',
        'packages/editor/package.json': manifest('editor', {
          '@notesapp/markdown': 'workspace:*',
        }),
        'packages/editor/src/index.ts': 'export const editor = 1;\n',
        'packages/editor/src/index.test.ts':
          "import { corpusMarkdown } from '../../markdown/test-data/content.ts';\nexport const read = corpusMarkdown;\n",
      }),
    ),
  );
});

await test('rejects production source that reads the shared test data', () => {
  rejected(
    check(
      workspace({
        'packages/markdown/package.json': manifest('markdown'),
        'packages/markdown/src/index.ts': 'export const grammar = 1;\n',
        'packages/markdown/test-data/content.ts':
          'export const corpusMarkdown = "# A";\n',
        'packages/editor/package.json': manifest('editor', {
          '@notesapp/markdown': 'workspace:*',
        }),
        'packages/editor/src/index.ts':
          "export { corpusMarkdown } from '../../markdown/test-data/content.ts';\n",
      }),
    ),
    'Relative or absolute imports cannot leave a package.',
  );
});

await test('rejects a package cycle', () => {
  rejected(
    check(
      workspace({
        'packages/core/package.json': manifest('core', {
          '@notesapp/markdown': 'workspace:*',
        }),
        'packages/markdown/package.json': manifest('markdown', {
          '@notesapp/core': 'workspace:*',
        }),
        'packages/markdown/src/index.ts': 'export const parse = 1;\n',
      }),
    ),
    'Package cycle:',
  );
});

await test('rejects a computed dynamic import', () => {
  rejected(
    check(
      workspace({
        'packages/core/src/index.ts':
          'export const load = (name: string) => import(name);\n',
      }),
    ),
    'Dynamic imports must use a literal path.',
  );
});

await test('rejects a computed require call', () => {
  rejected(
    check(
      workspace({
        'packages/core/src/index.ts':
          'declare const require: (name: string) => unknown;\nexport const load = (name: string) => require(name);\n',
      }),
    ),
    'require must use a literal module path.',
  );
});

await test('accepts the generated client transport', () => {
  accepted(
    check(
      workspace({
        'packages/api-client/package.json': manifest('api-client', {
          '@hey-api/client-fetch': '0.99.0',
        }),
        'packages/api-client/src/index.ts':
          "export { client } from './generated/client.gen.ts';\n",
        'packages/api-client/src/generated/client.gen.ts':
          "import { createClient } from '@hey-api/client-fetch';\nexport const client = createClient({ send: (url: string) => fetch(url) });\n",
      }),
    ),
  );
});

await test('rejects an HTTP library outside generated output', () => {
  rejected(
    check(
      workspace({
        'packages/api-client/package.json': manifest('api-client', {
          '@hey-api/client-fetch': '0.99.0',
        }),
        'packages/api-client/src/index.ts':
          "import { createClient } from '@hey-api/client-fetch';\nexport const client = createClient({});\n",
      }),
    ),
    'Use generated operations instead of @hey-api/client-fetch.',
  );
});

await test('rejects a WebSocket library outside a named adapter file', () => {
  for (const library of ['partysocket', 'ws', '@fastify/websocket']) {
    rejected(
      check(
        workspace({
          'apps/web/package.json': manifest('web', { [library]: '1.0.0' }),
          'apps/web/src/index.ts': `import socket from '${library}';\nexport const open = socket;\n`,
        }),
      ),
      `Use the generated socket entry instead of ${library}`,
    );
  }
});

await test('accepts a property or type named fetch', () => {
  accepted(
    check(
      workspace({
        'apps/web/package.json': manifest('web'),
        'apps/web/src/index.ts':
          'export type Transport = { fetch?: typeof fetch };\nexport type Global = typeof globalThis.fetch;\nexport const options = { fetch: undefined };\n',
      }),
    ),
  );
});

await test('rejects a new transport object', () => {
  rejected(
    check(
      workspace({
        'apps/web/package.json': manifest('web'),
        'apps/web/src/index.ts':
          "export const live = () => new WebSocket('/events');\n",
      }),
    ),
    'Handwritten WebSocket is outside the generated HTTP boundary.',
  );
});

await test('accepts base URL and transport options in the client configuration', () => {
  accepted(
    check(
      workspace({
        'packages/api-client/package.json': manifest('api-client'),
        'packages/api-client/src/index.ts':
          "export { configure } from './configure.ts';\n",
        'packages/api-client/src/configure.ts':
          "export const configure = (base: string) => ({\n  url: new URL(base),\n  send: globalThis['fetch'],\n  fetch,\n});\n",
      }),
    ),
  );
});

await test('rejects a fetch call in the client configuration', () => {
  rejected(
    check(
      workspace({
        'packages/api-client/package.json': manifest('api-client'),
        'packages/api-client/src/index.ts':
          "export { configure } from './configure.ts';\n",
        'packages/api-client/src/configure.ts':
          'export const configure = (base: string) => fetch(base);\n',
      }),
    ),
    'Handwritten fetch is outside the generated HTTP boundary.',
  );
});

await test('rejects a Fastify plugin in a browser package', () => {
  rejected(
    check(
      workspace({
        'packages/ui/package.json': manifest('ui', {
          '@fastify/cors': '11.1.0',
        }),
      }),
    ),
    'Browser runtime cannot depend on @fastify/cors.',
  );
});

await test('rejects Node test modules outside a recognized test file', () => {
  rejected(
    check(
      workspace({
        'packages/sync/package.json': manifest('sync'),
        'packages/sync/src/index.ts': 'export const queue = 1;\n',
        'packages/sync/tests/support.ts':
          "import test from 'node:test';\nexport const runner = test;\n",
      }),
    ),
    'Browser source cannot import node:test.',
  );
});

await test('rejects a test file outside a runnable tree', () => {
  rejected(
    check(
      workspace({
        'packages/sync/package.json': manifest('sync'),
        'packages/sync/src/index.ts': 'export const queue = 1;\n',
        'packages/sync/tests/queue.test.ts':
          "import test from 'node:test';\nawait test('queue', () => undefined);\n",
      }),
    ),
    'Test files must live under a package src tree or the root tests tree.',
  );
});

/** @param {string} body @returns {{ status: number; output: string }} */
const webSource = (body) =>
  check(
    workspace({
      'apps/web/package.json': manifest('web'),
      'apps/web/src/index.ts': body,
    }),
  );

await test('rejects a global object transport call', () => {
  rejected(
    webSource("export const load = () => globalThis.fetch('/files');\n"),
    'Handwritten fetch is outside the generated HTTP boundary.',
  );
});

await test('rejects a window transport call', () => {
  rejected(
    webSource("export const load = () => window.fetch('/files');\n"),
    'Handwritten fetch is outside the generated HTTP boundary.',
  );
});

await test('rejects a worker scope transport call', () => {
  rejected(
    webSource("export const load = () => self.fetch('/files');\n"),
    'Handwritten fetch is outside the generated HTTP boundary.',
  );
});

await test('rejects a transport alias', () => {
  rejected(
    webSource(
      "const send = fetch;\nexport const load = () => send('/files');\n",
    ),
    'Transport reference fetch is outside the generated HTTP boundary.',
  );
});

await test('rejects a member new transport expression', () => {
  rejected(
    webSource(
      "export const live = () => new globalThis.WebSocket('/events');\n",
    ),
    'Handwritten WebSocket is outside the generated HTTP boundary.',
  );
});

await test('accepts a transport name in a type query', () => {
  accepted(
    webSource(
      'export type Send = typeof globalThis.fetch;\nexport type Options = { fetch?: typeof fetch };\nexport const empty: Options = {};\n',
    ),
  );
});
await test('rejects a renamed destructured transport', () => {
  rejected(
    webSource(
      "const { fetch: send } = globalThis;\nexport const load = () => send('/files');\n",
    ),
    'Transport reference fetch is outside the generated HTTP boundary.',
  );
});

await test('rejects a renamed destructured transport constructor', () => {
  rejected(
    webSource(
      "const { WebSocket: Socket } = globalThis;\nexport const live = () => new Socket('/events');\n",
    ),
    'Transport reference WebSocket is outside the generated HTTP boundary.',
  );
});

await test('rejects a transport destructured from a dependency object', () => {
  rejected(
    webSource(
      "declare const deps: { fetch: (url: string) => Promise<unknown> };\nconst { fetch: send } = deps;\nexport const load = () => send('/files');\n",
    ),
    'Transport reference fetch is outside the generated HTTP boundary.',
  );
});

await test('rejects Reflect access to a transport', () => {
  rejected(
    webSource("export const send = Reflect.get(globalThis, 'fetch');\n"),
    'Computed HTTP transport access is forbidden.',
  );
});

await test('accepts a transport name as an object literal key', () => {
  accepted(
    webSource(
      'const value = 1;\nexport const counts = { fetch: 1 };\nexport const options = { fetch: value };\n',
    ),
  );
});

await test('rejects a fetch call in the root tests tree', () => {
  rejected(
    check(
      workspace({
        'tests/integration/contract.test.ts':
          "await fetch('http://127.0.0.1/api/health');\n",
      }),
    ),
    'Handwritten fetch is outside the generated HTTP boundary',
  );
});

await test('accepts an in-process inject call in the root tests tree', () => {
  accepted(
    check(
      workspace({
        'tests/integration/contract.test.ts':
          "import { domain } from '@notesapp/core';\nexport const probe = domain;\n",
      }),
    ),
  );
});

await test('accepts a type-only import declared by its @types package', () => {
  accepted(
    check({
      'packages/markdown/package.json': manifest('markdown', {
        '@types/mdast': '4.0.4',
      }),
      'packages/markdown/src/index.ts':
        "import type { Root } from 'mdast';\nexport type Tree = Root;\n",
    }),
  );
});

await test('accepts a type-only export declared by its @types package', () => {
  accepted(
    check({
      'packages/markdown/package.json': manifest('markdown', {
        '@types/mdast': '4.0.4',
      }),
      'packages/markdown/src/index.ts': "export type { Root } from 'mdast';\n",
    }),
  );
});

await test('rejects a runtime import declared only by its @types package', () => {
  rejected(
    check({
      'packages/markdown/package.json': manifest('markdown', {
        '@types/lodash': '4.17.20',
      }),
      'packages/markdown/src/index.ts':
        "import lodash from 'lodash';\nexport const value = lodash;\n",
    }),
    'Undeclared dependency lodash.',
  );
});

await test('rejects a mixed type and value import declared only by @types', () => {
  rejected(
    check({
      'packages/markdown/package.json': manifest('markdown', {
        '@types/lodash': '4.17.20',
      }),
      'packages/markdown/src/index.ts':
        "import { type Dictionary, chunk } from 'lodash';\nexport const value = chunk;\nexport type Map = Dictionary<string>;\n",
    }),
    'Undeclared dependency lodash.',
  );
});

/** A document package with the bridge entry, as record 0082 states it. */
const documentPackage = {
  'packages/note-document/package.json': JSON.stringify({
    ...JSON.parse(manifest('note-document', { yjs: '13.6.32' })),
    exports: {
      '.': './src/index.ts',
      './editor-bridge': './src/editor-bridge.ts',
    },
  }),
  'packages/note-document/src/index.ts':
    "import * as Y from 'yjs';\nexport const start = () => new Y.Doc();\n",
  'packages/note-document/src/editor-bridge.ts':
    "import * as Y from 'yjs';\nexport const text = () => new Y.Doc().getText('text');\n",
};

await test('accepts the editor reading the bridge and the binding', () => {
  accepted(
    check(
      workspace({
        ...documentPackage,
        'packages/editor/package.json': manifest('editor', {
          '@notesapp/note-document': 'workspace:*',
          'y-codemirror.next': '0.3.6',
          yjs: '13.6.32',
        }),
        'packages/editor/src/index.ts':
          "import type { Text } from 'yjs';\nimport { yCollab } from 'y-codemirror.next';\nimport { text } from '@notesapp/note-document/editor-bridge';\nexport const bind = (): Text => { void yCollab; return text(); };\n",
      }),
    ),
  );
});

await test('rejects the bridge outside the editor', () => {
  rejected(
    check(
      workspace({
        ...documentPackage,
        'packages/sync/package.json': manifest('sync', {
          '@notesapp/note-document': 'workspace:*',
        }),
        'packages/sync/src/index.ts':
          "export { text } from '@notesapp/note-document/editor-bridge';\n",
      }),
    ),
    'Only packages/editor reads the private editor bridge (record 0082).',
  );
});

await test('rejects a run time Yjs import outside the document package', () => {
  rejected(
    check(
      workspace({
        'packages/sync/package.json': manifest('sync', { yjs: '13.6.32' }),
        'packages/sync/src/index.ts':
          "import * as Y from 'yjs';\nexport const doc = new Y.Doc();\n",
      }),
    ),
    'Only packages/note-document imports yjs at run time (record 0082).',
  );
});

await test('rejects the CodeMirror binding outside the editor', () => {
  rejected(
    check(
      workspace({
        'apps/web/package.json': manifest('web', {
          'y-codemirror.next': '0.3.6',
        }),
        'apps/web/src/index.ts':
          "export { yCollab } from 'y-codemirror.next';\n",
      }),
    ),
    'Only packages/editor imports y-codemirror.next (record 0082).',
  );
});

await test('rejects a second entry point on any other package', () => {
  rejected(
    check(
      workspace({
        'packages/ui/package.json': JSON.stringify({
          ...JSON.parse(manifest('ui')),
          exports: { '.': './src/index.ts', './editor-bridge': './src/b.ts' },
        }),
        'packages/ui/src/index.ts': 'export const ui = 1;\n',
      }),
    ),
    'Expose only the public package entry point through exports["."].',
  );
});

await test('the client script of the docs site imports only its own folder', () => {
  const docs = (/** @type {string} */ source) =>
    check(
      workspace({
        'packages/markdown/package.json': manifest('markdown'),
        'packages/markdown/src/index.ts': 'export const md = 1;\n',
        'apps/docs/package.json': manifest('docs', {
          '@notesapp/markdown': 'workspace:*',
        }),
        'apps/docs/src/index.ts':
          "import { md } from '@notesapp/markdown';\nexport const site = md;\n",
        'apps/docs/src/client/rules.ts': 'export const rule = 1;\n',
        'apps/docs/src/client/docs.ts': source,
      }),
    );
  accepted(
    docs("import { rule } from './rules.ts';\nexport const a = rule;\n"),
  );
  rejected(
    docs("import { md } from '@notesapp/markdown';\nexport const a = md;\n"),
    'imports only modules of apps/docs/src/client/',
  );
  rejected(
    docs("import { site } from '../index.ts';\nexport const a = site;\n"),
    'imports only modules of apps/docs/src/client/',
  );
  rejected(
    docs("import { join } from 'node:path';\nexport const a = join;\n"),
    'imports only modules of apps/docs/src/client/',
  );
});

await test('the MCP SDK stays inside the server mcp directory', () => {
  const dependency = { '@modelcontextprotocol/server': '2.3.1' };
  const files = {
    'apps/server/package.json': manifest('server', dependency),
    'apps/server/src/mcp/protocol.ts':
      "import { createMcpHandler } from '@modelcontextprotocol/server';\nexport const handler = createMcpHandler;\n",
  };
  accepted(check(workspace(files)));
  for (const path of [
    'apps/server/src/routes/mcp.ts',
    'apps/server/src/auth/mcp.ts',
    'tests/integration/mcp.test.ts',
  ])
    rejected(
      check(
        workspace({
          ...files,
          [path]:
            "import type { Server } from '@modelcontextprotocol/server';\nexport type Service = Server;\n",
        }),
      ),
      'The MCP SDK belongs only in apps/server/src/mcp/',
    );
});

await test('only the named MCP protocol file can use the library transport', () => {
  const files = {
    'apps/server/package.json': manifest('server'),
    'apps/server/src/mcp/protocol.ts':
      'export const send = (handler, request) => handler.fetch(request);\n',
  };
  accepted(check(workspace(files)));
  rejected(
    check(
      workspace({
        ...files,
        'apps/server/src/mcp/registry.ts':
          'export const send = (handler, request) => handler.fetch(request);\n',
      }),
    ),
    'Handwritten fetch',
  );
});
