/** Keep the exact preferred source, build scripts and patches of libvips. */
import { createHash } from 'node:crypto';
import { get } from 'node:https';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { readJson, record, root } from './workspace.mjs';

export const nativeSourceDownloadDefaults = Object.freeze({
  connectTimeoutMs: 30_000,
  idleTimeoutMs: 30_000,
  requestTimeoutMs: 300_000,
  retryDelaysMs: Object.freeze([2_000, 5_000, 10_000]),
});

/** @typedef {{connectTimeoutMs?:number, idleTimeoutMs?:number, requestTimeoutMs?:number, retryDelaysMs?:readonly number[], agent?:import('node:https').Agent}} DownloadOptions */

class DownloadFailure extends Error {
  /** @param {string} message @param {boolean} retryable */
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

const networkCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ERR_STREAM_PREMATURE_CLOSE',
]);

/** @param {string} url @param {DownloadOptions} options @returns {Promise<{kind:'redirect',location:string}|{kind:'bytes',bytes:Uint8Array}>} */
async function sourceRequest(url, options) {
  const bounds = { ...nativeSourceDownloadDefaults, ...options };
  /** @type {NodeJS.Timeout | undefined} */
  let idleTimer;
  /** @type {NodeJS.Timeout | undefined} */
  let connectTimer;
  /** @type {NodeJS.Timeout | undefined} */
  let requestTimer;
  try {
    return await new Promise((resolve, reject) => {
      const request = get(
        url,
        {
          headers: { 'User-Agent': 'tidy-notebook-source-builder' },
          ...(options.agent ? { agent: options.agent } : {}),
        },
        (response) => {
          clearTimeout(connectTimer);
          response.on('error', reject);
          if (
            response.statusCode !== undefined &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location !== undefined
          ) {
            response.destroy();
            resolve({ kind: 'redirect', location: response.headers.location });
            return;
          }
          if (response.statusCode !== 200) {
            response.destroy();
            reject(
              new DownloadFailure(
                `HTTP ${response.statusCode}.`,
                response.statusCode !== undefined &&
                  response.statusCode >= 500 &&
                  response.statusCode <= 599,
              ),
            );
            return;
          }
          function resetIdleTimer() {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(
              () =>
                request.destroy(
                  new DownloadFailure(
                    'The body idle time limit is reached.',
                    true,
                  ),
                ),
              bounds.idleTimeoutMs,
            );
          }
          /** @type {Buffer[]} */
          const chunks = [];
          resetIdleTimer();
          response.on('data', (chunk) => {
            chunks.push(chunk);
            resetIdleTimer();
          });
          response.on('end', () =>
            resolve({ kind: 'bytes', bytes: Buffer.concat(chunks) }),
          );
        },
      );
      request.on('error', reject);
      connectTimer = setTimeout(
        () =>
          request.destroy(
            new DownloadFailure('The connection and headers time out.', true),
          ),
        bounds.connectTimeoutMs,
      );
      requestTimer = setTimeout(
        () =>
          request.destroy(
            new DownloadFailure('The request time limit is reached.', true),
          ),
        bounds.requestTimeoutMs,
      );
    });
  } finally {
    clearTimeout(connectTimer);
    clearTimeout(idleTimer);
    clearTimeout(requestTimer);
  }
}

/** @param {Uint8Array} bytes @param {string} expected */
export function sourceMatches(bytes, expected) {
  return createHash('sha256').update(bytes).digest('hex') === expected;
}

/** @param {unknown} value @returns {{file:string, url:string, sha256:string}[]} */
export function sourceRows(value) {
  if (!Array.isArray(value))
    throw new Error('The native source list is missing.');
  /** @type {Set<string>} */
  const files = new Set();
  return value.map((value) => {
    const row = record(value);
    if (
      typeof row.file !== 'string' ||
      !/^[\w.+~-]+$/.test(row.file) ||
      ['.', '..', 'manifest.json'].includes(row.file) ||
      files.has(row.file) ||
      typeof row.url !== 'string' ||
      !row.url.startsWith('https://') ||
      typeof row.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(row.sha256)
    )
      throw new Error('A native source row is invalid.');
    files.add(row.file);
    return { file: row.file, url: row.url, sha256: row.sha256 };
  });
}

/** @param {string} url @param {DownloadOptions} options @param {number} [redirects] @returns {Promise<Uint8Array>} */
async function sourceBytes(url, options, redirects = 0) {
  if (!url.startsWith('https://') || redirects > 8)
    throw new Error('A native source redirect is invalid.');
  const response = await sourceRequest(url, options);
  if (response.kind === 'redirect') {
    return sourceBytes(
      new URL(response.location, url).href,
      options,
      redirects + 1,
    );
  }
  return response.bytes;
}

/** @param {{file:string,url:string}} row @param {DownloadOptions} options */
async function downloadBytes(row, options) {
  const delays =
    options.retryDelaysMs ?? nativeSourceDownloadDefaults.retryDelaysMs;
  for (let attempt = 0; ; attempt++) {
    try {
      return await sourceBytes(row.url, options);
    } catch (error) {
      const code = record(error).code;
      const retryable =
        error instanceof DownloadFailure
          ? error.retryable
          : typeof code === 'string' && networkCodes.has(code);
      const delay = delays[attempt];
      if (!retryable || delay === undefined) {
        const cause =
          error instanceof Error ? error.message : 'The request fails.';
        const detail = typeof code === 'string' ? `${code}: ${cause}` : cause;
        const attempts = attempt + 1;
        throw new Error(
          `The native source download fails: ${row.file} from ${new URL(row.url).host} after ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}. ${detail}`,
          { cause: error },
        );
      }
      await wait(delay);
    }
  }
}

/** @param {string} output @param {string} [cache] @param {string} [manifestFile] @param {DownloadOptions} [options] */
export async function prepareNativeSources(
  output,
  cache,
  manifestFile = join(root, 'tools/native-sources.json'),
  options = {},
) {
  const manifest = await readJson(manifestFile);
  const rows = sourceRows(manifest.sources);
  await mkdir(output, { recursive: true });
  /** @param {{file:string, url:string, sha256:string}} row */
  async function download(row) {
    let bytes;
    if (cache !== undefined) bytes = await readFile(join(cache, row.file));
    else bytes = await downloadBytes(row, options);
    if (!sourceMatches(bytes, row.sha256))
      throw new Error(`The native source hash differs: ${row.file}.`);
    const temporary = join(output, `${row.file}.partial`);
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, join(output, row.file));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  for (let offset = 0; offset < rows.length; offset += 6)
    await Promise.all(rows.slice(offset, offset + 6).map(download));
  await writeFile(
    join(output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = process.argv[2];
  if (output === undefined) throw new Error('Give the native source folder.');
  await prepareNativeSources(
    resolve(output),
    process.argv[3] || undefined,
    process.argv[4],
  );
}
