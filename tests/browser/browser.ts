/** The Playwright API used by the local browser audit. No browser is bundled. */
export type Locator = {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  waitFor(): Promise<void>;
  first(): Locator;
  filter(options: { visible: boolean }): Locator;
  count(): Promise<number>;
  locator(selector: string): Locator;
  and(locator: Locator): Locator;
  getByRole(role: string, options?: { name: string; exact?: boolean }): Locator;
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
  fetch(): Promise<Response>;
  fulfill(options: { response?: Response; json: unknown }): Promise<void>;
};
export type Page = {
  goto(url: string): Promise<unknown>;
  locator(selector: string): Locator;
  getByRole(role: string, options?: { name: string; exact?: boolean }): Locator;
  getByLabel(label: string, options?: { exact?: boolean }): Locator;
  setDefaultTimeout(timeout: number): void;
  on(event: 'pageerror', callback: (error: Error) => void): void;
  on(event: 'request', callback: (request: Request) => void): void;
  evaluate<T>(run: () => T): Promise<Awaited<T>>;
  evaluate<T, A>(run: (argument: A) => T, argument: A): Promise<Awaited<T>>;
  screenshot(options: {
    path: string;
    animations?: 'disabled';
  }): Promise<unknown>;
  keyboard: { press(key: string): Promise<void> };
};
type Context = {
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
