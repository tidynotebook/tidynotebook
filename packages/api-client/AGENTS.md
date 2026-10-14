# packages/api-client

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. The recipe for a whole feature is in
[docs/development/feature-workflow.md](../../docs/development/feature-workflow.md).

## Purpose

The typed HTTP client and the socket entry. Every application HTTP call uses
an operation that this package exports, and every WebSocket address, frame and
message type comes from the generated socket entry (0126, 0128). `src/generated/` is written by `pnpm generate` from
the contract in `packages/api-contract/`.

## What lives here and what does not

- `src/generated/` holds the operations, the serializers, and the one fetch
  transport. `src/generated/socket.gen.ts` holds the address, the subprotocol,
  the message types, and the frame text of each channel, and
  `src/generated/addresses.gen.ts` the address of each download that a
  browser reads itself (0178). Never edit a file there.
- `src/configure.ts` sets the base URL, the cookie behaviour, the token
  provider, and it normalizes a problem answer. Its protocol exception preserves
  closed OAuth and MCP errors (0225, 0226). `src/socket.ts` is the one
  browser transport of the notice stream over PartySocket (0130).
- `src/response-progress.ts` reports received headers and body chunks through
  the generated response hook. The sync caller owns the timing and retry rule.
  It adds no request, URL, or parser.
- `src/index.ts` re-exports the generated operations and the configuration.
  No consumer may import a file under `src/generated/` directly.
- No domain rule, no retry policy, and no queue lives here. Those live in
  `packages/core` and `packages/sync`.

## Allowed imports

No workspace package. The one runtime dependency is `partysocket`, and only
`src/socket.ts` imports it (0126, 0130).

## How to add a common thing here

- **An operation.** Do not write one here. Add it to
  `packages/api-contract/` and run `pnpm generate`.
- **A client setting.** Add it in `src/configure.ts`. It may pass a fetch
  implementation and a base URL to the generated client; it must not call a
  transport itself.
- **A problem message.** Extend `normalizeProblem` in `src/configure.ts`, and
  keep the raw code out of the returned text.

## Testing conventions here

The generated operations and the socket entry are proved by
`tests/integration/contract.test.ts`, which calls each one against a real
listening server, and by `pnpm generated:check`. A test here cannot import this
package by its name, and the generated modules name their siblings by the
build output, so the consumer tests hold those proofs.

## Forbidden here

- No hand edit under `src/generated/`.
- No `fetch` call in `src/configure.ts`. It only passes an implementation.
- No deep import of `src/generated/` by any consumer.
- No second export entry. Only `exports["."]`.

## Key files

| File                       | Purpose                                 |
| -------------------------- | --------------------------------------- |
| `src/index.ts`             | The one public entry point              |
| `src/configure.ts`         | Base URL, cookies, tokens, problem text |
| `src/response-progress.ts` | Received data of an observed operation  |

## Key folders

| Folder           | Purpose                            |
| ---------------- | ---------------------------------- |
| `src/generated/` | Generated operations, never edited |
