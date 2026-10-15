/**
 * What the browser measurements of this directory share.
 *
 * A browser measurement starts the built application on a new database
 * (`tests/integration/support/dev-app.ts`), seeds the corpus of the audit of
 * 2026-10-02 through the generated client, and drives a headless Chromium.
 * The repository holds no browser dependency (record 0066), so Chromium comes
 * from a local Playwright install
 * in `.local-app/`. The part of Playwright that the tools use is typed
 * below, and the module is checked against it when it loads.
 *
 * Every number that a tool prints is a measured result. It belongs in the
 * report of the run, never in a document.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  createFile,
  listFiles,
  listWorkspaces,
  signInWithPassword,
} from '@notesapp/api-client';
import {
  startLocalApplication,
  type LocalApplication,
} from '../../tests/integration/support/dev-app.ts';
import { firstSave } from '../../tests/integration/support/documents.ts';
import { corpusPlan, type PlannedNote } from './samples.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The size of a laptop screen, which every screen of the design supports. */
export const laptop = { width: 1280, height: 800 } as const;

/** One located element, as far as the tools use it. */
export type Locator = {
  click(): Promise<void>;
  fill(text: string): Promise<void>;
  first(): Locator;
  waitFor(options?: { readonly timeout?: number }): Promise<void>;
};

/** One Chrome DevTools Protocol session of a page. */
export type CdpSession = {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
};

/** One page, as far as the tools use it. */
export type Page = {
  goto(url: string): Promise<unknown>;
  url(): string;
  locator(selector: string): Locator;
  getByRole(role: string, options: { readonly name: string }): Locator;
  getByText(text: string, options?: { readonly exact?: boolean }): Locator;
  waitForURL(url: RegExp): Promise<void>;
  waitForLoadState(state: 'networkidle'): Promise<void>;
  evaluate<Result, Argument>(
    run: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ): Promise<Result>;
  keyboard: {
    press(key: string): Promise<void>;
    type(text: string): Promise<void>;
  };
  waitForFunction<Argument>(
    check: (argument: Argument) => boolean,
    argument: Argument,
    options?: { readonly timeout?: number },
  ): Promise<unknown>;
  screenshot(options: { readonly path: string }): Promise<unknown>;
  on(event: 'pageerror', listener: (error: Error) => void): unknown;
  on(
    event: 'requestfailed',
    listener: (request: {
      url(): string;
      failure(): { readonly errorText: string } | null;
    }) => void,
  ): unknown;
  on(
    event: 'console',
    listener: (message: { type(): string; text(): string }) => void,
  ): unknown;
  close(): Promise<void>;
};

/** One browser context: one device with its own storage. */
export type Context = {
  newPage(): Promise<Page>;
  newCDPSession(page: Page): Promise<CdpSession>;
  addCookies(
    cookies: readonly {
      readonly name: string;
      readonly value: string;
      readonly url: string;
    }[],
  ): Promise<void>;
  addInitScript<Argument>(
    script: (argument: Argument) => void,
    argument: Argument,
  ): Promise<void>;
  cookies(): Promise<
    readonly { readonly name: string; readonly value: string }[]
  >;
  close(): Promise<void>;
};

/** One browser. */
export type Browser = {
  newContext(options: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly colorScheme: 'light' | 'dark';
  }): Promise<Context>;
  close(): Promise<void>;
};

/** The one browser type that the tools launch. */
type Chromium = {
  launch(options?: { readonly args?: readonly string[] }): Promise<Browser>;
};

/** Whether a loaded module holds a Chromium launcher. */
function hasChromium(value: unknown): value is { readonly chromium: Chromium } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'chromium' in value &&
    typeof value.chromium === 'object' &&
    value.chromium !== null &&
    'launch' in value.chromium &&
    typeof value.chromium.launch === 'function'
  );
}

/** What the request watch of a device holds, in the clock of its page. */
type RequestWatch = { lastAt: number; count: number };

declare global {
  interface Window {
    notesappRequests?: RequestWatch;
  }
}

/** Notes the end of every request of the server that a page makes. */
function watchRequests(): void {
  const watch: RequestWatch = { lastAt: 0, count: 0 };
  window.notesappRequests = watch;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (
        entry instanceof PerformanceResourceTiming &&
        entry.name.includes('/api/')
      ) {
        watch.lastAt = Math.max(watch.lastAt, entry.responseEnd);
        watch.count += 1;
      }
  }).observe({ type: 'resource' });
}

/** Whether a page made no request of the server for `quietMs`. */
function requestsQuiet(quietMs: number): boolean {
  const watch = window.notesappRequests;
  return (
    watch !== undefined &&
    watch.count > 0 &&
    performance.now() - watch.lastAt > quietMs
  );
}

/**
 * Whether the device holds a feed cursor, which the store writes when the
 * first snapshot of the workspace is active (`activateSnapshot` in
 * `packages/storage-browser/src/local-store/snapshot.ts`).
 */
function holdsCursor(): Promise<boolean> {
  return new Promise((resolve) => {
    const opened = indexedDB.open('notesapp');
    opened.onerror = () => resolve(false);
    opened.onsuccess = () => {
      const database = opened.result;
      if (!database.objectStoreNames.contains('cursors')) {
        database.close();
        resolve(false);
        return;
      }
      const read = database
        .transaction('cursors', 'readonly')
        .objectStore('cursors')
        .count();
      read.onsuccess = () => {
        database.close();
        resolve(read.result > 0);
      };
      read.onerror = () => {
        database.close();
        resolve(false);
      };
    };
  });
}

/**
 * Waits until the first sync of a device ended and it made no request of the
 * server for two seconds.
 *
 * The first sync of a device reads every note, one revision at a time, and
 * a measurement that ran during it would measure that sync. The cursor shows
 * that the snapshot is active, and the quiet time covers the reads that
 * follow it. The notice stream is a socket and the poll waits longer than
 * this, so a device that holds the workspace goes quiet.
 */
export async function awaitQuiet(device: Device): Promise<void> {
  const deadline = Date.now() + 600_000;
  while (!(await device.page.evaluate(holdsCursor, undefined))) {
    if (Date.now() > deadline)
      throw new Error('The first sync of the device did not end.');
    await pause(250);
  }
  await device.page.waitForFunction(requestsQuiet, 2000, { timeout: 600_000 });
}

/** Launches the headless Chromium of the skill. */
export async function launchChromium(): Promise<Browser> {
  const manifest = join(root, '.local-app/package.json');
  if (!existsSync(join(root, '.local-app/node_modules/playwright')))
    throw new Error(
      'Playwright is not installed. Install Playwright in .local-app first.',
    );
  // The Playwright of `.local-app/` resolves from its own manifest, which a
  // static import of this file cannot name.
  const loaded: unknown = createRequire(manifest)('playwright');
  if (!hasChromium(loaded))
    throw new Error('The installed Playwright has no Chromium launcher.');
  return loaded.chromium.launch();
}

/** A port that nothing listens on now, chosen by the operating system. */
export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => done(port));
    });
  });
}

/** Starts the built application on a free port, with its log kept quiet. */
export async function startApplication(): Promise<LocalApplication> {
  return startLocalApplication(await freePort(), () => {});
}

/** One signed in device and the problems that it met. */
export type Device = {
  readonly context: Context;
  readonly page: Page;
  readonly workspaceId: string;
  readonly problems: string[];
};

/**
 * Opens one device and signs it in, as a new computer does.
 *
 * The answer resolves once the workspace screen shows, which is before the
 * first sync of the device ends.
 */
export async function openDevice(
  browser: Browser,
  app: LocalApplication,
  colorScheme: 'light' | 'dark' = 'light',
): Promise<Device> {
  const context = await browser.newContext({ viewport: laptop, colorScheme });
  await context.addInitScript(watchRequests, undefined);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => {
    problems.push(`page error: ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    problems.push(
      `failed request: ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ''}`,
    );
  });
  page.on('console', (message) => {
    if (message.type() === 'error')
      problems.push(`console error: ${message.text().slice(0, 300)}`);
  });
  await page.goto(app.origin);
  await page.locator('input[type=email]').fill(app.email);
  await page.locator('input[type=password]').fill(app.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/w\//);
  const match = /\/w\/([^/?#]+)/.exec(page.url());
  const workspaceId = match?.[1];
  if (workspaceId === undefined)
    throw new Error('The sign in opened no workspace.');
  return { context, page, workspaceId, problems };
}

/** The session of the owner, signed in through the generated client. */
export type ApiSession = {
  readonly cookie: string;
  readonly workspaceId: string;
};

/** Signs the owner in without a browser and finds the first workspace. */
export async function signInApi(app: LocalApplication): Promise<ApiSession> {
  const signed = await signInWithPassword({
    baseUrl: app.origin,
    headers: { origin: app.origin },
    body: { email: app.email, password: app.password },
  });
  const cookie = (signed.response?.headers.getSetCookie() ?? [])
    .map((value) => (value.split(';')[0] ?? '').trim())
    .filter((value) => value !== '' && !value.endsWith('='))
    .join('; ');
  const listed = await listWorkspaces({
    baseUrl: app.origin,
    headers: { cookie, origin: app.origin },
  });
  const workspaceId = listed.data?.workspaces[0]?.workspaceId;
  if (workspaceId === undefined)
    throw new Error('The owner has no workspace to seed.');
  return { cookie, workspaceId };
}

/**
 * The number of notes that the workspace holds before a seed.
 *
 * A new account starts with a note of its own, so the count that All notes
 * states after a seed is this count and the seed together.
 */
export async function notesBeforeSeed(
  app: LocalApplication,
  session: ApiSession,
): Promise<number> {
  const listed = await listFiles({
    baseUrl: app.origin,
    headers: { cookie: session.cookie, origin: app.origin },
    path: { workspaceId: session.workspaceId },
    query: { limit: 500 },
  });
  if (listed.data === undefined || listed.data.nextCursor != null)
    throw new Error('A seed needs a workspace of fewer than 500 notes.');
  return listed.data.files.filter((file) => file.kind === 'note').length;
}

/** One note of the corpus that the server now holds. */
export type SeededNote = PlannedNote & { readonly fileId: string };

/**
 * Writes the corpus of the audit into the first workspace of the owner.
 *
 * Four writes run at a time, so the seed takes seconds and not minutes. The
 * answer lists every note with its identifier, in the order of the plan.
 */
export async function seedCorpus(
  app: LocalApplication,
  session: ApiSession,
  plan: readonly PlannedNote[] = corpusPlan(),
): Promise<readonly SeededNote[]> {
  const seeded = new Map<string, SeededNote>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < plan.length) {
      const note = plan[next];
      next += 1;
      if (note === undefined) return;
      const fileId = randomUUID();
      const made = await createFile({
        baseUrl: app.origin,
        headers: { cookie: session.cookie, origin: app.origin },
        path: { workspaceId: session.workspaceId },
        body: {
          fileId,
          path: note.path,
          document: firstSave(note.text),
          revisionId: randomUUID(),
          mutationId: randomUUID(),
          deviceId: 'performance-seed',
        },
      });
      if (made.error !== undefined)
        throw new Error(`The seed of ${note.path} was refused.`);
      seeded.set(note.path, { ...note, fileId });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return plan.map((note) => {
    const found = seeded.get(note.path);
    if (found === undefined) throw new Error('A seeded note is missing.');
    return found;
  });
}

/**
 * Waits until the open device lists every note and its first sync ended.
 *
 * All notes states the count of the notes that the device lists, and the
 * first sync reads every note, so the device holds the corpus once the count
 * is the size of the corpus and the device went quiet. The answer is how
 * long the first sync took, from the call.
 */
export async function awaitNoteCount(
  device: Device,
  count: number,
): Promise<number> {
  const started = performance.now();
  await device.page.goto(
    new URL(`/w/${device.workspaceId}`, device.page.url()).href,
  );
  await device.page
    .getByText(`${String(count)} notes`, { exact: true })
    .first()
    .waitFor({ timeout: 120_000 });
  await awaitQuiet(device);
  return Math.round(performance.now() - started);
}

/** Waits for `milliseconds`, which only a timer of the application needs. */
export function pause(milliseconds: number): Promise<void> {
  return new Promise((done) => setTimeout(done, milliseconds));
}

/** Writes one report object as JSON. */
export function report(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
