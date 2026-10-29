/**
 * The accounts page of an administrator (records 0108 to 0112).
 *
 * One page holds the facts an administrator manages: who can make an account,
 * the mail server and the legal documents (record 0148), the reports of
 * published links (record 0119), the invitations that wait, and the accounts. A report row opens its link as any reader does, and
 * never names a note or a workspace. The one primary
 * action is Invite a person. Each account row holds one menu of the changes
 * that apply to it, and the menu hides a change that would fail, such as the
 * demotion of the last administrator (record 0110). The server refuses the
 * same change, so the menu is a courtesy and not the guarantee.
 *
 * An invitation link appears once, in the dialog that made it, when the
 * installation has no mail transport. No list row holds a link, so a read of
 * the list opens no invitation.
 *
 * Every rule of a row lives in `lib/accounts.ts` with its unit test, and
 * every server call is a generated operation.
 */
import {
  Children,
  useCallback,
  useRef,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  createInvitation,
  dismissReport,
  getInstallation,
  listAccounts,
  listInvitations,
  listReports,
  removeAccount,
  revokeInvitation,
  takeDownReportedLink,
  updateAccount,
  updateInstallation,
  type AccountControlsInput,
  type AccountSummary,
  type Installation,
  type Invitation,
  type LinkReport,
} from '@notesapp/api-client';
import {
  Button,
  Badge,
  ChevronRightIcon,
  MetaFacts,
  WrapText,
  buttonClassName,
  CopyIcon,
  Dialog,
  DialogBody,
  DialogFooter,
  ListRow,
  LoadingState,
  Menu,
  MoreIcon,
  Notice,
  PlusIcon,
  ReadOnlyField,
  SelectField,
  TextField,
  UsersIcon,
} from '@notesapp/ui';
import { problemMessage, useSession } from '../../app.tsx';
import { problemCode } from '../../lib/problem-text.ts';
import {
  SettingRow,
  SettingChoiceRow,
  SettingActionRow,
  SettingSwitchRow,
  usePhoneSettings,
} from './settings-section.tsx';
import { SettingsDialog } from './settings-dialog.tsx';
import { relativeTime } from '../../lib/relative-time.ts';
import {
  LegalDocumentsBody,
  MailSettingsBody,
} from './installation-settings.tsx';
import { useNow } from '../../shell/now.ts';
import {
  accountActionLabel,
  accountActionNotice,
  accountActions,
  accountName,
  roleWord,
  storageLine,
  enabledAdministrators,
  invitationFacts,
  missingPartsOf,
  openRegistrationMissingText,
  registrationPolicyLocked,
  registrationPolicyText,
  type AccountAction,
} from '../../lib/accounts.ts';
import {
  controlsChangeOf,
  controlsFormOf,
  type ControlsForm,
  type ControlsProblem,
} from '../../lib/account-controls.ts';
import {
  canTakeDown,
  reportFacts,
  reportNotice,
  reportReasonWord,
} from '../../lib/reports.ts';

export type AdministrationPage = 'accounts' | 'mail' | 'legal' | 'reports';

function AdminDialog(props: ComponentProps<typeof Dialog>): ReactNode {
  const phone = usePhoneSettings();
  return phone ? (
    <SettingsDialog {...props} hideScope />
  ) : (
    <Dialog {...props} />
  );
}

function AdminGroup({
  title,
  count,
  danger = false,
  toolbar,
  children,
}: {
  readonly title?: string;
  readonly count?: string;
  readonly danger?: boolean;
  readonly toolbar?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  if (Children.toArray(children).length === 0) return null;
  return (
    <section className="ui-settings-group">
      {title === undefined ? null : (
        <div className="ui-settings-group-heading ui-group-toolbar">
          <h3
            className={`m-0 min-w-0 flex-1 text-group ${danger ? 'text-danger' : 'text-muted'}`}
          >
            {title}
          </h3>
          {count === undefined ? null : (
            <span className="ui-group-count text-secondary text-muted">
              {count}
            </span>
          )}
          {toolbar}
        </div>
      )}
      <div className="ui-settings-card">{children}</div>
    </section>
  );
}

/** How far the read of the page got. */
type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly installation: Installation;
      readonly invitations: readonly Invitation[];
      readonly accounts: readonly AccountSummary[];
      readonly reports: readonly LinkReport[];
    };

/** The dialog that is open, if any. */
type OpenDialog =
  | { readonly kind: 'none' }
  | { readonly kind: 'invite' }
  | { readonly kind: 'controls'; readonly account: AccountSummary }
  | { readonly kind: 'remove'; readonly account: AccountSummary }
  | { readonly kind: 'role'; readonly account: AccountSummary }
  | {
      readonly kind: 'state';
      readonly account: AccountSummary;
      readonly action: 'disable' | 'enable';
    };

/** Administration is available only inside an administrator's Settings. */
export function AdministrationSettings({
  page,
}: {
  readonly page: AdministrationPage;
}): ReactNode {
  const session = useSession();
  return session.account?.installationRole === 'administrator' ? (
    <AccountsPage page={page} />
  ) : null;
}

/** The three sections of the page and their dialogs. */
function AccountsPage({
  page,
}: {
  readonly page: AdministrationPage;
}): ReactNode {
  const phone = usePhoneSettings();
  const detailOpener = useRef<HTMLButtonElement | null>(null);
  const [detail, setDetail] = useState<AccountSummary | null>(null);
  const now = useNow();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [generation, setGeneration] = useState(0);
  const [dialog, setDialog] = useState<OpenDialog>({ kind: 'none' });
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback((): void => {
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      const [installation, invitations, accounts, reports] = await Promise.all([
        getInstallation(),
        listInvitations(),
        listAccounts(),
        listReports(),
      ]);
      if (cancelled) return;
      if (installation.data === undefined)
        return setState({
          kind: 'failed',
          message: problemMessage(installation.error),
        });
      if (invitations.data === undefined)
        return setState({
          kind: 'failed',
          message: problemMessage(invitations.error),
        });
      if (accounts.data === undefined)
        return setState({
          kind: 'failed',
          message: problemMessage(accounts.error),
        });
      if (reports.data === undefined)
        return setState({
          kind: 'failed',
          message: problemMessage(reports.error),
        });
      setState({
        kind: 'ready',
        installation: installation.data,
        invitations: invitations.data.invitations,
        accounts: accounts.data.accounts,
        reports: reports.data.reports,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [generation]);

  /** Runs one change, then reads the page again and states the outcome. */
  const change = (
    run: () => Promise<{ readonly error?: unknown }>,
    success: string,
  ): void => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setFailure('');
    void run().then((result) => {
      setBusy(false);
      if (result.error !== undefined) {
        setFailure(problemMessage(result.error));
        return;
      }
      setDialog({ kind: 'none' });
      if (dialog.kind === 'remove') setDetail(null);
      setNotice(success);
      reload();
    });
  };

  /**
   * Changes who can make an account (record 0114). A refused open policy
   * names each part that the installation lacks.
   */
  const changePolicy = (policy: 'invitation' | 'open'): void => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setFailure('');
    void updateInstallation({ body: { registrationPolicy: policy } }).then(
      (result) => {
        setBusy(false);
        if (result.error !== undefined) {
          setFailure(
            problemCode(result.error) === 'open_registration_unavailable'
              ? openRegistrationMissingText(missingPartsOf(result.error))
              : problemMessage(result.error),
          );
          return;
        }
        setNotice(
          policy === 'open'
            ? 'Anybody can sign up now. Each new account proves its address first.'
            : 'A new account needs an invitation now.',
        );
        reload();
      },
    );
  };

  const runAction = (account: AccountSummary, action: AccountAction): void => {
    const name = accountName(account);
    if (action === 'change-controls') {
      setFailure('');
      setDialog({ kind: 'controls', account });
      return;
    }
    if (action === 'remove') {
      setDialog({ kind: 'remove', account });
      return;
    }
    const body =
      action === 'make-administrator'
        ? { installationRole: 'administrator' as const }
        : action === 'make-member'
          ? { installationRole: 'member' as const }
          : action === 'disable'
            ? { state: 'disabled' as const }
            : { state: 'enabled' as const };
    change(
      () => updateAccount({ path: { accountId: account.accountId }, body }),
      accountActionNotice(action, name),
    );
  };

  const selected =
    state.kind === 'ready' && detail !== null
      ? (state.accounts.find(
          (account) => account.accountId === detail.accountId,
        ) ?? detail)
      : detail;
  const closeDialog = (): void => {
    setDialog({ kind: 'none' });
  };
  return (
    <div className="ui-settings-groups">
      {notice === '' ? null : <Notice tone="success" message={notice} />}
      {failure === '' ? null : <Notice tone="problem" message={failure} />}
      {state.kind === 'loading' ? (
        <LoadingState
          shape="list"
          rows={3}
          label="Reading administration settings"
        />
      ) : state.kind === 'failed' ? (
        <Notice tone="problem" message={state.message}>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </Notice>
      ) : (
        <>
          {page === 'accounts' ? (
            <>
              <AdminGroup title="Sign-up">
                <SettingSwitchRow
                  label="Let anybody sign up"
                  help={
                    registrationPolicyLocked(
                      state.installation.registrationPolicySource,
                    )
                      ? 'Set by the server configuration.'
                      : registrationPolicyText(
                          state.installation.registrationPolicy,
                          state.installation.registrationPolicySource,
                        )
                  }
                  checked={state.installation.registrationPolicy === 'open'}
                  disabled={
                    busy ||
                    registrationPolicyLocked(
                      state.installation.registrationPolicySource,
                    )
                  }
                  onChange={(open) =>
                    changePolicy(open ? 'open' : 'invitation')
                  }
                />
              </AdminGroup>
              <AdminGroup
                title="Invitations"
                toolbar={
                  phone ? null : (
                    <Button
                      variant="secondary"
                      icon={<PlusIcon />}
                      onClick={() => setDialog({ kind: 'invite' })}
                    >
                      Invite a person
                    </Button>
                  )
                }
              >
                <ul className="ui-settings-items">
                  {state.invitations.length === 0 ? (
                    <li className="ui-settings-empty text-secondary text-muted">
                      No invitation waits.
                    </li>
                  ) : (
                    state.invitations.map((invitation) => (
                      <ListRow key={invitation.invitationId}>
                        <div className="ui-settings-copy">
                          <p className="m-0 break-words text-body text-strong">
                            {invitation.email}
                          </p>
                          <MetaFacts
                            className="ui-settings-meta"
                            facts={invitationFacts(invitation, now)}
                          />
                        </div>
                        <Button
                          variant="secondary"
                          label={`Revoke the invitation of ${invitation.email}`}
                          disabled={busy}
                          onClick={() =>
                            change(
                              () =>
                                revokeInvitation({
                                  path: {
                                    invitationId: invitation.invitationId,
                                  },
                                }),
                              `The invitation of ${invitation.email} is revoked.`,
                            )
                          }
                        >
                          Revoke
                        </Button>
                      </ListRow>
                    ))
                  )}
                  {phone ? (
                    <li>
                      <SettingActionRow
                        label="+ Invite a person"
                        actionLabel="Invite a person"
                        onClick={() => setDialog({ kind: 'invite' })}
                      />
                    </li>
                  ) : null}
                </ul>
              </AdminGroup>
              <AdminGroup
                title="Accounts"
                count={String(state.accounts.length)}
              >
                <ul className="ui-settings-items">
                  {state.accounts.map((account) => {
                    const name = accountName(account),
                      actions = accountActions(
                        account,
                        enabledAdministrators(state.accounts),
                      );
                    const content = (
                      <>
                        <span
                          className="inline-flex shrink-0 text-muted"
                          aria-hidden="true"
                        >
                          <UsersIcon />
                        </span>
                        <div className="ui-settings-copy">
                          <p className="m-0 flex flex-wrap items-center gap-2 text-body text-strong">
                            <span>{name}</span>
                            {account.installationRole === 'administrator' ? (
                              <Badge>Administrator</Badge>
                            ) : null}
                            {account.state === 'disabled' ? (
                              <Badge>Disabled</Badge>
                            ) : null}
                          </p>
                          <MetaFacts
                            className="ui-settings-meta"
                            facts={[
                              ...(account.email && account.email !== name
                                ? [account.email]
                                : []),
                              storageLine(account.storage),
                              account.lastActiveAt === null
                                ? 'Not signed in'
                                : `Active ${relativeTime(account.lastActiveAt, now)}`,
                            ].filter(Boolean)}
                          />
                        </div>
                      </>
                    );
                    return phone ? (
                      <li key={account.accountId}>
                        <button
                          type="button"
                          className="ui-settings-row flex w-full text-left text-body text-strong"
                          aria-label={`Account: ${name}`}
                          onClick={(event) => {
                            detailOpener.current = event.currentTarget;
                            setDetail(account);
                            setFailure('');
                          }}
                        >
                          {content}
                          <ChevronRightIcon />
                        </button>
                      </li>
                    ) : (
                      <ListRow key={account.accountId}>
                        {content}
                        <Menu
                          label={`Change the account of ${name}`}
                          icon={<MoreIcon />}
                          compact
                          items={actions.map((action) => ({
                            id: action,
                            label: accountActionLabel(action),
                            danger: action === 'remove',
                            disabled: busy,
                            onSelect: () => runAction(account, action),
                          }))}
                        />
                      </ListRow>
                    );
                  })}
                </ul>
              </AdminGroup>
            </>
          ) : null}
          {page === 'mail' ? (
            <MailSettingsBody mail={state.installation.mail} onSaved={reload} />
          ) : null}
          {page === 'legal' ? (
            <LegalDocumentsBody
              legal={state.installation.legalDocuments}
              onSaved={reload}
            />
          ) : null}
          {page === 'reports' ? (
            <AdminGroup>
              <ul className="ui-settings-items">
                {state.reports.length === 0 ? (
                  <li className="ui-settings-empty text-secondary text-muted">
                    No report waits.
                  </li>
                ) : (
                  state.reports.map((report) => (
                    <ListRow key={report.reportId} className="flex-wrap">
                      <div className="ui-settings-copy">
                        <p className="m-0 text-body text-strong">
                          {reportReasonWord(report.reason)}
                        </p>
                        <MetaFacts
                          className="ui-settings-meta"
                          facts={reportFacts(report, now)}
                        />
                        {report.note === null ? null : (
                          <p className="m-0 text-secondary text-muted">
                            <WrapText>{report.note}</WrapText>
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-cluster">
                        {report.address === null ? null : (
                          <a
                            className={buttonClassName({
                              variant: phone ? 'ghost' : 'secondary',
                            })}
                            href={report.address}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open link
                          </a>
                        )}
                        {canTakeDown(report) ? (
                          <Button
                            variant="secondary"
                            tone="danger"
                            disabled={busy}
                            onClick={() =>
                              change(
                                () =>
                                  takeDownReportedLink({
                                    path: { reportId: report.reportId },
                                  }),
                                reportNotice('take-down'),
                              )
                            }
                          >
                            Take down
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            change(
                              () =>
                                dismissReport({
                                  path: { reportId: report.reportId },
                                }),
                              reportNotice('close'),
                            )
                          }
                        >
                          Close
                        </Button>
                      </div>
                    </ListRow>
                  ))
                )}
              </ul>
            </AdminGroup>
          ) : null}
        </>
      )}
      {selected !== null && dialog.kind === 'none' && state.kind === 'ready' ? (
        <SettingsDialog
          open
          title={accountName(selected)}
          titleId="account-detail-title"
          returnFocus={() => detailOpener.current?.focus()}
          hideScope
          onClose={() => setDetail(null)}
        >
          <DialogBody>
            <div className="ui-settings-groups">
              <AdminGroup title="Account">
                <SettingRow label="Email">
                  <span className="text-value text-muted">
                    {selected.email ?? 'No address linked'}
                  </span>
                </SettingRow>
                <SettingChoiceRow
                  label="Role"
                  help=""
                  value={roleWord(selected.installationRole)}
                  onClick={() => setDialog({ kind: 'role', account: selected })}
                />
                <SettingChoiceRow
                  label="Limits and access"
                  help={`${storageLine(selected.storage)} · Teams ${selected.controls.features.teams ? 'on' : 'off'}`}
                  value=""
                  onClick={() =>
                    setDialog({ kind: 'controls', account: selected })
                  }
                />
                <SettingRow label="Last active">
                  <span className="text-value text-muted">
                    {selected.lastActiveAt === null
                      ? 'Not signed in'
                      : relativeTime(selected.lastActiveAt, now)}
                  </span>
                </SettingRow>
              </AdminGroup>
              <AdminGroup title="Danger zone" danger>
                {accountActions(selected, enabledAdministrators(state.accounts))
                  .filter(
                    (action) =>
                      action === 'disable' ||
                      action === 'enable' ||
                      action === 'remove',
                  )
                  .map((action) => (
                    <SettingActionRow
                      key={action}
                      danger
                      label={`${action === 'remove' ? 'Delete account' : action === 'disable' ? 'Disable account' : 'Enable account'}…`}
                      actionLabel={accountActionLabel(action)}
                      help={
                        action === 'remove'
                          ? `Deletes every workspace and note of ${accountName(selected)} for good.`
                          : action === 'disable'
                            ? 'The person cannot sign in. You can enable the account again.'
                            : undefined
                      }
                      onClick={() =>
                        setDialog(
                          action === 'remove'
                            ? { kind: 'remove', account: selected }
                            : { kind: 'state', account: selected, action },
                        )
                      }
                    />
                  ))}
              </AdminGroup>
            </div>
          </DialogBody>
        </SettingsDialog>
      ) : null}
      {dialog.kind === 'invite' && state.kind === 'ready' ? (
        <InviteDialog
          mailConfigured={state.installation.mailConfigured}
          lifetimeHours={state.installation.invitationLifetimeHours}
          onClose={() => {
            closeDialog();
            reload();
          }}
        />
      ) : null}
      {dialog.kind === 'controls' ? (
        <ControlsDialog
          account={dialog.account}
          now={now}
          busy={busy}
          failure={failure}
          onClose={closeDialog}
          onSave={(controls) =>
            change(
              () =>
                updateAccount({
                  path: { accountId: dialog.account.accountId },
                  body: { controls },
                }),
              `The limits and access of ${accountName(dialog.account)} are changed.`,
            )
          }
        />
      ) : null}
      {dialog.kind === 'role' && state.kind === 'ready' ? (
        <RoleDialog
          account={dialog.account}
          administrators={enabledAdministrators(state.accounts)}
          busy={busy}
          failure={failure}
          onClose={closeDialog}
          onSave={(role) =>
            change(
              () =>
                updateAccount({
                  path: { accountId: dialog.account.accountId },
                  body: { installationRole: role },
                }),
              'The role is changed.',
            )
          }
        />
      ) : null}
      {dialog.kind === 'state' ? (
        <AdminDialog
          open
          title={`${dialog.action === 'disable' ? 'Disable' : 'Enable'} ${accountName(dialog.account)}?`}
          titleId="account-state-title"
          onClose={closeDialog}
        >
          <DialogBody>
            <p className="m-0 text-body text-strong">
              {dialog.action === 'disable'
                ? 'The person is signed out and cannot sign in. You can enable the account again.'
                : 'The person can sign in again.'}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              tone="danger"
              disabled={busy}
              onClick={() => runAction(dialog.account, dialog.action)}
            >
              {dialog.action === 'disable'
                ? 'Disable account'
                : 'Enable account'}
            </Button>
          </DialogFooter>
        </AdminDialog>
      ) : null}
      {dialog.kind === 'remove' ? (
        <AdminDialog
          open
          title={`Delete ${accountName(dialog.account)}?`}
          titleId="remove-account-title"
          onClose={closeDialog}
        >
          <DialogBody>
            <p className="m-0 text-body text-strong">
              This deletes the account and every note in its workspaces for
              good. The person is signed out on every device.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                change(
                  () =>
                    removeAccount({
                      path: { accountId: dialog.account.accountId },
                    }),
                  `${accountName(dialog.account)} is deleted.`,
                )
              }
            >
              Delete account
            </Button>
          </DialogFooter>
        </AdminDialog>
      ) : null}
    </div>
  );
}

/**
 * The dialog that invites one address.
 *
 * With a mail transport the link goes to the address and the dialog closes on
 * the next step. Without one the dialog shows the link once, with Copy, and
 * says that it does not appear again.
 */
function InviteDialog({
  mailConfigured,
  lifetimeHours,
  onClose,
}: {
  readonly mailConfigured: boolean;
  readonly lifetimeHours: number;
  readonly onClose: () => void;
}): ReactNode {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{
    readonly email: string;
    readonly link: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const days = Math.round(lifetimeHours / 24);
  const lifetime =
    lifetimeHours % 24 === 0
      ? `${String(days)} ${days === 1 ? 'day' : 'days'}`
      : `${String(lifetimeHours)} ${lifetimeHours === 1 ? 'hour' : 'hours'}`;

  const submit = (): void => {
    if (busy) return;
    setBusy(true);
    setError('');
    void createInvitation({ body: { email: email.trim() } }).then((result) => {
      setBusy(false);
      if (result.data === undefined) {
        setError(problemMessage(result.error));
        return;
      }
      setMade({ email: result.data.invitation.email, link: result.data.link });
    });
  };

  return (
    <AdminDialog
      open
      title="Invite a person"
      titleId="invite-title"
      width="medium"
      onClose={onClose}
    >
      {made === null ? (
        <form
          className="ui-dialog-form"
          onSubmit={(event): void => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody>
            <p className="mb-4 mt-0 text-secondary text-muted">
              {mailConfigured
                ? `The link goes to this address by mail. It works for ${lifetime}.`
                : `This installation sends no mail, so you get the link here and send it yourself. It works for ${lifetime}.`}
            </p>
            <TextField
              id="invite-email"
              label="Email address"
              value={email}
              inputType="email"
              autoComplete="off"
              required
              error={error}
              onChange={setEmail}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || email.trim() === ''}>
              {busy ? 'Inviting' : 'Invite'}
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <>
          <DialogBody>
            {made.link === null ? (
              <p className="m-0 text-body text-strong">
                The link went to {made.email} by mail.
              </p>
            ) : (
              <>
                <p className="mb-4 mt-0 text-body text-strong">
                  Send this link to {made.email}. It appears here once.
                </p>
                <ReadOnlyField
                  id="invite-link"
                  label="Invitation link"
                  value={made.link}
                  takeFocus
                />
              </>
            )}
          </DialogBody>
          <DialogFooter>
            {made.link === null ? null : (
              <Button
                variant="secondary"
                icon={<CopyIcon />}
                onClick={() => {
                  if (made.link === null) return;
                  void navigator.clipboard.writeText(made.link).then(
                    () => {
                      setCopied(true);
                    },
                    () => {
                      setCopied(false);
                    },
                  );
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            )}
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </>
      )}
    </AdminDialog>
  );
}

/**
 * The dialog that changes the limits and the access of one account (record
 * 0189).
 *
 * The form states each value as a person types it, and `lib/account-controls`
 * turns it into the change, with the revision that the page read. A change
 * that another administrator or the operator made first is refused, and the
 * failure says so.
 */
function ControlsDialog({
  account,
  now,
  busy,
  failure,
  onClose,
  onSave,
}: {
  readonly account: AccountSummary;
  readonly now: number;
  readonly busy: boolean;
  readonly failure: string;
  readonly onClose: () => void;
  readonly onSave: (controls: AccountControlsInput) => void;
}): ReactNode {
  const [form, setForm] = useState<ControlsForm>(() =>
    controlsFormOf(account.controls, now),
  );
  const [problem, setProblem] = useState<ControlsProblem | null>(null);
  const errorOf = (field: keyof ControlsForm): string | undefined =>
    problem?.field === field ? problem.message : undefined;
  const set = (patch: Partial<ControlsForm>): void => {
    setForm((current) => ({ ...current, ...patch }));
  };
  const administrator = account.installationRole === 'administrator';
  return (
    <AdminDialog
      open
      title="Change limits and access"
      titleId="controls-title"
      width="small"
      onClose={onClose}
    >
      <form
        className="ui-dialog-form"
        onSubmit={(event): void => {
          event.preventDefault();
          const read = controlsChangeOf(form, account.controls, now);
          if (!read.ok) {
            setProblem(read.problem);
            return;
          }
          setProblem(null);
          onSave(read.change);
        }}
      >
        <DialogBody>
          <p className="mb-4 mt-0 text-secondary text-muted">
            The limits count every workspace that {accountName(account)} owns.
            An empty limit is no limit.
          </p>
          {failure === '' ? null : (
            <Notice className="mb-4" tone="problem" message={failure} />
          )}
          <SelectField
            id="controls-standing"
            label="Access"
            value={form.standing}
            options={[
              { value: 'active', label: 'Active' },
              ...(administrator ? [] : [{ value: 'locked', label: 'Locked' }]),
            ]}
            hint={
              administrator
                ? 'An administrator is always active. Make the account a member to lock it.'
                : 'A locked account can only export its notes, delete itself, or open billing.'
            }
            onChange={(value) => {
              set({ standing: value === 'locked' ? 'locked' : 'active' });
            }}
          />
          {form.standing === 'locked' ? (
            <TextField
              id="controls-removal"
              label="Remove after this many days"
              value={form.removeInDays}
              hint="Leave it empty to keep the locked account."
              error={errorOf('removeInDays')}
              onChange={(value) => {
                set({ removeInDays: value });
              }}
            />
          ) : null}
          <TextField
            id="controls-storage"
            label="Storage limit in GB"
            hint="One GB is 1,000,000,000 bytes. Existing byte limits stay unchanged."
            value={form.storageGigabytes}
            required
            error={errorOf('storageGigabytes')}
            onChange={(value) => {
              set({ storageGigabytes: value });
            }}
          />
          <TextField
            id="controls-text"
            label="Text and history limit in GB"
            value={form.textGigabytes}
            error={errorOf('textGigabytes')}
            onChange={(value) => {
              set({ textGigabytes: value });
            }}
          />
          <TextField
            id="controls-transfer"
            label="Published pages each month, in GB"
            value={form.transferGigabytes}
            error={errorOf('transferGigabytes')}
            onChange={(value) => {
              set({ transferGigabytes: value });
            }}
          />
          <TextField
            id="controls-download"
            label="Downloads each month, in GB"
            value={form.downloadGigabytes}
            error={errorOf('downloadGigabytes')}
            onChange={(value) => {
              set({ downloadGigabytes: value });
            }}
          />
          <div className="ui-settings-groups">
            <AdminGroup title="Features">
              <SettingSwitchRow
                label="Teams"
                help=""
                checked={form.teams}
                disabled={busy}
                onChange={(teams) => set({ teams })}
              />
              <SettingSwitchRow
                label="Collaboration"
                help=""
                checked={form.collaboration}
                disabled={busy}
                onChange={(collaboration) => set({ collaboration })}
              />
            </AdminGroup>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}

function RoleDialog({
  account,
  administrators,
  busy,
  failure,
  onClose,
  onSave,
}: {
  readonly account: AccountSummary;
  readonly administrators: number;
  readonly busy: boolean;
  readonly failure: string;
  readonly onClose: () => void;
  readonly onSave: (role: 'administrator' | 'member') => void;
}): ReactNode {
  const [role, setRole] = useState(account.installationRole);
  const actions = accountActions(account, administrators);
  return (
    <AdminDialog
      open
      title="Role"
      titleId="account-role-title"
      onClose={onClose}
    >
      <form
        className="ui-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(role);
        }}
      >
        <DialogBody>
          <SelectField
            id="account-role"
            label="Role"
            value={role}
            options={[
              {
                value: account.installationRole,
                label: roleWord(account.installationRole),
              },
              ...(account.installationRole === 'member' &&
              actions.includes('make-administrator')
                ? [{ value: 'administrator', label: 'Administrator' }]
                : []),
              ...(account.installationRole === 'administrator' &&
              actions.includes('make-member')
                ? [{ value: 'member', label: 'Member' }]
                : []),
            ]}
            onChange={(value) =>
              setRole(value === 'administrator' ? 'administrator' : 'member')
            }
          />
          {failure === '' ? null : <Notice tone="problem" message={failure} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || role === account.installationRole}
          >
            Save
          </Button>
        </DialogFooter>
      </form>
    </AdminDialog>
  );
}
