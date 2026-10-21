/**
 * URL policy checks.
 *
 * The renderer trusts `classifyUrl` completely, so every accepted form and
 * every rejected form is listed here rather than inferred from rendered HTML.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Element, Root } from 'hast';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { classifyUrl, isIdentifier, sanitizeSchema } from './policy.ts';

const noteId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const attachmentId = '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';

await test('the front matter marker accepts only YAML', async () => {
  const tree: Root = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'pre',
        properties: { dataFrontmatter: 'yaml' },
        children: [{ type: 'text', value: 'accepted' }],
      },
      {
        type: 'element',
        tagName: 'pre',
        properties: {
          dataFrontmatter: 'toml',
          onClick: 'alert(1)',
        },
        children: [{ type: 'text', value: 'refused' }],
      },
    ],
  };
  const processor = unified()
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);
  assert.equal(
    processor.stringify(await processor.run(tree)),
    '<pre data-frontmatter="yaml">accepted</pre><pre>refused</pre>',
  );
});

await test('an identifier is accepted in either case', () => {
  assert.ok(isIdentifier(noteId));
  assert.ok(isIdentifier(noteId.toUpperCase()));
});

await test('a shape that is not a canonical identifier is rejected', () => {
  for (const value of [
    '',
    'not-a-uuid',
    '3f2504e0-4f89-41d3-9a0c-0305e82c330',
    '3f2504e0-4f89-41d3-9a0c-0305e82c33011',
    '3f2504e0_4f89_41d3_9a0c_0305e82c3301',
    // The nil and maximum identifiers are placeholders, not targets.
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    // A version or variant outside the defined set.
    '3f2504e0-4f89-91d3-9a0c-0305e82c3301',
    '3f2504e0-4f89-41d3-ca0c-0305e82c3301',
  ])
    assert.ok(!isIdentifier(value), value);
});

await test('the internal reference forms are accepted', () => {
  assert.deepEqual(classifyUrl(`/notes/${noteId}`), {
    kind: 'note',
    id: noteId,
    href: `/notes/${noteId}`,
  });
  assert.deepEqual(classifyUrl(`/attachments/${attachmentId}`), {
    kind: 'attachment',
    id: attachmentId,
    href: `/attachments/${attachmentId}`,
  });
});

await test('an identifier in upper case is normalized and the path is not', () => {
  assert.deepEqual(classifyUrl(`/notes/${noteId.toUpperCase()}`), {
    kind: 'note',
    id: noteId,
    href: `/notes/${noteId}`,
  });
  assert.deepEqual(classifyUrl(`/NOTES/${noteId}`), { kind: 'blocked' });
});

await test('parsed external schemes are accepted', () => {
  for (const url of [
    'https://example.com/page',
    'http://example.com/page',
    'HTTPS://example.com/page',
    'mailto:someone@example.com',
    'tel:+123456789',
    'sms:+123456789',
    'slack://channel?team=one&id=two',
    'vscode://file/home/user/note',
    'obsidian://open?vault=notes',
    'zoommtg://zoom.us/join?confno=123',
    'spotify:track:123',
    'figma://file/123',
    'notion://page/123',
    'custom+app.test:opaque',
    'ftp://example.com/file',
  ])
    assert.deepEqual(
      classifyUrl(url),
      { kind: 'external', href: url, protocol: new URL(url).protocol },
      url,
    );
});

await test('unsafe schemes and malformed addresses are blocked', () => {
  for (const url of [
    '',
    '   ',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'java script:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://example.com/id',
    'https://',
    'https://[invalid',
    '1invalid:target',
    '//evil.example.com/steal',
    '/notes/not-a-uuid',
    `/notes/${noteId}/extra`,
    `/notes/${noteId}?x=1`,
    `/attachments/${attachmentId}#fragment`,
    '/anything/else',
    '/',
  ])
    assert.deepEqual(classifyUrl(url), { kind: 'blocked' }, url);
});

await test('portable paths resolve inside the workspace tree', () => {
  assert.deepEqual(classifyUrl('../plan.md', 'projects/active/today.md'), {
    kind: 'relative',
    path: 'projects/plan.md',
    href: '../plan.md',
  });
  assert.deepEqual(
    classifyUrl('../../attachments/map%20one.png', 'projects/active/today.md'),
    {
      kind: 'relative',
      path: 'attachments/map one.png',
      href: '../../attachments/map%20one.png',
    },
  );
  assert.deepEqual(classifyUrl('../../outside.md', 'one/note.md'), {
    kind: 'blocked',
  });
});

await test('safe heading fragments are namespaced', () => {
  assert.deepEqual(classifyUrl('#a-fragment'), {
    kind: 'fragment',
    href: '#user-content-a-fragment',
  });
  assert.deepEqual(classifyUrl('#bad.fragment'), { kind: 'blocked' });
});

/** Sanitizes one hand-built tree with the schema alone. */
async function sanitized(children: Root['children']): Promise<string> {
  const processor = unified()
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify);
  return processor.stringify(await processor.run({ type: 'root', children }));
}

await test('the schema keeps an author element and refuses its unsafe attributes', async () => {
  // Record 0157. The renderer applies the author list first, and the schema is
  // the second gate behind it, so it refuses the same neighbours on its own.
  assert.equal(
    await sanitized([
      {
        type: 'element',
        tagName: 'kbd',
        properties: { onClick: 'x()', style: 'color:red', title: 't' },
        children: [{ type: 'text', value: 'K' }],
      },
      {
        type: 'element',
        tagName: 'details',
        properties: { open: true, onToggle: 'x()' },
        children: [{ type: 'text', value: 'D' }],
      },
      {
        type: 'element',
        tagName: 'script',
        properties: {},
        children: [{ type: 'text', value: 'gone' }],
      },
      {
        type: 'element',
        tagName: 'style',
        properties: {},
        children: [{ type: 'text', value: 'gone' }],
      },
    ]),
    '<kbd>K</kbd><details open>D</details>',
  );
});

await test('the schema keeps the code token classes and no other class', async () => {
  // Record 0159. A token of highlighted code is one span of a fixed class.
  assert.equal(
    await sanitized([
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['notes-code-keyword', 'notes-code-evil'] },
        children: [{ type: 'text', value: 'const' }],
      },
    ]),
    '<span class="notes-code-keyword">const</span>',
  );
});

await test('the schema keeps the check mark of a task and no other drawing', async () => {
  const mark = (points: string, viewBox: string): Element => ({
    type: 'element',
    tagName: 'svg',
    properties: { className: ['notes-task-mark'], viewBox },
    children: [
      {
        type: 'element',
        tagName: 'polyline',
        properties: { points },
        children: [],
      },
    ],
  });
  const item = (child: Element): Element => ({
    type: 'element',
    tagName: 'ul',
    properties: {},
    children: [
      { type: 'element', tagName: 'li', properties: {}, children: [child] },
    ],
  });
  assert.equal(
    await sanitized([item(mark('20 6 9 17 4 12', '0 0 24 24'))]),
    '<ul><li><svg class="notes-task-mark" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></li></ul>',
  );
  // Another drawing keeps no shape, and a mark outside an item does not stay.
  assert.equal(
    await sanitized([item(mark('0 0 24 24', '0 0 1 1'))]),
    '<ul><li><svg class="notes-task-mark"><polyline></polyline></svg></li></ul>',
  );
  // Outside an item the drawing loses its frame, and a line with no frame
  // draws nothing.
  assert.ok(
    !(await sanitized([mark('20 6 9 17 4 12', '0 0 24 24')])).includes('<svg'),
  );
});

await test('surrounding white space is ignored', () => {
  assert.deepEqual(classifyUrl(`  /notes/${noteId}  `), {
    kind: 'note',
    id: noteId,
    href: `/notes/${noteId}`,
  });
});
