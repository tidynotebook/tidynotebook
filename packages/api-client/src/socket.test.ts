/**
 * Checks of the notice transport over the pinned PartySocket, with a fake
 * socket and a mocked clock. They prove the retry schedule that the settings
 * give, the cap, the end of reconnects on close and on a policy close, and
 * that no message waits in a buffer while the connection is down.
 */
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { connectSyncNotices, reconnectSettings } from './socket.ts';

/** A socket that records each attempt and lets a test drive its events. */
class FakeSocket extends EventTarget {
  static readonly attempts: { at: number; socket: FakeSocket }[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly url: string;
  readonly protocols: unknown;
  readyState = 0;
  binaryType = 'blob';
  bufferedAmount = 0;
  readonly sent: string[] = [];
  constructor(url: string, protocols: unknown) {
    super();
    this.url = url;
    this.protocols = protocols;
    FakeSocket.attempts.push({ at: Date.now(), socket: this });
  }
  send(text: string): void {
    this.sent.push(text);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  fail(code = 1006): void {
    this.readyState = 3;
    const event = new Event('close');
    Object.defineProperty(event, 'code', { value: code });
    this.dispatchEvent(event);
  }
}

/** Lets the promise chain of the library run after a timer. */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

async function tick(ms: number): Promise<void> {
  mock.timers.tick(ms);
  await flush();
}

const handlers = {
  onOpen: () => {},
  onMessage: () => {},
  onClose: () => {},
};

await test('each transport draws its delays inside the bounds', () => {
  assert.deepEqual(
    reconnectSettings(() => 0),
    {
      minReconnectionDelay: 1_000,
      maxReconnectionDelay: 30_000,
      reconnectionDelayGrowFactor: 1.5,
      minUptime: 5_000,
      connectionTimeout: 10_000,
    },
  );
  const high = reconnectSettings(() => 1);
  assert.equal(high.minReconnectionDelay, 2_000);
  assert.equal(high.maxReconnectionDelay, 60_000);
});

await test('failed tries wait longer each time up to the cap, then stop on close', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  FakeSocket.attempts.length = 0;
  try {
    const transport = connectSyncNotices('https://notes.example', handlers, {
      random: () => 0,
      socketClass: FakeSocket,
    });
    await tick(0);
    assert.equal(FakeSocket.attempts.length, 1);
    const first = FakeSocket.attempts[0];
    assert.equal(first?.socket.url, 'wss://notes.example/api/sync/notices');
    assert.deepEqual(first?.socket.protocols, ['notesapp.sync.2']);
    // Each close starts the next try after the delay of its count.
    const expected = [1_000, 1_500, 2_250, 3_375];
    for (const delay of expected) {
      FakeSocket.attempts.at(-1)?.socket.fail();
      const before: number = FakeSocket.attempts.length;
      await tick(delay - 1);
      assert.equal(
        FakeSocket.attempts.length,
        before,
        `before ${String(delay)}`,
      );
      await tick(1);
      assert.equal(
        FakeSocket.attempts.length,
        before + 1,
        `at ${String(delay)}`,
      );
    }
    // A long outage reaches the cap and stays there.
    for (let round = 0; round < 12; round += 1) {
      FakeSocket.attempts.at(-1)?.socket.fail();
      await tick(30_000);
    }
    const last = FakeSocket.attempts.slice(-3).map((entry) => entry.at);
    assert.equal((last[2] ?? 0) - (last[1] ?? 0), 30_000);
    const count = FakeSocket.attempts.length;
    transport.close();
    await tick(120_000);
    assert.equal(FakeSocket.attempts.length, count);
  } finally {
    mock.timers.reset();
  }
});

await test('a policy close ends the reconnects', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  FakeSocket.attempts.length = 0;
  try {
    connectSyncNotices('http://127.0.0.1:3000', handlers, {
      random: () => 0,
      socketClass: FakeSocket,
    });
    await tick(0);
    const first = FakeSocket.attempts[0];
    assert.equal(first?.socket.url, 'ws://127.0.0.1:3000/api/sync/notices');
    first?.socket.fail(1008);
    await tick(120_000);
    assert.equal(FakeSocket.attempts.length, 1);
  } finally {
    mock.timers.reset();
  }
});

await test('a message sent while down is dropped, not replayed', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  FakeSocket.attempts.length = 0;
  const opened: string[] = [];
  try {
    const transport = connectSyncNotices(
      'https://notes.example',
      { ...handlers, onOpen: () => opened.push('open') },
      { random: () => 0, socketClass: FakeSocket },
    );
    await tick(0);
    transport.send('{"kind":"subscribe","generation":1,"workspaceIds":[]}');
    const socket = FakeSocket.attempts[0]?.socket;
    socket?.open();
    await flush();
    assert.deepEqual(opened, ['open']);
    assert.deepEqual(socket?.sent, []);
    transport.send('{"kind":"subscribe","generation":2,"workspaceIds":[]}');
    assert.equal(socket?.sent.length, 1);
    transport.close();
  } finally {
    mock.timers.reset();
  }
});
