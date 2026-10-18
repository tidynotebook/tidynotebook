/**
 * Public entry point of the notesapp server.
 *
 * The HTTP boundary is generated from `@notesapp/api-contract`. Nothing here
 * declares a route, a request shape, or a response shape by hand.
 */
export type {
  LegalTexts,
  LogLevel,
  MailConfig,
  ObjectStoreConfig,
  ServerConfig,
} from './config.ts';
export {
  ConfigError,
  loadLegalTexts,
  loadProtectedEnvironment,
  loadServerConfig,
  objectStoreSettings,
  serverVariables,
  templateBlanks,
} from './config.ts';
export type {
  Drain,
  DrainEvent,
  DrainOptions,
  DrainTimers,
  ServiceLifecycle,
  ServiceState,
  StartEvent,
  StartOptions,
} from './lifecycle.ts';
export {
  createDrain,
  createServiceLifecycle,
  realTimers,
  runningLifecycle,
  startListener,
} from './lifecycle.ts';
export type { AppOptions } from './app.ts';
export { createApp, createAppWithHandlers } from './app.ts';
export {
  createMcpProtocol,
  mcpRoutes,
  mcpProtocolError,
} from './mcp/protocol.ts';
export {
  mcpTools,
  checkToolRegistry,
  runTool,
  type McpTool,
} from './mcp/registry.ts';
export { withToolDelegation } from './auth/actor.ts';
export type { HandlerDependencies } from './routes/handlers.ts';
export { createHandlers } from './routes/handlers.ts';
export {
  archiveJobsPerAccount,
  archiveJobsPerInstallation,
  coordinatedArchiveJobs,
  type ArchiveJobs,
} from './routes/archive-jobs.ts';
export { archiveDiskReserveBytes } from './routes/import.ts';
export type {
  DatabaseRead,
  ProbeRequest,
  ReadinessCheck,
  ReadinessProbe,
} from './routes/health.ts';
export {
  configurationProbe,
  createServiceHandlers,
  databaseProbe,
  databaseProbes,
  evaluateReadiness,
  livenessAnswer,
  migrationProbe,
  readinessAnswer,
  singleFlight,
  storageProbe,
  withDeadline,
} from './routes/health.ts';
export { attachRequestLogging, redactUrl } from './request-log.ts';
export type {
  HandlerMap,
  HandlerResult,
  IdentityResolver,
  ProtocolAdapter,
  ProtocolResult,
} from './plugins/register.ts';
export type {
  IdentityAdapter,
  IdentityDependencies,
  ResolvedActor,
} from './auth/actor.ts';
export {
  createIdentityAdapter,
  requestActor,
  requireActor,
} from './auth/actor.ts';
export type {
  AuthHandle,
  AuthOptions,
  NotesappAuth,
} from './auth/better-auth.ts';
export { createSetupHandlers, type SetupDependencies } from './auth/setup.ts';
export {
  passwordMatches,
  registerIdentity,
  sessionAllowedBy,
  startSession,
  type Registered,
  type RegistrationInput,
} from './auth/registration.ts';
export {
  invitationPath,
  issueInvitation,
  mailInvitation,
} from './auth/invitations.ts';
export { createAdministrationHandlers } from './routes/administration.ts';
export {
  createAccountRemoval,
  type AccountRemovalDependencies,
  type AccountRemovalResult,
} from './jobs/account-removal.ts';
export { authProblemCode } from './auth/better-auth.ts';
export {
  authBasePath,
  authRoutes,
  betterAuthProtocol,
  createAuth,
  createAuthPool,
  createAuthProtocol,
} from './auth/better-auth.ts';
export type { Problem, ProblemCode } from './plugins/problem.ts';
export {
  createProblem,
  DomainProblemError,
  ForbiddenError,
  NotFoundError,
  OriginRequiredError,
  PreconditionRequiredError,
  problemMediaType,
  UnauthenticatedError,
} from './plugins/problem.ts';
export {
  createFileHandlers,
  missingWorkspaceStore,
  parseTag,
  revisionTag,
} from './routes/files.ts';
export type {
  ApplicationMail,
  Mailer,
  MailMessage,
  MailTransport,
} from './auth/mail.ts';
export { createMailTransport, noMailer } from './auth/mail.ts';
export { bootstrapOwner, type BootstrapResult } from './cli/bootstrap.ts';
export { recoverAccount, type RecoveryResult } from './cli/recover-account.ts';
export { inviteAccount, type InviteResult } from './cli/invite-account.ts';
export { promoteAccount } from './cli/promote-account.ts';
export { defaultNoticeBounds, type NoticeBounds } from './notices/bounds.ts';
export { syncNoticesProtocol } from './routes/sync-notices.ts';
export { createSyncCleanup } from './jobs/sync-cleanup.ts';
export { createAttachmentCleanup } from './jobs/attachment-cleanup.ts';
export {
  createObjectCleanup,
  objectCleanupIntervalMs,
} from './jobs/object-cleanup.ts';
export { createPublicationCleanup } from './jobs/publication-cleanup.ts';
export {
  createPublicationHasher,
  newPublishedSecret,
  secretDigest,
} from './auth/publication-secrets.ts';
export {
  publishedScriptContentPolicy,
  publishedDocumentContentPolicy,
  publishedDocumentHeaders,
  type PublishedPageAssets,
} from './plugins/security-headers.ts';
export {
  assetHashLength,
  builtStylesheetHrefs,
  cacheControlFor,
  documentStylesheetHrefs,
  publishedDiagramFrameHref,
  publishedPageScriptFile,
  publishedPageScriptHref,
} from './plugins/static-assets.ts';
export {
  publishedButtonClasses,
  publishedDocument,
  publishedDocumentClasses,
  publishedFieldClasses,
  publishedTaskBoxClasses,
  publishedCodeFigureClasses,
  publishedTitle,
  type PublishedPageView,
} from './routes/published-document.ts';
export {
  linkPreviewBlock,
  linkPreviewCardFile,
  linkPreviewImageSize,
  linkPreviewPlaceholder,
} from './link-preview.ts';
export { createSearchHandlers } from './routes/search.ts';
