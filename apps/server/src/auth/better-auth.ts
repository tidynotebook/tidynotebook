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
import { Buffer } from 'node:buffer';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { passwordBounds } from '@notesapp/core';
import { checkBreach, type RangeQuery } from './breach-check.ts';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyRequest } from 'fastify';
import pg from 'pg';
import {
  authAccount,
  authRateLimit,
  authSession,
  authUser,
  authVerification,
  defaultConnectionTimeoutMs,
  openPool,
} from '@notesapp/storage-server';
import type { ServerConfig } from '../config.ts';
import type { ProblemCode } from '../plugins/problem.ts';
import { createProblem, problemMediaType } from '../plugins/problem.ts';
import type { ProtocolAdapter, ProtocolResult } from '../plugins/register.ts';
import type { MailTransport } from './mail.ts';
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
export const authRoutes: readonly {
  readonly method: 'GET' | 'POST';
  readonly path: string;
}[] = [
  { method: 'POST', path: `${authBasePath}/sign-in/email` },
  { method: 'POST', path: `${authBasePath}/sign-out` },
  { method: 'GET', path: `${authBasePath}/get-session` },
  { method: 'POST', path: `${authBasePath}/request-password-reset` },
  { method: 'POST', path: `${authBasePath}/reset-password` },
  // Browser navigation. The reset link opens here before the application.
  { method: 'GET', path: `${authBasePath}/reset-password/:token` },
  { method: 'GET', path: `${authBasePath}/error` },
];

/** One record that the protocol library wants to write. */
export type AuthLogRecord = {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
};

/** What the auth instance needs besides the validated configuration. */
export type AuthOptions = {
  /** Sends the password recovery message, or `null` when none is configured. */
  readonly mail: MailTransport | null;
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
        headers: { 'add-padding': 'true', 'user-agent': 'NotesApp' },
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
  database: ReturnType<typeof drizzle>,
) {
  const mail = options.mail;
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
      transaction: true,
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
        rateLimit: authRateLimit,
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
      resetPasswordTokenExpiresIn: 60 * 60,
      ...(mail === null
        ? {}
        : {
            sendResetPassword: async (data: {
              user: { email: string };
              url: string;
            }): Promise<void> => {
              await mail.send({
                to: data.user.email,
                subject: 'Reset your notesapp password',
                text: [
                  'Open this link to choose a new password.',
                  data.url,
                  'The link expires in one hour. Ignore this message if you',
                  'did not ask for a new password.',
                ].join('\n'),
              });
            },
          }),
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
                code: 'ACCOUNT_UNAVAILABLE',
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
        // Two identities are never joined because their addresses match. A
        // provider identity is keyed by issuer and subject only.
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
  /** Closes the connection pool of the identity tables. */
  close(): Promise<void>;
};

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
export function createAuth(
  config: ServerConfig,
  options: AuthOptions,
  shared?: pg.Pool,
): AuthHandle {
  const pool = shared ?? createAuthPool(config);
  return {
    auth: buildAuth(config, options, drizzle({ client: pool })),
    breached: breachGuard(config, options),
    close: async (): Promise<void> => {
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
    max: 5,
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
 * Better Auth answers a failure with its own JSON body. The deployment answers
 * RFC 9457 problem details everywhere, so the status becomes one of the
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
  return typeof fields.code === 'string' ? fields.code : null;
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
): ProtocolAdapter {
  return {
    protocol: betterAuthProtocol,
    routes: authRoutes,
    handle: async (request): Promise<ProtocolResult> => {
      const response = await auth.handler(toWebRequest(config.origin, request));
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
      if (response.status >= 400) {
        const libraryCode = libraryCodeOf(text);
        return {
          status: response.status,
          mediaType: problemMediaType,
          headers: headers.filter(
            ([name]) => name.toLowerCase() !== 'content-type',
          ),
          cookies,
          body: createProblem({
            code: authProblemCode(response.status, libraryCode),
            status: response.status,
            detail: 'The authentication endpoint refused the request.',
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
        body: withoutSessionToken(parsed.value),
        bytes: null,
      };
    },
  };
}
