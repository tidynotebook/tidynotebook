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
  type AccountControlsInput,
  type AccountSummary,
  type Installation,
  type Invitation,
  type LinkReport,
} from '@notesapp/api-client';
import {
  Button,
  Checkbox,
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
  pageListClassName,
  PlusIcon,
  ReadOnlyField,
  SelectField,
  TextField,
  UsersIcon,
} from '@notesapp/ui';
import { problemMessage, useSession } from '../../app.tsx';
import { problemCode } from '../../lib/problem-text.ts';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { SettingsSection } from './settings-section.tsx';
import {
  LegalDocumentsBody,
  MailSettingsBody,
} from './installation-settings.tsx';
import {
  legalDescription,
  mailDescription,
} from '../../lib/installation-settings.ts';
import {
  administrationSections,
  type AdministrationSectionKey,
} from '../../lib/page-sections.ts';
import { useNow } from '../../shell/now.ts';
import {
  accountActionLabel,
  accountActionNotice,
  accountActions,
  accountFacts,
  accountName,
  accountsTitle,
  enabledAdministrators,
  invitationFacts,
  missingPartsOf,
  openRegistrationMissingText,
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

/** What the page says under its title. */
const accountsDescription =
  'Invite people, manage their accounts, and set up the mail server and the legal documents of this installation.';

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

  return (
    <Page
      sections={state.kind === 'ready' ? administrationSections : undefined}
    >
      <PageHeader title={accountsTitle} description={accountsDescription} />
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
          <AdministrationSections
            sections={{
              registration: {
                description: registrationPolicyText(
                  state.installation.registrationPolicy,
                ),
                body: (
                  // The choice applies at once, as every setting does.
                  <Checkbox
                    id="registration-open"
                    label="Let anybody sign up"
                    checked={state.installation.registrationPolicy === 'open'}
                    disabled={busy}
                    onChange={(open) => {
                      changePolicy(open ? 'open' : 'invitation');
                    }}
                  />
                ),
              },
              mail: {
                description: mailDescription(state.installation.mail),
                body: (
                  <MailSettingsBody
                    mail={state.installation.mail}
                    onSaved={reload}
                  />
                ),
              },
              legal: {
                description: legalDescription(
                  state.installation.legalDocuments,
                ),
                body: (
                  <LegalDocumentsBody
                    legal={state.installation.legalDocuments}
                    onSaved={reload}
                  />
                ),
              },
              reports: {
                description:
                  'A reader reports a published page from the link at its foot. You can take the link down.',
                body: (
                  <>
                    {state.reports.length === 0 ? (
                      <p className="m-0 text-control text-muted">
                        No report waits.
                      </p>
                    ) : (
                      <ul className={pageListClassName()}>
                        {state.reports.map((report) => {
                          const reason = reportReasonWord(report.reason);
                          return (
                            <ListRow
                              key={report.reportId}
                              className="flex-wrap"
                            >
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
                  </>
                ),
              },
              invitations: {
                description:
                  'An invitation lets one person make an account with the address you enter.',
                body: (
                  <>
                    {state.invitations.length === 0 ? (
                      <p className="m-0 text-control text-muted">
                        No invitation waits.
                      </p>
                    ) : (
                      <ul className={pageListClassName()}>
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
                    {/*
                    The one filled action of the page, under the list it
                    adds to, as Sign out every other device stands under the
                    sessions it ends.
                  */}
                    <Button
                      className="mt-3"
                      icon={<PlusIcon />}
                      onClick={() => {
                        setNotice('');
                        setFailure('');
                        setDialog({ kind: 'invite' });
                      }}
                    >
                      Invite a person
                    </Button>
                  </>
                ),
              },
              accounts: {
                description:
                  'You see the address, the state and the storage of each account, and never its notes.',
                body: (
                  <>
                    <ul className={pageListClassName()}>
                      {state.accounts.map((account) => {
                        const name = accountName(account);
                        const facts = accountFacts(account, now);
                        const actions = accountActions(
                          account,
                          enabledAdministrators(state.accounts),
                        );
                        return (
                          <ListRow
                            key={account.accountId}
                            className="flex-wrap"
                          >
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
                  </>
                ),
              },
            }}
          />
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
      {dialog.kind === 'controls' ? (
        <ControlsDialog
          account={dialog.account}
          now={now}
          busy={busy}
          failure={failure}
          onClose={() => {
            setDialog({ kind: 'none' });
          }}
          onSave={(controls) => {
            change(
              () =>
                updateAccount({
                  path: { accountId: dialog.account.accountId },
                  body: { controls },
                }),
              `The limits and access of ${accountName(dialog.account)} are changed.`,
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
    <Dialog
      open
      title="Change limits and access"
      titleId="controls-title"
      width="small"
      onClose={onClose}
    >
      <form
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
          <p className="mb-4 mt-0 text-control text-muted">
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
                : 'A locked account can only export its notes, remove itself, or open the account portal.'
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
            label="Storage limit in gigabytes"
            value={form.storageGigabytes}
            required
            error={errorOf('storageGigabytes')}
            onChange={(value) => {
              set({ storageGigabytes: value });
            }}
          />
          <TextField
            id="controls-text"
            label="Text and history limit in gigabytes"
            value={form.textGigabytes}
            error={errorOf('textGigabytes')}
            onChange={(value) => {
              set({ textGigabytes: value });
            }}
          />
          <TextField
            id="controls-transfer"
            label="Published pages each month, in gigabytes"
            value={form.transferGigabytes}
            error={errorOf('transferGigabytes')}
            onChange={(value) => {
              set({ transferGigabytes: value });
            }}
          />
          <TextField
            id="controls-download"
            label="Downloads each month, in gigabytes"
            value={form.downloadGigabytes}
            error={errorOf('downloadGigabytes')}
            onChange={(value) => {
              set({ downloadGigabytes: value });
            }}
          />
          <div className="space-y-2">
            <Checkbox
              id="controls-teams"
              label="Teams"
              checked={form.teams}
              onChange={(checked) => {
                set({ teams: checked });
              }}
            />
            <Checkbox
              id="controls-collaboration"
              label="Collaboration"
              checked={form.collaboration}
              onChange={(checked) => {
                set({ collaboration: checked });
              }}
            />
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
    </Dialog>
  );
}

/**
 * The sections of the page, in the order of the list that the side region
 * reads. Each section takes its heading from that list and the layout of a
 * section of Settings, because Accounts is a part of Settings (record 0138).
 * The type holds one sentence and one body for each name of the list, so the
 * page and its list cannot disagree (decision 0137).
 */
function AdministrationSections({
  sections,
}: {
  readonly sections: Record<
    AdministrationSectionKey,
    { readonly description: string; readonly body: ReactNode }
  >;
}): ReactNode {
  return (
    <div>
      {administrationSections.map((section) => (
        <SettingsSection
          key={section.key}
          section={section}
          description={sections[section.key].description}
        >
          {sections[section.key].body}
        </SettingsSection>
      ))}
    </div>
  );
}
