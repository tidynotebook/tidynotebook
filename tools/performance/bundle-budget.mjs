/** Enforces the compressed JavaScript budget of the built first screen. */
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstScreenScripts } from './first-route.ts';
import {
  firstScreenCeilingBytes,
  firstScreenBudgetBytes,
  withinFirstScreenBudget,
} from './bundle-policy.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'apps/web/dist/web');
// Keep the existing first-screen measurement and compression unchanged.
const ceilingBytes = firstScreenCeilingBytes;
const budgetBytes = firstScreenBudgetBytes;
const files = [];
let gzipBytes = 0;
for (const script of await firstScreenScripts(dist)) {
  const compressed = gzipSync(script.bytes, { level: 9 }).byteLength;
  gzipBytes += compressed;
  files.push({ file: script.file, gzipBytes: compressed });
}

const report = {
  environment: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
  },
  sample:
    'JavaScript of index.html, of the frame and All notes, and of every chunk they import',
  files,
  gzipBytes,
  budgetBytes,
  ceilingBytes,
  status: withinFirstScreenBudget(gzipBytes) ? 'pass' : 'fail',
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status === 'fail') process.exitCode = 1;
