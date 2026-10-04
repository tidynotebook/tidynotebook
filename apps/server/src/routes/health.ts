/**
 * The service operations: liveness and readiness.
 *
 * The contract declares each answer at two addresses. `/api/health` and
 * `/api/ready` serve the application, and `/health` and `/ready` serve a load
 * balancer or an orchestrator that probes a fixed root path. Each pair is one
 * function under two operation ids, so the two addresses cannot drift apart.
 *
 * Readiness answers the stop of the process before it runs a probe, so a
 * process that drains reports that it accepts no new traffic and touches no
 * resource that its own stop is closing. Liveness stays at 200 through the
 * stop, because the process still runs and nothing should replace it.
 *
 * The database probes read through the pool that already serves the workspace
 * traffic. A probe that opened its own connection would be a load source of
 * its own, because an orchestrator repeats it every few seconds forever.
 */
import { access, constants } from 'node:fs/promises';
import type { OperationId } from '@notesapp/api-contract';
import type { DatabaseProbeResult } from '@notesapp/storage-server';
import { requiredSchemaVersion } from '@notesapp/storage-server';
import type { ServerConfig } from '../config.ts';
import type { ServiceLifecycle } from '../lifecycle.ts';
import { readProperty } from '../values.ts';
import type {
  HandlerMap,
  HandlerResult,
  OperationHandler,
} from '../plugins/register.ts';
import { createProblem, problemMediaType } from '../plugins/problem.ts';

const jsonMediaType = 'application/json';

/** Readiness of one startup requirement. */
export type ReadinessCheck = {
  readonly name: string;
  readonly status: 'ok' | 'degraded';
  readonly detail?: string;
};

/**
 * One startup requirement that readiness reports.
 *
 * `src/app.ts` wires the default probe list at startup, and that list holds
 * the configuration probe, the storage probe, and the two database probes.
 * The list stays injectable, so a test can supply its own probe and force a
 * degraded report.
 */
export type ReadinessProbe = () => Promise<ReadinessCheck>;

/** Reads the state of the database that the deployment serves from. */
export type DatabaseRead = () => Promise<DatabaseProbeResult>;

/** How long one readiness read of the database may take. */
export const databaseReadTimeoutMs = 3000;

/** The answer of a read that did not complete. */
const unreachableDatabase: DatabaseProbeResult = {
  reachable: false,
  schemaVersion: null,
};

/** Amount of readiness information the caller asked for. */
function readDetailLevel(query: unknown): 'summary' | 'full' {
  return readProperty(query, 'detail') === 'summary' ? 'summary' : 'full';
}

/**
 * The configuration probe.
 *
 * The storage probe and the two database probes live next to it, and
 * `src/app.ts` wires them into the probe list at startup.
 */
export function configurationProbe(config: ServerConfig): ReadinessProbe {
  return () =>
    Promise.resolve(
      config.servedOrigins.length > 0
        ? {
            name: 'configuration',
            status: 'ok',
            detail: 'Configuration was validated at startup.',
          }
        : {
            name: 'configuration',
            status: 'degraded',
            detail: 'The deployment serves no origin.',
          },
    );
}

/** Checks storage root accessibility and writability. */
export function storageProbe(storageRoot: string): ReadinessProbe {
  return async () => {
    try {
      await access(storageRoot, constants.R_OK | constants.W_OK);
      return {
        name: 'storage',
        status: 'ok',
        detail: 'Storage directory is accessible and writable.',
      };
    } catch {
      return {
        name: 'storage',
        status: 'degraded',
        detail: 'Storage directory is not accessible or writable.',
      };
    }
  };
}

/**
 * Bounds a read with a deadline.
 *
 * A database that refuses a connection answers at once, but a host that drops
 * every packet answers never. The probe must still report, so a read that
 * passes its deadline gives the late answer instead. The answer always
 * arrives, and the timer is cleared as soon as the read wins, so the deadline
 * bounds the probe and leaves nothing behind.
 */
export function withDeadline<T>(
  read: () => Promise<T>,
  milliseconds: number,
  late: T,
): Promise<T> {
  return new Promise<T>((accept) => {
    const timer = setTimeout(() => accept(late), milliseconds);
    const answer = (value: T): void => {
      clearTimeout(timer);
      accept(value);
    };
    void read().then(answer, () => answer(late));
  });
}

/**
 * Shares one running read between the callers that ask while it runs.
 *
 * The database check and the migration check read the same state, and
 * readiness starts them together, so one request makes one round trip over one
 * pooled connection. A caller that arrives while a read runs reads that same
 * answer, which is at most one round trip old.
 */
export function singleFlight<T>(read: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return (): Promise<T> => {
    if (pending !== null) return pending;
    const clear = (): void => {
      pending = null;
    };
    const started = read();
    pending = started;
    void started.then(clear, clear);
    return started;
  };
}

/** Reports whether the database answers at all. */
export function databaseProbe(read: DatabaseRead): ReadinessProbe {
  return async () => {
    const state = await read();
    return state.reachable
      ? {
          name: 'database',
          status: 'ok',
          detail: 'Database connection is healthy.',
        }
      : {
          name: 'database',
          status: 'degraded',
          detail: 'Database connection failed.',
        };
  };
}

/**
 * Compares the applied migration count with the version this release needs.
 *
 * A probe address takes no account, so its detail names no version number: a
 * number tells any caller which release runs here.
 */
export function migrationProbe(read: DatabaseRead): ReadinessProbe {
  return async () => {
    const state = await read();
    const version = state.schemaVersion;
    if (version === null)
      return {
        name: 'migration',
        status: 'degraded',
        detail: 'The database reports no schema version.',
      };
    if (version >= requiredSchemaVersion)
      return {
        name: 'migration',
        status: 'ok',
        detail: 'Database schema migrations are complete.',
      };
    return {
      name: 'migration',
      status: 'degraded',
      detail: 'Database schema migrations are incomplete. Run the migrations.',
    };
  };
}

/**
 * The database probe and the migration probe over one shared bounded read.
 *
 * Both answers come from the state that one pooled read returns, so a
 * readiness request costs one round trip and no new connection.
 */
export function databaseProbes(
  read: DatabaseRead,
  timeoutMs: number = databaseReadTimeoutMs,
): readonly ReadinessProbe[] {
  const shared = singleFlight(() =>
    withDeadline(read, timeoutMs, unreachableDatabase),
  );
  return [databaseProbe(shared), migrationProbe(shared)];
}

/** Runs every probe and combines the result. */
export async function evaluateReadiness(
  probes: readonly ReadinessProbe[],
  level: 'summary' | 'full',
): Promise<{ status: 'ok' | 'degraded'; checks: readonly ReadinessCheck[] }> {
  const results = await Promise.all(probes.map((probe) => probe()));
  const checks = results.map((check) =>
    level === 'full' ? check : { name: check.name, status: check.status },
  );
  return {
    status: checks.some((check) => check.status === 'degraded')
      ? 'degraded'
      : 'ok',
    checks,
  };
}

/** Everything that a service answer reads from the request. */
export type ProbeRequest = {
  /** The correlation id that every answer carries. */
  readonly id: string;
  /** The requested address, which the answer reports as its instance. */
  readonly url: string;
  /** The query of the request, which states the detail level. */
  readonly query: unknown;
};

/** The path of a request, without its query. */
function instanceOf(request: ProbeRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

/** The liveness answer. It inspects no dependency and never fails. */
export function livenessAnswer(): HandlerResult {
  return { status: 200, mediaType: jsonMediaType, body: { status: 'ok' } };
}

/**
 * The readiness answer.
 *
 * A process that stops reports that it is not ready before its listener
 * closes, so a proxy or an orchestrator sends the next request elsewhere while
 * the open requests complete here. This is not a degraded check: every
 * requirement can still be met, and the process stops because an operator
 * asked for it. No probe runs then, so a pool that the stop is closing
 * receives no new work. Liveness answers that the process runs, so nothing
 * restarts a container that stops on purpose.
 */
export async function readinessAnswer(
  probes: readonly ReadinessProbe[],
  lifecycle: ServiceLifecycle,
  request: ProbeRequest,
): Promise<HandlerResult> {
  if (lifecycle.state() === 'draining')
    return {
      status: 503,
      mediaType: problemMediaType,
      body: createProblem({
        code: 'shutting_down',
        status: 503,
        detail:
          'The server stops. It completes the open requests and accepts no new traffic.',
        instance: instanceOf(request),
        requestId: request.id,
      }),
    };
  const report = await evaluateReadiness(
    probes,
    readDetailLevel(request.query),
  );
  if (report.status === 'ok')
    return { status: 200, mediaType: jsonMediaType, body: report };
  return {
    status: 503,
    mediaType: problemMediaType,
    body: createProblem({
      code: 'not_ready',
      status: 503,
      detail: `Degraded checks: ${report.checks
        .filter((check) => check.status === 'degraded')
        .map((check) => check.name)
        .join(', ')}.`,
      instance: instanceOf(request),
      requestId: request.id,
    }),
  };
}

/**
 * The four probe operations of record 0040: liveness and readiness, each at
 * its API address and at its root address.
 *
 * A platform probes a replica with a host of its own, so these operations
 * answer any host (record 0199). `src/plugins/host.ts` reads this list.
 */
export const probeOperations = [
  'getHealth',
  'getRootHealth',
  'getReadiness',
  'getRootReadiness',
] as const satisfies readonly OperationId[];

/**
 * The service handlers, one implementation for each answer.
 *
 * Each implementation is bound to the API operation id and to the root
 * operation id, so a load balancer that probes the root address reads exactly
 * what the application reads. A copied body would let the two drift apart, so
 * the two ids name one function.
 */
export function createServiceHandlers(
  probes: readonly ReadinessProbe[],
  lifecycle: ServiceLifecycle,
): HandlerMap {
  const liveness: OperationHandler = (): Promise<HandlerResult> =>
    Promise.resolve(livenessAnswer());
  const readiness: OperationHandler = (request): Promise<HandlerResult> =>
    readinessAnswer(probes, lifecycle, request);
  return {
    getHealth: liveness,
    getRootHealth: liveness,
    getReadiness: readiness,
    getRootReadiness: readiness,
  };
}
