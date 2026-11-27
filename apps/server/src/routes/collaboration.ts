import { randomUUID } from 'node:crypto';
import {
  fail,
  inviteRole,
  normalizeEmail,
  ok,
  workspaceCollaboration,
  workspaceInvitationWrite,
  workspaceInviteBatchSize,
  workspaceMemberPageSize,
  type CollaborationStore,
  type WorkspaceInvite,
} from '@notesapp/core';
import { requireSessionActor, requireWriteOrigin } from '../auth/actor.ts';
import type { Mailer } from '../auth/mail.ts';
import { workspaceInvitationMessage } from '../auth/messages.ts';
import {
  newPublishedSecret,
  secretDigest,
} from '../auth/publication-secrets.ts';
import type { Seal } from '../auth/seal.ts';
import type { ServerConfig } from '../config.ts';
import {
  attemptAddress,
  type AttemptCounter,
} from '../plugins/attempt-store.ts';
import {
  AttemptsExceededError,
  DomainProblemError,
  NotFoundError,
  unwrapDomain,
  workspaceInvitationsOffTitle,
} from '../plugins/problem.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { readProperty } from '../values.ts';
import { readOptionalText, readText } from './files.ts';

const inviteWindowMs = 60 * 60 * 1000;
const inviteAccountBudget = 100;
const inviteWorkspaceBudget = 200;

export type CollaborationDependencies = {
  readonly store: CollaborationStore;
  readonly attempts: AttemptCounter;
  readonly seal: Seal;
  readonly mail: Mailer;
};

function answer(body: unknown, privateData = false): HandlerResult {
  return {
    status: 200,
    mediaType: 'application/json',
    body,
    ...(privateData
      ? { headers: [['cache-control', 'private, no-store']] }
      : {}),
  };
}

function inviteResponse({ collaborationEnabled, ...invite }: WorkspaceInvite) {
  return {
    ...invite,
    acceptanceMessage: collaborationEnabled
      ? null
      : workspaceInvitationsOffTitle,
  };
}

function notFound<T>(value: T | null): T {
  if (value === null) throw new NotFoundError();
  return value;
}

export function createCollaborationHandlers(
  config: ServerConfig,
  deps: CollaborationDependencies,
): HandlerMap {
  const { store } = deps;
  const link = (token: string) => `${config.origin}/join#${token}`;

  async function budget(
    key: string,
    maximum: number,
    amount = 1,
    windowMs = inviteWindowMs,
  ) {
    const now = Date.now();
    for (let i = 0; i < amount; i += 1) {
      if ((await deps.attempts.count(key, windowMs, now)).current > maximum)
        throw new AttemptsExceededError();
    }
  }

  return {
    listWorkspaceMembers: async (request) => {
      const { actor } = requireSessionActor(request);
      const workspaceId = readText(request.params, 'workspaceId');
      const after = readOptionalText(request.query, 'afterAccountId');
      return answer(
        unwrapDomain(
          await workspaceCollaboration(
            store,
            actor,
            workspaceId,
            'read',
            async (tx) =>
              ok({
                ...(await tx.members(after)),
                collaborationEnabled: await tx.invitationEnabled(),
              }),
          ),
        ),
        true,
      );
    },
    updateWorkspaceMemberRole: async (request) => {
      const { actor } = requireSessionActor(request);
      const workspaceId = readText(request.params, 'workspaceId');
      const accountId = readText(request.params, 'accountId');
      const role = inviteRole(readProperty(request.body, 'role'));
      if (role === null)
        throw new DomainProblemError({ code: 'forbidden', fileIds: [] });
      const result = await workspaceCollaboration(
        store,
        actor,
        workspaceId,
        'manage_members',
        async (tx) => {
          const outcome = await tx.changeMember(accountId, role, false);
          return outcome === 'ok'
            ? ok(await tx.member(accountId))
            : fail(outcome);
        },
      );
      return answer(notFound(unwrapDomain(result)), true);
    },
    removeWorkspaceMember: async (request) => {
      const { actor } = requireSessionActor(request);
      const workspaceId = readText(request.params, 'workspaceId');
      const accountId = readText(request.params, 'accountId');
      unwrapDomain(
        await workspaceCollaboration(
          store,
          actor,
          workspaceId,
          'manage_members',
          async (tx) => {
            const outcome = await tx.changeMember(accountId, null, false);
            return outcome === 'ok' ? ok(undefined) : fail(outcome);
          },
        ),
      );
      return answer({ removed: true });
    },
    leaveWorkspace: async (request) => {
      const { actor } = requireSessionActor(request);
      const workspaceId = readText(request.params, 'workspaceId');
      unwrapDomain(
        await workspaceCollaboration(
          store,
          actor,
          workspaceId,
          'read',
          async (tx) => {
            const outcome = await tx.changeMember(actor.accountId, null, true);
            return outcome === 'ok' ? ok(undefined) : fail(outcome);
          },
        ),
      );
      return answer({ removed: true });
    },
    listWorkspaceInvites: async (request) => {
      const { actor } = requireSessionActor(request);
      const workspaceId = readText(request.params, 'workspaceId');
      const invites = unwrapDomain(
        await workspaceCollaboration(
          store,
          actor,
          workspaceId,
          'manage_members',
          async (tx) => ok(await tx.invites(null)),
        ),
      );
      return answer({ invitations: invites.map(inviteResponse) }, true);
    },
    createWorkspaceInvites: async (request) => {
      const { actor, name } = requireSessionActor(request);
      const workspaceId = readText(request.params, 'workspaceId');
      const role = inviteRole(readProperty(request.body, 'role'));
      const input = readProperty(request.body, 'emails');
      if (
        role === null ||
        !Array.isArray(input) ||
        input.length < 1 ||
        input.length > workspaceInviteBatchSize
      )
        throw new DomainProblemError({ code: 'forbidden', fileIds: [] });
      const emails = input.map((entry: unknown) =>
        typeof entry === 'string' ? normalizeEmail(entry) : null,
      );
      if (emails.some((email) => email === null))
        throw new DomainProblemError({ code: 'forbidden', fileIds: [] });

      const staged = unwrapDomain(
        await workspaceCollaboration(
          store,
          actor,
          workspaceId,
          'invite',
          async (tx) => {
            await budget(
              `workspace-inviter:${actor.accountId}`,
              inviteAccountBudget,
              emails.length,
            );
            await budget(
              `workspace-invites:${workspaceId}`,
              inviteWorkspaceBudget,
              emails.length,
            );
            const outcomes = [];
            for (const email of emails) {
              if (email === null)
                throw new Error('An invitation email is missing.');
              const token = newPublishedSecret();
              const digest = secretDigest.digest(token);
              const outcome = await tx.createInvite({
                invitationId: randomUUID(),
                email,
                role,
                digest,
                seal: deps.seal.seal(token),
              });
              const details =
                outcome.outcome === 'created'
                  ? await tx.inspectInvite(digest)
                  : null;
              outcomes.push({
                entry: { email, ...outcome },
                mail:
                  details === null
                    ? null
                    : {
                        link: link(token),
                        workspaceName: details.workspaceName,
                      },
              });
            }
            return ok(outcomes);
          },
        ),
      );

      const transport = await deps.mail.current().catch(() => null);
      const results = await Promise.all(
        staged.map(async ({ entry, mail }) => {
          if (mail === null) return entry;
          if (transport !== null) {
            try {
              await transport.send(
                workspaceInvitationMessage({
                  to: entry.email,
                  origin: config.origin,
                  link: mail.link,
                  lifetimeHours: 168,
                  supportUrl: transport.supportUrl ?? null,
                  workspaceName: mail.workspaceName,
                  inviterName: name,
                }),
              );
              return { ...entry, delivery: 'sent' };
            } catch {
              request.log.warn('Workspace invitation mail was not sent.');
            }
          }
          return { ...entry, delivery: 'copy_link' };
        }),
      );
      return answer({ results }, true);
    },
    revokeWorkspaceInvite: async (request) => {
      const { actor } = requireSessionActor(request);
      const workspaceId = readText(request.params, 'workspaceId');
      const invitationId = readText(request.params, 'invitationId');
      notFound(
        unwrapDomain(
          await workspaceCollaboration(
            store,
            actor,
            workspaceId,
            'manage_members',
            async (tx) => ok(await tx.adminInvite(invitationId, true)),
          ),
        ),
      );
      return answer({ removed: true });
    },
    readWorkspaceInviteLink: async (request) => {
      const { actor } = requireSessionActor(request);
      const workspaceId = readText(request.params, 'workspaceId');
      const invitationId = readText(request.params, 'invitationId');
      const sealed = notFound(
        unwrapDomain(
          await workspaceCollaboration(
            store,
            actor,
            workspaceId,
            'manage_members',
            async (tx) => ok(await tx.adminInvite(invitationId, false)),
          ),
        ),
      );
      return answer({ url: link(notFound(deps.seal.open(sealed))) }, true);
    },
    readWorkspaceInvite: async (request) => {
      requireWriteOrigin(config.servedOrigins, request);
      await budget(
        `workspace-invite-read:${attemptAddress(request.ip)}`,
        config.rateLimit.max,
        1,
        config.rateLimit.windowSeconds * 1000,
      );
      const digest = secretDigest.digest(readText(request.body, 'invitation'));
      const invite = await store.collaboration(null, null, (tx) =>
        tx.inspectInvite(digest),
      );
      if (invite === null)
        throw new DomainProblemError({
          code: 'invitation_invalid',
          fileIds: [],
        });
      return answer(inviteResponse(invite), true);
    },
    listMyWorkspaceInvites: async (request) => {
      const { actor } = requireSessionActor(request);
      const after = readOptionalText(request.query, 'afterInvitationId');
      const rows = await store.collaboration(actor, null, (tx) =>
        tx.invites(after),
      );
      const invitations = rows.slice(0, workspaceMemberPageSize);
      return answer(
        {
          invitations: invitations.map(inviteResponse),
          nextAfterInvitationId:
            rows.length > invitations.length
              ? (invitations.at(-1)?.invitationId ?? null)
              : null,
        },
        true,
      );
    },
    acceptWorkspaceInvite: async (request) => {
      const { actor } = requireSessionActor(request);
      const id = readText(request.params, 'invitationId');
      return answer(
        notFound(
          unwrapDomain(
            await workspaceInvitationWrite(() =>
              store.collaboration(actor, null, (tx) =>
                tx.answerInvite(id, true),
              ),
            ),
          ),
        ),
      );
    },
    declineWorkspaceInvite: async (request) => {
      const { actor } = requireSessionActor(request);
      const id = readText(request.params, 'invitationId');
      notFound(
        await store.collaboration(actor, null, (tx) =>
          tx.answerInvite(id, false),
        ),
      );
      return answer({ removed: true });
    },
  };
}
