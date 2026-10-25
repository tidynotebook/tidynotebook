import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createDocumentService } from '@notesapp/storage-server';
import { mcpTools, type ContractCall } from './registry.ts';
import { record, maxToolResultBytes } from './read-support.ts';

const documents = createDocumentService();
const workspaceId = randomUUID();
const fileId = randomUUID();
const version = randomUUID();
const source = documents.start('Keep old text.');
const head = {
  fileId,
  path: 'Note.md',
  kind: 'note',
  head: {
    revisionId: version,
    kind: 'note',
    deleted: false,
    epoch: 1,
    text: 'Keep old text.',
    document: Buffer.from(source).toString('base64'),
  },
};
function tool(name: string) {
  const found = mcpTools.find((entry) => entry.definition.name === name);
  assert.ok(found, `The ${name} tool must exist.`);
  return found;
}
const existing = { workspaceId, fileId, version };

await test('each write maps only to the operations of plan 022', () => {
  for (const [name, operations] of [
    ['create_note', ['createFile']],
    ['edit_note', ['getFile', 'updateFile']],
    ['move_note', ['getFile', 'updateFile']],
    ['move_note_to_trash', ['getFile', 'deleteFile']],
  ] as const) {
    const entry = tool(name);
    assert.equal(entry.scope, 'notes:write');
    assert.deepEqual(entry.operations, operations);
    assert.equal(entry.definition.annotations?.readOnlyHint, false);
    assert.equal(
      entry.definition.annotations?.destructiveHint,
      name === 'edit_note' || name === 'move_note_to_trash',
    );
    assert.equal(entry.definition.annotations?.openWorldHint, false);
    assert.equal(entry.definition.outputSchema?.type, 'object');
  }
});

await test('edit validates its mode and version before contract work', async () => {
  for (const input of [
    { workspaceId, fileId, text: 'New' },
    { ...existing },
    { ...existing, oldText: '', newText: 'New' },
    { ...existing, text: 'New', oldText: 'old', newText: 'New' },
    { ...existing, oldText: 'old' },
    { ...existing, text: 1 },
    { ...existing, text: 'New', extra: true },
  ]) {
    let calls = 0;
    const result = await tool('edit_note').run(input, {
      call: async () => {
        calls += 1;
        return { status: 200, body: head };
      },
    });
    assert.equal(result.isError, true);
    assert.equal(calls, 0);
  }
});

await test('exact edit refuses zero and several matches without a write', async () => {
  for (const oldText of ['missing', 'e']) {
    const calls: string[] = [];
    const result = await tool('edit_note').run(
      { ...existing, oldText, newText: 'new' },
      {
        call: async (id) => {
          calls.push(id);
          return { status: 200, body: head };
        },
      },
    );
    assert.equal(result.isError, true);
    assert.deepEqual(calls, ['getFile']);
    assert.match(JSON.stringify(result.content), /Read the note again/);
  }
});

await test('exact and whole edits send a delta that yields only the expected text', async () => {
  for (const [input, expected] of [
    [{ ...existing, oldText: 'old', newText: 'new old' }, 'Keep new old text.'],
    [{ ...existing, text: 'Whole text 😀' }, 'Whole text 😀'],
    [{ ...existing, text: '' }, ''],
  ] as const) {
    let writes = 0;
    const call: ContractCall = async (id, request) => {
      if (id === 'getFile') return { status: 200, body: head };
      assert.equal(id, 'updateFile');
      assert.equal(request?.expectedVersion, version);
      const body = request?.body;
      assert.ok(body && typeof body === 'object' && 'document' in body);
      const save = body.document;
      assert.ok(
        save &&
          typeof save === 'object' &&
          'update' in save &&
          'observed' in save &&
          'epoch' in save,
      );
      assert.equal(save.epoch, 1);
      assert.ok(
        typeof save.update === 'string' && typeof save.observed === 'string',
      );
      assert.deepEqual(
        Buffer.from(save.observed, 'base64'),
        Buffer.from(documents.observe(source)),
      );
      const applied = documents.apply(
        source,
        Buffer.from(save.update, 'base64'),
      );
      assert.ok(applied.ok);
      assert.equal(applied.value.text, expected);
      writes += 1;
      return {
        status: 200,
        body: {
          revision: {
            fileId,
            path: 'Note.md',
            revisionId: randomUUID(),
            deleted: false,
          },
        },
      };
    };
    const result = await tool('edit_note').run(input, { call });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    assert.equal(writes, 1);
  }
});

await test('each existing-note write refuses another head before a write', async () => {
  for (const [name, input] of [
    ['edit_note', { ...existing, text: 'New' }],
    ['move_note', { ...existing, path: 'Moved.md' }],
    ['move_note_to_trash', existing],
  ] as const) {
    let calls = 0;
    const result = await tool(name).run(input, {
      call: async (id) => {
        calls += 1;
        assert.equal(id, 'getFile');
        return {
          status: 200,
          body: { ...head, head: { ...head.head, revisionId: randomUUID() } },
        };
      },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /Read the note again/);
    assert.equal(calls, 1);
  }
});

await test('an unchanged edit or move returns its version without a write', async () => {
  for (const [name, input] of [
    ['edit_note', { ...existing, text: head.head.text }],
    ['edit_note', { ...existing, oldText: 'old', newText: 'old' }],
    ['move_note', { ...existing, path: head.path }],
  ] as const) {
    const calls: string[] = [];
    const result = await tool(name).run(input, {
      call: async (id) => {
        calls.push(id);
        return { status: 200, body: head };
      },
    });
    assert.equal(result.isError, undefined, JSON.stringify(result));
    assert.equal(record(result.structuredContent).version, version);
    assert.equal(record(result.structuredContent).changed, false);
    assert.deepEqual(calls, ['getFile']);
  }
});

await test('Trash sends only the observed state of the head and no text update', async () => {
  const result = await tool('move_note_to_trash').run(existing, {
    call: async (id, request) => {
      if (id === 'getFile') return { status: 200, body: head };
      assert.equal(id, 'deleteFile');
      assert.equal(request?.expectedVersion, version);
      const body = request?.body;
      assert.ok(body && typeof body === 'object' && 'document' in body);
      assert.deepEqual(body.document, {
        update: null,
        epoch: 1,
        observed: Buffer.from(documents.observe(source)).toString('base64'),
      });
      return {
        status: 200,
        body: {
          revision: {
            fileId,
            path: 'Note.md',
            revisionId: randomUUID(),
            deleted: true,
          },
        },
      };
    },
  });
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.equal(record(result.structuredContent).deleted, true);
});

await test('write errors keep safe words and no contract detail', async () => {
  for (const status of [400, 401, 403, 404, 409, 412, 413, 422, 423, 500]) {
    const result = await tool('create_note').run(
      { workspaceId, path: 'New.md', text: 'Text' },
      {
        call: () =>
          Promise.resolve({
            status,
            body: { detail: 'private-engine-notice' },
          }),
      },
    );
    assert.equal(result.isError, true);
    assert.doesNotMatch(JSON.stringify(result), /private-engine-notice/);
  }
});

await test('write input bounds refuse work before a contract call and safe answers stay bounded', async () => {
  const { maxWriteTextUnits } = await import('./write-tools.ts');
  for (const [name, input] of [
    ['create_note', { workspaceId, path: 'Not a note', text: 'Text' }],
    [
      'create_note',
      { workspaceId, path: 'New.md', text: 'x'.repeat(maxWriteTextUnits + 1) },
    ],
    ['create_note', { workspaceId: 'not-an-id', path: 'New.md', text: 'Text' }],
    ['move_note', { ...existing, path: 'x'.repeat(1024) + '.md' }],
    ['move_note_to_trash', { ...existing, text: 'extra' }],
  ] as const) {
    let calls = 0;
    const answer = await tool(name).run(input, {
      call: () => {
        calls += 1;
        return Promise.resolve({ status: 200, body: head });
      },
    });
    assert.equal(answer.isError, true);
    assert.equal(calls, 0);
    assert.ok(Buffer.byteLength(JSON.stringify(answer)) <= maxToolResultBytes);
  }
  const result = await tool('create_note').run(
    { workspaceId, path: 'New.md', text: 'New' },
    {
      call: async (id, input) => {
        assert.equal(id, 'createFile');
        const body = record(input?.body);
        const save = record(body.document);
        assert.equal(save.epoch, 1);
        assert.ok(typeof save.update === 'string');
        const applied = documents.apply(
          documents.start(''),
          Buffer.from(save.update, 'base64'),
        );
        assert.ok(applied.ok);
        assert.equal(applied.value.text, 'New');
        return {
          status: 201,
          body: {
            revision: {
              fileId,
              path: 'New.md',
              revisionId: version,
              deleted: false,
            },
          },
        };
      },
    },
  );
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= maxToolResultBytes);
});

await test('an attachment or a malformed contract result never starts a note write', async () => {
  for (const value of [
    { ...head, kind: 'attachment' },
    { ...head, head: null },
    { ...head, head: { ...head.head, epoch: null } },
    { ...head, head: { ...head.head, document: null } },
    { ...head, head: { ...head.head, text: 'A different text' } },
  ]) {
    const calls: string[] = [];
    const result = await tool('edit_note').run(
      { ...existing, text: 'New' },
      {
        call: async (id) => {
          calls.push(id);
          return { status: 200, body: value };
        },
      },
    );
    assert.equal(result.isError, true);
    assert.deepEqual(calls, ['getFile']);
    assert.doesNotMatch(
      JSON.stringify(result),
      /epoch|document|different text/,
    );
  }
});

const grantId = 'unit-grant';
function noteHead(sourceText: string, revisionId = version) {
  const bytes = documents.start(sourceText);
  return {
    ...head,
    head: {
      ...head.head,
      revisionId,
      text: sourceText,
      document: Buffer.from(bytes).toString('base64'),
    },
  };
}
async function incremental(
  name: string,
  input: Record<string, unknown>,
  sourceText: string,
) {
  const current = noteHead(sourceText);
  let saved = sourceText;
  const calls: string[] = [];
  const answer = await tool(name).run(
    { ...existing, ...input },
    {
      grantId,
      call: async (id, request) => {
        calls.push(id);
        if (id === 'getMutationReceipt')
          return { status: 200, body: { status: 'absent' } };
        if (id === 'getFile') return { status: 200, body: current };
        assert.equal(id, 'commitChangeset');
        assert.deepEqual(request?.params, { workspaceId });
        assert.equal(request?.expectedVersion, undefined);
        const body = record(request?.body);
        assert.deepEqual(Object.keys(body).sort(), [
          'deviceId',
          'expectedHeads',
          'mutationId',
          'revisions',
        ]);
        assert.deepEqual(body.expectedHeads, { [fileId]: version });
        assert.equal(body.deviceId, 'mcp');
        assert.ok(Array.isArray(body.revisions));
        assert.equal(body.revisions.length, 1);
        const revision = record(body.revisions[0]);
        assert.deepEqual(Object.keys(revision).sort(), [
          'clientTime',
          'content',
          'deleted',
          'fileId',
          'parents',
          'path',
          'revisionId',
        ]);
        assert.deepEqual(revision.parents, [version]);
        assert.equal(revision.fileId, fileId);
        assert.equal(revision.path, 'Note.md');
        assert.equal(revision.deleted, false);
        const content = record(revision.content);
        assert.equal(content.kind, 'markdown');
        const save = record(content.document);
        assert.equal(save.epoch, 1);
        const original = Buffer.from(current.head.document, 'base64');
        assert.deepEqual(
          Buffer.from(textField(save, 'observed'), 'base64'),
          Buffer.from(documents.observe(original)),
        );
        const applied = documents.apply(
          original,
          Buffer.from(textField(save, 'update'), 'base64'),
        );
        assert.ok(applied.ok);
        saved = applied.value.text;
        return {
          status: 200,
          body: { revisions: [{ ...revision, merged: false }], superseded: [] },
        };
      },
    },
  );
  return { answer, saved, calls };
}
function textField(value: Record<string, unknown>, key: string): string {
  const member = value[key];
  assert.ok(typeof member === 'string');
  return member;
}
await test('incremental schemas refuse invalid modes, anchors and bounds before calls', async () => {
  const { maxPatchChanges } = await import('./incremental-tools.ts');
  const { maxWriteTextUnits } = await import('./write-tools.ts');
  for (const [name, input] of [
    ['append_to_note', { text: 'x', version: undefined }],
    ['append_to_note', { text: 'x', heading: '' }],
    ['append_to_note', { text: 'x', extra: true }],
    ['append_to_note', { text: 'x'.repeat(maxWriteTextUnits + 1) }],
    ['patch_note', { changes: [] }],
    [
      'patch_note',
      {
        changes: Array.from({ length: maxPatchChanges + 1 }, () => ({
          operation: 'insert_at_end',
          text: 'x',
        })),
      },
    ],
    [
      'patch_note',
      { changes: [{ operation: 'replace', text: 'x', anchor: '' }] },
    ],
    ['patch_note', { changes: [{ operation: 'replace', text: 'x' }] }],
    [
      'patch_note',
      { changes: [{ operation: 'insert_at_end', text: 'x', anchor: 'old' }] },
    ],
    [
      'patch_note',
      { changes: [{ operation: 'delete', text: 'x', anchor: 'old' }] },
    ],
  ] as const) {
    let calls = 0;
    const answer = await tool(name).run(
      { ...existing, ...input },
      {
        grantId,
        call: async () => {
          calls += 1;
          throw new Error('No call expected.');
        },
      },
    );
    assert.equal(answer.isError, true);
    assert.equal(calls, 0);
  }
});
await test('append uses both line break rules, empty notes and parser-resolved sections', async () => {
  for (const [sourceText, input, expected] of [
    ['', { text: 'new' }, 'new'],
    ['old', { text: 'new' }, 'old\nnew'],
    ['old\n', { text: 'new\n' }, 'old\nnew\n'],
    [
      '# A\nbody\n# B',
      { heading: '# A', text: 'new item' },
      '# A\nbody\nnew item\n# B',
    ],
    [
      '# A\nbody\n## Child\nchild\n# B\n',
      { heading: '# A', text: 'new\n' },
      '# A\nbody\n## Child\nchild\nnew\n# B\n',
    ],
    [
      '```md\n# A\n```\n# A\nbody',
      { heading: '# A', text: 'new' },
      '```md\n# A\n```\n# A\nbody\nnew',
    ],
    [
      'A\n===\nbody\n\nB\n===\n',
      { heading: 'A\n===', text: 'new' },
      'A\n===\nbody\n\nnew\nB\n===\n',
    ],
    [
      '# A\r\nbody\r\n# B',
      { heading: '# A', text: 'new' },
      '# A\r\nbody\r\nnew\n# B',
    ],
  ] as const) {
    const { answer, saved, calls } = await incremental(
      'append_to_note',
      input,
      sourceText,
    );
    assert.equal(answer.isError, undefined, JSON.stringify(answer));
    assert.equal(saved, expected);
    assert.deepEqual(calls, [
      'getMutationReceipt',
      'getFile',
      'commitChangeset',
    ]);
    assert.equal(record(answer.structuredContent).headMoved, false);
  }
});
await test('missing or repeated parser headings refuse after a second receipt check', async () => {
  for (const sourceText of [
    '```\n# A\n```',
    '# A\none\n# A\ntwo',
    '<div>\n# A\n</div>',
  ]) {
    const { answer, calls } = await incremental(
      'append_to_note',
      { heading: '# A', text: 'new' },
      sourceText,
    );
    assert.equal(answer.isError, true);
    assert.deepEqual(calls, [
      'getMutationReceipt',
      'getFile',
      'getMutationReceipt',
    ]);
  }
});
await test('patch resolves original anchors once, preserves exact text and accepts disjoint ranges in input order', async () => {
  const { answer, saved } = await incremental(
    'patch_note',
    {
      changes: [
        { operation: 'insert_after', anchor: 'last', text: '!' },
        { operation: 'replace', anchor: 'middle', text: 'new' },
        { operation: 'insert_before', anchor: 'first', text: '>' },
      ],
    },
    'first middle last',
  );
  assert.equal(answer.isError, undefined, JSON.stringify(answer));
  assert.equal(saved, '>first new last!');
  const ends = await incremental(
    'patch_note',
    {
      changes: [
        { operation: 'insert_at_end', text: 'END' },
        { operation: 'insert_at_start', text: 'START' },
      ],
    },
    'body',
  );
  assert.equal(ends.saved, 'STARTbodyEND');
  const noOp = await incremental(
    'patch_note',
    { changes: [{ operation: 'replace', anchor: 'body', text: 'body' }] },
    'body',
  );
  assert.equal(noOp.answer.isError, undefined);
  assert.ok(
    noOp.calls.includes('commitChangeset'),
    'Each accepted call makes a History version.',
  );
});
await test('patch refuses missing, overlapping matches, intersecting ranges, pair splits and new anchors', async () => {
  for (const [sourceText, changes] of [
    ['aaa', [{ operation: 'replace', anchor: 'aa', text: 'x' }]],
    ['body', [{ operation: 'replace', anchor: 'missing', text: 'x' }]],
    [
      'body',
      [
        { operation: 'replace', anchor: 'body', text: 'x' },
        { operation: 'replace', anchor: 'od', text: 'y' },
      ],
    ],
    [
      'body',
      [
        { operation: 'insert_at_start', text: 'x' },
        { operation: 'insert_before', anchor: 'body', text: 'y' },
      ],
    ],
    [
      'body',
      [
        { operation: 'replace', anchor: 'body', text: 'new' },
        { operation: 'replace', anchor: 'new', text: 'y' },
      ],
    ],
    ['😀', [{ operation: 'replace', anchor: '\ud83d', text: 'x' }]],
  ] as const) {
    const { answer, calls } = await incremental(
      'patch_note',
      { changes },
      sourceText,
    );
    assert.equal(answer.isError, true);
    assert.deepEqual(calls, [
      'getMutationReceipt',
      'getFile',
      'getMutationReceipt',
    ]);
  }
});
await test('used receipt returns only earlier-attempt fields without reading any note', async () => {
  const input = {
    ...existing,
    changes: [{ operation: 'replace', anchor: 'gone', text: 'new' }],
  };
  for (const status of ['other_request', 'accepted']) {
    const calls: string[] = [];
    const answer = await tool('patch_note').run(input, {
      grantId,
      call: async (id) => {
        calls.push(id);
        return { status: 200, body: { status } };
      },
    });
    assert.equal(answer.isError, undefined, JSON.stringify(answer));
    const body = record(answer.structuredContent);
    assert.deepEqual(Object.keys(body).sort(), [
      'changed',
      'earlierAttempt',
      'fileId',
      'message',
      'workspaceId',
    ]);
    assert.equal(body.earlierAttempt, true);
    assert.equal(body.changed, false);
    assert.deepEqual(calls, ['getMutationReceipt']);
  }
});
await test('identity and probe depend only on canonical input and grant, never on note state', async () => {
  const { incrementalMutationId, incrementalProbe } =
    await import('./incremental-tools.ts');
  const { requestDigest } = await import('@notesapp/core');
  const input = { ...existing, text: 'new' };
  assert.equal(
    incrementalMutationId(grantId, 'append_to_note', input),
    incrementalMutationId(grantId, 'append_to_note', {
      text: 'new',
      version,
      fileId,
      workspaceId,
    }),
  );
  assert.notEqual(
    incrementalMutationId(grantId, 'append_to_note', input),
    incrementalMutationId('new-grant', 'append_to_note', input),
  );
  assert.notEqual(
    incrementalMutationId(grantId, 'append_to_note', input),
    incrementalMutationId(grantId, 'append_to_note', {
      ...input,
      version: randomUUID(),
    }),
  );
  const probe = await incrementalProbe('append_to_note', input);
  assert.equal(
    probe,
    await requestDigest('mcp:append_to_note:receipt-probe', {}, input),
  );
  assert.notEqual(probe, await requestDigest('commitChangeset', {}, input));
  let query: unknown;
  await tool('append_to_note').run(input, {
    grantId,
    call: async (id, request) => {
      assert.equal(id, 'getMutationReceipt');
      query = request?.query;
      assert.deepEqual(request?.params, {
        workspaceId,
        mutationId: incrementalMutationId(grantId, 'append_to_note', input),
      });
      return { status: 200, body: { status: 'other_request' } };
    },
  });
  assert.deepEqual(query, { digest: probe });
});
await test('concurrent receipt wins over note-state refusal but never authorization or lock refusal', async () => {
  for (const status of [404, 410, 401, 403, 423]) {
    const calls: string[] = [];
    let probes = 0;
    const answer = await tool('append_to_note').run(
      { ...existing, text: 'new' },
      {
        grantId,
        call: async (id) => {
          calls.push(id);
          if (id === 'getMutationReceipt') {
            probes += 1;
            return {
              status: 200,
              body: { status: probes === 1 ? 'absent' : 'other_request' },
            };
          }
          assert.equal(id, 'getFile');
          return { status, body: {} };
        },
      },
    );
    if ([404, 410].includes(status)) {
      assert.equal(answer.isError, undefined);
      assert.equal(record(answer.structuredContent).earlierAttempt, true);
      assert.equal(probes, 2);
    } else {
      assert.equal(answer.isError, true);
      assert.equal(probes, 1);
    }
  }
  for (const at of [1, 2]) {
    let probes = 0;
    const answer = await tool('append_to_note').run(
      { ...existing, text: 'new' },
      {
        grantId,
        call: async (id) => {
          if (id === 'getMutationReceipt') {
            probes += 1;
            return probes === at
              ? { status: 423, body: {} }
              : { status: 200, body: { status: 'absent' } };
          }
          return { status: 404, body: {} };
        },
      },
    );
    assert.equal(answer.isError, true);
    assert.match(JSON.stringify(answer), /account is locked/);
    assert.equal(probes, at);
  }
});
await test('commit conflicts use their code, retry one epoch, and report stale input or merged work', async () => {
  for (const code of [
    'mutation_reused',
    'epoch_mismatch',
    'path_conflict',
    'success',
  ]) {
    let commits = 0;
    let reads = 0;
    const answer = await tool('append_to_note').run(
      { ...existing, version: randomUUID(), text: 'new' },
      {
        grantId,
        call: async (id) => {
          if (id === 'getMutationReceipt')
            return { status: 200, body: { status: 'absent' } };
          if (id === 'getFile') {
            reads += 1;
            return { status: 200, body: head };
          }
          commits += 1;
          if (code !== 'success') return { status: 409, body: { code } };
          return {
            status: 200,
            body: {
              revisions: [
                {
                  fileId,
                  path: 'Note.md',
                  deleted: false,
                  revisionId: randomUUID(),
                  merged: true,
                },
              ],
              superseded: [{ fileId }],
            },
          };
        },
      },
    );
    assert.equal(commits, code === 'epoch_mismatch' ? 2 : 1);
    assert.equal(reads, commits);
    if (code === 'mutation_reused') {
      assert.equal(answer.isError, undefined);
      assert.equal(record(answer.structuredContent).earlierAttempt, true);
    } else if (code === 'success') {
      assert.equal(answer.isError, undefined);
      assert.equal(record(answer.structuredContent).headMoved, true);
    } else assert.equal(answer.isError, true);
  }
});

await test('a section append recognizes CR-only heading boundaries', async () => {
  const { answer, saved } = await incremental(
    'append_to_note',
    { heading: '# A', text: 'new' },
    '# A\rbody\r# B',
  );
  assert.equal(answer.isError, undefined, JSON.stringify(answer));
  assert.equal(saved, '# A\rbody\rnew\n# B');
});

await test('a section append maps parser offsets past a leading BOM', async () => {
  const { answer, saved } = await incremental(
    'append_to_note',
    { heading: '# A', text: 'new' },
    '\uFEFF# A\nbody\n# B',
  );
  assert.equal(answer.isError, undefined, JSON.stringify(answer));
  assert.equal(saved, '\uFEFF# A\nbody\nnew\n# B');
});

await test('section boundaries preserve BOM, original line endings and heading levels', async (t) => {
  for (const [style, ending] of [
    ['LF', '\n'],
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ] as const) {
    for (const bom of ['', '\uFEFF']) {
      await t.test(
        `${style} ${bom === '' ? 'without BOM' : 'with BOM'}`,
        async () => {
          const source = `${bom}# A${ending}body${ending}## Child${ending}child${ending}# B${ending}last${ending}# C`;
          for (const [heading, expected] of [
            [
              '# A',
              `${bom}# A${ending}body${ending}## Child${ending}child${ending}new\n# B${ending}last${ending}# C`,
            ],
            [
              '## Child',
              `${bom}# A${ending}body${ending}## Child${ending}child${ending}new\n# B${ending}last${ending}# C`,
            ],
            [
              '# B',
              `${bom}# A${ending}body${ending}## Child${ending}child${ending}# B${ending}last${ending}new\n# C`,
            ],
            ['# C', `${source}\nnew`],
          ]) {
            const { answer, saved, calls } = await incremental(
              'append_to_note',
              { heading, text: 'new' },
              source,
            );
            assert.equal(answer.isError, undefined, JSON.stringify(answer));
            assert.equal(saved, expected);
            assert.deepEqual(calls, [
              'getMutationReceipt',
              'getFile',
              'commitChangeset',
            ]);
          }
          const adjacent = `${bom}# A${ending}# B`;
          const { answer, saved } = await incremental(
            'append_to_note',
            { heading: '# A', text: 'new\r\n' },
            adjacent,
          );
          assert.equal(answer.isError, undefined, JSON.stringify(answer));
          assert.equal(saved, `${bom}# A${ending}new\r\n# B`);
        },
      );
    }
  }
});
