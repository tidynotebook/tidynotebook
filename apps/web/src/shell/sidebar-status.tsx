import {
  StatusLine,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  focusOutlineInset,
} from '@notesapp/ui';
/** One short status line. Details retain the full save and connection messages. */
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';

import { useLocalStore, useSession, useSyncState } from '../app.tsx';
import {
  useLiveConnection,
  useNoteSaveFact,
  useOnline,
} from '../features/editor/save-status.tsx';
import { useCalmSyncView } from './use-calm-sync.ts';
import { syncDotClassName } from '../lib/sync-state.ts';

const SidebarAttention = lazy(async () => ({
  default: (await import('./sidebar-attention.tsx')).SidebarAttention,
}));

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
  const live = useLiveConnection();
  const footer = useCalmSyncView({
    state: sync.state,
    online,
    failed,
    pending,
    editing,
  });
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
  const connection =
    live === 'Offline'
      ? 'Offline. Your edits merge when you reconnect.'
      : live === 'Reconnecting'
        ? 'Reconnecting. Your edits are safe on this device.'
        : null;
  const needsAttention = store.error !== null || footer.dot === 'attention';
  const connectionLine = needsAttention ? null : connection;
  const dot = needsAttention
    ? 'attention'
    : connectionLine === null
      ? footer.dot
      : 'pending';
  const message = store.error ?? connectionLine ?? footer.line;
  const details = dot !== 'saved';
  const short =
    connectionLine ??
    (dot === 'saved'
      ? footer.line
      : waiting > 0
        ? `${waiting} ${waiting === 1 ? 'change' : 'changes'} waiting`
        : dot === 'attention'
          ? 'Save problem'
          : !online || sync.state.kind === 'waiting'
            ? 'Offline'
            : 'Waiting to upload');
  const content = (
    <>
      <span className={syncDotClassName(dot)} aria-hidden="true" />
      <span
        className={connectionLine === null ? 'min-w-0 truncate' : 'min-w-0'}
      >
        {short}
      </span>
    </>
  );
  return (
    <>
      <div role="status" aria-live="polite" className="shrink-0">
        {details ? (
          <StatusLine
            as="button"
            type="button"
            className={`ui-sidebar-status flex w-full cursor-pointer items-center bg-transparent text-left text-secondary text-muted hover:bg-hover ${focusOutlineInset}`}
            aria-label={`${short}${short.endsWith('.') ? '' : '.'} Show save details`}
            onClick={() => setOpen(true)}
          >
            {content}
          </StatusLine>
        ) : null}
        <span className="sr-only">
          {!details || short === message ? '' : message}
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
          <p className="m-0 text-body text-strong">{message}</p>
          {open ? (
            <Suspense>
              <SidebarAttention workspaceId={workspaceId} />
            </Suspense>
          ) : null}
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
