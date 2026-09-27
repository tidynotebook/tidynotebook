# 0122. A session is revoked by its identifier

- Status: Accepted
- Date: 2026-09-27

## Context

[Record 0117](0117-a-person-manages-their-own-sessions.md) lets a person list
their sessions and sign out one of them or every other one, through three
Better Auth routes. The revoke route of the library, `/revoke-session`, names
a session by its raw token. The list would then have to hand every token to
page script, and the same record keeps the token out of every answer, as
`withoutSessionToken` in `apps/server/src/auth/better-auth.ts` makes true. The
two parts of record 0117 cannot both hold. See
[design 016](../design/016-a-public-service.md).

## Decision

This server serves the three operations itself, as contract operations of
the account: list the sessions, revoke one session by its identifier, and
revoke every session but the current one. Each reads or changes the session
table through one narrow `SECURITY DEFINER` function that binds it to the
account of the transaction, so an account never lists or ends a session of
another account. No answer holds a token.

A row shows the device that the browser names, the last activity, and whether
it is the current session. No place is derived from the client address.

The routes of the library stay unmounted. This record supersedes record 0117
and keeps every other part of it.

## Consequences

- A person can end a session of a lost or shared device from another device.
- The reviewed route list of Better Auth does not grow.
- An integration test proves that a revoked session gets no actor, that an
  account cannot revoke the session of another, and that no answer holds a
  token.
