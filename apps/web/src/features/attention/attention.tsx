/**
 * The Needs attention screen: every save the server refused for good.
 *
 * A refused save is parked. It is never sent again, so without this screen
 * the text lives only in a browser row that nothing reads. Here the person
 * sees the note name, one sentence for the cause, and how long ago it
 * happened, and takes one of four actions.
 *
 * Retry writes the text again on top of the current accepted head, so a save
 * that a stale head or a taken name refused can now succeed. Save as new note
 * keeps the text in a separate note. Copy text puts it on the clipboard.
 * Discard needs a second click, because it is the only action that ends with
 * the text gone.
 *
 * The screen calls no network operation. Everything runs through the local
 * store, and the sync engine sends the requeued save.
 */
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { generateUUID } from '@notesapp/core';
import { type Draft } from '@notesapp/sync';
import {
  AlertCircleIcon,
  Button,
  buttonClassName,
  Card,
  EmptyState,
  ListRow,
  LoadingState,
  Notice,
  Page,
  PageHeader,
  StatusRegion,
  TrashIcon,
  CopyIcon,
} from '@notesapp/ui';
import { attentionTitle, useParkedSaves } from './attention-link.tsx';
import { useLocalStore, useSession } from '../../app.tsx';
import { copyText } from '../../platform.ts';
import { storageNotePath } from '../../lib/note-name.ts';
import {
  parkedSaveTime,
  recoveredNoteName,
  type ParkedSave,
} from '../../lib/parked-saves.ts';

/** One row of the list with its four actions. */
function ParkedSaveRow({
  save,
  now,
  onRetry,
  onSaveAsNew,
  onDiscard,
}: {
  readonly save: ParkedSave;
  readonly now: Date;
  readonly onRetry: (save: ParkedSave) => void;
  readonly onSaveAsNew: (save: ParkedSave) => void;
  readonly onDiscard: (save: ParkedSave) => void;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <ListRow className="flex-col items-stretch py-3">
      <div className="min-w-0">
        <p className="m-0 truncate text-ui font-medium text-strong">
          {save.name}
        </p>
        <p className="m-0 text-control text-muted">
          {save.reason} The text stays on this device{' '}
          {parkedSaveTime(save.createdAt, now)}.
        </p>
      </div>
      <details>
        <summary className="cursor-pointer text-control text-muted">
          Kept text
        </summary>
        <pre
          className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-edge-subtle bg-surface p-3 font-mono text-control text-strong"
          aria-label={`Kept text of ${save.name}`}
        >
          {save.text}
        </pre>
      </details>
      <div className="flex flex-wrap items-center gap-cluster">
        <Button
          variant="primary"
          size="sm"
          label={`Retry the save of ${save.name}`}
          onClick={() => {
            onRetry(save);
          }}
        >
          Retry
        </Button>
        <Button
          variant="secondary"
          size="sm"
          label={`Keep the text of ${save.name} as a new note`}
          onClick={() => {
            onSaveAsNew(save);
          }}
        >
          Save as new note
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<CopyIcon size={14} />}
          label={`Copy the text of ${save.name}`}
          onClick={() => {
            void copyText(save.text).then((ok) => {
              setCopied(ok);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy text'}
        </Button>
        {confirming ? (
          <>
            <Button
              variant="danger"
              size="sm"
              icon={<TrashIcon size={14} />}
              label={`Confirm that the kept text of ${save.name} is discarded`}
              onClick={() => {
                setConfirming(false);
                onDiscard(save);
              }}
            >
              Confirm discard
            </Button>
            <Button
              variant="ghost"
              size="sm"
              label={`Keep the text of ${save.name}`}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={<TrashIcon size={14} />}
            label={`Discard the kept text of ${save.name}`}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Discard
          </Button>
        )}
      </div>
    </ListRow>
  );
}

/** The routed Needs attention screen of one workspace. */
export function AttentionRoute(): ReactNode {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : null;
  const session = useSession();
  const { store } = useLocalStore();
  const accountId = session.account?.accountId ?? null;
  const { saves, error, reload } = useParkedSaves(
    store,
    accountId,
    workspaceId,
  );
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const now = new Date();

  if (workspaceId === null || accountId === null || store === null)
    return (
      <Page>
        <PageHeader title={attentionTitle} />
        <LoadingState
          shape="list"
          rows={3}
          label="The saves that need attention are loading."
        />
      </Page>
    );

  const activeStore = store;
  const activeAccount = accountId;
  const activeWorkspace = workspaceId;

  /** Reports one local write failure without losing the kept text. */
  const reportFailure = (action: string): void => {
    setFailure(`${action} did not work. Try again. The text stays here.`);
  };

  /** Writes one text as a checkpoint on top of the accepted head it names. */
  const queueText = async (
    fileId: string,
    path: string,
    text: string,
  ): Promise<void> => {
    const files = await activeStore.listAcceptedFiles(
      activeAccount,
      activeWorkspace,
    );
    const accepted =
      files.find((file) => file.fileId === fileId)?.acceptedHeadRevisionId ??
      null;
    const draft: Draft = {
      accountId: activeAccount,
      workspaceId: activeWorkspace,
      workingCopyId: generateUUID(),
      fileId,
      baseRevisionId: accepted,
      text,
      path,
      deleted: false,
      sequence: 1,
    };
    await activeStore.saveDraft(draft);
    await activeStore.checkpoint(draft, null);
    await activeStore.dropDraft(
      activeAccount,
      activeWorkspace,
      draft.workingCopyId,
    );
  };

  /**
   * Drops the parked queue entry of one kept text.
   *
   * The entry, its checkpoints, and the local head they set go together, so
   * the note returns to its accepted state before anything is written on top
   * of it. The kept copy stays until the action that follows succeeded, so a
   * failure never leaves the person with neither.
   */
  const dropParked = async (save: ParkedSave): Promise<void> => {
    if (save.mutationId === null) return;
    await activeStore.discardQueueEntry(activeAccount, save.mutationId);
  };

  const onRetry = (save: ParkedSave): void => {
    void (async (): Promise<void> => {
      try {
        await dropParked(save);
        await queueText(save.fileId, save.path, save.text);
        await activeStore.removeRecovery(
          activeAccount,
          activeWorkspace,
          save.recoveryId,
        );
        setFailure(null);
        setNotice(`The save of ${save.name} is queued again.`);
        reload();
      } catch {
        reportFailure('The retry');
      }
    })();
  };

  const onSaveAsNew = (save: ParkedSave): void => {
    void (async (): Promise<void> => {
      try {
        const files = await activeStore.listLocalFiles(
          activeAccount,
          activeWorkspace,
        );
        const name = recoveredNoteName(
          save.name,
          files.map((file) => file.path),
        );
        await dropParked(save);
        await queueText(generateUUID(), storageNotePath(name), save.text);
        await activeStore.removeRecovery(
          activeAccount,
          activeWorkspace,
          save.recoveryId,
        );
        setFailure(null);
        setNotice(`The text is kept as the note ${name}.`);
        reload();
      } catch {
        reportFailure('The new note');
      }
    })();
  };

  const onDiscard = (save: ParkedSave): void => {
    void (async (): Promise<void> => {
      try {
        await dropParked(save);
        await activeStore.removeRecovery(
          activeAccount,
          activeWorkspace,
          save.recoveryId,
        );
        setFailure(null);
        setNotice(`The kept text of ${save.name} is discarded.`);
        reload();
      } catch {
        reportFailure('The discard');
      }
    })();
  };

  return (
    <Page>
      <PageHeader
        title={attentionTitle}
        description="Notesapp keeps text here when it cannot complete a save. Retry the save, or create a new note from its text."
        actions={
          <Link
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            to={`/w/${activeWorkspace}`}
          >
            Back to your notes
          </Link>
        }
      />
      <div className="space-y-4">
        {error === null ? null : <Notice tone="problem" message={error} />}
        {failure === null ? null : <Notice tone="problem" message={failure} />}
        {notice === '' ? null : <StatusRegion message={notice} />}
        {saves.length === 0 ? (
          <EmptyState
            icon={<AlertCircleIcon size={24} />}
            title="No save needs attention"
            description="There is no kept text for you to review."
          />
        ) : (
          <Card title="Text to review" titleId="attention-heading">
            <ul className="m-0 list-none p-0">
              {saves.map((save) => (
                <ParkedSaveRow
                  key={save.recoveryId}
                  save={save}
                  now={now}
                  onRetry={onRetry}
                  onSaveAsNew={onSaveAsNew}
                  onDiscard={onDiscard}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Page>
  );
}
