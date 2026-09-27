# 0123. A report seals the address of its link

- Status: Accepted
- Date: 2026-09-27

## Context

[Record 0119](0119-a-report-reaches-an-administrator-who-can-take-a-link-down.md)
lets an administrator open a reported link as any reader does. The server
keeps only a digest of a link token, so that a read of the database yields no
working link ([record 0030](0030-published-links-are-hashed-tokens-over-a-scope.md)).
A report that holds the digest alone gives the administrator no address to
open. Record 0119 also lets the owner see a takedown, but the hourly cleanup
removes a revoked link at once. And
[record 0118](0118-a-published-page-of-a-public-installation-has-its-own-origin.md)
lets the published origin serve nothing but the reader path, while the page
of that path names the stylesheet and the fonts of the build. See
[design 016](../design/016-a-public-service.md).

## Decision

A report keeps the address of its link sealed. The report page knows the
token, because the token is in its address. The server seals the token with
AES-256-GCM under a key that it derives from `NOTESAPP_AUTH_SECRET`, and stores
only the sealed value. A read of the database still yields no working link.
The server opens the value for an administrator who lists the reports. After a
change of the secret, an old report shows no address, and the administrator can
still take its link down.

A report of a link that opens nothing stores nothing, and it gets the same page
as a report that is stored. One link keeps at most 20 open reports. A further
report gets the same page and is not stored.

A taken down link stays in the list of its owner for 30 days, marked as taken
down, and no action of the owner makes it live again. Then the hourly cleanup
removes the link and its reports.

The published origin also serves the stylesheet and font files under
`/assets/` that the published page names. It serves no other file of the build,
and no script.

This record refines records 0118 and 0119.

## Consequences

- An administrator opens a reported link without a message from the reporter.
- A person who reads the database and the secret of the server can open the
  address of a reported link. That person can already read every note.
- An integration test proves that the stored report holds no token, and that
  the administrator reads the address.
