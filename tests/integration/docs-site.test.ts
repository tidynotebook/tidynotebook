/**
 * The documentation site, as a host serves it (records 0152 and 0153).
 *
 * The test builds the site under a base path into a temporary folder, the way
 * `pnpm docs:build` builds it for `https://docs.example.test/notesapp/`, and reads
 * the files a host would serve. It proves what the pure modules of
 * `apps/docs/src` cannot prove alone: every page of the guide is there, every
 * link of the site reaches a file and every fragment reaches a heading, every
 * class of a page is in the built stylesheet with the Default palettes of the
 * device, the search index holds every page, and the files for agents name
 * every page.
 *
 * It also holds the two reference pages of the guide to the lists of the code,
 * so a new section of Settings or a new variable of the server reaches the
 * documentation in the change that adds it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { serverVariables } from '@notesapp/server';
import { migrationVariables } from '@notesapp/storage-server';
import { operations } from '@notesapp/api-contract';
import {
  apiDocumentFile,
  apiDownload,
} from '../../apps/docs/src/api-reference.ts';
import { buildSite } from '../../apps/docs/src/build.ts';
import { socialPreview } from '../../apps/docs/src/site.ts';
import {
  administrationSections,
  settingsSections,
} from '../../apps/web/src/lib/page-sections.ts';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const guide = join(root, 'docs/guide');
const base = '/notesapp/';
const origin = 'https://docs.example.test';
const output = await mkdtemp(join(tmpdir(), 'notesapp-docs-'));
const result = await buildSite({
  settings: { base, origin },
  guide,
  web: join(root, 'apps/web/dist/web'),
  output,
  repository: root,
});

/** The file that a host serves for one address of the site, or `null`. */
async function served(address: string): Promise<string | null> {
  const url = new URL(address, `${origin}${base}`);
  if (url.origin !== origin || !url.pathname.startsWith(base)) return null;
  const path = decodeURIComponent(url.pathname.slice(base.length));
  const file = join(
    output,
    path === '' || path.endsWith('/') ? `${path}index.html` : path,
  );
  const info = await stat(file).catch(() => null);
  return info?.isFile() === true ? file : null;
}

/** Every page of the build, with its address and its document. */
const pages = await Promise.all(
  result.pages.map(async (page) => ({
    page,
    address: `${base}${page.slug === '' ? '' : `${page.slug}/`}`,
    html: await readFile(join(output, page.slug, 'index.html'), 'utf8'),
  })),
);

/** The identifiers of one document. */
const idsOf = (html: string): Set<string> =>
  new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] ?? ''));

await test('the repository guide uses source links without a hosted site claim', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  assert.match(readme, /\[docs\/guide\/\]\(docs\/guide\/README\.md\)/);
  assert.match(
    readme,
    /\[The documentation site\]\(docs\/development\/docs-site\.md\)/,
  );
});

await test('the built documentation site', async (t) => {
  t.after(async () => {
    await rm(output, { recursive: true, force: true });
  });

  await t.test(
    'every page has one complete social preview at the configured origin',
    async () => {
      const documents = [
        ...pages,
        {
          address: `${base}404.html`,
          html: await readFile(join(output, '404.html'), 'utf8'),
        },
      ];
      const imageAddress = `${origin}${base}${socialPreview.file}`;
      for (const { address, html } of documents) {
        for (const [name, value] of [
          ['og:title', null],
          ['og:description', null],
          ['og:site_name', 'tidy notebook docs'],
          ['og:type', 'website'],
          ['og:image', imageAddress],
          ['og:image:type', 'image/png'],
          ['og:image:width', '1200'],
          ['og:image:height', '630'],
          ['og:image:alt', socialPreview.alt],
          ['twitter:card', 'summary_large_image'],
          ['twitter:image', imageAddress],
        ]) {
          const tags = [
            ...html.matchAll(
              new RegExp(`<meta[^>]*\\b(?:property|name)="${name}"[^>]*>`, 'g'),
            ),
          ];
          assert.equal(tags.length, 1, `${address}: ${name}`);
          const content = /\bcontent="([^"]*)"/.exec(tags[0]?.[0] ?? '')?.[1];
          if (value !== null)
            assert.equal(content, value, `${address}: ${name}`);
          else assert.ok(content, `${address}: ${name} is empty`);
        }
        const urls = [
          ...html.matchAll(/<meta[^>]*\b(?:property|name)="og:url"[^>]*>/g),
        ];
        const missing = address === `${base}404.html`;
        assert.equal(urls.length, missing ? 0 : 1, `${address}: og:url`);
        if (!missing)
          assert.equal(
            /\bcontent="([^"]*)"/.exec(urls[0]?.[0] ?? '')?.[1],
            `${origin}${address}`,
          );
      }
      const image = await readFile(join(output, socialPreview.file));
      assert.deepEqual(
        image.subarray(0, 8),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      assert.equal(image.readUInt32BE(16), 1200);
      assert.equal(image.readUInt32BE(20), 630);
      assert.ok(
        image.equals(
          await readFile(join(root, 'apps/docs/images', socialPreview.file)),
        ),
      );
    },
  );

  await t.test('docs copies and links the official icon set', async () => {
    for (const name of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) {
      const source = await readFile(join(root, 'apps/web/dist/web', name));
      assert.ok(source.equals(await readFile(join(output, name))), name);
    }
    for (const { html } of pages) {
      assert.ok(html.includes(`href="${base}favicon.ico"`));
      assert.ok(html.includes(`href="${base}apple-touch-icon.png"`));
      assert.match(html, /rel="icon" type="image\/svg\+xml"/);
      assert.ok(!html.includes('rel="manifest"'));
    }
  });

  await t.test(
    'every page of the guide is a page and a Markdown copy',
    async () => {
      const files = (await readdir(guide)).filter((name) =>
        name.endsWith('.md'),
      );
      assert.deepEqual(
        result.pages
          .filter((page) => files.includes(page.file))
          .map((page) => page.file)
          .sort(),
        files.sort(),
      );
      for (const { page } of pages) {
        const copy = await readFile(
          join(output, `${page.slug === '' ? 'index' : page.slug}.md`),
          'utf8',
        );
        assert.ok(copy.startsWith(`# ${page.title}\n`), page.file);
        // A guide link in a copy names the copy of the other page, in full.
        for (const match of copy.matchAll(/\]\(([^)\s]+)\)/g)) {
          const destination = (match[1] ?? '').split('#')[0] ?? '';
          if (destination.endsWith('.md'))
            assert.match(
              destination,
              /^https:\/\//,
              `${page.file}: ${destination}`,
            );
        }
      }
    },
  );

  await t.test(
    'the API reference covers every runtime operation and publishes the exact client bundle',
    async () => {
      const source = await readFile(join(root, apiDocumentFile), 'utf8');
      const download = await served(`${base}${apiDownload}`);
      assert.notEqual(download, null);
      assert.equal(await readFile(download ?? '', 'utf8'), source);
      const apiPages = pages.filter(({ page }) =>
        page.file.startsWith('api-reference-'),
      );
      const documented = apiPages.flatMap(({ page }) =>
        page.headings
          .filter((heading) => heading.depth === 2)
          .map((heading) => heading.text),
      );
      assert.deepEqual(
        documented.sort(),
        operations.map((operation) => operation.id).sort(),
      );
      for (const operation of operations) {
        const found = apiPages.find(({ page }) =>
          page.headings.some((heading) => heading.text === operation.id),
        );
        assert.ok(found, operation.id);
        assert.ok(
          found.page.source.includes(
            `\`${operation.method.toUpperCase()} ${operation.path}\``,
          ),
        );
        const section =
          found.page.source
            .split(`## ${operation.id}\n`)[1]
            ?.split('\n## ')[0] ?? '';
        const schemes = new Set(
          operation.security.flatMap((requirement) => Object.keys(requirement)),
        );
        for (const scheme of new Set(
          operations.flatMap((entry) =>
            entry.security.flatMap((requirement) => Object.keys(requirement)),
          ),
        ))
          assert.equal(
            section.includes(`[${scheme}]`),
            schemes.has(scheme),
            `${operation.id}: ${scheme}`,
          );
      }
      const overview = pages.find(
        ({ page }) => page.file === 'api-reference.md',
      );
      assert.ok(overview);
      assert.ok(overview.html.includes(`${base}${apiDownload}`));
      assert.match(
        overview.html,
        /Use the HTTPS origin of your own installation/,
      );
      assert.match(
        overview.html,
        /Replace the placeholder before you send a request/,
      );
      assert.match(overview.html, /notes\.invalid/);
      assert.match(overview.html, /Authorization: Bearer/);
      assert.match(overview.html, /Keys expire and can be revoked at once/);
      for (const { html } of pages.filter(
        ({ page }) =>
          !page.file.startsWith('api-reference') &&
          page.file !== 'api-schemas.md',
      ))
        assert.ok(
          html.includes(`href="${base}api-reference/"`),
          'the reference is in guide navigation',
        );
      for (const { html } of [...apiPages, overview]) {
        assert.match(html, /Source on GitHub<\/a>/);
        assert.doesNotMatch(html, /edit\/main\/docs\/guide\/api-reference/);
        assert.doesNotMatch(html, /data-blocked="link"/);
      }
    },
  );

  await t.test(
    'every link of the site reaches a file and a heading',
    async () => {
      for (const { address, html } of pages) {
        for (const match of html.matchAll(/\shref="([^"]+)"/g)) {
          const href = (match[1] ?? '').replaceAll('&amp;', '&');
          if (/^(?:https?:|mailto:)/.test(href) && !href.startsWith(origin))
            continue;
          const target = new URL(href, `${origin}${address}`);
          const file = await served(target.href);
          assert.notEqual(file, null, `${address} links ${href}`);
          if (target.hash === '' || file === null) continue;
          const ids = idsOf(await readFile(file, 'utf8'));
          assert.ok(
            ids.has(decodeURIComponent(target.hash.slice(1))),
            `${address} links ${href}, and that page holds no such heading`,
          );
        }
      }
    },
  );

  /** One class name as a selector of the stylesheet writes it. */
  function selectorOf(name: string): string {
    return `.${name.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)}`;
  }

  /** The classes that a page writes, outside the text that the renderer wrote. */
  function classesOf(html: string): Set<string> {
    const frame = html.replace(
      /(data-pagefind-body>)[\s\S]*?(<\/article>)/,
      '$1$2',
    );
    const names = new Set<string>();
    for (const match of frame.matchAll(/\sclass="([^"]*)"/g))
      for (const name of (match[1] ?? '').split(/\s+/))
        if (name !== '') names.add(name);
    return names;
  }

  /** Class names that select nothing by themselves. */
  const markers = new Set([
    'group',
    'public-footer',
    'public-footer-brand',
    'public-footer-grid',
    'public-footer-wordmark',
    'ui-button',
    'ui-group-heading',
    'ui-icon-button',
    'ui-page-column',
    'ui-tree-row',
    'ui-content-list',
  ]);

  await t.test('every class of a page is in the built stylesheet', async () => {
    const sheets = [
      ...(pages[0]?.html ?? '').matchAll(
        /<link rel="stylesheet" href="([^"]+)">/g,
      ),
    ].map((match) => match[1] ?? '');
    assert.ok(sheets.length > 0);
    let css = '';
    for (const sheet of sheets) {
      const file = await served(sheet);
      assert.notEqual(file, null, sheet);
      css += await readFile(file ?? '', 'utf8');
    }
    const missing = new Set<string>();
    const missingPage = await readFile(join(output, '404.html'), 'utf8');
    for (const html of [...pages.map((entry) => entry.html), missingPage])
      for (const name of classesOf(html))
        if (!markers.has(name) && !css.includes(selectorOf(name)))
          missing.add(name);
    assert.deepEqual([...missing].sort(), []);
    // The page states no appearance, so the stylesheet paints the Default
    // palette of the device in light and in dark (record 0151).
    assert.match(css, /prefers-color-scheme:\s*light/);
    assert.match(css, /:root:not\(\[data-theme\]\)/);
    for (const html of pages.map((entry) => entry.html))
      assert.doesNotMatch(html, /data-theme=/);
    // Every font of the stylesheet is a file of the site.
    for (const match of css.matchAll(
      /url\((['"]?)(\.\.\/fonts\/[^)'"]+)\1\)/g,
    )) {
      const font = await served(
        new URL(match[2] ?? '', `${origin}${sheets[0] ?? ''}`).href,
      );
      assert.notEqual(font, null, match[2] ?? '');
    }
    assert.doesNotMatch(css, /url\(['"]?\/fonts\//);
  });

  await t.test('the search index holds every page', async () => {
    assert.equal(result.indexed, result.pages.length);
    const entry: unknown = JSON.parse(
      await readFile(join(output, 'pagefind/pagefind-entry.json'), 'utf8'),
    );
    const languages: unknown = Reflect.get(Object(entry), 'languages');
    const english: unknown = Reflect.get(Object(languages), 'en');
    assert.equal(
      Reflect.get(Object(english), 'page_count'),
      result.pages.length,
    );
    assert.notEqual(await served(`${base}pagefind/pagefind.js`), null);
    for (const { html } of pages)
      assert.equal(html.match(/data-pagefind-body/g)?.length, 1);
    // Each result of the index opens the address of its page, under the base.
    const addresses = new Set(pages.map((entry) => entry.address));
    const fragments = join(output, 'pagefind/fragment');
    const names = await readdir(fragments);
    assert.equal(names.length, result.pages.length);
    for (const name of names) {
      const bytes = gunzipSync(await readFile(join(fragments, name)));
      const marker = 'pagefind_dcd';
      assert.equal(bytes.subarray(0, marker.length).toString(), marker);
      const fragment: unknown = JSON.parse(
        bytes.subarray(marker.length).toString('utf8'),
      );
      const url: unknown = Reflect.get(Object(fragment), 'url');
      assert.ok(typeof url === 'string' && addresses.has(url), String(url));
    }
  });

  await t.test('the files for agents name every page', async () => {
    const index = await readFile(join(output, 'llms.txt'), 'utf8');
    const full = await readFile(join(output, 'llms-full.txt'), 'utf8');
    const map = await readFile(join(output, 'sitemap.xml'), 'utf8');
    assert.ok(index.startsWith('# tidy notebook docs\n\n> '));
    for (const { page, address } of pages) {
      if (page.slug !== '')
        assert.ok(
          index.includes(`(${origin}${base}${page.slug}.md)`),
          page.file,
        );
      assert.ok(
        full.includes(`\n# ${page.title}\n`) ||
          full.includes(`-->\n\n# ${page.title}\n`),
        page.file,
      );
      assert.ok(map.includes(`<loc>${origin}${address}</loc>`), page.file);
    }
    const robots = await readFile(join(output, 'robots.txt'), 'utf8');
    assert.ok(robots.includes(`Sitemap: ${origin}${base}sitemap.xml`));
  });

  await t.test('an address with no page answers the missing page', async () => {
    const html = await readFile(join(output, '404.html'), 'utf8');
    assert.match(html, /This page does not exist/);
    assert.match(html, /<meta name="robots" content="noindex">/);
  });

  /** The text of every heading of one guide page. */
  async function headingsOf(file: string): Promise<Set<string>> {
    const text = await readFile(join(guide, file), 'utf8');
    return new Set(
      [...text.matchAll(/^#{2,6} +(.+?) *$/gm)].map((match) => match[1] ?? ''),
    );
  }

  await t.test(
    'the settings page has a heading for each section of Settings',
    async () => {
      const headings = await headingsOf('settings.md');
      const missing = settingsSections
        .map((section) => section.title)
        .filter((title) => !headings.has(title));
      assert.deepEqual(missing, []);
    },
  );

  await t.test(
    'the accounts page has a heading for each section of Accounts',
    async () => {
      const headings = await headingsOf('accounts.md');
      const missing = administrationSections
        .map((section) => section.title)
        .filter((title) => !headings.has(title));
      assert.deepEqual(missing, []);
    },
  );

  /** The variable names that a text names inside a code span. */
  const variablesIn = (text: string): Set<string> =>
    new Set(
      [...text.matchAll(/`([A-Z][A-Z0-9_]*_[A-Z0-9_]+)`/g)].map(
        (match) => match[1] ?? '',
      ),
    );

  await t.test(
    'the configuration page names every variable, and no other',
    async () => {
      const page = variablesIn(
        await readFile(join(guide, 'configuration.md'), 'utf8'),
      );
      const example = await readFile(join(root, '.env.example'), 'utf8');
      // A variable that a Compose file of the repository reads is a setting
      // of the operator too, whether or not .env.example names it.
      const composeFiles = [
        'docker-compose.yml',
        ...(await readdir(join(root, 'docker')))
          .filter((name) => name.endsWith('.yaml'))
          .map((name) => `docker/${name}`),
      ];
      const interpolated: string[] = [];
      for (const name of composeFiles) {
        const text = await readFile(join(root, name), 'utf8');
        for (const match of text.matchAll(/\$\{([A-Z][A-Z0-9_]+)/g))
          interpolated.push(match[1] ?? '');
      }
      const compose = [
        ...[...example.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(
          (match) => match[1] ?? '',
        ),
        ...interpolated,
      ];
      // The migrate command of the image reads its own secrets, which the
      // server never reads (records 0202 and 0207).
      const known = new Set([
        ...serverVariables,
        ...migrationVariables,
        ...compose,
      ]);
      const missing = [...known].filter((name) => !page.has(name)).sort();
      assert.deepEqual(missing, []);
      const unknown = [...page].filter((name) => !known.has(name)).sort();
      assert.deepEqual(unknown, []);
    },
  );
});
