# tools/sdk-codegen

## Purpose

The generator. It lints both contract roots, merges the authentication
fragment, checks the message contract against the HTTP contract, and writes
`packages/api-contract/src/generated/` and `packages/api-client/src/generated/`. It is the only workspace that produces
the HTTP boundary instead of using it.

## What lives here and what does not

- `src/generate.ts` is the entry point of `pnpm generate`.
  `src/check-generated.ts` is the entry point of `pnpm generated:check`.
- The merged client document also reaches `src/generated/openapi.json` of
  the contract package. The docs build reads it (0209), and the byte check
  covers it with the rest of the generated output.
- `src/auth-contract.ts` holds the authentication protocol fragment that
  `openapi.yaml` does not describe, including signed OAuth password sign-in. `src/contract-index.ts`,
  `src/definitions.ts`, `src/emit.ts`, and `src/paths.ts` write the output.
- `src/orphans.ts` walks the merged document from the paths and the document
  security and reports every component that nothing reaches.
  `src/contract-layout.ts` compares the contract source files with the root
  documents, because a file that no root lists reaches no Redocly rule. Both
  read `asyncapi.yaml` as a second root.
- `src/message-contract.ts` checks the channel address, the subprotocol, and
  the shared payload schemas against `openapi.yaml`, and `src/emit.ts` writes
  the channel index and `socket.gen.ts` from it (0128). `src/addresses.ts`
  writes `addresses.gen.ts` for each operation that states
  `x-notesapp-browser-address`, and refuses the mark where a browser could not
  send the request (0178).
  `src/dialect.test.ts` proves the shared schema dialect with the pinned lint.
- No application code lives here. No handler and no screen.

## Allowed imports

`@notesapp/api-contract` only, plus `@hey-api/openapi-ts` and
`@redocly/cli`.

## How to add a common thing here

- **A contract rule.** Add the check in the file that owns the shape, and
  fail generation with a message that names the operation and the member.
  A refused shape must never reach the generated output.
- **A generated file.** Write it from `src/emit.ts` and add it to the set
  that `src/check-generated.ts` compares, so a stale committed file fails
  `pnpm generated:check`.
- **A Redocly rule.** Add it in `packages/api-contract/redocly.yaml`, not
  here.

## Testing conventions here

`node --test` through `pnpm test:unit`. `src/orphans.test.ts` is the pattern:
it builds a small document in the test file and proves that the walk reports
the unreachable component and accepts the reachable one. Generation itself is
proved by `pnpm generated:check`, which is part of `pnpm verify`.

## Forbidden here

- No generated output that a rule refused. Fail instead.
- No hand edit of a file under a `src/generated/` directory.
- No non deterministic output. The same contract must give the same bytes.
- No application dependency. This workspace is the only one outside the
  generated transport rule, so it must not import application code.

## Key files

| File                      | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `src/generate.ts`         | Writes the contract index and the client      |
| `src/check-generated.ts`  | Compares the committed output with the source |
| `src/auth-contract.ts`    | The authentication protocol fragment          |
| `src/orphans.ts`          | The orphan component check                    |
| `src/message-contract.ts` | The message contract check                    |
| `src/contract-layout.ts`  | The contract source layout check              |
| `src/emit.ts`             | File emission                                 |
