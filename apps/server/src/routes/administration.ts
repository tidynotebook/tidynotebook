/**
 * Handlers of the administration operations and of the removal of an own
 * account (records 0108 to 0112).
 *
 * Every handler maps validated input to one use case of `@notesapp/core` and
 * maps the result back. The use case reads the installation role in the
 * transaction of the change, and a database function checks it again, so no
 * handler decides who may administer.
 */
import type {
  AccountRecord,
  InstallationStore,
  InvitationRecord,
  OpenRegistrationReadiness,
} from '@notesapp/core';
import {
  createInvitation,
  dismissReport,
  invitationState,
  listAccounts,
  listInvitations,
  listReports,
  normalizeEmail,
  openRegistrationMissing,
  readRegistrationPolicy,
  removeAccount,
  removeOwnAccount,
  revokeInvitation,
  setRegistrationPolicy,
  takeDownReportedLink,
  updateAccount,
} from '@notesapp/core';
import { requireActor } from '../auth/actor.ts';
import { issueInvitation, mailInvitation } from '../auth/invitations.ts';
import type { MailTransport } from '../auth/mail.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import {
  DomainProblemError,
  ForbiddenError,
  OpenRegistrationUnavailableError,
  unwrapDomain,
} from '../plugins/problem.ts';
import { readProperty } from '../values.ts';
import { readParameter, readString } from './accounts.ts';

/** Media type of every answer in this module. */
const jsonMediaType = 'application/json';

/** What the administration handlers need. */
export type AdministrationDependencies = {
  readonly store: InstallationStore;
  /** The mail transport, or `null` when the installation has none. */
  readonly mail: MailTransport | null;
  /** The canonical origin, which an invitation link names. */
  readonly origin: string;
  readonly invitationLifetimeHours: number;
  /** The byte limit that a new account starts with. */
  readonly defaultLimitBytes: bigint;
  /**
   * What the installation has of the parts that open registration needs.
   * The legal documents arrive with record 0120, and until then the
   * composition states that they are missing.
   */
  readonly readiness: OpenRegistrationReadiness;
  /**
   * The address of a reported link from its sealed value, or `null` when
   * this server cannot open it (record 0123).
   */
  readonly openAddress: (sealed: string) => string | null;
  /** Whether a password is the current one of an identity user. */
  readonly verifyPassword: (
    authUserId: string,
    password: string,
  ) => Promise<boolean>;
};

/** The largest byte count that a JSON number carries without loss. */
function byteNumber(value: bigint): number {
  return Number(value);
}

/** The public shape of one account for an administrator. */
function accountBody(
  record: AccountRecord,
  selfId: string,
): Record<string, unknown> {
  return {
    accountId: record.accountId,
    email: record.email,
    name: record.name,
    installationRole: record.role,
    state: record.state,
    createdAt: record.createdAt,
    lastActiveAt: record.lastActiveAt,
    storage: {
      usedBytes: byteNumber(record.usedBytes),
      limitBytes: byteNumber(record.limitBytes),
    },
    self: record.accountId === selfId,
  };
}

/** The public shape of one waiting invitation. */
function invitationBody(
  record: InvitationRecord,
  now: Date,
): Record<string, unknown> {
  return {
    invitationId: record.invitationId,
    email: record.email,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    state: invitationState(record, now),
    mailed: record.mailed,
  };
}

/** Builds the administration handlers. */
export function createAdministrationHandlers(
  dependencies: AdministrationDependencies,
): HandlerMap {
  const { store } = dependencies;

  /** The settings of the installation, from the policy the store holds. */
  const installationBody = (policy: string): Record<string, unknown> => ({
    registrationPolicy: policy,
    mailConfigured: dependencies.mail !== null,
    invitationLifetimeHours: dependencies.invitationLifetimeHours,
    defaultLimitBytes: byteNumber(dependencies.defaultLimitBytes),
  });

  return {
    getInstallation: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const policy = unwrapDomain(
        await readRegistrationPolicy(store, resolved.actor),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: installationBody(policy),
      };
    },

    updateInstallation: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const changed = await setRegistrationPolicy(
        store,
        resolved.actor,
        readString(request.body, 'registrationPolicy'),
        dependencies.readiness,
      );
      if (!changed.ok && changed.error.code === 'open_registration_unavailable')
        throw new OpenRegistrationUnavailableError(
          openRegistrationMissing(dependencies.readiness),
        );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: installationBody(unwrapDomain(changed)),
      };
    },

    listInvitations: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const now = new Date();
      const listed = unwrapDomain(
        await listInvitations(store, resolved.actor, now),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          invitations: listed.map((entry) => invitationBody(entry, now)),
        },
      };
    },

    createInvitation: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const email = normalizeEmail(readString(request.body, 'email'));
      if (email === null)
        throw new ForbiddenError('The request body has no usable email.');
      const now = new Date();
      const issued = issueInvitation({
        origin: dependencies.origin,
        email,
        lifetimeHours: dependencies.invitationLifetimeHours,
        mailed: dependencies.mail !== null,
        now,
      });
      const stored = unwrapDomain(
        await createInvitation(store, resolved.actor, issued.record),
      );
      if (dependencies.mail !== null)
        await mailInvitation(dependencies.mail, {
          email,
          link: issued.link,
          lifetimeHours: dependencies.invitationLifetimeHours,
        });
      return {
        status: 201,
        mediaType: jsonMediaType,
        body: {
          invitation: invitationBody(stored, now),
          // The link is the secret of the invitation. It leaves this server
          // once: by mail, or in this answer when there is no mail.
          link: dependencies.mail === null ? issued.link : null,
        },
      };
    },

    listReports: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const reports = unwrapDomain(await listReports(store, resolved.actor));
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          reports: reports.map((report) => ({
            reportId: report.reportId,
            publicationId: report.publicationId,
            reason: report.reason,
            note: report.note,
            address:
              report.sealedAddress === null
                ? null
                : dependencies.openAddress(report.sealedAddress),
            linkState: report.linkState,
            createdAt: report.createdAt,
          })),
        },
      };
    },

    dismissReport: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      unwrapDomain(
        await dismissReport(
          store,
          resolved.actor,
          readParameter(request, 'reportId'),
        ),
      );
      return { status: 200, mediaType: jsonMediaType, body: { removed: true } };
    },

    takeDownReportedLink: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      unwrapDomain(
        await takeDownReportedLink(
          store,
          resolved.actor,
          readParameter(request, 'reportId'),
        ),
      );
      return { status: 200, mediaType: jsonMediaType, body: { removed: true } };
    },

    revokeInvitation: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      unwrapDomain(
        await revokeInvitation(
          store,
          resolved.actor,
          readParameter(request, 'invitationId'),
        ),
      );
      return { status: 200, mediaType: jsonMediaType, body: { removed: true } };
    },

    listAccounts: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const listed = unwrapDomain(await listAccounts(store, resolved.actor));
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          accounts: listed.map((entry) =>
            accountBody(entry, resolved.actor.accountId),
          ),
        },
      };
    },

    updateAccount: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const role = readProperty(request.body, 'installationRole');
      const state = readProperty(request.body, 'state');
      const limit = readProperty(request.body, 'limitBytes');
      const changed = unwrapDomain(
        await updateAccount(
          store,
          resolved.actor,
          readParameter(request, 'accountId'),
          {
            role: typeof role === 'string' ? role : undefined,
            state: typeof state === 'string' ? state : undefined,
            limitBytes:
              typeof limit === 'number' && Number.isSafeInteger(limit)
                ? BigInt(limit)
                : undefined,
          },
        ),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: accountBody(changed, resolved.actor.accountId),
      };
    },

    removeAccount: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      unwrapDomain(
        await removeAccount(
          store,
          resolved.actor,
          readParameter(request, 'accountId'),
        ),
      );
      return { status: 200, mediaType: jsonMediaType, body: { removed: true } };
    },

    removeOwnAccount: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      // The person gives their password again, so a session that somebody
      // else holds cannot remove the account (record 0111).
      const password = readString(request.body, 'password');
      if (!(await dependencies.verifyPassword(resolved.authUserId, password)))
        throw new DomainProblemError({ code: 'forbidden', fileIds: [] });
      unwrapDomain(await removeOwnAccount(store, resolved.actor));
      return { status: 200, mediaType: jsonMediaType, body: { removed: true } };
    },
  };
}
