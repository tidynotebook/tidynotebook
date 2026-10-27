/** Enforces the compressed JavaScript budget of the built first screen. */
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstScreenScripts } from './first-route.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'apps/web/dist/web');
// The JavaScript share of the 3-second critical-path budget for a JS-heavy
// page in The Performance Inequality Gap, 2026 (Alex Russell): a P75 phone on
// a 9 Mbps link reads 0.62 MiB of compressed JavaScript (record 0136). No
// budget may pass it.
const ceilingBytes = Math.floor(0.62 * 1024 * 1024);
// The first screen as record 0177 left it, with a margin of about one
// twentieth, so a change that grows the first screen states its reason in a
// change of this line (record 0177). The 256 bytes over 300 KiB are for
// issue 517: the first screen came within 2 bytes of the budget, and a
// change of the stylesheet alone moved it 12 to 29 bytes through the
// content hashes in the chunk names.
const budgetBytes = Math.min(ceilingBytes, 300 * 1024 + 256);
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
  status: gzipBytes <= budgetBytes ? 'pass' : 'fail',
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status === 'fail') process.exitCode = 1;
