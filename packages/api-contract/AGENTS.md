# packages/api-contract

Read the root [AGENTS.md](../../AGENTS.md) first. This file adds the rules of
this directory. This package is the only source of the notesapp HTTP interface and of the
messages of its WebSocket channels. It also exposes the generated operation and
channel index and the compiled Ajv 2020-12 validators that the server boundary
uses.

## The source layout

`openapi.yaml` is the root document. It holds `info`, `servers`, `tags` and
`security`, and it lists every path item and every component as a reference to
its own file. Redocly bundles those files into the one document that
`pnpm generate` reads, so the split reaches no generated file
([decision 0019](../../docs/decisions/0019-contract-validation-and-shared-types.md)).
Every reference is relative and names a file: `'../components/<section>/<Name>.yaml'`
from a path file, `'./<Name>.yaml'` in one section, and `'../<section>/<Name>.yaml'` across two.
`tools/sdk-codegen/src/contract-layout.ts` refuses a file that the root does not list, a definition that stays in the root, and two rows that name one file.

## What lives here and what does not

- `openapi.yaml`, `paths/` and `components/` are authoritative. `redocly.yaml`
  holds the rules of `pnpm contract:lint` and `.redocly.lint-ignore.yaml` its
  exact exceptions for the 101 upgrade (0128), OAuth (0226) and MCP errors (0225).
- `asyncapi.yaml` is the message root (0126), and `channels/` holds one file
  per channel. A payload is a schema that `openapi.yaml` also lists, in the
  keywords that AsyncAPI 3.0 and JSON Schema 2020-12 share.
- `src/generated/` holds the operation index and the compiled validators.
  Its `openapi.json` feeds the generated API reference (0209). Never edit it. `pnpm generate` writes it and `generated:check` compares it.
- `src/operations.ts` gives the registry lookups, `src/messages.ts` checks
  each frame both ways (0128), and `src/schema.ts` compiles a schema. No route, no handler, and no client code lives here. The generator
  lives in `tools/sdk-codegen`.

## Allowed imports

No workspace package. Only `ajv` and `ajv-formats`.

## How to add a common thing here

- **A path.** Write the path item in `paths/<name>.yaml`, then add its row to
  `paths` in the root. The file name is the path without its leading slash,
  each `{name}` written bare and each remaining slash written as `_`, so
  `/api/workspaces/{workspaceId}/files` becomes
  `paths/api_workspaces_workspaceId_files.yaml`. A second address for one answer
  is its own file with its own `operationId`
  ([decision 0040](../../docs/decisions/0040-a-probe-address-is-a-contract-operation.md)).
- **A schema, a parameter, a response, a request body, a security scheme.**
  Write it in `components/<section>/<Name>.yaml`, named after the component,
  then add its row to `components.<section>` in the root.
- **A message.** Write its schema with a constant `kind`, list it in
  `openapi.yaml`, add it to its channel file under that kind, and name it in
  an operation of `asyncapi.yaml`.
- **An operation.** Give it a stable `camelCase` `operationId`, a summary, a
  description, and a declared tag. Give every parameter `in`, `required`,
  `style`, `explode`, a description, and a schema. Declare the success status,
  `400` and `500`, plus `413` and `415` when it has a request body.
- **A schema member.** Set `additionalProperties: false` on a write body object.
  Mark a client only member `writeOnly` and a server only member `readOnly`.
  Reference the schema, because an orphan fails generation. A failure answers
  `ProblemDetails` with a stable `code`, or a closed narrowing of it. OAuth
  operations use `OAuthError` (0226). The MCP endpoint answers JSON-RPC errors
  and `OAuthError` for its auth challenges (0225). Token and revocation requests use forms.

## Testing conventions here

`node --test` through `pnpm test:unit`. `src/validators.test.ts` proves that a
compiled validator accepts the declared shape and refuses the neighbouring one,
and `src/messages.test.ts` does the same for each frame direction.
`tests/integration/contract.test.ts` proves the contract to handler mapping.

## Forbidden here

- No edit under `src/generated/`.
- No second path item or component in one file. No absolute reference.
- No operation without `additionalProperties: false` on a write body.
- No parameter without `style` and `explode`. No cookie parameter.
- No status with more than one media type.
- No reuse or change of an `operationId` that already shipped.
- No orphan component. `tools/sdk-codegen/src/orphans.ts` refuses one.

## Key files

| File            | Purpose                                  |
| --------------- | ---------------------------------------- |
| `openapi.yaml`  | The root OpenAPI 3.1.2 document          |
| `asyncapi.yaml` | The root AsyncAPI 3.0 message document   |
| `redocly.yaml`  | The strict rules of `pnpm contract:lint` |

## Key folders

| Folder           | Purpose                                 |
| ---------------- | --------------------------------------- |
| `paths/`         | One file for each path item             |
| `components/`    | One file for each component, by section |
| `src/generated/` | Generated output, never edited by hand  |
