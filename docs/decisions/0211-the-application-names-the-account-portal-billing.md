# 0211. The application names the account portal Billing

- Status: Accepted
- Date: 2026-10-09

## Context

Record 0190 gives the application a way to the portal of the operator, and
record 0197 puts the plan, the seats, the payment method and the invoices of
the cloud on that portal. Settings showed the way as "Open the account
portal", at the end of the Account section. A person of the cloud looked for
the plan and the payments and did not find them, because "account portal"
names no reason to open it. Record 0186 keeps every billing screen and every
billing setting out of the core.

## Decision

- Settings gives the portal a section of its own, titled Billing, after
  Account. Its one action is Open billing. The section shows only when the
  installation names a portal (`NOTESAPP_ACCOUNT_PORTAL_URL`).
  `visibleSettingsSections` in `apps/web/src/lib/page-sections.ts` decides
  it, so the side list and the page cannot disagree.
- Every word that a person reads names the portal billing: the locked screen
  of record 0201, the route `/portal`, the hint of the administrator, and the
  mail before a removal. The name is fixed, and no setting changes it.
- The core still holds no plan, no price and no payment provider. The
  section only opens the portal through `openAccountPortal`. Record 0186
  stays, refined only in the name of the way to the portal.
- The names of the setting, the operation and the fields stay. The operator
  API of `docs/development/operator-api.md` does not change.

## Consequences

- A self-hosted operator who sets `NOTESAPP_ACCOUNT_PORTAL_URL` shows a
  Billing section. An operator who uses the portal for something else reads
  the same name.
- The pages of the cloud that tell a person to open the account portal must
  name Billing instead.
- Unit tests of `page-sections.ts`, `locked.ts` and `auth/messages.ts` hold
  the section and the words.
