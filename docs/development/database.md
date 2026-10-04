# Database

`packages/storage-server` owns the PostgreSQL schema, the reviewed migrations,
the roles, and the row access policies. It is a Node only package, and the
boundary checker refuses a browser import of it.

`src/schema.ts` is the schema and `migrations/` is what an installation ran.
Read those for a table, a column, or an index. This page states why they have
the shape they have: who may read a row and what can never change.
[Running the database](database-operations.md) states what one unit of work
is, how a change reaches an installation, and how the stored bytes are kept.

## Scoping

Every table that holds workspace content carries a workspace identifier, and
every child reference is a composite foreign key to its parent. A row therefore
cannot point at a row of another workspace: the pair does not exist in the
parent table. PostgreSQL runs a referential check with the rights of the
referenced table, so the boundary holds even where a policy hides the parent.
Content is deduplicated inside one workspace only, so a workspace cannot learn
that another holds the same bytes.

The identity tables are the exception. Sign-in has to find a user by an address
before any identity exists, so no policy can narrow them by the account of the
transaction. A second database role owns them instead.

## Roles

Three credentials exist and they do not overlap.

- **The migration role** owns the schema and is the only credential that may
  run DDL. It must not be a superuser and must not hold `BYPASSRLS`: forced row
  level security has no effect on a role that can bypass it, so a superuser
  migration role would make every policy meaningless.
- **The runtime role** serves the application. It holds no DDL right, no
  bypass, and no `UPDATE` or `DELETE` right on an immutable or operator owned
  table.
- **The identity role** serves Better Auth. It is the only credential that can
  read a session token, a password hash, or a reset token, and it holds no
  right on any workspace table. The runtime role holds no right on the identity
  tables, so an application query cannot reach them however it sets its
  identity. The few facts the application needs from that side come from named
  `SECURITY DEFINER` functions that each return one narrow answer.

Two consequences reach the operator: an owner policy names the migration role
by the name it had when the migration ran, and the migration sets a password
with a DDL statement. Both are stated in
[Backup and restore](../guide/backup-and-restore.md).

## Row level security

Row level security is enabled and forced on every table that holds workspace
content. Each carries an owner policy for the migration role, which is what
lets the schema owner migrate and provision, and the runtime role gets narrower
policies. A role that matches no policy sees nothing, so a transaction that
sets no identity reads no row and writes no row.

These policies are defence in depth. The application scopes every read and
write first, and the policies prove that the database refuses the same things
on its own, for every account of the installation. An installation role reads
no policy, so an administrator reads no row of a workspace of another account
([record 0109](../decisions/0109-the-installation-role-grants-no-workspace-access.md)).
Three shapes carry that.

- **A membership lookup is a `SECURITY DEFINER` function with a fixed search
  path.** A plain function would query the table its own policy guards, and
  PostgreSQL would report infinite recursion. Running as the schema owner
  avoids that and gives no role `BYPASSRLS`.
  `tests/integration/row-access.test.ts` proves it.
- **The usage, the account limit and the commit cursor are operator owned.**
  The runtime role reads them and does not write them, because a member who
  could lower the stored byte count, raise its limit, or rewind the cursor
  would defeat all three. `SECURITY DEFINER` functions make the permitted
  changes, check membership or the installation role first, and refuse a
  negative usage delta.
- **A rule that needs more than one row is a trigger.** A policy sees one row
  at a time, so it cannot count the remaining owners of a workspace.

Every function that changes state compares its caller with `IS DISTINCT FROM`
rather than `<>`, because a stranger has no role at all and `<> 'owner'` is
null for a null role rather than true.

Identity is set per transaction with a transaction local setting, so it
disappears at commit or rollback and cannot reach the next user of a pooled
connection. An integration test reads that setting on a pooled connection
outside a transaction to prove the absence of a leak.

A published link is the one record that a person with no account can reach,
and records 0030 and 0031 bound it. Its reader starts a transaction with no
identity, so every policy above hides every row; the digest of the token buys
one row through `notesapp_publication_by_token`, and the reader then adopts the
owner account of that link for the rest of the transaction. The transaction is
read only, so PostgreSQL refuses a write however the layers above fail, and the
scope of the link is bound in the SQL of the publication repository. The stored
token and the stored ticket are digests, and a check constraint on each column
refuses a value of any other shape.

## Immutability

Content, revisions, revision parents, changesets, and receipts refuse `UPDATE`
and `DELETE`, and two independent controls hold that. The runtime role holds no
such right, so it is refused before any trigger runs. A role that does hold the
right still needs an explicit purge setting in its own transaction, and that
purge is a `SECURITY DEFINER` function of the schema owner. No runtime
credential reaches the bypass, and the bypass is useless without the right.

## The deferrable accepted path

A live path must be unique inside a workspace, and one changeset must be able
to swap two paths. A partial unique index cannot express that, because an index
constraint cannot be deferred and the first statement of a swap would fail. The
accepted paths therefore live in their own table with a deferrable unique
constraint, and a deleted file releases its row. The commit makes the
constraint immediate before it returns, so a conflict surfaces inside the call
as a domain result rather than at commit time, and then restores the deferred
mode so a second changeset can swap paths again. The head reference is deferred
for the same reason: one transaction writes the revisions and then advances the
heads.

## The account limit

Stored bytes count new content plus a fixed charge for the retained revision
metadata and the receipt. The limit belongs to the account that owns the
workspace, and a write checks the sum over every workspace of that account
([record 0112](../decisions/0112-the-owner-account-holds-the-storage-quota.md)).
A changeset may use the small control reserve only when every revision in it
is a deletion, because a deletion must stay possible on a full account. Without
that rule a client could grow the stored byte count without limit by
resubmitting content the workspace already holds. `notesapp_add_usage` refuses
a write past the limit again, whatever the layers above it do.

The usage counts text and history apart from attachments, and `notesapp_add_usage`
checks the text limit and the standing of the owner as well
([record 0189](../decisions/0189-an-account-carries-limits-a-standing-and-feature-switches.md)).

Every path takes its locks in one order: the installation lock, then the
workspace locks by identifier, then the account locks by identifier. The
guide of `packages/storage-server` names the path of each.

## What the schema does not hold

Conflict branches, workspace members, agent tokens, and the workspace scoped
audit trail left the product. No table, function, policy,
trigger, or enum value for any of them remains. A published link is not one of
them: it is a read-only door over a scope, and it holds no member and no
grant. The browser store keeps its own
short list of dead structures. See
[Local drafts and explicit saves](local-storage.md).
