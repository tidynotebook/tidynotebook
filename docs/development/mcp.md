# The remote MCP server

This page owns the MCP protocol boundary, its internal delegation and its proof.

[Record 0225](../decisions/0225-the-server-answers-mcp-on-its-own-origin.md)
sets the served surface.
[Record 0226](../decisions/0226-the-application-origin-issues-mcp-grants.md)
sets authorization.
[Record 0227](../decisions/0227-a-tool-calls-the-contract-as-the-actor-of-its-grant.md)
sets tool execution.

## The boundary

`packages/api-contract/paths/mcp.yaml` declares the endpoint and its protocol
marker. The metadata path items in that directory declare both discovery
addresses. The adapter in `apps/server/src/mcp/protocol.ts` supplies their exact
route list. With MCP off, no route in that list is mounted.

Only `apps/server/src/mcp/` imports the MCP SDK.
`tools/check-boundaries.mjs` checks this rule. One low-level server factory
serves the modern protocol and the earlier stateless protocol. The SDK selects
the protocol era. Each legacy request gets a fresh transport with JSON answers
and no session. The modern path has no subscription slot. Neither path opens
an event stream.

The MCP endpoint answers JSON. An authentication refusal uses the OAuth error
body and the discovery challenge. Every other refusal uses the JSON-RPC error
body. Metadata keeps Problem Details.
`apps/server/src/plugins/register.ts` validates each answer before it sends it.
A notification gets an empty accepted answer. The library validates the MCP
message. The boundary keeps its body size and media checks.
It refuses an array body before library dispatch. The tool handler checks
the required scope again before it starts a delegation.

`apps/server/src/served-origins.ts` adds the MCP origin to the one origin list.
It grants no cookie trust. A request with an Origin header must name the MCP
origin or an application origin. The endpoint reads no browser session or
personal key. The narrow token resolver of `packages/storage-server/src/oauth-store.ts`
checks the resource and the current account. The identity store calls it
through its existing runtime pool.

## Tools and delegation

`apps/server/src/mcp/registry.ts` holds the tool definitions, required scopes
and permitted contract operations. It exposes the ten note tools of plan 022.
`apps/server/src/mcp/read-tools.ts` maps each read tool to only those operations.
A tool list does not filter by scope. The adapter checks write scope before it calls
a tool, so a read grant receives a challenge for more access.

`apps/server/src/mcp/read-support.ts` owns the named bounds and schema checks.
Each answer contains text and structured data. Lists keep whole items. A paged
operation keeps its own cursor. A large page repeats the same read with a
smaller limit. Other lists use an offset. A text page names its immutable
version, and its continuation requires that version. A text page keeps each
Unicode pair together.

Account search visits a bounded set of workspaces in list order. Its cursor
keeps the workspace position and the match offset. Search reaches only the
best matches that the contract returns. A narrower query can find more.

`apps/server/src/mcp/write-tools.ts` maps writes to their declared operations.
It uses the existing document service of `packages/storage-server` to build
updates through `packages/note-document`. Each write on a live note reads its
head and checks the required version. Exact text must occur once. A whole
replacement keeps document identities through the same service. An unchanged
edit or move returns the current version without a write. The internal
contract port maps the expected version to the contract write condition, so a
head change during a call refuses the write. The contract checks that head
again under the workspace lock before any rebase or write. Trash sends the
observed state and no text update. Create relies on the contract refusal of an occupied path.

A handler receives only its input and a contract call function. It receives
no protocol context, progress function or logging function. A unit test holds
this rule so later tools cannot turn a JSON answer into a stream.

`apps/server/src/auth/actor.ts` holds the delegation in an asynchronous context.
No network header, cookie or body can create it. Each operation checks its
name, the current account and its current rights. An operation that needs a
browser session refuses the delegation. The capability ends when the tool
call ends, including for asynchronous work that still holds the context.
Each awaited identity read checks that the capability is still active before
the request can get an actor.
The internal dispatcher reads its method and address from the generated
contract and calls the normal request pipeline in the same process.

The grant and the account each have a separate request counter. Both use the
configured rate limit and the shared counters of
[record 0121](../decisions/0121-every-limit-and-every-job-holds-across-server-processes.md).
The outer request counts once. The delegated operations keep the normal
validation, locked account rule, usage limits and logs of the pipeline.

## Proof

`apps/server/src/mcp/registry.test.ts` pins the ten production note tools and
checks their operations and scopes. `apps/server/src/mcp/protocol.test.ts`
holds each real registered note tool while its contract call waits. It proves
that no notification can precede its result.
`apps/server/src/mcp/read-tools.test.ts` proves read schemas, bounds and paging.
`apps/server/src/mcp/write-tools.test.ts` proves write schemas, exact matching,
version checks, no-op changes and document updates.
`tests/integration/mcp-endpoint.test.ts` proves the served metadata,
authentication challenges, protocol answers, refusals, delegation and the
separate limits across replicas. It drives each read tool in both protocol
eras, text continuation after a head change, search continuation, read-only
delegation, write retries, concurrent edits, Trash races and locked accounts.
It holds each write after the REST head check and before the commit lock.
A competing move causes a refusal and keeps the saved workspace state.
Its tool fixtures exist only in its test composition.

`tests/integration/mcp-conformance.test.ts` runs the official released suite
against the server scenarios that apply. It names each selected scenario and
each excluded scenario. An added scenario fails until it has a classification.
There is no expected failure list. Test-only aliases let the released suite
call the real note handlers at its fixed names. Production refuses those names.
The test composition supplies a real issued
credential because the released suite has no credential option.
Our integration tests cover the modern protocol and authorization. The full
authorization proof is in `tests/integration/oauth-authorization.test.ts`.

```sh
pnpm test:integration -- mcp-endpoint mcp-conformance oauth-authorization
```
