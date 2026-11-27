import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operatorSeatsOf } from './operator-seats.ts';

void test('seat usage maps profiles and keeps the earliest invite for each reserved address', () => {
  const starts = '2025-01-01T00:00:00.000Z';
  const first = '2025-02-01T00:00:00.000Z';
  const later = '2025-02-02T00:00:00.000Z';
  const usage = operatorSeatsOf({
    memberLimit: null,
    seats: null,
    memberStarts: [
      { account_id: 'member', since: new Date(starts) },
      { account_id: 'no-profile', since: new Date(first) },
    ],
    profiles: new Map([
      [
        'owner',
        {
          account_id: 'owner',
          email: 'owner@example.test',
          normalized_email: 'owner@example.test',
          display_name: 'Owner',
        },
      ],
      [
        'member',
        {
          account_id: 'member',
          email: 'Casey@example.test',
          normalized_email: 'casey@example.test',
          display_name: 'Casey',
        },
      ],
    ]),
    openInvites: [
      { email: 'sam@example.test', expiresAt: later, workspaceId: 'second' },
      { email: 'casey@example.test', expiresAt: first, workspaceId: 'first' },
      { email: 'owner@example.test', expiresAt: first, workspaceId: 'first' },
      { email: 'lee@example.test', expiresAt: later, workspaceId: 'first' },
      { email: 'sam@example.test', expiresAt: first, workspaceId: 'first' },
    ],
  });
  assert.deepEqual(usage, {
    memberLimit: null,
    membersUsed: 2,
    pendingInvites: 2,
    members: [
      {
        accountId: 'member',
        email: 'Casey@example.test',
        name: 'Casey',
        since: starts,
      },
      { accountId: 'no-profile', email: null, name: null, since: first },
    ],
    invites: [
      { email: 'sam@example.test', expiresAt: first, workspaceId: 'first' },
      { email: 'lee@example.test', expiresAt: later, workspaceId: 'first' },
    ],
  });
});
