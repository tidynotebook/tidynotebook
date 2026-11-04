/** Measures save and search service time against a disposable large corpus. */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import {
  saveTargetMs,
  searchBudgetMs,
  serviceP95,
  serviceExitCode,
} from './service-policy.ts';
import {
  commitChangeset,
  workspaceText,
  searchFiles,
  updateFileChangeset,
  verifyActor,
  type Actor,
  type ChangesetInput,
  type RevisionInput,
} from '@notesapp/core';
import {
  createDocumentService,
  createTestDatabase,
  databaseName,
  dropTestDatabase,
  isTestDatabaseName,
  openWorkspaceStore,
  provisionAccounts,
  provisionWorkspace,
  runMigrations,
  runtimeRole,
  testAuthPassword,
  testDatabaseUrl,
  testRuntimePassword,
  withCredentials,
} from '@notesapp/storage-server';
import {
  corpusBatch,
  corpusNote,
  corpusNoteCount,
  stressNote,
  stressNoteBytes,
  type CorpusNote,
} from './corpus.ts';

/** One member of a prepared list, or a loud failure when it is absent. */
function at<T>(list: readonly T[], index: number, what: string): T {
  const value = list[index];
  if (value === undefined)
    throw new Error(
      `The run has no ${what} at position ${String(index)}. The setup above is incomplete.`,
    );
  return value;
}

const activeUsers = 20;
const seedBatchSize = 1000;
const measuredRounds = 5;

type ResourceProfile = {
  readonly cpuLimit: number;
  readonly memoryLimitBytes: number;
  readonly availableParallelism: number;
};

/** Reads and enforces the cgroup profile used by the package command. */
async function resourceProfile(): Promise<ResourceProfile> {
  const [cpuText, memoryText] = await Promise.all([
    readFile('/sys/fs/cgroup/cpu.max', 'utf8'),
    readFile('/sys/fs/cgroup/memory.max', 'utf8'),
  ]);
  const [quotaText, periodText] = cpuText.trim().split(/\s+/);
  const quota = Number(quotaText);
  const period = Number(periodText);
  const memoryLimitBytes = Number(memoryText.trim());
  if (
    !Number.isFinite(quota) ||
    !Number.isFinite(period) ||
    quota <= 0 ||
    period <= 0
  )
    throw new Error('Run this check with a finite CPU cgroup limit.');
  const cpuLimit = quota / period;
  if (cpuLimit > 2.01)
    throw new Error(`The CPU limit is ${cpuLimit.toFixed(2)}, not 2 cores.`);
  if (
    !Number.isSafeInteger(memoryLimitBytes) ||
    memoryLimitBytes > 4 * 1024 * 1024 * 1024
  )
    throw new Error('Run this check with a memory limit of 4 GiB or less.');
  return {
    cpuLimit,
    memoryLimitBytes,
    availableParallelism: availableParallelism(),
  };
}

/** Makes one permission checked actor for a workspace. */
function actor(accountId: string, workspaceId: string): Actor {
  const result = verifyActor(accountId, [
    {
      workspaceId,
      actions: ['read', 'write', 'history', 'purge'],
    },
  ]);
  if ('ok' in result) {
    if (!result.ok)
      throw new Error(`The performance actor failed: ${result.error.code}`);
    return result.value;
  }
  return result;
}

/** Commits a batch of new notes through the production core and store. */
async function seedBatch(
  store: ReturnType<typeof openWorkspaceStore>,
  seedActor: Actor,
  workspaceId: string,
  notes: readonly CorpusNote[],
  heads: Map<number, { readonly fileId: string; readonly revisionId: string }>,
): Promise<void> {
  const expectedHeads: Record<string, null> = {};
  const revisions: RevisionInput[] = await Promise.all(
    notes.map(async (note) => {
      const fileId = randomUUID();
      const revisionId = randomUUID();
      heads.set(note.index, { fileId, revisionId });
      expectedHeads[fileId] = null;
      return {
        id: revisionId,
        fileId,
        parents: [],
        path: note.path,
        deleted: false,
        // The harness seeds through the workspace, which writes the text
        // into the document of the note (record 0081).
        content: workspaceText(note.text, 1),
        clientTime: '2026-09-06T00:00:00.000Z',
        message: null,
        restoredFrom: null,
      };
    }),
  );
  const input: ChangesetInput = {
    workspaceId,
    mutationId: randomUUID(),
    deviceId: 'performance-seed',
    expectedHeads,
    revisions,
  };
  const result = await commitChangeset(
    store,
    seedActor,
    input,
    `performance-seed-${input.mutationId}`,
  );
  if (!result.ok)
    throw new Error(`Corpus seed failed with ${result.error.code}.`);
}

const profile = await resourceProfile();
const serverUrl = testDatabaseUrl;
if (!isTestDatabaseName(databaseName(serverUrl)))
  throw new Error('The performance database server must use notesapp_test.');
const databaseNameValue = `notesapp_test_perf_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const migrationUrl = await createTestDatabase(serverUrl, databaseNameValue);
let store: ReturnType<typeof openWorkspaceStore> | null = null;

try {
  await runMigrations({
    documents: createDocumentService(),
    databaseUrl: migrationUrl,
    runtimePassword: testRuntimePassword,
    authPassword: testAuthPassword,
  });
  const runtimeUrl = withCredentials(
    migrationUrl,
    runtimeRole,
    testRuntimePassword,
  );
  // The measured closures below run after the assignment, so they read this
  // constant. The outer `store` stays for the `finally` that closes it.
  const openStore = openWorkspaceStore(runtimeUrl, createDocumentService(), {
    poolSize: activeUsers,
    statementTimeoutMs: 30_000,
  });
  store = openStore;

  const workspaceId = randomUUID();
  const accountIds = Array.from({ length: activeUsers }, () => randomUUID());
  // The limit belongs to the account and counts every workspace it owns: the
  // corpus of 2 GiB and one save workspace of 64 MiB (record 0112).
  await provisionAccounts(migrationUrl, accountIds, {
    limitBytes: 2n * 1024n * 1024n * 1024n + 64n * 1024n * 1024n,
  });
  await provisionWorkspace(migrationUrl, {
    workspaceId,
    name: 'Performance corpus',
    members: accountIds.map((accountId) => ({ accountId, role: 'owner' })),
  });
  const actors = accountIds.map((accountId) => actor(accountId, workspaceId));
  const heads = new Map<
    number,
    { readonly fileId: string; readonly revisionId: string }
  >();

  for (let start = 0; start < corpusNoteCount; start += seedBatchSize) {
    await seedBatch(
      store,
      at(actors, 0, 'actor'),
      workspaceId,
      corpusBatch(start, Math.min(seedBatchSize, corpusNoteCount - start)),
      heads,
    );
    process.stdout.write(
      `Seeded ${String(Math.min(start + seedBatchSize, corpusNoteCount))} notes.\n`,
    );
  }
  await seedBatch(
    store,
    at(actors, 0, 'actor'),
    workspaceId,
    [stressNote()],
    heads,
  );
  process.stdout.write(
    `Seeded one ${String(stressNoteBytes)} byte stress note.\n`,
  );

  let postgresVersion = 'unknown';
  const statisticsClient = new pg.Client({ connectionString: migrationUrl });
  await statisticsClient.connect();
  try {
    await statisticsClient.query('analyze public.search_index');
    const version = await statisticsClient.query<{ server_version: string }>(
      'show server_version',
    );
    postgresVersion = version.rows[0]?.server_version ?? 'unknown';
  } finally {
    await statisticsClient.end();
  }

  const saveWorkspaceIds = Array.from({ length: activeUsers }, () =>
    randomUUID(),
  );
  const saveActors: Actor[] = [];
  const currentHeads: { fileId: string; revisionId: string }[] = [];
  for (let index = 0; index < activeUsers; index += 1) {
    const saveWorkspaceId = at(saveWorkspaceIds, index, 'save workspace');
    const accountId = at(accountIds, index, 'account');
    await provisionWorkspace(migrationUrl, {
      workspaceId: saveWorkspaceId,
      name: `Performance save workspace ${String(index)}`,
      members: [{ accountId, role: 'owner' }],
    });
    const saveActor = actor(accountId, saveWorkspaceId);
    saveActors.push(saveActor);
    const saveHead = new Map<
      number,
      { readonly fileId: string; readonly revisionId: string }
    >();
    await seedBatch(
      store,
      saveActor,
      saveWorkspaceId,
      [corpusNote(index)],
      saveHead,
    );
    const head = saveHead.get(index);
    if (head === undefined)
      throw new Error('A measured note has no seed head.');
    currentHeads.push({ ...head });
  }
  const saveSamples: number[] = [];

  const saveRound = async (round: number, measured: boolean): Promise<void> => {
    const prepared = await Promise.all(
      currentHeads.map(async (head, index) => {
        const base = corpusNote(index);
        const saveWorkspaceId = at(saveWorkspaceIds, index, 'save workspace');
        return {
          index,
          input: updateFileChangeset({
            workspaceId: saveWorkspaceId,
            fileId: head.fileId,
            revisionId: randomUUID(),
            expectedHead: head.revisionId,
            path: base.path,
            content: workspaceText(
              `${base.text}\nrevision ${String(round)}\n`,
              1,
            ),
            deleted: false,
            message: null,
            ids: {
              mutationId: randomUUID(),
              deviceId: `performance-user-${String(index)}`,
              clientTime: '2026-09-06T00:00:00.000Z',
            },
          }),
        };
      }),
    );
    await Promise.all(
      prepared.map(async ({ index, input }) => {
        const started = performance.now();
        const result = await commitChangeset(
          openStore,
          at(saveActors, index, 'save actor'),
          input,
          `performance-save-${input.mutationId}`,
        );
        const elapsed = performance.now() - started;
        if (!result.ok)
          throw new Error(`Measured save failed with ${result.error.code}.`);
        const revisionId = result.value.revisionIds.at(-1);
        if (revisionId === undefined)
          throw new Error('A measured save returned no revision.');
        currentHeads[index] = {
          fileId: currentHeads[index]?.fileId ?? '',
          revisionId,
        };
        if (measured) saveSamples.push(elapsed);
      }),
    );
  };

  await saveRound(0, false);
  for (let round = 1; round <= measuredRounds; round += 1)
    await saveRound(round, true);
  const saveP95Ms = serviceP95(saveSamples);
  process.stdout.write(
    `Measured ${String(saveSamples.length)} saves with p95 ${saveP95Ms.toFixed(2)} ms.\n`,
  );

  const searchSamples: number[] = [];
  const searchRound = async (measured: boolean): Promise<void> => {
    await Promise.all(
      actors.map(async (currentActor, index) => {
        const started = performance.now();
        const result = await searchFiles(
          openStore,
          currentActor,
          workspaceId,
          corpusNote(index).searchTerm,
          50,
        );
        const elapsed = performance.now() - started;
        if (!result.ok)
          throw new Error(`Measured search failed with ${result.error.code}.`);
        if (result.value.length === 0)
          throw new Error('A measured search returned no result.');
        if (measured) searchSamples.push(elapsed);
      }),
    );
  };

  const singleSearchStarted = performance.now();
  const singleSearch = await searchFiles(
    store,
    at(actors, 0, 'actor'),
    workspaceId,
    corpusNote(0).searchTerm,
    50,
  );
  if (!singleSearch.ok || singleSearch.value.length === 0)
    throw new Error('The search warmup failed.');
  process.stdout.write(
    `Single search warmup took ${(performance.now() - singleSearchStarted).toFixed(2)} ms.\n`,
  );
  await searchRound(false);
  for (let round = 0; round < measuredRounds; round += 1)
    await searchRound(true);

  const searchP95Ms = serviceP95(searchSamples);
  const report = {
    environment: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      cpuLimit: profile.cpuLimit,
      memoryLimitBytes: profile.memoryLimitBytes,
      availableParallelism: profile.availableParallelism,
      postgres: postgresVersion,
    },
    corpus: {
      notes: corpusNoteCount,
      ordinaryMinimumBytes: 5 * 1024,
      ordinaryMaximumBytes: 20 * 1024,
      stressNotes: 1,
      stressNoteBytes,
      activeUsers,
      saveWorkspaceModel: 'one workspace per active user',
      searchWorkspaceNotes: corpusNoteCount,
    },
    save: {
      samples: saveSamples.length,
      p95Ms: Number(saveP95Ms.toFixed(2)),
      budgetMs: saveTargetMs,
      enforcement: 'advisory',
      status: saveP95Ms < saveTargetMs ? 'pass' : 'fail',
    },
    search: {
      samples: searchSamples.length,
      p95Ms: Number(searchP95Ms.toFixed(2)),
      budgetMs: searchBudgetMs,
      status: searchP95Ms < searchBudgetMs ? 'pass' : 'fail',
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.save.status === 'fail')
    process.stdout.write(
      'Save exceeds its advisory target. The result stays open for calibration.\n',
    );
  process.exitCode = serviceExitCode(saveSamples, searchSamples);
} finally {
  if (store !== null) {
    await store.close();
    await delay(100);
  }
  await dropTestDatabase(serverUrl, databaseNameValue);
}
