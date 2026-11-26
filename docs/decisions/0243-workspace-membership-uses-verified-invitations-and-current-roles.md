# 0243. Workspace membership uses verified invitations and current roles

- Status: Accepted
- Date: 2026-11-26

## Context

Workspace access has one role today. Sharing needs multiple roles and a way
to join a workspace without granting access to other accounts or workspaces.

## Decision

Keep one owner and add Admin, Editor and Viewer. Intersect transport grants
with the current role inside the action transaction. Enforce the role again
with RLS and narrow database functions. Installation administration remains
a separate permission.

A workspace invitation binds an address and role for seven days. Use its
digest for token lookup and its sealed token for Copy link. A verified
matching account can join. The existing registration transaction can also
create the account, its Personal workspace and the invited membership.
Consume an invite once.

Keep the last-workspace rule. A forced removal that would strand a member
creates a Personal workspace in the same transaction. A voluntary leave
that would strand the caller is refused. Attribute usage to the owner.

## Consequences

- Only co-members read names and email addresses through the roster.
- Membership changes wake sync and invalidate live room access.
- Database tests cover privilege, invite races and the workspace invariant.
- Deploy the additive schema before enabling collaboration.

See [design 029](../design/029-workspace-collaboration.md).
