import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWriteOrigin } from './auth/actor.ts';
import {
  applicationOrigins,
  publishedOrigin,
  readOrigin,
  readServedOrigins,
  roleOfHost,
  servedHostNames,
  type ServedOrigin,
} from './served-origins.ts';

/** The accepted list with its roles, or the assertion failure of a refusal. */
function served(
  canonical: string,
  additional?: string,
  published?: string,
): readonly ServedOrigin[] {
  const result = readServedOrigins(canonical, additional, published);
  if (!result.ok) assert.fail(result.issues.join('\n'));
  return result.origins;
}

/** The origins of an accepted list, or the assertion failure of a refusal. */
function origins(canonical: string, additional?: string): readonly string[] {
  return served(canonical, additional).map((entry) => entry.origin);
}

/** Application origins, as a list of the one role. */
function application(...values: readonly string[]): readonly ServedOrigin[] {
  return values.map((origin) => ({ origin, role: 'application' }));
}

/** The refusal reasons of a list, or the assertion failure of an accepted one. */
function refusal(
  canonical: string,
  additional?: string,
  published?: string,
): readonly string[] {
  const result = readServedOrigins(canonical, additional, published);
  if (result.ok)
    assert.fail(`the list was accepted: ${JSON.stringify(result.origins)}`);
  return result.issues;
}

await test('one configured origin is the whole list', () => {
  assert.deepEqual(origins('https://notes.example.com'), [
    'https://notes.example.com',
  ]);
});

await test('an additional origin joins the list after the canonical one', () => {
  assert.deepEqual(
    origins('https://notes.example.com', 'https://notes.internal:8443'),
    ['https://notes.example.com', 'https://notes.internal:8443'],
  );
});

await test('no scheme and no port is invented', () => {
  // Issue 19. The trusted list used to add `http://`, `https://` and the port
  // 3000 to every configured host, so the shipped defaults trusted origins
  // that no operator named. The list now holds exactly what was configured.
  const served = origins('http://notes.example.com');
  assert.deepEqual(served, ['http://notes.example.com']);
  assert.equal(served.includes('https://notes.example.com'), false);
  assert.equal(served.includes('http://notes.example.com:3000'), false);
});

await test('localhost on port 3000 is trusted only when it is configured', () => {
  assert.equal(
    origins('http://localhost').includes('http://localhost:3000'),
    false,
  );
  assert.deepEqual(origins('http://localhost:3000'), ['http://localhost:3000']);
});

await test('the default port of the scheme is dropped, and any other is kept', () => {
  // A browser writes the Origin header in this form, so the two compare
  // directly.
  assert.deepEqual(origins('https://notes.example.com:443'), [
    'https://notes.example.com',
  ]);
  assert.deepEqual(origins('http://notes.example.com:80'), [
    'http://notes.example.com',
  ]);
  assert.deepEqual(origins('http://notes.example.com:3000'), [
    'http://notes.example.com:3000',
  ]);
});

await test('the host name of an origin is lowercased and a trailing slash is dropped', () => {
  assert.deepEqual(origins('https://Notes.Example.COM/'), [
    'https://notes.example.com',
  ]);
});

await test('a bracketed IPv6 origin keeps its brackets', () => {
  assert.deepEqual(origins('http://[::1]:3000'), ['http://[::1]:3000']);
  assert.deepEqual(servedHostNames(application('http://[::1]:3000')), [
    '[::1]',
  ]);
});

await test('a malformed canonical origin stops startup', () => {
  for (const value of [
    '',
    'notes.example.com',
    'ftp://notes.example.com',
    'https://',
    'https://notes.example.com/notes',
    'https://notes.example.com?a=1',
    'https://notes.example.com#top',
    'https://user:secret@notes.example.com',
  ])
    assert.ok(
      refusal(value).some((issue) => issue.startsWith('NOTESAPP_ORIGIN:')),
      `the value was accepted: ${value}`,
    );
});

await test('a malformed additional origin stops startup', () => {
  assert.ok(
    refusal('https://notes.example.com', 'notes.internal').some((issue) =>
      issue.startsWith('NOTESAPP_ADDITIONAL_ORIGINS:'),
    ),
  );
});

await test('a repeated origin stops startup', () => {
  assert.ok(
    refusal('https://notes.example.com', 'https://notes.example.com').some(
      (issue) => issue.includes('one time only'),
    ),
  );
});

await test('two schemes in one installation stop startup', () => {
  // One cookie policy serves the whole list. A secure cookie never reaches a
  // plain HTTP page, so a mixed list would fail at the next sign-in instead.
  assert.ok(
    refusal('https://notes.example.com', 'http://notes.internal:3000').some(
      (issue) => issue.includes('scheme'),
    ),
  );
});

await test('an empty additional entry is ignored', () => {
  assert.deepEqual(origins('https://notes.example.com', ' , '), [
    'https://notes.example.com',
  ]);
});

await test('one origin reads as itself and nothing else', () => {
  assert.equal(
    readOrigin('https://notes.example.com'),
    'https://notes.example.com',
  );
  assert.equal(readOrigin('https://notes.example.com/path'), null);
});

await test('the Host allowlist holds the host name of each served origin', () => {
  assert.deepEqual(
    servedHostNames(
      served('https://notes.example.com', 'https://notes.internal:8443'),
    ),
    ['notes.example.com', 'notes.internal'],
  );
  // Two origins on one host name give one entry.
  assert.deepEqual(
    servedHostNames(
      application(
        'https://notes.example.com',
        'https://notes.example.com:8443',
      ),
    ),
    ['notes.example.com'],
  );
});

await test('the write check accepts every served origin', () => {
  const list = served(
    'https://notes.example.com',
    'https://notes.internal:8443',
  );
  for (const { origin } of list)
    assert.equal(
      checkWriteOrigin(list, 'POST', { origin }),
      'accepted',
      origin,
    );
});

await test('the write check refuses a neighbour of a served origin', () => {
  // Issue 18. The write check compared one configured value while the trusted
  // list accepted four variants of every allowed host. Both now read the same
  // list, so each of these is foreign to both.
  const list = served('https://notes.example.com');
  for (const origin of [
    'http://notes.example.com',
    'https://notes.example.com:3000',
    'https://notes.example.com.evil.invalid',
    'https://example.com',
    'null',
  ])
    assert.equal(checkWriteOrigin(list, 'POST', { origin }), 'foreign', origin);
});

await test('the write check reads the fetch metadata header when there is no origin', () => {
  const list = served('https://notes.example.com');
  assert.equal(
    checkWriteOrigin(list, 'POST', { site: 'same-origin' }),
    'accepted',
  );
  assert.equal(
    checkWriteOrigin(list, 'POST', { site: 'cross-site' }),
    'foreign',
  );
  assert.equal(checkWriteOrigin(list, 'POST', {}), 'missing');
  assert.equal(checkWriteOrigin(list, 'GET', {}), 'accepted');
});

await test('the published origin comes last with its own role', () => {
  const list = served(
    'https://notes.example.com',
    'https://notes.internal',
    'https://pages.example.net/',
  );
  assert.deepEqual(list, [
    { origin: 'https://notes.example.com', role: 'application' },
    { origin: 'https://notes.internal', role: 'application' },
    { origin: 'https://pages.example.net', role: 'published' },
  ]);
  assert.deepEqual(applicationOrigins(list), [
    'https://notes.example.com',
    'https://notes.internal',
  ]);
  assert.equal(publishedOrigin(list), 'https://pages.example.net');
  assert.equal(publishedOrigin(served('https://notes.example.com')), null);
  // An empty value is the same as no value.
  assert.equal(
    publishedOrigin(served('https://notes.example.com', undefined, ' ')),
    null,
  );
  assert.deepEqual(servedHostNames(list), [
    'notes.example.com',
    'notes.internal',
    'pages.example.net',
  ]);
  assert.equal(roleOfHost(list, 'pages.example.net'), 'published');
  assert.equal(roleOfHost(list, 'notes.internal'), 'application');
  assert.equal(roleOfHost(list, 'elsewhere.example'), null);
});

await test('the published origin is never trusted for a write', () => {
  // Record 0118. A page on the published origin is a page of a stranger, so
  // a write that names it is refused like a write from any other site.
  const list = served(
    'https://notes.example.com',
    undefined,
    'https://pages.example.net',
  );
  assert.equal(
    checkWriteOrigin(list, 'POST', { origin: 'https://pages.example.net' }),
    'foreign',
  );
  assert.equal(
    checkWriteOrigin(list, 'POST', { origin: 'https://notes.example.com' }),
    'accepted',
  );
});

await test('a published origin on a host of the application stops startup', () => {
  for (const value of [
    'https://notes.example.com:8443',
    'https://notes.example.com',
  ])
    assert.ok(
      refusal('https://notes.example.com', undefined, value).some((issue) =>
        issue.includes('host name'),
      ),
      value,
    );
  assert.ok(
    refusal(
      'https://notes.example.com',
      undefined,
      'http://pages.example.net',
    ).some((issue) => issue.includes('scheme')),
  );
  assert.ok(
    refusal('https://notes.example.com', undefined, 'pages.example.net').some(
      (issue) => issue.startsWith('NOTESAPP_PUBLISHED_ORIGIN:'),
    ),
  );
});
