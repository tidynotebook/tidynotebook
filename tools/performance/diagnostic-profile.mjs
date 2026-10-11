/** Records bounded, parameter-free evidence from the diagnostic Save phase. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, availableParallelism } from 'node:os';
import { Session } from 'node:inspector/promises';
import pg from 'pg';
import { record as objectRecord } from '../workspace.mjs';

const directory = new URL(
  '../../.tooling/performance-diagnostic/',
  import.meta.url,
);
const maxRows = 12_000;
const maxBytes = 20 * 1024 * 1024;
const tables = new Set([
  'workspaces',
  'memberships',
  'files',
  'revisions',
  'revision_parents',
  'contents',
  'note_documents',
  'search_index',
  'note_links',
  'live_paths',
  'mutation_receipts',
  'sync_changes',
  'purged_files',
]);

/** Gives only an allowed category, never SQL text or its literal values.
 * @param {unknown} text */
export function queryCategory(text) {
  if (typeof text !== 'string') return 'unknown';
  const query = text.trim().toLowerCase();
  if (query.startsWith('select current_setting(') && query.endsWith('; commit'))
    return 'commit';
  if (query.startsWith('begin; set local synchronous_commit to off;'))
    return 'sync hints';
  if (query.startsWith('select set_config(')) return 'actor setting';
  if (query.startsWith('select pg_advisory_xact_lock('))
    return 'workspace lock';
  for (const name of [
    'notesapp_add_usage',
    'notesapp_account_usage',
    'notesapp_next_cursor',
  ])
    if (query.includes(name + '(')) return name;
  const verb =
    /^(select|insert|update|delete|begin|commit|rollback|savepoint|release)\b/.exec(
      query,
    )?.[1] ?? 'other';
  const table = /\b(?:from|into|update)\s+"?([a-z_]+)"?/.exec(query)?.[1];
  return typeof table === 'string' && tables.has(table)
    ? `${verb} ${table}`
    : verb;
}

/** Writes a bounded JSON artifact and refuses an oversized report.
 * @param {string} name
 * @param {unknown} value */
async function record(name, value) {
  const text = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text) > maxBytes)
    throw new Error('The diagnostic artifact is too large.');
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(name, directory), text + '\n');
}

const originalQuery = pg.Client.prototype.query;
let active = false;
let stopped = false;
/** @type {{category: string, backend: unknown, startedUs: number, elapsedMs: number}[]} */
const queries = [];
/** @type {{round: number, measured: boolean, event: string, timeUs: number}[]} */
const intervals = [];
/** @type {Session | undefined} */
let session;

Object.defineProperty(pg.Client.prototype, 'query', {
  configurable: true,
  writable: true,
  /** @this {pg.Client}
   * @param {...unknown} args */
  value: function (...args) {
    const measured = active;
    const startedUs = Number(process.hrtime.bigint() / 1000n);
    /** @type {unknown} */
    const answer = Reflect.apply(originalQuery, this, args);
    if (!measured || !(answer instanceof Promise)) return answer;
    const category = queryCategory(
      typeof args[0] === 'string' ? args[0] : objectRecord(args[0]).text,
    );
    return answer.finally(() => {
      if (queries.length >= maxRows)
        throw new Error('The diagnostic query report is full.');
      queries.push({
        category,
        backend: objectRecord(this).processID,
        startedUs,
        elapsedMs: (Number(process.hrtime.bigint() / 1000n) - startedUs) / 1000,
      });
    });
  },
});

/** Records the timer interval of each warmup or measured round.
 * @param {number} round
 * @param {boolean} measured
 * @param {string} event */
export function markRound(round, measured, event) {
  intervals.push({
    round,
    measured,
    event,
    timeUs: Number(process.hrtime.bigint() / 1000n),
  });
}

/** Reads PostgreSQL evidence through the known disposable test administrator.
 * @param {string} url
 * @param {string} name */
async function statistics(url, name) {
  const parsed = new URL(url);
  if (
    parsed.hostname !== '127.0.0.1' ||
    !/^\/notesapp_test_perf_[a-f0-9]+$/.test(parsed.pathname)
  )
    throw new Error('The diagnostic target is not a disposable test database.');
  parsed.username = 'postgres';
  parsed.password = 'postgres_test';
  const client = new pg.Client({ connectionString: parsed.href });
  await client.connect();
  try {
    await client.query('create extension if not exists pg_stat_statements');
    const statements = await client.query(
      'select * from pg_stat_statements where dbid = (select oid from pg_database where datname = current_database())',
    );
    const safeStatements = statements.rows.map((row) => ({
      category: queryCategory(row.query),
      queryid: row.queryid,
      userid: row.userid,
      calls: row.calls,
      total_exec_time: row.total_exec_time,
      rows: row.rows,
      shared_blks_hit: row.shared_blks_hit,
      shared_blks_read: row.shared_blks_read,
      shared_blks_written: row.shared_blks_written,
      shared_blk_read_time: row.shared_blk_read_time,
      shared_blk_write_time: row.shared_blk_write_time,
      wal_bytes: row.wal_bytes,
    }));
    /** @type {Record<string, unknown>} */
    const result = {
      statements: safeStatements,
      serverVersion: (await client.query('show server_version')).rows[0]
        ?.server_version,
    };
    for (const view of [
      'pg_stat_io',
      'pg_stat_wal',
      'pg_stat_bgwriter',
      'pg_stat_checkpointer',
    ])
      result[view] = (await client.query(`select * from ${view}`)).rows;
    result['settings'] = (
      await client.query(
        "select name, setting, unit from pg_settings where name in ('fsync', 'synchronous_commit', 'shared_buffers', 'full_page_writes', 'max_wal_size', 'track_io_timing', 'track_wal_io_timing')",
      )
    ).rows;
    await record(name, result);
  } finally {
    await client.end();
  }
}

/** Starts profiling only after corpus and Save workspace setup.
 * @param {string} url */
export async function beginSave(url) {
  const [cpuMax, memoryMax, cpuset] = await Promise.all([
    readFile('/sys/fs/cgroup/cpu.max', 'utf8'),
    readFile('/sys/fs/cgroup/memory.max', 'utf8'),
    readFile('/sys/fs/cgroup/cpuset.cpus.effective', 'utf8'),
  ]);
  await record('resources.json', {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    availableParallelism: availableParallelism(),
    cpuModels: [...new Set(cpus().map((cpu) => cpu.model))],
    cpuMax: cpuMax.trim(),
    memoryMax: memoryMax.trim(),
    cpuset: cpuset.trim(),
    captureScope:
      '120 Save operations; CPU profile also covers untimed input preparation, with marked timed intervals',
  });
  await statistics(url, 'postgres-before.json');
  session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.start');
  active = true;
}

/** Saves the completed Save evidence before Search starts.
 * @param {string} url */
export async function endSave(url) {
  active = false;
  await finishDiagnostic();
  await statistics(url, 'postgres-after.json');
}

/** Keeps evidence on a failure, without hiding the harness failure. */
export async function finishDiagnostic() {
  active = false;
  if (stopped) return;
  stopped = true;
  if (session) {
    const cpu = await session.post('Profiler.stop');
    session.disconnect();
    await record('save.cpuprofile', cpu.profile);
  }
  await record('queries.json', queries);
  await record('intervals.json', intervals);
  await record('counts.json', {
    queries: queries.length,
    commits: queries.filter((row) => row.category === 'commit').length,
    expectedCommits: 120,
    mode: 'diagnostic only; no acceptance claim',
  });
}
