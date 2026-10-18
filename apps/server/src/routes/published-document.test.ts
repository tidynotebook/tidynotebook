/**
 * The document that a published link answers, in every state.
 *
 * Decision 0047 gives the page one answer for every state of a link, so each
 * of the four states is a case here. The module reads no store, so the checks
 * are direct: one view goes in and one document comes out.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { productName } from '@notesapp/core';
import {
  emptyListSentence,
  escapeAttribute,
  escapeText,
  lockedHint,
  lockedSentence,
  noteBodyClasses,
  publishedDocument,
  publishedDocumentClasses,
  readableNoteName,
  reportedSentence,
  reportHeading,
  reportReasonWords,
  unavailableHint,
  unavailableSentence,
  type PublishedPageView,
} from './published-document.ts';

/** One document of a view, with the stylesheet of a built shell. */
function documentOf(view: PublishedPageView, stylesheets = ['/assets/a.css']) {
  return publishedDocument({
    view,
    stylesheets,
    formAction: '/published/abc',
  });
}

await test('a link that opens nothing names it and the one way on', () => {
  const html = documentOf({ kind: 'unavailable' });
  assert.match(html, new RegExp(`<h1 [^>]*>${unavailableSentence}</h1>`));
  assert.ok(html.includes(unavailableHint));
  // The words of a locked link are not on this page, so the reader learns
  // nothing about the cause.
  assert.ok(!html.includes(lockedSentence));
  assert.ok(!html.includes(lockedHint));
  assert.ok(!html.includes('<form'));
  assert.ok(!html.includes('<script'));
});

await test('a locked link shows the form and the same words every time', () => {
  const html = documentOf({ kind: 'locked' });
  assert.match(html, new RegExp(`<h1 [^>]*>${lockedSentence}</h1>`));
  assert.ok(html.includes(lockedHint));
  assert.ok(!html.includes(unavailableHint));
  // The one field takes the focus, so a reader can type at once.
  assert.match(html, /<input [^>]*name="password"[^>]* autofocus/);
  assert.ok(html.includes('method="post"'));
  assert.ok(html.includes('name="password"'));
  assert.ok(html.includes('type="password"'));
  // The form names the address of the page, so an unlock returns to it.
  assert.ok(html.includes('action="/published/abc"'));
  assert.ok(!html.includes('<script'));
});

await test('a page with no content is one short block in the middle', () => {
  const middle =
    /<main class="[^"]*\bmin-h-dvh\b[^"]*\bmax-w-sm\b[^"]*\bjustify-center\b/;
  for (const view of [
    { kind: 'unavailable' },
    { kind: 'locked' },
  ] satisfies PublishedPageView[])
    assert.match(documentOf(view), middle, view.kind);
  // A note keeps the note column, so its text reads at the note measure.
  const note = documentOf({
    kind: 'note',
    body: '<p>text</p>',
    listHref: null,
  });
  assert.doesNotMatch(note, middle);
  assert.match(note, /<main class="[^"]*\bmax-w-note\b/);
});

await test('the document loads every stylesheet of the built shell', () => {
  const html = documentOf({ kind: 'unavailable' }, ['/assets/one.css']);
  assert.ok(html.includes('<link rel="stylesheet" href="/assets/one.css">'));
  assert.equal(html.split('rel="stylesheet"').length - 1, 1);
});

await test('a build with no shell document still answers a readable page', () => {
  const html = documentOf({ kind: 'unavailable' }, []);
  assert.ok(!html.includes('rel="stylesheet"'));
  assert.ok(html.includes(unavailableSentence));
});

await test('the list of a folder link names every note and no path', () => {
  const html = documentOf({
    kind: 'list',
    notes: [
      { name: 'Day one', href: '/published/abc?note=1' },
      { name: 'Day two', href: '/published/abc?note=2' },
    ],
  });
  assert.ok(html.includes('>Day one</a>'));
  assert.ok(html.includes('href="/published/abc?note=2"'));
  assert.ok(!html.includes('.md'));
});

await test('an empty folder names what is missing', () => {
  const html = documentOf({ kind: 'list', notes: [] });
  assert.ok(html.includes(emptyListSentence));
  assert.ok(!html.includes('<li>'));
});

await test('a note of a folder link offers the way back to the list', () => {
  const html = documentOf({
    kind: 'note',
    body: '<h1>Day one</h1>',
    listHref: '/published/abc',
  });
  assert.ok(html.includes('All notes'));
  assert.ok(html.includes('<h1>Day one</h1>'));
});

await test('a note link offers no list, because it opens one note', () => {
  const html = documentOf({
    kind: 'note',
    body: '<p>text</p>',
    listHref: null,
  });
  assert.ok(!html.includes('All notes'));
});

await test('every state of the page has the product name as its title', () => {
  const views: readonly PublishedPageView[] = [
    { kind: 'unavailable' },
    { kind: 'locked' },
    { kind: 'note', body: '<h1>Day one</h1><p>text</p>', listHref: null },
    { kind: 'list', notes: [{ name: 'Day one', href: '/published/abc' }] },
    { kind: 'report', reasons: ['spam'] },
    { kind: 'reported' },
  ];
  for (const view of views) {
    const html = documentOf(view);
    assert.equal(html.split('<title>').length - 1, 1, view.kind);
    assert.ok(html.includes(`<title>${productName}</title>`), view.kind);
  }
});

await test('the body of an open note is unchanged and is the only place of its words', () => {
  const body = '<h1>Day one</h1><p>Secret plan</p>';
  const html = documentOf({ kind: 'note', body, listHref: null });
  assert.ok(
    html.includes(`<article class="${noteBodyClasses}">${body}</article>`),
  );
  // The document writes no heading of its own above the body.
  assert.equal(html.split('<h1').length - 1, 1);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(!head.includes('Day one'));
  assert.ok(!head.includes('Secret plan'));
});

await test('every state writes the one link preview block in its head', () => {
  const block = '<meta property="og:title" content="tidy notebook">';
  const views: readonly PublishedPageView[] = [
    { kind: 'unavailable' },
    { kind: 'locked' },
    { kind: 'note', body: '<p>text</p>', listHref: '/published/abc' },
    { kind: 'list', notes: [] },
    { kind: 'report', reasons: ['spam'] },
    { kind: 'reported' },
  ];
  for (const view of views) {
    const html = publishedDocument({
      view,
      stylesheets: [],
      formAction: '/published/abc',
      linkPreview: block,
    });
    const head = html.slice(0, html.indexOf('</head>'));
    assert.equal(head.split(block).length - 1, 1, view.kind);
    assert.ok(
      head.includes('<meta name="robots" content="noindex, nofollow">'),
    );
  }
  // A composition with no card writes no tag.
  assert.ok(!documentOf({ kind: 'unavailable' }).includes('og:'));
});

await test('an address that holds a quote cannot start an attribute', () => {
  const html = documentOf({
    kind: 'list',
    notes: [{ name: 'One', href: '/published/abc" onload="alert(1)' }],
  });
  // The quote is escaped, so the value stays inside the one attribute and
  // `onload` is text of that value rather than an attribute of its own.
  assert.ok(!html.includes('onload="'));
  assert.ok(html.includes('&quot; onload=&quot;'));
});

await test('the page follows the light or dark preference of the reader', () => {
  // Issue 210: the page stated a dark appearance for every reader. A root
  // with no appearance takes the palette of the device from the stylesheet
  // (record 0151).
  for (const page of [
    documentOf({ kind: 'unavailable' }),
    documentOf({ kind: 'locked' }),
  ]) {
    assert.match(page, /<html lang="en">/);
    assert.equal(page.includes('data-theme'), false);
  }
});

await test('the page asks a crawler to keep it out of an index', () => {
  const html = documentOf({ kind: 'unavailable' });
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
});

await test('escaping covers the characters that open markup', () => {
  assert.equal(escapeText('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  assert.equal(escapeAttribute(`a"b'c`), 'a&quot;b&#39;c');
});

await test('a note name hides the folder and the one stored suffix', () => {
  assert.equal(readableNoteName('notes/trip/day-one.md'), 'day-one');
  assert.equal(readableNoteName('day-one.md'), 'day-one');
  // A stored path that holds no suffix keeps its last segment.
  assert.equal(readableNoteName('notes/trip'), 'trip');
});

await test('every class of the document is one token of the named scale', () => {
  assert.ok(publishedDocumentClasses.length > 0);
  for (const name of publishedDocumentClasses) {
    assert.ok(!name.includes(' '), name);
    assert.notEqual(name, '');
  }
});

await test('a note and a list carry the report link, and no other state does', () => {
  const reportHref = '/published/abc/report';
  const note = publishedDocument({
    view: { kind: 'note', body: '<p>x</p>', listHref: null },
    stylesheets: [],
    formAction: '/published/abc',
    reportHref,
  });
  assert.ok(note.includes(`href="${reportHref}"`));
  assert.ok(note.includes('Report this page'));
  const list = publishedDocument({
    view: { kind: 'list', notes: [] },
    stylesheets: [],
    formAction: '/published/abc',
    reportHref,
  });
  assert.ok(list.includes(`href="${reportHref}"`));
  for (const view of [
    { kind: 'unavailable' },
    { kind: 'locked' },
  ] satisfies PublishedPageView[])
    assert.ok(
      !publishedDocument({
        view,
        stylesheets: [],
        formAction: '/published/abc',
        reportHref,
      }).includes(reportHref),
      view.kind,
    );
});

await test('the report form offers every reason and holds no script', () => {
  const html = publishedDocument({
    view: { kind: 'report', reasons: ['phishing', 'spam', 'other'] },
    stylesheets: ['/assets/a.css'],
    formAction: '/published/abc/report',
  });
  assert.ok(html.includes(`>${reportHeading}</h1>`));
  assert.ok(html.includes('action="/published/abc/report"'));
  assert.ok(html.includes('method="post"'));
  assert.ok(html.includes('value="phishing" checked'));
  assert.ok(!html.includes('value="spam" checked'));
  assert.ok(html.includes(reportReasonWords.spam));
  assert.ok(html.includes('name="note"'));
  assert.ok(!/<script|\son[a-z]+=/i.test(html));
});

await test('the answer after a report says one sentence', () => {
  const html = documentOf({ kind: 'reported' });
  assert.ok(html.includes(reportedSentence));
  assert.ok(!html.includes('<form'));
});

await test('a note with a diagram names the one diagram script and no inline one', () => {
  // Record 0158. The script is a file of the build that waits for the
  // document, and only the page of a note carries it.
  const view: PublishedPageView = {
    kind: 'note',
    body: '<pre data-diagram="mermaid">graph TD;</pre>',
    listHref: null,
  };
  const html = publishedDocument({
    view,
    stylesheets: ['/assets/a.css'],
    formAction: '/published/abc',
    pageScript: '/assets/published-page-M0Ar9lYV.js',
  });
  assert.ok(
    html.includes(
      '<script src="/assets/published-page-M0Ar9lYV.js" defer></script>',
    ),
  );
  assert.equal(html.split('<script').length - 1, 1);
  // The placeholder stays the source of the diagram for a reader with no
  // script.
  assert.ok(html.includes('<pre data-diagram="mermaid">graph TD;</pre>'));
  // With no script, and in every state that is not a note, the page holds
  // no script at all.
  assert.ok(!documentOf(view).includes('<script'));
  const locked = publishedDocument({
    view: { kind: 'locked' },
    stylesheets: [],
    formAction: '/published/abc',
    pageScript: '/assets/published-page-M0Ar9lYV.js',
  });
  assert.ok(!locked.includes('<script'));
});
