import assert from 'node:assert/strict';
import test from 'node:test';
import {
  oauthAcceptedScope,
  oauthConsentFacts,
  oauthConsentRoute,
  oauthFailureMessage,
  oauthInvalidMessage,
  oauthPageStep,
  oauthRequest,
  oauthSignInRoute,
} from './oauth-consent.ts';
import { returnOf } from './sign-in-return.ts';

function search(changes: Record<string, string> = {}): string {
  const values = {
    client_id: 'https://metadata.example/client.json',
    redirect_uri: 'https://answers.example/callback',
    scope: 'notes:read notes:write offline_access',
    sig: 'signed-by-server',
    exp: '1234567890',
    ...changes,
  };
  return `?${Object.entries(values)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&')}`;
}

await test('the claimed brand is text and the CIMD host is the identity', () => {
  const request = oauthRequest(search());
  assert.ok(request);
  const facts = oauthConsentFacts(request, {
    client_id: request.clientId,
    client_name: '<img src=x onerror=alert(1)> ChatGPT',
    client_uri: 'https://openai.com',
    logo_uri: 'https://openai.com/logo.png',
  });
  assert.ok(facts);
  assert.equal(facts.claimedName, '<img src=x onerror=alert(1)> ChatGPT');
  assert.equal(facts.clientHost, 'metadata.example');
  assert.equal(facts.redirectHost, 'answers.example');
  assert.equal(facts.localWarning, null);
  assert.equal(
    facts.accessSentence,
    'This client asks to read and change notes in all your workspaces.',
  );
  assert.equal(oauthConsentFacts(request, { client_id: 'other' }), null);
});

await test('DCR is not verified and never uses a claimed brand host as identity', () => {
  const request = oauthRequest(search({ client_id: 'unowned-client' }));
  assert.ok(request);
  assert.equal(
    oauthConsentFacts(request, {
      client_id: request.clientId,
      client_name: 'Claude',
      client_uri: 'https://anthropic.com',
    })?.clientHost,
    null,
  );
  assert.equal(
    oauthConsentFacts(request, { client_id: request.clientId })?.claimedName,
    'No name given',
  );
});

await test('every loopback form and a native app get the local app warning', () => {
  for (const redirect_uri of [
    'http://localhost:3000/callback',
    'http://127.0.0.1:3000/callback',
    'http://127.20.30.40:3000/callback',
    'http://[::1]:3000/callback',
    'note-client:/callback',
  ]) {
    const request = oauthRequest(search({ redirect_uri }));
    assert.ok(request);
    const facts = oauthConsentFacts(request, { client_id: request.clientId });
    assert.ok(facts);
    assert.equal(
      facts.localWarning,
      'Your answer goes to an app on this computer.',
    );
  }
  const remote = oauthRequest(
    search({ redirect_uri: 'https://localhost.example/callback' }),
  );
  assert.ok(remote);
  assert.equal(
    oauthConsentFacts(remote, { client_id: remote.clientId })?.localWarning,
    null,
  );
});

await test('read is the default reduction and never adds background or write scope', () => {
  const request = oauthRequest(search());
  assert.ok(request);
  assert.equal(
    oauthAcceptedScope(request, 'read'),
    'notes:read offline_access',
  );
  assert.equal(
    oauthAcceptedScope(request, 'write'),
    'notes:read notes:write offline_access',
  );
  const read = oauthRequest(search({ scope: 'notes:read' }));
  assert.ok(read);
  assert.equal(read.writeRequested, false);
  assert.equal(oauthAcceptedScope(read, 'write'), 'notes:read');
  assert.equal(
    oauthConsentFacts(read, { client_id: read.clientId })?.accessSentence,
    'This client asks to read notes in all your workspaces.',
  );
});

await test('an incomplete or ambiguous request shows no Allow action', () => {
  for (const raw of [
    '',
    search({ sig: '' }),
    search({ scope: 'notes:write' }),
    search({ scope: 'notes:read admin' }),
    search({ redirect_uri: 'javascript:alert(1)' }),
    search({ redirect_uri: 'https://brand.example@evil.example/callback' }),
    search({ redirect_uri: '//evil.example/callback' }),
    `${search()}&client_id=other`,
    `${search()}&scope=notes:read`,
    `${search()}&sig=other`,
    `${search()}&state=${'x'.repeat(4096)}`,
  ])
    assert.equal(oauthRequest(raw), null, raw);
  assert.deepEqual(
    oauthPageStep(
      { status: 'signed-in', account: null },
      oauthConsentRoute,
      '',
    ),
    { kind: 'invalid' },
  );
});

await test('sign-in keeps either OAuth route and the exact signed query', () => {
  const raw = search({ state: 'one + two & three' }).replace('%20', '+');
  for (const route of [oauthConsentRoute, oauthSignInRoute] as const) {
    const step = oauthPageStep(
      { status: 'signed-out', account: null },
      route,
      raw,
    );
    assert.equal(step.kind, 'sign-in');
    if (step.kind !== 'sign-in') throw new Error('Expected sign-in.');
    assert.equal(
      returnOf(step.address.slice('/login'.length)),
      `${route}${raw}`,
    );
  }
  assert.deepEqual(
    oauthPageStep({ status: 'loading', account: null }, oauthConsentRoute, raw),
    { kind: 'wait' },
  );
});

await test('a locked account cannot consent and gets one next action', () => {
  for (const route of [oauthConsentRoute, oauthSignInRoute] as const) {
    for (const accountPortal of [true, false]) {
      const step = oauthPageStep(
        {
          status: 'signed-in',
          account: {
            controls: {
              revision: 1,
              standing: 'locked',
              removalAt: null,
              trialEndsAt: null,
              trialState: 'none',
              limitBytes: 0,
              textLimitBytes: null,
              publishedTransferLimitBytes: null,
              downloadLimitBytes: null,
              features: { teams: true, collaboration: true },
            },
            accountPortal,
          },
        },
        route,
        search(),
      );
      assert.equal(step.kind, 'locked');
      if (step.kind !== 'locked') throw new Error('Expected lock refusal.');
      assert.match(step.message, accountPortal ? /billing/ : /administrator/);
    }
  }
});

await test('provider errors expose no code or raw description', () => {
  assert.equal(
    oauthFailureMessage(
      { error: 'invalid_request', error_description: 'oauth_grant_limit' },
      400,
    ),
    'This account has too many connected apps. Open Settings and remove an app, then try again.',
  );
  for (const error of [
    null,
    { error_description: 'oauth_grant_limit' },
    { error: 'server_error', error_description: 'raw-stack <script>' },
  ])
    assert.equal(oauthFailureMessage(error, 400), oauthInvalidMessage);
  assert.match(
    oauthFailureMessage({ error_description: 'secret' }, 503),
    /connection/,
  );
});
