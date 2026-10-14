/**
 * Handwritten configuration of the generated HTTP client.
 *
 * This file may set the base URL, cookie behaviour, the bearer token provider,
 * and shared error normalization. It never builds a URL, serializes a request,
 * or calls a transport. The generated client owns all of that.
 */
import { client } from './generated/client.gen.ts';
import type {
  ProblemDetails,
  OAuthError,
  McpError,
} from './generated/types.gen.ts';
import {
  ResponseReadError,
  responseWithProgress,
} from './response-progress.ts';

/** Returns the current bearer token, or undefined for a cookie session. */
export type TokenProvider = () => Promise<string | undefined>;

let tokenProvider: TokenProvider | undefined;
let interceptorsInstalled = false;

/** Reads one property of an unknown value without asserting its shape. */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value))[key];
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  if (Array.isArray(value)) return false;
  return (
    typeof readProperty(value, 'type') === 'string' &&
    typeof readProperty(value, 'title') === 'string' &&
    typeof readProperty(value, 'status') === 'number' &&
    typeof readProperty(value, 'code') === 'string' &&
    typeof readProperty(value, 'requestId') === 'string'
  );
}

/**
 * Converts any failure into problem details, so a caller always branches on a
 * stable `code` instead of on a transport specific error shape.
 */
export function normalizeProblem(
  error: unknown,
  response: Response | undefined,
): ProblemDetails {
  if (isProblemDetails(error)) return error;
  const aborted = error instanceof Error && error.name === 'AbortError';
  // Headers can say 200 while the body never finishes. That remains a
  // transport failure, rather than a permanent successful-status refusal.
  const status =
    error instanceof ResponseReadError ? 0 : (response?.status ?? 0);
  return {
    type: 'about:blank',
    title: aborted
      ? 'The caller cancelled the request.'
      : (response?.statusText ?? 'The request did not reach the service.'),
    status,
    code: aborted
      ? 'request_aborted'
      : status === 0
        ? 'transport_failed'
        : 'unexpected_response',
    requestId: response?.headers.get('x-request-id') ?? '',
  };
}

/**
 * Points the generated client at one origin.
 *
 * The interceptors are installed once. Later calls only replace the base URL
 * and the token provider, so repeated configuration cannot stack handlers.
 */
export function configureClient(
  baseUrl: string,
  token: TokenProvider | undefined,
): void {
  tokenProvider = token;
  client.setConfig({ baseUrl, credentials: 'include' });
  if (interceptorsInstalled) return;
  interceptorsInstalled = true;
  client.interceptors.response.use((response, _request, options) =>
    responseWithProgress(response, options.signal),
  );
  client.interceptors.request.use(async (request) => {
    const value = await tokenProvider?.();
    if (value !== undefined && value !== '')
      request.headers.set('authorization', `Bearer ${value}`);
    return request;
  });
  client.interceptors.error.use((error, response, request) =>
    normalizeProtocolError(error, response, request),
  );
}

/** The declared RFC errors, including the extensions used by this server. */
export const oauthErrorCodes = [
  'invalid_token',
  'insufficient_scope',
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'unsupported_response_type',
  'server_error',
  'temporarily_unavailable',
  'unsupported_token_type',
  'invalid_target',
  'invalid_redirect_uri',
  'invalid_client_metadata',
  'not_found',
] as const satisfies readonly OAuthError['error'][];

/** Parse the closed OAuth error before it can reach a typed generated caller. */
function isOAuthError(value: unknown): value is OAuthError {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const fields = Object.fromEntries(Object.entries(value));
  if (!oauthErrorCodes.some((code) => code === fields.error)) return false;
  return Object.entries(fields).every(
    ([name, field]) =>
      ['error', 'error_description', 'error_uri'].includes(name) &&
      typeof field === 'string' &&
      field.length <= 4096,
  );
}

const oauthPathPrefixes = ['/api/auth/oauth2/', '/mcp'] as const;
const mcpPathPrefixes = ['/mcp'] as const;

/** Parse the closed JSON-RPC refusal before a generated caller receives it. */
function isMcpError(value: unknown): value is McpError {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const fields = Object.fromEntries(Object.entries(value));
  if (
    fields.jsonrpc !== '2.0' ||
    fields.id !== null ||
    !Object.keys(fields).every((name) =>
      ['jsonrpc', 'id', 'error'].includes(name),
    )
  )
    return false;
  const error: unknown = fields.error;
  if (error === null || typeof error !== 'object' || Array.isArray(error))
    return false;
  const details = Object.fromEntries(Object.entries(error));
  return (
    typeof details.code === 'number' &&
    Number.isInteger(details.code) &&
    typeof details.message === 'string' &&
    Object.keys(details).every((name) =>
      ['code', 'message', 'data'].includes(name),
    )
  );
}

/** Only the contract's protocol paths preserve their closed errors (0225, 0226). */
export function normalizeProtocolError(
  error: unknown,
  response: Response | undefined,
  request: Request | undefined,
): ProblemDetails | OAuthError | McpError {
  const type = response?.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  if (request !== undefined && type === 'application/json') {
    const path = new URL(request.url).pathname;
    if (
      oauthPathPrefixes.some((prefix) => path.startsWith(prefix)) &&
      isOAuthError(error)
    )
      return error;
    if (
      mcpPathPrefixes.some((prefix) => path.startsWith(prefix)) &&
      isMcpError(error)
    )
      return error;
  }
  return normalizeProblem(error, response);
}
