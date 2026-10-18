import assert from 'node:assert/strict';
import test from 'node:test';
import { linkPreviewBlock } from '../apps/server/src/link-preview.ts';
import { gateFiles, sharedPath } from './link-preview-gate.ts';

await test('both pages of the gate carry the block of the server, byte for byte', () => {
  const origin = 'https://sample.example.com';
  const card = 'social-card-AbCd1234.png';
  const block = linkPreviewBlock(origin, `/assets/${card}`);
  const files = gateFiles(origin, card);
  assert.deepEqual(Object.keys(files), [
    'index.html',
    `${sharedPath.slice(1)}index.html`,
  ]);
  const root = files['index.html'] ?? '';
  const shared = files[`${sharedPath.slice(1)}index.html`] ?? '';
  for (const page of [root, shared]) {
    assert.equal(page.split(block).length - 1, 1);
    assert.ok(page.includes(`content="${origin}/"`));
  }
  // The two headings tell a person where a click went.
  assert.ok(root.includes('<h1>Root</h1>'));
  assert.ok(shared.includes('<h1>Shared address</h1>'));
});
