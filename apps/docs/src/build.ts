/**
 * Builds the documentation site into a folder of static files.
 *
 * This is the one module of the site that reads and writes files. It reads the
 * guide, renders each page through the one renderer, writes each page, its
 * Markdown copy and the files for agents, copies the built stylesheet and the
 * fonts of `apps/web`, compiles the client script, and indexes the pages with
 * Pagefind (records 0152 and 0153). Every decision it carries out is made by a
 * pure module beside it.
 *
 * Run it with `pnpm docs:build` after `pnpm build`. `NOTESAPP_DOCS_BASE` and
 * `NOTESAPP_DOCS_ORIGIN` name the address the site is served from.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pagefind from 'pagefind';
import { renderMarkdown } from '@notesapp/markdown';
import {
  llmsFull,
  llmsIndex,
  markdownCopy,
  robots,
  sitemap,
} from './agents.ts';
import { rebaseFonts, shellAssets } from './assets.ts';
import {
  guideFolder,
  indexFile,
  indexProblems,
  readGuideIndex,
  readGuidePage,
  readingOrder,
  type GuidePage,
} from './guide.ts';
import { htmlDestination, pageHref, repositoryHref } from './links.ts';
import { joinSoftBreaks } from './prose.ts';
import {
  missingDocument,
  pageDocument,
  type PageLink,
  type SiteAssets,
} from './page.ts';
import { readSiteSettings, socialPreview, type SiteSettings } from './site.ts';
import {
  apiDocumentFile,
  apiDownload,
  apiReference,
  apiContractSource,
} from './api-reference.ts';

/** The folder of this package. */
const packageDirectory = resolve(fileURLToPath(import.meta.url), '../..');

/** The root of the repository. */
export const repositoryRoot = resolve(packageDirectory, '../..');

/** Where the site goes unless the caller names another folder. */
export const defaultOutput = join(packageDirectory, 'dist/site');

/** What one build reads and where it writes. */
export type BuildInput = {
  readonly settings: SiteSettings;
  /** The folder of the guide. */
  readonly guide: string;
  /** The built web application, which holds the stylesheet and the fonts. */
  readonly web: string;
  /** The folder that the site is written to. Its old content is removed. */
  readonly output: string;
  /** The root of the repository, which a link out of the guide names. */
  readonly repository: string;
};

/** What one build wrote. */
export type BuildResult = {
  readonly pages: readonly GuidePage[];
  /** How many pages the search index holds. */
  readonly indexed: number;
};

/** Writes one file, with the folders above it. */
async function write(
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

/** Copies the built stylesheet, the fonts and the icon of the application. */
async function copyAssets(
  input: BuildInput,
  scriptName: string,
): Promise<SiteAssets> {
  const shell = shellAssets(
    await readFile(join(input.web, 'index.html'), 'utf8'),
  );
  const { base } = input.settings;
  const stylesheets: string[] = [];
  for (const href of shell.stylesheets) {
    const css = await readFile(join(input.web, href), 'utf8');
    await write(join(input.output, href), rebaseFonts(css));
    stylesheets.push(`${base}${href.slice(1)}`);
  }
  await cp(join(input.web, 'fonts'), join(input.output, 'fonts'), {
    recursive: true,
    filter: (source) => !/\.(?:br|gz)$/.test(source),
  });
  for (const name of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'])
    await cp(join(input.web, name), join(input.output, name));
  await cp(
    join(packageDirectory, 'images', socialPreview.file),
    join(input.output, socialPreview.file),
  );
  let icon: string | null = null;
  if (shell.icon !== null) {
    await cp(join(input.web, shell.icon), join(input.output, shell.icon));
    icon = `${base}${shell.icon.slice(1)}`;
  }
  return { stylesheets, icon, script: `${base}assets/${scriptName}` };
}

/** Compiles the client script into the assets of the site. */
async function compileClient(output: string): Promise<string> {
  const compiled = join(packageDirectory, 'dist/client');
  await rm(compiled, { recursive: true, force: true });
  execFileSync(
    join(packageDirectory, 'node_modules/.bin/tsc'),
    ['-p', join(packageDirectory, 'tsconfig.client.json')],
    { stdio: 'inherit' },
  );
  for (const name of await readdir(compiled))
    if (name.endsWith('.js'))
      await cp(join(compiled, name), join(output, 'assets', name));
  return 'docs.js';
}

/** Builds the whole site. */
export async function buildSite(input: BuildInput): Promise<BuildResult> {
  const { settings } = input;
  const names = (await readdir(input.guide)).filter((name) =>
    name.endsWith('.md'),
  );
  const index = await readFile(join(input.guide, indexFile), 'utf8');
  const guideGroups = readGuideIndex(index);
  const problems = indexProblems(names, guideGroups);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  const order = readingOrder(guideGroups);
  const guidePages = await Promise.all(
    order.map(async (file) =>
      readGuidePage(file, await readFile(join(input.guide, file), 'utf8')),
    ),
  );
  const apiSource = await readFile(
    join(input.repository, apiDocumentFile),
    'utf8',
  );
  const apiValue: unknown = JSON.parse(apiSource);
  const api = apiReference(apiValue);
  const groups = [...guideGroups, api.group];
  const generated = new Set(api.pages.map((page) => page.file));
  if (order.some((file) => generated.has(file)))
    throw new Error('A guide page uses the name of a generated API page.');
  const pages = [...guidePages, ...api.pages];
  const files = new Set(pages.map((page) => page.file));
  const groupOf = new Map(
    groups.flatMap((group) =>
      group.pages.map((entry) => [entry.file, group.title]),
    ),
  );
  const linkOf = (page: GuidePage | undefined): PageLink | null =>
    page === undefined
      ? null
      : { title: page.title, href: pageHref(settings, page.slug) };

  await rm(input.output, { recursive: true, force: true });
  await mkdir(input.output, { recursive: true });
  await write(join(input.output, apiDownload), apiSource);
  const script = await compileClient(input.output);
  const assets = await copyAssets(input, script);

  // The Node API of Pagefind runs a service process, so it stops on every
  // path out of the index, or a failed build would never end.
  let indexed = 0;
  try {
    const created = await pagefind.createIndex({ forceLanguage: 'en' });
    if (created.index === undefined)
      throw new Error(`Pagefind did not start: ${created.errors.join(' ')}`);
    const search = created.index;
    for (const [at, page] of pages.entries()) {
      const html = await renderMarkdown(joinSoftBreaks(page.source), {
        sourcePath: `${guideFolder}/${page.file}`,
        noteHref: (target) =>
          htmlDestination(settings, files, target, (path) =>
            existsSync(join(input.repository, path)),
          ),
      });
      const markdown = markdownCopy(settings, files, page);
      const document = pageDocument({
        settings,
        assets,
        groups,
        page,
        group: groupOf.get(page.file) ?? null,
        html,
        markdown,
        previous: linkOf(pages[at - 1]),
        next: linkOf(pages[at + 1]),
        ...(generated.has(page.file)
          ? {
              sourceHref: repositoryHref(apiContractSource),
              ...(page.file === 'api-reference.md'
                ? {}
                : { outlineDepth: 2 as const }),
            }
          : {}),
      });
      const folder =
        page.slug === '' ? input.output : join(input.output, page.slug);
      await write(join(folder, 'index.html'), document);
      await write(
        join(input.output, `${page.slug === '' ? 'index' : page.slug}.md`),
        markdown,
      );
      const added = await search.addHTMLFile({
        url: pageHref(settings, page.slug),
        content: document,
      });
      if (added.errors.length > 0)
        throw new Error(
          `Pagefind refused ${page.file}: ${added.errors.join(' ')}`,
        );
      indexed += 1;
    }
    // Pagefind 1.5.2 can return from writeFiles before its buffered writes
    // finish. Closing its service can then leave empty or partial files.
    // Read the bytes instead and await Node's file writes before closing.
    const generated = await search.getFiles();
    if (generated.errors.length > 0)
      throw new Error(`Pagefind did not write: ${generated.errors.join(' ')}`);
    for (const file of generated.files)
      await write(join(input.output, 'pagefind', file.path), file.content);
  } finally {
    await pagefind.close();
  }

  const home = pages[0];
  if (home === undefined) throw new Error('The guide holds no index page.');
  await write(
    join(input.output, '404.html'),
    missingDocument(settings, assets, groups),
  );
  await write(
    join(input.output, 'llms.txt'),
    llmsIndex(settings, groups, home),
  );
  await write(
    join(input.output, 'llms-full.txt'),
    llmsFull(settings, files, pages),
  );
  await write(join(input.output, 'robots.txt'), robots(settings));
  const map = sitemap(settings, pages);
  if (map !== null) await write(join(input.output, 'sitemap.xml'), map);
  return { pages, indexed };
}

/** The build of the command line, from the environment of the process. */
async function main(): Promise<void> {
  const settings = readSiteSettings(process.env);
  const output = resolve(process.argv[2] ?? defaultOutput);
  const result = await buildSite({
    settings,
    guide: join(repositoryRoot, guideFolder),
    web: join(repositoryRoot, 'apps/web/dist/web'),
    output,
    repository: repositoryRoot,
  });
  process.stdout.write(
    `Docs: ${String(result.pages.length)} pages and a search index of ${String(result.indexed)} pages in ${output}, served at ${settings.origin ?? ''}${settings.base}.\n`,
  );
}

if (import.meta.main) await main();
