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
  LegalDocumentName,
  StoredInstallationSettings,
} from '@notesapp/core';
import {
  createInvitation,
  legalDocumentNames,
  readInstallationSettings,
  readLegalDocument,
  readMailSettings,
  removeMailSettings,
  setLegalDocument,
  setMailSettings,
  dismissReport,
  invitationState,
  listAccounts,
  listInvitations,
  listReports,
  normalizeEmail,
  openRegistrationMissing,
  readRegistrationPolicy,
  settingsReadiness,
  removeAccount,
  removeOwnAccount,
  revokeInvitation,
  setRegistrationPolicy,
  takeDownReportedLink,
  updateAccount,
} from '@notesapp/core';
import { requireActor } from '../auth/actor.ts';
import { issueInvitation, mailInvitation } from '../auth/invitations.ts';
import { mailFailureReason } from '../auth/mail.ts';
import { testMessage } from '../auth/messages.ts';
import type { Seal } from '../auth/seal.ts';
import type { InstallationSettings } from '../installation-settings.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import {
  DomainProblemError,
  ForbiddenError,
  LegalDocumentUnfinishedError,
  MailFailedError,
  NotFoundError,
  OpenRegistrationUnavailableError,
  PayloadTooLargeError,
  RequestContractError,
  unwrapDomain,
} from '../plugins/problem.ts';
import { readProperty } from '../values.ts';
import { readParameter, readString } from './accounts.ts';
import { controlsBody } from './account-controls.ts';

/** Media type of every answer in this module. */
const jsonMediaType = 'application/json';

/** What the administration handlers need. */
export type AdministrationDependencies = {
  readonly store: InstallationStore;
  /**
   * The decider of the mail transport and of the legal documents (record
   * 0148). An invitation reads its mailer at the moment it is made.
   */
  readonly settings: InstallationSettings;
  /** The seal of the mail password. */
  readonly passwordSeal: Seal;
  /** The canonical origin, which an invitation link names. */
  readonly origin: string;
  readonly invitationLifetimeHours: number;
  /** The byte limit that a new account starts with. */
  readonly defaultLimitBytes: bigint;
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
    controls: controlsBody(record.controls),
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
  const { store, settings } = dependencies;
  const environment = settings.environment;

  /**
   * The settings of the installation, from the policy and the row that the
   * store holds. The row is read again when the caller has none.
   */
  const installationBody = async (
    policy: string,
    given?: StoredInstallationSettings,
  ): Promise<Record<string, unknown>> => {
    const stored = given ?? (await settings.stored());
    const legal = await settings.legal(stored);
    return {
      registrationPolicy: policy,
      mailConfigured: await settings.mailer.available(),
      invitationLifetimeHours: dependencies.invitationLifetimeHours,
      defaultLimitBytes: byteNumber(dependencies.defaultLimitBytes),
      mail: await settings.mailView(stored),
      legalDocuments: {
        source: legal.source,
        terms: legal.summaries.terms,
        privacy: legal.summaries.privacy,
      },
    };
  };

  /** The answer of a change of a setting: the settings as they are now. */
  const changed = async (
    actor: Parameters<typeof readRegistrationPolicy>[1],
    stored: StoredInstallationSettings,
  ): Promise<HandlerResult> => ({
    status: 200,
    mediaType: jsonMediaType,
    body: await installationBody(
      unwrapDomain(await readRegistrationPolicy(store, actor)),
      stored,
    ),
  });

  /** The validated name of a legal document in the path. */
  const documentName = (request: Parameters<typeof readParameter>[0]) => {
    const name = readParameter(request, 'document');
    const known = legalDocumentNames.find((entry) => entry === name);
    if (known === undefined)
      throw new NotFoundError('The request names no legal document.');
    return known satisfies LegalDocumentName;
  };

  /** A member of a validated body that may be left out. */
  const optionalText = (body: unknown, key: string): string | null => {
    const value = readProperty(body, key);
    return typeof value === 'string' ? value : null;
  };

  return {
    getInstallation: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const policy = unwrapDomain(
        await readRegistrationPolicy(store, resolved.actor),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: await installationBody(policy),
      };
    },

    updateInstallation: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const policy = await setRegistrationPolicy(
        store,
        resolved.actor,
        readString(request.body, 'registrationPolicy'),
        environment,
      );
      if (!policy.ok && policy.error.code === 'open_registration_unavailable')
        throw new OpenRegistrationUnavailableError(
          openRegistrationMissing(
            settingsReadiness(environment, await settings.stored()),
          ),
        );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: await installationBody(unwrapDomain(policy)),
      };
    },

    updateMailSettings: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const body = request.body;
      const port = readProperty(body, 'port');
      const read = readMailSettings({
        host: readString(body, 'host'),
        port: typeof port === 'number' ? port : 0,
        security: readString(body, 'security'),
        username: optionalText(body, 'username'),
        password: optionalText(body, 'password'),
        sender: readString(body, 'sender'),
      });
      if (!read.ok)
        throw new RequestContractError('body', [
          {
            path: `/${read.problem}`,
            message:
              read.problem === 'host'
                ? 'Name the host of the mail server, with no scheme and no port.'
                : read.problem === 'sender'
                  ? 'Name an address, or a name and an address in angle brackets.'
                  : read.problem === 'username' || read.problem === 'password'
                    ? `The ${read.problem === 'username' ? 'user name' : 'password'} is longer than the server keeps.`
                    : `The ${read.problem} is not valid.`,
          },
        ]);
      const { password, ...mail } = read.value;
      // A password that the body leaves out keeps the stored one. The row
      // never holds the password itself, only its seal.
      const sealed =
        password === null
          ? { kind: 'keep' as const }
          : {
              kind: 'set' as const,
              sealed: dependencies.passwordSeal.seal(password),
            };
      const stored = unwrapDomain(
        await setMailSettings(store, resolved.actor, mail, sealed, environment),
      );
      return changed(resolved.actor, stored);
    },

    removeMailSettings: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const stored = unwrapDomain(
        await removeMailSettings(store, resolved.actor, environment),
      );
      return changed(resolved.actor, stored);
    },

    sendTestMessage: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      // Only an administrator sends one, as only an administrator changes
      // the transport.
      unwrapDomain(await readInstallationSettings(store, resolved.actor));
      const to = resolved.email;
      if (to === null)
        throw new ForbiddenError('The account has no address to write to.');
      try {
        await settings.mailer.send(
          testMessage({ to, origin: dependencies.origin }),
        );
      } catch (error) {
        throw new MailFailedError(mailFailureReason(error));
      }
      return { status: 200, mediaType: jsonMediaType, body: { to } };
    },

    getLegalDocumentSettings: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const name = documentName(request);
      const stored = unwrapDomain(
        await readInstallationSettings(store, resolved.actor),
      );
      const legal = await settings.legal(stored);
      const document = stored[name];
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          source: legal.source,
          document:
            document === null
              ? null
              : {
                  kind: document.kind,
                  text: document.kind === 'text' ? document.text : null,
                  url: document.kind === 'address' ? document.url : null,
                  version: document.version,
                },
          template: settings.template(name),
        },
      };
    },

    updateLegalDocument: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const name = documentName(request);
      const body = request.body;
      const read = readLegalDocument({
        kind: readString(body, 'kind'),
        text: optionalText(body, 'text'),
        url: optionalText(body, 'url'),
        version: readString(body, 'version'),
      });
      if (!read.ok) {
        if (read.problem.kind === 'unfinished')
          throw new LegalDocumentUnfinishedError(read.problem.blanks);
        if (read.problem.kind === 'too_large')
          throw new PayloadTooLargeError(
            'The text of the document is larger than 256 KiB.',
          );
        throw new RequestContractError('body', [
          {
            path: readString(body, 'kind') === 'address' ? '/url' : '/text',
            message:
              'Write the text of the document, or name the full address of its page, and its version.',
          },
        ]);
      }
      const stored = unwrapDomain(
        await setLegalDocument(
          store,
          resolved.actor,
          name,
          read.value,
          environment,
        ),
      );
      return changed(resolved.actor, stored);
    },

    removeLegalDocument: async (request): Promise<HandlerResult> => {
      const resolved = requireActor(request);
      const stored = unwrapDomain(
        await setLegalDocument(
          store,
          resolved.actor,
          documentName(request),
          null,
          environment,
        ),
      );
      return changed(resolved.actor, stored);
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
      // The transport is taken once for the whole invitation, so the record,
      // the message and the answer agree on whether the link went by mail,
      // even when another administrator changes the mail in between.
      const transport = await settings.mailer.current();
      const mailed = transport !== null;
      const issued = issueInvitation({
        origin: dependencies.origin,
        email,
        lifetimeHours: dependencies.invitationLifetimeHours,
        mailed,
        now,
      });
      const stored = unwrapDomain(
        await createInvitation(store, resolved.actor, issued.record),
      );
      if (transport !== null)
        await mailInvitation(transport, {
          origin: dependencies.origin,
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
          link: mailed ? null : issued.link,
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
