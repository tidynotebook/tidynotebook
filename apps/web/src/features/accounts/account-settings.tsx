import {
  Form,
  NavigationHeading,
  SectionHeading,
  IconButton,
  Pill,
  Stack,
  Card,
  Divider,
  RowCopy,
  ContentHeader,
  HeaderSlot,
  HeaderTitle,
  Inline,
  avatarClassName,
  Button,
  SettingsSurface,
  Region,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ComputerIcon,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeaderActionsContext,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  KeyIcon,
  MailIcon,
  FlagIcon,
  PaletteIcon,
  PersonIcon,
  ListRow,
  LoadingState,
  Meter,
  MetaFacts,
  Notice,
  rowClassName,
  SignOutIcon,
  Switch,
  TemplateIcon,
  TextField,
  UploadIcon,
  UsersIcon,
  type PageSection,
} from '@notesapp/ui';

import {
  SettingsActionContext,
  type SettingsActionRegistration,
} from './settings-action-context.ts';
import { SettingsDialog } from './settings-dialog.tsx';
import { ConnectedAppSettings } from './connected-apps.tsx';
/**
 * The Settings modal (issue 517, items 5, 7, 8 and 10).
 *
 * Settings opens over the current page and never replaces it. The frame
 * mounts this body through `shell/settings-modal.tsx`, which reads the open
 * section from the `settings` search parameter of the address. From the
 * large width the modal is a panel with a sidebar of three groups: General
 * for this account and device, Workspace with the name of the workspace, and
 * Account. On a phone it is a full-screen sheet: the section list first, then
 * the section with Back and Close.
 *
 * Each section is compact: a title, one short scope line, then rows with the
 * label and one line of help on the left and the control on the right. Sign
 * out is not a section; the account menu holds it. When the installation
 * names an account portal, Plan and billing opens it for any standing
 * (record 0211). Theme changes apply locally first and sync in the
 * background through the provider in `app.tsx`.
 *
 * The body loads when the modal first opens, so the first screen of the
 * frame reads none of it (record 0177).
 */
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updatePreferences,
  updateProfile,
  type AccountSession,
} from '@notesapp/api-client';

import {
  problemMessage,
  useLocalStore,
  useRequestSync,
  useSession,
  useSpellCheck,
  useWorkspace,
} from '../../app.tsx';
import { profileNameProblem, storageLine } from '../../lib/accounts.ts';
import { monthNotices, transferUsage } from '../../lib/monthly-limits.ts';
import { LegalLinks, useLegalDocuments } from './legal-links.tsx';
import {
  deviceName,
  otherSessionsEndedText,
  sessionFacts,
} from '../../lib/sessions.ts';
import {
  downloadAll,
  importAll,
  transferFailureMessage,
} from '../export/export.ts';
import { DailyNoteSettingsFields } from '../daily-notes/daily-note-settings.tsx';
import { TemplateSettingsFields } from '../templates/template-settings.tsx';
import {
  settingsPageGroups,
  settingsPageOf,
  visibleSettingsPages,
  type SettingsPagePath,
} from '../../lib/settings-routes.ts';
import { useSettingsListFocus } from './settings-list-focus.ts';
import {
  SettingRow,
  SettingActionRow,
  SettingChoiceRow,
  usePhoneSettings,
  SettingsSection,
  SettingsTopicContext,
} from './settings-section.tsx';
import { ApiKeySettings } from './api-keys.tsx';
import { ThemeSettings } from './theme-settings.tsx';
import {
  sectionOf,
  settingsSections,
  type SettingsSectionKey,
} from '../../lib/page-sections.ts';
import { useNow } from '../../shell/now.ts';
import { OfflineSettingsSection } from './offline-settings.tsx';
import { importResultSentence } from '../../lib/import-result.ts';
import { settingsTitle } from './accounts.tsx';
import { RemoveOwnAccountDialog } from './remove-account-dialog.tsx';
import { useOpenPortal } from './open-portal.ts';
import { portalHome } from '../../lib/portal.ts';

const AdministrationSettings = lazy(async () => ({
  default: (await import('./administration.tsx')).AdministrationSettings,
}));

/** One section of Settings, by its name in the list of the page. */
function settingsSection(key: SettingsSectionKey): PageSection {
  return sectionOf(settingsSections, key);
}

/** The icon of each page in the modal sidebar. */
const pageIcons: Readonly<Record<SettingsPagePath, ReactNode>> = {
  appearance: <PaletteIcon />,
  offline: <DownloadIcon />,
  'daily-notes': <CalendarIcon />,
  templates: <TemplateIcon />,
  'export-import': <UploadIcon />,
  account: <PersonIcon />,
  billing: <FileTextIcon />,
  devices: <ComputerIcon />,
  'api-keys-apps': <KeyIcon />,
  accounts: <UsersIcon />,
  mail: <MailIcon />,
  legal: <FileTextIcon />,
  reports: <FlagIcon />,
};

/**
 * The spell check of the editor (record 0103), in the Editor group of
 * Appearance and editor (issue 517, item 7).
 *
 * The switch shows the choice at once and the account stores it in the
 * background. The editor reads the stored value, so a write that fails puts
 * the switch back and says so, and the two never disagree. Only the answer to
 * the last change counts, so two quick changes end on the second one.
 */
function SpellCheckSettings(): ReactNode {
  const session = useSession();
  const stored = useSpellCheck();
  const [pending, setPending] = useState<boolean | null>(null);
  const [problem, setProblem] = useState('');
  const lastChange = useRef(0);

  /** Show the chosen spelling value while its latest account write completes. */
  function change(next: boolean): void {
    lastChange.current += 1;
    const current = lastChange.current;
    setPending(next);
    setProblem('');
    /** Ignore stale replies so a slow write cannot undo a later selection. */
    async function write(): Promise<void> {
      try {
        const result = await updatePreferences({ body: { spellCheck: next } });
        if (current !== lastChange.current) return;
        if (result.data === undefined)
          setProblem('The spell check did not change. Try again.');
        else session.adoptPreferences(result.data);
      } catch {
        if (current === lastChange.current)
          setProblem('The spell check did not change. Try again.');
      }
      if (current === lastChange.current) setPending(null);
    }
    void write();
  }

  return (
    <SettingsSection
      section={settingsSection('spelling')}
      heading="Editor"
      description="Your browser marks the words that it does not know in a note. It does not check code or addresses. The settings of your browser choose the languages."
    >
      <Switch
        label="Check spelling"
        hint="Underline words that the browser does not know."
        checked={pending ?? stored}
        onChange={change}
      />
      {problem === '' ? null : <Notice tone="problem" message={problem} />}
    </SettingsSection>
  );
}

/** How far the list of sessions got. */
type SessionsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly sessions: readonly AccountSession[] };

/**
 * The devices that are signed in to this account (record 0122).
 *
 * The current device is first and has no action here, because the account
 * menu signs it out (issue 517). Each other device has its own Sign out, for a lost phone,
 * and one action ends every other device, for a password that somebody else
 * may know. Only the identifier of a session leaves the server, never its
 * token.
 */
function SessionsSettings(): ReactNode {
  const now = useNow();
  const phone = usePhoneSettings();
  const [endingOthers, setEndingOthers] = useState(false);
  const [state, setState] = useState<SessionsState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    readonly tone: 'info' | 'problem';
    readonly message: string;
  } | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listSessions().then((result) => {
      if (cancelled) return;
      if (result.error !== undefined || result.data === undefined) {
        setState({ kind: 'failed', message: problemMessage(result.error) });
        return;
      }
      setState({ kind: 'ready', sessions: result.data.sessions });
    });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  /** Runs one change, states its result, and reads the list again. */
  function change(
    run: () => Promise<{ readonly error?: unknown; readonly done: string }>,
  ): void {
    setBusy(true);
    setNotice(null);
    void run()
      .then((result) => {
        setNotice(
          result.error === undefined
            ? { tone: 'info', message: result.done }
            : { tone: 'problem', message: problemMessage(result.error) },
        );
      })
      .finally(() => {
        setBusy(false);
        setGeneration((value) => value + 1);
      });
  }

  const current =
    state.kind === 'ready'
      ? state.sessions.find((session) => session.current)
      : undefined;
  const others =
    state.kind === 'ready'
      ? state.sessions.filter((session) => !session.current)
      : [];

  return (
    <SettingsSection
      section={settingsSection('sessions')}
      grouped
      description="These devices are signed in to your account. Sign out a device that you do not use or do not know."
    >
      {notice === null ? null : (
        <Notice tone={notice.tone} message={notice.message} />
      )}
      {state.kind === 'failed' ? (
        <Notice tone="problem" message={state.message} />
      ) : state.kind === 'loading' ? (
        <LoadingState
          shape="list"
          rows={2}
          label="The signed in devices are loading."
        />
      ) : (
        <Stack gap={{ fine: 6, coarse: 4 }}>
          {current === undefined ? null : (
            <Stack gap={2}>
              <SectionHeading
                label={<>This device</>}
                divider
                inset={{ fine: 0, coarse: 4 }}
              />
              <Card as="ul" responsive aria-label="This device">
                <ListRow>
                  <span
                    className="inline-flex shrink-0 items-center text-muted"
                    aria-hidden="true"
                  >
                    <ComputerIcon />
                  </span>
                  <RowCopy>
                    <p className="m-0 truncate text-body text-strong">
                      {deviceName(current.userAgent)}
                    </p>
                    <p className="ui-settings-meta m-0 text-secondary text-muted">
                      To sign out of this device, use the account menu.
                    </p>
                  </RowCopy>
                </ListRow>
              </Card>
            </Stack>
          )}
          <Stack gap={2}>
            <SectionHeading
              label={<>Other devices</>}
              divider
              inset={{ fine: 0, coarse: 4 }}
              action={
                <>
                  {others.length === 0 || phone ? null : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="max-lg:w-full"
                      icon={<SignOutIcon />}
                      disabled={busy}
                      onClick={() => {
                        change(async () => {
                          const ended = await revokeOtherSessions();
                          return {
                            error: ended.error,
                            done: otherSessionsEndedText(
                              ended.data?.revoked ?? 0,
                            ),
                          };
                        });
                      }}
                    >
                      Sign out every other device
                    </Button>
                  )}
                </>
              }
            />
            {others.length === 0 ? (
              <p className="m-0 text-secondary text-muted">No other devices.</p>
            ) : null}
            <Card as="ul" responsive>
              {others.map((session) => {
                const name = deviceName(session.userAgent);
                return (
                  <ListRow key={session.sessionId} className="flex-wrap">
                    <span
                      className="inline-flex shrink-0 items-center text-muted"
                      aria-hidden="true"
                    >
                      <ComputerIcon />
                    </span>
                    <RowCopy>
                      <p
                        data-setting-label
                        className="m-0 truncate text-body text-strong"
                      >
                        {name}
                      </p>
                      <MetaFacts
                        facts={sessionFacts(session, now)}
                        className="ui-settings-meta"
                      />
                    </RowCopy>
                    {session.current ? null : (
                      <span data-setting-control>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          label={`Sign out ${name}`}
                          onClick={() => {
                            change(async () => ({
                              error: (
                                await revokeSession({
                                  path: { sessionId: session.sessionId },
                                })
                              ).error,
                              done: `${name} is signed out.`,
                            }));
                          }}
                        >
                          Sign out
                        </Button>
                      </span>
                    )}
                  </ListRow>
                );
              })}
              {phone && others.length > 0 ? (
                <li>
                  <SettingActionRow
                    label="Sign out every other device…"
                    actionLabel="Sign out every other device"
                    danger
                    onClick={() => setEndingOthers(true)}
                  />
                </li>
              ) : null}
            </Card>
          </Stack>
          <SettingsDialog
            open={endingOthers}
            title="Sign out every other device?"
            titleId="end-devices-title"
            onClose={() => setEndingOthers(false)}
          >
            <DialogBody>
              <p className="m-0 text-body text-strong">
                You can sign in again on those devices.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEndingOthers(false)}>
                Cancel
              </Button>
              <Button
                tone="danger"
                onClick={() => {
                  setEndingOthers(false);
                  change(async () => {
                    const ended = await revokeOtherSessions();
                    return {
                      error: ended.error,
                      done: otherSessionsEndedText(ended.data?.revoked ?? 0),
                    };
                  });
                }}
              >
                Sign out
              </Button>
            </DialogFooter>
          </SettingsDialog>
        </Stack>
      )}
    </SettingsSection>
  );
}

/**
 * The name a person can change and the sign-in address they can read, as
 * two rows. Edit opens the name field in place.
 */
function ProfileSettings({
  name,
  email,
}: {
  readonly name: string | null | undefined;
  readonly email: string | null | undefined;
}): ReactNode {
  const session = useSession();
  const phone = usePhoneSettings();
  const [editing, setEditing] = useState(false);
  const nameButton = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState(name ?? '');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(name ?? '');
  }, [name]);

  /** Save the profile name, then update the current account and avatar together. */
  async function save(): Promise<void> {
    setAttempted(true);
    setSaved(false);
    setProblem('');
    const fieldProblem = profileNameProblem(draft);
    if (fieldProblem !== null) return;
    const nextName = draft.trim();
    if (nextName === name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const result = await updateProfile({ body: { name: nextName } });
    setBusy(false);
    if (result.error !== undefined || result.data === undefined) {
      setProblem(problemMessage(result.error));
      return;
    }
    session.adoptProfileName(nextName);
    setSaved(true);
    setEditing(false);
  }

  const profileForm = (
    <Form
      regions

      className="ui-settings-profile-form flex-1 overflow-hidden"
      onSubmit={(event): void => {
        event.preventDefault();
        void save();
      }}
    >
      <DialogBody>
        <TextField
          id="profile-name"
          label="Name"
          value={draft}
          autoComplete="name"
          hint="Use no more than 256 characters."
          error={attempted ? (profileNameProblem(draft) ?? '') : ''}
          onChange={(value) => {
            setDraft(value);
            setSaved(false);
            setProblem('');
          }}
        />
        {problem === '' ? null : <Notice tone="problem" message={problem} />}
      </DialogBody>
      <DialogFooter>
        <Button
          className={phone ? 'w-full' : undefined}
          type="submit"
          variant={phone ? 'primary' : 'secondary'}
          disabled={
            busy ||
            profileNameProblem(draft) !== null ||
            draft.trim() === (name ?? '').trim()
          }
        >
          {busy ? 'Saving' : phone ? 'Save' : 'Save name'}
        </Button>
        {phone ? null : (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setAttempted(false);
              setProblem('');
              setDraft(name ?? '');
            }}
          >
            Cancel
          </Button>
        )}
      </DialogFooter>
    </Form>
  );

  return (
    <SettingsSection
      section={settingsSection('profile')}
      description="Your name appears with your account. Use your email address to sign in."
    >
      {editing ? (
        phone ? (
          <SettingsDialog
            open
            title="Name"
            titleId="profile-edit-title"
            hideScope
            returnFocus={() => nameButton.current?.focus()}
            onClose={() => {
              setEditing(false);
              setDraft(name ?? '');
            }}
          >
            {profileForm}
          </SettingsDialog>
        ) : (
          profileForm
        )
      ) : phone ? (
        <SettingChoiceRow
          buttonRef={nameButton}
          label="Name"
          help=""
          value={name ?? ''}
          onClick={() => {
            setEditing(true);
            setSaved(false);
          }}
        />
      ) : (
        <SettingRow label="Name">
          <span className="min-w-0 truncate text-value text-muted">
            {name ?? ''}
          </span>
          <Button
            variant="secondary"
            size="sm"
            label="Edit name"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
          >
            Edit
          </Button>
        </SettingRow>
      )}
      {saved ? (
        <Notice tone="info" message="Your new name appears in your account." />
      ) : null}
      <SettingRow label="Email" help="Use this address to sign in.">
        <span className="min-w-0 truncate text-value text-muted">
          {email ?? 'No address linked'}
        </span>
      </SettingRow>
    </SettingsSection>
  );
}

/**
 * The page that the value of the `settings` parameter opens, among the pages
 * that this account shows. An old page reads as its new page, and a value
 * that names none, or a page this account does not show, as the first page.
 */
function chosenPage<T extends { readonly path: string }>(
  pages: readonly T[],
  value: string,
): T | undefined {
  const path = settingsPageOf(value);
  return (
    pages.find((page) => page.path === path) ??
    pages.find((page) => page.path === 'appearance') ??
    pages[0]
  );
}

/** The Settings modal over the current page. */
export function SettingsModal({
  workspaceId,
  initial,
  value,
  onChoose,
  onClose,
  returnFocus,
}: {
  readonly workspaceId: string;
  /** The first letter of the account, as the avatar of the header shows it. */
  readonly initial: string;
  /** The open section, or an empty string for the section list. */
  readonly value: string;
  /** Opens one section, or the section list for an empty string. */
  readonly onChoose: (page: string) => void;
  readonly onClose: () => void;
  readonly returnFocus: (() => void) | undefined;
}): ReactNode {
  const phoneLayout = usePhoneSettings();
  const session = useSession();
  const store = useLocalStore();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  // A refused import is a problem, not news, so it has its own notice.
  const [importError, setImportError] = useState('');
  const [removing, setRemoving] = useState(false);
  const [actionHeaderTarget, setActionHeaderTarget] =
    useState<HTMLDivElement | null>(null);
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null);
  const [activeAction, setActiveAction] =
    useState<SettingsActionRegistration | null>(null);
  const actionHost = useMemo(
    () => ({ target: actionTarget, setActive: setActiveAction }),
    [actionTarget],
  );
  const importInput = useRef<HTMLInputElement | null>(null);
  const requestSync = useRequestSync();
  const titleId = useId();
  const pageTitleId = useId();
  const sectionTitle = useRef<HTMLHeadingElement | null>(null);
  const listTitle = useRef<HTMLDivElement | null>(null);
  const account = session.account;
  const accountId = account?.accountId ?? null;
  const documents = useLegalDocuments();
  const workspace = useWorkspace();
  const workspaceName =
    workspace.state.status === 'ready'
      ? (workspace.state.workspaces.find(
          (item) => item.workspaceId === workspaceId,
        )?.name ?? '')
      : '';
  const portal = useOpenPortal();
  // The limits of the month change with no notice to this device, so the
  // modal reads the account again when it opens (record 0193).
  const recheckAccount = session.recheck;
  useEffect(() => {
    recheckAccount();
  }, [recheckAccount]);

  const pages = visibleSettingsPages(account ?? { accountPortal: false });
  const activePage = chosenPage(pages, value);
  const listLevel = value === '';
  useLayoutEffect(() => {
    const title =
      listLevel && !window.matchMedia('(min-width: 1024px)').matches
        ? listTitle.current
        : sectionTitle.current;
    title?.focus({ preventScroll: true });
  }, [listLevel, activePage?.path]);
  const settingsList = useSettingsListFocus(
    workspaceId,
    listLevel ? undefined : activePage?.path,
  );
  // An old or unknown value becomes the address of the page it opens.
  useEffect(() => {
    if (value !== '' && activePage !== undefined && value !== activePage.path)
      onChoose(activePage.path);
  }, [value, activePage, onChoose]);
  if (account === null) return null;

  // Each section renders in the order of the page, and the type holds one
  // body for each name of the list (decision 0137).
  const sectionBodies: Record<SettingsSectionKey, ReactNode> = {
    appearance: <ThemeSettings />,
    spelling: <SpellCheckSettings />,
    'daily-notes': (
      <SettingsSection
        section={settingsSection('daily-notes')}
        description="Each day has one note, and the calendar in the sidebar opens it."
      >
        <DailyNoteSettingsFields />
      </SettingsSection>
    ),
    templates: (
      <SettingsSection
        section={settingsSection('templates')}
        description="Notes in this folder show in New note from template."
      >
        <TemplateSettingsFields />
      </SettingsSection>
    ),
    offline: (
      <OfflineSettingsSection
        store={store.store}
        accountId={accountId}
        workspaceId={workspaceId}
      />
    ),
    export: (
      <SettingsSection
        section={settingsSection('export')}
        rows
        description="A zip of every note and image, with their folders."
      >
        <SettingActionRow
          label="Export this workspace"
          actionLabel="Export"
          help="A zip of every note and image, with their folders."
          disabled={exporting}
          onClick={() => {
            setExportError('');
            setExporting(true);
            void downloadAll(workspaceId)
              .catch((failure: unknown) => {
                setExportError(transferFailureMessage(failure));
              })
              .finally(() => {
                setExporting(false);
              });
          }}
        />
        {exportError === '' ? null : (
          <Notice tone="problem" message={exportError} />
        )}
      </SettingsSection>
    ),
    import: (
      <SettingsSection
        section={settingsSection('import')}
        rows
        description="A zip of Markdown files and images. Paths and links are kept."
      >
        <input
          ref={importInput}
          className="sr-only"
          type="file"
          accept=".zip,application/zip"
          aria-label="Choose a workspace zip archive"
          onChange={(event): void => {
            const file = event.target.files?.[0];
            if (file === undefined) return;
            setImporting(true);
            setImportNotice('');
            setImportError('');
            void importAll(workspaceId, file)
              .then((result) => {
                setImportNotice(importResultSentence(result));
                requestSync();
              })
              .catch((failure: unknown) => {
                setImportError(transferFailureMessage(failure));
              })
              .finally(() => {
                setImporting(false);
                event.target.value = '';
              });
          }}
        />
        <SettingActionRow
          label="Import workspace…"
          actionLabel="Import"
          help="A zip of Markdown files and images. Paths and links are kept."
          disabled={importing}
          onClick={() => importInput.current?.click()}
        />
        {importNotice === '' ? null : (
          <Notice tone="info" message={importNotice} />
        )}
        {importError === '' ? null : (
          <Notice tone="problem" message={importError} />
        )}
      </SettingsSection>
    ),
    profile: <ProfileSettings name={account.name} email={account.email} />,
    account: (
      <SettingsSection
        section={settingsSection('account')}
        heading="Usage"
        description="Your account owns every note in your workspaces. No other account can read them."
      >
        {monthNotices(account.month).map((notice) => (
          <Notice key={notice} tone="info" message={notice} />
        ))}
        {storageLine(account.storage) === '' ? null : (
          <Meter
            label="Storage"
            value={account.storage.usedBytes}
            max={account.storage.limitBytes}
            text={storageLine(account.storage)}
          />
        )}
        {transferUsage(account.month, account.controls).map((usage) => (
          <Meter key={usage.label} {...usage} />
        ))}
        {documents === null ? null : <LegalLinks documents={documents} />}
      </SettingsSection>
    ),
    'remove-account': (
      <SettingsSection
        section={settingsSection('remove-account')}
        heading="Danger zone"
        danger
      >
        <SettingActionRow
          label="Delete account…"
          actionLabel="Delete account"
          help="Deletes every workspace and note for good. Export your notes first."
          danger
          onClick={() => {
            setRemoving(true);
          }}
        />
      </SettingsSection>
    ),
    billing: (
      // The account portal of the operator, for any standing (records 0190
      // and 0211). `visibleSettingsPages` shows the page only when the
      // installation names a portal.
      <SettingsSection
        section={settingsSection('billing')}
        description="See and change your plan, your payment method and your invoices."
      >
        <SettingActionRow
          label="Open billing"
          desktopLabel="Payment method, invoices, plan changes"
          actionLabel="Open billing"
          help="Opens the billing portal."
          icon={<ExternalLinkIcon />}
          disabled={portal.busy}
          onClick={() => {
            void portal.open(portalHome, true);
          }}
        />
        {portal.error === '' ? null : (
          <Notice tone="problem" message={portal.error} />
        )}
      </SettingsSection>
    ),
    'api-keys': <ApiKeySettings />,
    'connected-apps': <ConnectedAppSettings />,
    sessions: <SessionsSettings />,
    'admin-accounts': (
      <Suspense fallback={<LoadingState label="Reading accounts" />}>
        <AdministrationSettings page="accounts" />
      </Suspense>
    ),
    'admin-mail': (
      <Suspense fallback={<LoadingState label="Reading mail settings" />}>
        <AdministrationSettings page="mail" />
      </Suspense>
    ),
    'admin-legal': (
      <Suspense fallback={<LoadingState label="Reading legal documents" />}>
        <AdministrationSettings page="legal" />
      </Suspense>
    ),
    'admin-reports': (
      <Suspense fallback={<LoadingState label="Reading reports" />}>
        <AdministrationSettings page="reports" />
      </Suspense>
    ),
  };

  // A page of one section, Export and import, and Account name their
  // sections by the page title and their rows.
  const hiddenTitles =
    activePage === undefined
      ? []
      : activePage.sections.length === 1 || activePage.path === 'export-import'
        ? activePage.sections.map((key) => settingsSection(key).id)
        : activePage.path === 'account'
          ? [settingsSection('profile').id]
          : activePage.path === 'appearance'
            ? [settingsSection('appearance').id]
            : [];
  const sectionForm = activePage?.path === 'mail';
  const scope =
    activePage?.group === 'Workspace'
      ? `${workspaceName === '' ? 'This' : workspaceName} ${activePage.scope}`
      : activePage?.scope;

  return (
    <Dialog
      open
      onClose={onClose}
      title={settingsTitle}
      titleId={titleId}
      hideTitle
      width="settings"
      align="center"
      returnFocus={returnFocus}
    >
      <SettingsSurface>
        <SettingsActionContext.Provider value={actionHost}>
          <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
            <div
              data-scroll-frame=""
              className={`${listLevel ? 'flex' : 'hidden'} ui-settings-navigation bg-card overflow-hidden flex-1 flex-col lg:flex lg:w-60 lg:flex-none lg:border-r lg:border-edge-subtle`}
            >
              <ContentHeader
                data-sheet-drag=""
                data-scroll-edge="above"
                padX={{ fine: 0, coarse: 4 }}
                className="ui-settings-root-heading touch-pan-x touch-pinch-zoom lg:hidden"
              >
                <HeaderSlot>
                  <IconButton
                    size="header"
                    glyph={<CloseIcon />}
                    label="Close Settings"
                    onClick={onClose}
                  />
                </HeaderSlot>
                <HeaderTitle
                  ref={listTitle}
                  tabIndex={-1}
                  className="text-center text-title-header text-strong outline-none"
                >
                  {settingsTitle}
                </HeaderTitle>
                <HeaderSlot aria-hidden="true" />
              </ContentHeader>
              <Region
                pad={{ fine: 2, coarse: 4 }}
                gap={{ fine: 2, coarse: 4 }}
                className="ui-settings-list flex-1"
                elementRef={settingsList}
              >
                <Inline
                  as="button"
                  type="button"
                  data-settings-page="account"
                  aria-label={`Profile, ${account.name ?? ''}, ${account.email ?? ''}`}
                  aria-current={
                    activePage?.path === 'account' ? 'page' : undefined
                  }
                  onClick={() => onChoose('account')}
                  gap={3}
                  pad={{ fine: 2, coarse: 4 }}
                  className={`${rowClassName({ layout: false, current: activePage?.path === 'account' })} ui-account-card w-full text-left rounded-md`}
                >
                  <span className={avatarClassName()} aria-hidden="true">
                    {initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-title-header text-strong">
                      {account.name ?? account.email ?? ''}
                    </span>
                    {account.email === null ||
                    account.email === undefined ? null : (
                      <span className="block truncate text-secondary text-muted">
                        {account.email}
                      </span>
                    )}
                  </span>
                  <span className="lg:hidden">
                    <ChevronRightIcon />
                  </span>
                </Inline>
                <Divider />
                <Stack
                  aria-label="Settings sections"
                  gap={{ fine: 2, coarse: 4 }}
                  as="nav"
                >
                  {settingsPageGroups
                    .filter((group) =>
                      pages.some(
                        (page) =>
                          page.group === group && page.path !== 'account',
                      ),
                    )
                    .map((group) => (
                      <Stack
                        key={group}
                        aria-label={
                          group === 'Workspace' && workspaceName !== ''
                            ? `Workspace ${workspaceName}`
                            : group
                        }
                        gap={{ fine: 0.5, coarse: 2 }}
                        as="section"
                      >
                        <NavigationHeading>
                          {group}
                          {group === 'Workspace' && workspaceName !== '' ? (
                            <Pill>{workspaceName}</Pill>
                          ) : null}
                        </NavigationHeading>
                        <Card as="ul" responsive className="list-none">
                          {pages
                            .filter(
                              (page) =>
                                page.group === group && page.path !== 'account',
                            )
                            .map((page) => {
                              const current =
                                !listLevel && activePage?.path === page.path;
                              const desktopCurrent =
                                activePage?.path === page.path;
                              return (
                                <li key={page.path}>
                                  <ListRow
                                    as="button"
                                    density={phoneLayout ? 'setting' : 'tree'}
                                    data-settings-page={page.path}
                                    className={rowClassName({
                                      layout: false,
                                      current: desktopCurrent && !listLevel,
                                      className: `ui-settings-nav-row w-full text-left ${desktopCurrent && listLevel ? 'lg:bg-active' : ''}`,
                                    }).replace('ui-tree-row', '')}
                                    aria-current={current ? 'page' : undefined}
                                    onClick={() => {
                                      onChoose(page.path);
                                    }}
                                  >
                                    <span
                                      className="inline-flex shrink-0 items-center"
                                      aria-hidden="true"
                                    >
                                      {pageIcons[page.path]}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">
                                      {page.title}
                                    </span>
                                    <span
                                      className="inline-flex shrink-0 items-center text-muted lg:hidden"
                                      aria-hidden="true"
                                    >
                                      <ChevronRightIcon />
                                    </span>
                                  </ListRow>
                                </li>
                              );
                            })}
                        </Card>
                      </Stack>
                    ))}
                </Stack>
              </Region>
            </div>
            <Stack
              as="section"
              pad={{
                fine: activeAction === null && !sectionForm ? 6 : 0,
                coarse: 0,
              }}
              gap={{
                fine: activeAction === null && !sectionForm ? 6 : 0,
                coarse: 0,
              }}
              data-scroll-frame=""
              aria-labelledby={pageTitleId}
              data-dialog-escape={activeAction === null ? undefined : 'local'}
              onKeyDown={(event) => {
                if (activeAction !== null && event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  activeAction.close();
                }
              }}
              className={`${listLevel ? 'hidden' : 'flex'} ui-settings-column ${activeAction === null ? '' : 'ui-settings-column-form'} overflow-hidden min-w-0 flex-1 flex-col lg:flex`}
            >
              <ContentHeader
                data-sheet-drag=""
                data-scroll-edge="above"
                pad={{
                  fine: activeAction === null && !sectionForm ? 0 : 6,
                  coarse: 0,
                }}
                padX={{
                  fine: activeAction === null && !sectionForm ? 0 : 6,
                  coarse: 4,
                }}
                className="touch-pan-x touch-pinch-zoom"
              >
                <Stack gap={0.5} className="min-w-0 flex-1">
                  <Inline gap={2} className="min-w-0">
                    <HeaderSlot
                      className={activeAction === null ? 'lg:hidden' : ''}
                    >
                      <IconButton
                        size="header"
                        className={
                          activeAction === null ? 'lg:hidden' : undefined
                        }
                        glyph={<ChevronLeftIcon />}
                        label={
                          activeAction === null
                            ? 'Back to Settings'
                            : 'Back to section'
                        }
                        onClick={() => {
                          if (activeAction === null) onChoose('');
                          else activeAction.close();
                        }}
                      />
                    </HeaderSlot>
                    <HeaderTitle className="min-w-0 flex-1">
                      <h2
                        id={pageTitleId}
                        ref={sectionTitle}
                        tabIndex={-1}
                        className="ui-settings-header-title text-title-header text-strong outline-none"
                      >
                        {activeAction?.title ??
                          activePage?.title ??
                          settingsTitle}
                      </h2>
                    </HeaderTitle>
                    <Inline gap={8} justify="end" className="shrink-0">
                      <div
                        ref={setActionHeaderTarget}
                        className="flex shrink-0 items-center empty:hidden"
                      />
                      <HeaderSlot>
                        <IconButton
                          size="header"
                          glyph={<CloseIcon />}
                          label="Close Settings"
                          onClick={onClose}
                        />
                      </HeaderSlot>
                    </Inline>
                  </Inline>
                  {scope === undefined ||
                  activeAction?.hideScope === true ? null : (
                    <p className="text-secondary text-muted max-lg:hidden">
                      {activeAction === null ? scope : activePage?.title}
                    </p>
                  )}
                </Stack>
              </ContentHeader>
              <div className="ui-settings-content overflow-hidden flex-1 flex flex-col">
                <DialogHeaderActionsContext.Provider value={actionHeaderTarget}>
                  <div
                    ref={setActionTarget}
                    hidden={activeAction === null}
                    className={
                      activeAction === null
                        ? undefined
                        : 'flex overflow-hidden flex-1 flex-col'
                    }
                  />
                  {sectionForm ? (
                    <Stack
                      fill
                      className={
                        activeAction === null ? 'overflow-hidden' : 'hidden'
                      }
                      hidden={activeAction !== null}
                      inert={activeAction !== null}
                    >
                      {sectionBodies['admin-mail']}
                    </Stack>
                  ) : (
                    <Region
                      className={`overflow-hidden flex-1 ${activeAction !== null ? 'hidden' : ''}`}
                    >
                      <Stack
                        gap={{ fine: 6, coarse: 4 }}
                        pad={{ fine: 0, coarse: 4 }}
                        className="ui-settings-sections"
                        hidden={activeAction !== null}
                        inert={activeAction !== null}
                      >
                        {scope === undefined ? null : (
                          <p className="text-secondary text-muted lg:hidden">
                            {scope}
                          </p>
                        )}
                        <SettingsTopicContext.Provider
                          value={{ hiddenTitles, helpSection: null }}
                        >
                          {activePage?.path === 'export-import' ? (
                            <Stack gap={2}>
                              <SectionHeading
                                label={<>Workspace</>}
                                divider
                                inset={{ fine: 0, coarse: 4 }}
                              />
                              <Card responsive>
                                {activePage.sections.map((key) => (
                                  <Stack key={key} gap={2}>
                                    {sectionBodies[key]}
                                  </Stack>
                                ))}
                              </Card>
                            </Stack>
                          ) : (
                            activePage?.sections.map((key) => (
                              <Stack key={key} gap={2}>
                                {sectionBodies[key]}
                              </Stack>
                            ))
                          )}
                        </SettingsTopicContext.Provider>
                      </Stack>
                    </Region>
                  )}
                </DialogHeaderActionsContext.Provider>
              </div>
            </Stack>
          </div>
          {removing ? (
            <RemoveOwnAccountDialog
              store={store.store}
              accountId={account.accountId}
              onClose={() => {
                setRemoving(false);
              }}
              onRemoved={() => {
                session.refresh();
              }}
            />
          ) : null}
        </SettingsActionContext.Provider>
      </SettingsSurface>
    </Dialog>
  );
}
