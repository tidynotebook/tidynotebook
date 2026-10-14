/** The official released suite, with explicit product-surface classification. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import {
  configureClient,
  signInWithPassword,
  registerOAuthClient,
  giveOAuthConsent,
  exchangeOAuthToken,
} from '@notesapp/api-client';
import { bootstrapOwner, createApp, loadServerConfig } from '@notesapp/server';
import { createDisposableDatabase } from './support/database.ts';
import { testEnvironment } from './support/server.ts';

const selected = [
  'server-initialize',
  'ping',
  'tools-list',
  'dns-rebinding-protection',
] as const;
const excluded: Readonly<Record<string, string>> = {
  'logging-set-level': 'Tools only: no logging capability (0225).',
  'completion-complete': 'No resources or prompts (0225).',
  'tools-call-simple-text':
    'Empty registry; enabled by the first tool issue (0227).',
  'tools-call-image':
    'Empty registry; enabled by the first tool issue (0227) if applicable to note tools.',
  'tools-call-audio':
    'Empty registry; enabled by the first tool issue (0227) if applicable to note tools.',
  'tools-call-embedded-resource':
    'No resources; empty registry; enabled by the first tool issue if applicable (0225).',
  'tools-call-mixed-content':
    'Empty registry; enabled by the first tool issue (0227) if applicable to note tools.',
  'tools-call-with-logging': 'Tools only: no logging notifications (0225).',
  'tools-call-error': 'Empty registry; enabled by the first tool issue (0227).',
  'tools-call-with-progress':
    'No event stream or progress notifications (0225).',
  'tools-call-sampling': 'Tools only: no sampling (0225).',
  'tools-call-elicitation': 'Tools only: no elicitation (0225).',
  'json-schema-2020-12':
    'Empty registry; enabled by the first tool issue (0227).',
  'elicitation-sep1034-defaults': 'Tools only: no elicitation (0225).',
  'server-sse-polling': 'No event stream (0225).',
  'server-sse-multiple-streams': 'No event stream (0225).',
  'elicitation-sep1330-enums': 'Tools only: no elicitation (0225).',
  'resources-list': 'No resources or prompts (0225).',
  'resources-read-text': 'No resources or prompts (0225).',
  'resources-read-binary': 'No resources or prompts (0225).',
  'resources-templates-read': 'No resources or prompts (0225).',
  'resources-subscribe': 'No resources or prompts (0225).',
  'resources-unsubscribe': 'No resources or prompts (0225).',
  'prompts-list': 'No resources or prompts (0225).',
  'prompts-get-simple': 'No resources or prompts (0225).',
  'prompts-get-with-args': 'No resources or prompts (0225).',
  'prompts-get-embedded-resource': 'No resources or prompts (0225).',
  'prompts-get-with-image': 'No resources or prompts (0225).',
};
const require = createRequire(import.meta.url);
const suite = join(
  dirname(require.resolve('@modelcontextprotocol/conformance/package.json')),
  'dist/index.js',
);
async function command(args: readonly string[]) {
  return new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [suite, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const chunks: string[] = [];
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (value: string) => chunks.push(value));
      child.stderr.on('data', (value: string) => chunks.push(value));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output: chunks.join('') }));
    },
  );
}
await test('every installed server scenario has exactly one explicit classification', async () => {
  const listed = await command(['list', '--server']);
  assert.equal(listed.code, 0, listed.output);
  const actual = [...listed.output.matchAll(/^  - (\S+) /gm)]
    .map((match) => match[1])
    .sort();
  const classified = [...selected, ...Object.keys(excluded)].sort();
  assert.equal(new Set(classified).size, classified.length);
  assert.deepEqual(
    actual,
    classified,
    'Classify each added official scenario before the suite can pass.',
  );
  for (const reason of Object.values(excluded)) assert.ok(reason.length > 0);
});

await test(
  'each selected official scenario passes against the served endpoint',
  { timeout: 120000 },
  async (t) => {
    const database = await createDisposableDatabase();
    const root = await mkdtemp(join(tmpdir(), 'notesapp-mcp-conformance-'));
    const initial = loadServerConfig({
      ...testEnvironment(root),
      NOTESAPP_DATABASE_URL: database.runtimeUrl,
      NOTESAPP_AUTH_DATABASE_URL: database.authUrl,
      NOTESAPP_MCP_ORIGIN: 'http://127.0.0.1',
      NOTESAPP_BREACH_CHECK: 'off',
      NOTESAPP_MAX_BODY_BYTES: '1048576',
      NOTESAPP_RATE_LIMIT_MAX: '2000',
    });
    const served = [...initial.servedOrigins];
    const config = { ...initial, servedOrigins: served };
    await bootstrapOwner({
      config,
      email: 'conformance@notes.invalid',
      name: 'Conformance',
      password: 'conformance-owner-safe-password',
    });
    const app = await createApp(config);
    let credential: string | null = null;
    // The released suite has no credential option. Only this test composition
    // supplies its real issued token. The production resolver still checks it.
    app.addHook('onRequest', async (request) => {
      if (request.url === '/mcp' && credential !== null)
        request.headers.authorization = `Bearer ${credential}`;
    });
    try {
      await app.listen({ host: '127.0.0.1', port: 0 });
      const address = app.server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      // The ephemeral socket is a real application origin of this test app.
      served.push({ origin: base, role: 'application' });
      configureClient(base, undefined);
      const signIn = await signInWithPassword({
        headers: { origin: config.origin },
        body: {
          email: 'conformance@notes.invalid',
          password: 'conformance-owner-safe-password',
        },
      });
      assert.equal(signIn.response?.status, 200);
      const cookie = signIn.response.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const registered = await registerOAuthClient({
        body: {
          redirect_uris: ['https://client.example/callback'],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
        },
      });
      assert.ok(registered.data);
      const verifier = 'a'.repeat(43);
      const resource = `${config.mcpOrigin}/mcp`;
      const query = new URLSearchParams({
        response_type: 'code',
        client_id: registered.data.client_id,
        redirect_uri: 'https://client.example/callback',
        scope: 'notes:read',
        resource,
        code_challenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        code_challenge_method: 'S256',
        state: 'conformance',
      });
      const authorization = await app.inject({
        url: `/api/auth/oauth2/authorize?${query}`,
        headers: { cookie },
      });
      assert.equal(authorization.statusCode, 302, authorization.body);
      const consent = await giveOAuthConsent({
        headers: { cookie, origin: config.origin },
        body: {
          accept: true,
          oauth_query: new URL(
            String(authorization.headers.location),
            config.origin,
          ).search.slice(1),
        },
      });
      assert.equal(
        consent.response?.status,
        200,
        JSON.stringify(consent.error),
      );
      const code = new URL(consent.data?.url ?? '').searchParams.get('code');
      assert.ok(code);
      const token = await exchangeOAuthToken({
        body: {
          grant_type: 'authorization_code',
          client_id: registered.data.client_id,
          code,
          code_verifier: verifier,
          redirect_uri: 'https://client.example/callback',
          resource,
        },
      });
      assert.ok(token.data);
      credential = token.data.access_token;
      for (const scenario of selected)
        await t.test(scenario, async () => {
          const directory = join(root, scenario);
          const result = await command([
            'server',
            '--url',
            `${base}/mcp`,
            '--scenario',
            scenario,
            '--output-dir',
            directory,
            '--verbose',
          ]);
          assert.equal(result.code, 0, result.output);
          const reports = (
            await readdir(directory, { recursive: true })
          ).filter((name) => name.endsWith('.json'));
          assert.ok(reports.length > 0, result.output);
          const output = (
            await Promise.all(
              reports.map((name) => readFile(join(directory, name), 'utf8')),
            )
          ).join('\n');
          assert.doesNotMatch(
            output,
            /"status"\s*:\s*"(FAILURE|SKIPPED)"/,
            output,
          );
          assert.match(output, /"status"\s*:\s*"SUCCESS"/, output);
        });
    } finally {
      await app.close();
      await database.destroy();
      await rm(root, { recursive: true, force: true });
    }
  },
);
