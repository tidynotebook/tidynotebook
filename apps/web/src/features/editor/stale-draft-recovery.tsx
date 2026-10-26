import { useEffect, useRef, useState } from 'react';
import { isLocalStorageError, type LocalStore } from '@notesapp/sync';
import { generateUUID } from '@notesapp/core';
import { Button, PageHeader, PageRegion } from '@notesapp/ui';
import { noteSaveReport, useNoteSavePublisher } from './save-status.tsx';

/** Keeps an older draft out of the editor until its owner selects a version. */
export function StaleDraftRecovery({
  store,
  accountId,
  workspaceId,
  workingCopyId,
  sequence,
  localText,
  acceptedText,
  onResolved,
}: {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly workingCopyId: string;
  readonly sequence: number;
  readonly localText: string;
  readonly acceptedText: string;
  readonly onResolved: () => void;
}) {
  const active = useRef(false);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState('');
  const [recoveryId] = useState(generateUUID);
  const publish = useNoteSavePublisher();
  useEffect(() => {
    publish(
      noteSaveReport({
        pendingSave: true,
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
          if (draft.sequence !== sequence || draft.text !== localText) {
            if (active.current) onResolved();
            return;
          }
          await store.dropDraft(accountId, workspaceId, workingCopyId, {
            expected: draft,
            recoveryId,
          });
        }
      }
      resolved = true;
      if (active.current) onResolved();
    } catch (failure: unknown) {
      if (active.current) {
        if (isLocalStorageError(failure) && failure.kind === 'stale')
          onResolved();
        else setProblem('The draft could not be recovered. Try again.');
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
        title="Recover local draft"
        description="The saved note changed after this local draft. Choose which text to use before editing."
      />
      <p className="text-control text-muted">
        If you use the saved version, the local draft stays in Needs attention.
      </p>
      <h2 className="text-control font-semibold">Local draft</h2>
      <pre className="whitespace-pre-wrap break-words rounded-lg border border-edge-subtle bg-card p-3 text-control">
        {localText}
      </pre>
      <h2 className="text-control font-semibold">Saved version</h2>
      <pre className="whitespace-pre-wrap break-words rounded-lg border border-edge-subtle bg-card p-3 text-control">
        {acceptedText}
      </pre>
      {problem === '' ? null : (
        <p role="alert" className="text-control text-danger">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2" aria-busy={pending}>
        <Button disabled={pending} onClick={() => void resolve(true)}>
          Keep local draft
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
