# 0126. WebSocket messages use the generated contract

- Status: Accepted
- Date: 2026-09-26

## Context

HTTP response hooks cannot validate messages after a WebSocket upgrade.
AsyncAPI already describes messages. Use established tools before custom
mechanisms. See [design 017](../design/017-websocket-sync.md).

## Decision

- OpenAPI owns HTTP and the upgrade address. AsyncAPI owns messages and the
  WebSocket binding in `packages/api-contract`. Shared JSON Schema components
  have one physical source. This refines record 0019 for message transport.
- The pinned Redocly CLI lints and bundles both roots. Hey API writes payload
  types and Ajv compiles validators, as for HTTP. Add no AsyncAPI parser,
  Modelina, private contract language, or second type generator. A message
  schema uses only keywords that AsyncAPI 3.0 and JSON Schema 2020-12 share.
- Generate the typed client entry and server metadata. Check address agreement,
  references, both frame directions, handler coverage, and stale output.
- `packages/api-client` wraps PartySocket's standard WebSocket client behind
  the generated entry. The library owns reconnects and connection timeout.
  Disable disconnected message buffering. NotesApp owns subscription intent,
  account checks, and sync scheduling, not another reconnect implementation.
- The server uses the Fastify WebSocket adapter backed by `ws`, registered
  through the contract protocol registry. Keep pre-upgrade identity and origin
  checks, post-upgrade validation, bounds, and explicit error handling.
- Notification capability stays separate from the durable sync protocol.
  Unsupported transport selects HTTP fallback, not data recovery.
- Update guides and boundary checks with the implementation. Feature code
  never opens a raw socket or constructs its address.

## Consequences

Two standard contract formats describe different transports without copying
schemas. New dependencies have maintenance and bundle costs. Generator fixtures,
served message tests, and `pnpm verify` hold the boundary. Target work stays in
[plan 016](../plans/016-websocket-sync.md) until implementation is complete.
