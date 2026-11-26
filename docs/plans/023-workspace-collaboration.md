# Workspace collaboration implementation plan

The work stays in one PR on `feat/workspace-collaboration`. The
[design](../design/029-workspace-collaboration.md) owns the behavior.

## M1. Design review

- Copy the approved mock-ups into the worktree's ignored local files.
- Write the design and decision records. Change OpenAPI and AsyncAPI first
  and run `pnpm generate`.
- Check contract lint, generated files, document links, and the diff.
- Open a draft PR and stop for manager review. The draft introduces contract
  operations and frame kinds before their consumers. Type checks and
  handler coverage require those consumers. Add them after approval.

## M2. Workspace access and invitations

- Migrate the role enum before using the new values in functions or policies.
  Add the owner constraint, invitations, verified client ID bindings, and
  contributor records. Update schema readiness.
- Update the authorization matrix, transport grants, RLS and functions.
  Audit all note, workspace, import, attachment, publication, Trash and
  operator paths. Preserve quota enforcement under concurrent writes from
  multiple workspaces of the same owner.
- Register the generated handlers. Use the shared mail renderer and account
  registration flow. Add feed records and account invalidation for access
  changes. Connect room authorization to that invalidation.
- Test scope and role intersection, bypass of use cases with the runtime
  database role, owner and last-workspace invariants, shared quota, roster
  privacy, mail fallback, token binding and expiry. Drive accept, revoke,
  leave and removal races in PostgreSQL. Test two tabs, a sign-up race, and
  invite-only registration. Test live room authorization and eviction with
  real listening WebSockets as the room server lands.

## M3. Workspace screens and local recovery

- Compose Members, Invite, and Join with shared components. Add pending
  invites, accept, decline, leave, and removal recovery to the switcher.
- Apply read-only capability to the editor, commands and note actions.
  Implement role change and cache recovery before clearing workspace data.
  Show the owner the number of other members who lose access on deletion.
- Add contributor names and Former member to History.
- Test viewer navigation and blocked actions, long addresses, keyboard
  access, wrong-account sign-in and return, cached draft and frozen queue
  recovery, reload, and two-tab recovery. Cover both pointer densities.

## M4. Live notes

- Extend the socket, account coordinator, authorization and cross-server
  relay. Add room lifecycle, document validation, proof attribution,
  backpressure and presence. Keep all Yjs values inside their package
  boundary. Apply remote updates through the same editor instance.
- Test real cross-gateway fan-out and removal, stale membership, spoofed
  identity, client ID collision, role downgrade, delete-only authorship,
  proof replay and wrong note, listener failure, limits, and HTTP fallback.
- In a browser test, use two accounts in separate contexts. Type at the
  same time, check both edits in both views, check avatars and remote
  cursors, disconnect one context, and prove both texts converge on
  reconnect. Reload and prove the saved text and contributor list remain.
  Check that remote input neither enters local undo nor starts a save.

## M5. Verify and prepare the PR

- Commit the changes. Use the test-application skill for one fresh local
  Docker deployment. Check all changed screens at desktop and phone widths,
  in both themes. Inspect the phone editor and presence sheet, role change,
  reconnecting and offline footer, and wrong-account and unavailable invites.
- Upload relevant screenshots to `pr-screenshots` using the repository
  convention. Run `pnpm verify` once at the end. Fix failures and rerun
  the failed checks.
- Review the full diff. Update the PR with verification, screenshots and
  compatibility effects. Mark it ready when review and Check permit. Leave
  the Docker deployment running for review and report its URL and test
  accounts. The owner merges after review. Cleanup follows merge.
