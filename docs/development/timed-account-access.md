# Timed account access

## Installation contract

Timed access is off unless `NOTESAPP_NEW_ACCOUNT_TRIAL_SECONDS` has a value.
The settings and their accepted values live in
[the server configuration](../../apps/server/src/config.ts). The configuration
example is in [the environment template](../../.env.example).

These are installation settings. Core does not force them onto self-hosted
installations. Apply them together on every process. A trial account starts
active. Its fixed end is `createdAt + 1209600 seconds`. Its removal deadline
is `createdAt + 30 days`, which leaves 16 days after trial expiry. The first
administrator and all existing rows keep their behavior. The migration does
not grant or backfill a trial.

## Account and operator contract

The read-only trial end and state are part of
[the account controls contract](../../packages/api-contract/components/schemas/AccountControls.yaml).
The account read, administrator account list, and operator account reads
return them. The public [setup contract](../../packages/api-contract/paths/api_setup.yaml)
describes trial duration for new accounts only. It does not promise a new
grant to an existing account.

`standing` is effective standing. It becomes locked at the deadline before
the background sweep runs. For an expired trial, `removalAt` shows the stored
creation-time removal deadline even before the sweep copies it. The sweep
raises the controls revision once and sends the existing account-change hint.

Paid and manual control updates use the existing operator controls operation
and its revision. Every successful controls write ends the trial, including
a write that keeps the same control values. Do not write unpaid controls
from a subscription-missing event while `trialState` is active. Event replay
must read current state. When a paid or manual write gets `controls_changed`,
read again, decide the current entitlement, and retry with that revision.
A stale expiry must never write locked controls from an old event snapshot.
Use the core expiry job for the trial lock. Keep the existing paid-loss
90-day policy in the cloud owner. Core does not change it.

## Enforcement and cache edges

- Each session request reads effective standing from the database. Better Auth
  session caching does not cache account authorization.
- Each personal API key resolution and each MCP OAuth token resolution reads
  effective standing. The existing locked-operation list applies. A trial
  expiry does not delete credentials. A paid unlock can use them again.
- MCP consent checks effective standing. Existing OAuth revocation, account
  disable, account removal, and password-change rules keep their behavior.
- Workspace write guards, account write guards, usage accounting, API key
  creation, and profile writes check effective standing in PostgreSQL. A
  request admitted before expiry must still pass these write checks.
- Public link lookup checks the owner standing before page rendering, cache
  lookup, and attachment access. A cached rendered body does not bypass the
  lookup. Previously downloaded bytes cannot be recalled.
- Notice streams remain on the locked-operation list. They send change hints,
  not note content. The sweep sends the normal account-change hint. The web
  client also reads its account at the fixed deadline and when the tab regains
  focus. Server checks do not depend on that browser timer.
- Authorization applies when a request or database statement checks access.
  It does not cancel a response whose authorized read has already started.
  Offline drafts are local recovery data and do not grant server access.

The hourly sweep runs before account removal. It takes account locks in order
and changes only live trial rows that still need expiry. Controls writes use
the same account lock and a revision check. A paid write that wins first ends
the trial. A sweep that wins first raises the revision and forces the paid
writer to read again. Neither path changes the original removal deadline.

## Export and rollout

The supported locked screen has an Export my notes action. It lists owned
workspaces, checks each export, and downloads its archive. All three server
operations are on the locked-operation list. Existing export limits still
apply. Trial text must not promise access to the editor or a new free grant
after expiry.

This change requires the new schema and generated client contract. Old
server processes cannot use the changed internal registration SQL signature.
Use the existing single-version upgrade process. Do not mix old and new
server processes against the migrated database. The operator HTTP controls
write contract remains the same. Consumers must accept the new read fields.

Before a future rollout, stop the cloud job from replacing active trial
controls merely because no subscription exists. Ship the compatible cloud
reader, then use the new core version and set the three values together.
Verify first-run administrator exclusion, both account creation paths, trial
expiry without login, a paid update before and after expiry, export, and the
original day-30 deadline. Changing or removing the setting affects later
accounts only. Existing stamped trials retain their fixed deadlines.

No merge, release, deployment, production settings change, or production
account mutation is part of this work.
