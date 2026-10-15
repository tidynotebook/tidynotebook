# The operator API

This page owns the interface that a service of the operator depends on, and
the rule that keeps a change of that interface safe for the service.

## Why it is an interface

A service of the operator is a separate program. It reaches the core only
over HTTP and through the public image, and it shares no module and no
database role with the core
([record 0186](../decisions/0186-the-open-core-holds-no-billing-and-a-private-service-sells-the-cloud.md),
[record 0190](../decisions/0190-an-operator-api-reaches-the-account-controls.md)).
A service pins one release of the core. So what this interface accepts and
answers in one release is what a service is built against, as it is for the
interface of a library.

## What forms the interface

- **The operator operations.** Every path under `/api/operator/`, with the
  security scheme `operatorToken` and no session: find, read and remove an
  account, set its controls, redeem a handoff, list the account events, and
  read the totals of a month. Each path item is a file in
  `packages/api-contract/paths/` whose name starts with `api_operator_`. Each
  component that those files reach is part of the interface too, also a
  shared one such as a problem answer. With no token file, every operator
  operation answers that the operator API is off, and the operations skip the
  Host allowlist.
- **The portal handoff.** `openAccountPortal`, in
  `packages/api-contract/paths/api_account_portal.yaml`, takes the session of
  a person and a path on the portal. It answers that path of the portal
  address with a single-use token, and the portal redeems the token through
  the operator API. A locked account keeps it
  ([record 0201](../decisions/0201-a-locked-account-keeps-a-fixed-list-of-operations.md)).
  Settings and the locked screen open the portal. The route `/portal` of the
  application takes a portal path in its query, signs the person in when
  needed, and opens the portal at that path, so a service can link a person
  back through the handoff. `apps/web/src/lib/portal.ts` decides the path.
- **The account controls and their revision.** The limits, the standing and
  the feature switches of an account, and the revision that guards each write
  ([record 0189](../decisions/0189-an-account-carries-limits-a-standing-and-feature-switches.md)).
  The account answer also states its installation role. This role decides
  which controls can apply. An administrator cannot be locked.
  A write that names an old revision changes nothing.
  `apps/server/src/routes/account-controls.ts` keeps one shape for the
  account, the administrator and the operator, and
  `packages/core/src/identity/controls.ts` and
  `packages/core/src/identity/operator.ts` hold the rules.
- **The account events and their cursor.** One event when an account is made,
  verified or removed, listed after the cursor of the reader, oldest first.
  The positions follow the order of the commits, so a reader that continues
  after its last position misses no event.
  `packages/api-contract/components/schemas/AccountEventKind.yaml` names the
  kinds.
- **The monthly totals.** The transfer, the downloads and the object store
  calls of the whole installation for one month, and the usage of one account
  in its read
  ([record 0193](../decisions/0193-transfer-and-object-operations-have-a-limit.md)).
- **The image commands.** `docker/entrypoint.sh` takes `migrate` and `serve`
  ([record 0202](../decisions/0202-the-image-takes-a-migrate-and-a-serve-command.md)).
  `migrate` exits after the migrations, `serve` reads no migration setting,
  and an unknown command stops with a nonzero status. `migrate` reads
  `NOTESAPP_MIGRATION_DATABASE_URL`, `NOTESAPP_RUNTIME_PASSWORD` and
  `NOTESAPP_AUTH_PASSWORD`, each from its variable or its `_FILE` variable,
  and the file under `/run/secrets` when neither is set.
- **The settings that an operator sets.** `NOTESAPP_OPERATOR_TOKEN`,
  `NOTESAPP_ACCOUNT_PORTAL_URL`, `NOTESAPP_NEW_ACCOUNT_STANDING`,
  `NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER`, `NOTESAPP_REGISTRATION_POLICY`, the
  monthly caps, the settings of the object store with its key pair, and
  `NOTESAPP_TRUSTED_PROXIES`. Each secret, of the server and of `migrate`,
  takes its variable or its `_FILE` variable, never both
  ([record 0207](../decisions/0207-every-secret-of-the-image-has-an-environment-form.md)).
  `apps/server/src/config.ts` reads each one and refuses a bad value at
  startup, and `docs/guide/configuration.md` states each one for the
  operator.

The contract files and image commands define this interface.

## The compatibility rule

An addition is safe. A new operation, a new optional input member, a new
output member, and a new setting whose absence keeps the old behaviour do not
break a service.

Each of these is a breaking change for a service of the operator:

- a removal of an operation, a member, a setting or a command;
- a rename of any of them, also of an operation id or a problem code;
- a narrower input: a new required member, a tighter pattern or limit, a
  removed input value, or a new refusal of a setting that started before;
- a wider output enum: a new standing, a new event kind, a new problem code
  of an operation, or any other new value that a service must read;
- a change of meaning with the same shape: what the revision guards, the
  order or the kinds of the events, the lifetime of a handoff token, what a
  command does, or what a setting turns on.

A breaking change is named in the CHANGELOG entry of the release that ships
it. The PR names the effect on a service and what the service must change.

## The known consumer

The service that sells the cloud lives in the private repository
`tidynotebook/cloud`, as record 0186 states. It pins one release of the core
and vendors the bundled contract of the operator operations and of
`openAccountPortal`. Its gate fails when that copy differs from the bundle of
the pinned release. It runs the public image with `migrate` and `serve`, and
it sets the settings above. A change here reaches the service only when the
service moves its pin, so a breaking change must be clear to the person who
moves it.

[Record 0220](../decisions/0220-future-releases-use-a-new-public-image.md)
changes the package of future release images. The cloud pin format accepts
the new package. Its release and image source checks need a private follow-up
before it can use that package. Existing private pins stay intact. The HTTP
contract and image commands stay the same. The [published images guide](../guide/published-images.md)
shows how a self-hosted installation selects the image from the official manifest.

## Changes to the interface

State the effect on the known cloud consumer in the PR.
The consumer context can help when the change reaches its interface.
`tests/integration/operator.test.ts`,
`tests/integration/account-controls.test.ts`, and
`tests/integration/monthly-limits.test.ts` check the interface.
Local Docker testing checks the deployed image.
