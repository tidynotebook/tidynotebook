# Accounts and identity

This page owns how an account comes in, how a person signs in, and what an
administrator can do. One installation serves several people, and no person
reads the notes of another.

`apps/server/src/auth/` owns this area. Read `registration.ts` for the one
registration path, `setup.ts` for the public operations that make an account,
and `better-auth.ts` for the mounted routes and the configuration. The rules
live in `packages/core/src/identity/`. See
[design 015](../design/015-several-accounts-on-one-installation.md).

## How an account comes in

Every account comes in through `registerIdentity` in `registration.ts`, and
through one database function, `notesapp_register_account`
([record 0108](../decisions/0108-an-account-comes-in-through-one-registration-path.md)).
The function takes one ground:

- **First run.** While no account exists, setup and `pnpm owner:bootstrap`
  make the first account, an administrator, under the installation lock.
- **Invitation.** An administrator or `pnpm account:invite` makes an
  invitation for one address. The link goes by mail when a transport exists,
  and it is shown once otherwise. The token travels in the fragment of the
  link, and only its digest is at rest. A used, revoked or expired invitation
  opens nothing, and every refusal reads the same.
- **Open.** The function refuses it unless the policy is open. The use case
  refuses the open policy until the parts of
  [record 0114](../decisions/0114-open-registration-verifies-the-address-before-the-first-session.md)
  exist, mail and the legal documents.
  [Record 0191](../decisions/0191-a-published-page-of-the-cloud-lives-on-the-application-origin.md)
  states that a published origin is not one of them.

The identity user and the account live in two stores. The path makes the
identity user, calls the function, and deletes the identity user when the
function refuses, so two acceptances of one invitation make one account and
leave nothing else. The library starts no session at sign-up. The path signs
the person in after the account exists.

## Sign-in and sessions

Better Auth owns password hashing, sessions, reset tokens, and cookie security.
tidy notebook mounts only the routes it needs; `better-auth.ts` states the exact
list, and the sign-up route is not one of them.

A session create hook asks `notesapp_session_account` before every new
session, and the actor resolver asks the same function on every request. Only
an enabled account that is not removed answers, so a disabled account gets no
session and no actor, and an identity user that no account links resolves to
nothing ([record 0111](../decisions/0111-a-removed-account-leaves-a-tombstone.md)).

A session cookie is `HttpOnly` and `SameSite`, and an HTTPS deployment also
marks it secure. A cookie write must name a served origin. See
[HTTP API access](api.md) and
[decision 0039](../decisions/0039-one-list-of-served-origins.md).

## Administration

Each account has an installation role, administrator or member. The matrix of
`installation.ts` stands beside the workspace matrix, and the two never read
each other ([record 0109](../decisions/0109-the-installation-role-grants-no-workspace-access.md)).
An administrator lists the accounts with their address, state, last activity
and usage, invites, disables, enables, removes, changes a role, and changes a
limit. An administrator is not a member of a workspace of another account, so
every row policy hides its notes.

Every administrator action runs in one installation transaction that takes the
installation lock first, and a database function checks the role again. The
installation keeps one enabled administrator: the use case and the database
both refuse a change that would leave none
([record 0110](../decisions/0110-an-installation-keeps-one-enabled-administrator.md)).
`pnpm account:promote` makes an account an administrator from a shell.

Disabling an account ends every session of it in the same transaction.
Removing an account erases every workspace it owns and its identity, and keeps
its row as a tombstone. A person removes their own account after they give the
password again.

## Storage

The byte limit belongs to the account and counts every workspace that it owns
([record 0112](../decisions/0112-the-owner-account-holds-the-storage-quota.md)).
The configuration names the limit of a new account and the lifetime of an
invitation. See [Database](database.md) for the lock order.

## Controls and the operator API

An account carries limits, a standing and feature switches, with a revision
that guards each write
([record 0189](../decisions/0189-an-account-carries-limits-a-standing-and-feature-switches.md)).
A locked account keeps a fixed list of operations
([record 0201](../decisions/0201-a-locked-account-keeps-a-fixed-list-of-operations.md)).
A service of the operator reaches the controls through `/api/operator/` with
one bearer token, and a person hands the portal of that service a single-use
token ([record 0190](../decisions/0190-an-operator-api-reaches-the-account-controls.md)).
`packages/core/src/identity/controls.ts` and `operator.ts` hold the rules, and
`apps/server/src/routes/operator.ts` the handlers.

## Password recovery

With a mail transport configured, sign in offers Forgot password
([record 0141](../decisions/0141-a-person-resets-a-password-in-the-application.md)).
The reset message links the reset page of the application with the token in
the fragment, and `resetPasswordLink` in `apps/server/src/auth/better-auth.ts`
writes it. A reset ends every session of the account and sends a notice to the
address. Without a transport, the operator runs `pnpm account:recover`. The
command reads a password from a protected file or a hidden prompt and revokes
the old sessions.

## Messages

`apps/server/src/auth/messages.ts` writes the words of every message, and
`apps/server/src/auth/mail.ts` sends it with the automatic headers of RFC 3834.
Every message that a person with no session can cause goes through the one
budgeted transport of `mail.ts`, which the composition of
`apps/server/src/app.ts` gives to Better Auth and to open registration.

## What holds the boundary

- The runtime database role cannot read a password hash or a session token, and
  the identity role cannot read note content. See [Database](database.md).
- No function makes an account outside the one registration function.
- The installation role grants no workspace access.
- The public sign-up route is not mounted, and neither is the reset route
  that answers a link with a redirect.
- No message leaves the server outside `messages.ts`, and no message that a
  stranger causes skips the budget of its address.
- No answer exposes the session token to page script.
- The two operator commands set a transaction setting that the operator
  functions read. It guards against a mistake of the application, not against a
  holder of the runtime credential.
- No log holds a password, a cookie, a token, note text, or search text.
