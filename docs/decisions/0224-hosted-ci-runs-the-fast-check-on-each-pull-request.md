# 0224. Hosted CI runs the fast check on each pull request

- Status: Accepted
- Date: 2026-10-13

## Context

The repository is private on the GitHub Free plan. This plan gives 2,000
runner minutes each month. One CI run used about 25 to 30 minutes: the verify
job took 14 to 20, the performance job about 5, and the image job about 4. A
landed change ran CI twice, once for the pull request and once for the push to
main. At this rate the plan allows about 35 landed changes each month.

## Decision

`.github/workflows/ci.yml` runs on a pull request and on a manual start. It
does not run on a push to main. A `Check` job runs on each pull request. It
runs the contract lint, the generated check, the type check, the lint and the
format check. It builds nothing and starts no database or Docker.

The verify, performance and image jobs stay in the same file. They run only
when a person starts the workflow by hand. The DCO workflow does not change.
Dependabot runs once a month and opens fewer pull requests.

The local `pnpm verify` stays the landing gate (record 0154). After record
0223 opens the source, hosted runners have no minute limit.

## Consequences

Hosted CI no longer proves, for each pull request, the integration tests, the
performance budgets of record 0136 and the image test of record 0202.

The local `pnpm verify` still runs the integration tests. It runs no
performance budget and no image test. These run only when a person starts
them: by hand in hosted CI, or locally with `pnpm perf:bundle`,
`pnpm perf:service` and `pnpm test:image`.

The launch reads a manual run for its final commit. After the repository is
public, a follow-up change puts the full jobs back on each pull request.
