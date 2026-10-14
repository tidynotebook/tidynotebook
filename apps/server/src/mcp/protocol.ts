/** The maintained MCP transport, confined to this directory (0225, 0227). */
import { Buffer } from 'node:buffer';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { findOperation } from '@notesapp/api-contract';
import { productName } from '@notesapp/core';
import type {
  IdentityStoreHandle,
  OAuthTokenIdentity,
} from '@notesapp/storage-server';
import {
  createMcpHandler,
  deserializeMessage,
  isJSONRPCRequest,
  isLegacyRequest,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  ProtocolError,
  Server,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';
import { bearerToken, withToolDelegation } from '../auth/actor.ts';
import { secretDigest } from '../auth/publication-secrets.ts';
import type { ServerConfig } from '../config.ts';
import type { AttemptCounter } from '../plugins/attempt-store.ts';
import type { ProtocolAdapter, ProtocolResult } from '../plugins/register.ts';
import { applicationOrigins } from '../served-origins.ts';
import {
  checkToolRegistry,
  mcpTools,
  runTool,
  type ContractCall,
  type McpTool,
} from './registry.ts';

const metadataPaths = [
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-protected-resource',
] as const;
export const mcpRoutes = [
  { method: 'POST', path: '/mcp', protocolErrors: true },
  { method: 'GET', path: '/mcp', protocolErrors: true },
  ...metadataPaths.map((path) => ({ method: 'GET' as const, path })),
] as const;

function answer(
  status: number,
  body: unknown,
  headers: readonly (readonly [string, string])[] = [],
): ProtocolResult {
  return {
    status,
    mediaType: 'application/json',
    body,
    headers: [['cache-control', 'no-store'], ...headers],
    cookies: [],
    bytes: null,
  };
}

/** A pre-protocol refusal never repeats a request or an engine notice. */
export function mcpProtocolError(status: number): ProtocolResult {
  return answer(status, {
    jsonrpc: '2.0',
    id: null,
    error: {
      code: status >= 500 ? -32603 : status === 429 ? -32000 : INVALID_REQUEST,
      message:
        status === 429
          ? 'Too many requests. Try again later.'
          : status >= 500
            ? 'The server cannot complete the request. Try again later.'
            : 'The request is not valid. Check the request and try again.',
    },
  });
}

function challenge(resource: string, write: boolean): ProtocolResult {
  return answer(
    write ? 403 : 401,
    { error: write ? 'insufficient_scope' : 'invalid_token' },
    [
      [
        'www-authenticate',
        `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp', resource).href}", scope="${write ? 'notes:read notes:write' : 'notes:read'}"${write ? ', error="insufficient_scope"' : ''}`,
      ],
    ],
  );
}

export type McpDependencies = {
  readonly config: ServerConfig;
  readonly identity: Pick<IdentityStoreHandle, 'oauthTokenIdentity'>;
  readonly attempts: AttemptCounter;
  readonly app: () => FastifyInstance;
  /** Test composition only. The production composition always uses mcpTools. */
  readonly tools?: readonly McpTool[];
};

const methods: Readonly<
  Record<
    string,
    'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  >
> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH',
  head: 'HEAD',
  options: 'OPTIONS',
};

/** Internal dispatch reads every address and method from the generated contract. */
function contractCall(
  app: () => FastifyInstance,
  origin: string,
): ContractCall {
  return async (id, input = {}) => {
    const operation = findOperation(id);
    if (operation === undefined)
      throw new Error('The contract operation is missing.');
    const method = methods[operation.method];
    if (method === undefined)
      throw new Error('The contract method is missing.');
    const path = operation.path.replaceAll(
      /\{([^{}]+)\}/g,
      (_match, name: string) => {
        const value = input.params?.[name];
        if (value === undefined)
          throw new Error('The contract parameter is missing.');
        return encodeURIComponent(value);
      },
    );
    const query = new URLSearchParams(
      Object.entries(input.query ?? {}).map(([name, value]) => [
        name,
        String(value),
      ]),
    );
    const result = await app().inject({
      method,
      url: `${path}${query.size === 0 ? '' : `?${query}`}`,
      headers: { host: new URL(origin).host },
      ...(input.body === undefined
        ? {}
        : {
            payload: JSON.stringify(input.body),
            headers: {
              host: new URL(origin).host,
              'content-type': 'application/json',
            },
          }),
    });
    const body: unknown = result.body === '' ? undefined : result.json();
    return { status: result.statusCode, body };
  };
}

export function createMcpProtocol(
  dependencies: McpDependencies,
): ProtocolAdapter {
  const { config, identity, attempts } = dependencies;
  const tools = dependencies.tools ?? mcpTools;
  checkToolRegistry(tools);
  const call = contractCall(dependencies.app, config.origin);
  return {
    protocol: 'mcp',
    routes: mcpRoutes,
    enabled: () => config.mcpOrigin !== null,
    error: mcpProtocolError,
    handle: async (request) => {
      const origin = config.mcpOrigin;
      if (origin === null) return mcpProtocolError(404);
      const resource = `${origin}/mcp`;
      if (metadataPaths.some((path) => path === request.url.split('?')[0]))
        return answer(200, {
          resource,
          authorization_servers: [`${config.origin}/api/auth`],
          scopes_supported: ['notes:read', 'notes:write'],
          bearer_methods_supported: ['header'],
        });
      if (
        request.headers.origin !== undefined &&
        (typeof request.headers.origin !== 'string' ||
          ![origin, ...applicationOrigins(config.servedOrigins)].includes(
            request.headers.origin,
          ))
      )
        return mcpProtocolError(403);
      const token = bearerToken(request.headers.authorization);
      const grant =
        token === null
          ? null
          : await identity.oauthTokenIdentity(
              secretDigest.digest(token),
              resource,
            );
      if (grant === null || !grant.scopes.includes('notes:read'))
        return challenge(resource, false);
      const counted = await Promise.all([
        attempts.count(
          `mcp-grant:${secretDigest.digest(grant.grantId)}`,
          config.rateLimit.windowSeconds * 1000,
          Date.now(),
        ),
        attempts.count(
          `mcp-account:${grant.accountId}`,
          config.rateLimit.windowSeconds * 1000,
          Date.now(),
        ),
      ]);
      if (counted.some((state) => state.current > config.rateLimit.max))
        return mcpProtocolError(429);
      // The library parses the message. This read only selects a scope challenge.
      const message = protocolMessage(request);
      if (
        message !== null &&
        isJSONRPCRequest(message) &&
        message.method === 'tools/call'
      ) {
        const name = message.params?.name;
        const tool = tools.find((entry) => entry.definition.name === name);
        if (
          tool?.scope === 'notes:write' &&
          !grant.scopes.includes('notes:write')
        )
          return challenge(resource, true);
      }
      return serve(
        request,
        origin,
        grant,
        tools,
        call,
        config.limits.bodyBytes,
      );
    },
  };
}

function protocolMessage(request: FastifyRequest) {
  try {
    return Buffer.isBuffer(request.body)
      ? deserializeMessage(request.body.toString('utf8'))
      : null;
  } catch {
    return null;
  }
}

/** Both protocol eras use this factory and only these tool handlers. */
async function serve(
  request: FastifyRequest,
  origin: string,
  grant: OAuthTokenIdentity,
  tools: readonly McpTool[],
  call: ContractCall,
  bodyBytes: number,
): Promise<ProtocolResult> {
  const factory = () => {
    const server = new Server(
      { name: productName, version: '1' },
      { capabilities: { tools: {} } },
    );
    server.setRequestHandler('tools/list', () => ({
      tools: tools.map((tool) => tool.definition),
    }));
    server.setRequestHandler('tools/call', async (message) => {
      const tool = tools.find(
        (entry) => entry.definition.name === message.params.name,
      );
      if (tool === undefined)
        throw new ProtocolError(
          METHOD_NOT_FOUND,
          'This tool is not available. Read the tool list and try again.',
        );
      return withToolDelegation(grant, tool.operations, () =>
        runTool(tool, message.params.arguments ?? {}, call),
      );
    });
    return server;
  };
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers))
    if (typeof value === 'string') headers.set(name, value);
  headers.delete('authorization');
  headers.delete('cookie');
  headers.delete('content-length');
  const web = new Request(new URL(request.url, origin), {
    method: request.method,
    headers,
    ...(Buffer.isBuffer(request.body) && request.method === 'POST'
      ? { body: new Uint8Array(request.body) }
      : {}),
  });
  const modern = createMcpHandler(factory, {
    legacy: 'reject',
    maxSubscriptions: 0,
    maxRequestBodySize: bodyBytes,
  });
  let close = modern.close;
  try {
    let response: Response;
    if (
      request.method === 'POST' &&
      (await isLegacyRequest(web, undefined, { maxRequestBodySize: bodyBytes }))
    ) {
      const server = factory();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        maxRequestBodySize: bodyBytes,
      });
      close = async () => {
        await transport.close();
        await server.close();
        await modern.close();
      };
      await server.connect(transport);
      response = await transport.handleRequest(web);
    } else response = await modern.fetch(web);
    if (response.status === 202)
      return {
        status: 202,
        mediaType: '',
        body: undefined,
        headers: [['cache-control', 'no-store']],
        cookies: [],
        bytes: null,
      };
    if (
      !(response.headers.get('content-type') ?? '').startsWith(
        'application/json',
      )
    )
      throw new Error('The MCP transport must answer JSON.');
    let body: unknown = await response.json();
    if (response.status >= 400 && body !== null && typeof body === 'object')
      body = { ...Object.fromEntries(Object.entries(body)), id: null };
    return answer(response.status, body);
  } finally {
    await close();
  }
}
