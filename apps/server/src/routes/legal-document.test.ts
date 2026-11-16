import assert from 'node:assert/strict';
import test from 'node:test';
import { legalDocument, otherDocument } from './legal-document.ts';

await test('the page of a document holds its body and no script', () => {
  const page = legalDocument({
    name: 'terms',
    body: '<h1>Terms of service</h1><p>Run by Example Ltd.</p>',
    stylesheets: ['/assets/index-abc.css'],
    otherHref: '/legal/privacy',
    version: '2026-10-01',
  });
  assert.match(page, /<span>Version 2026-10-01<\/span>/);
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<title>Terms<\/title>/);
  assert.ok(
    page.indexOf('<meta charset="utf-8">') < page.indexOf('rel="icon"'),
  );
  assert.ok(page.includes('href="/favicon.ico"'));
  assert.ok(page.includes('href="/favicon.svg"'));
  assert.ok(page.includes('href="/apple-touch-icon.png"'));
  assert.ok(!page.includes('rel="manifest"'));
  assert.match(page, /<link rel="stylesheet" href="\/assets\/index-abc\.css">/);
  assert.match(page, /<p>Run by Example Ltd\.<\/p>/);
  assert.match(page, /href="\/legal\/privacy">Privacy notice<\/a>/);
  assert.match(page, /href="\/login">Sign in<\/a>/);
  assert.equal(/<script|<form| on[a-z]+=/i.test(page), false);
  // The page follows the preference of the device (record 0151).
  assert.equal(page.includes('data-theme'), false);
});

await test('each document links the other one', () => {
  assert.equal(otherDocument('terms'), 'privacy');
  assert.equal(otherDocument('privacy'), 'terms');
  const page = legalDocument({
    name: 'privacy',
    body: '<p>Text</p>',
    stylesheets: [],
    otherHref: '/legal/terms',
    version: null,
  });
  assert.doesNotMatch(page, /Version/);
  assert.match(page, /<title>Privacy notice<\/title>/);
  assert.match(page, /href="\/legal\/terms">Terms<\/a>/);
});

await test('legal content keeps its utility row and uses operator footer links', () => {
  const page = legalDocument({
    name: 'terms',
    body: '<h1>Terms</h1>',
    stylesheets: [],
    otherHref: '/legal/privacy',
    version: 'v1',
    footer: {
      columns: [
        {
          title: 'Legal',
          links: [
            { label: 'Operator terms', href: 'https://operator.example/terms' },
          ],
        },
      ],
    },
  });
  assert.equal((page.match(/<footer/g) ?? []).length, 1);
  assert.ok(page.indexOf('<footer') > page.indexOf('</main>'));
  assert.ok(page.includes('href="https://operator.example/terms"'));
  assert.doesNotMatch(page, /tidynotebook.com\/terms/);
});
