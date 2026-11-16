import assert from 'node:assert/strict';
import test from 'node:test';
import { tryRegistrationContinuation } from './registration-continuation-result.ts';

await test('continuation failures discard cookies and preserve the sign-in fallback', async () => {
  for (const status of [403, 500, 503]) {
    let failures = 0;
    const result = await tryRegistrationContinuation(
      async () =>
        new Response('private response body', {
          status,
          headers: { 'set-cookie': 'session=must-not-publish' },
        }),
      () => {
        failures += 1;
      },
    );
    assert.equal(result, null);
    assert.equal(failures, 1);
  }
});

await test('a rejected or unreadable continuation returns no session or cookies', async () => {
  for (const run of [
    async (): Promise<Response> => {
      throw new Error('private token');
    },
    async () =>
      new Response('invalid JSON', {
        headers: { 'set-cookie': 'session=must-not-publish' },
      }),
  ]) {
    let failures = 0;
    assert.equal(
      await tryRegistrationContinuation(run, () => {
        failures += 1;
      }),
      null,
    );
    assert.equal(failures, 1);
  }
});

await test('successful continuation retains the normal cookies and explicit session result', async () => {
  for (const body of [
    { accepted: true },
    { signedIn: false },
    { signedIn: true },
  ]) {
    const result = await tryRegistrationContinuation(
      async () =>
        Response.json(body, {
          headers: {
            'set-cookie': 'proof=normal-cookie; HttpOnly; SameSite=Lax',
          },
        }),
      () => assert.fail('successful continuation must not log a failure'),
    );
    assert.deepEqual(result, {
      cookies: ['proof=normal-cookie; HttpOnly; SameSite=Lax'],
      signedIn: 'signedIn' in body && body.signedIn === true,
    });
  }
});
