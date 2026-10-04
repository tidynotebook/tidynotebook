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
import { emptyInstallationSettings } from '@notesapp/core';
import type { InstallationSettings } from '../installation-settings.ts';
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
import type { PublishedPageAssets } from '../plugins/security-headers.ts';
import type { renderMarkdown } from '@notesapp/markdown';

import {
  type AttachmentStore,
  type WorkspaceStoreHandle,
} from '@notesapp/storage-server';
import { createAttachmentHandlers } from './attachments.ts';
import { createHistoryHandlers } from './history.ts';
import { createSyncHandlers } from './sync.ts';
import { createSearchHandlers } from './search.ts';
import { createImportHandlers } from './import.ts';
import { scratchFolder } from './scratch.ts';
import type { ArchiveJobs } from './archive-jobs.ts';
import { createBacklinkHandlers } from './backlinks.ts';
import { createDailyNoteHandlers } from './daily-notes.ts';
import { createTemplateHandlers } from './templates.ts';
import { secretDigest } from '../auth/publication-secrets.ts';
import { createPublicationHandlers } from './publications.ts';
import { createPublishedHandlers } from './published.ts';
import { createLegalHandlers, type LegalDependencies } from './legal.ts';
import { createAddressSeal, createMailPasswordSeal } from '../auth/seal.ts';
import { createInstallationSettings } from '../installation-settings.ts';
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
    archivePlan: fail,
    workspaceRoom: fail,
    reclaimAttachments: fail,
    stageAttachmentBytes: fail,
    get objects(): never {
      return fail();
    },
  };
}

function missingArchiveJobs(): ArchiveJobs {
  return {
    reserve: () =>
      Promise.reject(
        new Error('notesapp: the server was built without archive jobs.'),
      ),
    serializeImportStart: () =>
      Promise.reject(
        new Error('notesapp: the server was built without archive jobs.'),
      ),
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
  /**
   * The script of a published page and the diagram frame document of the
   * build (records 0158 and 0174). A composition that leaves it out serves
   * every diagram as its source and every code block with no copy action.
   */
  readonly pageScript?: () => PublishedPageAssets | null;
  /** The renderer of a published note, for a test that counts its calls. */
  readonly render?: typeof renderMarkdown;
  /** Where the cause of a reader refusal goes, for the operator only. */
  readonly recordRefusal: (cause: ReaderRefusalCause) => void;
};

/** What the handlers need from the composition. */
export type HandlerDependencies = {
  /** The account, workspace and installation store of the deployment. */
  readonly store?: WorkspaceAdminStore & InstallationStore;
  /**
   * The decider of the mail transport and of the legal documents (record
   * 0148). A test that checks the service operations leaves it out, and the
   * installation then has neither.
   */
  readonly settings?: InstallationSettings;
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
   * The archive jobs of the installation (record 0170). A test that checks
   * the service operations leaves it out, and an import or an export then
   * answers a server error.
   */
  readonly archiveJobs?: ArchiveJobs;
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
  /**
   * The subprotocols of the notice stream that this process opens now
   * (record 0129). A server without a notice gateway offers none.
   */
  readonly noticeProtocols?: () => readonly string[];
  /**
   * The legal documents that this server serves (record 0140). A test that
   * checks the service operations leaves it out, and each page answers not
   * found.
   */
  readonly legal?: LegalDependencies;
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
  const settings =
    dependencies.settings ??
    createInstallationSettings({
      config,
      // A server with no settings decider holds no setting at all.
      reader: {
        installationSettings: () => Promise.resolve(emptyInstallationSettings),
      },
      environmentMail: null,
      environmentTexts: { terms: null, privacy: null },
      passwordSeal: createMailPasswordSeal(config.authSecret),
    });
  const lifecycle = dependencies.lifecycle ?? runningLifecycle;
  const published = dependencies.publications;
  // A report keeps the address of its link sealed with a key of this server
  // (record 0123). The address names the published origin when there is one.
  const seal = createAddressSeal(config.authSecret);
  const readerOrigin = publishedOrigin(config.servedOrigins) ?? config.origin;
  return {
    ...createAccountHandlers(
      store,
      async () => (await settings.legal()).documents,
    ),
    ...createFileHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createHistoryHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createSyncHandlers(
      dependencies.content ?? missingWorkspaceStore(),
      dependencies.noticeProtocols ?? ((): readonly string[] => []),
    ),
    ...createSearchHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createBacklinkHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createDailyNoteHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createTemplateHandlers(dependencies.content ?? missingWorkspaceStore()),
    ...createAttachmentHandlers(
      dependencies.content ?? missingWorkspaceStore(),
      dependencies.attachments ?? missingAttachmentStore(),
      config.limits,
      scratchFolder(config.storageRoot),
    ),
    ...createExportHandlers(
      dependencies.content ?? missingWorkspaceStore(),
      dependencies.attachments ?? missingAttachmentStore(),
      dependencies.archiveJobs ?? missingArchiveJobs(),
    ),
    ...createImportHandlers(
      dependencies.content ?? missingWorkspaceStore(),
      dependencies.attachments ?? missingAttachmentStore(),
      dependencies.archiveJobs ?? missingArchiveJobs(),
      config.limits,
      scratchFolder(config.storageRoot),
    ),
    ...createWorkspaceHandlers(store),
    ...createAdministrationHandlers({
      store,
      settings,
      passwordSeal: createMailPasswordSeal(config.authSecret),
      origin: config.origin,
      invitationLifetimeHours: config.accounts.invitationLifetimeHours,
      defaultLimitBytes: config.accounts.limitBytes,
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
            pageScript: published.pageScript ?? (() => null),
            ...(published.render === undefined
              ? {}
              : { render: published.render }),
            clock: Date.now,
            recordRefusal: published.recordRefusal,
          },
    ),
    ...createLegalHandlers(dependencies.legal),
    ...createServiceHandlers(probes, lifecycle),
  };
}
