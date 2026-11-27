import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  retainInviteSeatQuote,
  type InviteSeatQuote,
} from './invite-addresses.ts';

await test('formatting edits keep a refused seat quote for the same addresses', () => {
  const quote: InviteSeatQuote = {
    key: 'one@example.com,two@example.com',
    free: 0,
    needed: 2,
    refused: true,
  };
  for (const input of [
    'one@example.com,two@example.com ',
    'one@example.com\ntwo@example.com\n',
    '  one@example.com,   two@example.com',
  ])
    assert.equal(retainInviteSeatQuote(quote, input), quote);
  assert.equal(retainInviteSeatQuote(quote, 'one@example.com'), null);
  assert.equal(retainInviteSeatQuote(quote, ''), null);
});
