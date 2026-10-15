---
name: manage-host-credentials
description: Creates or rotates a named credential for one self-hosted installation and its known consumers. Use for an explicit credential request. It does not perform initial host setup, restore data, or rotate unrelated keys.
---

# Manage host credentials

Start with the named installation, credential, consumers, and requested action.
Check current health
through `tools/ops/check-host.sh`. Check the protected file mode without printing
its contents. Keep the old secret in a separate protected recovery file until
all named consumers prove the replacement. Create the replacement in a new
protected file. Do not overwrite a secret before its replacement is checked.

For a database role, use the supported database password change and check a new
connection as that role before service restart. For an operator token, change
only its named service and consumers. For the authentication secret, state the
session effect before the authorized change. For a backup key, retain the old
key for its old archives and prove a new archive with the new key. Never delete
an old backup key on the basis of a successful new backup.

Reload only the named target through its established host procedure. Check
readiness and a real request that uses the new credential. Revoke the old
credential only after the named consumers pass. On uncertainty, read current
state. Do not repeat a revoke or a password change blindly. End when private
evidence names the target, consumers, replacement location, checks, and revoke
state. Save no secret value in task evidence or chat.
