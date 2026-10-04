# apps/server

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of this
directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).
The Fastify HTTP adapter serves the web application, the REST API, and the
authentication routes on one origin, and it holds no domain rule.

## What lives here and what does not

- `src/plugins/` holds one cross-cutting Fastify concern per file and no business
  resource: `register.ts`, `problem.ts`, `security-headers.ts`, `static-assets.ts`,
  `host.ts` with `answersAnyHost`, the one rule of the operations that skip
  the Host allowlist (0199), `content-disposition.ts`, `body-idle-timeout.ts`, `attempt-store.ts`,
  `compression.ts` of a large JSON read (0169), and `published-origin.ts`, which
  keeps the published origin to the reader path and its files (0158) and sends
  a reader address to it (0118).
- `src/routes/` holds one controller file per resource. `handlers.ts` returns one
  handler per operation id and the body lives in its area file. `published.ts` is the
  reader path of a published link and its report (0119), `published-document.ts`
  writes its one document (0031, 0047, 0146), and `publications.ts` holds the owner
  operations. `import-layout.ts` places the files of an import (0172).
  `sync-notices.ts` serves the notice stream and checks its origin (0128,
  0129). `legal.ts` serves the terms and the privacy notice of the operator,
  and `legal-document.ts` writes their page like the published page (0140).
- `src/notices/` holds the notice gateway and its bounds (0129). Only
  `src/plugins/websocket.ts` imports a WebSocket library; the gateway reads its
  `StreamSocket`.
- `main.ts` wires the process to `src/lifecycle.ts`, which owns the order of the start and the stop, and holds no signal and no exit.
- `src/auth/` holds the Better Auth adapter, the actor resolver, the secrets of a
  published link, the seal of a reported address and of the mail password
  (`seal.ts`, 0123, 0148), mail and its budget for each address (`mail.ts`), the words of every message
  (`messages.ts`, 0141), setup, invitations, and `registration.ts`, the one path that makes an account
  (0108). `open-registration.ts` holds the sign-up and the proof of an address
  of open registration, `verification.ts` the token of its link (0114), and
  `proof-of-work.ts` the challenges of a sign-up (0115). `src/jobs/` holds background work, `src/cli/` the operator
  commands. `routes/administration.ts` serves the installation operations (0109).
- `src/installation-settings.ts` decides the mail and the legal documents (0148).
- A domain rule lives in `packages/core`, every SQL statement in
  `packages/storage-server`, and every request shape in `packages/api-contract/`.

## Allowed imports

`@notesapp/api-contract`, `@notesapp/core`, `@notesapp/logging`, `@notesapp/markdown`,
`@notesapp/storage-server`. This package is Node only, so it may use a Node module and
a Node only package such as `fastify`, `pg`, or `sharp`.

## How to add a common thing here

- **A handler for a new operation.** Write the operation in `packages/api-contract/`,
  run `pnpm generate`, add the function in the area file under `src/routes/`, and return
  it from `createHandlers`. A missing or an unknown handler stops startup.
- **A background job, or any resource that must close.** Add `src/jobs/<name>.ts` and
  call it from the hourly run of `src/app.ts`. A job takes the store as an argument, so
  a test drives it, and every resource closes in the `onClose` hook that the drain runs.
- **A readiness check.** Add the probe in `src/routes/health.ts` and list it in
  `src/app.ts`. A stop answers first, and a database probe reads a served pool (0041).

## Testing conventions here

`node --test` through `pnpm test:unit` for a pure module, for example `config.ts` or
`routes/published-document.ts`. A test that needs a database or a listening server is an
integration test under `tests/integration/`, against the real PostgreSQL service. A
handler test proves the status, the media type, the body, and the failure code, and a
request that no generated operation can express uses `app.inject()`.

## Forbidden here

- No route, request shape, or response shape declared by hand. Only the contract creates
  a route, including a probe, and two ids of one answer share one function (0040).
- No domain rule in a handler. It reads validated input, calls a use case, and answers.
- No direct SQL or weakened server invariant, and that includes a readiness probe.
- No second origin list, client address or settings decider (0039, 0043, 0148).
- No rejected body, token, or password in a log line, which is why the whole reader
  path of a published link is redacted. A rejection names the request id and the reason.
- No handwritten HTTP transport. `better-auth.ts` is the one listed protocol file.
- No message text outside `src/auth/messages.ts`, and no message that a person
  with no session can cause outside the budgeted transport of `mail.ts` (0141).
- No actor helper in `src/routes/published.ts`, no script but the page file (0158, 0174),
  no second stylesheet, no uncached HTML and no shell under `/published/` (0031, 0047).

## Key files

| File                                   | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| `src/app.ts`                           | Builds the Fastify application                 |
| `src/plugins/register.ts`              | Contract driven routes and boundary checks     |
| `src/plugins/security-headers.ts`      | Content security policy and frame rules        |
| `src/plugins/static-assets.ts`         | Precompressed assets, caching, `ETag`          |
| `src/routes/handlers.ts`               | One handler per operation id                   |
| `src/routes/health.ts`                 | Liveness, readiness, and the probes            |
| `src/routes/published.ts`              | The reader path and document of a link         |
| `src/routes/published-render-cache.ts` | The bounded cache of published bodies          |
| `src/auth/actor.ts`                    | Turns a session into a verified actor          |
| `src/lifecycle.ts`                     | The order of the start and of the stop         |
| `src/config.ts`                        | Environment reading and refusal messages       |
| `src/served-origins.ts`                | The one list of origins this deployment serves |
| `src/trusted-proxies.ts`               | The one list of proxies this deployment trusts |
| `src/logging.ts`                       | Pino sink for the shared event catalog         |
