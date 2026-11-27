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
