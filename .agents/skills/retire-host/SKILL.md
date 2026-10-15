---
name: retire-host
description: Stops service for one named self-hosted target after an explicit retirement request. Use for host retirement. It does not remove data unless that exact removal is requested.
---

# Retire host

Start with the named target and explicit retirement scope. Verify a backup and
record its retention location. Stop only the named service. Read that it stops.
Keep database, object store, backups, and credentials unless the request names
their removal. A credential revoke must name its consumer and replacement path.
End when the requested service is stopped and retained data is documented.
Local development cleanup does not apply to a remote host.
