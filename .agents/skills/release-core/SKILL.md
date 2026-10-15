---
name: release-core
description: Handles an explicit core release request. Release is unavailable until the hosted workflow replaces the old commands in issue 390 step 4.
---

# Release core

Release is unavailable during the transition in
[record 0228](../../../docs/decisions/0228-hosted-proof-and-release.md).
Main requires a protected PR and merge queue. The old preparation command calls
the old landing function, which pushes directly to main. Protection refuses
that push. Do not add a bypass or start the old release commands.

Step 4 of issue 390 adds the hosted release workflow and removes the old
lifecycle tool, receipt helpers and release commands in the same PR. No release
is planned before that step. A source request never permits publication or a
registry write. Keep signed tags and published assets fixed.
