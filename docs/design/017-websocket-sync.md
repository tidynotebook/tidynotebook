# WebSocket sync

Status: active

This design gives a connected device prompt notice of accepted changes. It
keeps offline work, immutable History, and the existing save boundaries.
The [implementation plan](../plans/016-websocket-sync.md) owns delivery.
This is a target architecture. The documentation PR does not deploy it.

## The problem in the current code

`packages/sync/src/engine.ts` checks the session and protocol, sends queued
checkpoints, reads changes, then waits for another cycle. Its timer is the
normal way a quiet device discovers a remote change. Local queue changes,
network return, and page focus can request an earlier cycle through
`apps/web/src/app.tsx`. Faster polling reduces delay but increases empty reads.

The code already has a durable sync protocol. `packages/sync/src/queue.ts`
retries a frozen mutation. `packages/storage-server/src/workspace-store/transaction.ts`
orders workspace writes. `packages/storage-server/src/workspace-store/sync-repository.ts`
commits document state, revisions, feed records, and receipts together.
`packages/storage-server/src/snapshots.ts` supplies catch-up and snapshot data.
WebSockets do not replace these functions.

`apps/web/src/app.tsx` runs the open workspace and workspaces with queued work.
The engines share a browser profile lease. `apps/web/src/pwa/sync-session.ts`
coordinates their stop. A new socket per engine would multiply connections
and make account changes harder to control.

There is more than one feed writer. The sync repository writes accepted
changes, `packages/storage-server/src/snapshots.ts` writes purge and membership
records, and `packages/storage-server/src/identity-store.ts` writes membership
changes. A notification added only to the save handler misses these paths.

Records in [design 013](013-conflict-free-sync-of-note-text.md) describe the
CRDT model. That model is present in the code above. The old statement in the
decision index that all those records are target work is not evidence that the
model is absent. This design uses the code. It does not reopen text merging.

## What the standards establish

Research date: 2026-09-26. The sources below are standards or documentation
from the project that owns the mechanism. The recommendation that follows is
an engineering choice for NotesApp, not a claim of a universal sync standard.

[RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html) defines the handshake,
frames, control messages, and connection closure. It does not define durable
application delivery. Its recovery guidance calls for delayed reconnects to
avoid a wave of clients overloading a server. The
[WHATWG browser standard](https://websockets.spec.whatwg.org/) defines the
browser API. It exposes neither arbitrary handshake headers nor protocol
Ping and Pong frames to script. A failed handshake also does not give script
the HTTP failure detail that an ordinary API call provides.

[Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
are a standard alternative for server-to-client notices. EventSource includes
reconnection and a last-event identifier. An event identifier alone is not a
durable replay store. SSE can meet this design's notification need.

The [Yjs WebSocket provider](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket)
exchanges document updates and awareness. Its scaling guidance includes
publish/subscribe and document partitioning. It is not a drop-in replacement
for NotesApp's checkpoint acceptance, receipts, quotas, and History rules.

## Options and recommendation

| Option                                  | Benefit                                                           | Cost and limit                                                                    | Decision          |
| --------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------- |
| Keep polling                            | No new connection service; current recovery works                 | Idle reads and remote delay remain coupled                                        | Keep as fallback  |
| SSE notices with HTTP sync              | A simple one-way stream with browser reconnect                    | Subscription changes need another request or stream restart                       | Valid alternative |
| WebSocket notices with HTTP sync        | One connection changes workspace subscriptions in both directions | Explicit lifecycle, bounds, and reconnect logic                                   | Use this          |
| All sync data and writes over WebSocket | Can avoid a later HTTP read after a notice                        | Rebuilds request correlation, replay, bulk flow control, and mixed-client support | Defer             |
| A stock Yjs provider                    | Live document and presence transport                              | Does not enforce this application's acceptance model                              | Do not use        |

Use WebSockets to replace frequent polling as the normal trigger for remote
reads. Keep generated HTTP operations for checkpoints, receipts, change pages,
snapshots, and attachments. The socket carries small notices, not note text.
This choice answers the requested WebSocket direction and permits subscription
changes on one connection. It does not claim better scale than SSE.

The benefit is lower discovery delay and fewer empty reads at quiet load.
Busy workspaces still read the feed. Connections, authentication, database
fan-out, and reconnect bursts have costs. A load test must show the benefit
before the deployment removes frequent polling from healthy connections.
Live keystroke sharing, presence, and a new save model are outside this design.

## Reuse before custom code

Use established specifications and maintained libraries for common mechanisms.
The [AsyncAPI specification](https://www.asyncapi.com/docs/reference/specification/latest)
and its [WebSocket binding](https://www.asyncapi.com/docs/reference/bindings/websockets)
describe the message channel. The official
[parser](https://github.com/asyncapi/parser-js) reads and validates it, and
[Modelina](https://github.com/asyncapi/modelina) generates payload types.
The existing Ajv tooling validates payloads at runtime. Do not write a new
contract language, reference parser, frame parser, or type generator.

Use the Fastify WebSocket adapter backed by `ws` on the server. Use
[PartySocket's standard WebSocket wrapper](https://raw.githubusercontent.com/partykit/partyserver/main/packages/partysocket/README.md)
for browser reconnects and connection timeouts. It works without a hosted
PartyKit service. Keep its disconnected send buffer disabled: the coordinator
sends the current subscription set after connection, not stale queued messages.
NotesApp owns account, lease, subscription, and feed semantics only.

[Socket.IO](https://socket.io/docs/v4/) is a valid alternative with reconnects,
heartbeats, rooms, and adapters. It adds its own protocol over WebSocket.
Its [delivery rules](https://socket.io/docs/v4/delivery-guarantees/) still
require application persistence for reliable replay. Its
[PostgreSQL adapter](https://socket.io/docs/v4/postgres-adapter/) distributes
messages but does not supply connection state recovery. For small wake notices,
plain WebSocket libraries plus the existing feed avoid a second session and
room protocol. Reconsider Socket.IO if its richer event features become needed.

A custom durable notification queue is also unnecessary here. The application
already has a durable feed. Use PostgreSQL notifications as hints, with catch-up
for missed hints. If future work needs durable background jobs, evaluate an
existing tool such as [pg-boss](https://pgboss.io/) before writing a queue.
Do not add that job system merely to duplicate this feed.

Before implementation pins dependencies, check their current maintenance,
license, runtime support, security advisories, and bundle cost. Test the chosen
AsyncAPI dialect with its parser, Modelina, and Ajv together. The specification
can advance before every tool supports it. Pin a supported combination in the
lockfile; do not patch around a mismatch with a private parser.

## Ownership and data flow

| Boundary                  | Responsibility                                                                 |
| ------------------------- | ------------------------------------------------------------------------------ |
| `packages/api-contract`   | Upgrade operation, frame schemas, capabilities, limits, and close semantics    |
| `tools/sdk-codegen`       | Generate frame types, validators, operation metadata, and the client entry     |
| `packages/api-client`     | Own the browser transport behind the generated entry                           |
| `packages/core`           | Keep acceptance and access rules independent of transports                     |
| `packages/storage-server` | Publish commit notices and own the listener connection                         |
| `apps/server`             | Authenticate the connection, authorize subscriptions, and send bounded notices |
| `packages/sync`           | Own catch-up scheduling, reconnect policy, and the sender lease                |
| `apps/web/src/app.tsx`    | Connect the account session, workspace interest, and existing sync state       |

A checkpoint follows the generated HTTP operation into the existing domain
acceptance transaction. A database trigger requests a PostgreSQL notice in the
same transaction. PostgreSQL delivers it only after commit. Each server process
checks its local subscriptions and sends an authorized notice.
The lease owner requests a normal sync cycle. Only applied feed or snapshot
data advances the durable local cursor. A socket notice never does.

## PostgreSQL notifications and server fan-out

Use PostgreSQL LISTEN and NOTIFY. A database trigger on feed insertion sends a
small workspace hint in the writing transaction. A statement trigger groups
changed rows by workspace so a large changeset does not send a hint per file.
A failed savepoint or outer transaction emits no notice. A repeated receipt
adds no feed row and emits none. This covers the sync repository, purge,
membership, and administrative paths by construction.

[PostgreSQL NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
delivers after commit and can combine identical notices within a transaction.
A listener that is absent misses notices. The channel is not an access boundary:
keep note text and credentials out of it. Each gateway listens to the same
channel and checks its own authorized subscriptions. No work-queue consumer
group, external broker, or sticky session is required. One browser does not
open one database connection.

Notifications are deliberately best effort. There is no notification receipt,
custom relay, outbox table, or second replay cursor. Reconnect and periodic
reconciliation use the existing feed. Gateways coalesce repeated hints before
they send to clients. Their bounded local subscription map is application
routing, not a new message broker.

A full PostgreSQL notification queue can fail a notifying transaction at
commit. The note then remains unaccepted and its existing queue retries it.
No receipt can report success for that transaction. This is an availability
cost, not silent data loss. Monitor notification queue use and long listener
transactions. The deployment needs a shared database publishing switch that
the trigger reads. Disabling it stops new notifications without stopping feed
writes, closes streams, and returns clients to polling. Turning off only the
WebSocket server is insufficient. Re-enable publishing before streams reopen;
every new subscription catches up. Gateways recheck the shared switch during
admission and their control timer, so disabling publication does not depend
on another notice getting through. Test this emergency path before rollout.

[PostgreSQL LISTEN](https://www.postgresql.org/docs/current/sql-listen.html)
requires care at startup. Commit the listen operation before stream readiness.
After listener reconnect, request catch-up for every local subscription. A
listener error disables stream readiness and closes sockets into fallback.
Never announce a ready stream while its listener is unavailable.

Use a dedicated checked-out client from
`packages/storage-server/src/pool.ts`, with explicit error, reconnect, and
shutdown ownership. It stays outside long transactions. Reserve its capacity
separately from requests. Direct or session-pooled access is required:
[PgBouncer](https://www.pgbouncer.org/features.html) does not support LISTEN
in transaction pooling mode. Do not adopt a listener helper that bypasses the
pool factory or opens an unowned connection.

This choice keeps record 0121's shared PostgreSQL service. Measure notification
fan-out and database cost before adding a broker. A future broker needs the
same catch-up and access rules. Shared attachment storage and the other
existing deployment dependencies still constrain a multi-process installation.

## Connection and subscription protocol

The contract defines a versioned subprotocol and a bounded set of messages.
This prose states semantics; it does not copy a schema. Message names and
numeric bounds belong in `packages/api-contract` during implementation.

| Message purpose        | Required behavior                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Ready                  | Confirm the authenticated account and negotiated notification protocol                     |
| Replace subscriptions  | Replace the complete workspace set for a monotonically newer connection-local generation   |
| Subscriptions accepted | Confirm the generation after access checks and local registration                          |
| Workspace changed      | Ask for a feed read for an authorized subscribed workspace                                 |
| Reconcile              | Ask all accepted subscriptions to catch up after a listener gap                            |
| Stop or refusal        | Give a typed policy result; preserve local work and use the existing session or retry path |

Process subscription replacement serially. Validate size and every workspace
before acceptance. Refuse an invalid replacement as a whole; do not silently
accept a subset. Echo its generation. Tag subsequent workspace notices with
that generation so a late message cannot affect a new account or subscription
set. A new connection starts with no subscriptions and a new local identity.

The server registers the accepted set before it confirms acceptance. The
client then pulls each workspace from its persisted cursor to the feed's
current end. It records a dirty flag when a notice arrives during that pull.
Before it sleeps, it consumes that flag and reads again. Thus a commit before
registration is covered by the initial read, and one after registration is
covered by that read or by a pending wake. Apply the same sequence on every
reconnect and on every new subscription.

A high-water value in a notice is not needed for correctness. Do not invent
a second cursor or permit a notice to skip a page. Catch-up uses the existing
feed recovery rules for retention expiry and snapshot fallback. Snapshot activation keeps pending checkpoints and drafts under
record 0085. Large backlogs stay in paged HTTP reads.

Two existing limits need work before push rollout. First,
`packages/storage-server/src/snapshots.ts` limits rows after a cursor, while
`packages/core/src/files/snapshot.ts` returns the final row's cursor. Several
rows can share that cursor. A page can split the group and skip its remaining
rows on the next request. The existing feed does not guarantee complete cursor
groups. The implementation must first prove bounded, lossless continuation
with a served regression test. This defect also affects polling.
[Issue 193](https://github.com/bkhanale/notesapp/issues/193) blocks push rollout.

Second, `pullNew` in `packages/sync/src/snapshot.ts` applies one incremental
page and returns. One wake must keep reading until an empty page confirms the
end. An empty page with a pending wake needs another read. Expose page progress
to the scheduler; do not treat its current completion result as end-of-feed.
Bound each scheduling turn and yield between batches. Retain pending catch-up
across those yields, while permitting queued writes and other workspaces to
run. Pause on refusal or transport failure. Test one wake, several pages,
and no later notice, including records that only change membership.

## Browser ownership and fallback

One account coordinator in the lease-owning tab holds the socket. It shares
that socket across workspace engines. Move lease acquisition, renewal, and
release from the per-workspace loops into that coordinator. Stopping one engine
must not release the lease of the other engines. Lease renewal has its own
timer; a quiet socket must not allow the sender lease to expire. Losing the lease
aborts scheduled sends and closes the socket. An old owner can finish an
in-flight HTTP request; frozen mutation identities keep retries safe.

The coordinator combines active workspace interests across live tabs with
workspaces that have queued work. Use native BroadcastChannel for interest
hints, scoped to the account. Cross-tab interest has expiry and heartbeat
so a closed tab cannot keep a subscription forever. Store invalidation reaches
the other tabs after local commit. Missed tab signals are only missed hints:
a resumed tab reads durable state and renews its interest. This refines the
coordination of record 0050 without syncing every idle workspace.

Do not depend on a service worker keeping a socket alive. On network return,
lease acquisition, visibility return, or socket reconnect, verify the session
account and protocol and request catch-up. Local checkpoint creation wakes
HTTP sending at once, even if the socket is unavailable. Coalesce repeated
wakes into one in-flight cycle and one pending pass per workspace. Backoff from
a server refusal still applies; a wake must not bypass a rate limit.

Keep a less frequent, jittered safety reconciliation while the stream is
healthy. Use the normal polling path while it is absent, unsupported, or
blocked by a proxy. Never infer access loss from an opaque browser handshake
failure; use the generated session and capability operations. Auth failures
pause the account. They do not start an endless reconnect loop.

Configure the maintained wrapper with capped growing delays and a stable
uptime threshold. Do not assume its defaults add jitter: the
[PartySocket source](https://raw.githubusercontent.com/partykit/partyserver/main/packages/partysocket/src/ws.ts)
uses fixed delay settings, despite the randomized example in its README.
Select bounded, independently randomized minimum and maximum delay settings
for each coordinator through the library options. This spreads retries without
writing another retry loop; it is not full jitter on every attempt. Test the
pinned library's retry schedule, including prolonged outage and cap behavior.
Stop automatic reconnect on terminal session or protocol refusal. The
wrapper owns reconnect timers; NotesApp owns HTTP fallback, lease renewal,
auth revalidation, and reconciliation timers with explicit cancellation.
A server heartbeat uses protocol Ping and Pong. A transport heartbeat proves
reachability, not that the application applied data.

## Access and resource limits

The [OWASP WebSocket guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
requires origin checks, continued authorization, bounded messages, and careful
logging. Use encrypted WebSockets on the public service. Authenticate before
upgrade with the existing session cookie. Refuse missing, null, or unlisted
browser origins through `apps/server/src/served-origins.ts`. CORS is not this
check. Keep secrets out of URLs and subprotocol names. Disable compression for
these small messages. Check each subscription against current workspace access.

Bind the connection to its original session and account. Recheck that session
and membership before each outbound batch, with no long-lived positive access
cache. Recheck idle sessions on a bounded timer and close at expiry. Session
revocation, account disablement, and membership removal invalidate connections
across processes. Transactional PostgreSQL invalidation notices cover identity
changes that have no workspace feed entry. Their scope is session or account, with no raw
credential. Current-access checks and expiry timers also cover missed notices.
If a check cannot complete, send no notice and close the stream.
A change in the browser's account closes the old coordinator before the new
one starts. Keep queued work in its original account partition.

Access checks and revocation can race. A notice already sent before revocation
cannot be recalled. The socket carries no note content, and the following HTTP
read rechecks access. Do not promise that a socket closure removes already
cached notes; record 0113 owns local partition handling.

Bound connection count, subscription count, frame bytes, messages per interval,
work per event-loop turn, pending authorization work, and outbound bytes.
Coalesce a slow client's notices per workspace. Close a client that exceeds
the bounded buffer and let it catch up later. Account connection limits use
shared expiring reservations, not per-process counts. Apply shared admission
limits through the work of record 0121 and local process caps as a second
bound. Deny new admission when the shared limiter cannot answer.

Use the central logging package for typed lifecycle and refusal events.
Do not log cookies, session secrets, note bodies, full frames, or unrestricted
workspace identifiers as metric labels. Keep connection metrics aggregate.

## Contract and server integration

OpenAPI continues to define HTTP operations and the upgrade address. AsyncAPI
in `packages/api-contract` defines messages, directions, and the WebSocket
binding. Shared JSON Schema components have one physical source. Both contracts
reference them; neither copies payload definitions from the other. This
extends record 0019 for a new transport through record 0124.

Use the official AsyncAPI parser and Modelina through `tools/sdk-codegen`.
Reuse the existing Ajv validator generation. Generate the typed client entry
and operation metadata around those outputs; this small integration joins the
repository, not a replacement for standard tooling. Check agreement between
the HTTP upgrade address and the AsyncAPI channel. Keep both sender and receiver
semantics explicit rather than blindly reversing operation directions.
The existing protocol-adapter registry can register the upgrade. No custom
OpenAPI message extension or feature-owned route enters the application.

The current checks in `tools/sdk-codegen/src/contract-layout.ts` and
`tools/sdk-codegen/src/orphans.ts` start from the HTTP contract. Extend source
ownership and reachability across both standard contract roots. A message-only
schema must be reachable through AsyncAPI, and a schema used by neither
contract must still fail. Shared files have one owner even when both roots
reference them. Do not disable orphan checks or add fake HTTP references to
make message schemas pass. Add positive and negative generator fixtures.

Use the maintained [Fastify WebSocket adapter](https://github.com/fastify/fastify-websocket)
behind contract-driven registration. Its pre-upgrade hooks can authenticate,
but HTTP response serialization hooks do not validate later frames. Install
message listeners synchronously, bound work before asynchronous checks, and
validate every received and sent application message. Catch post-upgrade
errors within the adapter. Test upgrade routes and frame handler coverage,
including unknown message kinds and incompatible subprotocols.

Capabilities describe notification support separately from the existing data
sync protocol. An older server or disabled notification service keeps HTTP
sync usable. An unknown frame or subprotocol disables that stream for this
connection; it never changes a queued save or triggers a database reset.

## Deployment, scale, and operations

The proxy must support upgrades and long-lived connections. Its idle timeout
must exceed the heartbeat interval and allowed missed replies. The
[NGINX WebSocket guide](https://nginx.org/en/docs/http/websocket.html) explains
explicit upgrade forwarding and idle connection closure. Verify the actual
production proxy path; a direct connection to Fastify is not sufficient proof.
Keep the application origin, trusted proxy rules, and content security policy
aligned with the generated socket address. The public reader origin does not
serve this authenticated channel.

On drain, reject new upgrades, stop admission, ask existing sockets to close,
and force-close only after the configured deadline. Release reservations and
listener clients on every exit. Other instances can accept reconnects. A broken
notification listener disables stream readiness and sends clients to fallback;
it need not remove a server that can still safely serve HTTP saves.

For a capacity model, count connected browser profiles, subscribed workspaces,
accepted changes, and recipients per change separately. Polling work grows with
active engines divided by the polling interval. Push work grows with changed
workspaces and their subscribers, plus heartbeat and safety reads. Shared
workspaces can dominate fan-out. Hot workspace writes still serialize under
the existing database lock. Adding gateways does not remove that bound.

Measure idle and active load, a hot shared workspace, many separate workspaces,
a slow recipient, and a mass reconnect. Record remote visibility delay,
HTTP and database work per active device, process memory per socket, event-loop
lag, notification queue use, listener recovery, fallback use, and rejection
rates. Keep results on the board issue and bounds in the test tool. Do not claim a capacity
number or a speed improvement before these measurements exist.

The rollout starts with an additive contract and migration. Deploy the server
with database publishing and notification admission off. Then deploy the client with fallback, enable
a small cohort, and compare it with polling on the same workload. Broaden only
when correctness checks pass and lower delay does not cause unacceptable save
latency or resource cost. Keep the shared publishing switch and a control that
disables admission and closes sockets. Rollback returns clients to polling; retain the additive
schema until old and new processes no longer need it. Do not roll back the
CRDT storage format as part of a transport rollback.

## Acceptance and unresolved measurements

The first implementation must prove the following cases on a served system:

- A commit on one server wakes a client connected to another server.
- Savepoint refusal, outer rollback, and receipt replay emit no false notice.
- Save, rename, Restore, Trash, purge, import, and membership writers wake readers.
- Listener loss before or after commit cannot prevent later catch-up.
- A notification queue failure rolls back acceptance; publishing disablement
  restores HTTP saves without dropping queued work.
- Commit during subscribe, catch-up, snapshot, and disconnect loses no state.
- Duplicate and missing notices, listener restart, expired cursors, and a
  backlog larger than one page converge through the existing feed.
- Multiple tabs, different open workspaces, lease transfer, browser sleep,
  sign-out, another account, and queued background work preserve ownership.
- Origin refusal, expired sessions, revoked access, account removal, malformed
  frames, connection floods, and slow readers stay within defined bounds.
- Old and new clients work during a rolling deployment and after fallback.

Use pure state-machine tests with a driven clock, real PostgreSQL tests, and
real listening WebSocket integration tests. Add a proxy-path smoke check and
manual browser checks for sleep, offline return, and multiple tabs. Take light
and dark screenshots if implementation changes a screen. The existing
`pnpm verify` gate stays mandatory; no fixed sleeps or skipped failures.

The target population, accepted latency, and deployment resource budget are
not supplied by this request. The verification issue sets these before tuning
or rollout. Heartbeat, safety poll, admission, batch, and buffer values are
therefore implementation bounds to measure, not invented configuration here.
This does not block the architecture, but it blocks a claim of proven scale.

## Decisions

- [0122: WebSockets wake the durable sync engine](../decisions/0122-websockets-wake-the-durable-sync-engine.md).
- [0123: PostgreSQL notifies the sync gateways](../decisions/0123-postgresql-notifies-the-sync-gateways.md).
- [0124: WebSocket messages use the generated contract](../decisions/0124-websocket-messages-use-the-generated-contract.md).
