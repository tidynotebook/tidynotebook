/** Client protocol exceptions are the exact contract error sets (0225, 0226). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

/** @param {unknown} value */
function record(value) {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  );
  return Object.fromEntries(Object.entries(value));
}
await test('the client path exception and error enum match the generated contract', async () => {
  const [source, contract] = await Promise.all([
    readFile(
      new URL('../packages/api-client/src/configure.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL(
        '../packages/api-contract/src/generated/openapi.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);
  const prefixes = (name) => {
    const list = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(
      source,
    )?.[1];
    assert.ok(list, name);
    return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  };
  const oauthPrefixes = prefixes('oauthPathPrefixes');
  const mcpPrefixes = prefixes('mcpPathPrefixes');
  assert.deepEqual(oauthPrefixes, ['/api/auth/oauth2/', '/mcp']);
  assert.deepEqual(mcpPrefixes, ['/mcp']);
  const list = /export const oauthErrorCodes = \[([\s\S]*?)\] as const/.exec(
    source,
  )?.[1];
  assert.ok(list);
  const codes = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const document = record(JSON.parse(contract));
  const schemas = record(record(document.components).schemas);
  assert.deepEqual(
    record(record(record(schemas.OAuthError).properties).error).enum,
    codes,
  );
  for (const [path, item] of Object.entries(record(document.paths))) {
    for (const [method, operation] of Object.entries(record(item))) {
      if (
        !['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(
          method,
        )
      )
        continue;
      const errors = Object.entries(record(record(operation).responses)).filter(
        ([status]) => Number(status) >= 400,
      );
      for (const [schema, prefixes] of [
        ['OAuthError', oauthPrefixes],
        ['McpError', mcpPrefixes],
      ]) {
        const declared = errors.some(([, error]) =>
          JSON.stringify(error).includes(`#/components/schemas/${schema}`),
        );
        assert.equal(
          declared,
          prefixes.some((prefix) => path.startsWith(prefix)),
          `${schema}: ${method} ${path}`,
        );
      }
    }
  }
});
