/**
 * Checks of the notice gateway with a fake socket, fake stores and a fake
 * listener. The real database and two server instances are proved in
 * `tests/integration/sync-notices.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { StreamSocket } from '../plugins/websocket.ts';
import { defaultNoticeBounds, type NoticeBounds } from './bounds.ts';
import {
  createNoticeGateway,
  type GatewayHint,
  type GatewayStores,
  type NoticeGateway,
} from './gateway.ts';

const account = '00000000-0000-4000-8000-0000000000a1';
const first = '00000000-0000-4000-8000-00000000000a';
const second = '00000000-0000-4000-8000-00000000000b';

/** Resolves after every queued promise and timer callback of this turn. */
function settle(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** A socket that records what the gateway does with it. */
class FakeSocket {
  readonly sent: Record<string, unknown>[] = [];
  closedWith: number | null = null;
  terminated = false;
  pings = 0;
  buffered = 0;
  #message: ((text: string | null) => void) | null = null;
  #pong: (() => void) | null = null;
  #close: (() => void) | null = null;

  readonly socket: StreamSocket = {
    send: (text) => {
      const parsed: unknown = JSON.parse(text);
      assert.ok(parsed !== null && typeof parsed === 'object');
      this.sent.push(Object.fromEntries(Object.entries(parsed)));
    },
    close: (code) => {
      this.closedWith = code;
    },
    terminate: () => {
      this.terminated = true;
    },
    ping: () => {
      this.pings += 1;
    },
    bufferedBytes: () => this.buffered,
    onMessage: (listener) => {
      this.#message = listener;
    },
    onPong: (listener) => {
      this.#pong = listener;
    },
    onClose: (listener) => {
      this.#close = listener;
    },
  };

  receive(text: string | null): void {
    this.#message?.(text);
  }

  pong(): void {
    this.#pong?.();
  }

  closeByClient(): void {
    this.#close?.();
  }

  kinds(): unknown[] {
    return this.sent.map((message) => message.kind);
  }
}

/** Stores that answer from fields a test sets. */
class FakeStores {
  readable: readonly string[] | null = [first, second];
  reserveAnswer = true;
  failReserve = false;
  renewAnswer = true;
  accessChecks = 0;
  readonly released: string[] = [];
  readonly reserved: string[] = [];

  readonly stores: GatewayStores = {
    noticeAccess: () => {
      this.accessChecks += 1;
      return Promise.resolve(this.readable);
    },
    reserveStream: (id) => {
      if (this.failReserve) return Promise.reject(new Error('down'));
      if (this.reserveAnswer) this.reserved.push(id);
      return Promise.resolve(this.reserveAnswer);
    },
    renewStream: () => Promise.resolve(this.renewAnswer),
    releaseStream: (id) => {
      this.released.push(id);
      return Promise.resolve();
    },
  };
}

/** A listener that a test drives by hand. */
class FakeListener {
  listening = true;
  closed = false;
  events: {
    onHint: (hint: GatewayHint) => void;
    onLost: () => void;
    onListening: () => void;
  } | null = null;

  hint(hint: GatewayHint): void {
    this.events?.onHint(hint);
  }

  lose(): void {
    this.listening = false;
    this.events?.onLost();
  }

  restore(): void {
    this.listening = true;
    this.events?.onListening();
  }
}

/** A gateway over fakes, and every log line it wrote. */
function gateway(overrides: Partial<NoticeBounds> = {}): {
  readonly gateway: NoticeGateway;
  readonly stores: FakeStores;
  readonly listener: FakeListener;
  readonly log: string[];
} {
  const stores = new FakeStores();
  const listener = new FakeListener();
  const log: string[] = [];
  const built = createNoticeGateway({
    stores: stores.stores,
    listener: (events) => {
      listener.events = events;
      return {
        listening: () => listener.listening,
        close: () => {
          listener.closed = true;
          return Promise.resolve();
        },
      };
    },
    bounds: { ...defaultNoticeBounds, ...overrides },
    log: {
      opened: () => log.push('opened'),
      closed: (reason) => log.push(`closed ${reason}`),
      refused: (reason) => log.push(`refused ${reason}`),
      listenerLost: () => log.push('listener lost'),
      listenerRestored: () => log.push('listener restored'),
    },
  });
  built.start();
  return { gateway: built, stores, listener, log };
}

/** Admits and opens one stream. */
async function openStream(target: NoticeGateway): Promise<FakeSocket> {
  const admitted = await target.admit({
    accountId: account,
    sessionId: 'session-1',
  });
  assert.equal(admitted.ok, true);
  const socket = new FakeSocket();
  if (admitted.ok) admitted.open(socket.socket);
  return socket;
}

function subscribe(generation: number, ids: readonly string[]): string {
  return JSON.stringify({ kind: 'subscribe', generation, workspaceIds: ids });
}

await test('a stream opens with ready and accepts a set before it notifies', async () => {
  const { gateway: target, listener } = gateway();
  await settle();
  assert.deepEqual(target.offered(), ['notesapp.sync.1']);
  const socket = await openStream(target);
  assert.deepEqual(socket.sent[0], { kind: 'ready', accountId: account });
  socket.receive(subscribe(1, [first]));
  await settle();
  assert.deepEqual(socket.sent.at(-1), { kind: 'subscribed', generation: 1 });
  listener.hint({ kind: 'workspace', workspaceId: second });
  listener.hint({ kind: 'workspace', workspaceId: first });
  await settle();
  assert.deepEqual(socket.sent.at(-1), {
    kind: 'changed',
    generation: 1,
    workspaceId: first,
  });
  assert.equal(socket.kinds().filter((kind) => kind === 'changed').length, 1);
  await target.close();
});

await test('a burst of hints costs one access check and one notice', async () => {
  const { gateway: target, listener, stores } = gateway();
  await settle();
  const socket = await openStream(target);
  socket.receive(subscribe(1, [first]));
  await settle();
  const before = stores.accessChecks;
  for (let index = 0; index < 5; index += 1)
    listener.hint({ kind: 'workspace', workspaceId: first });
  await settle();
  assert.equal(stores.accessChecks - before, 1);
  assert.equal(socket.kinds().filter((kind) => kind === 'changed').length, 1);
  await target.close();
});

await test('a stale generation and an unreadable workspace are refused', async () => {
  const { gateway: target, stores } = gateway();
  await settle();
  const socket = await openStream(target);
  socket.receive(subscribe(2, [first]));
  await settle();
  socket.receive(subscribe(2, [second]));
  await settle();
  assert.deepEqual(socket.sent.at(-1), {
    kind: 'refused',
    generation: 2,
    reason: 'stale_generation',
  });
  stores.readable = [first];
  socket.receive(subscribe(3, [first, second]));
  await settle();
  assert.deepEqual(socket.sent.at(-1), {
    kind: 'refused',
    generation: 3,
    reason: 'forbidden',
  });
  await target.close();
});

await test('a lost workspace hears nothing, and a lost session stops', async () => {
  const { gateway: target, listener, stores } = gateway();
  await settle();
  const socket = await openStream(target);
  socket.receive(subscribe(1, [first, second]));
  await settle();
  stores.readable = [second];
  listener.hint({ kind: 'workspace', workspaceId: first });
  await settle();
  assert.equal(socket.kinds().includes('changed'), false);
  listener.hint({ kind: 'workspace', workspaceId: first });
  await settle();
  assert.equal(socket.kinds().includes('changed'), false);

  stores.readable = null;
  listener.hint({ kind: 'session', sessionId: 'session-1' });
  await settle();
  assert.deepEqual(socket.sent.at(-1), {
    kind: 'stop',
    reason: 'session_ended',
  });
  assert.equal(socket.closedWith, 1000);
  assert.equal(stores.released.length, 1);
  assert.equal(target.streamCount(), 0);
  await target.close();
});

await test('an account hint rechecks every stream of the account', async () => {
  const { gateway: target, listener, stores } = gateway();
  await settle();
  const socket = await openStream(target);
  stores.readable = null;
  listener.hint({ kind: 'account', accountId: account });
  await settle();
  assert.deepEqual(socket.sent.at(-1), {
    kind: 'stop',
    reason: 'session_ended',
  });
  await target.close();
});

await test('an account hint that keeps the access tells the stream that the account changed', async () => {
  // A lock or an unlock of the account sends the hint, and the open
  // application reads the account again (records 0189 and 0201).
  const { gateway: target, listener } = gateway();
  await settle();
  const socket = await openStream(target);
  listener.hint({ kind: 'account', accountId: account });
  await settle();
  assert.deepEqual(socket.sent.at(-1), { kind: 'account' });
  // A hint of another account says nothing to this stream.
  const before = socket.sent.length;
  listener.hint({ kind: 'account', accountId: 'another-account' });
  await settle();
  assert.equal(socket.sent.length, before);
  await target.close();
});

await test('a frame outside the contract stops the stream', async () => {
  for (const frame of [null, 'not json', '{"kind":"changed"}']) {
    const { gateway: target } = gateway();
    await settle();
    const socket = await openStream(target);
    socket.receive(frame);
    assert.deepEqual(socket.sent.at(-1), { kind: 'stop', reason: 'malformed' });
    assert.equal(socket.closedWith, 1008);
    await target.close();
  }
});

await test('too many messages in a window stop the stream', async () => {
  const { gateway: target } = gateway({ messagesPerWindow: 2 });
  await settle();
  const socket = await openStream(target);
  for (let generation = 1; generation <= 3; generation += 1)
    socket.receive(subscribe(generation, []));
  assert.deepEqual(socket.sent.at(-1), { kind: 'stop', reason: 'overloaded' });
  assert.equal(socket.closedWith, 1013);
  await target.close();
});

await test('a full outbound buffer stops the stream', async () => {
  const { gateway: target, listener } = gateway({ maxBufferedBytes: 10 });
  await settle();
  const socket = await openStream(target);
  socket.receive(subscribe(1, [first]));
  await settle();
  socket.buffered = 11;
  listener.hint({ kind: 'workspace', workspaceId: first });
  await settle();
  assert.deepEqual(socket.sent.at(-1), { kind: 'stop', reason: 'overloaded' });
  await target.close();
});

await test('a short listener gap ends with reconcile', async () => {
  const { gateway: target, listener } = gateway({ listenerGraceMs: 1_000 });
  await settle();
  const socket = await openStream(target);
  socket.receive(subscribe(4, [first]));
  await settle();
  listener.lose();
  assert.deepEqual(target.offered(), []);
  const refused = await target.admit({
    accountId: account,
    sessionId: 'session-2',
  });
  assert.deepEqual(refused, { ok: false, reason: 'listener' });
  listener.restore();
  assert.deepEqual(socket.sent.at(-1), { kind: 'reconcile', generation: 4 });
  await target.close();
});

await test('a long listener gap stops every stream', async () => {
  const { gateway: target, listener } = gateway({ listenerGraceMs: 5 });
  await settle();
  const socket = await openStream(target);
  listener.lose();
  await settle(20);
  assert.deepEqual(socket.sent.at(-1), { kind: 'stop', reason: 'unavailable' });
  await target.close();
});

await test('each admission refusal names its reason', async () => {
  // A gateway whose listener has not started offers nothing and admits
  // nothing, whatever the deployment.
  const idle = createNoticeGateway({
    stores: new FakeStores().stores,
    listener: () => ({
      listening: () => false,
      close: () => Promise.resolve(),
    }),
    bounds: defaultNoticeBounds,
    log: {
      opened: () => {},
      closed: () => {},
      refused: () => {},
      listenerLost: () => {},
      listenerRestored: () => {},
    },
  });
  idle.start();
  assert.deepEqual(idle.offered(), []);
  assert.deepEqual(await idle.admit({ accountId: account, sessionId: 's' }), {
    ok: false,
    reason: 'listener',
  });
  await idle.close();

  const full = gateway({ streamsPerProcess: 1 });
  await settle();
  await openStream(full.gateway);
  assert.deepEqual(
    await full.gateway.admit({ accountId: account, sessionId: 's' }),
    { ok: false, reason: 'process_limit' },
  );
  await full.gateway.close();

  const limited = gateway();
  await settle();
  limited.stores.reserveAnswer = false;
  assert.deepEqual(
    await limited.gateway.admit({ accountId: account, sessionId: 's' }),
    { ok: false, reason: 'account_limit' },
  );
  limited.stores.reserveAnswer = true;
  limited.stores.failReserve = true;
  assert.deepEqual(
    await limited.gateway.admit({ accountId: account, sessionId: 's' }),
    { ok: false, reason: 'store_unavailable' },
  );
  await limited.gateway.close();
});

await test('an admission that never opens gives back its reservation', async () => {
  const { gateway: target, stores } = gateway({ openDeadlineMs: 5 });
  await settle();
  const admitted = await target.admit({ accountId: account, sessionId: 's' });
  assert.equal(admitted.ok, true);
  await settle(20);
  assert.deepEqual(stores.released, stores.reserved);
  const late = new FakeSocket();
  if (admitted.ok) admitted.open(late.socket);
  assert.equal(late.closedWith, 1001);
  assert.equal(target.streamCount(), 0);
  await target.close();
});

await test('a stream without a Pong ends at the next heartbeat', async () => {
  const { gateway: target } = gateway({ heartbeatMs: 10 });
  await settle();
  const socket = await openStream(target);
  await settle(15);
  assert.equal(socket.pings, 1);
  socket.pong();
  await settle(10);
  assert.equal(socket.terminated, false);
  await settle(25);
  assert.equal(socket.terminated, true);
  assert.equal(target.streamCount(), 0);
  await target.close();
});

await test('a reservation that cannot be renewed stops the stream', async () => {
  const { gateway: target, stores } = gateway({ reservationRenewMs: 10 });
  await settle();
  const socket = await openStream(target);
  stores.renewAnswer = false;
  await settle(25);
  assert.deepEqual(socket.sent.at(-1), { kind: 'stop', reason: 'unavailable' });
  await target.close();
});

await test('a client close releases the stream', async () => {
  const { gateway: target, stores, log } = gateway();
  await settle();
  const socket = await openStream(target);
  socket.closeByClient();
  assert.equal(target.streamCount(), 0);
  assert.equal(stores.released.length, 1);
  assert.ok(log.includes('closed client_closed'));
});

await test('the drain stops every stream and refuses new ones', async () => {
  const { gateway: target, listener } = gateway();
  await settle();
  const socket = await openStream(target);
  await target.close();
  assert.deepEqual(socket.sent.at(-1), { kind: 'stop', reason: 'draining' });
  assert.equal(socket.closedWith, 1001);
  assert.equal(listener.closed, true);
  assert.deepEqual(await target.admit({ accountId: account, sessionId: 's' }), {
    ok: false,
    reason: 'draining',
  });
});

await test('the log names reasons and no identifier', async () => {
  const { gateway: target, listener, stores, log } = gateway();
  await settle();
  const socket = await openStream(target);
  socket.receive(subscribe(1, [first]));
  await settle();
  stores.readable = null;
  listener.hint({ kind: 'session', sessionId: 'session-1' });
  await settle();
  await target.close();
  const text = log.join('\n');
  for (const secret of [account, first, 'session-1'])
    assert.equal(text.includes(secret), false, secret);
});

await test('the largest valid subscription frame fits the frame bound', () => {
  const frame = subscribe(
    Number.MAX_SAFE_INTEGER,
    Array.from(
      { length: 1000 },
      (_, index) =>
        `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    ),
  );
  assert.ok(
    Buffer.byteLength(frame) < defaultNoticeBounds.maxFrameBytes,
    String(Buffer.byteLength(frame)),
  );
});
