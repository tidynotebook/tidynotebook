# 0239. Registration can continue on the signup browser once

- Status: Accepted
- Date: 2026-10-25

## Context

Open registration verifies an address before it starts a session (0114).
Verification links are idempotent until expiry. Treating each link use as a
login would make old mail a reusable login credential and could replace an
existing browser session. Requiring the password again adds a step on the
browser that just chose it.

## Decision

Each accepted signup sets a random HttpOnly, SameSite=Lax cookie for 15
minutes. HTTPS also requires Secure. The identity verification store keeps
only its digest and the exact pending identity. A known address gets the same
cookie and storage work, with no identity that can continue.

After email verification, a matching browser proof is consumed atomically.
Only its first use can create a session through Better Auth's normal account
hook and cookie code. An existing session is never replaced. The browser
then opens the fixed local root. No password is stored for continuation.

Legacy links keep their format, expiry and idempotent verification behavior.
Another device, an expired or absent proof, a consumed proof, and an interrupted
response all use password sign-in with the verified email already filled in.
A link for another identity cannot consume the browser's proof. Replacing a
pending signup gives it a new identity, so old proof cannot continue it.

## Consequences

The verification response adds an optional `signedIn` result. Existing clients
can still verify and use password sign-in. No stored limits, account data or
schema change. A proof is not a general passwordless login method. Server-only
library calls have no public URL. Origin checks still guard both public writes.
