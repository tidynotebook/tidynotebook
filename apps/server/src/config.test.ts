import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ConfigError,
  loadServerConfig,
  mebibyte,
  optionalVariables,
} from './config.ts';

const valid: Record<string, string> = {
  NOTESAPP_ORIGIN: 'http://127.0.0.1',
  NOTESAPP_DATABASE_URL: 'postgres://notesapp:notesapp@127.0.0.1:5432/notesapp',
  NOTESAPP_AUTH_DATABASE_URL:
    'postgres://notesapp_auth:notesapp_auth@127.0.0.1:5432/notesapp',
  NOTESAPP_STORAGE_ROOT: '/var/lib/notesapp',
  NOTESAPP_AUTH_SECRET: 'test-secret-value-for-integration-checks',
  NOTESAPP_LOG_LEVEL: 'warn',
  NOTESAPP_MAX_BODY_BYTES: '1048576',
  NOTESAPP_MAX_HEADER_BYTES: '16384',
  NOTESAPP_REQUEST_TIMEOUT_MS: '60000',
};

/** @param overrides values that replace or remove an entry. */
function environment(
  overrides: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return { ...valid, ...overrides };
}

await test('a complete environment produces a configuration', () => {
  const config = loadServerConfig(valid);
  assert.equal(config.origin, 'http://127.0.0.1');
  assert.deepEqual(config.servedOrigins, [
    { origin: 'http://127.0.0.1', role: 'application' },
  ]);
  assert.equal(config.logLevel, 'warn');
  assert.equal(config.limits.bodyBytes, 1048576);
  assert.equal(config.limits.headerBytes, 16384);
  assert.equal(config.limits.requestTimeoutMs, 60000);
  assert.equal(config.limits.uploadIdleTimeoutMs, 10000);
  assert.deepEqual(config.rateLimit, { windowSeconds: 60, max: 100 });
});

await test('every body limit is one field of the limits', () => {
  // The upload and the import each carry one file in a multipart body, so
  // each body bound holds its file bound and the room of the form around it.
  const { limits } = loadServerConfig(valid);
  assert.equal(limits.attachmentBytes, 20 * mebibyte);
  assert.equal(limits.archiveBytes, 100 * mebibyte);
  assert.ok(limits.uploadBodyBytes > limits.attachmentBytes);
  assert.ok(limits.importBodyBytes > limits.archiveBytes);
  assert.equal(
    limits.uploadBodyBytes - limits.attachmentBytes,
    limits.importBodyBytes - limits.archiveBytes,
  );
});

await test('the public route rate limit is explicit and configurable', () => {
  assert.deepEqual(
    loadServerConfig(
      environment({
        NOTESAPP_RATE_LIMIT_WINDOW_S: '30',
        NOTESAPP_RATE_LIMIT_MAX: '8',
      }),
    ).rateLimit,
    { windowSeconds: 30, max: 8 },
  );
});

await test('the identity connection must use its own role', () => {
  assert.throws(
    () =>
      loadServerConfig(
        environment({
          NOTESAPP_AUTH_DATABASE_URL: valid.NOTESAPP_DATABASE_URL,
        }),
      ),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) =>
        issue.includes('NOTESAPP_AUTH_DATABASE_URL'),
      ),
  );
});

await test('a mail transport needs a sender address', () => {
  assert.throws(
    () =>
      loadServerConfig(
        environment({ NOTESAPP_SMTP_URL: 'smtps://mail.invalid' }),
      ),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) => issue.includes('NOTESAPP_MAIL_FROM')),
  );
  assert.equal(loadServerConfig(valid).mail, null);
});

await test('the listening socket has a default and takes named values', () => {
  assert.deepEqual(loadServerConfig(valid).listen, {
    host: '0.0.0.0',
    port: 3000,
  });
  assert.deepEqual(
    loadServerConfig(
      environment({ NOTESAPP_HOST: '127.0.0.1', NOTESAPP_PORT: '8080' }),
    ).listen,
    { host: '127.0.0.1', port: 8080 },
  );
});

await test('the public port of the origin is not the listening port', () => {
  // Decision 0042. The proxy in front publishes 8443, and the server listens
  // on the port that names it.
  assert.deepEqual(
    loadServerConfig(
      environment({
        NOTESAPP_ORIGIN: 'https://notes.example.com:8443',
        NOTESAPP_PORT: '3000',
      }),
    ).listen,
    { host: '0.0.0.0', port: 3000 },
  );
});

await test('an origin with a port needs a listening port', () => {
  assert.throws(
    () =>
      loadServerConfig(
        environment({ NOTESAPP_ORIGIN: 'https://notes.example.com:8443' }),
      ),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) => issue.startsWith('NOTESAPP_PORT:')),
  );
  // The default port of the scheme names no port at all, so it asks for
  // nothing.
  assert.equal(
    loadServerConfig(
      environment({ NOTESAPP_ORIGIN: 'https://notes.example.com:443' }),
    ).listen.port,
    3000,
  );
});

await test('a listening port outside the range stops startup', () => {
  for (const value of ['0', '65536', '99999', 'http']) {
    assert.throws(
      () => loadServerConfig(environment({ NOTESAPP_PORT: value })),
      (error: unknown) => error instanceof ConfigError,
    );
  }
});

await test('a deployment trusts no proxy until it names one', () => {
  assert.deepEqual(loadServerConfig(valid).trustedProxies, []);
  assert.deepEqual(
    loadServerConfig(environment({ NOTESAPP_TRUSTED_PROXIES: '' }))
      .trustedProxies,
    [],
  );
  assert.deepEqual(
    loadServerConfig(
      environment({ NOTESAPP_TRUSTED_PROXIES: '10.5.0.2, uniquelocal' }),
    ).trustedProxies,
    ['10.5.0.2', 'uniquelocal'],
  );
});

await test('a proxy that is not an address or a range stops startup', () => {
  assert.throws(
    () =>
      loadServerConfig(
        environment({ NOTESAPP_TRUSTED_PROXIES: 'proxy.example.com' }),
      ),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) =>
        issue.startsWith('NOTESAPP_TRUSTED_PROXIES:'),
      ),
  );
});

await test('the stop of the server has a default and takes a named value', () => {
  assert.deepEqual(loadServerConfig(valid).shutdown, {
    gracePeriodMs: 5000,
    deadlineMs: 20000,
  });
  // A deployment with no proxy in front reports the stop and closes at once.
  assert.deepEqual(
    loadServerConfig(
      environment({
        NOTESAPP_SHUTDOWN_GRACE_MS: '0',
        NOTESAPP_SHUTDOWN_DEADLINE_MS: '9000',
      }),
    ).shutdown,
    { gracePeriodMs: 0, deadlineMs: 9000 },
  );
});

await test('the stop deadline must be longer than the grace period', () => {
  assert.throws(
    () =>
      loadServerConfig(
        environment({
          NOTESAPP_SHUTDOWN_GRACE_MS: '9000',
          NOTESAPP_SHUTDOWN_DEADLINE_MS: '9000',
        }),
      ),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) =>
        issue.includes('NOTESAPP_SHUTDOWN_DEADLINE_MS'),
      ),
  );
  assert.throws(
    () => loadServerConfig(environment({ NOTESAPP_SHUTDOWN_GRACE_MS: '-1' })),
    (error: unknown) => error instanceof ConfigError,
  );
});

await test('the upload idle bound takes the configured value', () => {
  assert.equal(
    loadServerConfig(environment({ NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS: '2500' }))
      .limits.uploadIdleTimeoutMs,
    2500,
  );
});

await test('the upload idle bound must be shorter than the request bound', () => {
  // An idle bound that is not shorter never applies, because the request
  // bound covers the whole body and always fires first.
  for (const value of ['60000', '90000']) {
    assert.throws(
      () =>
        loadServerConfig(
          environment({ NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS: value }),
        ),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.issues.some((issue) =>
          issue.includes('NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS'),
        ),
      value,
    );
  }
  // The shipped default of the idle bound also has to fit a short request
  // bound, so a deployment that shortens one must state the other.
  assert.throws(
    () =>
      loadServerConfig(environment({ NOTESAPP_REQUEST_TIMEOUT_MS: '5000' })),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) =>
        issue.includes('NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS'),
      ),
  );
});

await test('the session lifetime has a safe default', () => {
  assert.equal(loadServerConfig(valid).sessionMaxAgeSeconds, 604800);
});

await test('the log level defaults to info when it is absent', () => {
  assert.equal(
    loadServerConfig(environment({ NOTESAPP_LOG_LEVEL: undefined })).logLevel,
    'info',
  );
});

await test('an absent additional list serves the canonical origin only', () => {
  const config = loadServerConfig(
    environment({
      NOTESAPP_ORIGIN: 'https://Notes.Example.com:8443',
      // The public port of the origin is not the listening port, so a public
      // port asks for the listening value (decision 0042).
      NOTESAPP_PORT: '3000',
    }),
  );
  assert.equal(config.origin, 'https://notes.example.com:8443');
  assert.deepEqual(config.servedOrigins, [
    { origin: 'https://notes.example.com:8443', role: 'application' },
  ]);
});

await test('an additional origin joins the served list', () => {
  assert.deepEqual(
    loadServerConfig(
      environment({
        NOTESAPP_ORIGIN: 'http://127.0.0.1',
        NOTESAPP_ADDITIONAL_ORIGINS: 'http://localhost,http://[::1]:3000',
      }),
    ).servedOrigins.map((entry) => entry.origin),
    ['http://127.0.0.1', 'http://localhost', 'http://[::1]:3000'],
  );
});

await test('a missing variable stops startup', () => {
  assert.throws(
    () => loadServerConfig(environment({ NOTESAPP_ORIGIN: undefined })),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) => issue.includes('NOTESAPP_ORIGIN')),
  );
});

await test('an empty variable stops startup', () => {
  assert.throws(
    () => loadServerConfig(environment({ NOTESAPP_AUTH_SECRET: '' })),
    ConfigError,
  );
});

await test('a short authentication secret stops startup', () => {
  assert.throws(
    () => loadServerConfig(environment({ NOTESAPP_AUTH_SECRET: 'short' })),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) =>
        issue.includes('/NOTESAPP_AUTH_SECRET: must NOT have fewer than 32'),
      ),
  );
});

await test('a malformed additional origin stops startup', () => {
  assert.throws(
    () =>
      loadServerConfig(
        environment({ NOTESAPP_ADDITIONAL_ORIGINS: 'notes.test' }),
      ),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.some((issue) =>
        issue.startsWith('NOTESAPP_ADDITIONAL_ORIGINS:'),
      ),
  );
});

await test('a removed host list stops startup and names the values to set', () => {
  // A deployment of 0.1 named its second host here. Dropping the value in
  // silence would narrow what the installation serves, and the person who runs
  // it would find out at the next sign-in.
  assert.throws(
    () =>
      loadServerConfig(
        environment({ NOTESAPP_ALLOWED_HOSTS: '127.0.0.1,localhost' }),
      ),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.length === 1 &&
      error.issues.every(
        (issue) =>
          issue.startsWith('NOTESAPP_ALLOWED_HOSTS:') &&
          issue.includes('NOTESAPP_ADDITIONAL_ORIGINS'),
      ),
  );
});

await test('an unknown log level stops startup', () => {
  assert.throws(
    () => loadServerConfig(environment({ NOTESAPP_LOG_LEVEL: 'chatty' })),
    ConfigError,
  );
});

await test('a non numeric limit stops startup', () => {
  assert.throws(
    () => loadServerConfig(environment({ NOTESAPP_MAX_BODY_BYTES: '0' })),
    ConfigError,
  );
});

await test('a configuration error never repeats a rejected value', () => {
  try {
    loadServerConfig(environment({ NOTESAPP_AUTH_SECRET: 'super-secret' }));
    assert.fail('the short secret was accepted');
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    assert.equal(error.message.includes('super-secret'), false);
  }
});

await test('every optional setting reaches the container of the Compose file', async () => {
  // The Compose file passes a closed list of variables to the application.
  // A setting that the server reads and the list leaves out does nothing in a
  // container, whatever the operator writes in .env. The mail transport is
  // the one exception: its URL is a secret, so an operator override adds it
  // with the sender, as the self-hosting guide states.
  const compose = await readFile(
    new URL('../../../docker-compose.yml', import.meta.url),
    'utf8',
  );
  const byOverride = ['NOTESAPP_SMTP_URL', 'NOTESAPP_MAIL_FROM'];
  for (const name of optionalVariables) {
    if (byOverride.includes(name)) continue;
    assert.match(compose, new RegExp(`^ +${name}:`, 'm'), name);
  }
});

await test('the legal documents come all four or not at all', () => {
  assert.equal(loadServerConfig(environment({})).legalDocuments, null);
  const named = loadServerConfig(
    environment({
      NOTESAPP_TERMS_URL: 'https://example.test/terms',
      NOTESAPP_TERMS_VERSION: '2026-09',
      NOTESAPP_PRIVACY_URL: 'https://example.test/privacy',
      NOTESAPP_PRIVACY_VERSION: '3',
    }),
  );
  assert.deepEqual(named.legalDocuments, {
    terms: { url: 'https://example.test/terms', version: '2026-09' },
    privacy: { url: 'https://example.test/privacy', version: '3' },
  });
  assert.throws(
    () =>
      loadServerConfig(
        environment({
          NOTESAPP_TERMS_URL: 'https://example.test/terms',
          NOTESAPP_TERMS_VERSION: '1',
        }),
      ),
    /all four, or none of them/,
  );
  assert.throws(
    () =>
      loadServerConfig(
        environment({
          NOTESAPP_TERMS_URL: 'ftp://example.test/terms',
          NOTESAPP_TERMS_VERSION: '1',
          NOTESAPP_PRIVACY_URL: 'https://example.test/privacy',
          NOTESAPP_PRIVACY_VERSION: '1',
        }),
      ),
    /NOTESAPP_TERMS_URL: name a full http or https address/,
  );
});
