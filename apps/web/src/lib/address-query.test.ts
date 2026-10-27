import assert from 'node:assert/strict';
import test from 'node:test';
import {
  queryWith,
  queryAddress,
  queryValue,
  queryValues,
} from './address-query.ts';

await test('a member of the query reads decoded', () => {
  assert.equal(queryValue('?path=%2Fmembers%2Fjoin', 'path'), '/members/join');
  assert.equal(queryValue('path=/profile', 'path'), '/profile');
  assert.equal(queryValue('?a=1&path=/b&path=/c', 'path'), '/b');
  assert.equal(queryValue('?next=a+b', 'next'), 'a b');
  assert.equal(queryValue('?path', 'path'), '');
  assert.equal(queryValue('?p%61th=%2Fx', 'path'), '/x');
});

await test('no member, and a member that is not valid encoding, read as none', () => {
  assert.equal(queryValue('', 'path'), null);
  assert.equal(queryValue('?', 'path'), null);
  assert.equal(queryValue('?other=1', 'path'), null);
  assert.equal(queryValue('?path=%E0%A4%A', 'path'), null);
});

await test('an address with one member reads back as it was written', () => {
  const address = queryAddress('/portal', 'path', '/a b&c=d?e#f');
  assert.equal(address, '/portal?path=%2Fa%20b%26c%3Dd%3Fe%23f');
  assert.equal(
    queryValue(address.slice('/portal'.length), 'path'),
    '/a b&c=d?e#f',
  );
});

await test('all values keep duplicates, decoded names, and form spaces', () => {
  assert.deepEqual(queryValues('?scope=read&sc%6Fpe=write+notes', 'scope'), [
    'read',
    'write notes',
  ]);
  assert.deepEqual(queryValues('?scope&scope=', 'scope'), ['', '']);
  assert.deepEqual(queryValues('?', 'scope'), []);
  assert.deepEqual(queryValues('?other=1', 'scope'), []);
  assert.equal(queryValues('?scope=%E0%A4%A', 'scope'), null);
  assert.equal(queryValues('?%E0%A4%A=1&scope=read', 'scope'), null);
});

await test('one member is replaced or removed, and the others keep their text', () => {
  assert.equal(queryWith('', 'settings', 'account'), '?settings=account');
  assert.equal(queryWith('?a=1&settings=x', 'settings', ''), '?a=1&settings=');
  assert.equal(queryWith('?settings=x&a=b%20c', 'settings', null), '?a=b%20c');
  assert.equal(queryWith('settings=x', 'settings', null), '');
  assert.equal(queryWith('?a', 'settings', 'a b'), '?a&settings=a%20b');
});
