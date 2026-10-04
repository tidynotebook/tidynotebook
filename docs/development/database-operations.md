# Running the database

`packages/storage-server` owns the unit of work, the migrations, the search
index, the stored attachment bytes, and the disposable database of the checks.
This page states what one transaction does, how a change reaches an
installation, and how the bytes are kept. [Database](database.md) states the
access model and the invariants that the schema holds.

## Transaction shape

`transact` opens one transaction, sets the actor identity for that transaction
only, takes the workspace advisory lock, and then checks that the workspace is
visible. The lock is advisory and not a row lock, because a row lock would need
an update right on the workspace row that most actors do not hold. The
visibility check runs after the lock, and a hidden workspace and a missing one
are the same answer: storage cannot tell them apart and must not try.

`accept` runs inside a savepoint, so an expected domain outcome rolls back to
it and returns a result, the transaction stays usable, and no partial state
survives. Only a named constraint maps to a domain code. Every other SQL
failure stays an operational error, and only a real database failure becomes
one, so a use case above this port keeps its own error type. The step order is
in [Files, revisions, and atomic changes](files-and-revisions.md).

A driver error carries the failed statement, its parameters, and the server
detail and hint fields. All four echo note text and file paths, so the
operational error never forwards the original value. Its cause is rebuilt from
the SQLSTATE, the constraint name, the table name, and the server routine.

## Migrations

Each migration has two halves: the generated tables, keys, and indexes, and the
handwritten SQL after the banner. Drizzle cannot express a role, a grant, a
policy, a trigger, a deferrable constraint, or a stored function, so those
statements are written and reviewed by hand.

- `pnpm db:generate` writes the next migration from `src/schema.ts`. It
  connects to no database and writes nothing when the schema did not change.
- Never edit an applied migration. The applied set would disagree with the
  file, and the driver would not reapply it. Add the next number instead.
- The stored schema version function returns the number of journal entries, and
  `requiredSchemaVersion` in `src/migrate.ts` is what the readiness probe
  compares it with. A new migration raises both in the same change, so a
  container that serves without its migrations never reports ready.
- `pnpm db:migrate` requires an explicit profile, and each profile refuses a
  database whose name does not match it, so no default can point a developer
  command at an operator database. The deployment profile reads protected
  operator files rather than environment values, so a URL and a password never
  reach a process list or a shell history.
- Three data migrations run after the SQL, under the same lock:
  `src/portable-markdown-migration.ts`, `src/note-document-migration.ts` and
  `src/search-index-migration.ts`. The second starts the document of every
  note that has none, from its last live text, so no device starts an existing
  note from Markdown (record 0084). The third makes each search row of an
  earlier text rule again (record 0167). Each one writes only what is missing
  or old, so a second run changes nothing.
- A limit of the grammar can be newer than a stored note. Each data migration
  and the link rewrite of a move keep such a note as it is and go on, so one
  note never stops the server from starting or refuses the move of another.

## Search

One row holds the name and the readable text of each live note, and the name
weighs more than the text. The text comes from `readableText` of
`packages/markdown` through `src/search-text.ts`, so search matches and quotes
what a reader sees, and `text_rule` names the version of that rule. One text
configuration, `notesapp_text`, has no language rule and no accent, and the
stored vector, the query and the excerpt all name it (record 0167). The index
holds the workspace identifier ahead of the document, so a search of one
workspace never reads the postings of another. The index expression and the
search function have to stay identical, or the planner cannot use the index.
The function reads the words of the typed text through `ts_debug` with the
configuration of the index, and each lexeme reaches the query quoted, so no
part of the text reaches the parser as an operator. A word of three characters
or more matches as a prefix, which is what makes search as you type work, and
a shorter word matches only itself. The page is ranked and cut before any
excerpt, and an excerpt reads a bounded window around the first place where a
query word starts, found case blind on the stored body, so a long note costs
no more than a short one. Migration 0027 empties the table and the data
migration writes every row again in batches of keys, one note at a time, so an
upgrade costs one parse of each live note and holds no long lock. An excerpt arrives with control characters around each match, so
no markup reaches a reader.

## Attachment bytes and the reclaim

Attachment bytes live in the object store of
[record 0192](../decisions/0192-uploads-and-attachments-can-live-in-an-s3-compatible-store.md),
not in the database: the private volume, or an S3 compatible store. The port
and both adapters are in `src/object-store/`, and `keys.ts` names every key.
Finalized bytes are content addressed, so several objects of one workspace can
share one object. `reclaimAttachments` in `src/attachments.ts` is the only code
that deletes them, and the job in `apps/server/src/jobs` calls it. Nothing
else removes a finished object, so there is one place to reason about and one
to test. An upload stages its bytes under `staging/`, and
`removeStaleObjects` takes what waits there for more than a day. A
run takes only what is dead: an abandoned upload, a finalized object that no
revision has named for a whole day, and an object a purge already decided is
gone. A claim marks the row in one statement that matches only an unclaimed
row, so a second run and a second process get nothing and delete nothing.

The check that a shared file is still needed and the deletion itself stay in
one transaction that holds the workspace lock. A finalize takes the same lock,
so it cannot pass between the two: it waits, finds no object at the key of the
digest, and promotes its own staged bytes there. A check after the commit reopens that
race and leaves a row whose file is gone. A purge skips an object finalized
seconds ago for the same reason: it sits between its finalize call and the
commit that will reference it. A workspace deletion copies the object
references into a queue with no foreign key to the workspace, because those
rows outlive the workspace row.

## The test database

`compose.test.yaml` runs one pinned PostgreSQL service and one pinned MinIO
service on ports that cannot collide with an installed one. Each test file of
the object store makes a bucket of its own through
`tests/integration/support/object-store.ts`. Its superuser initializes the service only, and
`tools/test-database/init.sql` creates the non superuser migration role, so
every check runs under the production role model.
`tests/integration/support/database.ts` makes one disposable database per test
file and drops only what it created. It and `src/admin.ts` both refuse a
database whose name is not a test name, so no operator database can be created
or dropped through that path.
