import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isLocalStorageError, type LocalStore } from '@notesapp/sync';
import { generateUUID } from '@notesapp/core';
import {
  Button,
  PageHeader,
  PageRegion,
  tabClassName,
  focusOutline,
} from '@notesapp/ui';
import { noteSaveReport, useNoteSavePublisher } from './save-status.tsx';

/** Keeps an older draft out of the editor until its owner selects a version. */
export function StaleDraftRecovery({
  store,
  accountId,
  workspaceId,
  workingCopyId,
  sequence,
  draftText,
  localText,
  acceptedText,
  onResolved,
}: {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly workingCopyId: string;
  readonly sequence: number;
  readonly draftText: string;
  readonly localText: string;
  readonly acceptedText: string;
  readonly onResolved: () => void;
}) {
  const active = useRef(false);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');
  const [tab, setTab] = useState<'device' | 'saved'>('device');
  const tabs = useRef<Partial<Record<'device' | 'saved', HTMLButtonElement>>>(
    {},
  );
  const [recoveryId] = useState(generateUUID);
  const [viewport] = useState(() => window.matchMedia('(min-width: 1024px)'));
  const wide = useSyncExternalStore(
    (changed) => {
      viewport.addEventListener('change', changed);
      return () => viewport.removeEventListener('change', changed);
    },
    () => viewport.matches,
    () => false,
  );
  const publish = useNoteSavePublisher();
  useEffect(() => {
    publish(
      noteSaveReport({
        pendingSave: true,
        localWritePending: false,
        storageError: null,
        lastSavedAt: null,
      }),
    );
  }, [publish]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  /** Keep the device draft or use the saved version, one choice at a time. */
  const resolve = async (keep: boolean): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setProblem('');
    let resolved = false;
    try {
      if (keep) await store.rebaseDraft(accountId, workspaceId, workingCopyId);
      else {
        const draft = await store.readDraft(
          accountId,
          workspaceId,
          workingCopyId,
        );
        if (draft !== null) {
          if (draft.sequence !== sequence || draft.text !== draftText) {
            if (active.current) onResolved();
            return;
          }
          await store.dropDraft(accountId, workspaceId, workingCopyId, {
            expected: draft,
            recoveryId,
            text: localText,
          });
        }
      }
      resolved = true;
      if (active.current) onResolved();
    } catch (failure: unknown) {
      if (active.current) {
        if (isLocalStorageError(failure) && failure.kind === 'stale')
          onResolved();
        else setProblem('Could not keep this text. Try again.');
      }
    } finally {
      if (!resolved) {
        busy.current = false;
        if (active.current) setPending(false);
      }
    }
  };

  return (
    <PageRegion>
      <PageHeader
        title="Two versions of this note"
        description="This note changed on another device. Choose which text to keep."
      />
      <div
        role="tablist"
        aria-label="Versions"
        className="mb-3 flex gap-2 lg:hidden"
      >
        {(['device', 'saved'] as const).map((entry) => (
          <button
            type="button"
            key={entry}
            ref={(element) => {
              if (element === null) delete tabs.current[entry];
              else tabs.current[entry] = element;
            }}
            role="tab"
            id={`recovery-${entry}-tab`}
            aria-selected={tab === entry}
            aria-controls={`recovery-${entry}`}
            tabIndex={tab === entry ? 0 : -1}
            className={tabClassName({ selected: tab === entry })}
            onClick={() => setTab(entry)}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 'device'
                  : event.key === 'End'
                    ? 'saved'
                    : tab === 'device'
                      ? 'saved'
                      : 'device';
              setTab(next);
              tabs.current[next]?.focus();
            }}
          >
            {entry === 'device' ? 'This device' : 'Saved version'}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['device', 'saved'] as const).map((entry) => (
          <section
            key={entry}
            id={`recovery-${entry}`}
            role={wide ? 'region' : 'tabpanel'}
            aria-labelledby={`recovery-${entry}-${wide ? 'heading' : 'tab'}`}
            className={tab === entry ? 'min-w-0' : 'hidden min-w-0 lg:block'}
          >
            <h2
              id={`recovery-${entry}-heading`}
              className="mb-2 mt-0 hidden text-title-header lg:block"
            >
              {entry === 'device' ? 'This device' : 'Saved version'}
            </h2>
            <pre
              tabIndex={0}
              className={`m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-edge-subtle bg-card p-3 text-preview ${focusOutline}`}
            >
              {entry === 'device' ? localText : acceptedText}
            </pre>
          </section>
        ))}
      </div>
      <p className="text-secondary text-muted">
        If you use the saved version, this device's text stays in Needs
        attention.
      </p>
      {problem === '' ? null : (
        <p role="alert" className="text-secondary text-danger">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2" aria-busy={pending}>
        <Button disabled={pending} onClick={() => void resolve(true)}>
          {pending ? 'Keeping...' : "Keep this device's text"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => void resolve(false)}
        >
          Use saved version
        </Button>
      </div>
    </PageRegion>
  );
}
