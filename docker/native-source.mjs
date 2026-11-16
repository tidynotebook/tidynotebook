/** Read only a hash-checked archive from the pinned native source inventory. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeInputs } from './native-inputs.mjs';

const [url] = process.argv.slice(2);
const manifest = await nativeInputs();
const row = manifest.sources.find((source) => source.url === url);
if (!row) throw new Error(`Unlisted native build input: ${url}`);
const bytes = await readFile(join('/sources', row.file));
if (createHash('sha256').update(bytes).digest('hex') !== row.sha256)
  throw new Error(`Native build input hash differs: ${row.file}`);
process.stdout.write(bytes);
