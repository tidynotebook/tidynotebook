import assert from 'node:assert/strict';
import test from 'node:test';
import { linkPreviewBlock } from '../apps/server/src/link-preview.ts';
import {
  gateOrigin,
  gatePages,
  gateReadme,
  headings,
  sharedPath,
} from './link-preview-gate/gate.ts';

const origin = 'https://sample.example.com';
const card = 'social-card-AbCd1234.png';

await test('both pages of the gate carry the block of the server, byte for byte', () => {
  const block = linkPreviewBlock(origin, `/assets/${card}`);
  const pages = gatePages(origin, card);
  assert.deepEqual(Object.keys(pages), [
    'index.html',
    `${sharedPath.slice(1)}index.html`,
  ]);
  const root = pages['index.html'] ?? '';
  const shared = pages[`${sharedPath.slice(1)}index.html`] ?? '';
  for (const page of [root, shared]) {
    assert.equal(page.split(block).length - 1, 1);
    assert.ok(page.includes(`content="${origin}/"`));
    assert.doesNotMatch(page, /<script|<link|src=/);
  }
  assert.ok(root.includes(`<h1>${headings.root}</h1>`));
  assert.ok(shared.includes(`<h1>${headings.shared}</h1>`));
});

await test('the gate takes one public HTTPS origin and nothing more', () => {
  assert.equal(gateOrigin('https://sample.example.com/'), origin);
  assert.equal(gateOrigin('http://sample.example.com'), null);
  assert.equal(gateOrigin('https://sample.example.com/notes'), null);
  assert.equal(gateOrigin('https://sample.example.com/?a=1'), null);
  assert.equal(gateOrigin('https://user:pass@sample.example.com'), null);
  assert.equal(gateOrigin('not an origin'), null);
});

await test('the steps name the addresses, the two outcomes and the source', () => {
  const readme = gateReadme({
    origin,
    cardName: card,
    cardDigest: 'ab'.repeat(32),
    source: '0'.repeat(40),
  });
  assert.ok(readme.includes(`${origin}${sharedPath}`));
  assert.ok(readme.includes(`${origin}/assets/${card}`));
  assert.ok(readme.includes('0'.repeat(40)));
  assert.match(readme, /Pass: .*Shared address/);
  assert.match(readme, /Fail: .*Root/);
});
