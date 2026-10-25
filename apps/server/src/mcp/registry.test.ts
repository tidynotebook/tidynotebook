import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkToolRegistry,
  mcpTools,
  runTool,
  type McpTool,
} from './registry.ts';

await test('the production registry has the note tools of plan 022 and design 027', () => {
  assert.deepEqual(
    mcpTools.map((tool) => [tool.definition.name, tool.scope, tool.operations]),
    [
      ['list_workspaces', 'notes:read', ['listWorkspaces']],
      ['list_notes', 'notes:read', ['listFiles']],
      ['read_note', 'notes:read', ['getFile', 'getRevision']],
      ['search_notes', 'notes:read', ['listWorkspaces', 'searchFiles']],
      ['list_backlinks', 'notes:read', ['listBacklinks']],
      ['list_note_history', 'notes:read', ['listHistory']],
      ['create_note', 'notes:write', ['createFile']],
      ['edit_note', 'notes:write', ['getFile', 'updateFile']],
      ['move_note', 'notes:write', ['getFile', 'updateFile']],
      ['move_note_to_trash', 'notes:write', ['getFile', 'deleteFile']],
      [
        'append_to_note',
        'notes:write',
        ['getMutationReceipt', 'getFile', 'commitChangeset'],
      ],
      [
        'patch_note',
        'notes:write',
        ['getMutationReceipt', 'getFile', 'commitChangeset'],
      ],
    ],
  );
  for (const tool of mcpTools) {
    assert.equal(tool.definition.inputSchema.type, 'object');
    assert.equal(tool.definition.outputSchema?.type, 'object');
    assert.deepEqual(tool.definition.annotations, {
      readOnlyHint: tool.scope === 'notes:read',
      destructiveHint: [
        'edit_note',
        'patch_note',
        'move_note_to_trash',
      ].includes(tool.definition.name),
      idempotentHint: true,
      openWorldHint: false,
    });
  }
  checkToolRegistry(mcpTools);
});
const definition = {
  name: 'test_only',
  description: 'Test only.',
  inputSchema: { type: 'object' as const },
};
await test('a tool names account operations and a scope that permits every write', () => {
  const tool: McpTool = {
    definition,
    scope: 'notes:read',
    operations: ['listWorkspaces'],
    run: () => Promise.resolve({ content: [] }),
  };
  checkToolRegistry([tool]);
  assert.throws(
    () => checkToolRegistry([{ ...tool, operations: ['createFile'] }]),
    /write scope/,
  );
  assert.throws(
    () => checkToolRegistry([{ ...tool, operations: ['revokeOtherSessions'] }]),
    /account contract/,
  );
  assert.throws(
    () => checkToolRegistry([{ ...tool, operations: [] }]),
    /no operation/,
  );
  assert.throws(() => checkToolRegistry([tool, tool]), /twice/);
});
await test('a registered handler gets no notification, progress or logging context', async () => {
  let ran = false;
  const tool: McpTool = {
    definition,
    scope: 'notes:read',
    operations: ['listWorkspaces'],
    run: async (_input, context) => {
      assert.deepEqual(Object.keys(context), ['call', 'grantId']);
      assert.equal(Object.isFrozen(context), true);
      for (const name of [
        'mcpReq',
        'server',
        'send',
        'sendNotification',
        'notify',
        'log',
        'progress',
      ])
        assert.equal(Reflect.get(context, name), undefined);
      const answer = await context.call('listWorkspaces');
      assert.equal(answer.status, 200);
      ran = true;
      return { content: [] };
    },
  };
  await runTool(tool, {}, () => Promise.resolve({ status: 200, body: {} }));
  assert.equal(ran, true);
});
