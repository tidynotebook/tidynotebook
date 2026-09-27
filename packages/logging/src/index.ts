/** Browser-safe structured logging with one typed event catalog. */

/** Levels that a sink can route to its transport. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Fields accepted by each event. */
export type LogEventFields = {
  readonly 'http.request.completed': {
    readonly method: string;
    readonly url: string;
    readonly statusCode: number;
    readonly durationMs: number;
  };
  readonly 'http.request.failed': {
    readonly operationId: string | null;
    readonly errorName: string;
  };
  readonly 'http.response.rejected': {
    readonly operationId: string;
    readonly statusCode: number;
    readonly mediaType: string;
    readonly reason: string;
  };
  readonly 'maintenance.failed': {
    readonly job:
      'sync' | 'attachments' | 'publications' | 'attempts' | 'pending';
  };
  /**
   * One refusal of the reader path of a published link.
   *
   * The cause reaches the operator and reaches no answer, which is the rule of
   * decision 0030. The record names no link, no note and no account, so a log
   * of it discloses nothing that the refusal itself hides.
   */
  readonly 'published.refused': {
    readonly cause: string;
  };
  readonly 'auth.debug': { readonly source: 'better-auth' };
  readonly 'auth.info': { readonly source: 'better-auth' };
  readonly 'auth.warning': { readonly source: 'better-auth' };
  /**
   * The breach service did not answer, so a new password was accepted
   * without the check (record 0116). The record names no password.
   */
  readonly 'auth.breach_check_unavailable': Record<string, never>;
  readonly 'auth.failed': { readonly source: 'better-auth' };
  readonly 'web.problem': { readonly problemCode: string };
};

/** One catalogued event name. */
export type LogEventName = keyof LogEventFields;

/** Fixed level and allowed field names of each event. */
export const logEventCatalog = {
  'http.request.completed': {
    level: 'info',
    fields: ['method', 'url', 'statusCode', 'durationMs'],
  },
  'http.request.failed': {
    level: 'error',
    fields: ['operationId', 'errorName'],
  },
  'http.response.rejected': {
    level: 'error',
    fields: ['operationId', 'statusCode', 'mediaType', 'reason'],
  },
  'maintenance.failed': { level: 'error', fields: ['job'] },
  'published.refused': { level: 'info', fields: ['cause'] },
  'auth.debug': { level: 'debug', fields: ['source'] },
  'auth.info': { level: 'info', fields: ['source'] },
  'auth.warning': { level: 'warn', fields: ['source'] },
  'auth.breach_check_unavailable': { level: 'warn', fields: [] },
  'auth.failed': { level: 'error', fields: ['source'] },
  'web.problem': { level: 'warn', fields: ['problemCode'] },
} as const satisfies Readonly<
  Record<
    LogEventName,
    {
      readonly level: LogLevel;
      readonly fields: readonly string[];
    }
  >
>;

/** Context that a child logger carries to every record. */
export type LogContext = {
  readonly requestId?: string | undefined;
  readonly actorId?: string | undefined;
};

/** One complete record. Event fields sit beside the shared fields. */
export type LogRecord = Readonly<Record<string, unknown>>;

/** A runtime adapter that writes one complete record. */
export type LogSink = {
  write(record: LogRecord): void;
};

/** The only API that application code uses to write a log record. */
export type Logger = {
  bind(context: LogContext): Logger;
  emit<Event extends LogEventName>(
    event: Event,
    fields: LogEventFields[Event],
  ): void;
};

/** Builds one logger over a sink. */
export function createLogger(
  sink: LogSink,
  now: () => string = () => new Date().toISOString(),
  context: LogContext = {},
): Logger {
  return {
    bind(bound): Logger {
      return createLogger(sink, now, { ...context, ...bound });
    },
    emit(event, fields): void {
      const definition = logEventCatalog[event];
      const supplied = Object.fromEntries(Object.entries(fields));
      const record: Record<string, unknown> = {
        event,
        level: definition.level,
        time: now(),
      };
      if (context.requestId !== undefined)
        record['requestId'] = context.requestId;
      if (context.actorId !== undefined) record['actorId'] = context.actorId;
      for (const name of definition.fields) {
        if (name in supplied) record[name] = supplied[name];
      }
      sink.write(record);
    },
  };
}

/** Builds an in-memory sink for tests and returns its live record list. */
export function createMemorySink(): {
  readonly sink: LogSink;
  readonly records: readonly LogRecord[];
} {
  const records: LogRecord[] = [];
  return {
    records,
    sink: {
      write(record): void {
        records.push(record);
      },
    },
  };
}
