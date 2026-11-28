/** The six read mappings of plan 022. Only the contract port reaches data. */
import { Buffer } from 'node:buffer';
import { workspaceRoles } from '@notesapp/core';
import type { ContractCall, McpTool } from './registry.ts';
import {
  arraySchema,
  cursorSchema,
  defaultToolPageSize,
  fits,
  idSchema,
  limitSchema,
  nextCursorSchema,
  nextOffsetSchema,
  noteIdentity,
  notePageUnits,
  noteProperties,
  noteRequired,
  nullableText,
  number,
  objectSchema,
  offsetPage,
  offsetSchema,
  readContract,
  readTool,
  record,
  rows,
  searchMatchLimit,
  searchWorkspaceLimit,
  text,
  tooLarge,
  ToolFailure,
} from './read-support.ts';

const noteInput = { workspaceId: idSchema, fileId: idSchema };
const noteKeys = ['workspaceId', 'fileId'];
const pageInput = { offset: offsetSchema, limit: limitSchema };
const nullableVersion = { anyOf: [idSchema, { type: 'null' }] };
const summarySchema = objectSchema(
  { ...noteProperties, version: nullableVersion },
  [...noteRequired, 'version'],
);
const workspaceSchema = objectSchema(
  {
    workspaceId: idSchema,
    name: { type: 'string', minLength: 1, maxLength: 200 },
    role: { enum: [...workspaceRoles] },
    personal: { type: 'boolean' },
  },
  ['workspaceId', 'name', 'role', 'personal'],
);
const searchHitSchema = objectSchema(
  {
    ...noteProperties,
    version: idSchema,
    excerpt: {
      type: 'array',
      maxItems: 128,
      items: objectSchema(
        {
          text: { type: 'string', maxLength: 1024 },
          marked: { type: 'boolean' },
        },
        ['text', 'marked'],
      ),
    },
  },
  [...noteRequired, 'version', 'excerpt'],
);

const listWorkspaces = readTool(
  {
    name: 'list_workspaces',
    description:
      'List the workspaces of this account. Pass nextOffset as offset to read the next page.',
    inputSchema: objectSchema(pageInput),
    outputSchema: objectSchema(
      {
        workspaces: arraySchema(workspaceSchema),
        nextOffset: nextOffsetSchema,
      },
      ['workspaces', 'nextOffset'],
    ),
  },
  ['listWorkspaces'],
  async (input, call) => {
    const workspaces = rows(
      await readContract(call, 'listWorkspaces'),
      'workspaces',
    ).map(({ workspaceId, name, role, personal }) => ({
      workspaceId,
      name,
      role,
      personal,
    }));
    return offsetPage(
      workspaces,
      number(input, 'offset', 0),
      number(input, 'limit', defaultToolPageSize),
      'workspaces',
    );
  },
);

/** Re-read with a smaller contract limit, so its own cursor stays exact. */
async function cursorPage(
  input: Record<string, unknown>,
  call: ContractCall,
  history: boolean,
) {
  const workspaceId = text(input, 'workspaceId');
  const params = history
    ? { workspaceId, fileId: text(input, 'fileId') }
    : { workspaceId };
  const cursor = input.cursor;
  let limit = number(input, 'limit', defaultToolPageSize);
  for (;;) {
    const query = {
      limit,
      ...(typeof cursor === 'string' ? { cursor } : {}),
      ...(!history
        ? { sort: typeof input.sort === 'string' ? input.sort : 'updated' }
        : {}),
    };
    const answer = await readContract(
      call,
      history ? 'listHistory' : 'listFiles',
      { params, query },
    );
    const entries = rows(answer, history ? 'revisions' : 'files');
    const items = history
      ? entries
          .filter(
            (entry) =>
              entry.objectId === null && text(entry, 'path').endsWith('.md'),
          )
          .map((entry) => ({
            ...noteIdentity(workspaceId, entry),
            version: text(entry, 'revisionId'),
            deleted: entry.deleted,
            size: entry.size,
            message: entry.message,
            isCheckpoint: entry.isCheckpoint,
            merged: entry.merged,
            restoredFrom: entry.restoredFrom,
          }))
      : entries
          .filter((entry) => entry.kind === 'note')
          .map((entry) => ({
            ...noteIdentity(workspaceId, entry),
            version: entry.headRevisionId,
          }));
    const body = {
      [history ? 'revisions' : 'notes']: items,
      nextCursor: nullableText(answer, 'nextCursor'),
    };
    if (fits(body)) return body;
    if (limit === 1) tooLarge();
    limit = Math.max(1, Math.floor(limit / 2));
  }
}
const listNotes = readTool(
  {
    name: 'list_notes',
    description:
      'List one page of notes in a workspace by path or by latest change. Pass nextCursor as cursor with the same sort to continue. A page can be empty when it contains only attachments.',
    inputSchema: objectSchema(
      {
        workspaceId: idSchema,
        limit: limitSchema,
        cursor: cursorSchema,
        sort: { enum: ['path', 'updated'] },
      },
      ['workspaceId'],
    ),
    outputSchema: objectSchema(
      { notes: arraySchema(summarySchema), nextCursor: nextCursorSchema },
      ['notes', 'nextCursor'],
    ),
  },
  ['listFiles'],
  (input, call) => cursorPage(input, call, false),
);

function splitPair(text: string, position: number): boolean {
  const before = text.charCodeAt(position - 1);
  const after = text.charCodeAt(position);
  return (
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
  );
}
const readNote = readTool(
  {
    name: 'read_note',
    description:
      'Read a note or one of its versions. Each page names its version. Text positions count UTF-16 code units. To continue, pass the version as version and nextOffset as offset. This keeps the same text if the current note changes.',
    inputSchema: objectSchema(
      { ...noteInput, version: idSchema, offset: offsetSchema },
      noteKeys,
    ),
    outputSchema: objectSchema(
      {
        ...noteProperties,
        version: idSchema,
        text: { type: 'string', maxLength: notePageUnits },
        offset: offsetSchema,
        nextOffset: nextOffsetSchema,
      },
      [...noteRequired, 'version', 'text', 'offset', 'nextOffset'],
    ),
  },
  ['getFile', 'getRevision'],
  async (input, call) => {
    const workspaceId = text(input, 'workspaceId');
    const fileId = text(input, 'fileId');
    const offset = number(input, 'offset', 0);
    if (offset > 0 && input.version === undefined)
      throw new ToolFailure(
        'A text continuation needs its version. Pass the version of the first page.',
      );
    let revision: Record<string, unknown>;
    let metadata: Record<string, unknown>;
    if (typeof input.version === 'string') {
      revision = await readContract(call, 'getRevision', {
        params: { workspaceId, revisionId: input.version },
      });
      metadata = revision;
    } else {
      const file = await readContract(call, 'getFile', {
        params: { workspaceId, fileId },
        query: { content: 'text' },
      });
      if (file.head === null)
        throw new ToolFailure(
          'This note has no saved text. Save it in the application and try again.',
        );
      revision = record(file.head);
      metadata = file;
    }
    if (
      revision.fileId !== fileId ||
      revision.kind !== 'note' ||
      revision.deleted === true ||
      typeof revision.text !== 'string'
    )
      throw new ToolFailure(
        'This version has no text for this note. Read the note list and try again.',
      );
    const source = revision.text;
    if (offset > source.length || splitPair(source, offset))
      throw new ToolFailure(
        'This text position is not valid. Use the next position from the last page.',
      );
    let length = Math.min(notePageUnits, source.length - offset);
    for (;;) {
      let end = offset + length;
      if (splitPair(source, end)) end -= 1;
      const body = {
        ...noteIdentity(workspaceId, metadata),
        version: text(revision, 'revisionId'),
        text: source.slice(offset, end),
        offset,
        nextOffset: end < source.length ? end : null,
      };
      if (fits(body)) return body;
      if (length <= 1) tooLarge();
      length = Math.max(1, Math.floor(length / 2));
    }
  },
);

const listBacklinks = readTool(
  {
    name: 'list_backlinks',
    description:
      'List notes that link to a note. Pass nextOffset as offset to read the next page.',
    inputSchema: objectSchema({ ...noteInput, ...pageInput }, noteKeys),
    outputSchema: objectSchema(
      {
        backlinks: arraySchema(
          objectSchema({ ...noteProperties, version: idSchema }, [
            ...noteRequired,
            'version',
          ]),
        ),
        nextOffset: nextOffsetSchema,
      },
      ['backlinks', 'nextOffset'],
    ),
  },
  ['listBacklinks'],
  async (input, call) => {
    const workspaceId = text(input, 'workspaceId');
    const answer = await readContract(call, 'listBacklinks', {
      params: { workspaceId, fileId: text(input, 'fileId') },
    });
    const backlinks = rows(answer, 'backlinks').map((entry) => ({
      ...noteIdentity(workspaceId, entry),
      version: text(entry, 'revisionId'),
    }));
    return offsetPage(
      backlinks,
      number(input, 'offset', 0),
      number(input, 'limit', defaultToolPageSize),
      'backlinks',
    );
  },
);
const listNoteHistory = readTool(
  {
    name: 'list_note_history',
    description:
      'List the saved versions of a note. Pass nextCursor as cursor to read the next page. Use read_note with a version to read its text.',
    inputSchema: objectSchema(
      { ...noteInput, limit: limitSchema, cursor: idSchema },
      noteKeys,
    ),
    outputSchema: objectSchema(
      {
        revisions: arraySchema(
          objectSchema(
            {
              ...noteProperties,
              version: idSchema,
              deleted: { type: 'boolean' },
              size: { type: 'integer', minimum: 0 },
              message: {
                anyOf: [{ type: 'string', maxLength: 512 }, { type: 'null' }],
              },
              isCheckpoint: { type: 'boolean' },
              merged: { type: 'boolean' },
              restoredFrom: nullableVersion,
            },
            [
              ...noteRequired,
              'version',
              'deleted',
              'size',
              'message',
              'isCheckpoint',
              'merged',
              'restoredFrom',
            ],
          ),
        ),
        nextCursor: { anyOf: [idSchema, { type: 'null' }] },
      },
      ['revisions', 'nextCursor'],
    ),
  },
  ['listHistory'],
  (input, call) => cursorPage(input, call, true),
);

function searchPosition(
  input: Record<string, unknown>,
  query: string,
): { workspace: number; offset: number } {
  if (input.cursor === undefined) return { workspace: 0, offset: 0 };
  try {
    const value: unknown = JSON.parse(
      Buffer.from(text(input, 'cursor'), 'base64url').toString('utf8'),
    );
    const position = record(value);
    if (
      Object.keys(position).sort().join(',') !== 'offset,query,workspace' ||
      position.query !== query ||
      typeof position.workspace !== 'number' ||
      !Number.isSafeInteger(position.workspace) ||
      position.workspace < 0 ||
      position.workspace > 1000 ||
      typeof position.offset !== 'number' ||
      !Number.isSafeInteger(position.offset) ||
      position.offset < 0 ||
      position.offset > searchMatchLimit
    )
      throw new Error('Invalid position.');
    return { workspace: position.workspace, offset: position.offset };
  } catch {
    throw new ToolFailure(
      'This search position is not valid. Start the search again.',
    );
  }
}
function searchCursor(query: string, workspace: number, offset: number) {
  return Buffer.from(JSON.stringify({ query, workspace, offset })).toString(
    'base64url',
  );
}
async function searchHits(
  call: ContractCall,
  workspaceId: string,
  query: string,
) {
  const answer = await readContract(call, 'searchFiles', {
    params: { workspaceId },
    query: { query, limit: searchMatchLimit },
  });
  return rows(answer, 'hits').map((entry) => ({
    ...noteIdentity(workspaceId, entry),
    version: text(entry, 'revisionId'),
    excerpt: entry.excerpt,
  }));
}
const searchNotes = readTool(
  {
    name: 'search_notes',
    description: `Find the best matches in one workspace or across the account. Each workspace returns at most ${searchMatchLimit} matches. Use a narrower query to find more. For one workspace pass nextOffset as offset. For the account pass nextCursor as cursor with the same query. An account page can be empty and still have a nextCursor.`,
    inputSchema: objectSchema(
      {
        workspaceId: idSchema,
        query: { type: 'string', minLength: 1, maxLength: 256 },
        ...pageInput,
        cursor: cursorSchema,
      },
      ['query'],
    ),
    outputSchema: objectSchema(
      {
        hits: arraySchema(searchHitSchema),
        nextOffset: nextOffsetSchema,
        nextCursor: nextCursorSchema,
      },
      ['hits', 'nextOffset', 'nextCursor'],
    ),
  },
  ['listWorkspaces', 'searchFiles'],
  async (input, call) => {
    const query = text(input, 'query');
    const limit = number(input, 'limit', defaultToolPageSize);
    if (typeof input.workspaceId === 'string') {
      if (input.cursor !== undefined)
        throw new ToolFailure(
          'This search needs a numeric position. Use the next position from the last page.',
        );
      // Include every output field in the size check.
      const page = offsetPage(
        await searchHits(call, input.workspaceId, query),
        number(input, 'offset', 0),
        limit,
        'hits',
        { nextCursor: null },
      );
      return { ...page, nextCursor: null };
    }
    if (input.offset !== undefined)
      throw new ToolFailure(
        'This search needs its cursor. Use the cursor from the last page.',
      );
    const workspaces = rows(
      await readContract(call, 'listWorkspaces'),
      'workspaces',
    );
    const position = searchPosition(input, query);
    if (position.workspace > workspaces.length)
      throw new ToolFailure(
        'This search position is past the workspace list. Start the search again.',
      );
    const hits: Record<string, unknown>[] = [];
    let index = position.workspace;
    let offset = position.offset;
    let visited = 0;
    while (index < workspaces.length && visited < searchWorkspaceLimit) {
      const workspace = workspaces[index];
      if (workspace === undefined) throw new Error('The workspace is missing.');
      const matches = await searchHits(
        call,
        text(workspace, 'workspaceId'),
        query,
      );
      visited += 1;
      // A changed result set can shrink. Continue at the next workspace.
      while (offset < matches.length) {
        const item = matches[offset];
        if (item === undefined) throw new Error('The search match is missing.');
        const candidate = {
          hits: [...hits, item],
          nextOffset: null,
          nextCursor: searchCursor(query, index, offset + 1),
        };
        if (!fits(candidate)) {
          if (hits.length === 0) tooLarge();
          return {
            hits,
            nextOffset: null,
            nextCursor: searchCursor(query, index, offset),
          };
        }
        hits.push(item);
        offset += 1;
        if (hits.length === limit) {
          const nextIndex = offset < matches.length ? index : index + 1;
          return {
            hits,
            nextOffset: null,
            nextCursor:
              nextIndex < workspaces.length
                ? searchCursor(
                    query,
                    nextIndex,
                    offset < matches.length ? offset : 0,
                  )
                : null,
          };
        }
      }
      index += 1;
      offset = 0;
    }
    return {
      hits,
      nextOffset: null,
      nextCursor:
        index < workspaces.length ? searchCursor(query, index, 0) : null,
    };
  },
);

export const readTools: readonly McpTool[] = [
  listWorkspaces,
  listNotes,
  readNote,
  searchNotes,
  listBacklinks,
  listNoteHistory,
];
