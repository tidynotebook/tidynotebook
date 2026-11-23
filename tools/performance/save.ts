/**
 * Measures a save and its way to a second device, and a move to All notes.
 *
 * Usage: `pnpm perf:save`, which builds, installs the browser of the
 * `test-application` skill and runs this file. `--saves <n>` and
 * `--moves <n>` set the number of trials, 200 and 100 by default.
 *
 * The run starts the built application on a new database, seeds the corpus
 * of `samples.ts`, and opens two devices on one note of 2 KB. Each save trial
 * types one new word on the first device and presses Ctrl + S:
 *
 * - `toRequest` is the time from the `keydown` of Ctrl + S to the start of the
 *   changeset request, which is the time the client holds the save;
 * - `toAnswer` is the time from that `keydown` to the end of the answer of the
 *   server, which is what the audit of 2026-10-02 measured;
 * - `toSecondDevice` is the time from that `keydown` until the text of the
 *   second device holds the word. The two pages run on one machine, so their
 *   clocks are one clock.
 *
 * `--trial-timeout <ms>` ends a trial that waits longer, 60 s by default, and
 * `--shots <directory>` keeps a screenshot of both devices of such a trial.
 * `--first-sync <n>` adds trials of a new device that opens the note and
 * saves while its first sync of the corpus still runs: `toAnswer` there is
 * how long a save waits for that sync (record 0176).
 *
 * A move trial opens a note of the tree and then the All notes row, and
 * measures from the click on the row until the list states the note count.
 * Every trial over two seconds is listed with its number, so a slow trial can
 * be read against the server log. Every number is a measured result for the
 * report of the run.
 */
import process from 'node:process';
import {
  awaitNoteCount,
  launchChromium,
  notesBeforeSeed,
  openDevice,
  pause,
  report,
  seedCorpus,
  signInApi,
  startApplication,
  type Device,
  waitForListedNoteCount,
} from './browser.ts';
import { distribution, outliers } from './samples.ts';

/** What the probe of one page collects. */
type SaveProbe = {
  savePressedAt: number | null;
  readonly changesets: { start: number; end: number }[];
  wordSeenAt: number | null;
  word: string | null;
  stop: () => void;
};

declare global {
  interface Window {
    notesappSaveProbe?: SaveProbe;
  }
}

/** A trial over this many milliseconds is an outlier of the run. */
const outlierMs = 2000;

/** Reads `--name <n>` as a positive whole number, or the default. */
function countArgument(name: string, fallback: number): number {
  const at = process.argv.indexOf(name);
  if (at === -1) return fallback;
  const value = Number(process.argv[at + 1]);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} takes a whole number.`);
  return value;
}

const saveTrials = countArgument('--saves', 200);
const moveTrials = countArgument('--moves', 100);
const firstSyncTrials = countArgument('--first-sync', 0);
const shotsAt = process.argv.indexOf('--shots');
/** Where a trial that does not end leaves a screenshot of each device. */
const shotsDirectory =
  shotsAt === -1 ? null : (process.argv[shotsAt + 1] ?? null);
/** A trial that has not ended after this long has failed. */
const trialTimeoutMs = countArgument('--trial-timeout', 60_000);

/** The time on the clock that every page of this machine shares. */
function wallNow(): number {
  return performance.timeOrigin + performance.now();
}

/** Installs the probe of a page: the save key, the request and the text. */
function installSaveProbe(): void {
  const wall = (at: number): number => performance.timeOrigin + at;
  const probe: SaveProbe = {
    savePressedAt: null,
    changesets: [],
    wordSeenAt: null,
    word: null,
    stop: () => {},
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey && event.key.toLowerCase() === 's')
      probe.savePressedAt = wall(event.timeStamp);
  };
  window.addEventListener('keydown', onKeyDown, true);
  const resources = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (
        entry instanceof PerformanceResourceTiming &&
        entry.name.includes('/changesets')
      )
        probe.changesets.push({
          start: wall(entry.startTime),
          end: wall(entry.responseEnd),
        });
  });
  resources.observe({ type: 'resource' });
  const text = new MutationObserver(() => {
    const word = probe.word;
    if (word === null || probe.wordSeenAt !== null) return;
    const content = document.querySelector('.cm-content');
    if (content?.textContent?.includes(word) === true)
      probe.wordSeenAt = performance.timeOrigin + performance.now();
  });
  text.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  probe.stop = () => {
    window.removeEventListener('keydown', onKeyDown, true);
    resources.disconnect();
    text.disconnect();
  };
  window.notesappSaveProbe = probe;
}

/** Starts a trial: the next word to wait for, and no answer yet. */
function armSaveProbe(word: string): void {
  const probe = window.notesappSaveProbe;
  if (probe === undefined) throw new Error('The save probe is missing.');
  probe.word = word;
  probe.wordSeenAt = null;
  probe.savePressedAt = null;
  probe.changesets.length = 0;
}

/** What one page saw of the running trial. */
function readSaveProbe(): {
  readonly savePressedAt: number | null;
  readonly changesets: readonly { start: number; end: number }[];
  readonly wordSeenAt: number | null;
} {
  const probe = window.notesappSaveProbe;
  if (probe === undefined) throw new Error('The save probe is missing.');
  // The editor draws only the lines near its viewport. A screen that read
  // the note again starts at the top, so the probe keeps the end in view,
  // where each trial writes its word, and the observer sees it drawn.
  if (probe.word !== null && probe.wordSeenAt === null) {
    const scroller = document.querySelector('.cm-scroller');
    if (
      scroller !== null &&
      scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1
    )
      scroller.scrollTop = scroller.scrollHeight;
  }
  return {
    savePressedAt: probe.savePressedAt,
    changesets: [...probe.changesets],
    wordSeenAt: probe.wordSeenAt,
  };
}

/** Puts the caret at the end of the text of the open note. */
async function caretToEnd(device: Device): Promise<void> {
  await device.page.evaluate(() => {
    const content = document.querySelector('.cm-content');
    if (!(content instanceof HTMLElement))
      throw new Error('The note shows no editor.');
    content.focus();
  }, undefined);
  await device.page.keyboard.press('Control+End');
}

/** Opens one note on a device and waits for its editor. */
async function openNote(device: Device, fileId: string): Promise<void> {
  await device.page.goto(
    new URL(`/w/${device.workspaceId}/notes/${fileId}`, device.page.url()).href,
  );
  try {
    await device.page.locator('.cm-content').waitFor({ timeout: 60_000 });
  } catch (failure: unknown) {
    if (shotsDirectory !== null)
      await device.page.screenshot({
        path: `${shotsDirectory}/open-${String(Date.now())}.png`,
      });
    throw failure;
  }
}

/** One save trial and what each clock saw. */
type SaveSample = {
  readonly toRequest: number | null;
  readonly toAnswer: number | null;
  readonly toSecondDevice: number | null;
};

/** Types one word on the first device, saves it, and waits for both ends. */
async function saveTrial(
  first: Device,
  second: Device,
  trial: number,
): Promise<SaveSample> {
  const word = `w${String(trial)}x`;
  await first.page.evaluate(armSaveProbe, word);
  await second.page.evaluate(armSaveProbe, word);
  await first.page.keyboard.type(` ${word}`);
  await first.page.keyboard.press('Control+s');
  const deadline = Date.now() + trialTimeoutMs;
  for (;;) {
    const one = await first.page.evaluate(readSaveProbe, undefined);
    const two = await second.page.evaluate(readSaveProbe, undefined);
    const pressed = one.savePressedAt;
    const request =
      pressed === null
        ? undefined
        : one.changesets.find((entry) => entry.start >= pressed);
    if (
      pressed !== null &&
      request !== undefined &&
      request.end > 0 &&
      two.wordSeenAt !== null
    )
      return {
        toRequest: request.start - pressed,
        toAnswer: request.end - pressed,
        toSecondDevice: two.wordSeenAt - pressed,
      };
    if (Date.now() > deadline) {
      process.stderr.write(
        `Trial ${String(trial)} did not end: ${JSON.stringify({ one, two })}\n`,
      );
      if (shotsDirectory !== null) {
        await first.page.screenshot({
          path: `${shotsDirectory}/trial-${String(trial)}-first.png`,
        });
        await second.page.screenshot({
          path: `${shotsDirectory}/trial-${String(trial)}-second.png`,
        });
      }
      return {
        toRequest:
          request === undefined || pressed === null
            ? null
            : request.start - pressed,
        toAnswer:
          request === undefined || pressed === null
            ? null
            : request.end - pressed,
        toSecondDevice:
          two.wordSeenAt === null || pressed === null
            ? null
            : two.wordSeenAt - pressed,
      };
    }
    await pause(20);
  }
}

/** Opens a note from the tree, then All notes, and times the second step. */
async function moveTrial(
  device: Device,
  noteCount: number,
  noteFileId: string,
): Promise<number> {
  await openNote(device, noteFileId);
  const started = await device.page.evaluate(wallNow, undefined);
  await device.page.getByRole('link', { name: 'All notes' }).first().click();
  await waitForListedNoteCount(device.page, noteCount, trialTimeoutMs);
  const ended = await device.page.evaluate(wallNow, undefined);
  return ended - started;
}

const app = await startApplication();
try {
  const session = await signInApi(app);
  const before = await notesBeforeSeed(app, session);
  const notes = await seedCorpus(app, session);
  const noteCount = before + notes.length;
  const target = notes.find((note) => note.path.endsWith('note-0007.md'));
  const other = notes.find((note) => note.path.endsWith('note-0008.md'));
  if (target === undefined || other === undefined)
    throw new Error('The corpus lacks the notes of the trials.');
  const browser = await launchChromium();
  try {
    const first = await openDevice(browser, app);
    const second = await openDevice(browser, app);
    const firstSyncMs = [
      await awaitNoteCount(first, noteCount),
      await awaitNoteCount(second, noteCount),
    ];
    await openNote(first, target.fileId);
    await openNote(second, target.fileId);
    await first.page.evaluate(installSaveProbe, undefined);
    await second.page.evaluate(installSaveProbe, undefined);
    await caretToEnd(first);
    // The editor draws only the lines near its viewport, so the second device
    // shows the end of the note, where each trial writes its word.
    await caretToEnd(second);
    const saves: SaveSample[] = [];
    for (let trial = 0; trial < saveTrials; trial += 1) {
      saves.push(await saveTrial(first, second, trial));
      // A short and varied rest, so the trials do not all meet the same
      // phase of a timer of the application.
      await pause(200 + ((trial * 137) % 400));
    }
    const moves: number[] = [];
    // A move whose note never opens is a failed trial with what the page
    // reported, and the run goes on.
    const failedMoves: { trial: number; problems: string[] }[] = [];
    for (let trial = 0; trial < moveTrials; trial += 1) {
      const seen = first.problems.length;
      try {
        moves.push(await moveTrial(first, noteCount, other.fileId));
      } catch {
        failedMoves.push({ trial, problems: first.problems.slice(seen) });
      }
    }
    // A new device for each trial, so each save meets a first sync.
    const firstSyncAnswers: number[] = [];
    for (let trial = 0; trial < firstSyncTrials; trial += 1) {
      const fresh = await openDevice(browser, app);
      try {
        await openNote(fresh, target.fileId);
        await fresh.page.evaluate(installSaveProbe, undefined);
        await caretToEnd(fresh);
        const word = `f${String(trial)}x`;
        await fresh.page.evaluate(armSaveProbe, word);
        await fresh.page.keyboard.type(` ${word}`);
        await fresh.page.keyboard.press('Control+s');
        const deadline = Date.now() + trialTimeoutMs;
        for (;;) {
          const seen = await fresh.page.evaluate(readSaveProbe, undefined);
          const pressed = seen.savePressedAt;
          const request =
            pressed === null
              ? undefined
              : seen.changesets.find((entry) => entry.start >= pressed);
          if (pressed !== null && request !== undefined) {
            firstSyncAnswers.push(request.end - pressed);
            break;
          }
          if (Date.now() > deadline) {
            firstSyncAnswers.push(trialTimeoutMs);
            break;
          }
          await pause(20);
        }
      } finally {
        await fresh.context.close();
      }
    }
    const values = (key: keyof SaveSample): number[] =>
      saves
        .map((sample) => sample[key])
        .filter((value): value is number => value !== null);
    report({
      environment: {
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
      },
      notes: noteCount,
      firstSyncMs,
      saves: {
        trials: saves.length,
        failed: saves.filter((sample) => sample.toSecondDevice === null).length,
        toRequestMs: distribution(values('toRequest')),
        toAnswerMs: distribution(values('toAnswer')),
        toSecondDeviceMs: distribution(values('toSecondDevice')),
        outliers: outliers(
          saves.map((sample) => sample.toSecondDevice ?? trialTimeoutMs),
          outlierMs,
        ),
      },
      firstSyncSaves: {
        trials: firstSyncAnswers.length,
        toAnswerMs: distribution(firstSyncAnswers),
      },
      moves: {
        trials: moves.length + failedMoves.length,
        failed: failedMoves,
        toListMs: distribution(moves),
        outliers: outliers(moves, outlierMs),
      },
      problems: [...first.problems, ...second.problems],
    });
  } finally {
    await browser.close();
  }
} finally {
  await app.stop();
}
