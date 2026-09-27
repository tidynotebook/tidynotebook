# 0117. A person manages their own sessions

- Status: Superseded by [0122](0122-a-session-is-revoked-by-its-identifier.md)
- Date: 2026-09-26

## Context

`authRoutes` in `apps/server/src/auth/better-auth.ts` mounts sign-in, sign-out,
the session read and password reset. A person cannot see where they are signed
in, and cannot sign out a lost device. A public service must offer both. See
[design 016](../design/016-a-public-service.md).

## Decision

The account settings list the sessions of the person, with the device and the
last activity. No place is derived from the client address, because that needs
a location database that the product does not have. The person can
sign out one session, or every session but the current one.

The list, the revoke of one session and the revoke of the others are Better
Auth routes. Each one joins `authRoutes` and the contract fragment of
`tools/sdk-codegen/src/auth-contract.ts`. The session token stays out of every
answer, as `withoutSessionToken` already makes true.

A password change revokes every other session.

## Consequences

- A person can act on a lost or shared device from another device.
- The reviewed route list grows by three routes.
- An integration test proves that a revoked session gets no actor and that no
  answer holds a token.
