/**
 * Whether this client and one server speak the same sync protocol.
 *
 * Record 0086 puts a capability read before every push and every pull. A
 * cached client cannot learn a new error handler from a new server, so the
 * client asks first and sends nothing that the server does not serve. This
 * module holds the rule over the answer and holds no effect.
 *
 * A server from before the capability operation answers its unknown API path
 * with 404 and `route_not_found`. That answer, and only that answer, names a
 * legacy server. A legacy server serves version 1 only, so an absent
 * operation never grants a later version.
 */
import type { Problem } from './queue.ts';

/** The versions that a server without the capability operation serves. */
export const legacySyncProtocolVersions: readonly number[] = [1];

/** The code that a server answers for an API path it does not route. */
export const routeNotFoundCode = 'route_not_found';

/** What one capability read said about the server. */
export type ServedProtocol =
  | { readonly kind: 'served'; readonly versions: readonly number[] }
  | { readonly kind: 'absent' };

/**
 * How this client stands against the server.
 *
 * `client-behind` means that the server serves only later versions, so this
 * tab needs the new application before it sends again. `server-behind` means
 * that the server serves only earlier versions, for example after a rollback,
 * so the client waits and keeps its work until the server returns.
 */
export type ProtocolFit = 'compatible' | 'client-behind' | 'server-behind';

/**
 * Reads a failed capability read as a legacy server, or `null`.
 *
 * Any other failure says nothing about the protocol, so the caller treats it
 * as a failed read and tries again later.
 */
export function servedProtocolOfProblem(
  problem: Problem,
): ServedProtocol | null {
  if (problem.status === 404 && problem.code === routeNotFoundCode)
    return { kind: 'absent' };
  return null;
}

/** Decides whether the client version fits the served versions. */
export function protocolFit(
  clientVersion: number,
  served: ServedProtocol,
): ProtocolFit {
  const versions =
    served.kind === 'absent' ? legacySyncProtocolVersions : served.versions;
  if (versions.includes(clientVersion)) return 'compatible';
  // A list with a later version asks this client to update, even when it
  // also holds an earlier one: only the new application can send again.
  if (versions.some((version) => version > clientVersion))
    return 'client-behind';
  return 'server-behind';
}
