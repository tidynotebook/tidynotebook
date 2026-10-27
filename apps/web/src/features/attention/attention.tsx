/**
 * The Needs attention screen: every save the server refused for good.
 *
 * A refused save is parked. It is never sent again, so without this screen
 * the text lives only in a browser row that nothing reads. Here the person
 * sees the note name, one sentence for the cause, and how long ago it
 * happened, and takes one of four actions.
 *
 * Retry sends the work again on top of the current accepted head, so a save
 * that a stale head or a taken name refused can now succeed. It saves the
 * document of the note when that holds the work, and the kept text when it
 * does not (`parked-actions.ts`, record 0183). Save as new note
 * keeps the text in a separate note. Copy text puts it on the clipboard.
 * Discard needs a second click, because it is the only action that ends with
 * the text gone.
 *
 * The screen calls no network operation. The actions run through the local
 * store (`parked-actions.ts`), and the sync engine sends the requeued save.
 */
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import {
  Button,
  CheckIcon,
  CopyIcon,
  EmptyState,
  ListRow,
  LoadingState,
  Notice,
  Page,
  pageGroupLabelClassName,
  PageHeader,
  pageListClassName,
  StatusRegion,
} from '@notesapp/ui';
import { actionIcon } from '../../shell/action-icons.tsx';
import { deleteGlyph } from '../../lib/delete-label.ts';
import { attentionTitle, useParkedSaves } from './attention-link.tsx';
import { useLocalStore, useSession } from '../../app.tsx';
import { copyText } from '../../platform.ts';
import { parkedSaveLines, type ParkedSave } from '../../lib/parked-saves.ts';
import {
  discardParked,
  keepParkedAsNote,
  retryParked,
  type ParkedPlace,
} from './parked-actions.ts';
import { useNow } from '../../shell/now.ts';
import { productName } from '@notesapp/core';

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
  const lines = parkedSaveLines(save, now);

  return (
    <ListRow className="flex-col items-stretch py-3">
      <div className="min-w-0">
        <p className="m-0 truncate text-ui text-strong">{save.name}</p>
        <p className="m-0 text-control text-muted">{lines.cause}</p>
        <p className="m-0 text-control text-muted">{lines.kept}</p>
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
          label={`Save as new note from ${save.name}`}
          onClick={() => {
            onSaveAsNew(save);
          }}
        >
          Save as new note
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<CopyIcon />}
          label={
            copied
              ? `Copied the text of ${save.name}`
              : `Copy text of ${save.name}`
          }
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
              icon={actionIcon(deleteGlyph)}
              label={`Confirm discard of the kept text of ${save.name}`}
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
            tone="danger"
            icon={actionIcon(deleteGlyph)}
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
  const now = new Date(useNow());

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

  const place: ParkedPlace = { store, accountId, workspaceId };

  /** Reports one local write failure without losing the kept text. */
  const reportFailure = (action: string): void => {
    setFailure(`${action} did not work. Try again. The text stays here.`);
  };

  /** Runs one action of a row, then states what it did or why it failed. */
  const act = (run: () => Promise<string>, action: string): void => {
    void (async (): Promise<void> => {
      try {
        const done = await run();
        setFailure(null);
        setNotice(done);
        reload();
      } catch {
        reportFailure(action);
      }
    })();
  };

  const onRetry = (save: ParkedSave): void => {
    act(async () => {
      await retryParked(place, save);
      return `The save of ${save.name} is queued again.`;
    }, 'The retry');
  };

  const onSaveAsNew = (save: ParkedSave): void => {
    act(async () => {
      const name = await keepParkedAsNote(place, save);
      return `The text is kept as the note ${name}.`;
    }, 'The new note');
  };

  const onDiscard = (save: ParkedSave): void => {
    act(async () => {
      await discardParked(place, save);
      return `The kept text of ${save.name} is discarded.`;
    }, 'The discard');
  };

  return (
    <Page>
      <PageHeader
        title={attentionTitle}
        description={`${productName} keeps text here when it cannot complete a save. Retry the save, or create a new note from its text.`}
      />
      <div className="space-y-4">
        {error === null ? null : <Notice tone="problem" message={error} />}
        {failure === null ? null : <Notice tone="problem" message={failure} />}
        {notice === '' ? null : <StatusRegion message={notice} />}
        {saves.length === 0 ? (
          // Nothing waits here, which is the good state, so the mark is the
          // check and not the alert of a screen that reports a problem.
          <EmptyState
            icon={<CheckIcon size={20} />}
            title="No save needs attention"
            description="There is no kept text for you to review."
          />
        ) : (
          <section aria-labelledby="attention-heading">
            <h2 className={pageGroupLabelClassName()} id="attention-heading">
              Text to review
            </h2>
            <ul className={pageListClassName()}>
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
          </section>
        )}
      </div>
    </Page>
  );
}
