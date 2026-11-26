import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  createWorkspaceInvites,
  getSetupStatus,
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
  AlertCircleIcon,
  Button,
  Card,
  CheckIcon,
  ChevronDownIcon,
  Dialog,
  DialogBody,
  DialogFooter,
  FixedDialogLayout,
  Form,
  IconSlot,
  InfoIcon,
  Inline,
  PresenceAvatar,
  ListRow,
  LoadingState,
  Menu,
  MoreIcon,
  Notice,
  Pill,
  SectionHeading,
  SelectField,
  Stack,
  TextAreaField,
  type MenuItem,
} from '@notesapp/ui';
import { problemMessage, useSession, useWorkspace } from '../../app.tsx';
import { normalizeEmail, presenceColorSlot } from '@notesapp/core';
import { relativeTime } from '../../lib/relative-time.ts';
import { useNow } from '../../shell/now.ts';
import { initialOf } from '../../lib/initial.ts';
import { SettingsDialog } from './settings-dialog.tsx';
import { usePhoneSettings } from './settings-section.tsx';

const roles: readonly WorkspaceInviteRole[] = ['admin', 'editor', 'viewer'];
const roleHelp = {
  admin: 'Admins can edit notes and manage members.',
  editor: 'Editors can read and edit notes. They cannot manage members.',
  viewer: 'Viewers can read notes and their history.',
};

function badAddresses(addresses: readonly string[]): string[] {
  const field = document.createElement('input');
  field.type = 'email';
  return [...new Set(addresses)].filter((address) => {
    field.value = address;
    return normalizeEmail(address) === null || !field.validity.valid;
  });
}

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
  phoneFooter,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: Role;
  readonly phoneFooter: HTMLElement | null;
}): ReactNode {
  const now = useNow();
  const phone = usePhoneSettings();
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
  const [rolePicker, setRolePicker] = useState<WorkspaceMember | null>(null);
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

  function changeRole(
    member: WorkspaceMember,
    next: WorkspaceInviteRole,
  ): void {
    setRolePicker(null);
    if (next === member.role) return;
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
  }

  function memberMenu(member: WorkspaceMember): MenuItem[] {
    const options: MenuItem[] = roles.map((next) => ({
      id: next,
      label: roleName(next),
      detail: roleHelp[next],
      selected: next === member.role,
      onSelect: () => changeRole(member, next),
    }));
    if (member.accountId !== ownId)
      options.push({
        id: 'remove',
        label: 'Remove from workspace',
        danger: true,
        group: 'Danger',
        onSelect: () => setRemoval(member),
      });
    return options;
  }

  return (
    <Stack gap={6}>
      {problem === '' ? null : <Notice tone="problem" message={problem} />}
      {notice === '' ? null : <Notice message={notice} />}
      {manage ? (
        <Inline gap={3} justify="between" align="center">
          <p className="text-secondary text-muted">
            Owners and admins can invite people and change roles.
          </p>
          <div className="hidden lg:block">
            <Button
              variant="primary"
              size="compact"
              onClick={() => setInviteOpen(true)}
            >
              Invite people
            </Button>
          </div>
        </Inline>
      ) : null}
      {manage ? (
        <Stack gap={2}>
          <SectionHeading
            label="Pending invites"
            count={invites.length}
            divider
          />
          {invites.length === 0 ? (
            <p className="text-secondary text-muted">No pending invites.</p>
          ) : (
            <Card responsive>
              {invites.map((invite) => {
                const copyLink = () => {
                  void copy(invite.invitationId);
                };
                const revoke = () => {
                  void revokeWorkspaceInvite({
                    path: { workspaceId, invitationId: invite.invitationId },
                  }).then((result) => {
                    if (result.data === undefined)
                      setProblem(problemMessage(result.error));
                    else refresh();
                  });
                };
                return (
                  <ListRow
                    key={invite.invitationId}
                    label={invite.email}
                    help={`Invited by ${invite.inviterName ?? 'a workspace member'} · Expires ${relativeTime(invite.expiresAt, now)}`}
                    leading={<PresenceAvatar pending>?</PresenceAvatar>}
                    control={
                      <Inline gap={2} align="center">
                        <Pill>{roleName(invite.role)}</Pill>
                        <div className="lg:hidden">
                          <Menu
                            label={`Actions for ${invite.email}`}
                            icon={<MoreIcon />}
                            compact
                            items={[
                              {
                                id: 'copy',
                                label: 'Copy link',
                                onSelect: copyLink,
                              },
                              {
                                id: 'revoke',
                                label: 'Revoke',
                                danger: true,
                                group: 'Danger',
                                onSelect: revoke,
                              },
                            ]}
                          />
                        </div>
                        <div className="hidden lg:block">
                          <Inline gap={2}>
                            <Button
                              variant="secondary"
                              size="compact"
                              onClick={copyLink}
                            >
                              Copy link
                            </Button>
                            <Button
                              variant="ghost"
                              tone="danger"
                              size="compact"
                              onClick={revoke}
                            >
                              Revoke
                            </Button>
                          </Inline>
                        </div>
                      </Inline>
                    }
                  />
                );
              })}
            </Card>
          )}
        </Stack>
      ) : null}
      <Stack gap={2}>
        <SectionHeading label="Members" count={count} divider />
        {members === null ? (
          <LoadingState label="Loading members" />
        ) : (
          <Card responsive>
            {members.map((member) => (
              <ListRow
                key={member.accountId}
                label={`${member.displayName ?? member.email}${member.accountId === ownId ? ' (you)' : ''}`}
                leading={
                  <PresenceAvatar slot={presenceColorSlot(member.accountId)}>
                    {initialOf(member.displayName ?? member.email)}
                  </PresenceAvatar>
                }
                help={member.displayName === null ? undefined : member.email}
                control={
                  manage && member.role !== 'owner' ? (
                    phone ? (
                      <Button
                        label={`Role for ${member.displayName ?? member.email}`}
                        size="compact"
                        variant="ghost"
                        ariaHasPopup="dialog"
                        onClick={() => setRolePicker(member)}
                      >
                        {roleName(member.role)}
                        <ChevronDownIcon />
                      </Button>
                    ) : (
                      <Menu
                        label={`Role for ${member.displayName ?? member.email}`}
                        items={memberMenu(member)}
                        compact
                      >
                        {roleName(member.role)}
                        <ChevronDownIcon />
                      </Menu>
                    )
                  ) : (
                    <Pill>{roleName(member.role)}</Pill>
                  )
                }
              />
            ))}
          </Card>
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
      {manage && phone && phoneFooter !== null
        ? createPortal(
            <FixedDialogLayout phone>
              <DialogFooter column={false}>
                <Button variant="primary" onClick={() => setInviteOpen(true)}>
                  Invite people
                </Button>
              </DialogFooter>
            </FixedDialogLayout>,
            phoneFooter,
          )
        : null}
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
      {rolePicker === null ? null : (
        <SettingsDialog
          open={phone}
          hideScope
          titleId="workspace-member-role-title"
          title={`Role for ${rolePicker.displayName ?? rolePicker.email}`}
          onClose={() => setRolePicker(null)}
        >
          <DialogBody>
            <Stack gap={4}>
              <Card responsive>
                {roles.map((choice) => (
                  <ListRow
                    key={choice}
                    as="button"
                    label={roleName(choice)}
                    help={roleHelp[choice]}
                    control={
                      choice === rolePicker.role ? <CheckIcon /> : undefined
                    }
                    aria-pressed={choice === rolePicker.role}
                    onClick={() => changeRole(rolePicker, choice)}
                  />
                ))}
              </Card>
              {rolePicker.accountId === ownId ? null : (
                <Card responsive>
                  <ListRow
                    as="button"
                    label="Remove from workspace"
                    labelTone="danger"
                    onClick={() => {
                      setRemoval(rolePicker);
                      setRolePicker(null);
                    }}
                  />
                </Card>
              )}
            </Stack>
          </DialogBody>
        </SettingsDialog>
      )}
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
  const [mail, setMail] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let active = true;
    void getSetupStatus()
      .then((result) => {
        if (active && result.data !== undefined)
          setMail(result.data.passwordReset);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const emails = input.split(/[\s,]+/u).filter(Boolean);
  const invalid = badAddresses(emails);
  const validCount = emails.filter((email) => !invalid.includes(email)).length;
  const created =
    results?.filter((result) => result.outcome === 'created').length ?? 0;
  async function submit() {
    setChecked(true);
    if (invalid.length > 0 || emails.length === 0 || emails.length > 20) return;
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
    <SettingsDialog
      open
      hideScope
      titleId="invite-workspace-people-title"
      title={
        results === null
          ? `Invite people to ${workspaceName}`
          : `${created} ${created === 1 ? 'invite' : 'invites'} created`
      }
      onClose={close}
      titleDivider={false}
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
                size="growing"
                error={(checked ? invalid : [])
                  .map(
                    (address) => `“${address}” is not a valid email address.`,
                  )
                  .join('\n')}
                hint="Enter up to 20 addresses. Use a comma or a new line between addresses."
              />
              <SelectField
                id="workspace-invite-role"
                label="Role"
                value={role}
                hint={roleHelp[role]}
                options={roles.map((choice) => ({
                  value: choice,
                  label: roleName(choice),
                }))}
                onChange={(value) => {
                  const next = roles.find((choice) => choice === value);
                  if (next !== undefined) setRole(next);
                }}
              />
              {mail === null ? null : (
                <Notice
                  message={
                    mail
                      ? 'We email each person a link. The link works for 7 days. A person without an account can create one from the link.'
                      : 'This installation sends no mail, so you get the link here and send it yourself. It works for 7 days.'
                  }
                />
              )}
            </Stack>
          ) : (
            results.map((result, index) => (
              <ListRow
                key={`${result.email}:${index}`}
                label={result.email}
                leading={
                  <IconSlot
                    className={
                      result.outcome === 'created'
                        ? 'text-success'
                        : 'text-muted'
                    }
                  >
                    {result.outcome === 'created' ? (
                      <CheckIcon />
                    ) : result.outcome === 'pending_limit' ? (
                      <AlertCircleIcon />
                    ) : (
                      <InfoIcon />
                    )}
                  </IconSlot>
                }
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
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          ) : null}
          {results === null ? (
            <Button
              type="submit"
              variant="primary"
              disabled={busy || emails.length === 0 || emails.length > 20}
            >
              {validCount <= 1 ? 'Send invite' : `Send ${validCount} invites`}
            </Button>
          ) : (
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          )}
        </DialogFooter>
      </Form>
    </SettingsDialog>
  );
}
