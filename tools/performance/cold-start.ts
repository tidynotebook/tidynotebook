/**
 * Measures the start of the web application on a new device and a known one.
 *
 * Usage: `pnpm perf:start`, which builds, installs the browser of the
 * `test-application` skill and runs this file. `--runs <n>` sets
 * the number of starts of each kind, 8 by default.
 *
 * The run starts the built application on a new database and seeds the
 * corpus of `samples.ts`. A cold start is a new browser context with the
 * session cookie and nothing else: no HTTP cache, no worker and an empty
 * IndexedDB, as the audit of 2026-10-02 defined it. A warm start loads the
 * same address again in that context. Each start reports:
 *
 * - the first contentful paint;
 * - when All notes states the note count, which is when a person can read
 *   the list;
 * - the script files that the page loaded before that moment, with their
 *   compressed and decoded bytes, which is what record 0136 budgets.
 *
 * Every number is a measured result for the report of the run.
 */
import process from 'node:process';
import {
  laptop,
  launchChromium,
  noteCountSelector,
  notesBeforeSeed,
  report,
  seedCorpus,
  signInApi,
  startApplication,
  type Context,
} from './browser.ts';
import { distribution } from './samples.ts';

/** What the probe of one start collects. */
type StartProbe = {
  paintAt: number | null;
  countAt: number | null;
  scripts: { name: string; encoded: number; decoded: number }[];
};

declare global {
  interface Window {
    notesappStartProbe?: StartProbe;
  }
}

const runsAt = process.argv.indexOf('--runs');
const runs = runsAt === -1 ? 8 : Number(process.argv[runsAt + 1]);
if (!Number.isInteger(runs) || runs < 1)
  throw new Error('--runs takes a positive whole number.');

/**
 * Watches the page from its first script until All notes states the count
 * of the whole workspace, `expected`.
 *
 * It runs before every script of the page, so it sees the whole load.
 */
function watchStart({
  selector,
  expected,
}: {
  selector: string;
  expected: string;
}): void {
  const probe: StartProbe = { paintAt: null, countAt: null, scripts: [] };
  window.notesappStartProbe = probe;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (entry.name === 'first-contentful-paint')
        probe.paintAt = entry.startTime;
  }).observe({ type: 'paint', buffered: true });
  const found = (): boolean =>
    [...document.querySelectorAll(selector)].some(
      (element) => element.textContent === expected,
    );
  const observer = new MutationObserver(() => {
    if (!found()) return;
    observer.disconnect();
    // The count is stated once the frame that holds it is drawn, which is
    // the task after the next animation frame.
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        probe.scripts = performance
          .getEntriesByType('resource')
          .filter(
            (entry): entry is PerformanceResourceTiming =>
              entry instanceof PerformanceResourceTiming &&
              entry.name.endsWith('.js'),
          )
          .map((entry) => ({
            name: new URL(entry.name).pathname,
            encoded: entry.encodedBodySize,
            decoded: entry.decodedBodySize,
          }));
        probe.countAt = performance.now();
      };
      channel.port2.postMessage(null);
    });
  });
  const start = (): void => {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  };
  if (document.documentElement === null)
    document.addEventListener('DOMContentLoaded', start);
  else start();
}

/** What the probe of the page saw. */
function readStart(): StartProbe | null {
  return window.notesappStartProbe ?? null;
}

/** Whether the count is on the screen yet. */
function countShown(): boolean {
  const probe = window.notesappStartProbe;
  return probe?.countAt != null && probe.paintAt !== null;
}

/** One start of one kind. */
type StartSample = {
  readonly paintMs: number;
  readonly countMs: number;
  readonly scripts: number;
  readonly encodedBytes: number;
  readonly decodedBytes: number;
  readonly files: StartProbe['scripts'];
};

/** Loads the workspace address in a context and reads the probe. */
async function startOnce(
  context: Context,
  address: string,
  reload: boolean,
): Promise<StartSample> {
  const page = await context.newPage();
  try {
    await page.goto(address);
    if (reload) await page.goto(address);
    await page.waitForFunction(countShown, undefined, { timeout: 120_000 });
    const probe = await page.evaluate(readStart, undefined);
    if (probe === null || probe.countAt === null || probe.paintAt === null)
      throw new Error('The start was not observed.');
    return {
      paintMs: probe.paintAt,
      countMs: probe.countAt,
      scripts: probe.scripts.length,
      encodedBytes: probe.scripts.reduce(
        (sum, entry) => sum + entry.encoded,
        0,
      ),
      files: probe.scripts,
      decodedBytes: probe.scripts.reduce(
        (sum, entry) => sum + entry.decoded,
        0,
      ),
    };
  } finally {
    await page.close();
  }
}

/** The distributions of a set of starts. */
function summary(samples: readonly StartSample[]) {
  return {
    firstContentfulPaintMs: distribution(samples.map((s) => s.paintMs)),
    noteCountMs: distribution(samples.map((s) => s.countMs)),
    scriptFiles: distribution(samples.map((s) => s.scripts)),
    scriptEncodedBytes: distribution(samples.map((s) => s.encodedBytes)),
    scriptDecodedBytes: distribution(samples.map((s) => s.decodedBytes)),
  };
}

const app = await startApplication();
try {
  const session = await signInApi(app);
  const before = await notesBeforeSeed(app, session);
  const notes = await seedCorpus(app, session);
  const noteCount = before + notes.length;
  const address = new URL(`/w/${session.workspaceId}`, app.origin).href;
  const cookies = session.cookie.split('; ').map((pair) => {
    const at = pair.indexOf('=');
    return {
      name: pair.slice(0, at),
      value: pair.slice(at + 1),
      url: app.origin,
    };
  });
  const browser = await launchChromium();
  try {
    const cold: StartSample[] = [];
    const warm: StartSample[] = [];
    for (let run = 0; run < runs; run += 1) {
      const context = await browser.newContext({
        viewport: laptop,
        colorScheme: 'light',
      });
      try {
        await context.addCookies(cookies);
        await context.addInitScript(watchStart, {
          selector: noteCountSelector,
          expected: String(noteCount),
        });
        const sample = await startOnce(context, address, false);
        cold.push(sample);
        warm.push(await startOnce(context, address, true));
      } finally {
        await context.close();
      }
    }
    report({
      environment: {
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
      },
      notes: noteCount,
      runs,
      cold: summary(cold),
      warm: summary(warm),
      firstColdScripts: cold[0]?.files ?? [],
    });
  } finally {
    await browser.close();
  }
} finally {
  await app.stop();
}
