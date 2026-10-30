/** The Playwright API used by the local browser audit. No browser is bundled. */
export type Locator = {
  screenshot(options: {
    path: string;
    animations?: 'disabled';
  }): Promise<unknown>;
  click(): Promise<void>;
  hover(): Promise<void>;
  nth(index: number): Locator;
  focus(): Promise<void>;
  fill(value: string): Promise<void>;
  press(key: string): Promise<void>;
  waitFor(): Promise<void>;
  first(): Locator;
  filter(options: { visible: boolean }): Locator;
  count(): Promise<number>;
  locator(selector: string): Locator;
  and(locator: Locator): Locator;
  getByRole(
    role: string,
    options?: { name: string; exact?: boolean; level?: number },
  ): Locator;
  getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
  getByLabel(label: string, options?: { exact?: boolean }): Locator;
  scrollIntoViewIfNeeded(): Promise<void>;
  evaluate<T>(run: (element: HTMLElement) => T): Promise<Awaited<T>>;
  boundingBox(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>;
};
export type Request = { method(): string; url(): string };
type Response = { json(): Promise<unknown> };
type Route = {
  request(): Request & { isNavigationRequest(): boolean };
  continue(): Promise<void>;
  fetch(): Promise<Response>;
  fulfill(options: {
    response?: Response;
    json?: unknown;
    body?: Uint8Array;
    contentType?: string;
  }): Promise<void>;
};
export type Page = {
  waitForURL(url: string): Promise<void>;
  goto(url: string): Promise<unknown>;
  locator(selector: string): Locator;
  getByRole(
    role: string,
    options?: { name: string; exact?: boolean; level?: number },
  ): Locator;
  getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
  getByLabel(label: string, options?: { exact?: boolean }): Locator;
  setDefaultTimeout(timeout: number): void;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  on(event: 'pageerror', callback: (error: Error) => void): void;
  on(event: 'request', callback: (request: Request) => void): void;
  evaluate<T>(run: () => T): Promise<Awaited<T>>;
  evaluate<T, A>(run: (argument: A) => T, argument: A): Promise<Awaited<T>>;
  screenshot(options: {
    path: string;
    animations?: 'disabled';
  }): Promise<unknown>;
  keyboard: { press(key: string): Promise<void> };
  mouse: { move(x: number, y: number): Promise<void> };
};
type Context = {
  unrouteAll(options: { behavior: 'wait' | 'ignoreErrors' }): Promise<void>;
  newCDPSession(page: Page): Promise<{
    send(method: string, params: Record<string, unknown>): Promise<unknown>;
  }>;
  addInitScript<A>(run: (argument: A) => void, argument: A): Promise<void>;
  route(
    pattern: string,
    callback: (route: Route) => Promise<void>,
  ): Promise<void>;
  newPage(): Promise<Page>;
  close(): Promise<void>;
};
export type Browser = {
  newContext(options: {
    storageState?: string;
    viewport: { width: number; height: number };
    hasTouch: boolean;
    isMobile: boolean;
    colorScheme: 'light' | 'dark';
    reducedMotion?: 'reduce' | 'no-preference';
  }): Promise<Context>;
  contexts(): Context[];
  close(): Promise<void>;
};
type Chromium = { launch(): Promise<Browser> };
/** Check the external module before its browser API is used. */
export function hasChromium(value: unknown): value is { chromium: Chromium } {
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
/** Accept object data only after JSON validation. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read local compiled assets during source checks, before the one image build. */
export async function routeAuditAssets(context: Context): Promise<void> {
  const assets = process.env.UI_AUDIT_ASSETS;
  if (!assets) return;
  const { resolve, extname } = await import('node:path'),
    { existsSync, readFileSync } = await import('node:fs');
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ response: await route.fetch() });
    if (request.method() !== 'GET') return route.continue();
    const path = resolve(
      assets,
      request.isNavigationRequest() ? 'index.html' : `.${url.pathname}`,
    );
    if (!path.startsWith(resolve(assets) + '/') || !existsSync(path))
      return route.continue();
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.woff2': 'font/woff2',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    return route.fulfill({
      body: readFileSync(path),
      contentType: types[extname(path)] ?? 'application/octet-stream',
    });
  });
}
