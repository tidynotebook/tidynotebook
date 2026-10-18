import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {
  appIcons,
  emittedImages,
  iconBuiltAddress,
  iconDirectory,
  iconLinkElements,
  iconSourceAddress,
  iconSourceAddresses,
  type IconAddresses,
} from './src/pwa/icons.ts';
import { precacheWorker } from './src/pwa/precache.ts';
import { productName, productShortName } from '@notesapp/core';
import { defaultThemeFor } from '@notesapp/ui';
import { devicePaletteCss, themeRegistryData } from './src/lib/first-paint.ts';
import { startFailureMarkup } from './src/start-failure.ts';
import { preloadOnlyUncontrolled } from './src/pwa/module-preload.ts';
import {
  fontAddresses,
  frameDocumentSource,
  inlineFontFaces,
} from './src/diagram/frame-document.ts';

// The JSX transform comes from Vite's built-in esbuild support with the
// automatic runtime, so no framework plugin is needed for the production
// build. TypeScript package output stays in `dist`, while deployable browser
// assets use `dist/web`. This separation lets every Vite build clean all old
// hashed assets without deleting package declarations or compiled modules.
//
// The diagram frame is built on its own and emitted as one self-contained
// document; see `diagramFrame` below.
//
// The installed worker is compiled by `precacheWorker` in
// `src/pwa/precache.ts`, which writes the addresses of this build and the
// name of their cache into it. Registration takes no clients and performs no
// skip waiting on its own, so old assets stay installed while old clients
// remain active and the update applies only after local persistence succeeds.
// The worker itself claims no client either, and it registers after the
// `load` event, so it never competes with the document that installs it; see
// decision 0044. Background Sync is never used; the foreground tab drives
// sync.
//
// After the build, `tools/precompress-assets.mjs` writes a `.br` and a `.gz`
// neighbour for every compressible emitted file. The Fastify static handler
// serves the one that the browser accepts, so nothing is compressed per
// request. A `.map` file is left uncompressed: no shipped file names it.

/** Matches the editor engine packages that load with the note surface. */
const editorEngine =
  /[\\/]node_modules[\\/](?:@codemirror|@lezer|@marijn|style-mod|w3c-keyname|crelt)[\\/]/;

/** The built location of the diagram frame, matching the development path. */
const framePath = 'src/diagram/frame.html';

/** The placeholder that the theme data replaces inside the shell document. */
const themePlaceholder = '__NOTESAPP_THEMES__';

/** The placeholder of the product name in the title and the description. */
const productNamePlaceholder = '__NOTESAPP_PRODUCT_NAME__';

/** The placeholder of the first browser interface colour of the shell. */
const themeColourPlaceholder = '__NOTESAPP_THEME_COLOUR__';

/** The served name of the installed application manifest. */
const manifestPath = 'manifest.webmanifest';

/** The placeholder that the icon links of the shell replace. */
const iconLinkPlaceholder = '__NOTESAPP_ICON_LINKS__';

/**
 * The placeholders of the two screens of a start that failed before the
 * first render (record 0161, `src/start-failure.ts`).
 */
const startFailurePlaceholders = {
  load: '__NOTESAPP_START_FAILURE_LOAD__',
  stop: '__NOTESAPP_START_FAILURE_STOP__',
} as const;

/** One icon of the installed application manifest. */
export type WebManifestIcon = {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose: string;
};

/** The installed application manifest, before it is serialized. */
export type WebManifestDocument = {
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: string;
  readonly orientation: string;
  readonly background_color: string;
  readonly theme_color: string;
  readonly icons: readonly WebManifestIcon[];
};

/**
 * The installed application manifest.
 *
 * The interface colour is the page background of the default dark theme, so
 * the manifest cannot drift from the registry. A theme change repaints the
 * `theme-color` element of the live document as well.
 *
 * The shape is declared here, where the value is built, so a reader of the
 * text does not have to claim one.
 */
export function webManifestDocument(
  addresses: IconAddresses,
): WebManifestDocument {
  const theme = defaultThemeFor('dark');
  return {
    name: productName,
    short_name: productShortName,
    description: 'Offline notes with versioned history.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: theme.tokens.background,
    theme_color: theme.tokens.background,
    icons: appIcons
      .filter((icon) => icon.purpose !== null)
      .map((icon) => ({
        src: addresses[icon.file] ?? '',
        sizes: icon.sizes ?? 'any',
        type: icon.type,
        purpose: String(icon.purpose),
      })),
  };
}

/** The installed application manifest, serialized. */
export function webManifest(addresses: IconAddresses): string {
  return `${JSON.stringify(webManifestDocument(addresses), null, 2)}\n`;
}

/** The one application stylesheet, which the palette below joins. */
const applicationStylesheet = resolve(import.meta.dirname, 'src/tailwind.css');

/**
 * Appends the palette of a page with no script to the one stylesheet.
 *
 * A published page and a legal page load this stylesheet and hold no script,
 * so the stylesheet itself states the Default palette of each preference of
 * the device (record 0151). The text comes from the registry at the build,
 * so `src/tailwind.css` holds no colour value for it. It runs before the
 * Tailwind compiler, which then treats it as any other rule.
 */
function devicePalette(): Plugin {
  return {
    name: 'notesapp-device-palette',
    enforce: 'pre',
    transform(code: string, id: string): string | null {
      if (id.split('?')[0] !== applicationStylesheet) return null;
      return `${code}\n${devicePaletteCss()}`;
    },
  };
}

/**
 * Moves the preload links of the entry into a script that adds them only on
 * a load that no service worker controls (record 0180). It runs after Vite
 * wrote the links into the shell.
 */
function entryPreload(): Plugin {
  return {
    name: 'notesapp-entry-preload',
    transformIndexHtml: {
      order: 'post',
      handler: (html: string): string => preloadOnlyUncontrolled(html),
    },
  };
}

/**
 * Emits every icon under a name that follows its bytes, and writes the
 * theme registry into the shell document and the manifest.
 *
 * The palette outputs are generated from `@notesapp/ui`, so a colour lives in
 * exactly one place: adding a theme changes one data file and nothing here
 * (audit UI-48). The icon addresses are generated from `appIcons`, so the
 * shell document and the manifest cannot name an icon the build does not
 * write, and a new drawing reaches every browser at once (0074).
 *
 * The development server holds no build, so it answers the source address of
 * each icon and the manifest that names those addresses.
 */
function themeAssets(directory: string): Plugin {
  /** The address of each icon of this build, filled before the shell. */
  let addresses: IconAddresses = iconSourceAddresses();

  /** The bytes of each icon, read once. */
  const bytes = new Map<string, Uint8Array>();

  /** Whether this run emits files. The development server emits none. */
  let emits = false;

  return {
    name: 'notesapp-theme-assets',
    configResolved(resolved): void {
      emits = resolved.command === 'build';
    },
    // The icons are read and named here, so the shell transform and the
    // manifest below both read one filled map. The development server holds
    // no emitted file, so it keeps the source address of each icon and the
    // middleware below answers it.
    async buildStart(): Promise<void> {
      if (!emits) return;
      const built: Record<string, string> = {};
      for (const icon of emittedImages) {
        const source = await readFile(
          resolve(directory, iconDirectory, icon.file),
        );
        bytes.set(icon.file, source);
        built[icon.file] = iconBuiltAddress(
          icon.file,
          createHash('sha256').update(source).digest('hex'),
        );
      }
      addresses = built;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html: string): string {
        return html
          .replaceAll(productNamePlaceholder, productName)
          .replace(themePlaceholder, () => themeRegistryData())
          .replace(
            themeColourPlaceholder,
            () => defaultThemeFor('dark').tokens.background,
          )
          .replace(iconLinkPlaceholder, () => iconLinkElements(addresses))
          .replace(startFailurePlaceholders.load, () =>
            startFailureMarkup('load'),
          )
          .replace(startFailurePlaceholders.stop, () =>
            startFailureMarkup('stop'),
          );
      },
    },
    configureServer(server): void {
      server.middlewares.use((request, response, next): void => {
        const url = (request.url ?? '').split('?')[0] ?? '';
        if (url.startsWith(`/${manifestPath}`)) {
          response.setHeader('content-type', 'application/manifest+json');
          response.end(webManifest(addresses));
          return;
        }
        const icon = emittedImages.find(
          (one) => iconSourceAddress(one.file) === url,
        );
        if (icon === undefined) {
          next();
          return;
        }
        response.setHeader('content-type', icon.type);
        readFile(resolve(directory, iconDirectory, icon.file)).then(
          (source) => {
            response.end(source);
          },
          () => {
            next();
          },
        );
      });
    },
    generateBundle(): void {
      for (const icon of emittedImages) {
        const source = bytes.get(icon.file);
        const fileName = addresses[icon.file];
        if (source === undefined || fileName === undefined)
          throw new Error(`The build read no bytes for ${icon.file}.`);
        this.emitFile({
          type: 'asset',
          fileName: fileName.slice(1),
          source,
        });
      }
      this.emitFile({
        type: 'asset',
        fileName: manifestPath,
        source: webManifest(addresses),
      });
    },
  };
}

/**
 * Emits the diagram frame as one self-contained document.
 *
 * The frame runs sandboxed without `allow-same-origin`, so its origin is
 * opaque and every request it makes is cross origin. A normal build splits
 * Mermaid into chunks that the frame then cannot load, which is exactly the
 * failure QA-04 recorded. This plugin therefore builds the frame entry on
 * its own with `inlineDynamicImports`, so Rollup produces one script, and
 * writes that script and the frame stylesheet straight into the HTML. The
 * frame needs no network at all afterwards.
 *
 * The frame entry imports `src/tailwind.css` as the application does, and
 * the nested build compiles it with the same Tailwind plugin, so the frame
 * sets its text in the face of the product and holds no style of its own
 * (record 0061). A face file of `public/fonts` would be a cross origin
 * request as well, so each one travels inside the stylesheet
 * (`src/diagram/frame-document.ts`).
 *
 * The nested build sets `configFile: false`, so it never loads this
 * configuration again and cannot recurse.
 */
function diagramFrame(directory: string): Plugin {
  return {
    name: 'notesapp-diagram-frame',
    apply: 'build',
    async generateBundle(): Promise<void> {
      const result = await build({
        configFile: false,
        root: directory,
        logLevel: 'warn',
        plugins: [tailwindcss()],
        build: {
          write: false,
          target: 'es2024',
          minify: true,
          // One stylesheet beside the script, which the plugin writes into
          // the document, and no code that injects a style at run time.
          cssCodeSplit: false,
          rollupOptions: {
            input: resolve(directory, 'src/diagram/frame-main.ts'),
            output: { format: 'iife', inlineDynamicImports: true },
          },
        },
      });
      const outputs = (Array.isArray(result) ? result : [result]).flatMap(
        (one) => ('output' in one ? one.output : []),
      );
      const code = outputs
        .filter((chunk) => chunk.type === 'chunk')
        .map((chunk) => chunk.code)
        .join('\n');
      const styles = outputs
        .filter(
          (asset) => asset.type === 'asset' && asset.fileName.endsWith('.css'),
        )
        .map((asset) => String(asset.type === 'asset' ? asset.source : ''))
        .join('\n');
      const fonts = new Map<string, string>();
      for (const address of fontAddresses(styles)) {
        const bytes = await readFile(
          resolve(directory, 'public', `.${address}`),
        );
        fonts.set(address, bytes.toString('base64'));
      }
      const template = await readFile(
        resolve(directory, 'src/diagram/frame.html'),
        'utf8',
      );
      const source = frameDocumentSource(
        template,
        inlineFontFaces(styles, fonts),
        code,
      );
      this.emitFile({ type: 'asset', fileName: framePath, source });
    },
  };
}

/**
 * The name of the one script of a published page, before its hash.
 *
 * `publishedPageScriptHref` in `apps/server/src/plugins/static-assets.ts`
 * finds the file by this name, and `tests/integration/web-build.test.ts`
 * holds the two together.
 */
export const publishedPageScriptName = 'published-page';

/**
 * Emits the one script of a published page as one file (records 0158 and
 * 0174), which draws its diagrams and copies its code blocks.
 *
 * The content policy of a published page names this one file by its address,
 * so the script cannot load a chunk of its own. This plugin builds the entry
 * alone with `inlineDynamicImports`, as `diagramFrame` does, and emits it
 * under a name that carries the hash of its bytes, so the browser keeps it as
 * long as it likes.
 */
function publishedPageScript(directory: string): Plugin {
  return {
    name: 'notesapp-published-page-script',
    apply: 'build',
    async generateBundle(): Promise<void> {
      const result = await build({
        configFile: false,
        root: directory,
        logLevel: 'warn',
        build: {
          write: false,
          target: 'es2024',
          minify: true,
          rollupOptions: {
            input: resolve(directory, 'src/published/page.ts'),
            output: { format: 'iife', inlineDynamicImports: true },
          },
        },
      });
      const code = (Array.isArray(result) ? result : [result])
        .flatMap((one) => ('output' in one ? one.output : []))
        .filter((chunk) => chunk.type === 'chunk')
        .map((chunk) => chunk.code)
        .join('\n');
      if (code === '')
        throw new Error('The script of a published page is empty.');
      const hash = createHash('sha256')
        .update(code)
        .digest('base64url')
        .slice(0, 8);
      this.emitFile({
        type: 'asset',
        fileName: `assets/${publishedPageScriptName}-${hash}.js`,
        source: code,
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    // A source map is emitted but no shipped file names it, so no browser
    // downloads one and an operator who keeps the build can still resolve a
    // stack trace.
    sourcemap: 'hidden',
    target: 'es2024',
    // Every asset is emitted as a file of its own. An inlined asset becomes a
    // `data:` URL, and the content policy of the shell permits a font only
    // from the origin, so an inlined font is blocked and the console reports
    // a policy violation. A file also stays cacheable on its own.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: { main: 'index.html' },
      output: {
        // One group holds the whole editor engine. Without it the bundler
        // spreads CodeMirror over several chunks and puts its own interop
        // helpers in one of them. Every chunk that needs a helper then names
        // that chunk, so the login page preloaded the editor and the initial
        // budget grew by about 140 KB. With the group the helpers stay in a
        // small chunk of their own and the engine loads with the note
        // surface, which is the only screen that needs it.
        advancedChunks: { groups: [{ name: 'editor', test: editorEngine }] },
      },
    },
  },
  server: {
    port: 5173,
  },
  plugins: [
    // First, so the Tailwind compiler reads the palette with the stylesheet.
    devicePalette(),
    tailwindcss(),
    themeAssets(import.meta.dirname),
    ...(command === 'build' ? [entryPreload()] : []),
    ...(command === 'build' ? [diagramFrame(import.meta.dirname)] : []),
    ...(command === 'build' ? [publishedPageScript(import.meta.dirname)] : []),
    // Last, because its hook reads every emitted file of the build, including
    // the application manifest and the diagram frame that the two plugins
    // above emit.
    ...(command === 'build' ? [precacheWorker()] : []),
  ],
}));
