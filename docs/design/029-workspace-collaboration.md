# Workspace collaboration

Status: accepted

People can invite each other to a workspace, edit a note together, and see
who made a version. [Design 013](013-conflict-free-sync-of-note-text.md) owns
document merge and recovery. [Design 017](017-websocket-sync.md) owns the sync
stream, its session, and its fallback. Record 0244 adds live text and presence
to that stream. [Record 0022](../decisions/0022-autosave-and-automatic-versions.md)
still owns the save boundary.

## Workspace access

| Action                                                             | Owner | Admin | Editor | Viewer |
| ------------------------------------------------------------------ | ----- | ----- | ------ | ------ |
| Read notes, member list, and workspace data                        | Yes   | Yes   | Yes    | Yes    |
| Read History                                                       | Yes   | Yes   | Yes    | Yes    |
| Create, change, rename, move, trash, or restore notes and versions | Yes   | Yes   | Yes    |        |
| Publish and manage links                                           | Yes   | Yes   |        |        |
| Purge notes or empty Trash                                         | Yes   | Yes   |        |        |
| Manage invitations and members other than the owner                | Yes   | Yes   |        |        |
| Rename the workspace                                               | Yes   | Yes   |        |        |
| Delete the workspace                                               | Yes   |       |        |        |
| Leave the workspace                                                |       | Yes   | Yes    | Yes    |

Every workspace has exactly one owner. An invitation and a role change can
grant Admin, Editor, or Viewer. Installation administration is a separate
permission. Ownership transfer is out of scope.

Read the current role in the transaction that acts on it. Intersect it with
the verified transport grant. Match database functions and row policies to
the same rules. Apply the rules to HTTP, MCP, API keys, attachment access,
background writes that act for a member, and live rooms. Audit each call site
that currently assumes a member is the owner. Give new actions an operation.
Keep existing API key and MCP scope names. Map existing grants to actions
explicitly, with the current workspace role as an upper limit. For example,
an existing grant that can publish today can continue to publish for an owner
or admin. A viewer's write grant has no write effect. Membership and
invitation management uses a browser session.

Owners and admins can manage the workspace's published links. Attribute
each link to the workspace owner for the existing transfer limits.

Enforce the owner count in the database. Use the workspace write lock for
membership changes and note acceptance. Use a consistent lock order for
all affected accounts and workspaces to serialize last-workspace checks.
The runtime role cannot insert memberships directly. Give it narrow
functions for invite, registration, member and role changes, and co-member
reads. The roster function returns only account ID, display name, email,
and role. Account row policies keep their existing scope.

A member can leave if they keep a workspace, as in
[record 0051](../decisions/0051-an-account-always-keeps-one-workspace.md).
If forced removal or a workspace deletion would strand another member,
create a new Personal workspace for them in the same transaction. Use the
same Personal workspace function as signup. The Personal flag queues a
welcome note through the workspace insert trigger. The server creates that
note at the next workspace list or request for the Personal workspace. The
account already has preferences from signup, so it keeps them. The new
workspace starts with the default workspace settings.
Keep the existing refusal when the deleting owner would lose their last
workspace. Show the count of other members in the delete confirmation. A
removed member's storage use does not move with them.

`workspace_usage` has one row per workspace. Account usage already sums
rows joined to a membership with role Owner. Preserve that attribution for
notes and attachments. Run quota checks and serialize shared owner quota
debits for every writer, including concurrent writers in separate workspaces
of the same owner.

## Invitations

Store workspace ID, normalized email, requested role, inviter, token digest,
sealed token, expiry, and status. Status is pending, accepted, declined,
revoked, or expired. Record the accepting account to make retries safe. Use
the same address normalization as registration. Lock the workspace and the
invitation for state changes. Give pending invitations a unique workspace
and email key. Mark elapsed rows expired before the pending count and
duplicate check. Lists and acceptance still check the clock. The server
refuses current members. A request accepts up to 20 addresses with one role.
Return one result for each address in request order. Commit eligible rows
together, up to 100 pending per workspace. Use the shared limiter for account
and workspace budgets, with a charge for each address.

Generate a random token and store its SHA-256 digest for lookup. Seal the
token with a separate purpose in the existing auth sealing helper. Put the
secret in the fragment of the installation's join URL. The app sends it in
a body, clears it from the address, and keeps it out of logs, analytics, and
caches. An owner or admin can read a pending link from a private, no-store
operation. Starting a new invite after expiry uses a new token.

After commit, send one email per new invitation when mail is available.
Use the shared plain text and HTML renderer from
[record 0232](../decisions/0232-every-core-email-has-html-and-plain-text.md).
Use the configured origin. A send failure keeps the invite pending and
returns Copy link. Copy link is available for each active invite.

The join page reads the token digest through the public, rate-limited inspect
operation. It displays workspace, inviter, email and role for a valid token.
All unavailable token states use one response. The browser uses its session
to show the matching account, the wrong account, or Create account and join.
A verified address sees its pending invitations in the switcher and can
accept or decline by invitation ID. The database checks the normalized,
verified address again. An unrelated account learns no invitation state.

Reuse the registration operation and the one registration function from
[record 0108](../decisions/0108-an-account-comes-in-through-one-registration-path.md).
Possession of a valid workspace link proves the invited address for new
registration, including when open registration is off. The registration
transaction creates the account, its Personal workspace, and the invited
membership, then consumes the invite. Keep the existing cleanup of a Better
Auth user when application registration refuses. Two tabs can consume an
invite only once. A retry by the same accepting account can read its current
membership. A retry after removal cannot restore it. Serialize decline,
revoke, expiry and acceptance with the same invite state check.

## Access changes and recovery

Write the membership feed record in the access change transaction. For the
affected account, also send the existing account invalidation hint. This
reaches a device that can no longer read the workspace feed. After deletion
notify all former members. Gateways check access before live processing and
before sending content. Use the same workspace lock at the admission point
and before accepting update authority. Recheck on invalidation and on idle
timers. Evict a removed account's rooms and workspace presence. Change a
downgraded account's rooms to read only before any further writes. In-flight
bytes sent while access was valid cannot be recalled.

On a confirmed access loss, stop sends and flush local editor input. Resolve
any frozen mutation that can still be checked with the existing actor-bound
receipt rules. If its outcome cannot be resolved, keep the original text.
Check drafts and pending text against the accepted digest before making a
recovery copy. Recover unsent work as a new note with a stable recovery ID.
Use Personal first if writable, then another writable workspace.
If all remaining workspaces are read only, use the account's existing create
workspace permission to make Personal. Put recovered notes in `From <workspace
name>`, with the existing path collision rule. Check the destination listing
and retry with the next free name if another device takes that name. Wait for
the server to accept the copy before clearing the inaccessible source data.
The stable file ID lets a retry find a copy after a lost answer.
Keep local recovery data if a limit prevents a destination save. After
recovery commits, clear the source queue and drafts. Refresh the save status
and reload the accepted head on a downgrade. Keep the readable cache. Show
a dismissible toast with a link to the first recovered note and keep the
role change in a one-time toast. Apply the same rules for an offline client at
its next confirmed access check. Transport failures alone must not trigger
cache removal.

## Live notes

The existing authenticated socket stays the only connection for the browser
sync coordinator. Tabs send room interest and payloads through its account
channel. A connection-local room ID names one working copy. The room authority
keys the shared room by workspace, note, and document epoch. Admission
checks the session, role, file type, and epoch. Read the role and bind the
client ID under the same workspace lock. A viewer can get sync data
and publish its own presence. It cannot send a text update or a sync reply
that carries text. Close or rejoin
a room when a file is purged or its epoch changes. The leader tab's lease can
change while a note is open. Re-register its room interests and restore
presence on the new connection.

Use standard sync Step 1, Step 2 and Update and standard awareness bytes from
`y-protocols`. The contract carries base64 in the existing JSON envelope.
Check message type and direction, validate bytes against the current room
document with the checkpoint adapter, and refuse bad structure, unresolved
dependencies, or size violations before relay. Validate changes relative to
a trial copy. Use the room sequence to detect gaps. On a gap, rejoin from the
accepted document and use standard sync to recover missing live state while
it is still available. Use HTTP catch-up for durable state. When an offline
delta exceeds a live frame or relies on work missing from the room, run the
normal HTTP checkpoint path first. Never split arbitrary Yjs bytes and apply
them as separate updates.

Keep Yjs types within `packages/note-document` and the private bridge to
`packages/editor`, as in
[record 0082](../decisions/0082-yjs-has-a-byte-api-and-a-private-editor-bridge.md).
Use one session and CodeMirror instance. Apply remote work with a distinct
origin after composition ends. It does not enter local undo or start a
checkpoint timer. Persist local operations and draft data before sending
them. A local checkpoint can include validated peer operations which local
work depends on. A remote-only event creates no checkpoint.

Use the existing frame, rate, and queue enforcement with separate live
budgets so presence cannot delay durable notices. Initial live limits are
16 room joins per connection, 32 participating working copies per room,
64 KiB decoded sync, 4 KiB decoded awareness, and 20 live client messages
per second with a burst of 40. Limit each JSON live frame to 128 KiB as
encoded, and bound pending and outgoing bytes. Measure
these limits with the multi-server test and load check. If a room exceeds
a limit, stop or defer live work while local drafts and HTTP sync continue.
Report Live only after join and handshake. Show Reconnecting when a live
connection tries again, Offline when the browser is offline, and the Viewer
notice on a confirmed downgrade.

### Cross-server relay

Use one authoritative in-memory trial document and ordered validation per
active room. Use a PostgreSQL advisory lock held by a dedicated gateway
connection to elect the authority, with the existing pool and listener
lifecycle. Gateways forward joins and frames to the authority and distribute
its ordered output to local connections. Use expiring shared coordination for
per-room reservations and cap room count and total memory per process.
Release the lock and discard the trial document when the room is empty.
On authority or listener loss, stop affected rooms. Rejoin from the durable
head and the still available client drafts.

Use a separate PostgreSQL notification channel for the live bus. Keep
ordinary feed notices as they are. PostgreSQL notifications are visible to
database users and usually limit payloads to fewer than 8000 bytes.
Use authenticated encryption with a distinct purpose and the shared
installation secret, through the existing seal helper with a separate
purpose. If a single gateway runs, deliver in process. Send bounded numbered chunks under 7000 bytes each.
Authenticate routing metadata and message IDs. Reject replay, bad chunks,
oversize messages, or expired assemblies. Commit related chunks together.
Keep the relay outside the checkpoint transaction. Put no live frame in a
database table, durable log, or notification queue owned by the application.
On a relay failure, close live rooms into HTTP fallback. The listener
readiness and shared disable controls from design 017 apply. Link behavior
to the [PostgreSQL NOTIFY documentation](https://www.postgresql.org/docs/18/sql-notify.html)
and the [Yjs protocol definition](https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md).

### Presence and authorship

Bind each Yjs client ID to its verified account within one note and epoch.
Store the identity binding separately from payloads. Retain it through
reconnect and compaction. A second account cannot claim it, and a second
connection must not drive the same awareness entry at the same time. Reject
structs from another or unbound client ID in a client live frame, even
if it is a Step 2 reply. Build replies from local operations bound to
the sender. Use HTTP to bring missing accepted state to the room. Map older local sessions through their verified
operation history when possible. An offline checkpoint can claim new IDs
for its actor under the workspace lock. Existing durable structs keep
their bindings and are not new contributions.

An awareness frame changes only the entry for the bound client ID. The
server rebuilds that entry with the verified account and display name,
role-derived mode, workspace color slot, and bounded relative selection
and idle state. Assign the first unused slot when a member joins the
workspace. Existing workspaces assign slots in order of membership, with
the owner first. Role changes and other members' departures keep the slot
in place. Members, History, presence, and cursors read this same slot.
The first six slots use the theme palette. Higher slots use theme values
with different hues and lightness. Use
`y-codemirror.next` to show selections and cursors. Remove state on leave
or expiry. Workspace presence sends only open-note counts for other
accounts to authorized watchers. Collapse tabs of one account into one
count. Bound refreshes and expire stale state.

A person's local change can depend on text that a peer shared before their
checkpoint reached durable storage. Store the write permission at the time
of the client ID binding. When a viewer becomes an editor, confirm the same
account's binding again before it can send edits. During checkpoint acceptance, attribute new
insertions to the account of their binding. Refuse new structs with a
view-only binding and keep the work for design 013 recovery. Claim unbound
new client IDs for the checkpoint actor under the workspace lock. Apply the
normal document validator to all operations. Credit deletions to the account
that sent the checkpoint. Record 0245 states the limits of these labels.

Store revision contributors under the same savepoint as accepted document
state, revision, receipt, and feed. Keep `revisions.actor_account_id` for the
committer. Use it as the contributor for old revisions and server-driven
writes without live input. Resolve identities through current workspace
membership when reading History. Show Former member after removal, with no
name or email. When a checkpoint leaves the Markdown, path and Trash state
unchanged, keep its ID for document catch-up and receipts. History keeps the
previous version. Named checkpoints and explicit restores keep their own
version.

## Interface and design system

Use the copied mock-ups as the reference for text, layout and states. These
differences follow the [design system](../development/design-system.md):

| Mock-up               | Use in the product                                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main and Phone        | Use Settings headers and edge treatment. Use flat desktop groups and aligned phone cards. Shared rows set height and pointer targets from padding and line boxes. Keep compact phone actions in the row menu. Use the pinned full-width Invite people action on the phone. |
| Invite and Accept     | Use the desktop dialog, phone Settings sub-level, account forms, fields, focus handling, and notices. The invite address group uses shared wrapping and control slots with symmetric insets.                                                                               |
| Switcher              | Use the existing workspace menu or phone sheet. Put the invite actions in a focusable group without interactive controls nested in a menu item. Use the shared Notice or Toast for recovery.                                                                               |
| Editor and EditorDark | Use the existing editor header, sidebar, toolbar and status regions. The sidebar reports connection problems. The note scroll edges take no space. Put avatar overlap and cursor styling in owners of shared components and theme roles. Dark colors use theme tokens.     |
| History               | Use existing History rows, diff layout, and semantic status and type roles. The viewer omits Restore.                                                                                                                                                                      |
| PhoneEditor           | Use the shared sheet with its header, close slot, scrolling body and safe area. Desktop presence uses a tooltip and a keyboard-accessible trigger.                                                                                                                         |

Across the screens, the mock-up CSS sizes, absolute positions, type, fills and
spacing give way to shared theme tokens and controls. Width selects layout
and pointer type selects density. Use an accessible name for each presence
dot. Give read-only viewers a View only label and notice. Hide their write
actions in the editor, menus, sidebar, toolbar, and keyboard commands.

## Compatibility

Add enum values and tables. Keep existing owner rows and note epochs. Old
History falls back to the recorded actor. The History contributor list adds
a field to the current HTTP shape. Upgrade all servers together in a
maintenance window. Old binaries only know the Owner enum value. Let the
served web client refresh through the existing upgrade path. External clients
that validate roles must update before they consume shared memberships.

Use `notesapp.sync.2` at the same upgrade address. A new server reports it
in the sync capability response and leaves the legacy notification list
empty. Old clients use HTTP polling. New clients wait for Ready to offer
live rooms and send room or presence messages only after that offer. They
use HTTP polling with an old server. Durable writes continue if live
admission fails. A rollback to owner-only binaries with shared membership data needs a compatible
forward repair or a restore from backup. Rehearse that before rollout.
Document schema, operator controls, key sharing, database session pooling,
and proxy effects in the PR. No release or deployment is part of this change.

## Decisions

- [0243. Workspace membership uses verified invitations and current roles](../decisions/0243-workspace-membership-uses-verified-invitations-and-current-roles.md)
- [0244. Live note rooms share the sync WebSocket](../decisions/0244-live-note-rooms-share-the-sync-websocket.md)
- [0245. Revision contributors come from client ID bindings](../decisions/0245-revision-contributors-come-from-client-id-bindings.md)

The [implementation plan](../plans/023-workspace-collaboration.md) sets the
review boundary and tests.
