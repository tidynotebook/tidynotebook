/** Enforces the compressed JavaScript budget of the built initial page. */
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstRouteScripts } from './first-route.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'apps/web/dist/web');
// The JavaScript share of the 3-second critical-path budget for a JS-heavy
// page in The Performance Inequality Gap, 2026 (Alex Russell): a P75 phone on
// a 9 Mbps link reads 0.62 MiB of compressed JavaScript (record 0136).
const budgetBytes = Math.floor(0.62 * 1024 * 1024);
const files = [];
let gzipBytes = 0;
for (const script of await firstRouteScripts(dist)) {
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
    'JavaScript referenced by script and modulepreload tags in index.html',
  files,
  gzipBytes,
  budgetBytes,
  status: gzipBytes <= budgetBytes ? 'pass' : 'fail',
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status === 'fail') process.exitCode = 1;
