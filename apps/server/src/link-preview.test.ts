/**
 * The one link preview of the installation (design 028).
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { productName } from '@notesapp/core';
import {
  linkPreviewBlock,
  linkPreviewCardHref,
  linkPreviewDescription,
} from './link-preview.ts';
import { readOrigin } from './served-origins.ts';

const card = '/assets/social-card-AbCd1234.png';

await test('the block names the product, the root and the card of the origin', () => {
  const block = linkPreviewBlock('https://notes.example.com', card);
  assert.equal(
    block,
    [
      '<meta property="og:type" content="website">',
      `<meta property="og:site_name" content="${productName}">`,
      `<meta property="og:title" content="${productName}">`,
      `<meta property="og:description" content="${linkPreviewDescription}">`,
      '<meta property="og:url" content="https://notes.example.com/">',
      `<meta property="og:image" content="https://notes.example.com${card}">`,
      '<meta property="og:image:type" content="image/png">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      `<meta property="og:image:alt" content="${productName}: Markdown notes that work offline">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="description" content="${linkPreviewDescription}">`,
    ].join('\n    '),
  );
});

await test('a self-hosted origin keeps its port and its scheme', () => {
  const origin = readOrigin('http://192.168.1.20:8080');
  assert.equal(origin, 'http://192.168.1.20:8080');
  const block = linkPreviewBlock(origin ?? '', card);
  assert.ok(block.includes('content="http://192.168.1.20:8080/"'));
  assert.ok(block.includes(`content="http://192.168.1.20:8080${card}"`));
  // An IPv6 host keeps its brackets.
  const six = readOrigin('https://[::1]:8443') ?? '';
  assert.ok(
    linkPreviewBlock(six, card).includes('content="https://[::1]:8443/"'),
  );
});

await test('the configured origin can carry no path, so the root is the origin', () => {
  assert.equal(readOrigin('https://example.com/notes'), null);
  assert.equal(readOrigin('https://example.com/?a=1'), null);
  assert.equal(readOrigin('https://example.com/#a'), null);
  assert.equal(readOrigin('https://example.com/'), 'https://example.com');
});

await test('every value is an escaped attribute', () => {
  const block = linkPreviewBlock('https://a.example"><script>', card);
  assert.ok(!block.includes('<script>'));
  assert.ok(block.includes('&quot;&gt;&lt;script&gt;'));
});

await test('the card of a build is found by its hashed name, once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-card-'));
  try {
    assert.equal(linkPreviewCardHref(directory), null);
    await mkdir(join(directory, 'assets'));
    assert.equal(linkPreviewCardHref(directory), null);
    await writeFile(join(directory, 'assets/social-card.png'), 'x');
    assert.equal(linkPreviewCardHref(directory), null);
    await writeFile(join(directory, 'assets/social-card-AbCd1234.png'), 'x');
    assert.equal(linkPreviewCardHref(directory), card);
    await writeFile(join(directory, 'assets/social-card-AbCd1234.png.br'), 'x');
    assert.equal(linkPreviewCardHref(directory), card);
    await writeFile(join(directory, 'assets/social-card-ZzZz9999.png'), 'x');
    assert.equal(linkPreviewCardHref(directory), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
