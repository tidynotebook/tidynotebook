/**
 * The Settings page of the workspace frame (record 0091).
 *
 * Settings is the one place for the profile, the palette, the spell check,
 * offline availability, and sign-out. When the installation names an account
 * portal, the Billing section opens it for any standing (record 0211). It
 * reads as sections and not as a stack of cards: each section states its name
 * and its sentence in a column of its own and holds its controls beside them,
 * and a hairline separates one from the next. Theme changes apply locally first and sync in the background
 * through the provider in `app.tsx`.
 *
 * The page loads when it opens, so the first screen of the frame reads none
 * of it (record 0177).
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, Navigate, useParams } from 'react-router';
import {
  type AccountSession,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  updatePreferences,
  updateProfile,
} from '@notesapp/api-client';
import type { LocalStore } from '@notesapp/sync';
import {
  Button,
  buttonClassName,
  Checkbox,
  ListRow,
  ComputerIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  pageListClassName,
  SignOutIcon,
  TextField,
  UsersIcon,
  UploadIcon,
  type PageSection,
} from '@notesapp/ui';
import { actionIcon } from '../../shell/action-icons.tsx';
import { deleteGlyph } from '../../lib/delete-label.ts';
import {
  problemMessage,
  useLocalStore,
  useSession,
  useSpellCheck,
  useRequestSync,
} from '../../app.tsx';

import { profileNameProblem, storageLine } from '../../lib/accounts.ts';
import { monthNotices, transferLines } from '../../lib/monthly-limits.ts';

import { LegalLinks, useLegalDocuments } from './legal-links.tsx';
import {
  deviceName,
  otherSessionsEndedText,
  sessionFacts,
} from '../../lib/sessions.ts';

import {
  signOut as endSession,
  revokeSessionViaClient,
} from '../../pwa/lifecycle.ts';
import {
  downloadAll,
  importAll,
  transferFailureMessage,
} from '../export/export.ts';
import { DailyNoteSettingsFields } from '../daily-notes/daily-note-settings.tsx';
import { TemplateSettingsFields } from '../templates/template-settings.tsx';
import { useDocumentTitle } from '../../shell/document-title.ts';
import { SettingsSection } from './settings-section.tsx';
import { ApiKeySettings } from './api-keys.tsx';
import { ThemeSettings } from './theme-settings.tsx';
import {
  sectionOf,
  settingsSections,
  visibleSettingsSections,
  type SettingsSectionKey,
} from '../../lib/page-sections.ts';
import { useNow } from '../../shell/now.ts';

import { importResultSentence } from '../../lib/import-result.ts';
import { settingsTitle } from './accounts.tsx';
import { RemoveOwnAccountDialog } from './remove-account-dialog.tsx';
import { useOpenPortal } from './open-portal.ts';
import { portalHome } from '../../lib/portal.ts';

/** One section of Settings, by its name in the list of the page. */
function settingsSection(key: SettingsSectionKey): PageSection {
  return sectionOf(settingsSections, key);
}

/**
 * The spell check of the editor (record 0103).
 *
 * The box shows the choice at once and the account stores it in the
 * background. The editor reads the stored value, so a write that fails puts
 * the box back and says so, and the two never disagree. Only the answer to
 * the last change counts, so two quick changes end on the second one.
 */
function SpellCheckSettings(): ReactNode {
  const session = useSession();
  const stored = useSpellCheck();
  const [pending, setPending] = useState<boolean | null>(null);
  const [problem, setProblem] = useState('');
  const lastChange = useRef(0);

  function change(next: boolean): void {
    lastChange.current += 1;
    const current = lastChange.current;
    setPending(next);
    setProblem('');
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
      description="Your browser marks the words that it does not know in a note. It does not check code or addresses. The settings of your browser choose the languages."
    >
      <Checkbox
        id="spell-check"
        label="Check spelling"
        checked={pending ?? stored}
        onChange={change}
      />
      {problem === '' ? null : (
        <Notice className="mt-4" tone="problem" message={problem} />
      )}
    </SettingsSection>
  );
}

/** What is kept on this device for use without a connection. */
type OfflineChoices = {
  readonly images: boolean;
  readonly history: boolean;
};

/**
 * What this device can say about the saves that never reached the server.
 *
 * A read that did not answer is not a count of zero (record 0038). The card
 * says that it cannot tell, and it offers the action that keeps the work.
 */
type PendingSaves =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly count: number };

/** Whether this device could state what it keeps for offline use. */
type OfflineStatus = 'loading' | 'ready' | 'failed';

/**
 * Reads and writes what this device keeps for offline use.
 *
 * Notes are always kept. Images and older versions are larger, so each one
 * is a choice. A choice is on when every known item of that kind is already
 * kept, which is what the store records.
 *
 * A read that fails is not a pair of choices that are off (record 0038). The
 * status says that the read failed, so the card can name the failure instead
 * of showing two boxes that state something false about this device.
 */
function useOfflineChoices(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string | null,
): {
  readonly choices: OfflineChoices;
  readonly status: OfflineStatus;
  readonly setChoice: (kind: keyof OfflineChoices, keep: boolean) => void;
} {
  const [choices, setChoices] = useState<OfflineChoices>({
    images: false,
    history: false,
  });
  const [status, setStatus] = useState<OfflineStatus>('loading');
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (store === null || accountId === null || workspaceId === null) {
      setStatus('loading');
      return;
    }
    const activeStore = store;
    let cancelled = false;
    async function read(): Promise<void> {
      try {
        const files = await activeStore.listAcceptedFiles(
          accountId ?? '',
          workspaceId ?? '',
        );
        const images = files.filter(
          (file) => file.kind === 'attachment' && !file.deleted,
        );
        const versions = files.filter((file) => !file.deleted);
        let allImages = images.length > 0;
        for (const file of images) {
          if (file.acceptedHeadDigest === null) continue;
          if (
            !(await activeStore.isAttachmentPinned(
              accountId ?? '',
              workspaceId ?? '',
              file.acceptedHeadDigest,
            ))
          ) {
            allImages = false;
            break;
          }
        }
        let allHistory = versions.length > 0;
        for (const file of versions) {
          if (file.acceptedHeadRevisionId === null) continue;
          if (
            !(await activeStore.isHistoryPinned(
              accountId ?? '',
              workspaceId ?? '',
              file.acceptedHeadRevisionId,
            ))
          ) {
            allHistory = false;
            break;
          }
        }
        if (cancelled) return;
        setChoices({ images: allImages, history: allHistory });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    }
    void read();
    return () => {
      cancelled = true;
    };
  }, [store, accountId, workspaceId, generation]);

  const setChoice = useCallback(
    (kind: keyof OfflineChoices, keep: boolean): void => {
      if (store === null || accountId === null || workspaceId === null) return;
      const activeStore = store;
      const activeAccount = accountId;
      const activeWorkspace = workspaceId;
      setChoices((current) => ({ ...current, [kind]: keep }));
      void (async (): Promise<void> => {
        const files = await activeStore.listAcceptedFiles(
          activeAccount,
          activeWorkspace,
        );
        for (const file of files) {
          if (kind === 'images') {
            if (file.kind !== 'attachment' || file.acceptedHeadDigest === null)
              continue;
            await activeStore.setAttachmentPinned(
              activeAccount,
              activeWorkspace,
              file.acceptedHeadDigest,
              keep,
            );
          } else {
            if (file.acceptedHeadRevisionId === null) continue;
            await activeStore.setHistoryPinned(
              activeAccount,
              activeWorkspace,
              file.acceptedHeadRevisionId,
              keep,
            );
          }
        }
        setGeneration((value) => value + 1);
      })();
    },
    [store, accountId, workspaceId],
  );

  return { choices, status, setChoice };
}

/** How far the list of sessions got. */
type SessionsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly sessions: readonly AccountSession[] };

/**
 * The devices that are signed in to this account (record 0122).
 *
 * The current device is first and has no action here, because the Sign out
 * section ends it. Each other device has its own Sign out, for a lost phone,
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
    </SettingsSection>
  );
}

/** The name a person can change and the sign-in address they can read. */
function ProfileSettings({
  name,
  email,
}: {
  readonly name: string | null | undefined;
  readonly email: string | null | undefined;
}): ReactNode {
  const session = useSession();
  const [draft, setDraft] = useState(name ?? '');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(name ?? '');
  }, [name]);

  async function save(): Promise<void> {
    setAttempted(true);
    setSaved(false);
    setProblem('');
    const fieldProblem = profileNameProblem(draft);
    if (fieldProblem !== null) return;
    const nextName = draft.trim();
    if (nextName === name) return;
    setBusy(true);
    const result = await updateProfile({ body: { name: nextName } });
    setBusy(false);
    if (result.error !== undefined || result.data === undefined) {
      setProblem(problemMessage(result.error));
      return;
    }
    session.adoptProfileName(nextName);
    setSaved(true);
  }

  return (
    <SettingsSection
      section={settingsSection('profile')}
      description="Your name appears with your account. Use your email address to sign in."
    >
      <form
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
        <p className="mb-1 mt-0 text-control font-medium text-strong">
          Email address
        </p>
        <p className="mb-4 mt-0 text-ui text-strong">
          {email ?? 'No address linked'}
        </p>
        {problem === '' ? null : (
          <Notice className="mb-3" tone="problem" message={problem} />
        )}
        {saved ? (
          <Notice
            className="mb-3"
            tone="info"
            message="Your new name appears in your account."
          />
        ) : null}
        <Button type="submit" disabled={busy || draft.trim() === name}>
          {busy ? 'Saving' : 'Save'}
        </Button>
      </form>
    </SettingsSection>
  );
}

/** Account page: profile, theme, offline availability, and sign-out. */
export function AccountSettingsPage(): ReactNode {
  const session = useSession();
  const store = useLocalStore();
  const params = useParams();
  const [pending, setPending] = useState<PendingSaves>({ kind: 'loading' });
  const [signOutError, setSignOutError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  // A refused import is a problem, not news, so it has its own notice.
  const [importError, setImportError] = useState('');
  const [removing, setRemoving] = useState(false);
  const importInput = useRef<HTMLInputElement | null>(null);
  const requestSync = useRequestSync();
  const account = session.account;
  const accountId = account?.accountId ?? null;
  // The address names the workspace, as it does for every page of the frame.
  // The frame only renders this once the account holds that workspace.
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : null;
  const offline = useOfflineChoices(store.store, accountId, workspaceId);
  const documents = useLegalDocuments();
  const portal = useOpenPortal();
  useDocumentTitle(settingsTitle);
  // The limits of the month change with no notice to this device, so the
  // page reads the account again when it opens (record 0193).
  const recheckAccount = session.recheck;
  useEffect(() => {
    recheckAccount();
  }, [recheckAccount]);

  useEffect(() => {
    if (store.store === null || accountId === null || workspaceId === null) {
      setPending({ kind: 'loading' });
      return;
    }
    const activeStore = store.store;
    let cancelled = false;
    void activeStore
      .pending(accountId, workspaceId)
      .then((queue) => {
        if (!cancelled) setPending({ kind: 'ready', count: queue.length });
      })
      .catch(() => {
        if (!cancelled) setPending({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [store.store, accountId, workspaceId]);

  if (account === null) return <Navigate to="/login" replace />;
  // Only a count that arrived can offer the action that removes work. An
  // unknown count keeps the safe action alone (record 0038).
  const unsent = pending.kind === 'ready' && pending.count > 0;

  /**
   * Ends the session on this device.
   *
   * `discard` removes the work that never reached the server. Without it the
   * queued work stays on this device and waits for the next sign-in. Offline
   * sign-out records a marker, so the session is revoked on reconnect before
   * any content comes back.
   */
  function endSignOut(discard: boolean): void {
    setSignOutError('');
    const activeStore = store.store;
    if (!discard || activeStore === null || workspaceId === null) {
      session.signOut();
      return;
    }
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    void endSession(
      activeStore,
      account?.accountId ?? '',
      [workspaceId],
      online,
      true,
      revokeSessionViaClient,
    )
      .then(() => {
        session.refresh();
      })
      .catch((failure: unknown) => {
        setSignOutError(problemMessage(failure));
      });
  }

  // Each section renders in the order of the list that the side region reads,
  // and the type holds one body for each name of the list (decision 0137).
  const sectionBodies: Record<SettingsSectionKey, ReactNode> = {
    profile: <ProfileSettings name={account.name} email={account.email} />,
    appearance: <ThemeSettings />,
    spelling: <SpellCheckSettings />,
    'daily-notes': (
      <SettingsSection
        section={settingsSection('daily-notes')}
        description="Each day has one note, and the calendar in the sidebar opens it. These settings apply to this workspace and follow you to every device."
      >
        <DailyNoteSettingsFields />
      </SettingsSection>
    ),
    templates: (
      <SettingsSection
        section={settingsSection('templates')}
        description="A template is a note that you copy into another note. Select Insert from template in the command palette, and the copy goes in at the cursor. This setting applies to this workspace and follows you to every device."
      >
        <TemplateSettingsFields />
      </SettingsSection>
    ),
    offline: (
      <SettingsSection
        section={settingsSection('offline')}
        description="Your notes are always kept on this device. Images and older versions take more space, so you choose whether to keep them too."
      >
        {offline.status === 'failed' ? (
          <Notice
            tone="problem"
            message="This device cannot say what it keeps offline. Open Settings again to read it."
          />
        ) : offline.status === 'loading' ? (
          // A choice that nothing has read yet is not a choice that is off
          // (record 0038), and the `Checkbox` primitive states no waiting
          // state, so the section shows the shape of the two rows instead.
          <LoadingState
            shape="list"
            rows={2}
            label="What this device keeps offline is loading."
          />
        ) : (
          <div className="flex flex-col">
            <Checkbox
              id="offline-images"
              label="Keep images on this device"
              checked={offline.choices.images}
              onChange={(keep) => {
                offline.setChoice('images', keep);
              }}
            />
            <Checkbox
              id="offline-history"
              label="Keep older versions on this device"
              checked={offline.choices.history}
              onChange={(keep) => {
                offline.setChoice('history', keep);
              }}
            />
          </div>
        )}
      </SettingsSection>
    ),
    export: (
      <SettingsSection
        section={settingsSection('export')}
        description="Download every note and image as a zip. The files keep their folders and need no application to be read again."
      >
        {exportError === '' ? null : (
          <Notice className="mb-3" tone="problem" message={exportError} />
        )}
        <Button
          variant="secondary"
          icon={<DownloadIcon />}
          disabled={exporting || workspaceId === null}
          onClick={() => {
            if (workspaceId === null) return;
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
          {exporting ? 'Preparing the download' : 'Export all notes'}
        </Button>
      </SettingsSection>
    ),
    import: (
      <SettingsSection
        section={settingsSection('import')}
        description="Import a zip of Markdown files and images. The files keep their paths and links."
      >
        {importNotice === '' ? null : (
          <Notice className="mb-3" tone="info" message={importNotice} />
        )}
        {importError === '' ? null : (
          <Notice className="mb-3" tone="problem" message={importError} />
        )}
        <input
          ref={importInput}
          className="sr-only"
          type="file"
          accept=".zip,application/zip"
          aria-label="Choose a workspace zip archive"
          onChange={(event): void => {
            const file = event.target.files?.[0];
            if (file === undefined || workspaceId === null) return;
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
        <Button
          variant="secondary"
          icon={<UploadIcon />}
          disabled={importing || workspaceId === null}
          onClick={() => importInput.current?.click()}
        >
          {importing ? 'Importing files' : 'Import workspace'}
        </Button>
      </SettingsSection>
    ),
    account: (
      <SettingsSection
        section={settingsSection('account')}
        description="Your account owns every note in your workspaces. No other account can read them."
      >
        {monthNotices(account.month).map((notice) => (
          <Notice key={notice} className="mb-3" tone="info" message={notice} />
        ))}
        {storageLine(account.storage) === '' ? null : (
          <p className="mb-0 mt-1 text-control text-muted">
            {storageLine(account.storage)}
          </p>
        )}
        {transferLines(account.month, account.controls).map((line) => (
          <p key={line} className="mb-0 mt-1 text-control text-muted">
            {line}
          </p>
        ))}
        {account.installationRole === 'administrator' &&
        workspaceId !== null ? (
          <Link
            className={`mt-3 ${buttonClassName({ variant: 'secondary' })}`}
            to={`/w/${workspaceId}/accounts`}
          >
            <span className="inline-flex items-center" aria-hidden="true">
              <UsersIcon />
            </span>
            <span>Manage accounts</span>
          </Link>
        ) : null}
        {documents === null ? null : (
          <LegalLinks className="mt-3" documents={documents} />
        )}
      </SettingsSection>
    ),
    billing: (
      // The account portal of the operator, for any standing (records 0190
      // and 0211). The one filled action of the page stays Save, so this is
      // secondary. `visibleSettingsSections` shows the section only when the
      // installation names a portal.
      <SettingsSection
        section={settingsSection('billing')}
        description="See and change your plan, your payment method and your invoices."
      >
        {portal.error === '' ? null : (
          <Notice className="mb-3" tone="problem" message={portal.error} />
        )}
        <Button
          variant="secondary"
          icon={<ExternalLinkIcon />}
          disabled={portal.busy}
          onClick={() => {
            void portal.open(portalHome);
          }}
        >
          Open billing
        </Button>
      </SettingsSection>
    ),
    'api-keys': <ApiKeySettings />,
    sessions: <SessionsSettings />,
    'sign-out': (
      <SettingsSection
        section={settingsSection('sign-out')}
        description={
          pending.kind === 'loading'
            ? undefined
            : unsent
              ? 'Some saves have not reached the server yet. Keep them on this device for the next sign-in, or remove them now.'
              : pending.kind === 'failed'
                ? 'This device cannot say what is still waiting to reach the server. Sign out keeps your work on this device.'
                : 'Every save on this device reached the server.'
        }
      >
        {signOutError === '' ? null : (
          <Notice className="mb-3" tone="problem" message={signOutError} />
        )}
        <div className="flex flex-wrap gap-cluster">
          <Button
            variant="secondary"
            icon={<SignOutIcon />}
            onClick={() => {
              endSignOut(false);
            }}
          >
            {unsent ? 'Sign out and keep them' : 'Sign out on this device'}
          </Button>
          {unsent ? (
            <Button
              variant="danger"
              onClick={() => {
                endSignOut(true);
              }}
            >
              Sign out and remove them
            </Button>
          ) : null}
        </div>
      </SettingsSection>
    ),
    'remove-account': (
      <SettingsSection
        section={settingsSection('remove-account')}
        description="This removes your account and every note in your workspaces for good. Export your notes first if you want to keep them."
      >
        <Button
          variant="secondary"
          tone="danger"
          icon={actionIcon(deleteGlyph)}
          onClick={() => {
            setRemoving(true);
          }}
        >
          Remove my account
        </Button>
      </SettingsSection>
    ),
  };

  const sections = visibleSettingsSections(account);
  return (
    <Page sections={sections}>
      <PageHeader title={settingsTitle} />
      <div>
        {sections.map((section) => (
          <Fragment key={section.key}>{sectionBodies[section.key]}</Fragment>
        ))}
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
    </Page>
  );
}
