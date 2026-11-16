/**
 * Measures the reads of one workspace through the built server: the file
 * list, the read of a note, and search (issues 264 and 265).
 *
 * The run makes a disposable database, starts the built server as a child
 * process, and seeds one workspace through the production core and store:
 * 1000 notes of about 2 KB in 20 folders, one note of 50 KB and one of
 * 500 KB, which is the workspace of the audit of 2026-10-02. Every request
 * then goes through a generated operation over real HTTP.
 *
 * A case runs 20 requests to warm up, then 200 timed requests one after the
 * other, and the cases of the concurrent table run 4 seconds at 16
 * connections. The size of an answer is the `content-length` that the server
 * states, once with no compression and once with the encodings that a
 * browser accepts.
 *
 * Every number is a measured result to report on the issue, never in a
 * document. The run fails only when a request fails.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import {
  getAccount,
  getFile,
  listFiles,
  listWorkspaces,
  searchFiles,
  signInWithPassword,
} from '@notesapp/api-client';
import {
  commitChangeset,
  maxFilesPerChangeset,
  verifyActor,
  workspaceText,
  type Actor,
  type ChangesetInput,
  type RevisionInput,
} from '@notesapp/core';
import { bootstrapOwner, loadServerConfig } from '@notesapp/server';
import {
  authRole,
  createDocumentService,
  createTestDatabase,
  dropTestDatabase,
  openWorkspaceStore,
  runMigrations,
  runtimeRole,
  testAuthPassword,
  testDatabaseUrl,
  testRuntimePassword,
  withCredentials,
} from '@notesapp/storage-server';

const password = 'performance-password-0123456789';
const ordinaryNotes = 1000;
const folders = 20;
const warmup = 20;
const timed = 200;
const concurrentConnections = 16;
const concurrentMs = 4_000;

/** The word that every note holds, and the phrase that one note holds. */
const commonWord = 'meeting';
const rarePhrase = 'violet harbour';

/** The nearest rank percentile of the samples, or 0 for none. */
function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

/** The words of the generated text, so a compressor sees varied prose. */
const vocabulary = (
  'the team wrote down each point of meeting and next steps for every open ' +
  'item river stone lamp paper winter garden letter window market bridge ' +
  'quiet early yellow number travel answer system method review plan draft ' +
  'budget schedule customer feature design report office morning evening'
).split(' ');

/**
 * Text of about `bytes` bytes, the same for the same index.
 *
 * The words come from a small linear congruential sequence, so the text
 * changes from line to line as prose does and compresses like prose, not
 * like one sentence said again.
 */
function prose(index: number, bytes: number): string {
  let state = (index * 2_654_435_761 + 1) >>> 0;
  const words: string[] = [];
  let length = 0;
  while (length < bytes) {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    const word = vocabulary[state % vocabulary.length] ?? 'note';
    const end = state % 13 === 0 ? '.\n' : ' ';
    words.push(word + end);
    length += word.length + end.length;
  }
  return words.join('');
}

/** One note of about the given size, with the common word in it. */
function noteText(index: number, bytes: number): string {
  const header = `# Note ${String(index)}\n\nA **${commonWord}** with [a link](https://example.com/${String(index)}).\n\n`;
  return header + prose(index, Math.max(0, bytes - header.length));
}

/** One actor of the seed, with every action. */
function seedActor(accountId: string, workspaceId: string): Actor {
  const result = verifyActor(accountId, [
    { workspaceId, actions: ['read', 'write', 'history', 'purge'] },
  ]);
  if ('ok' in result) {
    if (!result.ok)
      throw new Error(`The seed actor failed: ${result.error.code}`);
    return result.value;
  }
  return result;
}

/** One measured case: its samples and, when it has one, its answer size. */
type Case = {
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
};

/** Runs one request in sequence: the warm up, then the timed samples. */
async function sequential(request: () => Promise<void>): Promise<Case> {
  for (let index = 0; index < warmup; index += 1) await request();
  const samples: number[] = [];
  for (let index = 0; index < timed; index += 1) {
    const started = performance.now();
    await request();
    samples.push(performance.now() - started);
  }
  return {
    samples: samples.length,
    p50Ms: Number(percentile(samples, 0.5).toFixed(1)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(1)),
    p99Ms: Number(percentile(samples, 0.99).toFixed(1)),
  };
}

/** Runs one request on many connections for a fixed time. */
async function concurrent(request: () => Promise<void>): Promise<{
  readonly requestsPerSecond: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
}> {
  const samples: number[] = [];
  const stopAt = performance.now() + concurrentMs;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrentConnections }, async () => {
      while (performance.now() < stopAt) {
        const at = performance.now();
        await request();
        samples.push(performance.now() - at);
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  return {
    requestsPerSecond: Math.round(samples.length / seconds),
    p50Ms: Number(percentile(samples, 0.5).toFixed(1)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(1)),
  };
}

/** The size that an answer states, or a loud failure when it states none. */
function statedBytes(response: Response | undefined): number {
  const value = response?.headers.get('content-length');
  if (value === null || value === undefined)
    throw new Error('The answer states no content length.');
  return Number(value);
}

const serverUrl = testDatabaseUrl;
const name = `notesapp_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const migrationUrl = await createTestDatabase(serverUrl, name);
const storageRoot = await mkdtemp(join(tmpdir(), 'notesapp-perf-reads-'));
let server: ChildProcess | null = null;
let failed = false;
try {
  const documents = createDocumentService();
  await runMigrations({
    documents,
    databaseUrl: migrationUrl,
    runtimePassword: testRuntimePassword,
    authPassword: testAuthPassword,
  });
  const runtimeUrl = withCredentials(
    migrationUrl,
    runtimeRole,
    testRuntimePassword,
  );
  const authUrl = withCredentials(migrationUrl, authRole, testAuthPassword);
  const port = 8000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const environment = {
    NOTESAPP_ORIGIN: baseUrl,
    NOTESAPP_HOST: '127.0.0.1',
    NOTESAPP_PORT: String(port),
    NOTESAPP_DATABASE_URL: runtimeUrl,
    NOTESAPP_AUTH_DATABASE_URL: authUrl,
    NOTESAPP_STORAGE_ROOT: storageRoot,
    NOTESAPP_AUTH_SECRET: randomBytes(32).toString('base64url'),
    NOTESAPP_LOG_LEVEL: 'warn',
    NOTESAPP_MAX_BODY_BYTES: '1048576',
    NOTESAPP_MAX_HEADER_BYTES: '16384',
    NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
    NOTESAPP_RATE_LIMIT_MAX: '1000000',
    NOTESAPP_BREACH_CHECK: 'off',
    NOTESAPP_SHUTDOWN_GRACE_MS: '0',
  };
  const config = loadServerConfig(environment);
  await bootstrapOwner({
    config,
    email: 'reads-owner@notes.invalid',
    name: 'Reads owner',
    password,
  });
  server = await new Promise<ChildProcess>((resolve, reject) => {
    const child = spawn(process.execPath, ['apps/server/dist/main.js'], {
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.startsWith('NOTESAPP_'),
          ),
        ),
        ...environment,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    createInterface({ input: child.stdout ?? process.stdin }).on(
      'line',
      (line) => {
        if (line.startsWith('notesapp: listening on ')) resolve(child);
      },
    );
    child.once('exit', () => {
      reject(new Error('The server stopped before it listened.'));
    });
  });

  const signed = await signInWithPassword({
    baseUrl,
    headers: { origin: baseUrl },
    body: { email: 'reads-owner@notes.invalid', password },
  });
  const cookie = (signed.response?.headers.getSetCookie() ?? [])
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
  const plain = { cookie, origin: baseUrl, 'accept-encoding': 'identity' };
  const browser = {
    cookie,
    origin: baseUrl,
    'accept-encoding': 'gzip, deflate, br, zstd',
  };
  const account = await getAccount({ baseUrl, headers: plain });
  const workspaces = await listWorkspaces({ baseUrl, headers: plain });
  const accountId = account.data?.accountId;
  const workspaceId = workspaces.data?.workspaces[0]?.workspaceId;
  if (accountId === undefined || workspaceId === undefined)
    throw new Error('The owner has no account or no workspace.');

  // The seed goes through the production core and store, in changesets of
  // the largest size that one changeset may hold.
  const store = openWorkspaceStore(runtimeUrl, documents, { poolSize: 2 });
  const actor = seedActor(accountId, workspaceId);
  const notes = [
    ...Array.from({ length: ordinaryNotes }, (_, index) => ({
      path: `folder-${String(index % folders).padStart(2, '0')}/note-${String(index).padStart(4, '0')}.md`,
      text:
        index === 7
          ? `${noteText(index, 2048)}\nThe ${rarePhrase} opens at dawn.\n`
          : noteText(index, 2048),
    })),
    { path: 'large/fifty.md', text: noteText(1000, 50 * 1024) },
    { path: 'large/five-hundred.md', text: noteText(1001, 500 * 1024) },
  ];
  const fileIds = new Map<string, string>();
  try {
    for (let start = 0; start < notes.length; start += maxFilesPerChangeset) {
      const batch = notes.slice(start, start + maxFilesPerChangeset);
      const expectedHeads: Record<string, null> = {};
      const revisions: RevisionInput[] = batch.map((note) => {
        const fileId = randomUUID();
        fileIds.set(note.path, fileId);
        expectedHeads[fileId] = null;
        return {
          id: randomUUID(),
          fileId,
          parents: [],
          path: note.path,
          deleted: false,
          content: workspaceText(note.text, 1),
          clientTime: '2026-10-02T00:00:00.000Z',
          message: null,
          restoredFrom: null,
        };
      });
      const input: ChangesetInput = {
        workspaceId,
        mutationId: randomUUID(),
        deviceId: 'performance-reads',
        expectedHeads,
        revisions,
      };
      const accepted = await commitChangeset(
        store,
        actor,
        input,
        `performance-reads-${input.mutationId}`,
      );
      if (!accepted.ok)
        throw new Error(`The seed failed with ${accepted.error.code}.`);
    }
  } finally {
    await store.close();
  }
  process.stdout.write(`Seeded ${String(notes.length)} notes.\n`);

  const fileOf = (path: string): string => {
    const fileId = fileIds.get(path);
    if (fileId === undefined) throw new Error(`No seeded file at ${path}.`);
    return fileId;
  };
  const small = fileOf('folder-07/note-0007.md');
  const fifty = fileOf('large/fifty.md');
  const fiveHundred = fileOf('large/five-hundred.md');

  const read = (fileId: string, headers: Record<string, string>) => () =>
    getFile({ baseUrl, headers, path: { workspaceId, fileId } }).then(
      (answer) => {
        if (answer.error !== undefined) throw new Error('A read failed.');
      },
    );
  const page = (limit: number) => () =>
    listFiles({
      baseUrl,
      headers: plain,
      path: { workspaceId },
      query: { limit, sort: 'path' },
    }).then((answer) => {
      if (answer.error !== undefined) throw new Error('A list failed.');
    });
  const search = (query: string) => () =>
    searchFiles({
      baseUrl,
      headers: plain,
      path: { workspaceId },
      query: { query, limit: 20 },
    }).then((answer) => {
      if (answer.error !== undefined || answer.data.hits.length === 0)
        throw new Error('A search failed or found nothing.');
    });

  /** Every page of the list at one page size, and the time it takes. */
  const wholeList = async (
    limit: number,
  ): Promise<{ pages: number; files: number; ms: number }> => {
    const started = performance.now();
    let cursor: string | null = null;
    let pages = 0;
    let files = 0;
    for (;;) {
      const next: string | null = await listFiles({
        baseUrl,
        headers: plain,
        path: { workspaceId },
        query: { limit, sort: 'path', ...(cursor === null ? {} : { cursor }) },
      }).then((answer) => {
        if (answer.data === undefined) throw new Error('A list failed.');
        files += answer.data.files.length;
        return answer.data.nextCursor;
      });
      pages += 1;
      if (next === null) break;
      cursor = next;
    }
    return {
      pages,
      files,
      ms: Number((performance.now() - started).toFixed(1)),
    };
  };

  /** The size of one read, without and with compression. */
  /**
   * The size of one read: the full head and the text alone, each without and
   * with the codings that a browser accepts.
   */
  const readBytes = async (
    fileId: string,
  ): Promise<{
    full: number;
    fullCompressed: number;
    text: number;
    textCompressed: number;
    encoding: string;
  }> => {
    const size = async (
      headers: Record<string, string>,
      content: 'text' | 'full',
    ): Promise<{ bytes: number; encoding: string }> => {
      const answer = await getFile({
        baseUrl,
        headers,
        path: { workspaceId, fileId },
        query: { content },
      });
      return {
        bytes: statedBytes(answer.response),
        encoding:
          answer.response?.headers.get('content-encoding') ?? 'identity',
      };
    };
    const compressed = await size(browser, 'full');
    return {
      full: (await size(plain, 'full')).bytes,
      fullCompressed: compressed.bytes,
      text: (await size(plain, 'text')).bytes,
      textCompressed: (await size(browser, 'text')).bytes,
      encoding: compressed.encoding,
    };
  };

  const report = {
    notes: notes.length,
    sequential: {
      listPage100: await sequential(page(100)),
      listPage500: await sequential(page(500)),
      read2KB: await sequential(read(small, plain)),
      read50KB: await sequential(read(fifty, plain)),
      read500KB: await sequential(read(fiveHundred, plain)),
      read500KBCompressed: await sequential(read(fiveHundred, browser)),
      searchCommonWord: await sequential(search(commonWord)),
      searchRarePhrase: await sequential(search(rarePhrase)),
    },
    wholeList: {
      pageSize100: await wholeList(100),
      pageSize500: await wholeList(500),
    },
    readBytes: {
      note2KB: await readBytes(small),
      note50KB: await readBytes(fifty),
      note500KB: await readBytes(fiveHundred),
    },
    concurrent: {
      read2KB: await concurrent(read(small, plain)),
      listPage100: await concurrent(page(100)),
      searchCommonWord: await concurrent(search(commonWord)),
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  failed = true;
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
} finally {
  server?.kill('SIGINT');
  await rm(storageRoot, { recursive: true, force: true });
  await dropTestDatabase(serverUrl, name).catch(() => {});
}
if (failed) process.exitCode = 1;
