import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PublicFooter } from './public-footer-react.ts';
import {
  installationFooterColumns,
  hostedFooterColumns,
  renderPublicFooter,
} from './public-footer.ts';

await test('static and React footers use one structure and the approved links', () => {
  const options = {
    home: 'https://tidynotebook.com',
    columns: hostedFooterColumns,
  };
  const html = renderPublicFooter(options);
  // React adds an image preload. The footer itself is identical.
  const react = renderToStaticMarkup(createElement(PublicFooter, options));
  assert.equal(react.slice(react.indexOf('<footer')), html);
  for (const label of [
    'Features',
    'Pricing',
    'Sign in',
    'Docs',
    'MCP',
    'Contact',
    'GitHub',
    'Source code',
    'License (AGPL-3.0)',
    'Terms',
    'Privacy',
    'Refunds',
    'Fair use',
  ])
    assert.ok(html.includes(`>${label}</`), label);
  assert.equal((html.match(/<footer/g) ?? []).length, 1);
  assert.ok(
    html.includes('Open source. Write in Markdown. Export your notes.'),
  );
  assert.ok(html.includes('© 2026 tidy notebook'));
  assert.doesNotMatch(
    html,
    /Your notes stay yours|Self-hosting|Plans and billing|<script| style=/,
  );
});

await test('installation footers use operator legal URLs and local sign in', () => {
  const html = renderPublicFooter({
    home: '/',
    columns: installationFooterColumns([
      { label: 'Terms', href: 'https://operator.example/terms' },
      { label: 'Privacy', href: 'https://operator.example/privacy' },
    ]),
  });
  assert.ok(html.includes('href="/login"'));
  assert.ok(html.includes('href="https://operator.example/terms"'));
  assert.ok(html.includes('href="https://operator.example/privacy"'));
  assert.doesNotMatch(
    html,
    /tidynotebook.com\/(terms|privacy|refunds|fair-use)|support@|>Contact</,
  );
  assert.doesNotMatch(
    renderPublicFooter({ columns: installationFooterColumns([]) }),
    />Legal<\/h2>/,
  );
});

await test('both renderers escape operator labels and destinations', () => {
  const options = {
    columns: [
      {
        title: '<Legal>',
        links: [{ label: '<Terms>', href: 'https://example.test/?a="&b=1' }],
      },
    ],
  };
  const html = renderPublicFooter(options);
  assert.ok(html.includes('&lt;Legal&gt;'));
  assert.ok(html.includes('&lt;Terms&gt;'));
  assert.ok(html.includes('?a=&quot;&amp;b=1'));
  assert.equal(
    renderToStaticMarkup(createElement(PublicFooter, options)).slice(
      renderToStaticMarkup(createElement(PublicFooter, options)).indexOf(
        '<footer',
      ),
    ),
    html,
  );
});

await test('a separate published origin links sign in to the application origin', () => {
  const html = renderPublicFooter({
    columns: installationFooterColumns([], {
      signIn: 'https://notes.example/login',
      contact: { label: 'Contact', href: 'mailto:operator@example.test' },
    }),
  });
  assert.ok(html.includes('href="https://notes.example/login"'));
  assert.ok(html.includes('href="mailto:operator@example.test"'));
  assert.doesNotMatch(html, /href="\/login"/);
});

await test('the default and operator footers have no cloud product or support destinations', () => {
  for (const html of [
    renderPublicFooter(),
    renderPublicFooter({
      columns: installationFooterColumns([
        { label: 'Terms', href: '/legal/terms' },
        { label: 'Privacy', href: '/legal/privacy' },
      ]),
    }),
  ]) {
    assert.ok(html.includes('href="/"'));
    assert.ok(html.includes('href="/login"'));
    assert.doesNotMatch(
      html,
      />Features<|>Pricing<|>Contact<|support@|billing\.tidynotebook\.com|app\.tidynotebook\.com/,
    );
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(
      (match) => new URL(match[1] ?? '', 'https://notes.example'),
    );
    assert.ok(links.length > 0);
    for (const url of links) {
      assert.ok(
        ['notes.example', 'docs.tidynotebook.com', 'github.com'].includes(
          url.hostname,
        ),
        url.href,
      );
      assert.notEqual(url.hostname, 'tidynotebook.com');
    }
    assert.ok(html.includes('href="https://docs.tidynotebook.com"'));
    assert.ok(html.includes('href="https://docs.tidynotebook.com/mcp/"'));
  }
});

await test('every column takes its accessible name from its heading', () => {
  const html = renderPublicFooter();
  assert.doesNotMatch(html, /aria-label=/);
  const labels = [...html.matchAll(/<nav aria-labelledby="([^"]+)"[^>]*>/g)];
  assert.equal(labels.length, 3);
  for (const label of labels) assert.ok(html.includes(`<h2 id="${label[1]}"`));
});

await test('both renderers reject unsafe URL schemes in links, the brand, and the icon', () => {
  for (const href of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,bad',
    'file:///tmp/private',
    'ftp://example.test',
    'blob:https://example.test/id',
    '//example.test/path',
    '/\\example.test/path',
    'http://[invalid',
  ]) {
    for (const options of [
      { home: href },
      { icon: href },
      { columns: [{ title: 'Legal', links: [{ label: 'Terms', href }] }] },
    ]) {
      assert.throws(() => renderPublicFooter(options), /A footer URL must use/);
      assert.throws(
        () => renderToStaticMarkup(createElement(PublicFooter, options)),
        /A footer URL must use/,
      );
    }
  }
  for (const href of [
    'https://operator.example/terms',
    'http://localhost:3000/login',
    'mailto:operator@example.test',
    '/legal/terms',
    '../terms',
    'terms',
    '#legal',
    '?page=terms',
  ])
    assert.ok(
      renderPublicFooter({
        columns: [{ title: 'Legal', links: [{ label: 'Terms', href }] }],
      }).includes(`href="${href}"`),
    );
});
