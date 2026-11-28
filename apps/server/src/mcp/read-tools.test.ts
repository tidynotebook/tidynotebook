import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  describeIssues,
  responseValidator,
  type OperationId,
} from '@notesapp/api-contract';
import { mcpTools, runTool, type ContractCall } from './registry.ts';
import {
  maxToolResultBytes,
  notePageUnits,
  record,
  rows,
  text,
} from './read-support.ts';

const workspaceId = randomUUID();
const fileId = randomUUID();
const version = randomUUID();
const identity = { workspaceId, fileId, path: 'folder/Name.md', name: 'Name' };
function tool(name: string) {
  const found = mcpTools.find((entry) => entry.definition.name === name);
  assert.ok(found);
  return found;
}
function revision(source: string, fields: Record<string, unknown> = {}) {
  return {
    fileId,
    revisionId: version,
    path: identity.path,
    kind: 'note',
    deleted: false,
    text: source,
    ...fields,
  };
}
async function invoke(name: string, input: unknown, call: ContractCall) {
  const answer = await runTool(tool(name), input, call);
  assert.ok(Buffer.byteLength(JSON.stringify(answer)) <= maxToolResultBytes);
  assert.equal(answer.isError, undefined, JSON.stringify(answer));
  const body = record(answer.structuredContent);
  assert.deepEqual(answer.content, [
    { type: 'text', text: JSON.stringify(body) },
  ]);
  return body;
}
function accepted(body: unknown) {
  return Promise.resolve({ status: 200, body });
}
function fails(name: string, input: unknown, call: ContractCall) {
  return runTool(tool(name), input, call).then((answer) => {
    assert.equal(answer.isError, true, JSON.stringify(answer));
    assert.equal(answer.structuredContent, undefined);
    const content = answer.content[0];
    assert.ok(content?.type === 'text');
    return content.text;
  });
}

function checkRestFixture(id: OperationId, body: unknown): void {
  const validate = responseValidator(id, 200, 'application/json');
  assert.ok(validate, `${id} needs a JSON response schema.`);
  const valid = validate(body);
  assert.ok(valid, `${id}: ${JSON.stringify(describeIssues(validate.errors))}`);
}

await test('each MCP read tool projects valid REST responses', async () => {
  const workspace = {
    workspaceId,
    name: 'Work',
    role: 'owner',
    personal: false,
  };
  const timestamp = '2026-11-28T00:00:00.000Z';
  const file = {
    fileId,
    path: identity.path,
    kind: 'note',
    headRevisionId: version,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const historyFields = {
    revisionId: version,
    fileId,
    path: identity.path,
    deleted: false,
    size: 4,
    message: 'Checkpoint',
    merged: false,
    restoredFrom: null,
  };
  const revisionDetails = {
    ...historyFields,
    parents: [],
    digest: '0'.repeat(64),
    clientTime: timestamp,
    serverTime: timestamp,
  };
  const noteHead = {
    ...revisionDetails,
    kind: 'note',
    text: 'Text',
    document: 'AA==',
    epoch: 1,
    attachmentObjectId: null,
  };
  const reference = { fileId, path: file.path, revisionId: version };
  const excerpt = [{ text: 'Text', marked: true }];
  const data: Partial<Record<OperationId, unknown>> = {
    listWorkspaces: { workspaces: [{ ...workspace, memberCount: 2 }] },
    listFiles: { files: [file], nextCursor: null },
    getFile: { ...file, head: { ...noteHead, document: null } },
    getRevision: noteHead,
    searchFiles: { hits: [{ ...reference, excerpt }] },
    listBacklinks: { backlinks: [reference] },
    listHistory: {
      revisions: [
        {
          ...revisionDetails,
          actorAccountId: randomUUID(),
          isCheckpoint: true,
          checkpointName: 'Checkpoint',
          text: 'Never return history text.',
          objectId: null,
          contributors: [
            { accountId: null, displayName: null, formerMember: true },
          ],
        },
      ],
      nextCursor: null,
    },
  };
  const note = { workspaceId, fileId };
  const summary = { ...identity, version };
  const read = { ...summary, text: 'Text', offset: 0, nextOffset: null };
  const cases = [
    [
      'list_workspaces',
      {},
      ['listWorkspaces'],
      { workspaces: [workspace], nextOffset: null },
    ],
    [
      'list_notes',
      { workspaceId },
      ['listFiles'],
      { notes: [summary], nextCursor: null },
    ],
    ['read_note', note, ['getFile'], read],
    ['read_note', { ...note, version }, ['getRevision'], read],
    [
      'search_notes',
      { query: 'Text' },
      ['listWorkspaces', 'searchFiles'],
      { hits: [{ ...summary, excerpt }], nextOffset: null, nextCursor: null },
    ],
    [
      'list_backlinks',
      note,
      ['listBacklinks'],
      { backlinks: [summary], nextOffset: null },
    ],
    [
      'list_note_history',
      note,
      ['listHistory'],
      {
        revisions: [
          {
            ...summary,
            deleted: false,
            size: 4,
            message: 'Checkpoint',
            isCheckpoint: true,
            merged: false,
            restoredFrom: null,
          },
        ],
        nextCursor: null,
      },
    ],
  ] as const;
  assert.deepEqual(
    [...new Set(cases.map(([name]) => name))].sort(),
    mcpTools
      .filter((entry) => entry.scope === 'notes:read')
      .map((entry) => entry.definition.name)
      .sort(),
  );
  for (const [name, input, operations, expected] of cases) {
    const declared = tool(name).operations;
    for (const id of operations) {
      assert.ok(declared.includes(id), `${name} did not declare ${id}.`);
      checkRestFixture(id, data[id]);
    }
    const calls: OperationId[] = [];
    const body = await invoke(name, input, (id) => {
      calls.push(id);
      return accepted(data[id]);
    });
    assert.deepEqual(calls, operations, name);
    assert.deepEqual(body, expected, name);
  }
});

await test('workspace lists keep every REST role and omit REST-only fields', async () => {
  const document: unknown = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/api-contract/src/generated/openapi.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const schemas = record(record(record(document).components).schemas);
  const roles = record(schemas.Role).enum;
  assert.ok(Array.isArray(roles) && roles.length > 1);
  const workspaces = roles.map((role: unknown) => {
    assert.equal(typeof role, 'string');
    return { workspaceId: randomUUID(), name: 'Shared', role, personal: false };
  });
  const restWorkspaces = workspaces.map((workspace) => ({
    ...workspace,
    memberCount: 2,
  }));
  const restFields = Object.keys(
    record(record(schemas.Workspace).properties),
  ).sort();
  for (const workspace of restWorkspaces) {
    assert.deepEqual(
      Object.keys(workspace).sort(),
      restFields,
      'Include optional REST fields so the projection is checked.',
    );
  }
  const response = { workspaces: restWorkspaces };
  checkRestFixture('listWorkspaces', response);
  const call: ContractCall = () => accepted(response);
  assert.deepEqual(await invoke('list_workspaces', { limit: 1 }, call), {
    workspaces: workspaces.slice(0, 1),
    nextOffset: 1,
  });
  assert.deepEqual(await invoke('list_workspaces', { offset: 1 }, call), {
    workspaces: workspaces.slice(1),
    nextOffset: null,
  });
});

await test('bad input fails before a contract call and a bad answer has a safe error', async () => {
  let calls = 0;
  const call: ContractCall = () => {
    calls += 1;
    return accepted({});
  };
  for (const [name, input] of [
    ['read_note', { workspaceId, fileId: 'bad' }],
    ['read_note', { workspaceId, fileId, offset: -1 }],
    ['list_workspaces', { limit: 51 }],
    ['list_workspaces', { limit: 1.5 }],
    ['list_workspaces', { unknown: true }],
    ['search_notes', { query: '' }],
    ['list_note_history', { workspaceId, fileId, cursor: 'bad' }],
  ] as const)
    assert.match(await fails(name, input, call), /input is not valid/);
  assert.equal(calls, 0);
  assert.match(await fails('list_workspaces', {}, call), /Try again later/);
  assert.equal(calls, 1);
});
await test('long text pages keep every unit and the immutable version', async () => {
  for (const source of [
    'a'.repeat(notePageUnits - 1) + '😀' + 'b'.repeat(notePageUnits),
    '\u0001'.repeat(notePageUnits * 2),
    '界'.repeat(notePageUnits * 2),
  ]) {
    let offset = 0;
    let whole = '';
    const operations: string[] = [];
    do {
      const body = await invoke(
        'read_note',
        { workspaceId, fileId, ...(offset === 0 ? {} : { offset, version }) },
        (id, input) => {
          operations.push(id);
          if (id === 'getFile') {
            assert.deepEqual(input, {
              params: { workspaceId, fileId },
              query: { content: 'text' },
            });
            return accepted({
              fileId,
              path: identity.path,
              head: revision(source),
            });
          }
          assert.equal(id, 'getRevision');
          assert.deepEqual(input, {
            params: { workspaceId, revisionId: version },
          });
          return accepted(revision(source));
        },
      );
      assert.equal(body.version, version);
      const part = text(body, 'text');
      assert.ok(part.isWellFormed());
      if (source.includes('😀') && offset === 0)
        assert.equal(part.length, notePageUnits - 1);
      whole += part;
      if (body.nextOffset === null) break;
      assert.equal(body.nextOffset, offset + part.length);
      assert.ok(typeof body.nextOffset === 'number');
      offset = body.nextOffset;
    } while (offset < source.length);
    assert.equal(whole, source);
    assert.equal(operations[0], 'getFile');
    assert.ok(operations.slice(1).every((id) => id === 'getRevision'));
  }
});
await test('read refuses a mismatched file, an attachment and an invalid continuation', async () => {
  for (const fields of [
    { fileId: randomUUID() },
    { kind: 'attachment', text: null },
    { deleted: true },
  ])
    assert.match(
      await fails('read_note', { workspaceId, fileId, version }, () =>
        accepted(revision('Text', fields)),
      ),
      /no text/,
    );
  assert.match(
    await fails('read_note', { workspaceId, fileId, offset: 1 }, () => {
      throw new Error('No call may start.');
    }),
    /needs its version/,
  );
  for (const offset of [1, 4])
    assert.match(
      await fails('read_note', { workspaceId, fileId, version, offset }, () =>
        accepted(revision('😀')),
      ),
      /position is not valid/,
    );
});
await test('non-paged collections return whole items with an offset when the answer fills', async () => {
  const path = `${('f'.repeat(200) + '/').repeat(4)}${'n'.repeat(200)}.md`;
  const backlinks = Array.from({ length: 50 }, () => ({
    fileId: randomUUID(),
    path,
    revisionId: randomUUID(),
  }));
  let offset = 0;
  const found: string[] = [];
  while (offset < backlinks.length) {
    const body = await invoke(
      'list_backlinks',
      { workspaceId, fileId, offset, limit: 50 },
      () => accepted({ backlinks }),
    );
    const page = rows(body, 'backlinks');
    assert.ok(page.length > 0 && page.length < 50);
    found.push(...page.map((item) => text(item, 'fileId')));
    if (body.nextOffset === null) break;
    assert.ok(typeof body.nextOffset === 'number');
    offset = body.nextOffset;
  }
  assert.deepEqual(
    found,
    backlinks.map((item) => item.fileId),
  );
});
await test('a large cursor page halves its contract limit and keeps that answer cursor', async () => {
  const limits: number[] = [];
  const path = `${('f'.repeat(200) + '/').repeat(4)}${'n'.repeat(200)}.md`;
  const body = await invoke(
    'list_notes',
    { workspaceId, limit: 50, cursor: 'path.previous', sort: 'path' },
    (_id, input) => {
      const limit = input?.query?.limit;
      assert.ok(typeof limit === 'number');
      assert.equal(input?.query?.cursor, 'path.previous');
      assert.equal(input?.query?.sort, 'path');
      limits.push(limit);
      return accepted({
        files: Array.from({ length: limit }, () => ({
          fileId,
          path,
          kind: 'note',
          headRevisionId: version,
        })),
        nextCursor: `path.limit-${limit}`,
      });
    },
  );
  assert.deepEqual(limits, [50, 25, 12]);
  assert.equal(body.nextCursor, 'path.limit-12');
  assert.equal(rows(body, 'notes').length, 12);
  const empty = await invoke('list_notes', { workspaceId }, () =>
    accepted({ files: [{ kind: 'attachment' }], nextCursor: 'next' }),
  );
  assert.deepEqual(empty, { notes: [], nextCursor: 'next' });
});
await test('search pages never go past the contract best-match bound', async () => {
  const hits = Array.from({ length: 100 }, () => ({
    fileId: randomUUID(),
    path: identity.path,
    revisionId: version,
    excerpt: [],
  }));
  const all: string[] = [];
  for (let offset = 0; offset < 100; offset += 20) {
    const body = await invoke(
      'search_notes',
      { workspaceId, query: 'find', offset },
      (id, input) => {
        assert.equal(id, 'searchFiles');
        assert.equal(input?.query?.limit, 100);
        return accepted({ hits });
      },
    );
    all.push(...rows(body, 'hits').map((hit) => text(hit, 'fileId')));
    assert.equal(body.nextOffset, offset < 80 ? offset + 20 : null);
    assert.equal(body.nextCursor, null);
  }
  assert.deepEqual(
    all,
    hits.map((hit) => hit.fileId),
  );
  const message = await fails(
    'search_notes',
    { workspaceId, query: 'find' },
    () =>
      accepted({
        hits: [
          {
            ...hits[0],
            excerpt: Array.from({ length: 128 }, () => ({
              text: 'x'.repeat(1024),
              marked: false,
            })),
          },
        ],
      }),
  );
  assert.match(message, /One item is too large/);
});
await test('account search stops after ten workspace visits and continues with no missed match', async () => {
  const workspaces = Array.from({ length: 23 }, () => ({
    workspaceId: randomUUID(),
  }));
  const all: string[] = [];
  let cursor: string | undefined;
  let round = 0;
  do {
    const visits: string[] = [];
    const body = await invoke(
      'search_notes',
      { query: 'find', ...(cursor === undefined ? {} : { cursor }) },
      (id, input) => {
        if (id === 'listWorkspaces') return accepted({ workspaces });
        assert.equal(id, 'searchFiles');
        const current = input?.params?.workspaceId;
        assert.ok(current);
        visits.push(current);
        return accepted({
          hits: [
            { fileId, path: identity.path, revisionId: version, excerpt: [] },
          ],
        });
      },
    );
    assert.deepEqual(
      visits,
      workspaces
        .slice(round * 10, round * 10 + 10)
        .map((item) => item.workspaceId),
    );
    all.push(...rows(body, 'hits').map((hit) => text(hit, 'workspaceId')));
    cursor = typeof body.nextCursor === 'string' ? body.nextCursor : undefined;
    round += 1;
  } while (cursor !== undefined);
  assert.equal(round, 3);
  assert.deepEqual(
    all,
    workspaces.map((item) => item.workspaceId),
  );
});
await test('account search continues within a workspace when its page fills', async () => {
  const ids = Array.from({ length: 32 }, () => randomUUID());
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const body = await invoke(
      'search_notes',
      { query: 'find', limit: 7, ...(cursor === undefined ? {} : { cursor }) },
      (id) =>
        id === 'listWorkspaces'
          ? accepted({ workspaces: [{ workspaceId }] })
          : accepted({
              hits: ids.map((id) => ({
                fileId: id,
                path: identity.path,
                revisionId: version,
                excerpt: [],
              })),
            }),
    );
    seen.push(...rows(body, 'hits').map((hit) => text(hit, 'fileId')));
    cursor = typeof body.nextCursor === 'string' ? body.nextCursor : undefined;
  } while (cursor !== undefined);
  assert.deepEqual(seen, ids);
});
await test('contract errors use safe messages with no source detail', async () => {
  for (const status of [400, 401, 403, 404, 410, 423, 429, 500]) {
    const message = await fails('list_workspaces', {}, () =>
      Promise.resolve({ status, body: { detail: 'secret-engine-detail' } }),
    );
    assert.doesNotMatch(message, /secret-engine-detail/);
    assert.match(message, /\./);
  }
});

await test('an empty account-search page still continues past the first ten workspaces', async () => {
  const workspaces = Array.from({ length: 11 }, () => ({
    workspaceId: randomUUID(),
  }));
  const call: ContractCall = (id, input) =>
    id === 'listWorkspaces'
      ? accepted({ workspaces })
      : accepted({
          hits:
            input?.params?.workspaceId === workspaces[10]?.workspaceId
              ? [
                  {
                    fileId,
                    path: identity.path,
                    revisionId: version,
                    excerpt: [],
                  },
                ]
              : [],
        });
  const first = await invoke('search_notes', { query: 'find' }, call);
  assert.deepEqual(first.hits, []);
  assert.equal(typeof first.nextCursor, 'string');
  const next = await invoke(
    'search_notes',
    { query: 'find', cursor: first.nextCursor },
    call,
  );
  assert.equal(rows(next, 'hits')[0]?.workspaceId, workspaces[10]?.workspaceId);
  assert.equal(next.nextCursor, null);
});
