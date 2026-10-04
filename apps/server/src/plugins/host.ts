/**
 * Host name parsing utilities for HTTP request validation, and the one rule
 * that names the operations which answer any host.
 */
import { operations } from '@notesapp/api-contract';
import { probeOperations } from '../routes/health.ts';

/**
 * Host header value without its port, lowercased.
 *
 * An IPv6 literal keeps its brackets, because `[::1]:8080` and `[::1]` name
 * the same host and a plain split on the colon would cut the address.
 */
export function hostName(host: string | undefined): string {
  const value = (host ?? '').trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(0, end + 1);
  }
  return value.split(':')[0] ?? '';
}

/**
 * The operations that the Host allowlist of record 0039 does not check.
 *
 * A platform checks a replica with a host of its own, for example Railway
 * with `healthcheck.railway.app` (record 0199), so the probe operations of
 * record 0040 answer any host. A probe answer holds no address that the host
 * decides and no cookie, so a forged host can poison no cache through it.
 * Another kind of operation that a caller outside the served origins asks for
 * joins this set, and the allowlist reads only `answersAnyHost`.
 */
const anyHostOperations: ReadonlySet<string> = new Set<string>([
  ...probeOperations,
  // The operator API takes the operator token and no session, sets no cookie
  // and answers no page, and a service on a private network names the core by
  // an internal host (record 0190). The contract decides which operations
  // they are, by their security scheme, so a new one needs no change here.
  ...operations
    .filter((operation) =>
      operation.security.some((requirement) => 'operatorToken' in requirement),
    )
    .map((operation) => operation.id),
]);

/**
 * Whether the operation of a route answers whatever host a request names.
 *
 * @param operationId the operation id of the matched route, or `undefined`
 *   when no operation serves the address. An address that no operation
 *   serves is always checked.
 */
export function answersAnyHost(operationId: string | undefined): boolean {
  return operationId !== undefined && anyHostOperations.has(operationId);
}
