# 0244. Live note rooms share the sync WebSocket

- Status: Accepted
- Date: 2026-11-26

## Context

Design 017 excludes live keystroke sharing and presence. Design 013 already
defines a document that merges concurrent operations and retains offline work.

## Decision

Replace the exclusion of live keystroke sharing and presence in
[design 017](../design/017-websocket-sync.md) and design 013. Use note rooms
and workspace presence on the existing authenticated WebSocket. Keep the
save model of [record 0022](0022-autosave-and-automatic-versions.md).

Use standard Yjs sync and awareness inside the generated AsyncAPI envelope.
The server validates and authorizes live work before relay, and supplies
verified awareness identity. Yjs types remain in the document and editor
packages. Apply remote text with its own origin.

Use one in-memory validation authority per room across gateways. Use the
shared PostgreSQL listener pattern and a separate encrypted notification
channel with bounded fragments. Discard the room when it is empty. A gap
or outage returns clients to rejoin and durable HTTP sync.

## Consequences

- Live messages have no durable store. HTTP checkpoints still create versions.
- The upgrade address stays. The new subprotocol lets older clients poll.
- Real server tests prove cross-gateway access changes and bounded recovery.
- A two-account browser test proves convergence, cursors and offline merge.

See [design 029](../design/029-workspace-collaboration.md).
