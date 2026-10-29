/** One short status line. Details retain the full save and connection messages. */
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  focusOutlineInset,
} from '@notesapp/ui';
import { useLocalStore, useSession, useSyncState } from '../app.tsx';
import {
  AttentionLink,
  useAttentionCount,
} from '../features/attention/attention-link.tsx';
import { useNoteSaveFact, useOnline } from '../features/editor/save-status.tsx';
import { useCalmSyncView } from './use-calm-sync.ts';
import { syncDotClassName } from '../lib/sync-state.ts';

export function SidebarStatus({
  workspaceId,
}: {
  readonly workspaceId: string;
}): ReactNode {
  const store = useLocalStore(),
    session = useSession(),
    sync = useSyncState(),
    online = useOnline();
  const failed = useNoteSaveFact((r) => r?.localWriteFailed ?? false);
  const pending = useNoteSaveFact((r) => r?.pendingSave ?? false);
  const editing = useNoteSaveFact((r) => r?.localWritePending ?? false);
  const footer = useCalmSyncView({
    state: sync.state,
    online,
    failed,
    pending,
    editing,
  });
  const attention = useAttentionCount(
    store.store,
    session.account?.accountId ?? null,
    workspaceId,
  );
  const [waiting, setWaiting] = useState(0),
    [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    const local = store.store,
      accountId = session.account?.accountId;
    if (!local || !accountId) return;
    let stopped = false;
    const read = () => {
      void local
        .pending(accountId, workspaceId)
        .then((entries) => {
          if (!stopped) setWaiting(entries.length);
        })
        .catch(() => {});
    };
    read();
    const stop = local.subscribe((change) => {
      if (
        change.accountId === accountId &&
        change.workspaceId === workspaceId &&
        ['queue', 'reset'].includes(change.kind)
      )
        read();
    });
    return () => {
      stopped = true;
      stop();
    };
  }, [store.store, session.account?.accountId, workspaceId]);
  const details = footer.dot !== 'saved' || store.error !== null;
  const short =
    footer.dot === 'saved'
      ? footer.line
      : waiting > 0
        ? `${waiting} ${waiting === 1 ? 'change' : 'changes'} waiting`
        : footer.dot === 'attention'
          ? 'Save problem'
          : !online || sync.state.kind === 'waiting'
            ? 'Offline'
            : 'Waiting to upload';
  const content = (
    <>
      <span className={syncDotClassName(footer.dot)} aria-hidden="true" />
      <span className="min-w-0 truncate">{short}</span>
    </>
  );
  return (
    <>
      <div role="status" aria-live="polite" className="shrink-0">
        {details ? (
          <button
            type="button"
            className={`ui-sidebar-status flex w-full cursor-pointer items-center gap-2 bg-transparent text-left text-secondary text-muted hover:bg-hover ${focusOutlineInset}`}
            aria-label={`${short}. Show save details`}
            onClick={() => setOpen(true)}
          >
            {content}
          </button>
        ) : (
          <div className="ui-sidebar-status flex items-center gap-2 text-secondary text-muted">
            {content}
          </div>
        )}
        <span className="sr-only">
          {short === footer.line ? '' : footer.line}
          {store.error === null ? '' : ` ${store.error}`}
        </span>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Save status"
        titleId={titleId}
        width="small"
        align="center"
      >
        <DialogBody>
          <p className="m-0 text-body text-strong">{footer.line}</p>
          {store.error === null ? null : (
            <p className="mt-2 text-secondary text-danger">{store.error}</p>
          )}
          <AttentionLink workspaceId={workspaceId} count={attention} />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="primary"
            onClick={() => {
              sync.requestSync();
              setOpen(false);
            }}
          >
            Try again
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
