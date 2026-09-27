# 015: Several accounts on one installation

Status: complete

This design states how one installation serves several people at the same
time. Each person has an account, notes, devices and a sync stream of their
own, and no person can see the notes of another. Sharing a workspace between
accounts is a later design. This design makes the choices that the later one
depends on, so that it adds rules and does not change a shape.

This design is the base of two installations. A self-hosted installation
invites the people it serves. A public installation lets a stranger sign up.
[Design 016](016-a-public-service.md) adds what the public installation needs
on top of this base.

## The problem

One installation serves one account today. A household or a small team that
wants a second person must run a second installation: a second database, a
second origin, a second backup and a second upgrade. The cost of the product
grows with each person, and the operator does the same work many times.

A self-hosted product that stores personal data usually serves many accounts
from one installation. Nextcloud, Immich, Vaultwarden, Gitea and Outline all do
this. They follow the same pattern. Public registration is off by default. An
administrator invites a person, the invitation is a single use secret with an
expiry, and the administrator manages accounts without access to their
content. This design follows that pattern and checks each part against the
code.

## What the code already does

The data path already serves several accounts. Each fact below was read in the
source.

**The database isolates each account.** Every table that holds workspace
content has forced row level security, and each policy asks
`notesapp_is_member` in `packages/storage-server/migrations/0000_initial.sql`.
The identity of a transaction is a transaction local setting, so it cannot
reach the next user of a pooled connection.
`tests/integration/row-access.test.ts` already proves that a second account,
the stranger of that test, reads no row and moves no cursor of the first.

**Two accounts do not wait for each other.** A write takes an advisory lock on
its workspace in `packages/storage-server/src/workspace-store/transaction.ts`,
and the commit cursor belongs to the workspace. Two accounts never share a
workspace in this design, so their writes never share a lock. Work in parallel
is parallel already.

**The browser store is partitioned by account.** Every table of
`packages/storage-browser/src/database.ts` has a compound key that starts with
the server origin, the account and the workspace. Sign-out settles or discards
the queued work of one account and then clears the private data of that
account, in `apps/web/src/pwa/lifecycle.ts`.

**A session reads its grants on each request.** `createIdentityAdapter` in
`apps/server/src/auth/actor.ts` reads the memberships of the account on every
request. A change of access is effective on the next request, with no session
renewal.

**The identity secrets are behind their own role.** Better Auth connects as
the identity role. The runtime role cannot read a password hash or a session
token. See [Database](../development/database.md).

## What stops a second account

Five places hold the one-account rule. Each must change.

1. `linkFirstAccount` in `packages/storage-server/src/identity-store.ts` takes
   a named advisory lock, asks `notesapp_has_account`, and refuses when an
   account exists. This is the only guard. The database function that it calls,
   `notesapp_link_account`, has no limit, and the runtime role holds the right
   to execute it. The rule therefore lives in TypeScript only.
2. `createOwner` in `apps/server/src/auth/setup.ts` and its contract in
   `packages/api-contract/paths/api_setup.yaml` state the single user.
3. `bootstrapOwner` in `apps/server/src/cli/bootstrap.ts` refuses when an
   account exists.
4. `accountForSession` in `apps/server/src/auth/actor.ts` links an unlinked
   identity through `linkFirstAccount`. That is safe only because a second
   account cannot exist.
5. `apps/server/src/auth/better-auth.ts` disables sign-up and does not mount
   the sign-up route.

Text states the rule in more places: the account section of
`apps/web/src/features/accounts/accounts.tsx`,
[Single-user identity](../development/identity.md),
[Database](../development/database.md) and
[Security model](../guide/security-model.md).

## What a second account makes reachable

Design 010 found that a second workspace made two unreachable gaps reachable.
A second account does the same, in five places.

**The sync engine does not check whose session it holds.** `verifyOnce` in
`packages/sync/src/engine.ts` asks for the account of the session and accepts
any answer. It never compares that account with the account of the engine. A
browser profile holds one session cookie. When person B signs in in a second
tab, the tab of person A keeps running and sends the queue of A with the cookie
of B. The server refuses, because B is not a member of that workspace. The
engine reads the refusal as lost access, and the work of A goes to recovery. No
work is lost, but the message is wrong and the work waits in the wrong place.

**The quota does not bound an account.** Each workspace has its own quota
record, with a default from `packages/storage-server/src/provision.ts`. An
account can create workspaces with no limit, so one account can fill the disk
of every other account.

**The attempt limits count a client address.** The Better Auth rate limit and
`apps/server/src/plugins/attempt-store.ts` count the attempts of one address.
Several people behind one home router share one address, so a person who
types a wrong password many times can delay the sign-in of the others. This is
a known trade-off of address limits, and it is acceptable.

**No account can administer another.** Every rule in
`packages/core/src/identity/actor.ts` is a rule of one workspace. Nothing can
list, disable or remove an account.

**A shared device keeps the data of an absent account.** When a session
expires with no sign-out, the private data of that account stays in the browser
store. The partition keeps it out of view of the next account, but the data is
still on the disk of the device.

## The first question: how an account comes in

**Option A. Open registration.** Any person who reaches the origin makes an
account. The cost is that the disk and the attempt budget of the installation
belong to strangers. It needs address verification and bot protection, and
every self-hosted product in the list above ships it off.

**Option B. The operator command only.** An operator runs a command, and the
command prints a link or sets a password. It fits the bootstrap command that
exists now. The cost is that the owner opens a shell for each person, and
nobody in the product can see who has an account.

**Option C. An invitation from an administrator.** An administrator names an
address in the application. The server makes a random token, keeps only its
digest, sets an expiry, and binds the token to that address. The link reaches
the person by mail when a transport is configured. Otherwise the application
shows the link once, for the administrator to copy. The person opens the link,
chooses a password, and the account exists. A used, revoked or expired token
opens nothing. This is the same shape as a published link in
[record 0030](../decisions/0030-published-links-are-hashed-tokens-over-a-scope.md)
and as the reset token that Better Auth already uses.

Option C is the recommendation, with option B as the operator path to the
same invitation. The operator command writes an invitation and prints its link,
so both paths meet one rule. No installation starts with open registration.
Design 016 makes it a policy that an administrator turns on, and
it states what that policy needs.

**The invariant must hold by construction.** Today the one-account rule lives
in one TypeScript function. The new rule must not live in one place that a
caller can skip. The account link moves into one registration function. For an
invitation it locks the invitation row, refuses a used, revoked or expired
one, creates the account and marks the invitation used in one transaction.
The first account of an installation takes the same function under the
first-run lock that exists now, because the plain link function goes away and
setup still needs a way in. The database then refuses an account that has no
invitation, whatever the layers above it do. This is the pattern of
[record 0051](../decisions/0051-an-account-always-keeps-one-workspace.md): the
use case refuses first, and the database refuses the same call.

**The two stores still need a compensation.** Better Auth writes its user
through the identity pool, and the application writes the account through the
runtime pool. These are two transactions. The setup path already deletes the
identity user when the link fails. The invitation path keeps that order:
validate the token, create the identity user, consume the token and link the
account, and delete the identity user when the link fails. Two people who open
one link at the same time therefore make one account, and the second attempt
leaves nothing behind. `accountForSession` then stops linking an unlinked
identity, because after this change an unlinked identity is always a failed
attempt.

**The address is part of the invitation.** The person cannot change it while
they accept. A link that was mailed proves that the person reads that address,
so the account starts verified. A link that the administrator copied proves
only what the administrator states, and the account records that difference.

## The second question: who administers

**Option A. Nobody in the application.** Every account action is an operator
command. The cost is option B above, for every action and not only the
invitation.

**Option B. An installation role on the application account.** Each account is
an administrator or a member of the installation. The first account is an
administrator. An administrator lists the accounts with their name, address,
state, last activity and usage. An administrator invites, revokes an
invitation, disables and enables an account, removes an account, and changes
the installation role of an account.

**Option C. The admin plugin of Better Auth.** The plugin stores a role and a
ban on the identity user and mounts a set of routes, which includes
impersonation. The cost is a second source of authorization outside
`packages/core`, a role in a table that the runtime role cannot read, and an
impersonation route that contradicts the security model.

Option B is the recommendation. The installation role lives in the application
schema, and `packages/core` decides it with a second matrix beside the
workspace matrix. The two matrices never mix. **An installation role grants no
workspace access.** An administrator is not a member of the workspaces of
another account, so every policy hides their rows from the administrator. The
application gives an administrator names, addresses and usage, and never a
note. The operator of the database can still read everything, and the security
model says so.

The installation role is read in the same transaction as the action, like the
workspace role today, because a role can change between the request and the
commit.

**An installation always keeps one enabled administrator.** An administrator
who demotes, disables or removes the last enabled administrator locks every
person out of administration. The use case refuses that call, and a database
function or trigger refuses it again, in the shape of record 0051.

## The third question: disable and remove

**Disable** is reversible. The server revokes every session of the account
through Better Auth. Better Auth cannot read the state of an application
account, so a session create hook asks one narrow database function and
refuses a new session. The actor resolver refuses the account as well. The notes stay. A device of that account learns it on its next
session check and keeps its queued work in recovery, which the client already
does for lost access.

**Remove** is the erasure of an account. `notesapp_delete_workspace` cannot
do it, because it refuses a caller who is not the owner and it refuses the last
workspace. One removal function deletes the same rows for each workspace of the
account, so the attachments go to the reclaim queue and the published links go
with their workspace. The
identity user, the sessions, the preferences and the audit trail go too.

One choice here decides the sharing design. A revision names its author through a
foreign key to the account. In this design every workspace of a removed account
is removed with it, so no revision remains. In a shared workspace, a revision
of a removed author stays. **The recommendation is that removal keeps an empty
account row as a tombstone**, with no identity, no address, no name and no
settings. The shape of a revision then never changes, and the sharing design
shows a removed author as a removed person.

Record 0051 says that deleting an account is not an operation of the product.
This design makes it one. The rule of 0051 still holds for every account that
exists, because a removed account has no workspace to keep.

A person can also remove their own account. This is the usual right of a
person over their own data. It asks for the password again, and the last
administrator cannot do it.

## The fourth question: a fair share of the disk

**Option A. Keep the quota of each workspace and cap the number of workspaces
of an account.** The rule is small. The cost is that a cap on count is not a
cap on bytes, and the person who needs one large workspace and the person who
needs ten small ones meet the same wall.

**Option B. A quota of the account.** Each account has a byte limit, with a
default from the configuration and a value that an administrator can change.
A write checks the sum of the usage of every workspace that the account owns.
The owner pays, which is also the rule that a shared workspace needs later.

**Option C. No change.** The operator trusts every person. The cost is that
one mistake, such as a large import, fills the disk for every account.

Option B is the recommendation. It adds a lock order. A write already takes the
lock of its workspace, and the account check must read the usage of the other
workspaces of the owner. The rule of the last administrator adds an
installation lock, and a removal takes the locks of many workspaces. Two paths
that take the same locks in different orders wait for each other forever, so
one order holds for every path: the installation lock, then the workspace
locks by identifier, then the account locks by identifier.

## The fifth question: two people on one browser

One browser profile holds one session cookie, so one profile is signed in to
one account at a time. Several accounts signed in at once in one profile stay
out.

**The engine stops when the session names another account.** The session check
compares the account of the session with the account of the engine. A
different account pauses the engine and states that another account signed in
on this browser. The queue stays where it is and does not go to recovery. The
unit test of the engine proves it, and it must fail before the fix.

**The data of an absent account.** Two options exist. The browser store can
keep the partition of every account until that account signs out, which is
what it does now. Or, when a different account signs in, the client can delete
every other partition that holds no queued work, and keep a partition with
queued work out of view. The second option keeps less private data at rest on a
shared device. The cost is a full download when the first person signs in
again. The recommendation is the second option, because a shared device is the
case where the absent data matters.

## What the sign-in surfaces say

An answer must not tell a stranger whether an address has an account. The
sign-in, the reset request and the invitation answer the same for a known and
an unknown address, as the OWASP authentication guidance asks. The sign-in and
the reset already do this. An invalid invitation says that the invitation is
not valid and that the person can ask for a new one. It does not say whether
the token expired, was used or never existed.

The password policy needs a review. NIST SP 800-63B revision 4 asks for a
longer minimum for a password that is the only factor, and for a check against
known breached passwords. The current minimum is shorter, and five files state
it, three in code and two in the contract. Five copies of one rule drift, so
the review also gives the rule one source. A public installation makes the
review urgent, so design 016 holds it.

## What stays out

- **Sharing a workspace, and the editor and viewer roles.** That is the
  sharing design. The role matrix of a workspace keeps its one role here.
- **Open registration, bot protection, published content from strangers, and
  more than one server process.** Design 016 states them.
- **Sign-in through an external provider.** The identity schema keeps an
  issuer column, and a provider is a separate design.
- **Impersonation, and any administrator read of a note.**
- **Several signed-in accounts in one browser profile.**

## How this prepares sharing

Four choices above keep the sharing design small.

- The invitation carries a target. This design uses one target, the
  installation. The sharing design adds a second target, a workspace and a
  role, with the same token rules.
- The installation role and the workspace role are separate matrices, so a
  workspace role never makes an administrator and an administrator never reads
  a workspace.
- The tombstone keeps the author of a revision after its account goes.
- The owner pays for the bytes of a workspace, whoever wrote them.

## What the gate must prove

- An integration test against PostgreSQL proves that the database refuses an
  account with no invitation, and a used, expired or revoked invitation, when
  the use case is bypassed.
- An integration test proves that two acceptances of one invitation at the
  same time make one account and leave no identity user behind.
- An integration test proves that an administrator reads no row of a workspace
  of another account.
- An integration test proves that the database refuses the removal, the
  demotion and the disable of the last enabled administrator.
- An integration test proves that the first-run path still makes the first
  administrator after the plain link function is gone.
- An integration test proves that a disabled account gets no actor, gets no
  new session, and that its sessions are gone.
- An integration test proves the account quota across two workspaces of one
  owner, and that a write and a removal at the same time both finish.
- A unit test in `packages/core` proves the installation matrix and each
  refusal with its exact error code.
- A unit test in `packages/sync` proves that an engine pauses and keeps its
  queue when the session names another account.

## Answers of the owner

The owner answered on 2026-09-26. The same installation must also serve as one
public service where a stranger signs up, so the answers take the stricter
choice where the two installations differ.

1. A person can remove their own account. A public service must offer it.
2. The client deletes the idle partitions of an absent account when another
   account signs in on the same browser.
3. The account quota replaces the workspace quota as the limit. A workspace
   still counts its own usage. The configuration holds the default.
4. The configuration holds the lifetime of an invitation. No record copies it.
5. The password review is part of this work. Design 016 holds it.

## Decisions

- [0108. An account comes in through one registration path](../decisions/0108-an-account-comes-in-through-one-registration-path.md)
- [0109. The installation role grants no workspace access](../decisions/0109-the-installation-role-grants-no-workspace-access.md)
- [0110. An installation keeps one enabled administrator](../decisions/0110-an-installation-keeps-one-enabled-administrator.md)
- [0111. A removed account leaves a tombstone](../decisions/0111-a-removed-account-leaves-a-tombstone.md)
- [0112. The owner account holds the storage quota](../decisions/0112-the-owner-account-holds-the-storage-quota.md)
- [0113. A browser serves the account of its session](../decisions/0113-a-browser-serves-the-account-of-its-session.md)

[Plan 015](../plans/015-several-accounts-and-a-public-service.md) orders the
work.
