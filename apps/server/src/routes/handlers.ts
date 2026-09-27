/**
 * Handlers of the operations that the contract declares today.
 *
 * A handler returns a status, a media type, and a body. The boundary validates
 * that body against the declared response schema before it is sent, so a
 * handler never has to repeat the contract shape. The body of each handler
 * lives in the file of its area, and this file only assembles the map.
 */
import type {
  InstallationStore,
  PasswordHasher,
  ReaderRefusalCause,
  WorkspaceAdminStore,
  WorkspaceStore,
} from '@notesapp/core';
import type { MailTransport } from '../auth/mail.ts';
import { createAdministrationHandlers } from './administration.ts';
import type { ServerConfig } from '../config.ts';
import type { ServiceLifecycle } from '../lifecycle.ts';
import { runningLifecycle } from '../lifecycle.ts';
import { createAccountHandlers } from './accounts.ts';
import { createExportHandlers } from './export.ts';
import { createFileHandlers, missingWorkspaceStore } from './files.ts';
import { createWorkspaceHandlers } from './workspaces.ts';
import type { ReadinessProbe } from './health.ts';
import { configurationProbe, createServiceHandlers } from './health.ts';
import type { HandlerMap } from '../plugins/register.ts';

import {
  type AttachmentStore,
  type WorkspaceStoreHandle,
} from '@notesapp/storage-server';
import { createAttachmentHandlers } from './attachments.ts';
import { createHistoryHandlers } from './history.ts';
import { createSyncHandlers } from './sync.ts';
import { createSearchHandlers } from './search.ts';
import { createImportHandlers } from './import.ts';
import { createBacklinkHandlers } from './backlinks.ts';
import { createDailyNoteHandlers } from './daily-notes.ts';
import { secretDigest } from '../auth/publication-secrets.ts';
import { createPublicationHandlers } from './publications.ts';
import { createPublishedHandlers } from './published.ts';
import { createAddressSeal } from '../auth/report-seal.ts';
import { publishedOrigin } from '../served-origins.ts';

/**
 * A store that is not there yet.
 *
 * Every deployment supplies the real store. A test that only checks the
 * service operations may leave it out, and then an account operation answers
 * with a generic server error instead of pretending to work.
 */
function missingStore(): WorkspaceAdminStore & InstallationStore {
  const fail = (): never => {
    throw new Error('notesapp: the server was built without an account store.');
  };
  return { account: fail, workspace: fail, installation: fail };
}

function missingAttachmentStore(): AttachmentStore {
  const fail = (): never => {
    throw new Error(
      'notesapp: the server was built without an attachment store.',
    );
  };
  return {
    saveTemporaryAttachment: fail,
    getAttachmentObject: fail,
    finalizeAttachmentObject: fail,
    readAttachmentRevision: fail,
    readPublishedAttachmentRevision: fail,
    reclaimAttachments: fail,
    temporaryPath: fail,
    immutablePath: fail,
  };
}

/**
 * The store of a published link, both of its sides and its one write.
 *
 * The reader side is the read-only port of decision 0031, the owner side needs
 * a verified actor, and the unlock is the one write of the boundary. One value
 * carries the three, so a composition cannot supply one without the others.
 */
export type PublicationStores = Pick<
  WorkspaceStoreHandle,
  'publications' | 'publishedLinks' | 'unlockPublication' | 'reportPublication'
>;

/** What the published link operations need from the composition. */
export type PublicationDependencies = {
  readonly store: PublicationStores;
  /** The bytes of an attachment revision that a published note names. */
  readonly attachments: AttachmentStore;
  /** The password rule of the account path, which a link reuses. */
  readonly hasher: PasswordHasher;
  /** The stylesheets of the built application document. */
  readonly stylesheets: () => readonly string[];
  /** Where the cause of a reader refusal goes, for the operator only. */
  readonly recordRefusal: (cause: ReaderRefusalCause) => void;
};

/** What the handlers need from the composition. */
export type HandlerDependencies = {
  /** The account, workspace and installation store of the deployment. */
  readonly store?: WorkspaceAdminStore & InstallationStore;
  /** The mail transport of the deployment, or `null` for none. */
  readonly mail?: MailTransport | null;
  /**
   * Whether a password is the current one of an identity user. A test that
   * checks the service operations leaves it out, and every check fails.
   */
  readonly verifyPassword?: (
    authUserId: string,
    password: string,
  ) => Promise<boolean>;
  /** The workspace content store of the deployment. */
  readonly content?: WorkspaceStore;
  /** The attachment store of the deployment. */
  readonly attachments?: AttachmentStore;
  /**
   * The lifecycle state of the process, which the readiness answer reads.
   *
   * `main.ts` owns it and the stop moves it. A server that owns no signal
   * handler leaves it out and always reports that it runs.
   */
  readonly lifecycle?: ServiceLifecycle;
  /**
   * The published link surface of the deployment.
   *
   * A test that checks the service operations leaves it out. The page of a
   * link then answers the one document of a link that opens nothing, because
   * no token of such a build opens anything.
   */
  readonly publications?: PublicationDependencies;
};

/**
 * Builds the handler map for the operations in the contract.
 *
 * An operation that a protocol library serves has no entry here. The contract
 * marks such an operation, and `registerOperations` mounts it through that
 * adapter's exact path list instead.
 */
export function createHandlers(
  config: ServerConfig,
  probes: readonly ReadinessProbe[] = [configurationProbe(config)],
  dependencies: HandlerDependencies = {},
): HandlerMap {
  const store = dependencies.store ?? missingStore();
  const lifecycle = dependencies.lifecycle ?? runningLifecycle;
  const published = dependencies.publications;
  // A report keeps the address of its link sealed with a key of this server
  // (record 0123). The address names the published origin when there is one.
  const seal = createAddressSeal(config.authSecret);
  const readerOrigin = publishedOrigin(config.servedOrigins) ?? config.origin;
  return {
    ...createAccountHandlers(store, config.legalDocuments),
    ...createFileHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createHistoryHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createSyncHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createSearchHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createBacklinkHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createDailyNoteHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createAttachmentHandlers(
      dependencies.content ?? missingWorkspaceStore(),
      dependencies.attachments ?? missingAttachmentStore(),
      config.limits,
    ),
    ...createExportHandlers(
      dependencies.content ?? missingWorkspaceStore(),
      dependencies.attachments ?? missingAttachmentStore(),
    ),
    ...createImportHandlers(
      dependencies.content ?? missingWorkspaceStore(),
      dependencies.attachments ?? missingAttachmentStore(),
      config.limits,
    ),
    ...createWorkspaceHandlers(store),
    ...createAdministrationHandlers({
      store,
      mail: dependencies.mail ?? null,
      origin: config.origin,
      invitationLifetimeHours: config.accounts.invitationLifetimeHours,
      defaultLimitBytes: config.accounts.limitBytes,
      readiness: {
        mail: (dependencies.mail ?? null) !== null,
        publishedOrigin: publishedOrigin(config.servedOrigins) !== null,
        legalDocuments: config.legalDocuments !== null,
      },
      openAddress: (sealed) => seal.open(sealed),
      verifyPassword:
        dependencies.verifyPassword ?? (() => Promise.resolve(false)),
    }),
    ...createPublicationHandlers(
      published === undefined
        ? undefined
        : {
            links: published.store.publishedLinks,
            hasher: published.hasher,
            secrets: secretDigest,
            clock: Date.now,
          },
    ),
    ...createPublishedHandlers(
      published === undefined
        ? undefined
        : {
            store: published.store.publications,
            unlock: (attempt) => published.store.unlockPublication(attempt),
            report: (report) => published.store.reportPublication(report),
            sealLink: (token) =>
              seal.seal(
                `${readerOrigin}/published/${encodeURIComponent(token)}`,
              ),
            attachments: published.attachments,
            secrets: secretDigest,
            hasher: published.hasher,
            stylesheets: published.stylesheets,
            clock: Date.now,
            recordRefusal: published.recordRefusal,
          },
    ),
    ...createServiceHandlers(probes, lifecycle),
  };
}
