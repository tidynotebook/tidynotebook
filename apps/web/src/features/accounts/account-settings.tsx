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
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updatePreferences,
  updateProfile,
  type AccountSession,
} from '@notesapp/api-client';
import {
  avatarClassName,
  Button,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ComputerIcon,
  Dialog,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LinkIcon,
  ListRow,
  LoadingState,
  Meter,
  Notice,
  pageListClassName,
  rowClassName,
  SettingsIcon,
  SignOutIcon,
  Switch,
  TemplateIcon,
  TextField,
  UploadIcon,
  UsersIcon,
  type PageSection,
} from '@notesapp/ui';
import { actionIcon } from '../../shell/action-icons.tsx';
import { deleteGlyph } from '../../lib/delete-label.ts';
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

/** One section of Settings, by its name in the list of the page. */
function settingsSection(key: SettingsSectionKey): PageSection {
  return sectionOf(settingsSections, key);
}

/** The icon of each page in the modal sidebar. */
const pageIcons: Readonly<Record<SettingsPagePath, ReactNode>> = {
  appearance: actionIcon('theme-system'),
  offline: <DownloadIcon />,
  'daily-notes': <CalendarIcon />,
  templates: <TemplateIcon />,
  'export-import': <UploadIcon />,
  account: <SettingsIcon />,
  billing: <FileTextIcon />,
  devices: <ComputerIcon />,
  'api-keys-apps': <LinkIcon />,
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
      {problem === '' ? null : (
        <Notice className="mt-3" tone="problem" message={problem} />
      )}
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

  const others =
    state.kind === 'ready'
      ? state.sessions.filter((session) => !session.current).length
      : 0;

  return (
    <SettingsSection
      section={settingsSection('sessions')}
      description="These devices are signed in to your account. Sign out a device that you do not use or do not know."
    >
      {notice === null ? null : (
        <Notice className="mb-3" tone={notice.tone} message={notice.message} />
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
        <>
          <ul className={pageListClassName()}>
            {state.sessions.map((session) => {
              const name = deviceName(session.userAgent);
              return (
                <ListRow key={session.sessionId} className="flex-wrap">
                  <span
                    className="inline-flex shrink-0 items-center text-muted"
                    aria-hidden="true"
                  >
                    <ComputerIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-ui text-strong">{name}</p>
                    <p className="m-0 flex flex-wrap gap-cluster text-control text-muted">
                      {sessionFacts(session, now).map((fact) => (
                        <span key={fact}>{fact}</span>
                      ))}
                    </p>
                  </div>
                  {session.current ? null : (
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
                  )}
                </ListRow>
              );
            })}
          </ul>
          {others === 0 ? null : (
            <Button
              className="mt-3"
              variant="secondary"
              icon={<SignOutIcon />}
              disabled={busy}
              onClick={() => {
                change(async () => {
                  const ended = await revokeOtherSessions();
                  return {
                    error: ended.error,
                    done: otherSessionsEndedText(ended.data?.revoked ?? 0),
                  };
                });
              }}
            >
              Sign out every other device
            </Button>
          )}
        </>
      )}
      <p className="mb-0 mt-3 text-control text-muted">
        To sign out of this device, use the account menu.
      </p>
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
  const [editing, setEditing] = useState(false);
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

  return (
    <SettingsSection
      section={settingsSection('profile')}
      description="Your name appears with your account. Use your email address to sign in."
    >
      {editing ? (
        <form
          className="border-b border-edge-subtle py-3"
          onSubmit={(event): void => {
            event.preventDefault();
            void save();
          }}
        >
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
          {problem === '' ? null : (
            <Notice className="mb-3" tone="problem" message={problem} />
          )}
          <div className="flex flex-wrap gap-cluster">
            <Button type="submit" variant="secondary" disabled={busy}>
              {busy ? 'Saving' : 'Save name'}
            </Button>
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
          </div>
        </form>
      ) : (
        <SettingRow label="Name">
          <span className="min-w-0 truncate text-ui font-medium text-strong">
            {name ?? ''}
          </span>
          <Button
            variant="ghost"
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
        <Notice
          className="my-2"
          tone="info"
          message="Your new name appears in your account."
        />
      ) : null}
      <SettingRow label="Email" help="Use this address to sign in.">
        <span className="min-w-0 truncate text-ui font-medium text-strong">
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
  return pages.find((page) => page.path === path) ?? pages[0];
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
  const session = useSession();
  const store = useLocalStore();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  // A refused import is a problem, not news, so it has its own notice.
  const [importError, setImportError] = useState('');
  const [removing, setRemoving] = useState(false);
  const importInput = useRef<HTMLInputElement | null>(null);
  const requestSync = useRequestSync();
  const titleId = useId();
  const pageTitleId = useId();
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
        description="A zip of every note and image, with their folders."
      >
        <SettingRow
          label="Export this workspace"
          help="A zip of every note and image, with their folders."
        >
          <Button
            variant="secondary"
            size="sm"
            icon={<DownloadIcon />}
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
          >
            {exporting ? 'Preparing the download' : 'Export'}
          </Button>
        </SettingRow>
        {exportError === '' ? null : (
          <Notice className="my-2" tone="problem" message={exportError} />
        )}
      </SettingsSection>
    ),
    import: (
      <SettingsSection
        section={settingsSection('import')}
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
        <SettingRow
          label="Import workspace"
          help="A zip of Markdown files and images. Paths and links are kept."
        >
          <Button
            variant="secondary"
            size="sm"
            icon={<UploadIcon />}
            disabled={importing}
            onClick={() => importInput.current?.click()}
          >
            {importing ? 'Importing files' : 'Import'}
          </Button>
        </SettingRow>
        {importNotice === '' ? null : (
          <Notice className="my-2" tone="info" message={importNotice} />
        )}
        {importError === '' ? null : (
          <Notice className="my-2" tone="problem" message={importError} />
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
          <Notice key={notice} className="mt-3" tone="info" message={notice} />
        ))}
        {storageLine(account.storage) === '' ? null : (
          <div className="mt-3">
            <Meter
              label="Storage"
              value={account.storage.usedBytes}
              max={account.storage.limitBytes}
              text={storageLine(account.storage)}
            />
          </div>
        )}
        {transferUsage(account.month, account.controls).map((usage) => (
          <div key={usage.label} className="mt-3">
            <Meter {...usage} />
          </div>
        ))}
        {documents === null ? null : (
          <LegalLinks className="mt-3" documents={documents} />
        )}
      </SettingsSection>
    ),
    'remove-account': (
      <SettingsSection
        section={settingsSection('remove-account')}
        heading="Danger zone"
        danger
      >
        <SettingRow
          label="Delete account"
          help="Deletes every workspace and note for good. Export your notes first."
        >
          <Button
            variant="secondary"
            size="sm"
            tone="danger"
            icon={actionIcon(deleteGlyph)}
            onClick={() => {
              setRemoving(true);
            }}
          >
            Delete account
          </Button>
        </SettingRow>
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
        <SettingRow
          label="Payment method, invoices, plan changes"
          help="Opens the billing portal."
        >
          <Button
            variant="secondary"
            size="sm"
            icon={<ExternalLinkIcon />}
            disabled={portal.busy}
            onClick={() => {
              void portal.open(portalHome);
            }}
          >
            Open billing
          </Button>
        </SettingRow>
        {portal.error === '' ? null : (
          <Notice className="my-2" tone="problem" message={portal.error} />
        )}
      </SettingsSection>
    ),
    'api-keys': <ApiKeySettings />,
    'connected-apps': <ConnectedAppSettings />,
    sessions: <SessionsSettings />,
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
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={`${listLevel ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col bg-surface lg:flex lg:w-72 lg:flex-none lg:border-r lg:border-edge-subtle`}
        >
          <div className="flex items-center gap-cluster px-3 pt-3 lg:hidden">
            <Button
              variant="ghost"
              icon={<CloseIcon />}
              label="Close Settings"
              onClick={onClose}
            />
            <p className="m-0 min-w-0 flex-1 text-center text-ui font-semibold text-strong">
              {settingsTitle}
            </p>
            <span className="w-11 shrink-0" aria-hidden="true" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <div className="flex items-center gap-2.5 border-b border-edge-subtle px-2 pb-3">
              <span className={avatarClassName()} aria-hidden="true">
                {initial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-semibold text-strong">
                  {account.name ?? account.email ?? ''}
                </span>
                {account.email === null ||
                account.email === undefined ? null : (
                  <span className="block truncate text-control text-muted">
                    {account.email}
                  </span>
                )}
              </span>
            </div>
            <nav ref={settingsList} aria-label="Settings sections">
              {settingsPageGroups.map((group) => (
                <section
                  key={group}
                  aria-label={
                    group === 'Workspace' && workspaceName !== ''
                      ? `Workspace ${workspaceName}`
                      : group
                  }
                  className="mt-3"
                >
                  <h3 className="m-0 flex items-center gap-1.5 px-2 pb-1 text-control font-semibold text-muted">
                    {group}
                    {group === 'Workspace' && workspaceName !== '' ? (
                      <span className="min-w-0 truncate rounded-sm bg-hover px-1.5 font-medium text-strong">
                        {workspaceName}
                      </span>
                    ) : null}
                  </h3>
                  <ul className="m-0 list-none p-0">
                    {pages
                      .filter((page) => page.group === group)
                      .map((page) => {
                        const current =
                          !listLevel && activePage?.path === page.path;
                        const desktopCurrent = activePage?.path === page.path;
                        return (
                          <li key={page.path}>
                            <button
                              type="button"
                              data-settings-page={page.path}
                              className={rowClassName({
                                current: desktopCurrent,
                                className: 'w-full text-left',
                              })}
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
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </section>
              ))}
            </nav>
          </div>
          {account.installationRole === 'administrator' ? (
            <div className="border-t border-edge-subtle p-3">
              <Link
                className={rowClassName({ className: 'w-full' })}
                to={`/w/${workspaceId}/accounts`}
              >
                <span className="inline-flex items-center" aria-hidden="true">
                  <UsersIcon />
                </span>
                <span className="min-w-0 flex-1">Manage accounts</span>
                <span
                  className="inline-flex items-center text-muted"
                  aria-hidden="true"
                >
                  <ExternalLinkIcon />
                </span>
              </Link>
            </div>
          ) : null}
        </div>
        <section
          aria-labelledby={pageTitleId}
          className={`${listLevel ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-1 flex-col lg:flex`}
        >
          <div className="flex items-start gap-cluster px-3 pt-3 lg:px-5 lg:pt-4">
            <Button
              className="lg:hidden"
              variant="ghost"
              icon={<ChevronLeftIcon />}
              label="Back to Settings"
              onClick={() => {
                onChoose('');
              }}
            />
            <div className="min-w-0 flex-1 pt-2 lg:pt-1">
              <h2
                id={pageTitleId}
                className="m-0 text-xl font-semibold tracking-heading text-strong max-lg:text-center max-lg:text-base"
              >
                {activePage?.title ?? settingsTitle}
              </h2>
              {scope === undefined ? null : (
                <p className="mb-0 mt-1 text-control text-muted max-lg:hidden">
                  {scope}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              icon={<CloseIcon />}
              label="Close Settings"
              onClick={onClose}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pb-5 pt-3 lg:px-5">
            {scope === undefined ? null : (
              <p className="mb-3 mt-0 text-control text-muted lg:hidden">
                {scope}
              </p>
            )}
            <SettingsTopicContext.Provider
              value={{ hiddenTitles, helpSection: null }}
            >
              {activePage?.sections.map((key) => (
                <div key={key}>{sectionBodies[key]}</div>
              ))}
            </SettingsTopicContext.Provider>
          </div>
        </section>
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
    </Dialog>
  );
}
