# Plan 015: Several accounts and a public service

Status: complete

The [project board](https://github.com/users/bkhanale/projects/2) holds the live
work. Each row below is one issue, with a milestone, a priority label and an
area label. Both phases ship in milestone 0.8.0, as the owner decided on
2026-09-27.
[Design 015](../design/015-several-accounts-on-one-installation.md) and
[design 016](../design/016-a-public-service.md) state the problem and the
choices.

## Decisions

- [0108. An account comes in through one registration path](../decisions/0108-an-account-comes-in-through-one-registration-path.md)
- [0109. The installation role grants no workspace access](../decisions/0109-the-installation-role-grants-no-workspace-access.md)
- [0110. An installation keeps one enabled administrator](../decisions/0110-an-installation-keeps-one-enabled-administrator.md)
- [0111. A removed account leaves a tombstone](../decisions/0111-a-removed-account-leaves-a-tombstone.md)
- [0112. The owner account holds the storage quota](../decisions/0112-the-owner-account-holds-the-storage-quota.md)
- [0113. A browser serves the account of its session](../decisions/0113-a-browser-serves-the-account-of-its-session.md)
- [0114. Open registration verifies the address before the first session](../decisions/0114-open-registration-verifies-the-address-before-the-first-session.md)
- [0115. A sign-up pays a proof of work that this server issues](../decisions/0115-a-sign-up-pays-a-proof-of-work-that-this-server-issues.md)
- [0116. One password policy follows NIST SP 800-63B revision 4](../decisions/0116-one-password-policy-follows-nist-800-63b-revision-4.md)
- [0117. A person manages their own sessions](../decisions/0117-a-person-manages-their-own-sessions.md), superseded by
  [0122. A session is revoked by its identifier](../decisions/0122-a-session-is-revoked-by-its-identifier.md)
- [0118. A published page of a public installation has its own origin](../decisions/0118-a-published-page-of-a-public-installation-has-its-own-origin.md)
- [0119. A report reaches an administrator who can take a link down](../decisions/0119-a-report-reaches-an-administrator-who-can-take-a-link-down.md)
- [0120. An account records the legal documents it accepted](../decisions/0120-an-account-records-the-legal-documents-it-accepted.md)
- [0121. Every limit and every job holds across server processes](../decisions/0121-every-limit-and-every-job-holds-across-server-processes.md)
- [0123. A report seals the address of its link](../decisions/0123-a-report-seals-the-address-of-its-link.md)

## Landing boundaries

1. Phase 1 is items 1 to 7. It ships several accounts by invitation. It
   landed first, and it keeps the policy `invitation`.
2. Phase 2 is items 8 to 14, in the same release. The `open` policy stays
   refused until items 8 to 13 land, because record 0114 checks their parts.
3. Items 1 to 4 share one branch and one landing, with one commit for each
   item. The contract, the rules, the storage and the handlers change
   together. `checkRegistration` in `apps/server/src/plugins/register.ts`
   stops startup when a contract operation has no handler, and item 3 drops
   `notesapp_link_account`, which the setup, the bootstrap command and the
   actor resolver of item 4 call.
4. Each item follows the order of `docs/development/feature-workflow.md`, and
   updates the directory guide of each directory it changes in the same commit.
5. Current development and guide pages change with the item that changes the
   product: `docs/development/identity.md`, `docs/development/database.md` and
   `docs/guide/security-model.md` stop saying that the product has one user in
   item 3.
6. Run `pnpm verify` before each landing. Rebase onto `main`, fast-forward
   merge, and delete the branch. Take a screenshot in light and in dark of each
   changed screen.

## Work

| Item                                                       | Depends on | Scope and owning paths                                                                                                                                                                                                                                                                                                 | Records          |
| ---------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1: [173](https://github.com/bkhanale/notesapp/issues/173)  | None       | Contract in `packages/api-contract/`: the one registration operation, invitations, the account list and actions of an administrator, the registration policy, self removal. Run `pnpm generate`.                                                                                                                       | 0108 to 0112     |
| 2: [174](https://github.com/bkhanale/notesapp/issues/174)  | 1          | Rules in `packages/core/src/identity/` and `packages/core/src/workspaces/`: the installation matrix, the last administrator, registration, disable, removal, the account limit. Ports for each store call.                                                                                                             | 0108 to 0112     |
| 3: [175](https://github.com/bkhanale/notesapp/issues/175)  | 2          | One migration in `packages/storage-server/`: installation settings, invitations, the role, state and removal time of an account, the account limit. The registration, last administrator, removal and usage functions. Replace `notesapp_link_account` with the registration function, including the first-run ground. | 0108 to 0112     |
| 4: [176](https://github.com/bkhanale/notesapp/issues/176)  | 3          | Handlers in `apps/server/src/routes/`, the sign-up operation, invitation mail, the actor resolver for a disabled or removed account, `pnpm account:invite` and `pnpm account:promote` in `apps/server/src/cli/`.                                                                                                       | 0108 to 0111     |
| 5: [177](https://github.com/bkhanale/notesapp/issues/177)  | None       | `packages/sync/src/engine.ts` pauses on another account. `packages/sync/src/local-port.ts` first, then `packages/storage-browser/`, for the partition deletion at sign-in.                                                                                                                                             | 0113             |
| 6: [178](https://github.com/bkhanale/notesapp/issues/178)  | 4          | Screens in `apps/web/src/features/`: accept an invitation, the accounts page of an administrator, the usage and removal rows of the account settings.                                                                                                                                                                  | 0108 to 0112     |
| 7: [179](https://github.com/bkhanale/notesapp/issues/179)  | 6          | Guide pages for an administrator and for an invited person in `docs/guide/`. The self-hosting page names the new operator commands.                                                                                                                                                                                    | 0108, 0110       |
| 8: [180](https://github.com/bkhanale/notesapp/issues/180)  | 2          | One password rule in `packages/core`, one contract component, the contract test, and the breach check plugin in `apps/server/src/auth/better-auth.ts`. Remove the other copies.                                                                                                                                        | 0116             |
| 9: [181](https://github.com/bkhanale/notesapp/issues/181)  | 4          | Session list and revoke operations of the account in `packages/api-contract/`, one narrow function for each in the migrations, and their rows in the account settings.                                                                                                                                                 | 0122             |
| 10: [182](https://github.com/bkhanale/notesapp/issues/182) | 4, 8       | Open registration: pending accounts, verification mail, equal answers, the expiry job, the preconditions of `open`, and the sign-up screen.                                                                                                                                                                            | 0114             |
| 11: [183](https://github.com/bkhanale/notesapp/issues/183) | 10         | The proof of work: the pure check in `packages/core`, the challenge and used digests on the server, the solver in `apps/web/src/lib/`.                                                                                                                                                                                 | 0115             |
| 12: [184](https://github.com/bkhanale/notesapp/issues/184) | 4          | The published origin: roles in `apps/server/src/served-origins.ts`, the reader path on that origin only, the redirect, and the report page and takedown function.                                                                                                                                                      | 0118, 0119, 0123 |
| 13: [185](https://github.com/bkhanale/notesapp/issues/185) | 10         | Legal documents: configuration, the stored consent, the consent step after a raised version.                                                                                                                                                                                                                           | 0120             |
| 14: [186](https://github.com/bkhanale/notesapp/issues/186) | None       | Attempt counters in PostgreSQL through `apps/server/src/plugins/attempt-store.ts`, database rate limit storage of Better Auth, and a lock for each job of `apps/server/src/app.ts`.                                                                                                                                    | 0121             |

Items 5 and 14 have no dependency and can land at any time. Item 5 fixes a
defect that a second account makes reachable, so it lands before phase 1 is
released.

## Required evidence

Designs 015 and 016 list the proof under "What the gate must prove". Each item
carries the part of that list that its records name. A test that proves a
refusal also proves that the database refuses it with the use case bypassed.
