/**
 * Checks of the notices of two tabs of one account, over one fake channel,
 * one lease row, one fake stream and one driven clock.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeaseStore, NoticeHandlers, Schedule } from '@notesapp/sync';
import { interestTtlMs } from '@notesapp/sync';
import {
  interestChannelName,
  leaseTtlMs,
  readTabMessage,
  startTabNotices,
  suspendMs,
  type TabChannel,
  type TabNotices,
} from './notices.ts';

const account = '00000000-0000-4000-8000-0000000000a1';
const w1 = '00000000-0000-4000-8000-0000000000b1';
const w2 = '00000000-0000-4000-8000-0000000000b2';

async function settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

/** One clock, one lease row, one channel bus, and one stream per tab. */
class World {
  now = 0;
  readonly frozen = new Set<string>();
  readonly timers: { at: number; run: () => void; live: boolean }[] = [];
  owner: string | null = null;
  expiresAt = 0;
  readonly buses = new Map<string, Set<(message: unknown) => void>>();
  readonly streams = new Map<
    string,
    { handlers: NoticeHandlers; sent: unknown[] }
  >();

  readonly schedule: Schedule = (ms, run) => {
    const entry = { at: this.now + ms, run, live: true };
    this.timers.push(entry);
    return () => {
      entry.live = false;
    };
  };

  readonly store: LeaseStore = {
    acquireLease: (ownerId, expiresAt) => {
      if (
        this.owner !== null &&
        this.owner !== ownerId &&
        this.expiresAt > this.now
      )
        return Promise.resolve(false);
      this.owner = ownerId;
      this.expiresAt = expiresAt;
      return Promise.resolve(true);
    },
    releaseLease: (ownerId) => {
      if (this.owner === ownerId) this.owner = null;
      return Promise.resolve();
    },
    readLeaseState: () => Promise.resolve(null),
  };

  channel(name: string, own: (message: unknown) => void): TabChannel {
    const listeners = this.buses.get(name) ?? new Set();
    this.buses.set(name, listeners);
    let mine: ((message: unknown) => void) | null = null;
    return {
      post: (message) => {
        // A channel does not echo to its own sender.
        for (const listener of [...listeners])
          if (listener !== mine) listener(structuredClone(message));
        own(message);
      },
      onMessage: (listener) => {
        mine = listener;
        listeners.add(listener);
      },
      close: () => {
        if (mine !== null) listeners.delete(mine);
      },
    };
  }

  tab(tabId: string, accountId = account): TabNotices {
    return startTabNotices({
      store: this.store,
      accountId,
      tabId,
      channel: (name) => this.channel(name, () => {}),
      offered: () => Promise.resolve(true),
      connect: (handlers) => {
        const sent: unknown[] = [];
        const stream = { handlers, sent };
        this.streams.set(tabId, stream);
        return {
          send: (text) => {
            stream.sent.push(JSON.parse(text));
          },
          close: () => {
            this.streams.delete(tabId);
          },
        };
      },
      // A frozen tab runs no timer, as a tab that the browser froze.
      schedule: (ms, run) =>
        this.schedule(ms, () => {
          if (!this.frozen.has(tabId)) run();
        }),
      clock: () => this.now,
      random: () => 0.5,
    });
  }

  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      await settle();
      const next = this.timers
        .filter((entry) => entry.live && entry.at <= end)
        .sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      next.live = false;
      this.now = next.at;
      next.run();
    }
    this.now = end;
    await settle();
  }

  /** Answers ready and accepts the last set of a tab's stream. */
  accept(tabId: string): unknown {
    const stream = this.streams.get(tabId);
    assert.ok(stream !== undefined, `the stream of ${tabId} is open`);
    stream.handlers.onOpen();
    stream.handlers.onMessage({ kind: 'ready', accountId: account });
    const last = stream.sent.at(-1);
    assert.ok(last !== null && typeof last === 'object');
    const members: Record<string, unknown> = Object.fromEntries(
      Object.entries(last),
    );
    const generation = members.generation;
    assert.equal(typeof generation, 'number');
    stream.handlers.onMessage({
      kind: 'subscribed',
      generation: Number(generation),
    });
    return last;
  }
}

await test('the lease tab serves the open workspace of another tab', async () => {
  const world = new World();
  const a = world.tab('tab-a');
  await world.advance(0);
  a.open(w1);
  const b = world.tab('tab-b');
  b.open(w2);
  await world.advance(0);
  assert.equal(await a.gate.hold(), true);
  assert.equal(await b.gate.hold(), false);
  assert.deepEqual(a.served(), [w2]);
  assert.deepEqual(b.served(), []);
  assert.deepEqual(world.accept('tab-a'), {
    kind: 'subscribe',
    generation: 1,
    workspaceIds: [w1, w2],
  });
  assert.equal(world.streams.has('tab-b'), false);
  await a.stop();
  await b.stop();
});

await test('a notice wakes the engine of its workspace in the lease tab', async () => {
  const world = new World();
  const a = world.tab('tab-a');
  await world.advance(0);
  a.open(w1);
  const woken: string[] = [];
  a.register(w1, () => woken.push(w1));
  a.register(w2, () => woken.push(w2));
  world.accept('tab-a');
  woken.length = 0;
  world.streams
    .get('tab-a')
    ?.handlers.onMessage({ kind: 'changed', generation: 1, workspaceId: w1 });
  assert.deepEqual(woken, [w1]);
  assert.ok(a.interval() >= 240_000, 'an accepted set reads less often');
  await a.stop();
});

await test('a change of the account reaches every tab of the account', async () => {
  // Only the lease tab holds the stream, and each tab shows the account, so
  // a lock or an unlock reaches them all (record 0201).
  const world = new World();
  const a = world.tab('tab-a');
  await world.advance(0);
  const b = world.tab('tab-b');
  await world.advance(0);
  const heard: string[] = [];
  const stopA = a.onAccountChanged(() => heard.push('tab-a'));
  b.onAccountChanged(() => heard.push('tab-b'));
  world.accept('tab-a');
  world.streams.get('tab-a')?.handlers.onMessage({ kind: 'account' });
  assert.deepEqual(heard.sort(), ['tab-a', 'tab-b']);
  stopA();
  world.streams.get('tab-a')?.handlers.onMessage({ kind: 'account' });
  assert.deepEqual(heard.sort(), ['tab-a', 'tab-b', 'tab-b']);
  await a.stop();
  await b.stop();
});

await test('a tab that leaves or goes silent leaves the set', async () => {
  const world = new World();
  const a = world.tab('tab-a');
  await world.advance(0);
  const b = world.tab('tab-b');
  b.open(w2);
  await world.advance(0);
  assert.deepEqual(a.served(), [w2]);
  await b.stop();
  assert.deepEqual(a.served(), []);

  const c = world.tab('tab-c');
  c.open(w2);
  await world.advance(0);
  assert.deepEqual(a.served(), [w2]);
  // The tab freezes: its timers stop, so its interest is no longer renewed.
  world.frozen.add('tab-c');
  await world.advance(interestTtlMs - 1);
  assert.deepEqual(a.served(), [w2]);
  await world.advance(interestTtlMs);
  assert.deepEqual(a.served(), []);
  await a.stop();
  await c.stop();
});

await test('a second tab takes the lease and the stream when the first stops', async () => {
  const world = new World();
  const a = world.tab('tab-a');
  await world.advance(0);
  const b = world.tab('tab-b');
  b.open(w2);
  await world.advance(0);
  assert.equal(world.streams.has('tab-a'), true);
  await a.stop();
  assert.equal(world.owner, null);
  assert.equal(world.streams.has('tab-a'), false);
  await world.advance(Math.floor(leaseTtlMs / 3));
  assert.equal(await b.gate.hold(), true);
  assert.equal(world.streams.has('tab-b'), true);
  await b.stop();
});

await test('two accounts share no channel', async () => {
  assert.notEqual(
    interestChannelName(account),
    interestChannelName('00000000-0000-4000-8000-0000000000a2'),
  );
  const world = new World();
  const a = world.tab('tab-a');
  await world.advance(0);
  const other = world.tab('tab-x', '00000000-0000-4000-8000-0000000000a2');
  other.open(w2);
  await world.advance(0);
  assert.deepEqual(a.served(), []);
  await a.stop();
  await other.stop();
});

await test('a message of the channel is read only in its shape', () => {
  assert.deepEqual(readTabMessage({ kind: 'bye', tabId: 't' }), {
    kind: 'bye',
    tabId: 't',
  });
  assert.deepEqual(
    readTabMessage({ kind: 'interest', tabId: 't', workspaceId: null }),
    { kind: 'interest', tabId: 't', workspaceId: null },
  );
  for (const value of [
    null,
    'bye',
    { kind: 'bye' },
    { kind: 'bye', tabId: '' },
    { kind: 'interest', tabId: 't', workspaceId: 7 },
    { kind: 'shout', tabId: 't' },
  ])
    assert.equal(readTabMessage(value), null, JSON.stringify(value));
});

await test('a tab whose session serves no longer gives the lease back', async () => {
  const world = new World();
  const a = world.tab('tab-a');
  await world.advance(0);
  const b = world.tab('tab-b');
  await world.advance(0);
  assert.equal(await a.gate.hold(), true);
  // The session of tab A now serves another account, so it cannot send, and
  // it must not keep the other tab from sending either.
  await a.suspend();
  assert.equal(await a.gate.hold(), false);
  assert.equal(world.streams.has('tab-a'), false);
  await world.advance(Math.floor(leaseTtlMs / 3));
  assert.equal(await b.gate.hold(), true);
  // A suspended tab asks again later, and finds the lease taken.
  await world.advance(suspendMs);
  assert.equal(await a.gate.hold(), false);
  assert.equal(await b.gate.hold(), true);
  // With the other tab gone, the later check takes the lease back.
  await b.stop();
  await a.suspend();
  await world.advance(suspendMs);
  assert.equal(await a.gate.hold(), true);
  await a.stop();
});
