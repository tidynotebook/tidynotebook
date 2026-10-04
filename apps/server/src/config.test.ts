import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importPartBytes, maxArchiveBytes } from '@notesapp/core';
import {
  ConfigError,
  loadLegalTexts,
  loadObjectStoreSettings,
  loadProtectedEnvironment,
  loadServerConfig,
  maxLegalDocumentBytes,
  mebibyte,
  optionalVariables,
  serverVariables,
  templateBlanks,
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
  // The upload carries one file in a multipart body, so its body bound
  // holds its file bound and the room of the form around it.
  const { limits } = loadServerConfig(valid);
  assert.equal(limits.attachmentBytes, 20 * mebibyte);
  // The import takes every archive that an export writes (issue 243).
  assert.equal(limits.archiveBytes, maxArchiveBytes);
  assert.ok(limits.uploadBodyBytes > limits.attachmentBytes);
  // An import sends its archive in parts of the bytes alone (record 0192).
  assert.equal(limits.importPartBytes, importPartBytes);
  assert.ok(limits.importPartBytes < limits.archiveBytes);
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

/** The mail server of a Proton account, as separate fields. */
const mailFields: Readonly<Record<string, string>> = {
  NOTESAPP_SMTP_HOST: 'smtp.protonmail.ch',
  NOTESAPP_SMTP_PORT: '587',
  NOTESAPP_SMTP_SECURITY: 'starttls',
  NOTESAPP_SMTP_USERNAME: 'me@example.com',
  NOTESAPP_SMTP_PASSWORD: 'p@ss:w/rd?#%',
  NOTESAPP_MAIL_FROM: 'tidy notebook <me@example.com>',
};

/** The issues of an environment that must stop the start. */
function refusal(overrides: Readonly<Record<string, string | undefined>>) {
  try {
    loadServerConfig(environment(overrides));
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  return assert.fail('the environment was accepted');
}

await test('the mail server can be named as separate fields', () => {
  // A user name that is an address and a password with reserved characters
  // reach the transport as written, with no percent encoding (issue 214).
  assert.deepEqual(loadServerConfig(environment(mailFields)).mail, {
    kind: 'fields',
    fields: {
      host: 'smtp.protonmail.ch',
      port: 587,
      security: 'starttls',
      username: 'me@example.com',
      password: 'p@ss:w/rd?#%',
      sender: 'tidy notebook <me@example.com>',
    },
  });
});

await test('a mail server with no sign-in needs no user name', () => {
  const config = loadServerConfig(
    environment({
      ...mailFields,
      NOTESAPP_SMTP_USERNAME: undefined,
      NOTESAPP_SMTP_PASSWORD: undefined,
      NOTESAPP_SMTP_SECURITY: 'none',
    }),
  );
  assert.equal(config.mail?.kind, 'fields');
  if (config.mail?.kind !== 'fields') return;
  assert.equal(config.mail.fields.username, null);
  assert.equal(config.mail.fields.password, null);
});

await test('the mail server is one URL or the fields, never both', () => {
  const issues = refusal({
    ...mailFields,
    NOTESAPP_SMTP_URL: 'smtps://user:secret@smtp.example.com:465',
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0] ?? '', /^NOTESAPP_SMTP_URL: /);
  assert.match(issues[0] ?? '', /NOTESAPP_SMTP_HOST/);
  assert.ok(!issues.join('\n').includes('secret'));
  assert.ok(!issues.join('\n').includes('p@ss'));
});

await test('each missing field of the mail server is named', () => {
  assert.deepEqual(
    refusal({ NOTESAPP_SMTP_USERNAME: 'me@example.com' }).map(
      (issue) => issue.split(':')[0],
    ),
    [
      'NOTESAPP_SMTP_HOST',
      'NOTESAPP_SMTP_PORT',
      'NOTESAPP_SMTP_SECURITY',
      'NOTESAPP_SMTP_PASSWORD',
      'NOTESAPP_MAIL_FROM',
    ],
  );
  assert.deepEqual(
    refusal({ ...mailFields, NOTESAPP_SMTP_USERNAME: undefined }).map(
      (issue) => issue.split(':')[0],
    ),
    ['NOTESAPP_SMTP_USERNAME'],
  );
});

await test('a field of the mail server that is not valid is refused', () => {
  const cases: readonly [Record<string, string>, string][] = [
    [{ NOTESAPP_SMTP_HOST: 'smtps://smtp.example.com' }, 'NOTESAPP_SMTP_HOST'],
    [{ NOTESAPP_SMTP_HOST: 'smtp.example.com:465' }, 'NOTESAPP_SMTP_HOST'],
    [{ NOTESAPP_SMTP_PORT: '70000' }, 'NOTESAPP_SMTP_PORT'],
    [{ NOTESAPP_SMTP_PORT: 'abc' }, '/NOTESAPP_SMTP_PORT'],
    [{ NOTESAPP_SMTP_SECURITY: 'ssl' }, '/NOTESAPP_SMTP_SECURITY'],
    [{ NOTESAPP_MAIL_FROM: 'not an address' }, 'NOTESAPP_MAIL_FROM'],
  ];
  for (const [overrides, name] of cases) {
    const issues = refusal({ ...mailFields, ...overrides });
    assert.ok(
      issues.some((issue) => issue.startsWith(`${name}:`)),
      `${JSON.stringify(overrides)}: ${issues.join(' | ')}`,
    );
    assert.ok(!issues.join('\n').includes('p@ss'));
  }
});

await test('the mail password can come from a protected file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-mail-'));
  try {
    const path = join(directory, 'smtp_password');
    await writeFile(path, 'p@ss:w/rd?#%\n');
    const loaded = await loadProtectedEnvironment(
      environment({
        ...mailFields,
        NOTESAPP_SMTP_PASSWORD: undefined,
        NOTESAPP_SMTP_PASSWORD_FILE: path,
      }),
    );
    const config = loadServerConfig(loaded);
    assert.equal(config.mail?.kind, 'fields');
    if (config.mail?.kind !== 'fields') return;
    assert.equal(config.mail.fields.password, 'p@ss:w/rd?#%');
    // A space at either end of a password is part of it, as in the variable.
    await writeFile(path, ' spaced pass \n');
    const spaced = loadServerConfig(
      await loadProtectedEnvironment(
        environment({
          ...mailFields,
          NOTESAPP_SMTP_PASSWORD: undefined,
          NOTESAPP_SMTP_PASSWORD_FILE: path,
        }),
      ),
    );
    assert.equal(
      spaced.mail?.kind === 'fields' ? spaced.mail.fields.password : null,
      ' spaced pass ',
    );
    await assert.rejects(
      loadProtectedEnvironment(
        environment({ ...mailFields, NOTESAPP_SMTP_PASSWORD_FILE: path }),
      ),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.issues.some((issue) =>
          issue.startsWith('NOTESAPP_SMTP_PASSWORD: '),
        ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
  // container, whatever the operator writes in .env. Three groups come from
  // an override file that ships beside it: the mail transport, whose URL is a
  // secret, the files of the legal documents, which need a mounted directory,
  // and an S3 compatible store, whose key pair is a secret.
  const read = (path: string): Promise<string> =>
    readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const compose = await read('docker-compose.yml');
  const byOverride: Readonly<Record<string, string>> = {
    NOTESAPP_SMTP_URL: 'docker/compose.mail-url.yaml',
    NOTESAPP_SMTP_HOST: 'docker/compose.mail.yaml',
    NOTESAPP_SMTP_PORT: 'docker/compose.mail.yaml',
    NOTESAPP_SMTP_SECURITY: 'docker/compose.mail.yaml',
    NOTESAPP_SMTP_USERNAME: 'docker/compose.mail.yaml',
    NOTESAPP_SMTP_PASSWORD: 'docker/compose.mail.yaml',
    NOTESAPP_MAIL_FROM: 'docker/compose.mail.yaml',
    NOTESAPP_TERMS_FILE: 'docker/compose.legal.yaml',
    NOTESAPP_PRIVACY_FILE: 'docker/compose.legal.yaml',
    // An S3 compatible store has a key pair, which is a secret (record 0192).
    NOTESAPP_OBJECT_STORE: 'docker/compose.s3.yaml',
    NOTESAPP_S3_BUCKET: 'docker/compose.s3.yaml',
    NOTESAPP_S3_REGION: 'docker/compose.s3.yaml',
    NOTESAPP_S3_ENDPOINT: 'docker/compose.s3.yaml',
    NOTESAPP_S3_ACCESS_KEY_ID_FILE: 'docker/compose.s3.yaml',
    NOTESAPP_S3_SECRET_ACCESS_KEY_FILE: 'docker/compose.s3.yaml',
  };
  for (const name of optionalVariables) {
    const override = byOverride[name];
    if (override === undefined) {
      assert.match(compose, new RegExp(`^ +${name}:`, 'm'), name);
      continue;
    }
    assert.doesNotMatch(compose, new RegExp(`^ +${name}(_FILE)?:`, 'm'), name);
    // The mail URL and the mail password arrive as protected files, the
    // others as themselves.
    const variable =
      name === 'NOTESAPP_SMTP_URL' || name === 'NOTESAPP_SMTP_PASSWORD'
        ? `${name}_FILE`
        : name;
    assert.match(
      await read(override),
      new RegExp(`^ +${variable}:`, 'm'),
      variable,
    );
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
    /each with an address or a file and a version, or name none of them/,
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

await test('a legal document comes from an address or a file, never both', () => {
  const served = loadServerConfig(
    environment({
      NOTESAPP_TERMS_FILE: '/etc/notesapp/legal/terms.md',
      NOTESAPP_TERMS_VERSION: '2026-10-01',
      NOTESAPP_PRIVACY_URL: 'https://example.test/privacy',
      NOTESAPP_PRIVACY_VERSION: '3',
    }),
  );
  // A document that a file holds takes the address of its page on the
  // canonical origin, so every screen links it as any other document.
  assert.deepEqual(served.legalDocuments, {
    terms: { url: 'http://127.0.0.1/legal/terms', version: '2026-10-01' },
    privacy: { url: 'https://example.test/privacy', version: '3' },
  });
  assert.deepEqual(served.legalFiles, {
    terms: '/etc/notesapp/legal/terms.md',
    privacy: null,
  });
  assert.deepEqual(loadServerConfig(environment({})).legalFiles, {
    terms: null,
    privacy: null,
  });
  assert.throws(
    () =>
      loadServerConfig(
        environment({
          NOTESAPP_TERMS_URL: 'https://example.test/terms',
          NOTESAPP_TERMS_FILE: '/etc/notesapp/legal/terms.md',
          NOTESAPP_TERMS_VERSION: '1',
          NOTESAPP_PRIVACY_FILE: '/etc/notesapp/legal/privacy.md',
          NOTESAPP_PRIVACY_VERSION: '1',
        }),
      ),
    /NOTESAPP_TERMS_FILE: name the document by NOTESAPP_TERMS_URL or by NOTESAPP_TERMS_FILE, not both/,
  );
  // A file with no version names nothing that a person can accept.
  assert.throws(
    () =>
      loadServerConfig(
        environment({
          NOTESAPP_TERMS_FILE: '/etc/notesapp/legal/terms.md',
          NOTESAPP_PRIVACY_FILE: '/etc/notesapp/legal/privacy.md',
          NOTESAPP_PRIVACY_VERSION: '1',
        }),
      ),
    /NOTESAPP_TERMS_VERSION: name the terms and the privacy notice/,
  );
  // A relative path depends on the directory that the server starts in.
  assert.throws(
    () =>
      loadServerConfig(
        environment({
          NOTESAPP_TERMS_FILE: 'legal/terms.md',
          NOTESAPP_TERMS_VERSION: '1',
          NOTESAPP_PRIVACY_FILE: '/etc/notesapp/legal/privacy.md',
          NOTESAPP_PRIVACY_VERSION: '1',
        }),
      ),
    ConfigError,
  );
});

await test('a blank of the template is a word in double braces', () => {
  assert.deepEqual(
    templateBlanks(
      'Run by {{operator name}}. Write to {{contact address}} or {{operator name}}.',
    ),
    ['{{operator name}}', '{{contact address}}'],
  );
  assert.deepEqual(templateBlanks('Run by Example Ltd. {not a blank}'), []);
});

await test('a legal file is read once, and an unfinished one stops the start', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-legal-config-'));
  try {
    const terms = join(directory, 'terms.md');
    const privacy = join(directory, 'privacy.md');
    await writeFile(terms, '# Terms\n\nRun by Example Ltd.\n');
    await writeFile(
      privacy,
      '# Privacy notice\n\nWrite to {{contact address}}.\n',
    );
    assert.deepEqual(
      await loadLegalTexts({ legalFiles: { terms, privacy: null } }),
      { terms: '# Terms\n\nRun by Example Ltd.\n', privacy: null },
    );
    await assert.rejects(
      loadLegalTexts({ legalFiles: { terms, privacy } }),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.issues.length === 1 &&
        error.issues[0] ===
          'NOTESAPP_PRIVACY_FILE: fill each blank of the template first. The file still holds {{contact address}}.',
    );
    await writeFile(privacy, '  \n');
    await assert.rejects(
      loadLegalTexts({ legalFiles: { terms, privacy } }),
      /NOTESAPP_PRIVACY_FILE: the file is empty/,
    );
    await writeFile(privacy, 'a'.repeat(maxLegalDocumentBytes + 1));
    await assert.rejects(
      loadLegalTexts({ legalFiles: { terms, privacy } }),
      /NOTESAPP_PRIVACY_FILE: the file is larger than 256 KiB/,
    );
    await assert.rejects(
      loadLegalTexts({
        legalFiles: { terms: join(directory, 'missing.md'), privacy: null },
      }),
      /NOTESAPP_TERMS_FILE: the file cannot be read/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test('the list of every variable names each one once', () => {
  assert.equal(new Set(serverVariables).size, serverVariables.length);
  for (const name of [
    'NOTESAPP_ORIGIN',
    'NOTESAPP_AUTH_SECRET',
    'NOTESAPP_AUTH_SECRET_FILE',
    'NOTESAPP_SMTP_PASSWORD_FILE',
    ...optionalVariables,
  ])
    assert.ok(serverVariables.includes(name), name);
  // A digit is allowed, as in NOTESAPP_S3_BUCKET (record 0192).
  assert.ok(
    serverVariables.every((name) => /^NOTESAPP_[A-Z0-9_]+$/.test(name)),
  );
});

/** The settings of an S3 compatible store, with the two key files. */
const s3: Record<string, string> = {
  NOTESAPP_OBJECT_STORE: 's3',
  NOTESAPP_S3_BUCKET: 'notes-uploads',
  NOTESAPP_S3_REGION: 'auto',
  NOTESAPP_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  NOTESAPP_S3_ACCESS_KEY_ID_FILE: '/run/secrets/s3_access_key_id',
  NOTESAPP_S3_SECRET_ACCESS_KEY_FILE: '/run/secrets/s3_secret_access_key',
};

await test('the object store is the directory of the server by default', async () => {
  // Record 0192. An installation that names no store keeps every byte in
  // NOTESAPP_STORAGE_ROOT, as it did before the record.
  const config = loadServerConfig(valid);
  assert.deepEqual(config.objectStore, { kind: 'filesystem' });
  assert.deepEqual(await loadObjectStoreSettings(config), {
    kind: 'filesystem',
    root: '/var/lib/notesapp',
  });
  assert.deepEqual(
    loadServerConfig(environment({ NOTESAPP_OBJECT_STORE: 'filesystem' }))
      .objectStore,
    { kind: 'filesystem' },
  );
});

await test('an S3 store names its bucket, its region, its endpoint and its key files', () => {
  assert.deepEqual(loadServerConfig(environment(s3)).objectStore, {
    kind: 's3',
    bucket: 'notes-uploads',
    region: 'auto',
    endpoint: 'https://account.r2.cloudflarestorage.com',
    accessKeyIdFile: '/run/secrets/s3_access_key_id',
    secretAccessKeyFile: '/run/secrets/s3_secret_access_key',
  });
  // AWS itself needs no endpoint.
  const aws = loadServerConfig(
    environment({ ...s3, NOTESAPP_S3_ENDPOINT: undefined }),
  ).objectStore;
  assert.equal(aws.kind === 's3' ? aws.endpoint : 'none', null);
});

await test('an S3 store with a missing setting stops startup and names it', () => {
  assert.throws(
    () =>
      loadServerConfig(
        environment({
          ...s3,
          NOTESAPP_S3_BUCKET: undefined,
          NOTESAPP_S3_SECRET_ACCESS_KEY_FILE: undefined,
        }),
      ),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.length === 2 &&
      error.issues.some((issue) => issue.startsWith('NOTESAPP_S3_BUCKET:')) &&
      error.issues.some((issue) =>
        issue.startsWith('NOTESAPP_S3_SECRET_ACCESS_KEY_FILE:'),
      ),
  );
  assert.throws(
    () =>
      loadServerConfig(environment({ ...s3, NOTESAPP_S3_BUCKET: 'No_Bucket' })),
    ConfigError,
  );
  assert.throws(
    () =>
      loadServerConfig(
        environment({ ...s3, NOTESAPP_S3_ENDPOINT: 'ftp://store' }),
      ),
    ConfigError,
  );
  assert.throws(
    () => loadServerConfig(environment({ NOTESAPP_OBJECT_STORE: 'gcs' })),
    ConfigError,
  );
});

await test('a setting of an S3 store beside the file store stops startup', () => {
  // The operator meant one of the two stores, and the server cannot tell
  // which, so it names the setting instead of a silent choice.
  assert.throws(
    () =>
      loadServerConfig(environment({ NOTESAPP_S3_BUCKET: 'notes-uploads' })),
    (error: unknown) =>
      error instanceof ConfigError &&
      error.issues.length === 1 &&
      /NOTESAPP_S3_BUCKET: set NOTESAPP_OBJECT_STORE to s3/.test(
        error.issues[0] ?? '',
      ),
  );
});

await test('the key pair of an S3 store comes from its files only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-s3-config-'));
  try {
    const keyId = join(directory, 'id');
    const secret = join(directory, 'secret');
    await writeFile(keyId, 'key-identifier\n');
    await writeFile(secret, ' secret-value \n');
    const config = loadServerConfig(
      environment({
        ...s3,
        NOTESAPP_S3_ACCESS_KEY_ID_FILE: keyId,
        NOTESAPP_S3_SECRET_ACCESS_KEY_FILE: secret,
      }),
    );
    // The configuration value names the files and holds no secret.
    assert.doesNotMatch(JSON.stringify(config.objectStore), /secret-value/);
    assert.deepEqual(await loadObjectStoreSettings(config), {
      kind: 's3',
      bucket: 'notes-uploads',
      region: 'auto',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      accessKeyId: 'key-identifier',
      secretAccessKey: 'secret-value',
    });
    await writeFile(secret, '\n');
    await assert.rejects(
      loadObjectStoreSettings(config),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.issues.join('\n') ===
          'NOTESAPP_S3_SECRET_ACCESS_KEY_FILE: the file is empty.',
    );
    await assert.rejects(
      loadObjectStoreSettings(
        loadServerConfig(
          environment({
            ...s3,
            NOTESAPP_S3_ACCESS_KEY_ID_FILE: join(directory, 'missing'),
            NOTESAPP_S3_SECRET_ACCESS_KEY_FILE: keyId,
          }),
        ),
      ),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.issues.join('\n') ===
          'NOTESAPP_S3_ACCESS_KEY_ID_FILE: the file cannot be read.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
