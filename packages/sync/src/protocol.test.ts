import assert from 'node:assert/strict';
import test from 'node:test';
import {
  protocolFit,
  servedProtocolOfProblem,
  type ServedProtocol,
} from './protocol.ts';

const served = (...versions: number[]): ServedProtocol => ({
  kind: 'served',
  versions,
});

await test('a served list that holds the client version fits', () => {
  assert.equal(protocolFit(1, served(1)), 'compatible');
  assert.equal(protocolFit(2, served(1, 2)), 'compatible');
});

await test('a server with only later versions asks the client to update', () => {
  assert.equal(protocolFit(1, served(2)), 'client-behind');
  assert.equal(protocolFit(1, served(2, 3)), 'client-behind');
});

await test('a server with only earlier versions makes the client wait', () => {
  assert.equal(protocolFit(2, served(1)), 'server-behind');
});

await test('a later version in a list without the client version asks for an update', () => {
  assert.equal(protocolFit(2, served(1, 3)), 'client-behind');
});

await test('an absent operation serves version 1 and grants nothing later', () => {
  // Record 0086: a legacy server does not permit the new format.
  assert.equal(protocolFit(1, { kind: 'absent' }), 'compatible');
  assert.equal(protocolFit(2, { kind: 'absent' }), 'server-behind');
});

await test('only a route not found answer names a legacy server', () => {
  assert.deepEqual(
    servedProtocolOfProblem({
      status: 404,
      code: 'route_not_found',
      fileIds: [],
    }),
    { kind: 'absent' },
  );
  // A 404 with another code, for example from a proxy, proves nothing.
  assert.equal(
    servedProtocolOfProblem({
      status: 404,
      code: 'unexpected_response',
      fileIds: [],
    }),
    null,
  );
  assert.equal(
    servedProtocolOfProblem({
      status: 500,
      code: 'route_not_found',
      fileIds: [],
    }),
    null,
  );
});
