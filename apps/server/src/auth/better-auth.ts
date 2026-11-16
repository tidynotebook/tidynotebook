/**
 * Better Auth protocol adapter.
 *
 * This is the one file that translates between Fastify and the Web standard
 * `Request` and `Response` that Better Auth's handler uses. It is listed in
 * the exact protocol-file exemption of `tools/check-boundaries.mjs`, because a
 * maintained protocol library owns its own transport shapes. Every other rule,
 * including package direction and deep imports, still applies here.
 *
 * The configuration below is the pinned identity policy of the deployment:
 *
 *   * Email and password sign-in. The sign-up route is not mounted, and
 *     every account comes in through the one registration path of
 *     `registration.ts` (record 0108), which starts no session before the
 *     account exists.
 *   * A session only for an enabled account. A hook asks the identity store
 *     before each new session (record 0111).
 *   * Secure, HttpOnly, SameSite cookies, a session that expires, and a
 *     session that refreshes while it is used.
 *   * Origin and Fetch Metadata checks against the served origins of the
 *     deployment, which are the only trusted origins. That list is the one in
 *     `config.servedOrigins`, and the cookie write check of `actor.ts` reads
 *     the same list, so the two cannot accept a different set. See
 *     [decision 0039](../../../../docs/decisions/0039-one-list-of-served-origins.md).
 *   * One client address, which this server resolves and the adapter passes
 *     on. The library reads no forwarded header of the caller. See
 *     [decision 0043](../../../../docs/decisions/0043-one-decider-of-the-client-address.md).
 *   * Password hashing and token lifetime owned by Better Auth. The bounds of
 *     a new password come from `passwordBounds` of `@notesapp/core`, and a
 *     new password is checked against the range service of Have I Been
 *     Pwned, which accepts it when the service does not answer (record 0116).
 *   * SMTP password recovery when a transport is configured, and the operator
 *     recovery command when none is.
 */
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import {
  oauthProvider,
  verifyOAuthQueryParams,
  type ClientMetadataResourceFetch,
} from '@better-auth/oauth-provider';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { createRateLimitKey, getIP } from '@better-auth/core/utils/ip';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { registrationContinuationPlugin } from './registration-continuation.ts';
import {
  oauthAccessLifetimeSeconds,
  oauthRefreshLifetimeSeconds,
  oauthScopes,
  oauthGrantTypes,
  oauthScopeAllowed,
  oauthConsentScopeAllowed,
  isOperationalError,
  passwordBounds,
  productName,
} from '@notesapp/core';
import { checkBreach, type RangeQuery } from './breach-check.ts';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { FastifyRequest } from 'fastify';
import pg from 'pg';
import {
  oauthAccessToken,
  oauthRefreshToken,
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthConsent,
  oauthClientAssertion,
  oauthRequestTransaction,
  oauthReplayCandidate,
  oauthRefreshRequest,
  revokeOAuthReplay,
  revokeOAuthToken,
  oauthClientRoom,
  oauthGrantRoom,
  oauthConsentTransaction,
  oauthConsentClientExists,
  isOAuthGrantLimit,
  authAccount,
  authRateLimit,
  authSession,
  authUser,
  authVerification,
  defaultConnectionTimeoutMs,
  openPool,
  openCoordination,
  poolSizes,
} from '@notesapp/storage-server';
import type { ServerConfig } from '../config.ts';
import type { ProblemCode } from '../plugins/problem.ts';
import { createProblem, problemMediaType } from '../plugins/problem.ts';
import type { ProtocolAdapter, ProtocolResult } from '../plugins/register.ts';
import { noMailer, type Mailer, type MailMessage } from './mail.ts';
import { passwordChangedMessage, passwordResetMessage } from './messages.ts';
import {
  attemptAddress,
  type AttemptCounter,
} from '../plugins/attempt-store.ts';
import { secretDigest } from './publication-secrets.ts';
import { createServerLogger } from '../logging.ts';
import { applicationOrigins } from '../served-origins.ts';

/** Base path of every Better Auth route. */
export const authBasePath = '/api/auth';

/**
 * Marker value that the contract fragment writes on every Better Auth
 * operation. `tools/sdk-codegen/src/auth-contract.ts` writes the same value.
 */
export const betterAuthProtocol = 'better-auth';

/**
 * The exact paths that the Better Auth handler serves.
 *
 * `register.ts` mounts this list and nothing else, so a Better Auth release
 * that adds an endpoint cannot widen this deployment's surface without a
 * reviewed change. The contract fragment in `tools/sdk-codegen/src/
 * auth-contract.ts` describes the JSON endpoints of this same list; the two
 * browser navigation endpoints carry no contract operation, because a redirect
 * is not a generated call.
 */
export const oauthMetadataPath =
  '/.well-known/oauth-authorization-server/api/auth';
export const oauthRoutes: readonly {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly oauth: true;
  readonly oauthErrors?: true;
}[] = [
  { method: 'GET', path: oauthMetadataPath, oauth: true },
  {
    method: 'GET',
    path: `${authBasePath}/oauth2/authorize`,
    oauth: true,
    oauthErrors: true,
  },
  {
    method: 'POST',
    path: `${authBasePath}/oauth2/register`,
    oauth: true,
    oauthErrors: true,
  },
  {
    method: 'POST',
    path: `${authBasePath}/oauth2/token`,
    oauth: true,
    oauthErrors: true,
  },
  {
    method: 'POST',
    path: `${authBasePath}/oauth2/revoke`,
    oauth: true,
    oauthErrors: true,
  },
  {
    method: 'POST',
    path: `${authBasePath}/oauth2/consent`,
    oauth: true,
    oauthErrors: true,
  },
  {
    method: 'POST',
    path: `${authBasePath}/oauth2/continue`,
    oauth: true,
    oauthErrors: true,
  },
  {
    method: 'GET',
    path: `${authBasePath}/oauth2/public-client`,
    oauth: true,
    oauthErrors: true,
  },
];

export const oauthCookieWritePaths = [
  `${authBasePath}/oauth2/consent`,
  `${authBasePath}/oauth2/continue`,
] as const;

export const authRoutes: readonly {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly oauth?: boolean;
  readonly oauthErrors?: boolean;
}[] = [
  { method: 'POST', path: `${authBasePath}/sign-in/email` },
  { method: 'POST', path: `${authBasePath}/sign-out` },
  { method: 'GET', path: `${authBasePath}/get-session` },
  { method: 'POST', path: `${authBasePath}/request-password-reset` },
  // The reset link of a message opens the reset page of the application with
  // the token in the fragment, and that page sends it here (record 0141). The
  // library route that answers a link with a redirect is not mounted.
  { method: 'POST', path: `${authBasePath}/reset-password` },
  { method: 'GET', path: `${authBasePath}/error` },
  ...oauthRoutes,
];

/** One record that the protocol library wants to write. */
export type AuthLogRecord = {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
};

/** What the auth instance needs besides the validated configuration. */
export type AuthOptions = {
  /** Test transport, or the pinned safe Node CIMD transport. */
  readonly oauthFetch?: ClientMetadataResourceFetch;
  /** The shared counters and the identity pool, when MCP is enabled. */
  readonly oauth?: {
    readonly attempts: AttemptCounter;
    readonly pool: pg.Pool;
  };
  /**
   * Sends the reset message and the notice after a reset, or `null` for a
   * process that sends no mail. The composition gives the budgeted mailer of
   * `mail.ts`, because a person with no session asks for a reset (record
   * 0141). The mailer asks for the transport at each message, so a transport
   * that an administrator sets later applies with no restart (record 0148).
   */
  readonly mail: Mailer | null;
  /**
   * Whether an identity user may start a session (record 0111).
   *
   * The session create hook asks this before every new session, so a disabled
   * account, a removed account, and an identity user that no account links
   * get none. It is required, so no instance can forget it.
   */
  readonly sessionAllowed: (authUserId: string) => Promise<boolean>;
  /**
   * Permits sign-up through the internal API of the library.
   *
   * The public route stays unmounted. `registration.ts` uses this capability
   * to make the identity user of a new account.
   */
  readonly allowSignUp?: boolean;
  /**
   * Reads one range of the breach service. The configuration decides the
   * default: the service of Have I Been Pwned, or no check when
   * `NOTESAPP_BREACH_CHECK` is `off`. A test passes its own.
   */
  readonly breachQuery?: RangeQuery | null;
  /** Receives the fact that the breach service did not answer. */
  readonly onBreachUnavailable?: () => void;
  /**
   * Receives the protocol library's own log records.
   *
   * The composition points this at the Fastify logger, so
   * `NOTESAPP_LOG_LEVEL` governs it and nothing writes to the console.
   */
  readonly log?: (record: AuthLogRecord) => void;
};

/** The paths of the library that set a new password. */
const newPasswordPaths = new Set([
  '/sign-up/email',
  '/reset-password',
  '/change-password',
]);

/** The code of the refusal of a session for a disabled or removed account. */
const accountUnavailableCode = 'ACCOUNT_UNAVAILABLE';

/** How long the link of a password reset works, in hours (record 0141). */
export const resetLifetimeHours = 1;

/**
 * The path of the page that takes a new password. The router of the web
 * application serves the same path.
 */
export const resetPasswordPath = '/reset-password';

/** The link of one password reset, with the token in the fragment. */
export function resetPasswordLink(origin: string, token: string): string {
  return `${origin}${resetPasswordPath}#${token}`;
}

/** The code of the refusal of a breached password, as the library answers. */
export const breachedPasswordCode = 'PASSWORD_BREACHED';

/** How long the server waits for the breach service, in milliseconds. */
const breachTimeoutMs = 3000;

/**
 * Reads one range of Have I Been Pwned (record 0116).
 *
 * The request carries the first five characters of the SHA-1 digest and
 * nothing else of the password. The padding header makes every answer about
 * the same size, so the size of an answer tells an observer nothing. A slow
 * or failed answer is `null`, which the check reads as no answer.
 */
export const pwnedRangeQuery: RangeQuery = async (prefix) => {
  try {
    const answer = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: { 'add-padding': 'true', 'user-agent': productName },
        signal: AbortSignal.timeout(breachTimeoutMs),
      },
    );
    if (!answer.ok) return null;
    return await answer.text();
  } catch {
    return null;
  }
};

/** The new password of one request of the library, when it carries one. */
function newPasswordOf(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const fields: Record<string, unknown> = Object.fromEntries(
    Object.entries(body),
  );
  const value = fields.newPassword ?? fields.password;
  return typeof value === 'string' ? value : null;
}

/** The protocol library's log level for one configured application level. */
function authLogLevel(level: ServerConfig['logLevel']): {
  disabled: boolean;
  level: 'debug' | 'info' | 'warn' | 'error';
} {
  if (level === 'silent') return { disabled: true, level: 'error' };
  if (level === 'debug') return { disabled: false, level: 'debug' };
  if (level === 'info') return { disabled: false, level: 'info' };
  if (level === 'warn') return { disabled: false, level: 'warn' };
  return { disabled: false, level: 'error' };
}

/**
 * Builds the configured instance over an open pool.
 *
 * The exact option object decides the type of the instance, so the type is
 * inferred from this function rather than written out.
 */
function buildAuth(
  config: ServerConfig,
  options: AuthOptions,
  database: NodePgDatabase,
  pending: Set<Promise<void>>,
  tokenRequest = false,
  seedResources = false,
) {
  const mail = options.mail ?? noMailer;
  // A message that the answer does not wait for. Its failure reaches the
  // operator through the log, with no address and no token. The close of the
  // instance waits for every message that is still on its way, so a stop
  // does not drop one.
  const sendLater = (message: () => MailMessage): void => {
    const settled = (async (): Promise<void> => {
      // With no transport now, the reset sends nothing and logs nothing. The
      // sign-in page offers no reset then, so nobody waits for the message.
      const transport = await mail.current();
      if (transport === null) return;
      await transport.send(message());
    })()
      .catch(() => {
        options.log?.({
          level: 'error',
          message: 'A message of a password reset could not be sent.',
        });
      })
      .finally(() => {
        pending.delete(settled);
      });
    pending.add(settled);
  };
  const breached = breachGuard(config, options);
  const secure = config.origin.startsWith('https://');
  const logging = authLogLevel(config.logLevel);
  const sink = options.log;
  return betterAuth({
    appName: 'notesapp',
    // The protocol library writes to the application log, so its records carry
    // the configured level and nothing reaches the console. The library's own
    // extra arguments are dropped: they can carry an address or a token.
    logger: {
      disabled: logging.disabled || sink === undefined,
      disableColors: true,
      level: logging.level,
      log: (level, message): void => {
        sink?.({ level, message });
      },
    },
    baseURL: config.origin,
    basePath: authBasePath,
    secret: config.authSecret,
    telemetry: { enabled: false },
    // BetterCall prints unexpected faults after its default error hook. Throw
    // them to the OAuth boundary instead. APIError responses and redirects stay intact.
    ...(config.mcpOrigin === null ? {} : { onAPIError: { throw: true } }),
    plugins: [
      registrationContinuationPlugin(),
      ...(config.mcpOrigin === null
        ? []
        : [
            adaptOAuthProvider(
              oauthProvider({
                loginPage: '/oauth/sign-in',
                consentPage: '/oauth/consent',
                disableJwtPlugin: true,
                grantTypes: [...oauthGrantTypes],
                scopes: [...oauthScopes],
                resources: [
                  {
                    identifier: `${config.mcpOrigin}/mcp`,
                    name: productName,
                    accessTokenTtl: oauthAccessLifetimeSeconds,
                    refreshTokenTtl: oauthRefreshLifetimeSeconds,
                    allowedScopes: [...oauthScopes],
                  },
                ],
                // Only the startup seed may replace the stored policy. The
                // serving and request contexts only check an existing row.
                resourceSeedMode: seedResources ? 'overwrite' : 'insertOnly',
                clientRegistrationDefaultResources: [`${config.mcpOrigin}/mcp`],
                enforcePerClientResources: true,
                allowDynamicClientRegistration: true,
                allowUnauthenticatedClientRegistration: true,
                clientRegistrationRequirePKCE: true,
                accessTokenExpiresIn: oauthAccessLifetimeSeconds,
                refreshTokenExpiresIn: oauthRefreshLifetimeSeconds,
                refreshTokenReuseInterval: 0,
                rateLimit: Object.fromEntries(
                  ['token', 'authorize', 'revoke', 'register'].map((name) => [
                    name,
                    {
                      window: config.rateLimit.windowSeconds,
                      max: config.rateLimit.max,
                    },
                  ]),
                ),
                storeTokens: { hash: (token) => secretDigest.digest(token) },
                // A token request reads persisted CIMD metadata. It performs no fetch.
                ...(tokenRequest
                  ? {
                      extensions: [
                        {
                          clientDiscovery: {
                            id: 'cimd',
                            matches: (id: string) => id.startsWith('https://'),
                            resolve: (_ctx, _id, existing) => existing,
                          },
                        },
                      ],
                    }
                  : {}),
              }),
            ),
            ...(tokenRequest
              ? []
              : [
                  cimd({
                    metadataProfile: 'mcp-2026-07-28',
                    fetchClientMetadataResource: boundedOAuthFetch(
                      options.oauthFetch ?? fetchClientMetadataResource,
                    ),
                    isMetadataDocumentUrlAllowed: async (url, ctx) => {
                      if (options.oauth === undefined) return false;
                      const address = ctx.headers?.get('x-forwarded-for') ?? '';
                      const attempt = await options.oauth.attempts.count(
                        `oauth-client:${attemptAddress(address)}`,
                        config.rateLimit.windowSeconds * 1000,
                        Date.now(),
                      );
                      return (
                        attempt.current <= config.rateLimit.max &&
                        (await oauthClientRoom(options.oauth.pool, url))
                      );
                    },
                  }),
                ]),
          ]),
    ],
    // This policy is explicit in every environment. It does not use the
    // protocol library default, which changes with NODE_ENV.
    rateLimit: {
      enabled: true,
      window: config.rateLimit.windowSeconds,
      max: config.rateLimit.max,
      // Every server process of one installation reads one count, and a count
      // survives a restart (record 0121). The table belongs to the identity
      // role, as the other tables of this library do.
      storage: 'database',
      customRules: {
        '/sign-in/*': {
          window: config.rateLimit.windowSeconds,
          max: config.rateLimit.max,
        },
        '/sign-up/*': {
          window: config.rateLimit.windowSeconds,
          max: config.rateLimit.max,
        },
        '/change-password': {
          window: config.rateLimit.windowSeconds,
          max: config.rateLimit.max,
        },
        '/change-email': {
          window: config.rateLimit.windowSeconds,
          max: config.rateLimit.max,
        },
      },
    },
    database: drizzleAdapter(database, {
      provider: 'pg',
      transaction: !tokenRequest,
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
        rateLimit: authRateLimit,
        oauthClient,
        oauthResource,
        oauthClientResource,
        oauthConsent,
        oauthAccessToken,
        oauthRefreshToken,
        oauthClientAssertion,
      },
    }),
    // The served origins are the trusted origins, and nothing else is. Better
    // Auth checks the Origin header and the Fetch Metadata headers of every
    // cookie authenticated write against this list, and it rejects a redirect
    // target outside it. No scheme and no port is added here: the list arrives
    // as the operator wrote it, through `served-origins.ts`.
    trustedOrigins: [...applicationOrigins(config.servedOrigins)],
    emailAndPassword: {
      enabled: true,
      disableSignUp: options.allowSignUp !== true,
      // A sign-up makes the identity user only. The registration path links
      // the account first and starts the session after, so no session exists
      // for an identity user that no account links (record 0108).
      autoSignIn: false,
      minPasswordLength: passwordBounds.minLength,
      maxPasswordLength: passwordBounds.maxLength,
      // A sign-in needs a proved address on every installation (record
      // 0114). The first run and an invitation prove it when they make the
      // account, and an open sign-up proves it through its link.
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: resetLifetimeHours * 60 * 60,
      // The link opens the reset page of the application with the token in
      // the fragment, so no server log and no `Referer` header holds it. The
      // address that the library builds is not used.
      //
      // The answer does not wait for the mail server. Only an address with an
      // account sends a message, so an answer that waited would tell a
      // stranger by its time which address has one.
      sendResetPassword: (data: {
        user: { email: string };
        token: string;
      }): Promise<void> => {
        sendLater(() =>
          passwordResetMessage({
            supportUrl: mail.supportUrl ?? null,
            to: data.user.email,
            origin: config.origin,
            link: resetPasswordLink(config.origin, data.token),
            lifetimeHours: resetLifetimeHours,
          }),
        );
        return Promise.resolve();
      },
      // The owner of the address learns that the password changed, and the
      // library ends every session of the account. A mail server that fails
      // does not undo the reset.
      onPasswordReset: (data: { user: { email: string } }): Promise<void> => {
        const changedAt = new Date().toISOString();
        sendLater(() =>
          passwordChangedMessage({
            changedAt,
            supportUrl: mail.supportUrl ?? null,
            to: data.user.email,
            origin: config.origin,
          }),
        );
        return Promise.resolve();
      },
    },
    hooks: {
      // A new password is checked before the library hashes it. The route of
      // sign-up is not mounted, so this reaches the one registration path,
      // the reset of a password, and a later change of one.
      before: createAuthMiddleware(async (ctx) => {
        if (!newPasswordPaths.has(ctx.path)) return;
        const password = newPasswordOf(ctx.body);
        if (password === null) return;
        if (await breached(password))
          throw APIError.from('BAD_REQUEST', {
            message: 'This password is in a list of leaked passwords.',
            code: breachedPasswordCode,
          });
      }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session: { userId: string }): Promise<void> => {
            if (!(await options.sessionAllowed(session.userId)))
              throw APIError.from('FORBIDDEN', {
                message: 'This account cannot sign in.',
                code: accountUnavailableCode,
              });
          },
        },
      },
    },
    session: {
      expiresIn: config.sessionMaxAgeSeconds,
      // The session is extended while it is used, so an active browser keeps
      // working and an idle one expires.
      updateAge: Math.max(60, Math.floor(config.sessionMaxAgeSeconds / 7)),
    },
    account: {
      accountLinking: {
        // Two identities are never joined because their addresses match. An
        // identity is keyed by its provider and its account only (0135).
        enabled: false,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        trustedProviders: [],
      },
    },
    advanced: {
      // The base URL above is the canonical origin of the deployment, so a
      // forwarded host must never move it. This stays off for that reason.
      trustedProxyHeaders: false,
      // The adapter writes the one client address of this server into
      // `x-forwarded-for`, so the library reads that header and no other, and
      // it needs no proxy list of its own. Decision 0043 holds the rule.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      useSecureCookies: secure,
      cookiePrefix: 'notesapp',
      cookies: { session_token: { name: 'notesapp_session' } },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure,
      },
    },
  });
}

/** The configured Better Auth instance of this deployment. */
export type NotesappAuth = ReturnType<typeof buildAuth>;

/**
 * Whether the breach service lists a new password (record 0116).
 *
 * The before hook of the library asks it for every new password, and an open
 * sign-up asks it before it looks at the address, so a known and a new address
 * get the same answer for a leaked password (record 0114). A service that does
 * not answer lets the password through and tells the operator.
 */
export function breachGuard(
  config: ServerConfig,
  options: Pick<AuthOptions, 'breachQuery' | 'onBreachUnavailable'>,
): (password: string) => Promise<boolean> {
  const query =
    options.breachQuery === undefined
      ? config.breachCheck
        ? pwnedRangeQuery
        : null
      : options.breachQuery;
  return async (password) => {
    if (query === null) return false;
    const outcome = await checkBreach(password, query);
    if (outcome === 'unavailable') options.onBreachUnavailable?.();
    return outcome === 'breached';
  };
}

/** One Better Auth instance and the pool it owns. */
export type AuthHandle = {
  /** The configured instance. */
  readonly auth: NotesappAuth;
  /** Whether the breach service lists a new password. See `breachGuard`. */
  readonly breached: (password: string) => Promise<boolean>;
  /**
   * Waits for every message that is still on its way, then closes the
   * connection pool of the identity tables.
   */
  close(): Promise<void>;
};

/** A startup fault that an operator command can report without driver details. */
class AuthInitializationError extends Error {
  constructor(cause: unknown) {
    super(
      'notesapp: the identity provider could not start. Check that the database accepts connections and that its migrations are complete.',
      { cause },
    );
    this.name = 'AuthInitializationError';
  }
}

/**
 * Builds the configured Better Auth instance.
 *
 * The instance owns its own connection pool, and that pool connects as the
 * identity role. That role holds every right on the four Better Auth tables
 * and no right anywhere else, and the runtime role holds no right on those
 * four tables. A session token, a password hash, a reset token, and a provider
 * token are therefore unreachable from the application's own connection,
 * whatever identity it sets.
 */
export async function createAuth(
  config: ServerConfig,
  options: AuthOptions,
  shared?: pg.Pool,
): Promise<AuthHandle> {
  const pool = shared ?? createAuthPool(config);
  const pending = new Set<Promise<void>>();
  let auth;
  try {
    if (config.mcpOrigin !== null) {
      const coordination = openCoordination(config.databaseUrl, {
        poolSize: 1,
      });
      try {
        await coordination.runSerialized('oauth-resource-seed', async () => {
          // Provider init starts when the instance is built. Build inside the
          // lock and await it here, before another process can read the row.
          const seed = buildAuth(
            config,
            options,
            drizzle({ client: pool }),
            pending,
            false,
            true,
          );
          await seed.$context;
        });
      } finally {
        await coordination.close();
      }
    }
    // The provider also has a lazy seed path. This separate serving context
    // uses insertOnly, so the first resource lookup cannot replace its policy.
    auth = buildAuth(config, options, drizzle({ client: pool }), pending);
    await auth.$context;
  } catch (error) {
    if (shared === undefined) {
      try {
        await pool.end();
      } catch {
        // A failed close must not replace the fault that stopped startup.
      }
    }
    throw new AuthInitializationError(error);
  }
  return {
    auth,
    breached: breachGuard(config, options),
    close: async (): Promise<void> => {
      // A message on its way still reads the budget of its address, so it
      // ends before the stores close.
      await Promise.all([...pending]);
      // A shared pool belongs to the composition that created it.
      if (shared === undefined) await pool.end();
    },
  };
}

/**
 * Opens the connection pool of the identity tables.
 *
 * The composition creates one pool and hands it to every instance it builds,
 * so all auth work uses one connection set.
 */
export function createAuthPool(config: ServerConfig): pg.Pool {
  // The bound of every pool of this server, stated once in
  // `@notesapp/storage-server`. A pool with no bound waits without end.
  return openPool({
    connectionString: config.authDatabaseUrl,
    max: poolSizes.auth,
    connectionTimeoutMillis: defaultConnectionTimeoutMs,
  });
}

/** Header names that never travel to the protocol handler. */
const droppedRequestHeaders = new Set([
  'content-length',
  'connection',
  'forwarded',
]);

/** Whether one header name states a hop in front of this server. */
function isForwardedHeader(name: string): boolean {
  return droppedRequestHeaders.has(name) || name.startsWith('x-forwarded-');
}

/**
 * The headers of a Fastify request as a Web standard `Headers` object.
 *
 * The identity adapter passes them to `auth.api.getSession`, which reads the
 * session cookie from them.
 *
 * Every header that states a hop is removed first, and one `x-forwarded-for`
 * that holds `request.ip` replaces them. The protocol library reads the client
 * address from that header, and the address of this server is the one answer:
 * it is the peer address of the socket, or the address that a configured proxy
 * forwarded. Without this step the library would believe the header of any
 * caller, and the attempt limit of the identity routes would count a new
 * client for each forged address. See
 * [decision 0043](../../../../docs/decisions/0043-one-decider-of-the-client-address.md).
 */
export function toRequestHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (isForwardedHeader(name)) continue;
    if (typeof value === 'string') headers.append(name, value);
    else if (Array.isArray(value))
      for (const entry of value) headers.append(name, entry);
  }
  // A socket that closed before the hook runs carries no address. The library
  // then reads no address at all, which is the safe answer.
  const client = request.ip;
  if (client) headers.set('x-forwarded-for', client);
  return headers;
}

/**
 * Converts a Fastify request into the Web standard request that Better Auth
 * reads.
 *
 * The body arrives as raw bytes, because `register.ts` gives the auth routes
 * their own content type parser. Re-serializing a parsed body would change it,
 * and Better Auth signs and checks some of these bodies.
 */
export function toWebRequest(origin: string, request: FastifyRequest): Request {
  const url = new URL(request.url, origin);
  const headers = toRequestHeaders(request);
  const method = request.method.toUpperCase();
  const body = request.body;
  const carries =
    method !== 'GET' && method !== 'HEAD' && Buffer.isBuffer(body);
  return new Request(url, {
    method,
    headers,
    ...(carries ? { body: new Uint8Array(body) } : {}),
  });
}

/** Header names that Fastify sets itself when the reply is written. */
const droppedResponseHeaders = new Set(['content-length', 'content-encoding']);

/**
 * The stable application error code of a refused protocol request.
 *
 * Better Auth answers a failure with its own JSON body. Other identity routes answer
 * RFC 9457 problem details, so the status becomes one of the
 * documented codes and the library's message is dropped: it can name an
 * address, and no failure answer should confirm that one exists.
 */
export function authProblemCode(
  status: number,
  libraryCode: string | null = null,
): ProblemCode {
  // The one refusal of the library whose cause the person can act on: the new
  // password is in a list of leaked passwords (record 0116).
  if (libraryCode === breachedPasswordCode) return 'password_breached';
  // Two refusals of a sign-in that come after the password matched, so the
  // person who reads them already holds the password. Each one names what the
  // person can do: open the link of the sign-up, or ask an administrator.
  if (libraryCode === 'EMAIL_NOT_VERIFIED') return 'address_unverified';
  if (libraryCode === accountUnavailableCode) return 'account_unavailable';
  if (libraryCode === 'invalid_signature') return 'oauth_request_invalid';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 413) return 'payload_too_large';
  if (status === 415) return 'unsupported_media_type';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'internal_error';
  return 'invalid_request';
}

/**
 * Removes the session token from an answer of the protocol library.
 *
 * Better Auth returns the raw session token in two places: at the top level of
 * a sign-in answer, and inside the session object of a get-session answer. The
 * browser already holds that value in an HttpOnly cookie, so handing the same
 * secret to page script would only widen where it can leak. The adapter
 * applies this to every JSON answer of every auth route, so a library release
 * that adds a token to one more answer cannot widen the surface. The contract
 * declares both answers without a token, and this is what makes that
 * declaration true.
 */
export function withoutSessionToken(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return value;
  const record: Record<string, unknown> = Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== 'token'),
  );
  const session = record.session;
  if (session === null || typeof session !== 'object' || Array.isArray(session))
    return record;
  const stripped: Record<string, unknown> = Object.fromEntries(
    Object.entries(session).filter(([name]) => name !== 'token'),
  );
  return { ...record, session: stripped };
}

/** The `code` member of a refusal of the library, or `null`. */
function libraryCodeOf(text: string): string | null {
  const refusal = parseJson(text);
  if (
    !refusal.ok ||
    refusal.value === null ||
    typeof refusal.value !== 'object'
  )
    return null;
  const fields: Record<string, unknown> = Object.fromEntries(
    Object.entries(refusal.value),
  );
  if (typeof fields.code === 'string') return fields.code;
  return fields.error === 'invalid_signature' ? 'invalid_signature' : null;
}

/** Reads a JSON answer without trusting that it is JSON. */
function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text.trim() === '') return { ok: true, value: undefined };
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

/**
 * The protocol adapter that `register.ts` mounts.
 *
 * It serves exactly the routes of `authRoutes`, and startup fails when a
 * contract operation marked `better-auth` is not one of them. The answer is
 * returned rather than written, so the boundary can validate it against the
 * declared response schema first.
 */
export function createAuthProtocol(
  config: ServerConfig,
  auth: NotesappAuth,
  /**
   * Runs before the library and refuses a request by throwing, for example
   * the change of a profile of a locked account (record 0201). A composition
   * with no account store leaves it out.
   */
  before?: (request: FastifyRequest) => Promise<void>,
  oauth?: { readonly pool: pg.Pool; readonly options: AuthOptions },
): ProtocolAdapter {
  return {
    protocol: betterAuthProtocol,
    routes: authRoutes,
    enabled: (route) => route.oauth !== true || config.mcpOrigin !== null,
    handle: async (request): Promise<ProtocolResult> => {
      const path = request.url.split('?')[0] ?? '';
      const isOAuth = oauthRoutes.some((route) => route.path === path);
      // OAuth token and revocation requests check their stored account in the
      // request transaction. Only consent and continue use the cookie write gate.
      if (!isOAuth || oauthCookieWritePaths.some((known) => known === path))
        await before?.(request);
      const webRequest = toWebRequest(config.origin, request);
      let response: Response;
      if (isOAuth) {
        const guarded = oauthRequestRefusal(config, request);
        if (guarded !== null) return guarded;
        if (path.endsWith('/register')) {
          if (oauth === undefined)
            return oauthFailure('temporarily_unavailable', 503);
          const attempt = await oauth.options.oauth?.attempts.count(
            `oauth-client:${attemptAddress(request.ip)}`,
            config.rateLimit.windowSeconds * 1000,
            Date.now(),
          );
          if (attempt === undefined || attempt.current > config.rateLimit.max)
            return oauthFailure('temporarily_unavailable', 429);
          if (!(await oauthClientRoom(oauth.pool)))
            return oauthFailure('temporarily_unavailable', 503);
        }
        try {
          const consentFields = path.endsWith('/consent')
            ? oauthRequestFields(request)
            : null;
          const session =
            consentFields === null
              ? null
              : await auth.api.getSession({ headers: webRequest.headers });
          const consentClient =
            consentFields === null
              ? null
              : new URLSearchParams(consentFields.get('oauth_query') ?? '').get(
                  'client_id',
                );
          if (
            consentFields !== null &&
            session !== null &&
            consentClient !== null
          ) {
            if (oauth === undefined)
              return oauthFailure('temporarily_unavailable', 503);
            response = await oauthConsentTransaction(
              oauth.pool,
              consentClient,
              session.user.id,
              async (client) => {
                // Use the provider check before the count, then let its handler check again.
                if (
                  !(await verifyOAuthQueryParams(
                    consentFields.get('oauth_query') ?? '',
                    config.authSecret,
                  ))
                )
                  return new Response(
                    JSON.stringify({ error: 'invalid_request' }),
                    {
                      status: 400,
                      headers: { 'content-type': 'application/json' },
                    },
                  );
                if (!(await oauthConsentClientExists(client, consentClient)))
                  return new Response(
                    JSON.stringify({ error: 'invalid_client' }),
                    {
                      status: 400,
                      headers: { 'content-type': 'application/json' },
                    },
                  );
                if (
                  consentFields.get('accept') === 'true' &&
                  !(await oauthGrantRoom(
                    client,
                    consentClient,
                    session.user.id,
                  ))
                )
                  return new Response(
                    JSON.stringify({
                      error: 'invalid_request',
                      error_description: 'oauth_grant_limit',
                    }),
                    {
                      status: 400,
                      headers: { 'content-type': 'application/json' },
                    },
                  );
                const scoped = buildAuth(
                  config,
                  oauth.options,
                  drizzle({ client }),
                  new Set(),
                  true,
                );
                await scoped.$context;
                return scoped.handler(webRequest);
              },
              (answer) => answer.status < 400,
            );
          } else if (path.endsWith('/token') || path.endsWith('/revoke')) {
            if (oauth === undefined)
              return oauthFailure('temporarily_unavailable', 503);
            const fields = oauthRequestFields(request);
            const credential = oauthRequestCredential(path, fields);
            const token = credential?.token;
            response = await oauthRequestTransaction(
              oauth.pool,
              credential === null
                ? null
                : {
                    digest: secretDigest.digest(credential.token),
                    kind: credential.kind,
                    ...(fields.get('token_type_hint') === null
                      ? {}
                      : { hint: fields.get('token_type_hint') ?? '' }),
                  },
              async (client, allowed) => {
                if (path.endsWith('/token') && !allowed)
                  return new Response(
                    JSON.stringify({ error: 'invalid_grant' }),
                    {
                      status: 400,
                      headers: { 'content-type': 'application/json' },
                    },
                  );
                const scoped = buildAuth(
                  config,
                  oauth.options,
                  drizzle({ client }),
                  new Set(),
                  true,
                );
                await scoped.$context;
                if (path.endsWith('/revoke')) {
                  // The provider authenticates against a token that has no row.
                  // Only the narrow storage write below can revoke a credential.
                  const authenticationRequest =
                    oauthRevocationAuthenticationRequest(webRequest, fields);
                  const authenticated = await scoped.handler(
                    authenticationRequest,
                  );
                  const parsed = parseJson(await authenticated.clone().text());
                  const failure: unknown =
                    parsed.ok &&
                    parsed.value !== null &&
                    typeof parsed.value === 'object'
                      ? Object.fromEntries(Object.entries(parsed.value)).error
                      : undefined;
                  if (
                    oauthRevocationAuthenticationSucceeded(
                      authenticated.status,
                      parsed.ok ? parsed.value : undefined,
                    )
                  ) {
                    const authenticatedClient =
                      basicClientId(webRequest.headers.get('authorization')) ??
                      fields.get('client_id');
                    if (
                      authenticatedClient === null ||
                      authenticatedClient === undefined
                    )
                      throw new Error('The provider accepted no client.');
                    if (token !== null && token !== undefined)
                      await revokeOAuthToken(
                        client,
                        secretDigest.digest(token),
                        authenticatedClient,
                      );
                    return new Response(null, { status: 200 });
                  }
                  if (
                    authenticated.status === 429 ||
                    ['invalid_client', 'invalid_request'].some(
                      (error) => error === failure,
                    )
                  )
                    return authenticated;
                  throw new Error(
                    'The OAuth revocation authentication failed unexpectedly.',
                  );
                }
                const replay =
                  path.endsWith('/token') &&
                  fields.get('grant_type') === 'refresh_token' &&
                  token !== null &&
                  token !== undefined
                    ? await oauthReplayCandidate(
                        client,
                        secretDigest.digest(token),
                      )
                    : null;
                const answer =
                  fields.get('grant_type') === 'refresh_token' &&
                  token !== null &&
                  token !== undefined
                    ? await oauthRefreshRequest(
                        client,
                        secretDigest.digest(token),
                        () => scoped.handler(webRequest),
                        async () => {
                          // Match the provider token bucket. Its own increment is
                          // rolled back with the credential writes on this path.
                          const attempt =
                            await oauth.options.oauth?.attempts.count(
                              createRateLimitKey(
                                getIP(webRequest, scoped.options) ??
                                  'no-trusted-ip',
                                '/oauth2/token',
                              ),
                              config.rateLimit.windowSeconds * 1000,
                              Date.now(),
                            );
                          return attempt === undefined ||
                            attempt.current > config.rateLimit.max
                            ? new Response(
                                JSON.stringify({
                                  error: 'temporarily_unavailable',
                                }),
                                {
                                  status: attempt === undefined ? 503 : 429,
                                  headers: {
                                    'content-type': 'application/json',
                                  },
                                },
                              )
                            : null;
                        },
                      )
                    : await scoped.handler(webRequest);
                // For an unexpired consumed token, this refusal comes after the
                // provider authenticates its client. Expiry and other refusals do not revoke.
                if (
                  replay !== null &&
                  replay.expires_at.getTime() > Date.now() &&
                  answer.status === 400
                ) {
                  const refusal = parseJson(await answer.clone().text());
                  if (
                    refusal.ok &&
                    refusal.value !== null &&
                    typeof refusal.value === 'object'
                  ) {
                    const value = Object.fromEntries(
                      Object.entries(refusal.value),
                    );
                    if (
                      value.error === 'invalid_grant' &&
                      value.error_description === 'invalid refresh token'
                    ) {
                      // A wrong client has the same refusal but keeps the consent.
                      const presented =
                        basicClientId(
                          webRequest.headers.get('authorization'),
                        ) ?? fields.get('client_id');
                      if (presented === replay.client_id)
                        await revokeOAuthReplay(client, replay);
                    }
                  }
                }
                return answer;
              },
              (answer) => answer.status < 500,
            );
          } else
            response = await auth.handler(
              path.endsWith('/register')
                ? publicOAuthRegistrationRequest(webRequest)
                : webRequest,
            );
        } catch (error) {
          if (isOAuthGrantLimit(error))
            return {
              ...oauthFailure('invalid_request'),
              body: {
                error: 'invalid_request',
                error_description: 'oauth_grant_limit',
              },
            };
          if (path === oauthMetadataPath) throw error;
          createServerLogger(request.log)
            .bind({ requestId: request.id })
            .emit('http.request.failed', {
              operationId:
                request.routeOptions.config.operationId ?? 'oauth2Authorize',
              errorName: isOperationalError(error) ? error.kind : 'unexpected',
            });
          const unavailable =
            isOperationalError(error) &&
            (error.kind === 'timeout' || error.kind === 'unavailable');
          return oauthFailure(
            unavailable ? 'temporarily_unavailable' : 'server_error',
            unavailable ? 503 : 500,
          );
        }
      } else response = await auth.handler(webRequest);
      const headers: [string, string][] = [];
      for (const [name, value] of response.headers) {
        if (name.toLowerCase() === 'set-cookie') continue;
        if (droppedResponseHeaders.has(name.toLowerCase())) continue;
        headers.push([name, value]);
      }
      const cookies = response.headers.getSetCookie();
      const mediaType = (response.headers.get('content-type') ?? '')
        .split(';')[0]
        ?.trim()
        .toLowerCase();
      const text = await response.text();
      if (isOAuth && path.endsWith('/revoke') && response.status === 200)
        return {
          status: 200,
          mediaType: '',
          headers,
          cookies,
          body: undefined,
          bytes: null,
        };
      if (
        isOAuth &&
        path !== oauthMetadataPath &&
        mediaType === 'application/json'
      ) {
        if (response.status === 429)
          return {
            ...oauthFailure('temporarily_unavailable', 429),
            headers: headers.filter(
              ([name]) => name.toLowerCase() !== 'content-type',
            ),
            cookies,
          };
        const parsed = parseJson(text);
        if (!parsed.ok)
          throw new Error('The OAuth provider returned invalid JSON.');
        // The provider signature refusal is private. RFC 6749 calls it invalid_request.
        if (
          path.endsWith('/consent') &&
          response.status >= 400 &&
          parsed.value !== null &&
          typeof parsed.value === 'object' &&
          Reflect.get(parsed.value, 'error') === 'invalid_signature'
        )
          return {
            ...oauthFailure('invalid_request'),
            headers: headers.filter(
              ([name]) => name.toLowerCase() !== 'content-type',
            ),
            cookies,
          };

        if (
          response.status >= 400 &&
          parsed.value !== null &&
          typeof parsed.value === 'object' &&
          typeof Reflect.get(parsed.value, 'error') !== 'string'
        )
          return {
            ...oauthFailure(
              response.status >= 500
                ? 'server_error'
                : response.status === 401 || response.status === 403
                  ? 'access_denied'
                  : 'invalid_request',
              response.status,
            ),
            headers: headers.filter(
              ([name]) => name.toLowerCase() !== 'content-type',
            ),
            cookies,
          };
        if (
          path.endsWith('/token') &&
          response.status === 401 &&
          parsed.value !== null &&
          typeof parsed.value === 'object'
        ) {
          const fields = Object.fromEntries(Object.entries(parsed.value));
          if (
            fields.error === 'invalid_request' &&
            fields.error_description === 'code verification failed'
          )
            return {
              ...oauthFailure('invalid_grant'),
              headers: headers.filter(
                ([name]) => name.toLowerCase() !== 'content-type',
              ),
              cookies,
            };
        }
        return {
          status: response.status,
          mediaType: 'application/json',
          headers: headers.filter(
            ([name]) => name.toLowerCase() !== 'content-type',
          ),
          cookies,
          body:
            path === oauthMetadataPath &&
            parsed.value !== null &&
            typeof parsed.value === 'object'
              ? servedOAuthMetadata(parsed.value)
              : parsed.value,
          bytes: null,
        };
      }
      if (response.status >= 400) {
        const libraryCode = libraryCodeOf(text);
        const code = authProblemCode(response.status, libraryCode);
        return {
          status: response.status,
          mediaType: problemMediaType,
          headers: headers.filter(
            ([name]) => name.toLowerCase() !== 'content-type',
          ),
          cookies,
          body: createProblem({
            code,
            status: response.status,
            detail:
              code === 'oauth_request_invalid'
                ? 'This access request is not valid. Go back to the client and connect again.'
                : 'The authentication endpoint refused the request.',
            instance: request.url.split('?')[0] ?? request.url,
            requestId: request.id,
          }),
          bytes: null,
        };
      }
      if (mediaType !== 'application/json') {
        // A redirect and the reference page carry no JSON, so they travel
        // unchanged.
        return {
          status: response.status,
          mediaType:
            mediaType === undefined || mediaType === '' ? '' : mediaType,
          headers,
          cookies,
          body: undefined,
          bytes: Buffer.from(text, 'utf8'),
        };
      }
      const parsed = parseJson(text);
      if (!parsed.ok)
        throw new Error('notesapp: the auth endpoint answered invalid JSON.');
      return {
        status: response.status,
        mediaType: 'application/json',
        headers: headers.filter(
          ([name]) => name.toLowerCase() !== 'content-type',
        ),
        cookies,
        body:
          path === oauthMetadataPath &&
          parsed.value !== null &&
          typeof parsed.value === 'object'
            ? servedOAuthMetadata(parsed.value)
            : withoutSessionToken(parsed.value),
        bytes: null,
      };
    },
  };
}

/** Bounds DNS, the connection and the response, including a stalled DNS lookup. */
export function boundedOAuthFetch(
  transport: ClientMetadataResourceFetch,
): ClientMetadataResourceFetch {
  return async (input, init) => {
    const signal = AbortSignal.any([
      AbortSignal.timeout(3000),
      ...(init?.signal ? [init.signal] : []),
    ]);
    const failed = new Promise<never>((_resolve, reject) => {
      if (signal.aborted)
        reject(new Error('The client metadata request stopped.'));
      else
        signal.addEventListener(
          'abort',
          () => reject(new Error('The client metadata request stopped.')),
          { once: true },
        );
    });
    const fetchAndCheck = async (): Promise<Response> => {
      const response = await transport(input, { ...init, signal });
      if (response.status !== 200 || response.body === null) return response;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 50 * 1024)
            throw new Error('The client metadata document is too large.');
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = Buffer.concat(chunks);
      // This field is deployment policy. The CIMD plugin still validates the document.
      const parsed = parseJson(bytes.toString('utf8'));
      if (
        parsed.ok &&
        parsed.value !== null &&
        typeof parsed.value === 'object'
      ) {
        const fields = Object.fromEntries(Object.entries(parsed.value));
        if (
          fields.token_endpoint_auth_method !== undefined &&
          fields.token_endpoint_auth_method !== 'none'
        )
          throw new Error('The client authentication method is not supported.');
      }
      return new Response(bytes, {
        status: response.status,
        headers: response.headers,
      });
    };
    return Promise.race([fetchAndCheck(), failed]);
  };
}

/** Reads the identifier only after the provider has authenticated these credentials. */
function basicClientId(value: string | null): string | null {
  if (value === null || !/^Basic /i.test(value)) return null;
  try {
    return decodeURIComponent(
      Buffer.from(value.slice(6), 'base64').toString('utf8').split(':')[0] ??
        '',
    );
  } catch {
    return null;
  }
}

/** A content-free OAuth refusal. A credential never enters its text. */
export function oauthFailure(error: string, status = 400): ProtocolResult {
  return {
    status,
    mediaType: 'application/json',
    headers: [
      ['cache-control', 'no-store'],
      ['pragma', 'no-cache'],
    ],
    cookies: [],
    body: { error },
    bytes: null,
  };
}

/** Selects the same grant credential as the provider, before its digest lookup. */
export function oauthRequestCredential(
  path: string,
  fields: URLSearchParams,
): {
  readonly token: string;
  readonly kind: 'authorization_code' | 'token';
} | null {
  if (path === '/api/auth/oauth2/revoke') {
    const token = fields.get('token');
    return token === null ? null : { token, kind: 'token' };
  }
  if (path !== '/api/auth/oauth2/token') return null;
  const grant = fields.get('grant_type');
  if (grant === 'authorization_code') {
    const token = fields.get('code');
    return token === null ? null : { token, kind: 'authorization_code' };
  }
  if (grant === 'refresh_token') {
    const token = fields.get('refresh_token');
    return token === null ? null : { token, kind: 'token' };
  }
  return null;
}

/** Parses one supported protocol request without changing its bytes. */
function oauthRequestFields(request: FastifyRequest): URLSearchParams {
  const path = request.url.split('?')[0] ?? '';
  if (request.method === 'GET')
    return new URL(request.url, 'http://request.invalid').searchParams;
  if (!Buffer.isBuffer(request.body)) return new URLSearchParams();
  if (path.endsWith('/token') || path.endsWith('/revoke'))
    return new URLSearchParams(request.body.toString('utf8'));
  const parsed = parseJson(request.body.toString('utf8'));
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== 'object')
    return new URLSearchParams();
  const fields = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed.value))
    if (typeof value === 'string') fields.set(key, value);
  return fields;
}

/** The deployment accepts this MCP resource, these grants, and S256 only. */
function oauthRequestRefusal(
  config: ServerConfig,
  request: FastifyRequest,
): ProtocolResult | null {
  const path = request.url.split('?')[0] ?? '';
  const fields = oauthRequestFields(request);
  if (path.endsWith('/token')) {
    if (
      (fields.get('grant_type') === 'authorization_code' &&
        fields.has('refresh_token')) ||
      (fields.get('grant_type') === 'refresh_token' && fields.has('code'))
    )
      return oauthFailure('invalid_request');
    if (fields.has('client_assertion') || fields.has('client_assertion_type'))
      return oauthFailure('invalid_client');
    if (!oauthGrantTypes.some((grant) => grant === fields.get('grant_type')))
      return oauthFailure('unsupported_grant_type');
    if (
      fields.get('resource') !== `${config.mcpOrigin}/mcp` ||
      fields.getAll('resource').length !== 1
    )
      return oauthFailure('invalid_target');
    if (fields.has('scope') && !oauthScopeAllowed(fields.get('scope') ?? ''))
      return oauthFailure('invalid_scope');
  }
  if (path.endsWith('/register') && request.headers.authorization !== undefined)
    return oauthFailure('invalid_request');
  if (
    path.endsWith('/register') &&
    fields.has('token_endpoint_auth_method') &&
    !['none', 'client_secret_basic', 'client_secret_post'].includes(
      fields.get('token_endpoint_auth_method') ?? '',
    )
  )
    return oauthFailure('invalid_client_metadata');
  if (path.endsWith('/authorize')) {
    if (
      fields.get('resource') !== `${config.mcpOrigin}/mcp` ||
      fields.getAll('resource').length !== 1
    )
      return oauthFailure('invalid_target');
    if (
      fields.get('code_challenge_method') !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(fields.get('code_challenge') ?? '')
    )
      return oauthFailure('invalid_request');
    if (!oauthScopeAllowed(fields.get('scope') ?? ''))
      return oauthFailure('invalid_scope');
  }
  if (path.endsWith('/consent') || path.endsWith('/continue')) {
    const query = new URLSearchParams(fields.get('oauth_query') ?? '');
    if (
      query.get('resource') !== `${config.mcpOrigin}/mcp` ||
      query.getAll('resource').length !== 1
    )
      return oauthFailure('invalid_target');
    if (query.get('code_challenge_method') !== 'S256')
      return oauthFailure('invalid_request');
    if (
      fields.has('scope') &&
      !oauthConsentScopeAllowed(
        query.get('scope') ?? '',
        fields.get('scope') ?? '',
      )
    )
      return oauthFailure('invalid_scope');
  }
  return null;
}

// NUL is outside the OAuth prompt token grammar. The provider must reject
// this value through its own client and redirect validation.
const refusedOAuthCreatePrompt = 'tidy\u0000unsupported-create';

/**
 * Mirror parsePrompt in @better-auth/oauth-provider 1.7.7,
 * utils-D6Hp4Qd_.mjs:757-761: split on space, trim each token, then compare
 * the whole token. A provider update must re-read that pinned rule.
 */
export function oauthCreateRequested(prompt: unknown): boolean {
  return (
    typeof prompt === 'string' &&
    prompt.split(' ').some((token) => token.trim() === 'create')
  );
}

/** Canonical tokens let the provider remove each completed step once. */
export function oauthNormalizedPrompt(prompt: string): string | undefined {
  const tokens = prompt
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
  const normalized = [...new Set(tokens)].join(' ');
  return normalized === '' ? undefined : normalized;
}

/**
 * oauth2Authorize has an items?: undefined schema union that cannot satisfy
 * exactOptionalPropertyTypes. The contract owns this documentation. Remove
 * the metadata adjustment when the upstream endpoint type can be used directly.
 * The adapter also refuses account creation before an OAuth page opens.
 */
export function adaptOAuthProvider(
  provider: ReturnType<typeof oauthProvider>,
): BetterAuthPlugin {
  const original = provider.endpoints.oauth2Authorize;
  const { parameters: _parameters, ...openapi } =
    original.options.metadata.openapi;
  const options = {
    ...original.options,
    metadata: { ...original.options.metadata, openapi },
  };
  const authorize = Object.assign(
    async (...args: Parameters<typeof original>) => {
      const [input] = args;
      const prompt: unknown = input?.query?.prompt;
      if (input === undefined || typeof prompt !== 'string')
        return original(...args);
      const query: Record<string, unknown> = { ...input.query };
      const normalized = oauthNormalizedPrompt(prompt);
      if (normalized === undefined) delete query.prompt;
      else query.prompt = normalized;
      const normalizedInput = { ...input, body: input.body ?? {}, query };
      if (!oauthCreateRequested(normalized)) return original(normalizedInput);
      const response = await original({
        ...normalizedInput,
        query: { ...query, prompt: refusedOAuthCreatePrompt },
        asResponse: true,
      });
      const neutralAddress = (raw: string): string => {
        const url = new URL(raw);
        for (const fields of [
          url.searchParams,
          new URLSearchParams(url.hash.slice(1)),
        ]) {
          if (
            fields.get('error_description')?.includes(refusedOAuthCreatePrompt)
          )
            fields.set(
              'error_description',
              'Account creation is not supported.',
            );
          if (fields !== url.searchParams && url.hash !== '')
            url.hash = fields.toString();
        }
        return url.href;
      };
      const location = response.headers.get('location');
      if (location !== null) {
        const headers = new Headers(response.headers);
        headers.set('location', neutralAddress(location));
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }
      const result = parseJson(await response.clone().text());
      if (
        result.ok &&
        result.value !== null &&
        typeof result.value === 'object'
      ) {
        const body = Object.fromEntries(Object.entries(result.value));
        if (body.redirect === true && typeof body.url === 'string')
          return new Response(
            JSON.stringify({ ...body, url: neutralAddress(body.url) }),
            { status: response.status, headers: response.headers },
          );
      }
      return response;
    },
    { ...original, path: original.path, options },
  );
  return {
    ...provider,
    endpoints: { ...provider.endpoints, oauth2Authorize: authorize },
  };
}

/** Metadata contains only the mounted and enforced OAuth surface. */
function servedOAuthMetadata(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([name]) =>
          !name.startsWith('introspection_endpoint') &&
          ![
            'userinfo_endpoint',
            'jwks_uri',
            'end_session_endpoint',
            'token_endpoint_auth_signing_alg_values_supported',
            'revocation_endpoint_auth_signing_alg_values_supported',
          ].includes(name),
      )
      .map(([name, field]) => [
        name,
        name.endsWith('_auth_methods_supported') && Array.isArray(field)
          ? field.filter((method: unknown) => method !== 'private_key_jwt')
          : field,
      ]),
  );
}

/** No real token or hint reaches the provider on revocation. */
export function oauthRevocationAuthenticationRequest(
  original: Request,
  fields: URLSearchParams,
): Request {
  const authentication = new URLSearchParams(fields);
  authentication.set('token', randomBytes(32).toString('base64url'));
  authentication.delete('token_type_hint');
  return new Request(original.url, {
    method: 'POST',
    headers: original.headers,
    body: authentication.toString(),
  });
}

/** Pin the provider outcomes that occur only after client authentication. */
export function oauthRevocationAuthenticationSucceeded(
  status: number,
  value: unknown,
): boolean {
  if (status === 200) return true;
  if (status !== 400 || value === null || typeof value !== 'object')
    return false;
  const fields = Object.fromEntries(Object.entries(value));
  return (
    fields.error === 'unsupported_token_type' ||
    (fields.error === 'invalid_request' &&
      fields.error_description === 'token not found')
  );
}

/** DCR is the unowned installation registry. A browser session grants it no owner. */
export function publicOAuthRegistrationRequest(original: Request): Request {
  const headers = new Headers(original.headers);
  headers.delete('cookie');
  return new Request(original, { headers });
}
