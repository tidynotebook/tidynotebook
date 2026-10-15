---
name: recover-host
description: Restores one verified backup into a named empty self-hosted target. Use for explicit host recovery with a backup and target scope. It does not replace live data or recover a release.
---

# Recover host

Start with an explicit recovery request, installation identity, exact archive,
and an empty database and storage target. Verify the archive
with `tools/ops/verify-backup.sh`, then run `tools/ops/restore.sh` against only the
named empty target. The command refuses an identity mismatch or a used target.
Save archive and target identity plus the restore result. On uncertain partial
restore, read the target. Do not clear it or retry a destructive write. End when
readiness and restored attachment checks pass. Live replacement needs its own
explicit scope and backup. This skill does not grant it.
