# 0238. New accounts can have fixed timed access

- Status: Accepted
- Date: 2026-10-24

## Context

An operator can opt in to timed access for new member accounts. The setting
has no default duration. Existing accounts and the first administrator get
no trial. Direct registration and invitation acceptance use the same atomic
registration path. The account creation time starts the clock. Verification
of a pending address is not account creation.

## Decision

The trial end is fixed at creation time plus the configured seconds. Sign in,
invitation reuse, event replay and a repeated registration do not change it.
At the end instant, server authorization treats unpaid access as locked. An
hourly job stores the lock even if the person never signs in. The job checks
the current account under its lock. A second run changes nothing.

A successful revision-checked controls write ends trial access. The fixed
trial end stays for inspection. An old controls revision is refused. Promotion
to administrator also ends the trial. A later expiry job cannot lock access
that an operator or administrator has replaced.

## Consequences

A trial has a separate removal deadline. It starts at account creation. Only
expiry copies it to the locked removal control. The existing removal job and
its notices keep their rules. A trial does not add a deletion grace period,
remove data on expiry, make a purchase, or charge a card.
