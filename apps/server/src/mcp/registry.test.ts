import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkToolRegistry,
  mcpTools,
  runTool,
  type McpTool,
} from './registry.ts';

await test('the production registry has no tool', () => {
  assert.deepEqual(mcpTools, []);
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
      assert.deepEqual(Object.keys(context), ['call']);
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
