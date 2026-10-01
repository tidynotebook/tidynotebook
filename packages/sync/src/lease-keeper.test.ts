/** Checks of the lease keeper with a driven clock and a fake lease row. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeaseStore } from './lease.ts';
import { createLeaseKeeper, type Schedule } from './lease-keeper.ts';

/** One lease row with a compare and set, as the local store keeps it. */
class LeaseRow {
  owner: string | null = null;
  expiresAt = 0;
  releases = 0;
  fail = false;
  readonly now: () => number;
  constructor(now: () => number) {
    this.now = now;
  }
  readonly store: LeaseStore = {
    acquireLease: (ownerId, expiresAt) => {
      if (this.fail) return Promise.reject(new Error('store down'));
      if (
        this.owner !== null &&
        this.owner !== ownerId &&
        this.expiresAt > this.now()
      )
        return Promise.resolve(false);
      this.owner = ownerId;
      this.expiresAt = expiresAt;
      return Promise.resolve(true);
    },
    releaseLease: (ownerId) => {
      if (this.owner === ownerId) {
        this.owner = null;
        this.releases += 1;
      }
      return Promise.resolve();
    },
    readLeaseState: () =>
      Promise.resolve(
        this.owner === null
          ? null
          : { ownerId: this.owner, expiresAt: this.expiresAt },
      ),
  };
}

/** A clock and a schedule that a test moves by hand. */
class DrivenClock {
  now = 1_000;
  readonly pending: { at: number; run: () => void; live: boolean }[] = [];
  readonly schedule: Schedule = (ms, run) => {
    const entry = { at: this.now + ms, run, live: true };
    this.pending.push(entry);
    return () => {
      entry.live = false;
    };
  };
  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      await settle();
      const next = this.pending
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
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

await test('the keeper takes the lease and renews it with no traffic', async () => {
  const clock = new DrivenClock();
  const row = new LeaseRow(() => clock.now);
  const keeper = createLeaseKeeper(row.store, {
    ownerId: 'tab-a',
    ttlMs: 3_000,
    clock: () => clock.now,
    schedule: clock.schedule,
  });
  const changes: boolean[] = [];
  keeper.onChange((held) => changes.push(held));
  keeper.start();
  await clock.advance(0);
  assert.equal(keeper.held(), true);
  assert.equal(await keeper.gate.hold(), true);
  // Ten lives of the lease pass, and the row never expires.
  for (let step = 0; step < 30; step += 1) {
    await clock.advance(1_000);
    assert.ok(row.expiresAt > clock.now, `step ${String(step)}`);
  }
  assert.deepEqual(changes, [true]);
  await keeper.stop();
});

await test('a gate release keeps the lease for every other engine', async () => {
  const clock = new DrivenClock();
  const row = new LeaseRow(() => clock.now);
  const keeper = createLeaseKeeper(row.store, {
    ownerId: 'tab-a',
    ttlMs: 3_000,
    clock: () => clock.now,
    schedule: clock.schedule,
  });
  keeper.start();
  await clock.advance(0);
  await keeper.gate.release();
  assert.equal(row.owner, 'tab-a');
  assert.equal(row.releases, 0);
  await keeper.stop();
  assert.equal(row.owner, null);
  assert.equal(row.releases, 1);
});

await test('a second tab waits and takes over when the first stops', async () => {
  const clock = new DrivenClock();
  const row = new LeaseRow(() => clock.now);
  const options = {
    ttlMs: 3_000,
    clock: () => clock.now,
    schedule: clock.schedule,
  };
  const first = createLeaseKeeper(row.store, { ...options, ownerId: 'tab-a' });
  const second = createLeaseKeeper(row.store, { ...options, ownerId: 'tab-b' });
  first.start();
  await clock.advance(0);
  second.start();
  await clock.advance(2_000);
  assert.equal(second.held(), false);
  await first.stop();
  await clock.advance(1_000);
  assert.equal(second.held(), true);
  assert.equal(row.owner, 'tab-b');
  await second.stop();
});

await test('a frozen first tab loses the lease after its life', async () => {
  const clock = new DrivenClock();
  const row = new LeaseRow(() => clock.now);
  // The first tab takes the lease and then stops its timers, as a tab that
  // the browser froze does.
  await row.store.acquireLease('frozen', clock.now + 3_000);
  const keeper = createLeaseKeeper(row.store, {
    ownerId: 'tab-b',
    ttlMs: 3_000,
    clock: () => clock.now,
    schedule: clock.schedule,
  });
  keeper.start();
  await clock.advance(2_000);
  assert.equal(keeper.held(), false);
  await clock.advance(2_000);
  assert.equal(keeper.held(), true);
  await keeper.stop();
});

await test('a store that cannot answer stops the sending until it answers', async () => {
  const clock = new DrivenClock();
  const row = new LeaseRow(() => clock.now);
  const keeper = createLeaseKeeper(row.store, {
    ownerId: 'tab-a',
    ttlMs: 3_000,
    clock: () => clock.now,
    schedule: clock.schedule,
  });
  const changes: boolean[] = [];
  keeper.onChange((held) => changes.push(held));
  keeper.start();
  await clock.advance(0);
  row.fail = true;
  await clock.advance(1_000);
  assert.equal(keeper.held(), false);
  row.fail = false;
  await clock.advance(1_000);
  assert.equal(keeper.held(), true);
  assert.deepEqual(changes, [true, false, true]);
  await keeper.stop();
});

await test('the gate waits for the first check of a tab that just started', async () => {
  const clock = new DrivenClock();
  const row = new LeaseRow(() => clock.now);
  // The store answers the first take only when the test lets it, as a busy
  // IndexedDB does while the tab opens.
  let answer: () => void = () => {};
  const slow: LeaseStore = {
    ...row.store,
    acquireLease: (ownerId, expiresAt) =>
      new Promise<boolean>((resolve) => {
        answer = () => {
          void row.store.acquireLease(ownerId, expiresAt).then(resolve);
        };
      }),
  };
  const keeper = createLeaseKeeper(slow, {
    ownerId: 'tab-a',
    ttlMs: 3_000,
    clock: () => clock.now,
    schedule: clock.schedule,
  });
  keeper.start();
  // An engine asks before the store answered. No other tab holds the lease,
  // so the gate must not answer that one does.
  const asked = keeper.gate.hold();
  await settle();
  answer();
  assert.equal(await asked, true);
  await keeper.stop();
});
