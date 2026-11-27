import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  createWorkspaceInvites,
  getSetupStatus,
  listWorkspaceInvites,
  listWorkspaceMembers,
  previewWorkspaceInvites,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  updateWorkspaceMemberRole,
  type PendingWorkspaceInvite,
  type Role,
  type WorkspaceInviteResult,
  type WorkspaceInviteRole,
  type WorkspaceMember,
  type WorkspaceSeats,
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
  ExternalLinkIcon,
  FixedDialogLayout,
  Form,
  IconSlot,
  InfoIcon,
  Inline,
  Inset,
  PresenceAvatar,
  ListRow,
  LoadingState,
  Meter,
  Menu,
  MoreIcon,
  Notice,
  Pill,
  SectionHeading,
  SelectField,
  Stack,
  TextAreaField,
  Toast,
  buttonClassName,
  type MenuItem,
} from '@notesapp/ui';
import { problemMessage, useSession, useWorkspace } from '../../app.tsx';
import { normalizeEmail, workspacePresenceColor } from '@notesapp/core';
import { relativeTime } from '../../lib/relative-time.ts';
import { useNow } from '../../shell/now.ts';
import { initialOf } from '../../lib/initial.ts';
import { portalRoute } from '../../lib/portal.ts';
import {
  retainInviteSeatQuote,
  splitInviteAddresses,
  type InviteSeatQuote,
} from './invite-addresses.ts';
import { SettingsDialog } from './settings-dialog.tsx';
import { usePhoneSettings } from './settings-section.tsx';
import {
  CopyInviteButton,
  InviteCopyProblem,
  inviteLinkCopied,
  useWorkspaceInviteCopy,
} from './workspace-invite-copy.tsx';

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
  const { account } = useSession();
  const ownId = account?.accountId;
  const hasPortal = account?.accountPortal === true;
  const workspace = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [invites, setInvites] = useState<PendingWorkspaceInvite[]>([]);
  const [collaborationEnabled, setCollaborationEnabled] = useState<
    boolean | null
  >(null);
  const [seats, setSeats] = useState<WorkspaceSeats | null>(null);
  const collaborationOff = collaborationEnabled === false;
  const inviteDisabled = collaborationEnabled !== true;
  const [count, setCount] = useState(0);
  const [after, setAfter] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [problem, setProblem] = useState('');
  const { copy, problem: copyProblem } = useWorkspaceInviteCopy(workspaceId);
  const [phoneCopies, setPhoneCopies] = useState(0);
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
      setCollaborationEnabled(people.data.collaborationEnabled);
      setSeats(people.data.seats);
      if (!people.data.collaborationEnabled) setInviteOpen(false);
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

  useEffect(() => {
    if (phoneCopies === 0) return;
    const timeout = window.setTimeout(() => setPhoneCopies(0), 5000);
    return () => window.clearTimeout(timeout);
  }, [phoneCopies]);

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
      {copyProblem === null ? null : (
        <InviteCopyProblem problem={copyProblem} />
      )}
      {phoneCopies > 0 ? (
        <Toast key={phoneCopies} message={inviteLinkCopied} />
      ) : null}
      {seats === null ? null : (
        <WorkspaceSeatStatus seats={seats} hasPortal={hasPortal} />
      )}
      {manage && collaborationOff ? (
        <SeatNotice
          message={
            hasPortal
              ? 'Your plan does not include collaboration.'
              : 'Collaboration is turned off for this account.'
          }
          portalLabel={hasPortal ? 'See plans' : null}
        />
      ) : null}
      {manage ? (
        <Inline gap={3} justify="between" align="center">
          <p className="text-secondary text-muted">
            Owners and admins can invite people and change roles.
          </p>
          <div className="hidden lg:block">
            <Button
              variant="primary"
              size="compact"
              disabled={inviteDisabled}
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
                    data-member-row=""
                    label={<MemberEmail address={invite.email} />}
                    help={`Invited by ${invite.inviterName ?? 'a workspace member'} · Expires ${relativeTime(invite.expiresAt, now)}`}
                    leading={<PresenceAvatar pending>?</PresenceAvatar>}
                    control={
                      <Inline gap={2} align="center">
                        <Pill>{roleName(invite.role)}</Pill>
                        <div className="lg:hidden">
                          <Menu
                            label={`Actions for ${invite.email}`}
                            icon={<MoreIcon />}
                            trigger="content-edge"
                            compact
                            items={[
                              ...(collaborationOff
                                ? []
                                : [
                                    {
                                      id: 'copy',
                                      label: 'Copy link',
                                      onSelect: () => {
                                        void copy(invite.invitationId).then(
                                          (copied) => {
                                            if (copied)
                                              setPhoneCopies(
                                                (copies) => copies + 1,
                                              );
                                          },
                                        );
                                      },
                                    },
                                  ]),
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
                            {collaborationOff ? null : (
                              <CopyInviteButton
                                copy={() => copy(invite.invitationId)}
                              />
                            )}
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
            {members.map((member) => {
              const slot = member.colorSlot ?? 0;
              return (
                <ListRow
                  key={member.accountId}
                  data-member-row=""
                  label={
                    member.displayName === null ? (
                      <MemberEmail
                        address={member.email}
                        own={member.accountId === ownId}
                      />
                    ) : (
                      `${member.displayName}${member.accountId === ownId ? ' (you)' : ''}`
                    )
                  }
                  leading={
                    <PresenceAvatar
                      slot={slot}
                      color={workspacePresenceColor(slot)}
                    >
                      {initialOf(member.displayName ?? member.email)}
                    </PresenceAvatar>
                  }
                  help={
                    member.displayName === null ? undefined : (
                      <MemberEmail address={member.email} />
                    )
                  }
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
                          <Inline as="span" align="center" gap={2}>
                            {roleName(member.role)}
                            <ChevronDownIcon />
                          </Inline>
                        </Button>
                      ) : (
                        <Menu
                          label={`Role for ${member.displayName ?? member.email}`}
                          items={memberMenu(member)}
                          trigger="content-edge"
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
              );
            })}
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
                <Button
                  variant="primary"
                  disabled={inviteDisabled}
                  onClick={() => setInviteOpen(true)}
                >
                  Invite people
                </Button>
              </DialogFooter>
            </FixedDialogLayout>,
            phoneFooter,
          )
        : null}
      {inviteOpen && collaborationEnabled === true ? (
        <InvitePeople
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          seats={seats}
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
          titleDivider={false}
          describedBy="remove-workspace-member-detail"
          width="small"
          onClose={() => setRemoval(null)}
        >
          <Form
            regions
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) {
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
              }
            }}
          >
            <DialogBody>
              <Inset
                as="p"
                id="remove-workspace-member-detail"
                className="text-body text-strong"
              >
                {removal.displayName ?? removal.email} will lose access to{' '}
                {workspaceName}.
              </Inset>
              {seats !== null && removal.ownerWorkspaceMemberships === 1 ? (
                <Inset as="p">
                  {removal.displayName ?? removal.email}'s seat becomes free.
                </Inset>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setRemoval(null)}>
                Cancel
              </Button>
              <Button variant="danger" type="submit" disabled={busy}>
                Remove
              </Button>
            </DialogFooter>
          </Form>
        </Dialog>
      )}
    </Stack>
  );
}

function SeatPortalLink({ label }: { readonly label: string }): ReactNode {
  return (
    <a
      href={portalRoute}
      target="_blank"
      rel="noreferrer"
      className={buttonClassName({ variant: 'ghost', size: 'compact' })}
    >
      {label}
      <ExternalLinkIcon />
    </a>
  );
}

function SeatNotice({
  message,
  portalLabel,
}: {
  readonly message: string;
  readonly portalLabel: string | null;
}): ReactNode {
  return (
    <Notice message={message}>
      {portalLabel === null ? null : (
        <Inline padX={{ fine: 0, coarse: 4 }} className="coarse:basis-full">
          <SeatPortalLink label={portalLabel} />
        </Inline>
      )}
    </Notice>
  );
}

function WorkspaceSeatStatus({
  seats,
  hasPortal,
}: {
  readonly seats: WorkspaceSeats;
  readonly hasPortal: boolean;
}): ReactNode {
  const total = seats.memberLimit + 1;
  const used = seats.membersUsed + seats.pendingInvites + 1;
  const portal = hasPortal ? <SeatPortalLink label="Manage seats" /> : null;
  if (seats.freePlaces === 0) {
    const inUse =
      total === 1 ? 'Your seat is in use.' : `All ${total} seats are in use.`;
    return (
      <SeatNotice
        message={`${inUse} Add seats to invite more people.`}
        portalLabel={hasPortal ? 'Manage seats' : null}
      />
    );
  }
  const text = `${used} of ${total} seats used`;
  return (
    <Stack gap={2}>
      <Inline gap={2} justify="between" align="center">
        <Inline wrap gapX={1}>
          <span className="text-body text-strong whitespace-nowrap">
            {text}
          </span>
          <span className="text-secondary text-muted whitespace-nowrap">
            {seats.pendingInvites} open{' '}
            {seats.pendingInvites === 1 ? 'invite' : 'invites'}
          </span>
        </Inline>
        {portal}
      </Inline>
      <Meter trackOnly label="Seats" value={used} max={total} text={text} />
    </Stack>
  );
}

function seatShortage(free: number, needed: number): string {
  const extra = needed - free;
  return `You have ${free} free ${free === 1 ? 'seat' : 'seats'}. Remove ${extra} ${extra === 1 ? 'address' : 'addresses'}, or add seats.`;
}

function MemberEmail({
  address,
  own = false,
}: {
  readonly address: string;
  readonly own?: boolean;
}): ReactNode {
  return (
    <span className="block truncate" data-member-email="" title={address}>
      {address}
      {own ? ' (you)' : ''}
    </span>
  );
}

function InvitePeople({
  workspaceId,
  workspaceName,
  seats,
  close,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly seats: WorkspaceSeats | null;
  readonly close: () => void;
}): ReactNode {
  const [input, setInput] = useState('');
  const [role, setRole] = useState<WorkspaceInviteRole>('editor');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const { copy, problem: copyProblem } = useWorkspaceInviteCopy(workspaceId);
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
  const emails = splitInviteAddresses(input);
  const invalid = badAddresses(emails);
  const validCount = emails.filter((email) => !invalid.includes(email)).length;
  const key =
    invalid.length === 0 && emails.length > 0 && emails.length <= 20
      ? emails.join(',')
      : '';
  const memberLimit = seats?.memberLimit ?? null;
  const freePlaces = seats?.freePlaces ?? null;
  const [quote, setQuote] = useState<InviteSeatQuote | null>(null);
  useEffect(() => {
    if (memberLimit === null || key === '') return;
    let active = true;
    const timer = window.setTimeout(() => {
      void previewWorkspaceInvites({
        path: { workspaceId },
        body: { emails: key.split(','), role },
      })
        .then(({ data }) => {
          if (active)
            setQuote({
              key,
              free: data?.freePlaces ?? null,
              needed: data?.additionalPlaces ?? 0,
            });
        })
        .catch(() => {
          if (active) setQuote({ key, free: null, needed: 0 });
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key, memberLimit, freePlaces, role, workspaceId]);
  const currentQuote =
    quote?.key === key && (memberLimit !== null || quote.refused)
      ? quote
      : null;
  const shortage =
    currentQuote !== null &&
    currentQuote.free !== null &&
    currentQuote.needed > currentQuote.free
      ? seatShortage(currentQuote.free, currentQuote.needed)
      : '';
  const checking = memberLimit !== null && key !== '' && currentQuote === null;
  const created =
    results?.filter((result) => result.outcome === 'created').length ?? 0;
  async function submit() {
    setChecked(true);
    if (key === '' || shortage !== '' || checking) return;
    setBusy(true);
    setProblem('');
    try {
      const result = await createWorkspaceInvites({
        path: { workspaceId },
        body: { emails, role },
      });
      if (
        result.error?.code === 'member_limit' &&
        result.error.freePlaces !== undefined
      ) {
        const free = result.error.freePlaces;
        const needed =
          currentQuote?.needed ??
          new Set(emails.map((email) => normalizeEmail(email))).size;
        if (needed > free) setQuote({ key, free, needed, refused: true });
        else setProblem(result.error.title);
      } else if (result.data === undefined)
        setProblem(
          result.error?.code === 'collaboration_off'
            ? result.error.title
            : problemMessage(result.error),
        );
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
          {copyProblem === null ? null : (
            <InviteCopyProblem problem={copyProblem} />
          )}
          {results === null ? (
            <Stack gap={3}>
              <TextAreaField
                id="workspace-invite-emails"
                label="Email addresses"
                value={input}
                onChange={(value) => {
                  setQuote((current) => retainInviteSeatQuote(current, value));
                  setInput(value);
                }}
                size="growing"
                error={
                  shortage ||
                  (checked ? invalid : [])
                    .map(
                      (address) => `“${address}” is not a valid email address.`,
                    )
                    .join('\n')
                }
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
            results.map(({ invitationId, ...result }, index) => (
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
                  invitationId === undefined ? undefined : (
                    <CopyInviteButton copy={() => copy(invitationId)} />
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
              disabled={
                busy ||
                checking ||
                shortage !== '' ||
                emails.length === 0 ||
                emails.length > 20
              }
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
