/**
 * The accounts page of an administrator (records 0108 to 0112).
 *
 * One page holds the four facts an administrator manages: who can make an
 * account, the reports of published links (record 0119), the invitations that
 * wait, and the accounts. A report row opens its link as any reader does, and
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
import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
  type AccountSummary,
  type Installation,
  type Invitation,
  type LinkReport,
} from '@notesapp/api-client';
import {
  Button,
  buttonClassName,
  CopyIcon,
  Dialog,
  DialogBody,
  DialogFooter,
  EmptyState,
  LinkIcon,
  ListRow,
  LoadingState,
  Menu,
  MoreIcon,
  Notice,
  Page,
  PageHeader,
  PlusIcon,
  ReadOnlyField,
  TextField,
  UsersIcon,
} from '@notesapp/ui';
import { problemMessage, useSession } from '../../app.tsx';
import { problemCode } from '../../lib/problem-text.ts';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { useNow } from '../../shell/now.ts';
import {
  accountActionLabel,
  accountActionNotice,
  accountActions,
  accountFacts,
  accountName,
  accountsTitle,
  bytesOfGigabytes,
  enabledAdministrators,
  gigabytesOf,
  invitationFacts,
  missingPartsOf,
  openRegistrationMissingText,
  registrationPolicyText,
  type AccountAction,
} from '../../lib/accounts.ts';
import {
  canTakeDown,
  reportFacts,
  reportNotice,
  reportReasonWord,
} from '../../lib/reports.ts';

/** What the page says under its title. */
const accountsDescription =
  'Invite people and manage their accounts. You see the address, the state and the storage of each account, and never its notes.';

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
  | { readonly kind: 'limit'; readonly account: AccountSummary }
  | { readonly kind: 'remove'; readonly account: AccountSummary };

/** The accounts page. Only an administrator opens it. */
export function AccountsView(): ReactNode {
  const session = useSession();
  useDocumentTitle(accountsTitle);
  if (session.account?.installationRole !== 'administrator')
    return (
      <Page>
        <PageHeader title={accountsTitle} />
        <EmptyState
          icon={<UsersIcon size={20} />}
          title="Only an administrator opens this page"
          description="Ask an administrator of this installation to invite a person or to change an account."
        />
      </Page>
    );
  return <AccountsPage />;
}

/** The three sections of the page and their dialogs. */
function AccountsPage(): ReactNode {
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
    if (action === 'change-limit') {
      setDialog({ kind: 'limit', account });
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

  return (
    <Page>
      <PageHeader
        title={accountsTitle}
        description={accountsDescription}
        actions={
          <Button
            icon={<PlusIcon />}
            disabled={state.kind !== 'ready'}
            onClick={() => {
              setNotice('');
              setFailure('');
              setDialog({ kind: 'invite' });
            }}
          >
            Invite a person
          </Button>
        }
      />
      <div className="space-y-6">
        {notice === '' ? null : <Notice tone="success" message={notice} />}
        {failure === '' ? null : <Notice tone="problem" message={failure} />}
        {state.kind === 'loading' ? (
          <LoadingState
            shape="list"
            rows={3}
            label="The accounts are loading."
          />
        ) : state.kind === 'failed' ? (
          <Notice tone="problem" message={state.message}>
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          </Notice>
        ) : (
          <>
            <section aria-labelledby="registration-heading">
              <h2
                className="mb-1 px-2 text-control font-medium text-muted"
                id="registration-heading"
              >
                Who can make an account
              </h2>
              <div className="flex flex-wrap items-center gap-cluster px-2">
                <p className="m-0 flex-1 text-ui text-strong">
                  {registrationPolicyText(
                    state.installation.registrationPolicy,
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    changePolicy(
                      state.installation.registrationPolicy === 'open'
                        ? 'invitation'
                        : 'open',
                    );
                  }}
                >
                  {state.installation.registrationPolicy === 'open'
                    ? 'Require an invitation'
                    : 'Let anybody sign up'}
                </Button>
              </div>
            </section>

            <section aria-labelledby="reports-heading">
              <h2
                className="mb-1 px-2 text-control font-medium text-muted"
                id="reports-heading"
              >
                Reports of published links
              </h2>
              {state.reports.length === 0 ? (
                <p className="m-0 px-2 text-control text-muted">
                  No report waits. A reader reports a published page from the
                  link at its foot.
                </p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {state.reports.map((report) => {
                    const reason = reportReasonWord(report.reason);
                    return (
                      <ListRow key={report.reportId} className="flex-wrap">
                        <span
                          className="inline-flex shrink-0 items-center text-muted"
                          aria-hidden="true"
                        >
                          <LinkIcon />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-ui text-strong">
                            {reason}
                          </p>
                          <p className="m-0 flex flex-wrap gap-cluster text-control text-muted">
                            {reportFacts(report, now).map((fact) => (
                              <span key={fact}>{fact}</span>
                            ))}
                          </p>
                          {report.note === null ? null : (
                            <p
                              className="m-0 truncate text-control text-muted"
                              title={report.note}
                            >
                              {report.note}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-cluster">
                          {report.address === null ? null : (
                            <a
                              className={buttonClassName({
                                variant: 'secondary',
                                size: 'sm',
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
                              size="sm"
                              disabled={busy}
                              label={`Take down the link of the report: ${reason}`}
                              onClick={() => {
                                change(
                                  () =>
                                    takeDownReportedLink({
                                      path: { reportId: report.reportId },
                                    }),
                                  reportNotice('take-down'),
                                );
                              }}
                            >
                              Take down
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            label={`Close the report: ${reason}`}
                            onClick={() => {
                              change(
                                () =>
                                  dismissReport({
                                    path: { reportId: report.reportId },
                                  }),
                                reportNotice('close'),
                              );
                            }}
                          >
                            Close
                          </Button>
                        </div>
                      </ListRow>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="invitations-heading">
              <h2
                className="mb-1 px-2 text-control font-medium text-muted"
                id="invitations-heading"
              >
                Invitations
              </h2>
              {state.invitations.length === 0 ? (
                <p className="m-0 px-2 text-control text-muted">
                  No invitation waits. Select Invite a person to make one.
                </p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {state.invitations.map((invitation) => {
                    const facts = invitationFacts(invitation, now);
                    return (
                      <ListRow
                        key={invitation.invitationId}
                        className="flex-wrap"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-ui text-strong">
                            {invitation.email}
                          </p>
                          <p className="m-0 flex flex-wrap gap-cluster text-control text-muted">
                            {facts.map((fact) => (
                              <span key={fact}>{fact}</span>
                            ))}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          label={`Revoke the invitation of ${invitation.email}`}
                          onClick={() => {
                            change(
                              () =>
                                revokeInvitation({
                                  path: {
                                    invitationId: invitation.invitationId,
                                  },
                                }),
                              `The invitation of ${invitation.email} is revoked. Its link opens nothing now.`,
                            );
                          }}
                        >
                          Revoke
                        </Button>
                      </ListRow>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="accounts-heading">
              <h2
                className="mb-1 px-2 text-control font-medium text-muted"
                id="accounts-heading"
              >
                Accounts
              </h2>
              <ul className="m-0 list-none p-0">
                {state.accounts.map((account) => {
                  const name = accountName(account);
                  const facts = accountFacts(account, now);
                  const actions = accountActions(
                    account,
                    enabledAdministrators(state.accounts),
                  );
                  return (
                    <ListRow key={account.accountId} className="flex-wrap">
                      <span
                        className="inline-flex shrink-0 items-center text-muted"
                        aria-hidden="true"
                      >
                        <UsersIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-ui text-strong">
                          {name}
                        </p>
                        <p
                          className="m-0 flex flex-wrap gap-cluster text-control text-muted"
                          title={facts.join(', ')}
                        >
                          {facts.slice(0, 3).map((fact) => (
                            <span key={fact}>{fact}</span>
                          ))}
                        </p>
                      </div>
                      <Menu
                        label={`Change the account of ${name}`}
                        icon={<MoreIcon />}
                        compact
                        items={actions.map((action) => ({
                          id: action,
                          label: accountActionLabel(action),
                          // Only the removal destroys anything. A disabled
                          // account comes back with Enable.
                          danger: action === 'remove',
                          disabled: busy,
                          onSelect: () => {
                            runAction(account, action);
                          },
                        }))}
                      />
                    </ListRow>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>

      {dialog.kind === 'invite' && state.kind === 'ready' ? (
        <InviteDialog
          mailConfigured={state.installation.mailConfigured}
          lifetimeHours={state.installation.invitationLifetimeHours}
          onClose={() => {
            setDialog({ kind: 'none' });
            reload();
          }}
        />
      ) : null}
      {dialog.kind === 'limit' ? (
        <LimitDialog
          account={dialog.account}
          busy={busy}
          failure={failure}
          onClose={() => {
            setDialog({ kind: 'none' });
          }}
          onSave={(limitBytes) => {
            change(
              () =>
                updateAccount({
                  path: { accountId: dialog.account.accountId },
                  body: { limitBytes },
                }),
              `The storage limit of ${accountName(dialog.account)} is changed.`,
            );
          }}
        />
      ) : null}
      {dialog.kind === 'remove' ? (
        <Dialog
          open
          title={`Remove ${accountName(dialog.account)}?`}
          titleId="remove-account-title"
          width="small"
          onClose={() => {
            setDialog({ kind: 'none' });
          }}
        >
          <DialogBody>
            <p className="m-0 text-ui text-strong">
              This removes the account and every note in its workspaces for
              good. The person is signed out on every device.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDialog({ kind: 'none' });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                change(
                  () =>
                    removeAccount({
                      path: { accountId: dialog.account.accountId },
                    }),
                  `${accountName(dialog.account)} is removed.`,
                );
              }}
            >
              {busy ? 'Removing the account' : 'Remove account'}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </Page>
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
    <Dialog
      open
      title="Invite a person"
      titleId="invite-title"
      width="medium"
      onClose={onClose}
    >
      {made === null ? (
        <form
          onSubmit={(event): void => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody>
            <p className="mb-4 mt-0 text-control text-muted">
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
              autoFocus
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
              <p className="m-0 text-ui text-strong">
                The link went to {made.email} by mail.
              </p>
            ) : (
              <>
                <p className="mb-4 mt-0 text-ui text-strong">
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
    </Dialog>
  );
}

/** The dialog that changes the storage limit of one account. */
function LimitDialog({
  account,
  busy,
  failure,
  onClose,
  onSave,
}: {
  readonly account: AccountSummary;
  readonly busy: boolean;
  readonly failure: string;
  readonly onClose: () => void;
  readonly onSave: (limitBytes: number) => void;
}): ReactNode {
  const [text, setText] = useState(gigabytesOf(account.storage.limitBytes));
  const [error, setError] = useState('');
  return (
    <Dialog
      open
      title="Change storage limit"
      titleId="limit-title"
      width="small"
      onClose={onClose}
    >
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          const bytes = bytesOfGigabytes(text);
          if (bytes === null) {
            setError('Enter a number of gigabytes above zero.');
            return;
          }
          setError('');
          onSave(bytes);
        }}
      >
        <DialogBody>
          <p className="mb-4 mt-0 text-control text-muted">
            The limit counts every workspace that {accountName(account)} owns.
          </p>
          <TextField
            id="limit-gigabytes"
            label="Limit in gigabytes"
            value={text}
            required
            autoFocus
            error={error === '' ? failure : error}
            onChange={setText}
          />
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
    </Dialog>
  );
}
