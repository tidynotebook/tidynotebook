/**
 * Handlers of workspace operations.
 *
 * A workspace that the actor cannot see answers 404, because storage cannot
 * tell a missing workspace from a hidden one and must not try: the answer
 * would disclose that the workspace exists.
 */
import { randomUUID } from 'node:crypto';
import type { WorkspaceAdminStore, WorkspaceSummary } from '@notesapp/core';
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  updateWorkspace,
} from '@notesapp/core';
import { WorkspaceUnavailableError } from '@notesapp/storage-server';
import { requireActor } from '../auth/actor.ts';
import { readParameter, readString, unwrap } from './accounts.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { NotFoundError } from '../plugins/problem.ts';

const jsonMediaType = 'application/json';

/**
 * Runs a workspace use case and maps a hidden workspace to 404.
 *
 * The store throws when the workspace does not exist or the actor is not a
 * member, and both answers must look the same from outside.
 */
async function inWorkspace<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof WorkspaceUnavailableError) throw new NotFoundError();
    throw error;
  }
}

function workspaceBody(summary: WorkspaceSummary): Record<string, unknown> {
  return {
    workspaceId: summary.workspaceId,
    name: summary.name,
    role: summary.role,
    personal: summary.personal,
    ...(summary.memberCount === undefined
      ? {}
      : { memberCount: summary.memberCount }),
  };
}

/** Builds the workspace handlers. */
export function createWorkspaceHandlers(
  store: WorkspaceAdminStore,
): HandlerMap {
  return {
    listWorkspaces: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const workspaces = unwrap(await listWorkspaces(store, resolved.actor));
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: { workspaces: workspaces.map(workspaceBody) },
      };
    },

    createWorkspace: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const created = unwrap(
        await createWorkspace(store, resolved.actor, {
          workspaceId: randomUUID(),
          name: readString(request.body, 'name'),
        }),
      );
      return {
        status: 201,
        mediaType: jsonMediaType,
        body: workspaceBody(created),
      };
    },

    updateWorkspace: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const updated = unwrap(
        await inWorkspace(() =>
          updateWorkspace(
            store,
            resolved.actor,
            readParameter(request, 'workspaceId'),
            readString(request.body, 'name'),
          ),
        ),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: workspaceBody(updated),
      };
    },

    deleteWorkspace: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      unwrap(
        await inWorkspace(() =>
          deleteWorkspace(
            store,
            resolved.actor,
            readParameter(request, 'workspaceId'),
          ),
        ),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: { removed: true },
      };
    },
  };
}
