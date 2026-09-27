/**
 * The document that a published link answers, in every state.
 *
 * Decision 0047 gives the page one answer for every state of a link, so each
 * of the four states is a case here. The module reads no store, so the checks
 * are direct: one view goes in and one document comes out.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyListSentence,
  escapeAttribute,
  escapeText,
  lockedSentence,
  publishedDocument,
  publishedDocumentClasses,
  readableNoteName,
  reportedSentence,
  reportReasonWords,
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

await test('a link that opens nothing says one sentence and no more', () => {
  const html = documentOf({ kind: 'unavailable' });
  assert.ok(html.includes(unavailableSentence));
  // The words of a locked link are not on this page, so the reader learns
  // nothing about the cause.
  assert.ok(!html.includes(lockedSentence));
  assert.ok(!html.includes('<form'));
  assert.ok(!html.includes('<script'));
});

await test('a locked link shows the form and the same words every time', () => {
  const html = documentOf({ kind: 'locked' });
  assert.ok(html.includes(lockedSentence));
  assert.ok(html.includes('method="post"'));
  assert.ok(html.includes('name="password"'));
  assert.ok(html.includes('type="password"'));
  // The form names the address of the page, so an unlock returns to it.
  assert.ok(html.includes('action="/published/abc"'));
  assert.ok(!html.includes('<script'));
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
    name: 'Day one',
    body: '<h1>Day one</h1>',
    listHref: '/published/abc',
  });
  assert.ok(html.includes('<title>Day one</title>'));
  assert.ok(html.includes('All notes'));
  assert.ok(html.includes('<h1>Day one</h1>'));
});

await test('a note link offers no list, because it opens one note', () => {
  const html = documentOf({
    kind: 'note',
    name: 'Day one',
    body: '<p>text</p>',
    listHref: null,
  });
  assert.ok(!html.includes('All notes'));
});

await test('a name that holds markup cannot end an element', () => {
  const html = documentOf({
    kind: 'note',
    name: '</title><script>alert(1)</script>',
    body: '<p>safe</p>',
    listHref: null,
  });
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes('&lt;/title&gt;'));
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
    view: { kind: 'note', name: 'Day one', body: '<p>x</p>', listHref: null },
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
  assert.ok(html.includes('<title>Report this page</title>'));
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
