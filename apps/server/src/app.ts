/**
 * Server composition.
 *
 * `createApp` builds a Fastify instance that serves exactly the operations in
 * the contract. It adds the checks that every request passes through: a
 * request id, the Host allowlist, the configured body limit, contract request
 * validation, contract response validation, and problem details for every
 * failure.
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ReaderRefusalCause, UsageMeter } from '@notesapp/core';
import {
  applyEnvironmentPolicy,
  createUsageMeter,
  lockedAccountKeeps,
} from '@notesapp/core';
import type { OperationId } from '@notesapp/api-contract';
import { findChannel, findOperation } from '@notesapp/api-contract';
import {
  ConfigError,
  loadLegalTexts,
  objectStoreSettings,
  type LegalTexts,
  type ServerConfig,
} from './config.ts';
import type { ServiceLifecycle } from './lifecycle.ts';
import { createHandlers } from './routes/handlers.ts';
import {
  configurationProbe,
  databaseProbes,
  storageProbe,
  type ReadinessProbe,
} from './routes/health.ts';
import type {
  HandlerMap,
  IdentityResolver,
  ProtocolAdapter,
} from './plugins/register.ts';
import { answerProtocolError, registerOperations } from './plugins/register.ts';
import type { AuthLogRecord, AuthOptions } from './auth/better-auth.ts';
import {
  createAuth,
  createAuthPool,
  createAuthProtocol,
} from './auth/better-auth.ts';
import { createIdentityAdapter, refuseLocked } from './auth/actor.ts';
import { createMcpProtocol } from './mcp/protocol.ts';
import type { McpTool } from './mcp/registry.ts';
import { createPublicationHasher } from './auth/publication-secrets.ts';
import { createSetupHandlers } from './auth/setup.ts';
import { passwordMatches, sessionAllowedBy } from './auth/registration.ts';
import {
  budgetedTransport,
  createMailTransport,
  type ApplicationMail,
  type MailTransport,
} from './auth/mail.ts';
import { createMailPasswordSeal } from './auth/seal.ts';
import { createInstallationSettings } from './installation-settings.ts';
import {
  createDocumentService,
  expireOAuthClients,
  openAttachmentStore,
  openCoordination,
  openSyncListener,
  openIdentityStore,
  openObjectStore,
  openWorkspaceStore,
  type ListenerSchedule,
  type ObjectStoreSettings,
} from '@notesapp/storage-server';
import {
  classifyError,
  createProblem,
  problemMediaType,
} from './plugins/problem.ts';
import {
  baseSecurityHeaders,
  type PublishedPageAssets,
} from './plugins/security-headers.ts';
import {
  builtStylesheetHrefs,
  documentStylesheetHrefs,
  publishedDiagramFrameHref,
  ApplicationShellError,
  prepareApplicationShell,
  publishedPageScriptHref,
  sendApplicationShell,
  sendStaticFile,
  type ApplicationShell,
  servesApplicationShell,
  servesBrowserAssets,
  statFile,
} from './plugins/static-assets.ts';
import {
  attachRequestLogging,
  problemInstance,
  redactUrl,
} from './request-log.ts';
import { createAttachmentCleanup } from './jobs/attachment-cleanup.ts';
import { createObjectCleanup } from './jobs/object-cleanup.ts';
import { scratchFolder } from './routes/scratch.ts';
import { createPublicationCleanup } from './jobs/publication-cleanup.ts';
import { createAccountRemoval } from './jobs/account-removal.ts';
import { createSyncCleanup } from './jobs/sync-cleanup.ts';
import { createServerLogger, errorName } from './logging.ts';
import {
  linkPreviewBlock,
  linkPreviewCardHref,
  linkPreviewPlaceholder,
} from './link-preview.ts';
import {
  AttemptCounters,
  attemptStoreFor,
  databaseAttemptCounter,
  type AttemptCounter,
} from './plugins/attempt-store.ts';

/**
 * Accepted shape of a caller supplied correlation id. It matches the contract
 * schema of the `x-request-id` header, so an echoed value always passes the
 * response check as well.
 */
const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * The longest wait for the request line and the headers of one request.
 *
 * The total receive bound of `config.limits.requestTimeoutMs` covers the whole
 * request, so it has to be long enough for the largest upload body. The
 * headers of every operation fit in one packet, so they keep a short bound of
 * their own and a sender that trickles a header list reaches nothing. Node
 * refuses a header bound that is longer than the request bound, so the smaller
 * of the two wins.
 */
const maxHeadersTimeoutMs = 10000;

/** The caller's correlation id when it is usable, otherwise a new UUID. */
export function requestId(supplied: unknown): string {
  return typeof supplied === 'string' && requestIdPattern.test(supplied)
    ? supplied
    : randomUUID();
}

import { answersAnyHost, hostName } from './plugins/host.ts';
export { hostName } from './plugins/host.ts';
import {
  publishedOrigin,
  roleOfHost,
  servedHostNames,
} from './served-origins.ts';
import { publishedOriginDecision } from './plugins/published-origin.ts';
import { createVerificationTokens } from './auth/verification.ts';
import { createSignUpChallenges } from './auth/proof-of-work.ts';
import {
  createSyncNoticesProtocol,
  syncNoticesProtocol,
} from './routes/sync-notices.ts';
import { defaultNoticeBounds, type NoticeBounds } from './notices/bounds.ts';
import { createNoticeGateway } from './notices/gateway.ts';
import { registerWebSocket } from './plugins/websocket.ts';
import { coordinatedArchiveJobs } from './routes/archive-jobs.ts';
import { checkUsageGate, countAnswer } from './usage/boundary.ts';
import {
  closeWithLastWrite,
  startUsageWrites,
  usageWriteIntervalMs,
} from './usage/writes.ts';

/**
 * How many messages one address takes in an hour from a person with no
 * session: a sign-up, a repeated sign-up and a password reset (records 0114
 * and 0141).
 */
const strangerMailsPerHour = 3;

/**
 * The address of one request, as a problem body repeats it.
 *
 * The query goes, so a reading ticket and a search term never reach a body,
 * and a secret path segment goes with it, because the token of a published
 * link is a path segment (decision 0046). `request-log.ts` holds the one list
 * of the prefixes that carry a secret.
 */
function instanceOf(request: FastifyRequest): string {
  return problemInstance(request.url);
}

/**
 * Keeps every response inside the contract. A status that the operation does
 * not declare becomes a generic server error instead of an undocumented body.
 */
function contractStatus(id: OperationId | undefined, status: number): number {
  if (id === undefined) return status;
  const operation = findOperation(id);
  const declared = (operation?.responses ?? []).some(
    (response) => response.status === status,
  );
  return declared ? status : 500;
}

/** The built browser assets of this deployment, or `null` when there are none. */
const defaultWebDist = resolve(import.meta.dirname, '../../web/dist/web');

/**
 * The directory of the built browser assets.
 *
 * One decider, because two parts of the composition read it: the static
 * handler serves from it, and the published page of decision 0031 reads the
 * stylesheet of the shell document in it.
 */
export function webAssetsDirectory(
  configured: string | null | undefined,
): string | null {
  if (configured !== undefined) return configured;
  return existsSync(defaultWebDist) ? defaultWebDist : null;
}

/**
 * The link preview of this configuration and this build, or `null` when the
 * build holds no card (design 028).
 *
 * It reads the canonical origin of the configuration and never a request, so
 * a forged Host header cannot change it.
 */
function linkPreviewOf(
  config: ServerConfig,
  webDist: string | null,
): string | null {
  const card = webDist === null ? null : linkPreviewCardHref(webDist);
  return card === null ? null : linkPreviewBlock(config.origin, card);
}

/**
 * The application shell of one start, or `null` when the server answers the
 * built `index.html` from disk.
 *
 * A directory with no shell, or a shell with no placeholder, such as a site
 * that is not this application, keeps the file answer and writes no preview.
 * A shell with the placeholder and no single card, or with two placeholders,
 * came from a broken build, so it refuses the start.
 */
function applicationShellOf(
  config: ServerConfig,
  webDist: string,
): ApplicationShell | null {
  const path = resolve(webDist, 'index.html');
  if (statFile(path) === null) return null;
  const html = readFileSync(path, 'utf8');
  if (!html.includes(linkPreviewPlaceholder)) return null;
  const block = linkPreviewOf(config, webDist);
  if (block === null)
    throw new ApplicationShellError(
      'names a link preview, but assets/ holds no single card. Build the web application again.',
    );
  return prepareApplicationShell(html, linkPreviewPlaceholder, block);
}

/** Everything that a deployment or a test supplies besides configuration. */
export type AppOptions = {
  /** Internal test composition. The production registry has no injected rows. */
  readonly mcpTools?: readonly McpTool[];
  /** One handler per contract operation id. */
  readonly handlers: HandlerMap;
  /** Injected safe CIMD transport for protocol integration tests. */
  readonly oauthFetch?: AuthOptions['oauthFetch'];
  /** Resolves the actor of an operation that declares a security scheme. */
  readonly identity?: IdentityResolver;
  /** Destination of the structured log, for tests that read log records. */
  readonly logStream?: { write: (line: string) => void };
  /** Maintained protocol libraries that serve part of the HTTP surface. */
  readonly protocols?: readonly ProtocolAdapter[];
  /** Optional custom readiness probes. */
  readonly probes?: readonly ReadinessProbe[];
  /**
   * The lifecycle state of the process, which the readiness answer reads.
   *
   * `createApp` passes it to the handlers that it builds. A caller that
   * supplies its own handler map wires the state into that map instead.
   */
  readonly lifecycle?: ServiceLifecycle;
  /** Custom web assets directory or null to disable web asset serving. */
  readonly webDist?: string | null;
  /**
   * Where the attempt counts of the limited routes live. A deployment passes
   * the counter of the installation, which every process shares (record
   * 0121). A server with no database counts in its own memory.
   */
  readonly attempts?: AttemptCounter;
  /**
   * The mail transport of the environment. The configuration decides it, and
   * a test supplies its own so that it reads every message without a mail
   * server. A transport given here stands for `NOTESAPP_SMTP_URL`, so the
   * mail settings of the application are locked (record 0148).
   */
  readonly mail?: MailTransport | null;
  /**
   * Builds the transport of the mail settings that an administrator stores.
   * A test supplies its own, so it reads what those settings send.
   */
  readonly connectMail?: (mail: ApplicationMail) => MailTransport;
  /**
   * The Markdown text of each legal document that this server serves. `main.ts`
   * reads it before the start, so a refusal names its file. A caller that
   * passes nothing gets the files of the configuration read here (record
   * 0140).
   */
  readonly legalTexts?: LegalTexts;
  /**
   * The object store of the installation, with the key pair of an S3 store
   * (record 0192). `main.ts` reads it before the start, so a refusal names
   * its file. A caller that passes nothing gets the store of the
   * configuration.
   */
  readonly objectStore?: ObjectStoreSettings;
  /**
   * The bounds of the notice gateway. A test passes shorter times, and a
   * deployment takes `defaultNoticeBounds` (record 0129).
   */
  readonly noticeBounds?: Partial<NoticeBounds>;
  /**
   * When the sync listener reconnects after a loss. A deployment takes the
   * timers of the runtime. A test holds the reconnect, so the gap of the
   * listener lasts until the test ends it.
   */
  readonly listenerSchedule?: ListenerSchedule;
  /**
   * The meter of the limits of each month (record 0193). `createApp` builds
   * the meter of the installation. A caller of `createAppWithHandlers` that
   * passes none counts nothing and refuses nothing.
   */
  readonly usage?: UsageMeter;
  /**
   * How often this process writes its counts of the month, in milliseconds.
   * A deployment takes `usageWriteIntervalMs`, and a test a shorter time.
   */
  readonly usageWriteIntervalMs?: number;
};

/** Builds the application with an explicit handler map. */
export async function createAppWithHandlers(
  config: ServerConfig,
  options: AppOptions,
): Promise<FastifyInstance> {
  // The shell is read before the instance exists, so a build that refuses
  // the start leaves no listener and no timer behind.
  const webDist = webAssetsDirectory(options.webDist);
  const shell = webDist === null ? null : applicationShellOf(config, webDist);
  const app = Fastify({
    // Request headers are never logged. The serializer records the method,
    // the redacted URL, and the host name, and nothing else, so a credential
    // in a header cannot reach a log record. Redaction by omission is
    // stronger than a redaction list, which only covers the header names that
    // someone remembered to add.
    //
    // It records no client address. It used to read a `remoteAddress` member
    // that a request does not carry, so the field was always empty and the
    // record claimed something it never held. `./request-log.ts` is the one
    // request log of this server (record 0020) and it records no address
    // either, so nothing here decides a privacy question by accident.
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            serializers: {
              req: (request: {
                readonly method?: unknown;
                readonly url?: unknown;
                readonly hostname?: unknown;
              }) => ({
                method:
                  typeof request.method === 'string' ? request.method : '',
                url:
                  typeof request.url === 'string' ? redactUrl(request.url) : '',
                hostname:
                  typeof request.hostname === 'string' ? request.hostname : '',
              }),
            },
            ...(options.logStream === undefined
              ? {}
              : { stream: options.logStream }),
          },
    // The configured proxies are the only senders whose forwarded headers this
    // server believes. An empty list is `false`, which is the Fastify default
    // and the default of every deployment: the client address is then the peer
    // address of the socket and a forwarded header changes nothing. The list
    // makes `request.ip` the one answer to "who is the caller", and the
    // attempt limit keys on it. See decision 0043.
    trustProxy:
      config.trustedProxies.length === 0 ? false : [...config.trustedProxies],
    bodyLimit: config.limits.bodyBytes,
    // The router carries no bound of its own. Node counts the request line in
    // the header budget, so no path parameter can be longer than the header
    // limit, and a shorter bound here would only decide which answer a long
    // address gets. That answer was the framework's own 414 notice: it names
    // an engine code, it repeats the whole address, and it passes neither the
    // problem handler nor the one document of the reader path. A long token of
    // a published link now reads exactly like an unknown one (decision 0047).
    routerOptions: { maxParamLength: config.limits.headerBytes },
    requestTimeout: config.limits.requestTimeoutMs,
    // Fastify's own header limit is a server option, so it is applied here
    // rather than per route.
    http: {
      maxHeaderSize: config.limits.headerBytes,
      headersTimeout: Math.min(
        maxHeadersTimeoutMs,
        config.limits.requestTimeoutMs,
      ),
    },
    genReqId: (request) => requestId(request.headers['x-request-id']),
    // `./request-log.ts` writes the one request record of this server, so the
    // framework writes none of its own. The top level `disableRequestLogging`
    // option that used to say this is deprecated in Fastify 5 and goes in
    // Fastify 6, and it wrote a deprecation notice to the operator on every
    // start. Fastify takes an instance here and refuses a class.
    logController: new LogController({ disableRequestLogging: true }),
  });

  // The children of the shipped store hold a counter each, so two routes of
  // one attempt group counted apart although the key of an attempt already
  // names the group. This store shares one counter map with every child, so a
  // group is one bucket. See `./attempt-store.ts`.
  await app.register(rateLimit, {
    global: false,
    store: attemptStoreFor(options.attempts ?? new AttemptCounters()),
  });
  const logger = createServerLogger(app.log);

  attachRequestLogging(app);

  // One hook writes the security headers of every answer, including the ones
  // that the not-found handler, the error handler and a protocol adapter
  // produce. A route that needs a different content policy, such as an HTML
  // document, replaces that one header on its own reply.
  const securityHeaders = baseSecurityHeaders(config.origin);
  app.addHook('onRequest', async (_request, reply) => {
    for (const [name, value] of securityHeaders) reply.header(name, value);
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // A request that names a Host this deployment does not serve is rejected
  // before any handler runs. This blocks cache poisoning and absolute URL
  // rewriting through a forged Host header. The list is the host name of each
  // served origin, because a Host header carries no scheme. The origin itself
  // is checked by the cookie write check and by the identity routes, which
  // both read the same served origin list. An operation that a caller outside
  // the served origins asks for, such as a probe of the platform, answers any
  // host, and `answersAnyHost` is the one rule that names it (records 0190
  // and 0199).
  const servedHosts = servedHostNames(config.servedOrigins);
  app.addHook('onRequest', async (request, reply) => {
    if (servedHosts.includes(hostName(request.headers.host))) return;
    const id = request.routeOptions.config.operationId;
    if (answersAnyHost(id)) return;
    const status = contractStatus(id, 400);
    if (await answerProtocolError(request, reply, status)) return;
    await reply
      .status(status)
      .header('content-type', `${problemMediaType}; charset=utf-8`)
      .send(
        createProblem({
          code: status === 400 ? 'host_not_allowed' : 'internal_error',
          status,
          detail: 'This deployment does not serve the requested Host.',
          instance: instanceOf(request),
          requestId: request.id,
        }),
      );
  });

  // The published origin serves the reader path and nothing else, and the
  // application origin sends a reader address there (record 0118). A request
  // that the published origin does not serve gets the not-found answer of any
  // other unknown address, so the origin names no operation of the product.
  const published = publishedOrigin(config.servedOrigins);
  if (published !== null) {
    app.addHook('onRequest', async (request, reply) => {
      const decision = publishedOriginDecision(
        roleOfHost(config.servedOrigins, hostName(request.headers.host)),
        published,
        {
          operationId: request.routeOptions.config.operationId,
          method: request.method,
          url: request.url,
        },
      );
      if (decision.kind === 'serve') return;
      if (decision.kind === 'redirect') {
        await reply.redirect(decision.location, 307);
        return;
      }
      // The operation of this address does not exist on the published origin,
      // so its contract does not apply. The answer is the not-found answer of
      // an unknown address, serialized here so that no route schema reads it.
      await reply
        .status(404)
        .header('content-type', `${problemMediaType}; charset=utf-8`)
        .send(
          JSON.stringify(
            createProblem({
              code: 'route_not_found',
              status: 404,
              detail: 'No operation serves this method and path.',
              instance: instanceOf(request),
              requestId: request.id,
            }),
          ),
        );
    });
    // No answer of the published origin sets a cookie, whatever wrote it.
    app.addHook('onSend', async (request, reply) => {
      if (
        roleOfHost(config.servedOrigins, hostName(request.headers.host)) ===
        'published'
      )
        reply.removeHeader('set-cookie');
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (
      webDist !== null &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      const rawPath = request.url.split('?')[0] ?? '/';
      let decodedPath: string | null = null;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        // A malformed path is not a web asset. The normal not-found problem
        // response below handles it without exposing a filesystem detail.
      }
      // Both readings of the address must leave the built assets, because an
      // escape that hides the name of a boundary is still that boundary.
      const servesAssets =
        servesBrowserAssets(rawPath) &&
        (decodedPath === null || servesBrowserAssets(decodedPath));

      if (servesAssets) {
        // Decision 0013: source maps are not served. A `.map` request is never
        // a web asset and never falls back to the application shell, so the
        // built image serves no source map even though the build writes one.
        const isSourceMap =
          rawPath.toLowerCase().endsWith('.map') ||
          (decodedPath !== null && decodedPath.toLowerCase().endsWith('.map'));
        if (!isSourceMap && decodedPath !== null) {
          const targetPath = resolve(webDist, '.' + decodedPath);
          // The shell on disk holds the placeholder of the link preview, so
          // its own address answers the shell of this start too.
          if (shell !== null && targetPath === resolve(webDist, 'index.html'))
            return sendApplicationShell(request, reply, shell);
          if (
            targetPath.startsWith(`${webDist}/`) &&
            statFile(targetPath) !== null
          ) {
            return sendStaticFile(request, reply, {
              filePath: targetPath,
              relativePath: relative(webDist, targetPath).split(sep).join('/'),
            });
          }
        }
        // The file is missing. Only an address that names a page of the
        // router on the device receives the shell; an address that names a
        // file receives the not-found problem below, because a script that
        // arrives as HTML is refused by `nosniff` and hides the real cause.
        if (!isSourceMap && servesApplicationShell(decodedPath ?? rawPath)) {
          if (shell !== null)
            return sendApplicationShell(request, reply, shell);
          const indexPath = resolve(webDist, 'index.html');
          if (statFile(indexPath) !== null)
            return sendStaticFile(request, reply, {
              filePath: indexPath,
              relativePath: 'index.html',
            });
        }
      }
    }

    await reply
      .status(404)
      .header('content-type', `${problemMediaType}; charset=utf-8`)
      .send(
        createProblem({
          code: 'route_not_found',
          status: 404,
          detail: 'No operation serves this method and path.',
          instance: instanceOf(request),
          requestId: request.id,
        }),
      );
  });

  app.setErrorHandler(async (error, request, reply) => {
    const classified = classifyError(error);
    const id = request.routeOptions.config.operationId;
    const status = contractStatus(id, classified.status);
    const code =
      status === classified.status ? classified.code : 'internal_error';
    if (
      status === 401 &&
      id !== undefined &&
      findOperation(id)?.security.some(
        (requirement) => 'personalApiKey' in requirement,
      )
    )
      reply.header(
        'www-authenticate',
        request.headers.authorization === undefined
          ? 'Bearer realm="tidy notebook"'
          : 'Bearer realm="tidy notebook", error="invalid_token"',
      );
    // `setErrorHandler` replaces Fastify's own error logging, so a fault that
    // the client never sees in detail would otherwise leave no trace at all.
    // Every answer that classifies as an unexpected server error is logged
    // with the failure itself, under the request id that the caller received.
    if (code === 'internal_error')
      logger.bind({ requestId: request.id }).emit('http.request.failed', {
        operationId: id ?? null,
        errorName: errorName(error),
      });
    if (await answerProtocolError(request, reply, status)) return;
    await reply
      .status(status)
      .header('content-type', `${problemMediaType}; charset=utf-8`)
      .send(
        createProblem({
          code,
          status,
          detail:
            status === classified.status
              ? classified.detail
              : 'The service failed to complete the request.',
          instance: instanceOf(request),
          requestId: request.id,
          ...(classified.issues.length > 0 && status === classified.status
            ? { issues: classified.issues }
            : {}),
          ...(classified.fileIds !== undefined && status === classified.status
            ? { fileIds: classified.fileIds }
            : {}),
          ...(classified.missing !== undefined && status === classified.status
            ? { missing: classified.missing }
            : {}),
          ...(classified.blanks !== undefined && status === classified.status
            ? { blanks: classified.blanks }
            : {}),
          ...(classified.reason !== undefined && status === classified.status
            ? { reason: classified.reason }
            : {}),
          ...(classified.noteRefusal !== undefined &&
          status === classified.status
            ? { noteRefusal: classified.noteRefusal }
            : {}),
          ...(classified.limit !== undefined && status === classified.status
            ? { limit: classified.limit }
            : {}),
        }),
      );
  });

  // The notice stream belongs to this server, not to a composition choice,
  // so every application serves its upgrade address. A composition with a
  // gateway supplies its own adapter, and every other one refuses the stream.
  const supplied = options.protocols ?? [];
  const noticeProtocols = supplied.some(
    (adapter) => adapter.protocol === syncNoticesProtocol,
  )
    ? supplied
    : [...supplied, createSyncNoticesProtocol()];
  const protocols = noticeProtocols.some((entry) => entry.protocol === 'mcp')
    ? noticeProtocols
    : [
        ...noticeProtocols,
        createMcpProtocol({
          config,
          app: () => app,
          attempts: options.attempts ?? new AttemptCounters(),
          identity: { oauthTokenIdentity: () => Promise.resolve(null) },
        }),
      ];
  const noticeBounds = { ...defaultNoticeBounds, ...options.noticeBounds };
  await registerWebSocket(app, {
    maxFrameBytes: noticeBounds.maxFrameBytes,
    subprotocols: [findChannel('syncNotices')?.subprotocol ?? ''].filter(
      (name) => name !== '',
    ),
    // Each stream gets its stop message before the server closes.
    preClose: async () => {
      await Promise.all(
        protocols.map(
          (adapter) => adapter.socket?.drain() ?? Promise.resolve(),
        ),
      );
    },
  });
  // The closures of a month refuse an operation before its handler runs,
  // and the last hook of each route counts the bytes that leave (record
  // 0193).
  const usage = options.usage;
  if (usage !== undefined)
    app.addHook('preHandler', async (request, reply) => {
      await checkUsageGate(usage, () => new Date(), request, reply);
    });
  registerOperations(
    app,
    options.handlers,
    options.identity,
    protocols,
    config.rateLimit,
    config.limits,
    usage === undefined ? undefined : countAnswer(usage),
    config.mcpOrigin !== null,
  );
  return app;
}

/**
 * Builds the application of this release.
 *
 * The composition owns the two identity connections. The Better Auth pool
 * never sets a transaction identity, which is what the row policies of the
 * identity tables expect. The account store always sets one, so every read and
 * write it performs is narrowed to that account and its workspaces. Both pools
 * close when the instance closes.
 */
export async function createApp(
  config: ServerConfig,
  options?: Partial<AppOptions>,
): Promise<FastifyInstance> {
  // Every store records how to close it the moment it opens, so a failure
  // further down closes what is already open. The composition used to throw
  // with the pools still held, and a process that never listened kept its
  // connections to the database until it was killed.
  const opened: (() => Promise<void>)[] = [];
  try {
    return await composeApp(config, options, opened);
  } catch (error) {
    await closeOpened(opened);
    throw error;
  }
}

/**
 * Closes what a failed composition already opened.
 *
 * The order is the reverse of the order they opened in, which is the order of
 * the `onClose` hook of a running instance, so a store never closes before
 * one that depends on it. A store that cannot close is passed over: it must
 * not hide the failure that started the unwind, because that is the one the
 * operator has to act on.
 */
export async function closeOpened(
  opened: readonly (() => Promise<void>)[],
): Promise<void> {
  for (const close of [...opened].reverse()) {
    try {
      await close();
    } catch {
      // Stated above.
    }
  }
}

/**
 * Opens every store and builds the instance.
 *
 * `opened` collects the close of each store as it opens. `createApp` is the
 * one caller and it owns the unwind, so nothing here has to remember it.
 */
async function composeApp(
  config: ServerConfig,
  options: Partial<AppOptions> | undefined,
  opened: (() => Promise<void>)[],
): Promise<FastifyInstance> {
  const identity = openIdentityStore(config.databaseUrl);
  opened.push(() => identity.close());
  // The attempt counters and the job locks that every process shares.
  const coordination = openCoordination(config.databaseUrl);
  opened.push(() => coordination.close());
  // The content store uses the same runtime role. It opens its own pool,
  // because a content transaction holds the workspace lock for the length of a
  // changeset and must not queue behind an identity lookup.
  const content = openWorkspaceStore(
    config.databaseUrl,
    createDocumentService(),
  );
  opened.push(() => content.close());
  // The counts of each month and their limits (record 0193). The sums live
  // in the memory of this process and reach the monthly table, which every
  // process shares, at each write. A check keeps the limits of an account
  // for one interval of the writes.
  const writeIntervalMs = options?.usageWriteIntervalMs ?? usageWriteIntervalMs;
  const usage = createUsageMeter({
    store: coordination,
    caps: config.usageCaps,
    clock: () => new Date(),
    subjectTtlMs: writeIntervalMs,
  });
  // Every byte that a later request reads lives in the object store, so any
  // process of the installation answers that request (record 0192). An S3
  // store tells the meter each call that it makes.
  const objects = openObjectStore(
    options?.objectStore ?? objectStoreSettings(config),
    (kind) => {
      usage.countObjectCall(kind);
    },
  );
  opened.push(() => Promise.resolve(objects.close()));
  // The database probes read through the pool that serves the workspace
  // traffic, so a probe that an orchestrator repeats forever opens no
  // connection of its own and proves the path that a request takes.
  const probes = options?.probes ?? [
    configurationProbe(config),
    storageProbe(config.storageRoot, objects),
    ...databaseProbes(() => content.probeDatabase()),
  ];
  const attachments = openAttachmentStore(config.databaseUrl, objects);
  opened.push(() => attachments.close());
  // The mail transport and the legal documents come from the environment or
  // from the settings of the application, and this one decider answers which
  // applies at each request (record 0148).
  const settings = createInstallationSettings({
    config,
    reader: identity,
    environmentMail:
      options?.mail === undefined
        ? createMailTransport(config.mail)
        : options.mail,
    environmentTexts: options?.legalTexts ?? (await loadLegalTexts(config)),
    passwordSeal: createMailPasswordSeal(config.authSecret),
    ...(options?.connectMail === undefined
      ? {}
      : { connect: options.connectMail }),
  });
  const mail = settings.mailer;
  // A registration policy that the environment names goes into the row at
  // each start, so the SQL gate of a sign-up, the sign-up and the accounts
  // page read one value, and the decider locks it (record 0206). The
  // configuration refused an open policy with a part missing.
  if (config.registrationPolicy !== null) {
    const applied = await applyEnvironmentPolicy(
      identity,
      config.registrationPolicy,
      settings.environment,
    );
    if (!applied.ok)
      throw new ConfigError([
        'NOTESAPP_REGISTRATION_POLICY: the open policy needs a mail server and both legal documents in the environment.',
      ]);
  }
  // The published page reads the stylesheet of the built shell document, so
  // the page cannot drift from the theme (decision 0031). A deployment that
  // serves no built assets, which is what a development run and most tests
  // are, answers no stylesheet and the page is still readable text.
  const webDist = webAssetsDirectory(options?.webDist);
  const publishedStylesheets = (): readonly string[] => {
    if (webDist === null) return [];
    const document = resolve(webDist, 'index.html');
    const stats = statFile(document);
    const shell =
      stats === null ? [] : documentStylesheetHrefs(document, stats);
    // The shell stylesheet comes first, so the theme of the application wins
    // the cascade, and every other emitted stylesheet follows it. The page
    // holds no script, so it cannot load one when it finds that it needs one
    // (record 0060).
    const emitted = builtStylesheetHrefs(resolve(webDist, 'assets'));
    return [...shell, ...emitted.filter((href) => !shell.includes(href))];
  };
  // Every view of a published link carries the link preview of the shell,
  // byte for byte (design 028). The block reads the configuration only, so
  // it is built once.
  const publishedLinkPreview = linkPreviewOf(config, webDist);
  // A note that holds a diagram or a code block runs the one script of a
  // published page, which draws a diagram in the frame that the editor uses
  // and copies a code block (records 0158 and 0174). A deployment that serves
  // no built assets answers none, and the page shows the source of each
  // diagram and each block with no copy action. The files of one build do not
  // change while it serves, so the build is read once, at the first such note.
  let pageAssets: { readonly value: PublishedPageAssets | null } | null = null;
  const publishedPage = (): PublishedPageAssets | null => {
    if (pageAssets !== null) return pageAssets.value;
    const script = webDist === null ? null : publishedPageScriptHref(webDist);
    pageAssets = {
      value:
        script === null ? null : { script, frame: publishedDiagramFrameHref },
    };
    return pageAssets.value;
  };
  // The cause of a reader refusal reaches the operator and reaches no answer.
  // The sink is filled once the instance exists, as the protocol sink below
  // is, so nothing reaches the console in between.
  const refusals: { record?: (cause: ReaderRefusalCause) => void } = {};
  // The protocol library writes into the application log. The sink is filled
  // once the instance exists, so nothing reaches the console in between.
  const sink: {
    write?: (record: AuthLogRecord) => void;
    breachUnavailable?: () => void;
  } = {};
  // Sign-up is enabled inside the protocol library, but its public route is
  // not mounted. The one registration path of `auth/registration.ts` calls
  // it. The session hook asks the account store before every new session, so
  // only an enabled account gets one (record 0111).
  const attempts = databaseAttemptCounter(coordination);
  // Every message that a person with no session can cause goes through this
  // one transport, so each counts against the budget of its address. The count
  // is shared by every server process (records 0121 and 0141).
  const strangerMail = budgetedTransport(
    mail,
    async (address) =>
      (
        await attempts.count(
          `stranger-mail:${address}`,
          60 * 60 * 1000,
          Date.now(),
        )
      ).current <= strangerMailsPerHour,
  );
  const authPool = createAuthPool(config);
  opened.push(() => authPool.end());
  const authOptions: AuthOptions = {
    mail: strangerMail,
    allowSignUp: true,
    sessionAllowed: sessionAllowedBy(identity),
    log: (record) => sink.write?.(record),
    onBreachUnavailable: () => sink.breachUnavailable?.(),
    oauth: { attempts, pool: authPool },
    ...(options?.oauthFetch === undefined
      ? {}
      : { oauthFetch: options.oauthFetch }),
  };
  const auth = await createAuth(config, authOptions, authPool);
  opened.push(() => auth.close());
  // The notice gateway of this process (record 0129). Its log sink is filled
  // once the instance exists, as the sinks above are.
  const noticeLog: { logger?: ReturnType<typeof createServerLogger> } = {};
  const gateway = createNoticeGateway({
    stores: {
      noticeAccess: (sessionId, accountId) =>
        identity.noticeAccess(sessionId, accountId),
      reserveStream: (id, accountId, ttlMs, limit) =>
        coordination.reserveStream(id, accountId, ttlMs, limit),
      renewStream: (id, ttlMs) => coordination.renewStream(id, ttlMs),
      releaseStream: (id) => coordination.releaseStream(id),
    },
    listener: (events) =>
      openSyncListener(
        config.databaseUrl,
        events,
        options?.listenerSchedule === undefined
          ? {}
          : { schedule: options.listenerSchedule },
      ),
    bounds: { ...defaultNoticeBounds, ...options?.noticeBounds },
    log: {
      opened: () => noticeLog.logger?.emit('notices.opened', {}),
      closed: (reason) => noticeLog.logger?.emit('notices.closed', { reason }),
      refused: (reason) =>
        noticeLog.logger?.emit('notices.refused', { reason }),
      listenerLost: () => noticeLog.logger?.emit('notices.listener_lost', {}),
      listenerRestored: () =>
        noticeLog.logger?.emit('notices.listener_restored', {}),
    },
  });
  opened.push(() => gateway.close());
  const adapter = createIdentityAdapter({
    auth: auth.auth,
    identity,
    servedOrigins: config.servedOrigins,
    // The operator API of record 0190. With no secret every operator
    // operation answers operator_off, and a wrong token counts in the shared
    // attempt counter.
    operator: {
      token: config.operatorToken,
      attempts,
      windowMs: config.rateLimit.windowSeconds * 1000,
      max: config.rateLimit.max,
    },
  });
  const app: FastifyInstance = await createAppWithHandlers(config, {
    handlers: {
      ...createHandlers(config, probes, {
        store: identity,
        settings,
        verifyPassword: (authUserId, password) =>
          passwordMatches(auth.auth, authUserId, password),
        content,
        attachments,
        operator: identity,
        usage,
        archiveJobs: coordinatedArchiveJobs(coordination),
        publications: {
          store: content,
          attachments,
          hasher: createPublicationHasher(auth.auth),
          stylesheets: publishedStylesheets,
          pageScript: publishedPage,
          linkPreview: publishedLinkPreview,
          recordRefusal: (cause) => refusals.record?.(cause),
        },
        ...(options?.lifecycle === undefined
          ? {}
          : { lifecycle: options.lifecycle }),
        noticeProtocols: () => gateway.offered(),
        legal: {
          // One read of the settings gives the text and the version of a page.
          read: async () => {
            const { texts, summaries } = await settings.legal();
            return {
              texts,
              versions: {
                terms: summaries.terms?.version ?? null,
                privacy: summaries.privacy?.version ?? null,
              },
            };
          },
          stylesheets: publishedStylesheets,
        },
      }),
      ...createSetupHandlers({
        auth: auth.auth,
        identity,
        content,
        servedOrigins: config.servedOrigins,
        newAccount: config.accounts,
        open: {
          mail: strangerMail,
          origin: config.origin,
          pendingHours: config.accounts.pendingHours,
          tokens: createVerificationTokens(config.authSecret),
          documents: async () => (await settings.legal()).documents,
          challenges: createSignUpChallenges(
            config.authSecret,
            config.accounts.proofDifficulty,
          ),
          useChallenge: (digest, expiresAt) =>
            identity.useChallenge(digest, expiresAt),
          breached: auth.breached,
          clock: () => new Date(),
        },
      }),
    },
    identity: adapter.resolver,
    protocols: [
      createMcpProtocol({
        config,
        identity,
        attempts,
        app: () => app,
        ...(options?.mcpTools === undefined ? {} : { tools: options.mcpTools }),
      }),
      // A locked account keeps the identity operations of the library and
      // not the change of its profile (record 0201).
      createAuthProtocol(
        config,
        auth.auth,
        async (request) => {
          const id = request.routeOptions.config.operationId;
          if (id === undefined || lockedAccountKeeps(id)) return;
          const resolved = await adapter.resolveActor(request);
          if (resolved !== null) refuseLocked(resolved.standing, id);
        },
        { pool: authPool, options: authOptions },
      ),
      createSyncNoticesProtocol({
        gateway,
        servedOrigins: config.servedOrigins,
      }),
    ],
    probes,
    ...(options?.logStream !== undefined
      ? { logStream: options.logStream }
      : {}),
    ...(options?.webDist !== undefined ? { webDist: options.webDist } : {}),
    ...(options?.noticeBounds !== undefined
      ? { noticeBounds: options.noticeBounds }
      : {}),
    attempts,
    usage,
  });
  const logger = createServerLogger(app.log);
  noticeLog.logger = logger;
  refusals.record = (cause): void => {
    logger.emit('published.refused', { cause });
  };
  const cleanupSync = createSyncCleanup(content);
  const cleanupAttachments = createAttachmentCleanup(attachments);
  const cleanupObjects = createObjectCleanup(
    objects,
    scratchFolder(config.storageRoot),
  );
  const cleanupPublications = createPublicationCleanup(content);
  // The removal of a locked account past its time, with its mails (record
  // 0201). The mail is the transport of the installation, because the
  // operator, and not a stranger, causes it.
  const removeAccounts = createAccountRemoval({
    store: identity,
    mailer: mail,
    origin: config.origin,
    portal: config.accountPortal !== null,
    // The run is daily (record 0201): one process claims each day in UTC.
    claimDay: (day) => coordination.claimDailyRun('removals', day),
  });
  let cleanupRunning = false;
  // Each job runs under a lock that one process takes, so two processes of
  // one installation never run one job at once (record 0121). A process that
  // finds a job running skips that run and tries again next hour.
  const jobs: readonly {
    readonly name:
      | 'sync'
      | 'attachments'
      | 'objects'
      | 'publications'
      | 'attempts'
      | 'pending'
      | 'streams'
      | 'removals';
    readonly run: () => Promise<unknown>;
  }[] = [
    { name: 'sync', run: () => cleanupSync() },
    { name: 'attachments', run: () => cleanupAttachments() },
    // Each staged upload and each import that nobody finished (record 0192).
    { name: 'objects', run: () => cleanupObjects() },
    { name: 'publications', run: () => cleanupPublications() },
    {
      name: 'pending',
      // A sign-up that nobody verified in time leaves nothing (record 0114).
      // The used challenges of the proof of work go once they expire.
      run: async () => {
        await identity.removePendingIdentities(
          new Date(Date.now() - config.accounts.pendingHours * 3_600_000),
        );
        await identity.pruneChallenges(new Date());
      },
    },
    {
      name: 'attempts',
      // A window is minutes long, so a counter older than a day counts
      // nothing any more.
      run: () =>
        coordination.pruneAttempts(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    },
    // A process that stopped without its drain leaves reservations that
    // expired (record 0129).
    { name: 'streams', run: () => coordination.pruneStreams() },
    {
      name: 'removals',
      run: async () => {
        await removeAccounts();
        if (config.mcpOrigin !== null) await expireOAuthClients(authPool);
      },
    },
  ];
  const runCleanup = async (): Promise<void> => {
    if (cleanupRunning) return;
    cleanupRunning = true;
    try {
      for (const job of jobs) {
        try {
          await coordination.runExclusive(job.name, async () => {
            await job.run();
          });
        } catch {
          logger.emit('maintenance.failed', { job: job.name });
        }
      }
    } finally {
      cleanupRunning = false;
    }
  };
  const cleanupTimer = setInterval(() => void runCleanup(), 60 * 60 * 1000);
  cleanupTimer.unref();
  sink.breachUnavailable = (): void => {
    logger.emit('auth.breach_check_unavailable', {});
  };
  sink.write = (record): void => {
    if (record.level === 'error')
      logger.emit('auth.failed', { source: 'better-auth' });
    else if (record.level === 'warn')
      logger.emit('auth.warning', { source: 'better-auth' });
    else if (record.level === 'info')
      logger.emit('auth.info', { source: 'better-auth' });
    else logger.emit('auth.debug', { source: 'better-auth' });
  };
  // The sums of this process reach the monthly table at each interval, and
  // once more at the stop (record 0193).
  const usageWrites = startUsageWrites(usage, writeIntervalMs, () => {
    logger.emit('maintenance.failed', { job: 'usage' });
  });
  // The listener starts once the instance exists. A stream opens only after
  // it listens, so no stream can miss a commit that follows its admission.
  gateway.start();
  app.addHook('onClose', async () => {
    // The last sums of this process are written after every answer and
    // every call to the object store that it counts, and before the store
    // of the counts closes, even when an earlier step fails.
    await closeWithLastWrite(
      async () => {
        // The streams stop first, while the stores that they release still
        // run.
        await gateway.close();
        clearInterval(cleanupTimer);
        await auth.close();
        await authPool.end();
        await attachments.close();
        objects.close();
        await content.close();
      },
      usageWrites,
      async () => {
        await coordination.close();
        await identity.close();
      },
    );
  });
  return app;
}
