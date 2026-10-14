/** The one tool registry and its contract-only execution port (0227). */
import { findOperation, type OperationId } from '@notesapp/api-contract';
import type { CallToolResult, Tool } from '@modelcontextprotocol/server';

export type ContractInput = {
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly body?: unknown;
};
export type ContractAnswer = {
  readonly status: number;
  readonly body: unknown;
};
export type ContractCall = (
  id: OperationId,
  input?: ContractInput,
) => Promise<ContractAnswer>;
/** A tool receives no SDK context, notification, logging or progress function. */
export type ToolContext = { readonly call: ContractCall };
export type McpTool = {
  readonly definition: Tool;
  readonly scope: 'notes:read' | 'notes:write';
  readonly operations: readonly OperationId[];
  readonly run: (
    input: unknown,
    context: ToolContext,
  ) => Promise<CallToolResult>;
};

/** Later tool issues add rows here. The endpoint starts with no tools. */
export const mcpTools: readonly McpTool[] = [];

export function checkToolRegistry(tools: readonly McpTool[]): void {
  const names = new Set<string>();
  for (const tool of tools) {
    if (names.has(tool.definition.name))
      throw new Error('A tool name occurs twice.');
    names.add(tool.definition.name);
    if (tool.operations.length === 0)
      throw new Error('A tool names no operation.');
    for (const id of tool.operations) {
      const operation = findOperation(id);
      if (
        operation === undefined ||
        operation.protocol !== null ||
        !operation.security.some(
          (requirement) => 'personalApiKey' in requirement,
        )
      )
        throw new Error('A tool must name an account contract operation.');
      if (
        !['get', 'head'].includes(operation.method) &&
        tool.scope !== 'notes:write'
      )
        throw new Error('A write operation needs the write scope.');
    }
  }
}

/** This is the only context that reaches a registered tool. */
export function runTool(
  tool: McpTool,
  input: unknown,
  call: ContractCall,
): Promise<CallToolResult> {
  return tool.run(input, Object.freeze({ call }));
}
