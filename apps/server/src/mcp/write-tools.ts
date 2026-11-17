/** The four write mappings of plan 022, through the contract as the grant actor. */
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { compileSchema, type OperationId } from '@notesapp/api-contract';
import type { Tool } from '@modelcontextprotocol/server';
import { createDocumentService } from '@notesapp/storage-server';
import type { ContractCall, ContractInput, McpTool } from './registry.ts';
import {
  fits,
  idSchema,
  noteIdentity,
  noteProperties,
  noteRequired,
  objectSchema,
  record,
  result,
  text,
  ToolFailure,
} from './read-support.ts';

const documents = createDocumentService();
export const maxWriteTextUnits = 1024 * 1024;
const textSchema = { type: 'string', maxLength: maxWriteTextUnits };
const pathSchema = { ...noteProperties.path, pattern: '\\.md$' };
const noteInput = {
  workspaceId: idSchema,
  fileId: idSchema,
  version: idSchema,
};
const noteKeys = ['workspaceId', 'fileId', 'version'];
const writeOutput = objectSchema(
  {
    ...noteProperties,
    version: idSchema,
    deleted: { type: 'boolean' },
    changed: { type: 'boolean' },
  },
  [...noteRequired, 'version', 'deleted', 'changed'],
);
const readAgain =
  'The note changed. Read the note again and try the change again.';

/** Map only safe status words. Never pass a contract or engine error to a client. */
export async function writeContract(
  call: ContractCall,
  id: OperationId,
  input: ContractInput,
) {
  const answer = await call(id, input);
  if (answer.status !== (id === 'createFile' ? 201 : 200)) {
    throw new ToolFailure(
      answer.status === 412
        ? readAgain
        : answer.status === 423
          ? 'This account is locked. Open the application to unlock it.'
          : answer.status === 401 || answer.status === 403
            ? 'This account cannot change these notes. Check access in the application.'
            : answer.status === 404 || answer.status === 410
              ? 'The note or workspace is not available. Read the list and try again.'
              : answer.status === 409
                ? 'The change conflicts with a note. Read the note list and choose another path or read the note again.'
                : answer.status === 413
                  ? 'The text is too large. Use less text and try again.'
                  : answer.status === 400 ||
                      answer.status === 422 ||
                      answer.status === 428
                    ? 'The change is not valid. Check the input and try again.'
                    : 'The server cannot change the note. Try again later.',
    );
  }
  return record(answer.body);
}
function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
function ids() {
  return {
    revisionId: randomUUID(),
    mutationId: randomUUID(),
    deviceId: 'mcp',
  };
}
export function accepted(workspaceId: string, answer: Record<string, unknown>) {
  const revision = record(answer.revision);
  if (typeof revision.deleted !== 'boolean')
    throw new Error('The revision state is missing.');
  return {
    ...noteIdentity(workspaceId, revision),
    version: text(revision, 'revisionId'),
    deleted: revision.deleted,
    changed: true,
  };
}
async function current(input: Record<string, unknown>, call: ContractCall) {
  const workspaceId = text(input, 'workspaceId');
  const params = { workspaceId, fileId: text(input, 'fileId') };
  const file = await writeContract(call, 'getFile', { params });
  const head = record(file.head);
  if (text(head, 'revisionId') !== text(input, 'version'))
    throw new ToolFailure(readAgain);
  if (file.kind !== 'note' || head.kind !== 'note' || head.deleted !== false)
    throw new ToolFailure(
      'This file is not a live note. Read the note list and choose a note.',
    );
  const epoch = head.epoch;
  if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < 1)
    throw new Error('The document generation is missing.');
  const bytes = Buffer.from(text(head, 'document'), 'base64');
  const source = documents.readText(bytes);
  if (source !== text(head, 'text'))
    throw new Error('The document and text do not match.');
  return { params, file, head, epoch, bytes, source };
}
function unchanged(
  workspaceId: string,
  file: Record<string, unknown>,
  head: Record<string, unknown>,
) {
  return {
    ...noteIdentity(workspaceId, file),
    version: text(head, 'revisionId'),
    deleted: false,
    changed: false,
  };
}

export function writeTool(
  definition: Tool,
  operations: readonly OperationId[],
  run: (
    input: Record<string, unknown>,
    call: ContractCall,
    grantId?: string,
  ) => Promise<Record<string, unknown>>,
): McpTool {
  const outputSchema: NonNullable<Tool['outputSchema']> =
    definition.outputSchema ?? writeOutput;
  const validateInput = compileSchema<Record<string, unknown>>(
    definition.inputSchema,
  );
  const { $schema, ...schema } = outputSchema;
  const validateOutput = compileSchema<Record<string, unknown>>({
    ...schema,
    ...($schema === undefined ? {} : { $schema }),
  });
  return {
    definition: {
      ...definition,
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: [
          'edit_note',
          'patch_note',
          'move_note_to_trash',
        ].includes(definition.name),
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    scope: 'notes:write',
    operations,
    run: async (input, context) => {
      try {
        if (!validateInput(input))
          throw new ToolFailure(
            'The tool input is not valid. Check the input and try again.',
          );
        const body = await run(input, context.call, context.grantId);
        if (!validateOutput(body) || !fits(body))
          throw new Error('The tool answer is not valid.');
        return result(body);
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                error instanceof ToolFailure
                  ? error.message
                  : 'The server cannot change the note. Try again later.',
            },
          ],
        };
      }
    },
  };
}

const createNote = writeTool(
  {
    name: 'create_note',
    description:
      'Create a note at a free path with its whole text. A path that holds a note refuses the call.',
    inputSchema: objectSchema(
      { workspaceId: idSchema, path: pathSchema, text: textSchema },
      ['workspaceId', 'path', 'text'],
    ),
  },
  ['createFile'],
  async (input, call) => {
    const workspaceId = text(input, 'workspaceId');
    const source = documents.start('');
    const written = documents.replaceText(source, text(input, 'text'));
    if (!written.ok)
      throw new ToolFailure(
        'The text cannot be saved. Use less text or check its characters and try again.',
      );
    return accepted(
      workspaceId,
      await writeContract(call, 'createFile', {
        params: { workspaceId },
        body: {
          ...ids(),
          fileId: randomUUID(),
          path: text(input, 'path'),
          document: {
            update: base64(
              documents.delta(
                written.value.bytes,
                documents.stateVector(source),
              ),
            ),
            epoch: 1,
            observed: base64(documents.observe(source)),
          },
        },
      }),
    );
  },
);
const editNote = writeTool(
  {
    name: 'edit_note',
    description:
      'Edit the version of a note that you read. Supply text for a whole replacement, or oldText and newText for one exact match. Read the note again after a refused version or match.',
    inputSchema: {
      type: 'object',
      oneOf: [
        objectSchema({ ...noteInput, text: textSchema }, [...noteKeys, 'text']),
        objectSchema(
          {
            ...noteInput,
            oldText: { ...textSchema, minLength: 1 },
            newText: textSchema,
          },
          [...noteKeys, 'oldText', 'newText'],
        ),
      ],
    },
  },
  ['getFile', 'updateFile'],
  async (input, call) => {
    const head = await current(input, call);
    let next: string;
    if (typeof input.text === 'string') next = input.text;
    else {
      const oldText = text(input, 'oldText');
      const at = head.source.indexOf(oldText);
      // Count overlapping matches too. A repeated call cannot reach this step
      // once its first write moves the required version.
      if (at < 0)
        throw new ToolFailure(
          'The old text is not in the note. Read the note again and choose text from the note.',
        );
      if (head.source.indexOf(oldText, at + 1) >= 0)
        throw new ToolFailure(
          'The old text occurs more than once. Read the note again and choose text that occurs once.',
        );
      next =
        head.source.slice(0, at) +
        text(input, 'newText') +
        head.source.slice(at + oldText.length);
    }
    if (next === head.source)
      return unchanged(head.params.workspaceId, head.file, head.head);
    const written = documents.replaceText(head.bytes, next);
    if (!written.ok)
      throw new ToolFailure(
        'The text cannot be saved. Use less text or check its characters and try again.',
      );
    return accepted(
      head.params.workspaceId,
      await writeContract(call, 'updateFile', {
        params: head.params,
        expectedVersion: text(input, 'version'),
        body: {
          ...ids(),
          document: {
            update: base64(
              documents.delta(
                written.value.bytes,
                documents.stateVector(head.bytes),
              ),
            ),
            epoch: head.epoch,
            observed: base64(documents.observe(head.bytes)),
          },
        },
      }),
    );
  },
);
const moveNote = writeTool(
  {
    name: 'move_note',
    description:
      'Move or rename the version of a note that you read. Read the note again when its version changes.',
    inputSchema: objectSchema({ ...noteInput, path: pathSchema }, [
      ...noteKeys,
      'path',
    ]),
  },
  ['getFile', 'updateFile'],
  async (input, call) => {
    const head = await current(input, call);
    const path = text(input, 'path').normalize('NFC');
    if (path === text(head.file, 'path'))
      return unchanged(head.params.workspaceId, head.file, head.head);
    return accepted(
      head.params.workspaceId,
      await writeContract(call, 'updateFile', {
        params: head.params,
        expectedVersion: text(input, 'version'),
        body: { ...ids(), path },
      }),
    );
  },
);
const trashNote = writeTool(
  {
    name: 'move_note_to_trash',
    description:
      'Move the version of a note that you read to Trash. Restore in the application can undo this change. Read the note again when its version changes.',
    inputSchema: objectSchema(noteInput, noteKeys),
  },
  ['getFile', 'deleteFile'],
  async (input, call) => {
    const head = await current(input, call);
    return accepted(
      head.params.workspaceId,
      await writeContract(call, 'deleteFile', {
        params: head.params,
        expectedVersion: text(input, 'version'),
        body: {
          ...ids(),
          document: {
            update: null,
            epoch: head.epoch,
            observed: base64(documents.observe(head.bytes)),
          },
        },
      }),
    );
  },
);
export const writeTools: readonly McpTool[] = [
  createNote,
  editNote,
  moveNote,
  trashNote,
];
