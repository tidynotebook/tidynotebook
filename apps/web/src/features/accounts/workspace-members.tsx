import { useEffect, useState, type ReactNode } from 'react';
import {
  createWorkspaceInvites,
  listWorkspaceInvites,
  listWorkspaceMembers,
  readWorkspaceInviteLink,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  updateWorkspaceMemberRole,
  type PendingWorkspaceInvite,
  type Role,
  type WorkspaceInviteResult,
  type WorkspaceInviteRole,
  type WorkspaceMember,
} from '@notesapp/api-client';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Form,
  IdentityMark,
  ListRow,
  LoadingState,
  Menu,
  Notice,
  Pill,
  SectionHeading,
  SelectField,
  Stack,
  TextAreaField,
  type MenuItem,
} from '@notesapp/ui';
import { problemMessage, useSession, useWorkspace } from '../../app.tsx';
import { initialOf } from '../../lib/initial.ts';

const roles: readonly WorkspaceInviteRole[] = ['admin', 'editor', 'viewer'];

export function roleName(role: Role): string {
  return role === 'owner'
    ? 'Owner'
    : role === 'admin'
      ? 'Admin'
      : role === 'editor'
        ? 'Editor'
        : 'Viewer';
}

export function WorkspaceMembers({
  workspaceId,
  workspaceName,
  role,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: Role;
}): ReactNode {
  const manage = role === 'owner' || role === 'admin';
  const ownId = useSession().account?.accountId;
  const workspace = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [invites, setInvites] = useState<PendingWorkspaceInvite[]>([]);
  const [count, setCount] = useState(0);
  const [after, setAfter] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removal, setRemoval] = useState<WorkspaceMember | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    let active = true;
    const run = async (): Promise<void> => {
      const [people, pending] = await Promise.all([
        listWorkspaceMembers({ path: { workspaceId } }),
        manage ? listWorkspaceInvites({ path: { workspaceId } }) : null,
      ]);
      if (!active) return;
      if (people.data === undefined) {
        setProblem(problemMessage(people.error));
        return;
      }
      setMembers(people.data.members);
      setCount(people.data.memberCount);
      setAfter(people.data.nextAfterAccountId);
      setInvites(pending?.data?.invitations ?? []);
      if (pending !== null && pending.data === undefined)
        setProblem(problemMessage(pending.error));
    };
    void run().catch(() => {
      if (active) setProblem('Members could not load.');
    });
    return () => {
      active = false;
    };
  }, [manage, revision, workspaceId, workspace.state]);

  const copy = async (invitationId: string): Promise<void> => {
    const response = await readWorkspaceInviteLink({
      path: { workspaceId, invitationId },
    });
    if (response.data === undefined) {
      setProblem(problemMessage(response.error));
      return;
    }
    try {
      await navigator.clipboard.writeText(response.data.url);
      setNotice('Invitation link copied.');
    } catch {
      setProblem('The link could not be copied.');
    }
  };

  function memberMenu(member: WorkspaceMember): MenuItem[] {
    const options: MenuItem[] = roles.map((next) => ({
      id: next,
      label: roleName(next),
      selected: next === member.role,
      onSelect: () => {
        void updateWorkspaceMemberRole({
          path: { workspaceId, accountId: member.accountId },
          body: { role: next },
        }).then((response) => {
          if (response.data === undefined)
            setProblem(problemMessage(response.error));
          else {
            refresh();
            if (member.accountId === ownId) workspace.reload();
          }
        });
      },
    }));
    if (member.accountId !== ownId)
      options.push({
        id: 'remove',
        label: 'Remove from workspace',
        danger: true,
        onSelect: () => setRemoval(member),
      });
    return options;
  }

  return (
    <Stack gap={6}>
      {problem === '' ? null : <Notice tone="problem" message={problem} />}
      {notice === '' ? null : <Notice message={notice} />}
      {manage ? (
        <Stack gap={2}>
          <SectionHeading
            label="Pending invites"
            count={invites.length}
            divider
            action={
              <Button
                variant="primary"
                size="compact"
                onClick={() => setInviteOpen(true)}
              >
                Invite people
              </Button>
            }
          />
          {invites.map((invite) => (
            <ListRow
              key={invite.invitationId}
              label={invite.email}
              help={`${roleName(invite.role)}. Expires ${new Date(invite.expiresAt).toLocaleDateString()}.`}
              leading={<IdentityMark>?</IdentityMark>}
              control={
                <Menu
                  label={`Actions for ${invite.email}`}
                  items={[
                    {
                      id: 'copy',
                      label: 'Copy link',
                      onSelect: () => {
                        void copy(invite.invitationId);
                      },
                    },
                    {
                      id: 'revoke',
                      label: 'Revoke',
                      danger: true,
                      onSelect: () => {
                        void revokeWorkspaceInvite({
                          path: {
                            workspaceId,
                            invitationId: invite.invitationId,
                          },
                        }).then((result) => {
                          if (result.data === undefined)
                            setProblem(problemMessage(result.error));
                          else refresh();
                        });
                      },
                    },
                  ]}
                />
              }
            />
          ))}
        </Stack>
      ) : null}
      <Stack gap={2}>
        <SectionHeading label="Members" count={count} divider />
        {members === null ? (
          <LoadingState label="Loading members" />
        ) : (
          members.map((member) => (
            <ListRow
              key={member.accountId}
              label={member.displayName ?? member.email}
              leading={
                <IdentityMark>
                  {initialOf(member.displayName ?? member.email)}
                </IdentityMark>
              }
              help={member.displayName === null ? undefined : member.email}
              control={
                manage && member.role !== 'owner' ? (
                  <Menu
                    label={`Role for ${member.displayName ?? member.email}`}
                    items={memberMenu(member)}
                  >
                    {roleName(member.role)}
                  </Menu>
                ) : (
                  <Pill>{roleName(member.role)}</Pill>
                )
              }
            />
          ))
        )}
        {after === null ? null : (
          <Button
            variant="secondary"
            onClick={() => {
              void listWorkspaceMembers({
                path: { workspaceId },
                query: { afterAccountId: after },
              }).then((result) => {
                if (result.data === undefined)
                  setProblem(problemMessage(result.error));
                else {
                  const page = result.data;
                  setMembers((items) => [...(items ?? []), ...page.members]);
                  setAfter(page.nextAfterAccountId);
                }
              });
            }}
          >
            Show more members
          </Button>
        )}
      </Stack>
      {inviteOpen ? (
        <InvitePeople
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          copy={copy}
          close={() => {
            setInviteOpen(false);
            refresh();
          }}
        />
      ) : null}
      {removal === null ? null : (
        <Dialog
          open
          titleId="remove-workspace-member-title"
          title="Remove from workspace"
          onClose={() => setRemoval(null)}
        >
          <DialogBody>
            <Notice
              message={`${removal.displayName ?? removal.email} will lose access to ${workspaceName}.`}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRemoval(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void removeWorkspaceMember({
                  path: { workspaceId, accountId: removal.accountId },
                })
                  .then((result) => {
                    if (result.data === undefined)
                      setProblem(problemMessage(result.error));
                    else {
                      setRemoval(null);
                      refresh();
                    }
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </Stack>
  );
}

function InvitePeople({
  workspaceId,
  workspaceName,
  copy,
  close,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly copy: (id: string) => Promise<void>;
  readonly close: () => void;
}): ReactNode {
  const [input, setInput] = useState('');
  const [role, setRole] = useState<WorkspaceInviteRole>('editor');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [results, setResults] = useState<WorkspaceInviteResult[] | null>(null);
  const emails = input.split(/[\s,]+/u).filter(Boolean);
  async function submit() {
    setBusy(true);
    setProblem('');
    try {
      const result = await createWorkspaceInvites({
        path: { workspaceId },
        body: { emails, role },
      });
      if (result.data === undefined) setProblem(problemMessage(result.error));
      else setResults(result.data.results);
    } catch {
      setProblem('Invitations could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      titleId="invite-workspace-people-title"
      title={
        results === null
          ? `Invite people to ${workspaceName}`
          : 'Invitation results'
      }
      onClose={close}
    >
      <Form
        regions
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <DialogBody>
          {results === null ? (
            <Stack gap={3}>
              <TextAreaField
                id="workspace-invite-emails"
                label="Email addresses"
                value={input}
                onChange={setInput}
                hint="Enter up to 20 addresses. Use a comma or a new line between addresses."
              />
              <SelectField
                id="workspace-invite-role"
                label="Role"
                value={role}
                options={roles.map((choice) => ({
                  value: choice,
                  label: roleName(choice),
                }))}
                onChange={(value) => {
                  const next = roles.find((choice) => choice === value);
                  if (next !== undefined) setRole(next);
                }}
              />
              <Notice message="The link works for 7 days. Copy it if the server cannot send email." />
            </Stack>
          ) : (
            results.map((result, index) => (
              <ListRow
                key={`${result.email}:${index}`}
                label={result.email}
                help={
                  result.outcome === 'pending_invite'
                    ? 'Already invited. Copy the link to send it again.'
                    : result.outcome === 'already_member'
                      ? 'Already a member.'
                      : result.outcome === 'pending_limit'
                        ? 'This workspace has too many pending invites.'
                        : result.delivery === 'sent'
                          ? 'Email sent.'
                          : 'Invite created. Copy the link to send it.'
                }
                control={
                  result.invitationId === undefined ? undefined : (
                    <Button
                      size="compact"
                      variant="secondary"
                      onClick={() => {
                        if (result.invitationId !== undefined)
                          void copy(result.invitationId);
                      }}
                    >
                      Copy link
                    </Button>
                  )
                }
              />
            ))
          )}
          {problem === '' ? null : <Notice tone="problem" message={problem} />}
        </DialogBody>
        <DialogFooter>
          {results === null ? (
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || emails.length === 0 || emails.length > 20}
              >
                {emails.length === 1
                  ? 'Send invite'
                  : `Send ${emails.length} invites`}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          )}
        </DialogFooter>
      </Form>
    </Dialog>
  );
}
