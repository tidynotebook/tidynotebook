/**
 * Server configuration.
 *
 * Configuration is read once from the environment and validated against a JSON
 * Schema 2020-12 document with Ajv. Loading fails closed: an absent value, an
 * empty value, or a value outside its stated range stops startup instead of
 * falling back to a default that a deployment did not choose.
 */
import type { SchemaObject } from '@notesapp/api-contract';
import { compileSchema, describeIssues } from '@notesapp/api-contract';
import {
  defaultAccountLimitBytes,
  defaultInvitationLifetimeHours,
  defaultPendingAccountHours,
  defaultProofDifficulty,
  maxAccountLimitBytes,
  maxInvitationLifetimeHours,
  maxPendingAccountHours,
  maxLegalVersionLength,
  maxProofDifficulty,
  minProofDifficulty,
  legalDocumentNames,
  mailSecurities,
  readMailSettings,
  maxArchiveBytes,
  importPartBytes,
  maxLegalTextBytes,
  templateBlanks,
  type LegalDocumentName,
  type LegalDocuments,
  type MailSettingsProblem,
  type OpenRegistrationPart,
  type RegistrationPolicy,
  type StoredMailSettings,
  openRegistrationMissing,
  registrationPolicies,
  productName,
  controlStandings,
  maxRemoveAfterDays,
  type NewAccountSettings,
  type UsageCaps,
} from '@notesapp/core';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import type { ObjectStoreSettings } from '@notesapp/storage-server';
import {
  readOrigin,
  withMcpOrigin,
  readServedOrigins,
  type ServedOrigin,
} from './served-origins.ts';
import { readTrustedProxies } from './trusted-proxies.ts';

const logLevels = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'silent',
] as const;

/** Accepted structured log levels. */
export type LogLevel = (typeof logLevels)[number];

function isLogLevel(value: string): value is LogLevel {
  return logLevels.some((level) => level === value);
}

/** The mail server as separate fields, with the password open. */
export type MailFields = Omit<StoredMailSettings, 'passwordSealed'> & {
  readonly password: string | null;
};

/**
 * The mail transport that the environment names, when it names one.
 *
 * An operator names it as one SMTP URL or as separate fields, and never as
 * both (record 0150). The fields need no percent encoding, so a user name or
 * a password with a reserved character reaches the mail server as written.
 */
export type MailConfig =
  | {
      readonly kind: 'url';
      /** SMTP URL of the transport, for example `smtps://user:secret@host:465`. */
      readonly smtpUrl: string;
      /** Address that a message is sent from. */
      readonly from: string;
    }
  | {
      readonly kind: 'fields';
      readonly fields: MailFields;
    };

/** Validated server configuration. */
export type ServerConfig = {
  /**
   * Canonical origin of this deployment.
   *
   * It is the first entry of `servedOrigins`. It decides the base URL of the
   * identity routes and the secure cookie flag. It does not decide the
   * listening socket, which `listen` below holds. See
   * [decision 0042](../../../docs/decisions/0042-the-listening-socket-is-not-the-public-origin.md).
   */
  readonly origin: string;
  /** MCP is off when this setting is absent (0225). */
  readonly mcpOrigin: string | null;
  /** PostgreSQL connection URL of the runtime role. */
  readonly databaseUrl: string;
  /**
   * PostgreSQL connection URL of the identity role.
   *
   * Only the Better Auth pool uses it. That role holds every right on the four
   * Better Auth tables and no right anywhere else, and the runtime role holds
   * no right on those four tables, so the application cannot read a session
   * token, a password hash, or a reset token through any query.
   */
  readonly authDatabaseUrl: string;
  /**
   * The directory of the server for the files of one request, and the
   * object store itself when `objectStore` names the file store.
   */
  readonly storageRoot: string;
  /**
   * Where every byte that outlives one request lives (record 0192): the
   * directory of `storageRoot`, or an S3 compatible store with its key pair
   * (record 0207).
   */
  readonly objectStore: ObjectStoreConfig;
  /** Secret that signs sessions and tokens. */
  readonly authSecret: string;
  /**
   * Every origin that this deployment serves and its role, the canonical one
   * first and the published origin, when there is one, last.
   *
   * It is the one list. The cookie write check, the trusted list of the
   * identity routes, and the Host allowlist all read it, and only an
   * `application` origin is trusted for a write. See
   * [decision 0039](../../../docs/decisions/0039-one-list-of-served-origins.md)
   * and [record 0118](../../../docs/decisions/0118-a-published-page-of-a-public-installation-has-its-own-origin.md).
   */
  readonly servedOrigins: readonly ServedOrigin[];
  /**
   * The socket that this process listens on.
   *
   * A proxy in front publishes the origin above on its own address, so the
   * public address and this socket are two different things.
   */
  readonly listen: {
    readonly host: string;
    readonly port: number;
  };
  /**
   * The proxies whose forwarded headers this deployment believes.
   *
   * An empty list trusts nothing, so the client address is the peer address
   * of the socket. `apps/server/src/trusted-proxies.ts` builds the list and
   * `apps/server/src/app.ts` gives it to Fastify. See
   * [decision 0043](../../../docs/decisions/0043-one-decider-of-the-client-address.md).
   */
  readonly trustedProxies: readonly string[];
  /** Level of the structured log. `silent` disables logging. */
  readonly logLevel: LogLevel;
  /**
   * Request limits applied before a handler runs.
   *
   * This is the one place that names a body limit. `bodyBytes` covers every
   * route, and the operator sets it. The upload and the import carry one file
   * each, so their bounds are fixed: the file bound, and a body bound that is
   * the file bound plus `multipartEnvelopeBytes`. `plugins/register.ts` gives
   * each route its body bound, and the two handlers read their file bound
   * here.
   */
  readonly limits: {
    readonly bodyBytes: number;
    /** The largest attachment file of one upload. */
    readonly attachmentBytes: number;
    /** The largest body of one upload. */
    readonly uploadBodyBytes: number;
    /** The largest workspace archive of one import. */
    readonly archiveBytes: number;
    /**
     * The largest body of one part of an import (record 0192). A part is
     * the bytes alone, with no form around them.
     */
    readonly importPartBytes: number;
    readonly headerBytes: number;
    /**
     * The total receive bound of every request.
     *
     * The Node HTTP server owns it, and it cannot hold one value per route.
     * It must therefore cover the largest declared body of any route, which
     * is the attachment upload, at a modest rate over a slow link. The two
     * bounds that stay tight are the header bound of `app.ts` and
     * `uploadIdleTimeoutMs` below.
     */
    readonly requestTimeoutMs: number;
    /**
     * The longest gap between two chunks of an upload body.
     *
     * A large file over a slow link is not an attack, so the upload route
     * bounds idle time instead of total time. It must stay shorter than
     * `requestTimeoutMs`, or the total bound always fires first and the
     * caller reads the bare answer of the framework instead of a problem
     * body. `plugins/body-idle-timeout.ts` holds the rule.
     */
    readonly uploadIdleTimeoutMs: number;
  };
  /** Attempt limit for the public setup and authentication routes. */
  readonly rateLimit: {
    readonly windowSeconds: number;
    readonly max: number;
  };
  /**
   * Mail transport of local password recovery, or `null`.
   *
   * When it is `null`, recovery by email is disabled and the documented path
   * is the operator command `pnpm account:recover`.
   */
  readonly mail: MailConfig | null;
  /** Life of one browser session, in seconds. */
  readonly sessionMaxAgeSeconds: number;
  /**
   * The accounts of the installation (records 0108, 0112).
   *
   * `limitBytes` is the byte limit that a new account starts with. An
   * administrator changes the limit of one account afterwards.
   * `invitationLifetimeHours` is how long a new invitation stays valid.
   * `pendingHours` is how long a sign-up of open registration waits for its
   * verification before the hourly run removes it (record 0114).
   * `proofDifficulty` is how many leading zero bits the proof of work of a
   * sign-up needs (record 0115). `standing` and `removeAfterSeconds` are the
   * controls that a new account starts with (record 0189): with no setting
   * it is active with no removal time, as before. These three members are
   * the `NewAccountSettings` of a registration.
   */
  readonly accounts: NewAccountSettings & {
    readonly limitBytes: bigint;
    readonly invitationLifetimeHours: number;
    readonly pendingHours: number;
    readonly proofDifficulty: number;
  };
  /**
   * Whether a new password is checked against the range service of Have I
   * Been Pwned (record 0116). An installation with no outbound network sets
   * `NOTESAPP_BREACH_CHECK` to `off`.
   */
  readonly breachCheck: boolean;
  /**
   * The terms and the privacy notice of the installation, or `null` for
   * none (record 0120). The operator names both, or neither. A document
   * that a file holds has the address of its page on the canonical origin
   * (record 0140).
   */
  readonly legalDocuments: LegalDocuments | null;
  /**
   * The Markdown file of each legal document that this server serves, or
   * `null` for a document at an external address (record 0140).
   * `loadLegalTexts` reads them.
   */
  readonly legalFiles: LegalFiles;
  /**
   * The one secret of the operator API, or `null` for none (record 0190).
   * With no secret every operator operation answers 404 with the code
   * `operator_off`. It comes from `NOTESAPP_OPERATOR_TOKEN` or from the file
   * of `NOTESAPP_OPERATOR_TOKEN_FILE` (record 0207).
   */
  readonly operatorToken: string | null;
  /**
   * The account portal of the operator, as a full address with no query, or
   * `null` (record 0190). `openAccountPortal` answers a path of it with a
   * handoff token, and a locked account links it (record 0201). A portal
   * needs `operatorToken`, because it redeems the handoff through the
   * operator API, so startup stops when it has none.
   */
  readonly accountPortal: string | null;
  /**
   * The registration policy that the environment names, or `null` for none
   * (record 0206). A named policy wins over the setting of the application
   * and locks it, and the server writes it into the stored row at its start.
   * The open policy needs the mail transport and both legal documents of the
   * environment, so startup stops without them.
   */
  readonly registrationPolicy: RegistrationPolicy | null;
  /**
   * The caps of the installation for one calendar month in UTC (record
   * 0193), each `null` for none: the bytes of the published pages, the bytes
   * of the downloads, and the write calls and the read calls to an S3 store.
   * With no cap and no limit of an account, nothing is checked.
   */
  readonly usageCaps: UsageCaps;
  /**
   * The stop of this process.
   *
   * `gracePeriodMs` is the wait between the moment the readiness answer
   * reports the stop and the moment the listener closes. A proxy reads that
   * answer inside the window and sends the next request elsewhere. A
   * deployment with no proxy in front sets it to zero.
   *
   * `deadlineMs` is the whole budget from the stop signal to a forced exit, so
   * one request that never completes cannot hold the process. It must be
   * longer than the grace period. The stop of the container platform must
   * allow at least this much time.
   */
  readonly shutdown: {
    readonly gracePeriodMs: number;
    readonly deadlineMs: number;
  };
};

/** The object store that the environment names (record 0192). */
export type ObjectStoreConfig =
  | { readonly kind: 'filesystem' }
  | {
      readonly kind: 's3';
      readonly bucket: string;
      readonly region: string;
      /** The address of the service, or `null` for AWS itself. */
      readonly endpoint: string | null;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
    };

/** Startup failure that names every rejected configuration entry. */
export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Server configuration is not usable:\n${issues.join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * What the operator reads when the start of the server fails.
 *
 * A configuration error states one line for each value that it refused, in
 * the words of this server. Each line names the variable and the form that it
 * needs, and never the value, so the operator reads it as it is, also when
 * the composition found it after the configuration was read. Any other
 * failure is the message of a library or of the operating system, which names
 * a file, a code or a stack, so the operator reads the one sentence of
 * `general` instead.
 */
export function startFailureMessage(error: unknown, general: string): string {
  return error instanceof ConfigError
    ? `notesapp: configuration error:\n${error.issues.join('\n')}\n`
    : `notesapp: ${general}\n`;
}

const variables = [
  'NOTESAPP_ORIGIN',
  'NOTESAPP_DATABASE_URL',
  'NOTESAPP_AUTH_DATABASE_URL',
  'NOTESAPP_STORAGE_ROOT',
  'NOTESAPP_AUTH_SECRET',
  'NOTESAPP_LOG_LEVEL',
  'NOTESAPP_MAX_BODY_BYTES',
  'NOTESAPP_MAX_HEADER_BYTES',
  'NOTESAPP_REQUEST_TIMEOUT_MS',
] as const;

/**
 * Values that a deployment may leave unset.
 *
 * An absent value has a stated meaning: no additional origin serves the
 * canonical origin and nothing else, no mail transport disables recovery by
 * email, and no trusted proxy believes no forwarded header. An empty value is
 * treated as absent, so a placeholder in a Compose file cannot enable a half
 * configured transport and cannot grant trust that nobody named.
 */
export const optionalVariables = [
  'NOTESAPP_ADDITIONAL_ORIGINS',
  'NOTESAPP_PUBLISHED_ORIGIN',
  'NOTESAPP_MCP_ORIGIN',
  'NOTESAPP_HOST',
  'NOTESAPP_PORT',
  'NOTESAPP_TRUSTED_PROXIES',
  'NOTESAPP_SMTP_URL',
  'NOTESAPP_SMTP_HOST',
  'NOTESAPP_SMTP_PORT',
  'NOTESAPP_SMTP_SECURITY',
  'NOTESAPP_SMTP_USERNAME',
  'NOTESAPP_SMTP_PASSWORD',
  'NOTESAPP_MAIL_FROM',
  'NOTESAPP_SESSION_MAX_AGE_S',
  'NOTESAPP_RATE_LIMIT_WINDOW_S',
  'NOTESAPP_RATE_LIMIT_MAX',
  'NOTESAPP_SHUTDOWN_GRACE_MS',
  'NOTESAPP_SHUTDOWN_DEADLINE_MS',
  'NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS',
  'NOTESAPP_ACCOUNT_LIMIT_BYTES',
  'NOTESAPP_INVITATION_LIFETIME_HOURS',
  'NOTESAPP_PENDING_ACCOUNT_HOURS',
  'NOTESAPP_SIGNUP_DIFFICULTY',
  'NOTESAPP_TERMS_URL',
  'NOTESAPP_TERMS_FILE',
  'NOTESAPP_TERMS_VERSION',
  'NOTESAPP_PRIVACY_URL',
  'NOTESAPP_PRIVACY_FILE',
  'NOTESAPP_PRIVACY_VERSION',
  'NOTESAPP_BREACH_CHECK',
  'NOTESAPP_OBJECT_STORE',
  'NOTESAPP_S3_BUCKET',
  'NOTESAPP_S3_REGION',
  'NOTESAPP_S3_ENDPOINT',
  'NOTESAPP_S3_ACCESS_KEY_ID',
  'NOTESAPP_S3_SECRET_ACCESS_KEY',
  'NOTESAPP_NEW_ACCOUNT_STANDING',
  'NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER',
  'NOTESAPP_OPERATOR_TOKEN',
  'NOTESAPP_ACCOUNT_PORTAL_URL',
  'NOTESAPP_REGISTRATION_POLICY',
  'NOTESAPP_PUBLISHED_TRANSFER_CAP_BYTES',
  'NOTESAPP_DOWNLOAD_CAP_BYTES',
  'NOTESAPP_OBJECT_WRITE_CAP',
  'NOTESAPP_OBJECT_READ_CAP',
] as const;

/**
 * Every secret of the server and the variable of its file.
 *
 * An operator names each secret as the variable or as its file, never both
 * (record 0207). A file suits Compose, which mounts each secret, and the
 * variable suits a platform that gives a service variables only.
 * `loadProtectedEnvironment` reads each file before the configuration, so
 * every secret of the server follows one rule.
 */
export const protectedFiles = {
  NOTESAPP_DATABASE_URL: 'NOTESAPP_DATABASE_URL_FILE',
  NOTESAPP_AUTH_DATABASE_URL: 'NOTESAPP_AUTH_DATABASE_URL_FILE',
  NOTESAPP_AUTH_SECRET: 'NOTESAPP_AUTH_SECRET_FILE',
  NOTESAPP_SMTP_URL: 'NOTESAPP_SMTP_URL_FILE',
  NOTESAPP_SMTP_PASSWORD: 'NOTESAPP_SMTP_PASSWORD_FILE',
  NOTESAPP_S3_ACCESS_KEY_ID: 'NOTESAPP_S3_ACCESS_KEY_ID_FILE',
  NOTESAPP_S3_SECRET_ACCESS_KEY: 'NOTESAPP_S3_SECRET_ACCESS_KEY_FILE',
  NOTESAPP_OPERATOR_TOKEN: 'NOTESAPP_OPERATOR_TOKEN_FILE',
} as const;

/** The name of one secret of the server. */
type ProtectedName = keyof typeof protectedFiles;

/** Whether a variable holds a value. An empty value is not set. */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * The variable that the operator set for one secret: its file variable when
 * that names a file, or else the variable itself. A message about a secret
 * names this one, so the operator reads the name that they wrote.
 */
function secretSource(
  environment: Readonly<Record<string, string | undefined>>,
  name: ProtectedName,
): string {
  const file = protectedFiles[name];
  return isSet(environment[file]) ? file : name;
}

/**
 * Every variable that this server reads, each name once.
 *
 * The configuration reference of the guide names each one, and
 * `tests/integration/docs-site.test.ts` holds that page to this list, so a new
 * variable reaches the documentation in the change that adds it.
 */
export const serverVariables: readonly string[] = [
  ...variables,
  ...optionalVariables,
  ...Object.values(protectedFiles),
];

/**
 * The value of one protected file.
 *
 * A file usually ends with a line break, which is never part of the value. A
 * password can start or end with a space, so its file loses the final line
 * break alone and reads as the variable reads. Every other value is a URL or
 * a secret that holds no space, so it loses the space around it.
 */
function protectedValue(name: string, text: string): string {
  return name === 'NOTESAPP_SMTP_PASSWORD'
    ? text.replace(/\r?\n$/, '')
    : text.trim();
}

type RawConfig = Record<(typeof variables)[number], string> &
  Partial<Record<(typeof optionalVariables)[number], string>>;

/** Loads protected configuration values from explicit files. */
export async function loadProtectedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<Record<string, string | undefined>> {
  const loaded: Record<string, string | undefined> = { ...environment };
  for (const [valueName, fileName] of Object.entries(protectedFiles)) {
    const direct = environment[valueName];
    const path = environment[fileName];
    if (
      direct !== undefined &&
      direct !== '' &&
      path !== undefined &&
      path !== ''
    )
      throw new ConfigError([
        `${valueName}: set either ${valueName} or ${fileName}, not both.`,
      ]);
    if (path === undefined || path === '') continue;
    let value: string;
    try {
      value = protectedValue(valueName, await readFile(path, 'utf8'));
    } catch {
      throw new ConfigError([
        `${fileName}: the protected file cannot be read.`,
      ]);
    }
    if (value === '')
      throw new ConfigError([`${fileName}: the protected file is empty.`]);
    loaded[valueName] = value;
  }
  return loaded;
}

const positiveInteger = { type: 'string', pattern: '^[1-9][0-9]{0,9}$' };
// A grace period of zero is a stated choice: the deployment has no proxy in
// front, so nothing has to observe the readiness answer before the listener
// closes.
const wholeNumber = { type: 'string', pattern: '^(0|[1-9][0-9]{0,9})$' };
const monthlyCap = { type: 'string', pattern: '^[1-9][0-9]{0,15}$' };

/**
 * The stop of a deployment that names no value of its own.
 *
 * Five seconds covers the readiness interval of a common reverse proxy, so the
 * proxy reads the stop before the listener closes. Twenty seconds is longer
 * than the grace period plus the idle bound of an upload, so a stop never ends
 * before the upload route itself would have refused a body that stopped
 * arriving. A body that is still arriving can meet the deadline, because a
 * deadline is what bounds the stop. Both values stay well inside the stop
 * period that `docker-compose.yml` gives the container.
 */
const defaultShutdownGraceMs = 5000;
const defaultShutdownDeadlineMs = 20000;

/**
 * The idle bound of an upload that names no value of its own.
 *
 * Ten seconds with no byte of the body is far longer than any pause of a
 * working connection and far shorter than the patience of a sender that
 * delivers almost nothing. It also keeps the stop coherent: the grace period
 * plus this bound stays inside the stop deadline, so a drain never ends before
 * the upload route itself would have refused.
 */
const defaultUploadIdleTimeoutMs = 10000;

/** One mebibyte, the unit of the file bounds below and of their messages. */
export const mebibyte = 1024 * 1024;

/** The largest attachment file of one upload. */
const attachmentBytes = 20 * mebibyte;

/**
 * The largest workspace archive of one import.
 *
 * It is `maxArchiveBytes` of `@notesapp/core`, the bound that the export
 * writer reads too, so every archive of an export comes back (issue 243).
 */
const archiveBytes = maxArchiveBytes;

/**
 * The room that a multipart body takes around its one file.
 *
 * The boundary lines, the part headers, and the small fields of the form sit
 * beside the file in the same body. The handler still refuses a file past its
 * own bound, so this room only keeps the body bound from firing first.
 */
const multipartEnvelopeBytes = 5 * mebibyte;

/**
 * The listening socket of a deployment that names no value of its own.
 *
 * Every interface is the default address, because the process usually runs in
 * a container and reaches the network through an address that it cannot know.
 * The image and the Compose file both publish port 3000 of that container on
 * the loopback address of the host. See
 * [decision 0042](../../../docs/decisions/0042-the-listening-socket-is-not-the-public-origin.md).
 */
const defaultListenHost = '0.0.0.0';
const defaultListenPort = 3000;

/** The highest port number of TCP. */
const highestPort = 65535;

/**
 * Values that this release does not read.
 *
 * A deployment that still sets one stops at startup. A silent drop would
 * narrow what the installation serves, and the person who runs it would only
 * find out at the next sign-in.
 */
const removedVariables: readonly (readonly [string, string])[] = [
  [
    'NOTESAPP_ALLOWED_HOSTS',
    'this installation does not read a host list. Name each full origin, with its scheme and its port, in NOTESAPP_ORIGIN and NOTESAPP_ADDITIONAL_ORIGINS.',
  ],
];

const configSchema: SchemaObject = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: [...variables],
  properties: {
    NOTESAPP_ORIGIN: {
      type: 'string',
      format: 'uri',
      pattern: '^https?://',
      maxLength: 256,
    },
    NOTESAPP_DATABASE_URL: {
      type: 'string',
      pattern: '^postgres(ql)?://',
      maxLength: 1024,
    },
    NOTESAPP_AUTH_DATABASE_URL: {
      type: 'string',
      pattern: '^postgres(ql)?://',
      maxLength: 1024,
    },
    NOTESAPP_STORAGE_ROOT: { type: 'string', pattern: '^/', maxLength: 1024 },
    // A short secret cannot protect a session cookie.
    NOTESAPP_AUTH_SECRET: { type: 'string', minLength: 32, maxLength: 512 },
    // The shape of one entry is decided by `served-origins.ts`, which refuses
    // a value that is not exactly one origin and names what to write instead.
    NOTESAPP_ADDITIONAL_ORIGINS: { type: 'string', maxLength: 1024 },
    NOTESAPP_PUBLISHED_ORIGIN: { type: 'string', maxLength: 1024 },
    NOTESAPP_MCP_ORIGIN: { type: 'string', maxLength: 1024 },
    NOTESAPP_HOST: { type: 'string', minLength: 1, maxLength: 255 },
    NOTESAPP_PORT: positiveInteger,
    // The shape of one entry is decided by `trusted-proxies.ts`, which refuses
    // a value that names no address and no range, and names what to write.
    NOTESAPP_TRUSTED_PROXIES: { type: 'string', maxLength: 1024 },
    NOTESAPP_LOG_LEVEL: { type: 'string', enum: [...logLevels] },
    NOTESAPP_MAX_BODY_BYTES: positiveInteger,
    NOTESAPP_MAX_HEADER_BYTES: positiveInteger,
    NOTESAPP_REQUEST_TIMEOUT_MS: positiveInteger,
    NOTESAPP_SMTP_URL: {
      type: 'string',
      pattern: '^smtps?://',
      maxLength: 1024,
    },
    NOTESAPP_SMTP_HOST: { type: 'string', maxLength: 255 },
    NOTESAPP_SMTP_PORT: positiveInteger,
    NOTESAPP_SMTP_SECURITY: { type: 'string', enum: [...mailSecurities] },
    NOTESAPP_SMTP_USERNAME: { type: 'string', maxLength: 320 },
    NOTESAPP_SMTP_PASSWORD: { type: 'string', maxLength: 1024 },
    NOTESAPP_MAIL_FROM: { type: 'string', minLength: 3, maxLength: 320 },
    NOTESAPP_SESSION_MAX_AGE_S: positiveInteger,
    NOTESAPP_RATE_LIMIT_WINDOW_S: positiveInteger,
    NOTESAPP_RATE_LIMIT_MAX: positiveInteger,
    NOTESAPP_SHUTDOWN_GRACE_MS: wholeNumber,
    NOTESAPP_SHUTDOWN_DEADLINE_MS: positiveInteger,
    NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS: positiveInteger,
    NOTESAPP_ACCOUNT_LIMIT_BYTES: {
      type: 'string',
      pattern: '^[1-9][0-9]{0,15}$',
    },
    NOTESAPP_INVITATION_LIFETIME_HOURS: positiveInteger,
    NOTESAPP_PENDING_ACCOUNT_HOURS: positiveInteger,
    NOTESAPP_SIGNUP_DIFFICULTY: positiveInteger,
    NOTESAPP_TERMS_URL: { type: 'string', maxLength: 2048 },
    NOTESAPP_TERMS_FILE: { type: 'string', pattern: '^/', maxLength: 1024 },
    NOTESAPP_TERMS_VERSION: {
      type: 'string',
      maxLength: maxLegalVersionLength,
    },
    NOTESAPP_PRIVACY_URL: { type: 'string', maxLength: 2048 },
    NOTESAPP_PRIVACY_FILE: { type: 'string', pattern: '^/', maxLength: 1024 },
    NOTESAPP_PRIVACY_VERSION: {
      type: 'string',
      maxLength: maxLegalVersionLength,
    },
    NOTESAPP_BREACH_CHECK: { type: 'string', enum: ['on', 'off'] },
    NOTESAPP_OBJECT_STORE: { type: 'string', enum: ['filesystem', 's3'] },
    // The rule of a bucket name that every S3 compatible store shares.
    NOTESAPP_S3_BUCKET: {
      type: 'string',
      pattern: '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$',
    },
    // R2 names `auto`, and AWS and MinIO name a region such as `us-east-1`.
    NOTESAPP_S3_REGION: { type: 'string', pattern: '^[a-z0-9-]{1,32}$' },
    NOTESAPP_S3_ENDPOINT: {
      type: 'string',
      format: 'uri',
      pattern: '^https?://',
      maxLength: 1024,
    },
    // A secret is checked where it is read, so no message of the schema
    // describes it.
    NOTESAPP_S3_ACCESS_KEY_ID: { type: 'string' },
    NOTESAPP_S3_SECRET_ACCESS_KEY: { type: 'string' },
    NOTESAPP_NEW_ACCOUNT_STANDING: {
      type: 'string',
      enum: [...controlStandings],
    },
    NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER: {
      type: 'string',
      pattern: '^[1-9][0-9]{0,3}d$',
    },
    NOTESAPP_OPERATOR_TOKEN: { type: 'string' },
    NOTESAPP_ACCOUNT_PORTAL_URL: { type: 'string', maxLength: 2048 },
    NOTESAPP_REGISTRATION_POLICY: {
      type: 'string',
      enum: [...registrationPolicies],
    },
    // A cap of a month is a whole count that a JSON number carries (record
    // 0193), so at most sixteen digits.
    NOTESAPP_PUBLISHED_TRANSFER_CAP_BYTES: monthlyCap,
    NOTESAPP_DOWNLOAD_CAP_BYTES: monthlyCap,
    NOTESAPP_OBJECT_WRITE_CAP: monthlyCap,
    NOTESAPP_OBJECT_READ_CAP: monthlyCap,
  },
};

const validate = compileSchema<RawConfig>(configSchema);

/**
 * Reads and validates the configuration. The error names each rejected
 * variable and never repeats its value, so a log cannot leak a secret.
 */
export function loadServerConfig(
  environment: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  // A file of a secret that nobody read would leave its secret unset in
  // silence, and the operator API or the object store would then be off.
  // Every caller reads the files through `loadProtectedEnvironment` first.
  const unread = Object.entries(protectedFiles).filter(
    ([name, file]) => isSet(environment[file]) && !isSet(environment[name]),
  );
  if (unread.length > 0)
    throw new Error(
      `notesapp: ${unread.map(([, file]) => file).join(', ')} names a file that was not read. Read the environment through loadProtectedEnvironment first.`,
    );
  const removed = removedVariables.flatMap(([name, advice]) => {
    const value = environment[name];
    return value === undefined || value === '' ? [] : [`${name}: ${advice}`];
  });
  if (removed.length > 0) throw new ConfigError(removed);
  const raw: Record<string, string> = { NOTESAPP_LOG_LEVEL: 'info' };
  for (const name of [...variables, ...optionalVariables]) {
    const value = environment[name];
    if (value !== undefined && value !== '') raw[name] = value;
  }
  if (!validate(raw))
    throw new ConfigError(
      describeIssues(validate.errors).map(
        (issue) => `${issue.path}: ${issue.message}`,
      ),
    );
  const mail = readMail(raw);
  if (!mail.ok) throw new ConfigError(mail.issues);
  const served = readServedOrigins(
    raw.NOTESAPP_ORIGIN,
    raw.NOTESAPP_ADDITIONAL_ORIGINS,
    raw.NOTESAPP_PUBLISHED_ORIGIN,
  );
  if (!served.ok) throw new ConfigError(served.issues);
  const canonical = served.origins[0]?.origin;
  if (canonical === undefined)
    throw new ConfigError([
      'NOTESAPP_ORIGIN: name the origin of this installation.',
    ]);
  const mcpOrigin =
    raw.NOTESAPP_MCP_ORIGIN === undefined
      ? null
      : readOrigin(raw.NOTESAPP_MCP_ORIGIN);
  if (raw.NOTESAPP_MCP_ORIGIN !== undefined && mcpOrigin === null)
    throw new ConfigError([
      'NOTESAPP_MCP_ORIGIN: name one full origin with no path or query.',
    ]);
  if (
    mcpOrigin !== null &&
    served.origins.some(
      (entry) =>
        entry.role === 'published' &&
        new URL(entry.origin).hostname === new URL(mcpOrigin).hostname,
    )
  )
    throw new ConfigError([
      'NOTESAPP_MCP_ORIGIN: use a host that is not the published host.',
    ]);
  const trusted = readTrustedProxies(raw.NOTESAPP_TRUSTED_PROXIES);
  if (!trusted.ok) throw new ConfigError(trusted.issues);
  const listen = {
    host: raw.NOTESAPP_HOST ?? defaultListenHost,
    port:
      raw.NOTESAPP_PORT === undefined
        ? defaultListenPort
        : Number(raw.NOTESAPP_PORT),
  };
  const shutdown = {
    gracePeriodMs:
      raw.NOTESAPP_SHUTDOWN_GRACE_MS === undefined
        ? defaultShutdownGraceMs
        : Number(raw.NOTESAPP_SHUTDOWN_GRACE_MS),
    deadlineMs:
      raw.NOTESAPP_SHUTDOWN_DEADLINE_MS === undefined
        ? defaultShutdownDeadlineMs
        : Number(raw.NOTESAPP_SHUTDOWN_DEADLINE_MS),
  };
  const partial: string[] = [];
  if (listen.port > highestPort)
    partial.push('NOTESAPP_PORT: name a port between 1 and 65535.');
  // The public port of the origin was the listening port before decision 0042.
  // A deployment that named one and no listening port would move from that
  // port to 3000 in silence, so it stops here instead and reads which value
  // states the listening port now.
  if (raw.NOTESAPP_PORT === undefined && new URL(canonical).port !== '')
    partial.push(
      'NOTESAPP_PORT: name the port that this server listens on. NOTESAPP_ORIGIN names the public address of this installation, and a proxy in front of the server can publish it on another port.',
    );
  if (shutdown.deadlineMs <= shutdown.gracePeriodMs)
    partial.push(
      'NOTESAPP_SHUTDOWN_DEADLINE_MS: the stop deadline must be longer than NOTESAPP_SHUTDOWN_GRACE_MS.',
    );
  const requestTimeoutMs = Number(raw.NOTESAPP_REQUEST_TIMEOUT_MS);
  const uploadIdleTimeoutMs =
    raw.NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS === undefined
      ? defaultUploadIdleTimeoutMs
      : Number(raw.NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS);
  if (uploadIdleTimeoutMs >= requestTimeoutMs)
    partial.push(
      'NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS: the idle bound of an upload must be shorter than NOTESAPP_REQUEST_TIMEOUT_MS. The request bound covers the whole body, so an idle bound that is not shorter never applies.',
    );
  if (raw.NOTESAPP_AUTH_DATABASE_URL === raw.NOTESAPP_DATABASE_URL)
    partial.push(
      'NOTESAPP_AUTH_DATABASE_URL: the identity connection must use its own role, not the runtime role.',
    );
  if (partial.length > 0) throw new ConfigError(partial);
  const accountPortal = readAccountPortal(raw.NOTESAPP_ACCOUNT_PORTAL_URL);
  const operatorToken = readOperatorToken(
    raw.NOTESAPP_OPERATOR_TOKEN,
    secretSource(environment, 'NOTESAPP_OPERATOR_TOKEN'),
  );
  // The portal gives each handoff token back to the operator API, so a
  // portal with the API off could never unlock an account (record 0190).
  if (accountPortal !== null && operatorToken === null)
    throw new ConfigError([
      'NOTESAPP_ACCOUNT_PORTAL_URL: the portal needs the operator API to unlock an account. Set NOTESAPP_OPERATOR_TOKEN or NOTESAPP_OPERATOR_TOKEN_FILE too, or remove NOTESAPP_ACCOUNT_PORTAL_URL.',
    ]);
  const legal = readLegalDocuments(raw, canonical);
  const registrationPolicy = readRegistrationPolicy(
    raw,
    mail.mail,
    legal.legalDocuments,
  );
  return {
    origin: canonical,
    mcpOrigin,
    databaseUrl: raw.NOTESAPP_DATABASE_URL,
    authDatabaseUrl: raw.NOTESAPP_AUTH_DATABASE_URL,
    storageRoot: raw.NOTESAPP_STORAGE_ROOT,
    objectStore: readObjectStore(raw, environment),
    authSecret: raw.NOTESAPP_AUTH_SECRET,
    servedOrigins: withMcpOrigin(served.origins, mcpOrigin),
    listen,
    trustedProxies: trusted.proxies,
    logLevel: isLogLevel(raw.NOTESAPP_LOG_LEVEL)
      ? raw.NOTESAPP_LOG_LEVEL
      : 'info',
    limits: {
      bodyBytes: Number(raw.NOTESAPP_MAX_BODY_BYTES),
      attachmentBytes,
      uploadBodyBytes: attachmentBytes + multipartEnvelopeBytes,
      archiveBytes,
      importPartBytes,
      headerBytes: Number(raw.NOTESAPP_MAX_HEADER_BYTES),
      requestTimeoutMs,
      uploadIdleTimeoutMs,
    },
    rateLimit: {
      windowSeconds:
        raw.NOTESAPP_RATE_LIMIT_WINDOW_S === undefined
          ? 60
          : Number(raw.NOTESAPP_RATE_LIMIT_WINDOW_S),
      max:
        raw.NOTESAPP_RATE_LIMIT_MAX === undefined
          ? 100
          : Number(raw.NOTESAPP_RATE_LIMIT_MAX),
    },
    mail: mail.mail,
    sessionMaxAgeSeconds:
      raw.NOTESAPP_SESSION_MAX_AGE_S === undefined
        ? 60 * 60 * 24 * 7
        : Number(raw.NOTESAPP_SESSION_MAX_AGE_S),
    shutdown,
    accounts: readAccounts(raw),
    breachCheck: raw.NOTESAPP_BREACH_CHECK !== 'off',
    operatorToken,
    accountPortal,
    registrationPolicy,
    usageCaps: readUsageCaps(raw),
    ...legal,
  };
}

/** What a missing part of the open policy names (records 0114, 0191). */
const openPolicyIssues: Readonly<Record<OpenRegistrationPart, string>> = {
  mail: 'NOTESAPP_REGISTRATION_POLICY: the open policy needs a mail server in the environment, so a sign-up can prove its address. Set NOTESAPP_SMTP_URL or the NOTESAPP_SMTP_HOST fields, or set NOTESAPP_REGISTRATION_POLICY to invitation.',
  'legal-documents':
    'NOTESAPP_REGISTRATION_POLICY: the open policy needs the terms and the privacy notice in the environment. Set the NOTESAPP_TERMS_ and NOTESAPP_PRIVACY_ variables, or set NOTESAPP_REGISTRATION_POLICY to invitation.',
};

/**
 * The registration policy of the environment, or `null` (record 0206).
 *
 * The open policy needs every part that records 0114 and 0191 name, and the
 * environment must name each one, so the whole open set has one source and
 * no change in the application can remove a part of it. A missing part stops
 * startup. Each message names the variable and never its value.
 */
function readRegistrationPolicy(
  raw: RawConfig,
  mail: MailConfig | null,
  legalDocuments: LegalDocuments | null,
): RegistrationPolicy | null {
  const policy = registrationPolicies.find(
    (entry) => entry === raw.NOTESAPP_REGISTRATION_POLICY,
  );
  if (policy === undefined) return null;
  if (policy === 'invitation') return policy;
  const missing = openRegistrationMissing({
    mail: mail !== null,
    legalDocuments: legalDocuments !== null,
  });
  if (missing.length > 0)
    throw new ConfigError(missing.map((part) => openPolicyIssues[part]));
  return policy;
}

/**
 * The caps of the installation for one month (record 0193). Each is a whole
 * number above zero that a JSON number carries, and an empty value is no cap.
 */
function readUsageCaps(raw: RawConfig): UsageCaps {
  const issues: string[] = [];
  const read = (name: (typeof capVariables)[number]): number | null => {
    const value = raw[name];
    if (value === undefined) return null;
    const cap = Number(value);
    if (Number.isSafeInteger(cap)) return cap;
    issues.push(
      `${name}: name at most ${String(Number.MAX_SAFE_INTEGER)}, or leave it empty for no cap.`,
    );
    return null;
  };
  const caps = {
    publishedTransferBytes: read('NOTESAPP_PUBLISHED_TRANSFER_CAP_BYTES'),
    downloadBytes: read('NOTESAPP_DOWNLOAD_CAP_BYTES'),
    objectWrites: read('NOTESAPP_OBJECT_WRITE_CAP'),
    objectReads: read('NOTESAPP_OBJECT_READ_CAP'),
  };
  if (issues.length > 0) throw new ConfigError(issues);
  return caps;
}

/** The four caps of a month, in the order of the guide. */
const capVariables = [
  'NOTESAPP_PUBLISHED_TRANSFER_CAP_BYTES',
  'NOTESAPP_DOWNLOAD_CAP_BYTES',
  'NOTESAPP_OBJECT_WRITE_CAP',
  'NOTESAPP_OBJECT_READ_CAP',
] as const;

/** The settings of an S3 store that are not secret, in the order of the guide. */
const s3Settings = [
  'NOTESAPP_S3_BUCKET',
  'NOTESAPP_S3_REGION',
  'NOTESAPP_S3_ENDPOINT',
] as const;

/** The key pair of an S3 store, each a secret (record 0207). */
const s3Secrets = [
  'NOTESAPP_S3_ACCESS_KEY_ID',
  'NOTESAPP_S3_SECRET_ACCESS_KEY',
] as const;

/**
 * The object store of the environment (record 0192).
 *
 * The file store is the default and needs nothing more. An S3 store needs
 * its bucket, its region and its key pair, and names its endpoint unless it
 * is AWS itself. A setting of an S3 store beside the file store stops
 * startup, because the operator meant one of the two and the server cannot
 * tell which. A message about a key names the variable that the operator
 * set, the key or its file, and never the key.
 */
function readObjectStore(
  raw: RawConfig,
  environment: Readonly<Record<string, string | undefined>>,
): ObjectStoreConfig {
  if (raw.NOTESAPP_OBJECT_STORE !== 's3') {
    const named = [
      ...s3Settings.filter((name) => raw[name] !== undefined),
      ...s3Secrets
        .filter((name) => raw[name] !== undefined)
        .map((name) => secretSource(environment, name)),
    ];
    if (named.length > 0)
      throw new ConfigError(
        named.map(
          (name) =>
            `${name}: set NOTESAPP_OBJECT_STORE to s3 to use an S3 compatible store, or remove ${name}.`,
        ),
      );
    return { kind: 'filesystem' };
  }
  const {
    NOTESAPP_S3_BUCKET: bucket,
    NOTESAPP_S3_REGION: region,
    NOTESAPP_S3_ACCESS_KEY_ID: accessKeyId,
    NOTESAPP_S3_SECRET_ACCESS_KEY: secretAccessKey,
  } = raw;
  if (
    bucket === undefined ||
    region === undefined ||
    accessKeyId === undefined ||
    secretAccessKey === undefined
  )
    throw new ConfigError([
      ...s3Settings
        .filter(
          (name) => name !== 'NOTESAPP_S3_ENDPOINT' && raw[name] === undefined,
        )
        .map((name) => `${name}: an S3 compatible store needs it.`),
      ...s3Secrets
        .filter((name) => raw[name] === undefined)
        .map(
          (name) =>
            `${name}: an S3 compatible store needs it. Set ${name} or ${protectedFiles[name]}.`,
        ),
    ]);
  return {
    kind: 's3',
    bucket,
    region,
    endpoint: raw.NOTESAPP_S3_ENDPOINT ?? null,
    accessKeyId,
    secretAccessKey,
  };
}

/** The settings that open the object store of a configuration. */
export function objectStoreSettings(
  config: Pick<ServerConfig, 'objectStore' | 'storageRoot'>,
): ObjectStoreSettings {
  const store = config.objectStore;
  if (store.kind === 'filesystem')
    return { kind: 'filesystem', root: config.storageRoot };
  return {
    kind: 's3',
    bucket: store.bucket,
    region: store.region,
    endpoint: store.endpoint,
    accessKeyId: store.accessKeyId,
    secretAccessKey: store.secretAccessKey,
  };
}

/** The separate variables of the mail server, in the order of a message. */
const mailFieldVariables = [
  'NOTESAPP_SMTP_HOST',
  'NOTESAPP_SMTP_PORT',
  'NOTESAPP_SMTP_SECURITY',
  'NOTESAPP_SMTP_USERNAME',
  'NOTESAPP_SMTP_PASSWORD',
] as const;

/** What each refused field of the mail server names. */
const mailFieldIssues: Readonly<Record<MailSettingsProblem, string>> = {
  host: 'NOTESAPP_SMTP_HOST: name the host of the mail server, with no scheme and no port.',
  port: 'NOTESAPP_SMTP_PORT: name a port between 1 and 65535.',
  security: `NOTESAPP_SMTP_SECURITY: name one of ${mailSecurities.join(', ')}.`,
  username:
    'NOTESAPP_SMTP_USERNAME: the user name holds a character that a mail server cannot take.',
  password:
    'NOTESAPP_SMTP_PASSWORD: the password holds a character that a mail server cannot take.',
  sender: `NOTESAPP_MAIL_FROM: name one address, or a name and an address, for example ${productName} <no-reply@example.com>.`,
};

/**
 * The mail transport of the environment, from one URL or from the fields.
 *
 * The fields pass the same rule as the mail settings of the application
 * (record 0148), so one transport reads the same in either place. Every
 * message names the variable and never repeats its value.
 */
function readMail(
  raw: Partial<Record<(typeof optionalVariables)[number], string>>,
):
  | { readonly ok: true; readonly mail: MailConfig | null }
  | { readonly ok: false; readonly issues: readonly string[] } {
  const named = mailFieldVariables.filter((name) => raw[name] !== undefined);
  const from = raw.NOTESAPP_MAIL_FROM;
  if (raw.NOTESAPP_SMTP_URL !== undefined) {
    if (named.length > 0)
      return {
        ok: false,
        issues: [
          `NOTESAPP_SMTP_URL: set the mail server as one URL or as separate fields, not both. Remove NOTESAPP_SMTP_URL or ${named.join(', ')}.`,
        ],
      };
    if (from === undefined)
      return {
        ok: false,
        issues: [
          'NOTESAPP_MAIL_FROM: a mail transport also needs a sender address.',
        ],
      };
    return {
      ok: true,
      mail: { kind: 'url', smtpUrl: raw.NOTESAPP_SMTP_URL, from },
    };
  }
  if (named.length === 0) return { ok: true, mail: null };
  const issues: string[] = [];
  if (raw.NOTESAPP_SMTP_HOST === undefined)
    issues.push('NOTESAPP_SMTP_HOST: a mail server needs a host.');
  if (raw.NOTESAPP_SMTP_PORT === undefined)
    issues.push('NOTESAPP_SMTP_PORT: a mail server needs a port.');
  if (raw.NOTESAPP_SMTP_SECURITY === undefined)
    issues.push(
      `NOTESAPP_SMTP_SECURITY: a mail server needs a security mode, one of ${mailSecurities.join(', ')}.`,
    );
  // A password with no user name signs in as nobody, and a user name with
  // no password fails at the first message. Both stop here instead.
  if (
    raw.NOTESAPP_SMTP_USERNAME !== undefined &&
    raw.NOTESAPP_SMTP_PASSWORD === undefined
  )
    issues.push(
      'NOTESAPP_SMTP_PASSWORD: a user name also needs a password. Set NOTESAPP_SMTP_PASSWORD or NOTESAPP_SMTP_PASSWORD_FILE.',
    );
  if (
    raw.NOTESAPP_SMTP_PASSWORD !== undefined &&
    raw.NOTESAPP_SMTP_USERNAME === undefined
  )
    issues.push('NOTESAPP_SMTP_USERNAME: a password also needs a user name.');
  if (from === undefined)
    issues.push(
      'NOTESAPP_MAIL_FROM: a mail transport also needs a sender address.',
    );
  if (issues.length > 0) return { ok: false, issues };
  const read = readMailSettings({
    host: raw.NOTESAPP_SMTP_HOST ?? '',
    port: Number(raw.NOTESAPP_SMTP_PORT),
    security: raw.NOTESAPP_SMTP_SECURITY ?? '',
    username: raw.NOTESAPP_SMTP_USERNAME ?? null,
    password: raw.NOTESAPP_SMTP_PASSWORD ?? null,
    sender: from ?? '',
  });
  if (!read.ok) return { ok: false, issues: [mailFieldIssues[read.problem]] };
  return { ok: true, mail: { kind: 'fields', fields: read.value } };
}

/**
 * The account portal of the operator, or `null` (record 0190).
 *
 * A path joins it as text, so it is a full http or https address with no
 * query, no fragment, no user and no final slash. Any other value stops
 * startup rather than sending a person to an address that nobody named.
 */
function readAccountPortal(value: string | undefined): string | null {
  if (value === undefined) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError([
      'NOTESAPP_ACCOUNT_PORTAL_URL: name a full http or https address.',
    ]);
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  )
    throw new ConfigError([
      'NOTESAPP_ACCOUNT_PORTAL_URL: name a full http or https address with no query, no fragment and no user, for example https://billing.example.com.',
    ]);
  return url.href.replace(/\/+$/, '');
}

/** The shortest operator token that the server takes. */
export const minOperatorTokenLength = 32;

/**
 * The one secret of the operator API (record 0190), or `null` when the
 * environment names none.
 *
 * It comes from the variable or from its file (record 0207), and a file
 * loses the space around its value. A value shorter than 32 characters and a
 * value with a space or a control character inside it stop startup, so the
 * API never opens with a guessable or a broken secret. `source` is the
 * variable that the operator set, and the error never repeats the value.
 */
function readOperatorToken(
  value: string | undefined,
  source: string,
): string | null {
  if (value === undefined) return null;
  if (value.length < minOperatorTokenLength || value.length > 512)
    throw new ConfigError([
      `${source}: the operator secret must have ${String(minOperatorTokenLength)} to 512 characters.`,
    ]);
  if (!/^[\x21-\x7e]+$/.test(value))
    throw new ConfigError([
      `${source}: the operator secret must hold no space and no control character.`,
    ]);
  return value;
}

/** The address of one document: a full http or https URL, or `null`. */
function documentUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export { legalDocumentNames, type LegalDocumentName } from '@notesapp/core';

/** The Markdown file of each served legal document, or `null`. */
export type LegalFiles = Readonly<Record<LegalDocumentName, string | null>>;

/** The path of the page of one served legal document (record 0140). */
export function legalDocumentPath(name: LegalDocumentName): string {
  return `/legal/${name}`;
}

/** The three variables of one legal document. */
const legalVariables = {
  terms: {
    url: 'NOTESAPP_TERMS_URL',
    file: 'NOTESAPP_TERMS_FILE',
    version: 'NOTESAPP_TERMS_VERSION',
  },
  privacy: {
    url: 'NOTESAPP_PRIVACY_URL',
    file: 'NOTESAPP_PRIVACY_FILE',
    version: 'NOTESAPP_PRIVACY_VERSION',
  },
} as const;

/**
 * The legal documents of the installation (records 0120 and 0140).
 *
 * Each document comes with its version and exactly one source: an external
 * address, or a Markdown file that this server serves on the canonical
 * origin. The two documents come together or not at all, so no installation
 * asks for consent to one document alone, to a document with no address, or
 * to a document with no version.
 */
function readLegalDocuments(
  raw: RawConfig,
  canonical: string,
): Pick<ServerConfig, 'legalDocuments' | 'legalFiles'> {
  const named = legalDocumentNames.flatMap((name) =>
    Object.values(legalVariables[name]).filter(
      (variable) => raw[variable] !== undefined,
    ),
  );
  if (named.length === 0)
    return {
      legalDocuments: null,
      legalFiles: { terms: null, privacy: null },
    };
  const issues: string[] = [];
  const read = (name: LegalDocumentName) => {
    const variables = legalVariables[name];
    const address = raw[variables.url];
    const file = raw[variables.file];
    const version = raw[variables.version];
    if (address !== undefined && file !== undefined)
      issues.push(
        `${variables.file}: name the document by ${variables.url} or by ${variables.file}, not both.`,
      );
    if ((address === undefined && file === undefined) || version === undefined)
      issues.push(
        `${variables.version}: name the terms and the privacy notice, each with an address or a file and a version, or name none of them.`,
      );
    const url =
      address === undefined
        ? `${canonical}${legalDocumentPath(name)}`
        : documentUrl(address);
    if (url === null)
      issues.push(`${variables.url}: name a full http or https address.`);
    return {
      document: { url: url ?? '', version: version ?? '' },
      file: address === undefined ? (file ?? null) : null,
    };
  };
  const terms = read('terms');
  const privacy = read('privacy');
  if (issues.length > 0) throw new ConfigError([...new Set(issues)]);
  return {
    legalDocuments: { terms: terms.document, privacy: privacy.document },
    legalFiles: { terms: terms.file, privacy: privacy.file },
  };
}

/** The Markdown text of each served legal document, or `null`. */
export type LegalTexts = Readonly<Record<LegalDocumentName, string | null>>;

/** The largest legal document that this server reads. */
export const maxLegalDocumentBytes = maxLegalTextBytes;

export { templateBlanks } from '@notesapp/core';

/**
 * Reads the Markdown file of each served legal document (record 0140).
 *
 * A file that cannot be read, an empty file, a file past the bound and a file
 * that still holds a blank of the template all stop startup, so a person never
 * reads a document that the operator did not finish.
 */
export async function loadLegalTexts(
  config: Pick<ServerConfig, 'legalFiles'>,
): Promise<LegalTexts> {
  const issues: string[] = [];
  const read = async (name: LegalDocumentName): Promise<string | null> => {
    const path = config.legalFiles[name];
    if (path === null) return null;
    const variable = legalVariables[name].file;
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      issues.push(`${variable}: the file cannot be read.`);
      return null;
    }
    if (Buffer.byteLength(text, 'utf8') > maxLegalDocumentBytes) {
      issues.push(
        `${variable}: the file is larger than ${String(maxLegalDocumentBytes / 1024)} KiB.`,
      );
      return null;
    }
    if (text.trim() === '') {
      issues.push(`${variable}: the file is empty.`);
      return null;
    }
    const blanks = templateBlanks(text);
    if (blanks.length > 0)
      issues.push(
        `${variable}: fill each blank of the template first. The file still holds ${blanks.join(', ')}.`,
      );
    return text;
  };
  const terms = await read('terms');
  const privacy = await read('privacy');
  if (issues.length > 0) throw new ConfigError(issues);
  return { terms, privacy };
}

/**
 * The account settings of the configuration, with their bounds.
 *
 * The largest limit is the largest integer that a JSON answer carries without
 * loss, and the longest invitation lasts one year.
 */
function readAccounts(raw: RawConfig): ServerConfig['accounts'] {
  const limitBytes =
    raw.NOTESAPP_ACCOUNT_LIMIT_BYTES === undefined
      ? defaultAccountLimitBytes
      : BigInt(raw.NOTESAPP_ACCOUNT_LIMIT_BYTES);
  const invitationLifetimeHours =
    raw.NOTESAPP_INVITATION_LIFETIME_HOURS === undefined
      ? defaultInvitationLifetimeHours
      : Number(raw.NOTESAPP_INVITATION_LIFETIME_HOURS);
  const pendingHours =
    raw.NOTESAPP_PENDING_ACCOUNT_HOURS === undefined
      ? defaultPendingAccountHours
      : Number(raw.NOTESAPP_PENDING_ACCOUNT_HOURS);
  const proofDifficulty =
    raw.NOTESAPP_SIGNUP_DIFFICULTY === undefined
      ? defaultProofDifficulty
      : Number(raw.NOTESAPP_SIGNUP_DIFFICULTY);
  const issues: string[] = [];
  if (
    proofDifficulty < minProofDifficulty ||
    proofDifficulty > maxProofDifficulty
  )
    issues.push(
      `NOTESAPP_SIGNUP_DIFFICULTY: name a number from ${String(minProofDifficulty)} to ${String(maxProofDifficulty)}.`,
    );
  if (limitBytes > maxAccountLimitBytes)
    issues.push(
      `NOTESAPP_ACCOUNT_LIMIT_BYTES: name at most ${maxAccountLimitBytes.toString()} bytes.`,
    );
  if (invitationLifetimeHours > maxInvitationLifetimeHours)
    issues.push(
      `NOTESAPP_INVITATION_LIFETIME_HOURS: name at most ${String(maxInvitationLifetimeHours)} hours.`,
    );
  if (pendingHours > maxPendingAccountHours)
    issues.push(
      `NOTESAPP_PENDING_ACCOUNT_HOURS: name at most ${String(maxPendingAccountHours)} hours.`,
    );
  // The controls of a new account (record 0189). With no setting a new
  // account is active and has no removal time, as before. Only a locked
  // account has a removal time, so a time with no locked standing stops
  // startup rather than doing nothing.
  const standing =
    raw.NOTESAPP_NEW_ACCOUNT_STANDING === 'locked' ? 'locked' : 'active';
  const removeAfterDays =
    raw.NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER === undefined
      ? null
      : Number(raw.NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER.slice(0, -1));
  if (removeAfterDays !== null && standing !== 'locked')
    issues.push(
      'NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER: only a locked account has a removal time. Set NOTESAPP_NEW_ACCOUNT_STANDING to locked, or remove this setting.',
    );
  if (removeAfterDays !== null && removeAfterDays > maxRemoveAfterDays)
    issues.push(
      `NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER: name at most ${String(maxRemoveAfterDays)} days, for example 30d.`,
    );
  if (issues.length > 0) throw new ConfigError(issues);
  return {
    limitBytes,
    standing,
    removeAfterSeconds:
      removeAfterDays === null ? null : removeAfterDays * 24 * 60 * 60,
    invitationLifetimeHours,
    pendingHours,
    proofDifficulty,
  };
}
