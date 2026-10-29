import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
/** Size declarations belong to the central role and note-rendering stylesheet. */
const allowed = new Map([
  [
    'apps/web/src/tailwind.css',
    'Defines shared type roles and the separate note rendering scale.',
  ],
]);
await test('UI source uses type roles instead of raw sizes', async () => {
  const root = resolve(import.meta.dirname, '..');
  /** @type {string[]} */
  const problems = [];
  /** @param {string} directory */
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(tsx?|css)$/.test(path) && !path.endsWith('.test.ts')) {
        const source = await readFile(path, 'utf8');
        const name = relative(root, path);
        if (allowed.has(name)) continue;
        if (
          /\btext-(?:xs|sm|base|lg)\b|\btext-\[[^\]]+\]|\bfontSize\s*:|font-size\s*:/.test(
            source,
          )
        )
          problems.push(name);
      }
    }
  }
  await visit(resolve(root, 'apps/web/src'));
  await visit(resolve(root, 'packages/ui/src'));
  assert.deepEqual(problems, []);
});
