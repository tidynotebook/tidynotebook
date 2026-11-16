import assert from 'node:assert/strict';
import test from 'node:test';
import { buttonClassName, rowClassName } from '@notesapp/ui';
import { readGuideIndex, readGuidePage } from './guide.ts';
import {
  escapeAttribute,
  escapeText,
  missingDocument,
  pageDocument,
  type PageView,
} from './page.ts';

const groups = readGuideIndex(
  [
    '# tidy notebook guide',
    '',
    '## Hosting a server',
    '',
    '- [Quick start](quickstart.md) - the shortest path.',
    '- [Self-hosting](self-hosting.md) - the production installation.',
  ].join('\n'),
);
const page = readGuidePage(
  'self-hosting.md',
  [
    '# Self-hosting',
    '',
    'This page is for the person who runs the server.',
    '',
    '## Mail',
    '',
    '### Port <587>',
    '',
    '## Logs',
  ].join('\n'),
);
const assets = {
  stylesheets: ['/notesapp/assets/main.css'],
  script: '/notesapp/assets/docs.js',
  icon: '/notesapp/assets/icon.svg',
};
const view: PageView = {
  settings: { base: '/notesapp/', origin: 'https://docs.example.test' },
  assets,
  groups,
  page,
  group: 'Hosting a server',
  html: '<h1 id="user-content-self-hosting">Self-hosting</h1>',
  markdown: '# Self-hosting\n\nA </template> and <b>.\n',
  previous: { title: 'Quick start', href: '/notesapp/quickstart/' },
  next: null,
};

await test('a generated page names the contract as its source', () => {
  const html = pageDocument({
    ...view,
    sourceHref: 'https://example.com/openapi.yaml',
  });
  assert.match(
    html,
    /href="https:\/\/example\.com\/openapi\.yaml" rel="noopener noreferrer">Source on GitHub<\/a>/,
  );
  assert.doesNotMatch(html, /edit\/main\/docs\/guide/);
});

await test('a long reference can list its main sections alone', () => {
  const html = pageDocument({ ...view, outlineDepth: 2 });
  const outline = html.split('<aside')[1]?.split('</aside>')[0] ?? '';
  assert.ok(outline.includes('#user-content-mail'));
  assert.ok(outline.includes('#user-content-logs'));
  assert.ok(!outline.includes('#user-content-port-587'));
});

await test('a long outline has its own bounded scroller', () => {
  const html = pageDocument(view);
  const outline = html.split('<aside')[1]?.split('</aside>')[0] ?? '';
  assert.match(outline, /max-h-96/);
  assert.match(outline, /overflow-y-auto/);
});

await test('text and attributes lose every markup character', () => {
  assert.equal(escapeText('a <b> & c'), 'a &lt;b&gt; &amp; c');
  assert.equal(escapeAttribute(`"it's"`), '&quot;it&#39;s&quot;');
});

await test('a page states its title, its reader and its alternates', () => {
  const html = pageDocument(view);
  assert.match(html, /<title>Self-hosting \| tidy notebook docs<\/title>/);
  assert.match(
    html,
    /<meta name="description" content="This page is for the person who runs the server\.">/,
  );
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/docs\.example\.test\/notesapp\/self-hosting\/">/,
  );
  assert.match(
    html,
    /<link rel="alternate" type="text\/markdown" title="View as Markdown" href="\/notesapp\/self-hosting\.md">/,
  );
  assert.match(
    html,
    /href="https:\/\/docs\.example\.test\/notesapp\/llms\.txt"/,
  );
  assert.match(
    html,
    /<link rel="stylesheet" href="\/notesapp\/assets\/main\.css">/,
  );
  assert.match(
    html,
    /<script type="module" src="\/notesapp\/assets\/docs\.js"><\/script>/,
  );
});

await test('the root states no appearance, so the device palette paints it', () => {
  const html = pageDocument(view);
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /data-theme/);
});

await test('the contents mark the open page with the recipe of a row', () => {
  const html = pageDocument(view);
  const current = rowClassName({ current: true, className: 'w-full' });
  assert.ok(
    html.includes(
      `<a class="${current}" href="/notesapp/self-hosting/" aria-current="page">`,
    ),
  );
  assert.ok(html.includes('href="/notesapp/quickstart/"'));
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
});

await test('the side region lists each heading by its identifier', () => {
  const html = pageDocument(view);
  for (const id of [
    'user-content-mail',
    'user-content-port-587',
    'user-content-logs',
  ])
    assert.ok(html.includes(`href="#${id}"`), id);
  assert.ok(html.includes('Port &lt;587&gt;'));
});

await test('a page of one heading lists no outline', () => {
  const short = readGuidePage('trash.md', '# Trash\n\nText.\n\n## Only one\n');
  const html = pageDocument({ ...view, page: short });
  assert.doesNotMatch(html, /aria-label="On this page"/);
});

await test('the pager links the pages next to this one', () => {
  const html = pageDocument(view);
  assert.match(html, /<nav class="[^"]*" aria-label="More pages">/);
  assert.ok(html.includes('href="/notesapp/quickstart/"'));
  assert.doesNotMatch(html, />Next</);
  const alone = pageDocument({ ...view, previous: null });
  assert.doesNotMatch(alone, /aria-label="More pages"/);
});

await test('the Markdown copy sits in the page as text', () => {
  const html = pageDocument(view);
  assert.ok(
    html.includes(
      '<template data-docs-markdown># Self-hosting\n\nA &lt;/template&gt; and &lt;b&gt;.\n</template>',
    ),
  );
});

await test('the search is one labelled dialog with the templates of its rows', () => {
  const html = pageDocument(view);
  assert.match(
    html,
    /<dialog id="docs-search"[^>]*aria-label="Search the docs"/,
  );
  assert.match(html, /<template data-docs-search-result>/);
  assert.match(html, /<template data-docs-code-copy>/);
  assert.match(html, /aria-keyshortcuts="\/ Control\+K Meta\+K"/);
});

await test('the article is the one region that the search index reads', () => {
  const html = pageDocument(view);
  assert.equal(html.match(/data-pagefind-body/g)?.length, 1);
  assert.match(html, /<article class="[^"]*" data-pagefind-body>\n<h1/);
});

await test('a page with no origin names no canonical address', () => {
  const html = pageDocument({
    ...view,
    settings: { base: '/', origin: null },
  });
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.match(html, /title="llms\.txt" href="\/llms\.txt"/);
});

await test('the missing page names what is missing and offers one action', () => {
  const html = missingDocument(view.settings, assets, groups);
  assert.match(html, /<h1[^>]*>This page does not exist<\/h1>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  const primary = buttonClassName({ variant: 'primary' });
  assert.equal(html.split(`class="${primary} mt-2"`).length - 1, 1);
  assert.match(html, /href="\/notesapp\/">Open the overview<\/a>/);
  assert.doesNotMatch(html, /aria-current="page"/);
});

await test('docs uses the shared footer below its page resources and frame', () => {
  const html = pageDocument(view);
  assert.equal((html.match(/<footer/g) ?? []).length, 1);
  assert.ok(
    html.indexOf('<footer') > html.indexOf('aria-label="Page resources"'),
  );
  assert.ok(
    html.includes('Open source. Write in Markdown. Export your notes.'),
  );
  const footer = html.slice(html.indexOf('<footer'));
  assert.ok(footer.includes('src="/notesapp/assets/icon.svg"'));
  assert.ok(html.includes('href="https://tidynotebook.com/privacy"'));
});

await test('social addresses are absent when no origin is configured', () => {
  for (const html of [
    pageDocument({
      ...view,
      settings: { base: '/private-docs/', origin: null },
    }),
    missingDocument({ base: '/private-docs/', origin: null }, assets, groups),
  ]) {
    assert.doesNotMatch(
      html,
      /<meta[^>]*\b(?:property|name)="og:(?:url|image(?::[^"]*)?)"/,
    );
    assert.doesNotMatch(html, /<meta[^>]*\b(?:property|name)="twitter:image"/);
    assert.equal(html.match(/<meta[^>]*\bproperty="og:type"/g)?.length, 1);
    assert.equal(html.match(/<meta[^>]*\bname="twitter:card"/g)?.length, 1);
  }
});

await test('a missing page has no Open Graph URL', () => {
  const html = missingDocument(view.settings, assets, groups);
  assert.doesNotMatch(html, /<meta[^>]*\b(?:property|name)="og:url"/);
});
