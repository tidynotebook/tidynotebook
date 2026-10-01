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
  assert.match(page, /<link rel="stylesheet" href="\/assets\/index-abc\.css">/);
  assert.match(page, /<p>Run by Example Ltd\.<\/p>/);
  assert.match(page, /href="\/legal\/privacy">Privacy notice<\/a>/);
  assert.match(page, /href="\/login">Sign in<\/a>/);
  assert.equal(/<script|<form| on[a-z]+=/i.test(page), false);
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
