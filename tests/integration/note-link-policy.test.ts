import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorState } from '../../packages/editor/node_modules/@codemirror/state/dist/index.js';
import { renderMarkdown } from '@notesapp/markdown';
import { linkSpanAt } from '@notesapp/editor';
import {
  noteMarkdown,
  parsedWhole,
} from '../../packages/editor/dist/language.js';
import { resolveLinkAction } from '../../apps/web/src/lib/note-link.ts';

await test('editor and history link targets use the shared scheme policy', () => {
  const allowed = [
    'mailto:a@example.com',
    'tel:+123456789',
    'sms:+123456789',
    'slack://channel',
    'vscode://file/note',
    'obsidian://open',
    'zoommtg://join',
    'spotify:track:123',
    'figma://file/123',
    'notion://page/123',
    'custom+app:target',
  ];
  const blocked = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java&#x73;cript:alert(1)',
    'java&#9;script:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,test',
    'blob:https://example.com/id',
    'file:///etc/passwd',
    'https://[invalid',
  ];
  for (const readOnly of [false, true]) {
    for (const href of [...allowed, ...blocked]) {
      const state = parsedWhole(
        EditorState.create({
          doc: `[Open](<${href}>)`,
          extensions: [noteMarkdown(), EditorState.readOnly.of(readOnly)],
        }),
      );
      const span = linkSpanAt(state, 2);
      assert.ok(span !== null, href);
      const action = resolveLinkAction(span.target.target);
      assert.equal(
        action.kind,
        allowed.includes(href) ? 'external' : 'none',
        href,
      );
    }
  }
});

await test('editor and history autolinks reach the same address as rendered notes', async () => {
  for (const [source, href] of [
    ['<a@example.com>', 'mailto:a@example.com'],
    ['a@example.com', 'mailto:a@example.com'],
    ['www.example.com', 'http://www.example.com'],
    ['<mailto:a@example.com>', 'mailto:a@example.com'],
  ]) {
    assert.ok(source !== undefined && href !== undefined);
    const html = await renderMarkdown(source);
    assert.ok(html.includes(`href="${href}"`));
    for (const readOnly of [false, true]) {
      const state = parsedWhole(
        EditorState.create({
          doc: source,
          extensions: [noteMarkdown(), EditorState.readOnly.of(readOnly)],
        }),
      );
      const span = linkSpanAt(state, 2);
      assert.ok(span !== null);
      assert.deepEqual(resolveLinkAction(span.target.target), {
        kind: 'external',
        url: href,
      });
    }
  }
});
