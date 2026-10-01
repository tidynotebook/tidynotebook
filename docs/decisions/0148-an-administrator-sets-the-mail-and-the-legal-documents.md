# 0148. An administrator sets the mail and the legal documents

- Status: Accepted
- Date: 2026-10-01

## Context

Records 0120, 0140 and 0141 read the mail transport and the legal documents
from the environment once, at startup. An administrator cannot set either in
the application, and the filled documents live in the files of one deployment.
See [design 019](../design/019-installation-settings-in-the-application.md)
and the [audit of 2026-10-01](../audits/2026-10-01/self-hosting-settings.md).

## Decision

- The one row of `installation_settings` also holds the mail transport and
  each legal document. An administrator changes them through operations of
  `packages/api-contract/` and the accounts page. A SQL function takes the
  installation lock and checks the role, as for the registration policy.
- A group that the environment sets wins and is locked: the mail when
  `NOTESAPP_SMTP_URL` is set, the documents when any legal variable is set. A
  write to a locked group answers `setting_locked`. One decider in
  `apps/server/src/installation-settings.ts` reads both sources, and no other
  module reads either one.
- The mail settings are a host, a port, a security mode (TLS, STARTTLS or
  none), a user name, a password and a sender. The password is sealed with
  AES-256-GCM under a key that HKDF derives from the server secret, through
  `apps/server/src/auth/seal.ts`, and no answer holds it. An administrator
  sends a test message to their own address, and a failure names its kind.
- Each document is Markdown that this server serves at its `/legal/` page, or
  an external address, and it has a version. The documents apply when both
  exist. A text that holds a blank of the template is refused. A change of the
  version asks every account to accept again (record 0120).
- The templates live in `packages/core/src/identity/legal-templates.ts`. The
  server fills the facts that it knows, and each other blank is a field of the
  page. `docker/legal/` is removed.
- Removing a part that open registration needs, while registration is open,
  is refused (record 0114). The check reads the row in the transaction of the
  change.

## Consequences

- An operator sets up mail and the documents with no shell and no restart. A
  deployment that sets the variables keeps working.
- `packages/core` proves the rules, `seal.test.ts` the seal, and
  `tests/integration/installation-settings.test.ts` the served settings, the
  lock, the test message and the legal page.
- This refines records 0120, 0140 and 0141.
