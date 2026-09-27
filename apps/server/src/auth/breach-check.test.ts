import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBreach, digestParts, rangeLists } from './breach-check.ts';

await test('only the first five characters of the digest leave the server', () => {
  // The SHA-1 digest of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
  assert.deepEqual(digestParts('password'), {
    prefix: '5BAA6',
    suffix: '1E4C9B93F3F0682250B6CF8331B7EE68FD8',
  });
});

await test('a listed suffix with a count is a match and a padded one is not', () => {
  const suffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
  assert.equal(
    rangeLists(
      `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${suffix}:3861493\r\n`,
      suffix,
    ),
    true,
  );
  assert.equal(rangeLists(`${suffix.toLowerCase()}:2`, suffix), true);
  assert.equal(rangeLists(`${suffix}:0`, suffix), false);
  assert.equal(
    rangeLists('0018A45C4D1DEF81644B54AB7F969B88D65:1', suffix),
    false,
  );
  assert.equal(rangeLists('', suffix), false);
});

await test('the check asks with the prefix and reads the answer', async () => {
  const asked: string[] = [];
  const breached = await checkBreach('password', (prefix) => {
    asked.push(prefix);
    return Promise.resolve('1E4C9B93F3F0682250B6CF8331B7EE68FD8:10');
  });
  assert.equal(breached, 'breached');
  assert.deepEqual(asked, ['5BAA6']);
  assert.equal(
    await checkBreach('password', () => Promise.resolve('AAAA:1')),
    'clear',
  );
});

await test('no answer and a failed answer both read as unavailable', async () => {
  assert.equal(
    await checkBreach('password', () => Promise.resolve(null)),
    'unavailable',
  );
  assert.equal(
    await checkBreach('password', () => Promise.reject(new Error('down'))),
    'unavailable',
  );
});
