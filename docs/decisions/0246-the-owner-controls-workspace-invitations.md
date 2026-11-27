# 0246. The owner controls workspace invitations

- Status: Accepted
- Date: 2026-11-27

The workspace uses the collaboration switch of its owner account. The
switch of the person who sends or accepts an invitation has no effect.

When the switch is off, invitation creation and acceptance return
`collaboration_off` with HTTP 403. This also applies to sign-up from a
workspace invite. The invite stays pending and still expires at its normal
time. Owners and admins can list, copy and revoke pending invites. Invitees
can decline them. Current members keep their roles and live editing. Owners
and admins can still change roles and remove members.

When the switch is on, invitation rules stay the same. The database locks
the owner's account row until an invitation write commits. The existing
account controls hint refreshes open Members pages and signed-in invitees.

An optional member limit covers all workspaces of the owner account. The
owner uses one displayed seat outside that limit. Each other account uses
one place, even if it belongs to several of those workspaces. Each distinct
address with an open invitation uses one place unless its account already
uses one. Null means no limit and is the default. A limit change uses the
same controls revision as the collaboration switch.

Creation checks the whole batch under the owner account lock. A batch that
would exceed the limit makes no invitations and returns `member_limit`
with HTTP 403 and the number of free places. Acceptance checks the count
after replacing the reservation with membership. A refusal keeps the
invitation open. Lowering a limit keeps existing members active.

The operator feed records each membership addition and removal in the
same transaction. The event names the owner, member, workspace and the
number of memberships that the member holds with that owner after the
change. A role change does not produce a membership event.
