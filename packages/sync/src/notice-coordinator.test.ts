/**
 * Checks of the notice coordinator with a driven clock, a fake lease keeper,
 * and a fake transport.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { SyncNoticesServerMessage } from '@notesapp/api-client';
import type { LeaseKeeper, Schedule } from './lease-keeper.ts';
import {
  closeWakeSpreadMs,
  createNoticeCoordinator,
  engineInterval,
  offerRetryMs,
  type NoticeHandlers,
} from './notice-coordinator.ts';

const account = '00000000-0000-4000-8000-0000000000a1';
const first = '00000000-0000-4000-8000-00000000000a';
const second = '00000000-0000-4000-8000-00000000000b';

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

/** Everything the coordinator did, and the handles a test drives. */
class Harness {
  now = 0;
  held = false;
  offered = true;
  randomValue = 0.5;
  opens = 0;
  closes = 0;
  sessionEnds = 0;
  accountChanges = 0;
  readonly sent: { generation: number; ids: readonly string[] }[] = [];
  readonly wakes: string[] = [];
  handlers: NoticeHandlers | null = null;
  readonly timers: { at: number; run: () => void; live: boolean }[] = [];
  readonly leaseListeners = new Set<(held: boolean) => void>();

  readonly schedule: Schedule = (ms, run) => {
    const entry = { at: this.now + ms, run, live: true };
    this.timers.push(entry);
    return () => {
      entry.live = false;
    };
  };

  readonly keeper: LeaseKeeper = {
    start: () => {},
    held: () => this.held,
    gate: {
      hold: () => Promise.resolve(this.held),
      release: () => Promise.resolve(),
    },
    onChange: (listener) => {
      this.leaseListeners.add(listener);
      return () => {
        this.leaseListeners.delete(listener);
      };
    },
    stop: () => Promise.resolve(),
  };

  readonly coordinator = createNoticeCoordinator(account, {
    keeper: this.keeper,
    offered: () => Promise.resolve(this.offered),
    open: (handlers) => {
      this.opens += 1;
      this.handlers = handlers;
      return {
        send: (text) => {
          const parsed: unknown = JSON.parse(text);
          assert.ok(parsed !== null && typeof parsed === 'object');
          const members = Object.fromEntries(Object.entries(parsed));
          assert.equal(typeof members.generation, 'number');
          assert.ok(Array.isArray(members.workspaceIds));
          this.sent.push({
            generation: Number(members.generation),
            ids: members.workspaceIds.map(String),
          });
        },
        close: () => {
          this.closes += 1;
        },
      };
    },
    encode: (generation, workspaceIds) =>
      JSON.stringify({ kind: 'subscribe', generation, workspaceIds }),
    wake: (workspaceId) => this.wakes.push(workspaceId),
    wakeAll: () => this.wakes.push('*'),
    sessionEnded: () => {
      this.sessionEnds += 1;
    },
    accountChanged: () => {
      this.accountChanges += 1;
    },
    schedule: this.schedule,
    random: () => this.randomValue,
  });

  async lease(held: boolean): Promise<void> {
    this.held = held;
    for (const listener of [...this.leaseListeners]) listener(held);
    await settle();
  }

  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      const next = this.timers
        .filter((entry) => entry.live && entry.at <= end)
        .sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      next.live = false;
      this.now = next.at;
      next.run();
      await settle();
    }
    this.now = end;
    await settle();
  }

  receive(message: SyncNoticesServerMessage | null): void {
    this.handlers?.onMessage(message);
  }

  /** Opens the stream and has the first set accepted. */
  async accepted(ids: readonly string[]): Promise<void> {
    this.coordinator.want(ids);
    this.coordinator.start();
    await this.lease(true);
    this.handlers?.onOpen();
    this.receive({ kind: 'ready', accountId: account });
    const last = this.sent.at(-1);
    assert.ok(last !== undefined);
    this.receive({ kind: 'subscribed', generation: last.generation });
  }
}

await test('the stream opens only while the tab holds the lease', async () => {
  const harness = new Harness();
  harness.coordinator.start();
  await settle();
  assert.equal(harness.opens, 0);
  await harness.lease(true);
  assert.equal(harness.opens, 1);
  await harness.lease(false);
  assert.equal(harness.closes, 1);
  assert.equal(harness.coordinator.healthy(), false);
  harness.coordinator.stop();
});

await test('an unoffered stream stays closed and is asked for again later', async () => {
  const harness = new Harness();
  harness.offered = false;
  harness.coordinator.start();
  await harness.lease(true);
  assert.equal(harness.opens, 0);
  await harness.advance(offerRetryMs - 1);
  assert.equal(harness.opens, 0);
  harness.offered = true;
  await harness.advance(1);
  assert.equal(harness.opens, 1);
  harness.coordinator.stop();
});

await test('the set goes after ready, and its acceptance wakes every engine', async () => {
  const harness = new Harness();
  await harness.accepted([second, first]);
  assert.deepEqual(harness.sent, [{ generation: 1, ids: [first, second] }]);
  assert.equal(harness.coordinator.healthy(), true);
  assert.deepEqual(harness.wakes, ['*']);
  harness.coordinator.stop();
});

await test('a notice of the accepted set wakes its engine and a late one nothing', async () => {
  const harness = new Harness();
  await harness.accepted([first]);
  harness.receive({ kind: 'changed', generation: 1, workspaceId: first });
  assert.deepEqual(harness.wakes, ['*', first]);
  harness.coordinator.want([first, second]);
  assert.deepEqual(harness.sent.at(-1), {
    generation: 2,
    ids: [first, second],
  });
  // Until the new set is accepted, a notice of either set is late.
  harness.receive({ kind: 'subscribed', generation: 1 });
  harness.receive({ kind: 'changed', generation: 2, workspaceId: second });
  assert.deepEqual(harness.wakes, ['*', first]);
  harness.receive({ kind: 'subscribed', generation: 2 });
  harness.receive({ kind: 'changed', generation: 1, workspaceId: first });
  harness.receive({ kind: 'changed', generation: 2, workspaceId: second });
  assert.deepEqual(harness.wakes, ['*', first, '*', second]);
  harness.coordinator.stop();
});

await test('a change of the account reaches the tab and wakes no engine', async () => {
  // A lock or an unlock of the account sends this message (record 0201), so
  // the tab reads the account again. The stream stays open.
  const harness = new Harness();
  await harness.accepted([first]);
  harness.receive({ kind: 'account' });
  assert.equal(harness.accountChanges, 1);
  assert.deepEqual(harness.wakes, ['*']);
  assert.equal(harness.closes, 0);
  assert.equal(harness.coordinator.healthy(), true);
  harness.coordinator.stop();
});

await test('an unchanged set sends nothing', async () => {
  const harness = new Harness();
  await harness.accepted([first]);
  harness.coordinator.want([first, first]);
  assert.equal(harness.sent.length, 1);
  harness.coordinator.stop();
});

await test('reconcile and a refused set wake every engine', async () => {
  const harness = new Harness();
  await harness.accepted([first]);
  harness.receive({ kind: 'reconcile', generation: 1 });
  harness.receive({ kind: 'refused', generation: 1, reason: 'forbidden' });
  assert.deepEqual(harness.wakes, ['*', '*', '*']);
  assert.equal(harness.coordinator.healthy(), false);
  harness.coordinator.stop();
});

await test('a reconnect sends the set again after ready', async () => {
  const harness = new Harness();
  await harness.accepted([first]);
  harness.handlers?.onClose();
  assert.equal(harness.coordinator.healthy(), false);
  harness.handlers?.onOpen();
  harness.receive({ kind: 'ready', accountId: account });
  assert.deepEqual(harness.sent.at(-1), { generation: 2, ids: [first] });
  harness.coordinator.stop();
});

await test('a stream that closes wakes every engine for the poll', async () => {
  // Record 0176. An engine rests on the long safety interval while a set is
  // accepted, so a closed stream left it there until the stream came back,
  // and the save of another device waited for the reconnect.
  const harness = new Harness();
  await harness.accepted([first]);
  assert.deepEqual(harness.wakes, ['*']);
  harness.handlers?.onClose();
  assert.equal(harness.coordinator.healthy(), false);
  await harness.advance(closeWakeSpreadMs);
  assert.deepEqual(harness.wakes, ['*', '*']);
  // A second close with no accepted set changes no rest.
  harness.handlers?.onClose();
  await harness.advance(closeWakeSpreadMs);
  assert.deepEqual(harness.wakes, ['*', '*']);
  harness.coordinator.stop();
});

await test('the wake of a closed stream waits a random part of its spread', async () => {
  // Record 0176. A server restart closes the stream of every device at one
  // time, and a wake at once made every device read at that moment.
  const harness = new Harness();
  harness.randomValue = 0.5;
  await harness.accepted([first]);
  harness.handlers?.onClose();
  assert.deepEqual(harness.wakes, ['*']);
  await harness.advance(closeWakeSpreadMs / 2 - 1);
  assert.deepEqual(harness.wakes, ['*']);
  await harness.advance(1);
  assert.deepEqual(harness.wakes, ['*', '*']);
  // A coordinator that stops before the wake asks for no pass.
  const stopped = new Harness();
  await stopped.accepted([first]);
  stopped.handlers?.onClose();
  stopped.coordinator.stop();
  await stopped.advance(closeWakeSpreadMs);
  assert.deepEqual(stopped.wakes, ['*']);
});

await test('an ended session stops the stream for good', async () => {
  const harness = new Harness();
  await harness.accepted([first]);
  harness.receive({ kind: 'stop', reason: 'session_ended' });
  assert.equal(harness.coordinator.ended(), 'session_ended');
  assert.equal(harness.sessionEnds, 1);
  assert.equal(harness.closes, 1);
  await harness.lease(false);
  await harness.lease(true);
  await harness.advance(offerRetryMs);
  assert.equal(harness.opens, 1);
  harness.coordinator.stop();
});

await test('a stream of another account and an unreadable frame end it', async () => {
  const other = new Harness();
  other.coordinator.start();
  await other.lease(true);
  other.receive({ kind: 'ready', accountId: first });
  assert.equal(other.coordinator.ended(), 'other_account');
  assert.equal(other.sent.length, 0);
  other.coordinator.stop();

  const broken = new Harness();
  await broken.accepted([first]);
  broken.receive(null);
  assert.equal(broken.coordinator.ended(), 'malformed');
  broken.coordinator.stop();
});

await test('notices that are off close the stream until a later check', async () => {
  const harness = new Harness();
  await harness.accepted([first]);
  harness.receive({ kind: 'stop', reason: 'unavailable' });
  assert.equal(harness.closes, 1);
  assert.equal(harness.coordinator.ended(), null);
  await harness.advance(offerRetryMs);
  assert.equal(harness.opens, 2);
  harness.coordinator.stop();
});

await test('a drain leaves the reconnect to the transport', async () => {
  const harness = new Harness();
  await harness.accepted([first]);
  harness.receive({ kind: 'stop', reason: 'draining' });
  assert.equal(harness.closes, 0);
  assert.equal(harness.coordinator.healthy(), false);
  assert.equal(harness.coordinator.ended(), null);
  harness.coordinator.stop();
});

await test('health changes are heard, and a stop closes everything', async () => {
  const harness = new Harness();
  const heard: boolean[] = [];
  harness.coordinator.onHealth((healthy) => heard.push(healthy));
  await harness.accepted([first]);
  harness.coordinator.stop();
  assert.deepEqual(heard, [true, false]);
  await harness.lease(true);
  assert.equal(harness.opens, 1);
});

await test('an engine reads less often only while a set is accepted', () => {
  assert.equal(
    engineInterval(false, 15_000, () => 0.5),
    15_000,
  );
  assert.equal(
    engineInterval(true, 15_000, () => 0),
    240_000,
  );
  assert.equal(
    engineInterval(true, 15_000, () => 1),
    360_000,
  );
});
