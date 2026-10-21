import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLinkAction } from './note-link.ts';

const noteId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

await test('a stable note link opens that note', () => {
  assert.deepEqual(resolveLinkAction(`/notes/${noteId}`), {
    kind: 'note-id',
    fileId: noteId,
  });
  assert.deepEqual(resolveLinkAction(`/notes/${noteId}#heading`), {
    kind: 'note-id',
    fileId: noteId,
  });
  assert.deepEqual(resolveLinkAction('/notes/'), { kind: 'none' });
});

await test('an allowed address opens outside the application', () => {
  assert.deepEqual(resolveLinkAction('https://example.com/page'), {
    kind: 'external',
    url: 'https://example.com/page',
  });
  assert.deepEqual(resolveLinkAction('  http://example.com  '), {
    kind: 'external',
    url: 'http://example.com',
  });
  assert.deepEqual(resolveLinkAction('mailto:someone@example.com'), {
    kind: 'external',
    url: 'mailto:someone@example.com',
  });
});

await test('an unsafe or protocol relative address asks for nothing', () => {
  for (const destination of [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://example.com/id',
    'https://[invalid',
    '//evil.example.com/steal',
    'java\tscript:alert(1)',
    '',
    '   ',
  ])
    assert.deepEqual(resolveLinkAction(destination), { kind: 'none' });
});

await test('a relative Markdown path names another note', () => {
  assert.deepEqual(resolveLinkAction('../Ideas.md', 'Projects/Active.md'), {
    kind: 'note-path',
    path: 'Ideas.md',
  });
  assert.deepEqual(resolveLinkAction('Projects/Ideas.md'), {
    kind: 'note-path',
    path: 'Projects/Ideas.md',
  });
  assert.deepEqual(resolveLinkAction('Shopping'), { kind: 'none' });
  assert.deepEqual(resolveLinkAction('Shopping.MD#list'), { kind: 'none' });
});

await test('an application path or a bare fragment names no note', () => {
  assert.deepEqual(resolveLinkAction('/settings'), { kind: 'none' });
  assert.deepEqual(resolveLinkAction('#section'), { kind: 'none' });
});

await test('custom protocols use the shared external link policy', () => {
  for (const url of [
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
  ]) {
    assert.deepEqual(resolveLinkAction(url), { kind: 'external', url });
  }
});
