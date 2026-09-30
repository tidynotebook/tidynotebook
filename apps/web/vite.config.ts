import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {
  appIcons,
  iconBuiltAddress,
  iconDirectory,
  iconLinkElements,
  iconSourceAddress,
  iconSourceAddresses,
  type IconAddresses,
} from './src/pwa/icons.ts';
import { precacheWorker } from './src/pwa/precache.ts';
import {
  defaultThemeFamilyId,
  defaultThemeFor,
  themeFamilies,
} from '@notesapp/ui';
import {
  inlinePropertyNames,
  inlineVariants,
  type InlineThemeVariant,
  type InlineThemeVariants,
} from './src/lib/first-paint.ts';

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

/** The placeholder of the first browser interface colour of the shell. */
const themeColourPlaceholder = '__NOTESAPP_THEME_COLOUR__';

/** The served name of the installed application manifest. */
const manifestPath = 'manifest.webmanifest';

/** The placeholder that the icon links of the shell replace. */
const iconLinkPlaceholder = '__NOTESAPP_ICON_LINKS__';

/** One theme of the registry as the inline script receives it. */
export type { InlineThemeVariant };

/** The whole registry as the inline script receives it. */
export type InlineThemes = {
  readonly fallback: string;
  readonly properties: readonly string[];
  readonly families: Readonly<Record<string, InlineThemeVariants>>;
};

/**
 * The palette data of the script that runs before the first paint.
 *
 * The names are written once, and every theme lists its values in that same
 * order, so the whole registry stays small inside the document. The script
 * reads the stored family and appearance and writes the properties, which is
 * why a reload never shows the wrong palette.
 *
 * The shape is declared here, where the value is built, so a reader of the
 * text does not have to claim one.
 */
export function themeRegistry(): InlineThemes {
  const families: Record<string, InlineThemeVariants> = {};
  for (const family of themeFamilies)
    families[family.id] = inlineVariants(family);
  return {
    fallback: defaultThemeFamilyId,
    properties: inlinePropertyNames(),
    families,
  };
}

/** The palette data of the inline script, serialized. */
export function themeRegistryData(): string {
  return JSON.stringify(themeRegistry());
}

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
    name: 'Notesapp',
    short_name: 'Notes',
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
      for (const icon of appIcons) {
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
          .replace(themePlaceholder, () => themeRegistryData())
          .replace(
            themeColourPlaceholder,
            () => defaultThemeFor('dark').tokens.background,
          )
          .replace(iconLinkPlaceholder, () => iconLinkElements(addresses));
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
        const icon = appIcons.find(
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
      for (const icon of appIcons) {
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
 * writes that script and the frame styles straight into the HTML. The frame
 * needs no network at all afterwards.
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
        build: {
          write: false,
          target: 'es2024',
          minify: true,
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
      if (code === '') throw new Error('The diagram frame produced no script.');
      // A literal closing tag inside the code would end the inline script.
      const inlineCode = code.replaceAll('</script', '<\\/script');
      const template = await readFile(
        resolve(directory, 'src/diagram/frame.html'),
        'utf8',
      );
      // The replacement is a function on purpose: minified code holds `$&`
      // and `$\`` sequences that a string replacement would expand.
      const source = template.replace(
        '<script type="module" src="./frame-main.ts"></script>',
        () =>
          `${styles === '' ? '' : `<style>${styles}</style>`}<script>${inlineCode}</script>`,
      );
      this.emitFile({ type: 'asset', fileName: framePath, source });
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
    tailwindcss(),
    themeAssets(import.meta.dirname),
    ...(command === 'build' ? [diagramFrame(import.meta.dirname)] : []),
    // Last, because its hook reads every emitted file of the build, including
    // the application manifest and the diagram frame that the two plugins
    // above emit.
    ...(command === 'build' ? [precacheWorker()] : []),
  ],
}));
