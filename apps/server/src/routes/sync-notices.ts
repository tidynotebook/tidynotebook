/**
 * The upgrade route of the sync notice stream (records 0124, 0126, 0129).
 *
 * The contract names the upgrade operation with a protocol marker, so the
 * startup check proves that this server serves the address of the channel.
 * The identity hook and the contract check of the request run before this
 * adapter. The adapter then checks the origin, because a browser sends a
 * cookie with an upgrade from any page and the identity hook checks the
 * origin of a write only. It binds the stream to the verified session and
 * hands it to the gateway. A server without a gateway, and a gateway that
 * offers no stream now, answer `notices_unavailable`, and the client reads
 * the feed on its own schedule.
 */
import type { FastifyRequest } from 'fastify';
import { findChannel } from '@notesapp/api-contract';
import { requireSessionActor } from '../auth/actor.ts';
import type { NoticeGateway } from '../notices/gateway.ts';
import type {
  ProtocolAdapter,
  ProtocolResult,
  SocketAdmission,
} from '../plugins/register.ts';
import { createProblem, problemMediaType } from '../plugins/problem.ts';
import { applicationOrigins, type ServedOrigin } from '../served-origins.ts';

/** Value of the protocol marker of the upgrade operation. */
export const syncNoticesProtocol = 'sync-notices';

const channel = findChannel('syncNotices');
if (channel === undefined)
  throw new Error('The contract has no syncNotices channel.');
const address = channel.address;

/** One problem answer of the upgrade route. */
function problem(
  request: FastifyRequest,
  code: 'notices_unavailable' | 'forbidden' | 'invalid_request',
  status: number,
  detail: string,
): ProtocolResult {
  return {
    status,
    mediaType: problemMediaType,
    headers: [],
    cookies: [],
    body: createProblem({
      code,
      status,
      detail,
      instance: address,
      requestId: request.id,
    }),
    bytes: null,
  };
}

const unavailable = (request: FastifyRequest): ProtocolResult =>
  problem(
    request,
    'notices_unavailable',
    503,
    'The notice stream is not available now. Read the feed on your own schedule.',
  );

/** Reads one header as a single string. */
function headerValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** Builds the adapter that serves the upgrade address of the channel. */
export function createSyncNoticesProtocol(notices?: {
  readonly gateway: NoticeGateway;
  readonly servedOrigins: readonly ServedOrigin[];
}): ProtocolAdapter {
  const routes = [{ method: 'GET', path: address }] as const;
  if (notices === undefined)
    return {
      protocol: syncNoticesProtocol,
      routes,
      handle: (request) => Promise.resolve(unavailable(request)),
    };
  const { gateway, servedOrigins } = notices;
  return {
    protocol: syncNoticesProtocol,
    routes,
    // A request that asks for no upgrade gets the state of the stream.
    handle: (request) =>
      Promise.resolve(
        gateway.offered().length === 0
          ? unavailable(request)
          : problem(
              request,
              'invalid_request',
              400,
              'This address opens a WebSocket stream only.',
            ),
      ),
    socket: {
      admit: async (request): Promise<SocketAdmission> => {
        const origin = headerValue(request.headers.origin);
        if (
          origin === undefined ||
          !applicationOrigins(servedOrigins).includes(origin)
        )
          return {
            admitted: false,
            result: problem(
              request,
              'forbidden',
              403,
              'A notice stream must come from a page of this deployment.',
            ),
          };
        const resolved = requireSessionActor(request);
        const decision = await gateway.admit({
          accountId: resolved.actor.accountId,
          sessionId: resolved.sessionId,
          name: resolved.name ?? 'Member',
        });
        return decision.ok
          ? { admitted: true, open: decision.open }
          : { admitted: false, result: unavailable(request) };
      },
      drain: () => gateway.drain(),
    },
  };
}
