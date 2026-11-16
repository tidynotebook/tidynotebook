/**
 * Sign out from the account menu (issue 517, item 10).
 *
 * Sign out is not a section of Settings. The account menu holds it, and it
 * keeps the check of the old section: when saves of this workspace have not
 * reached the server, a confirmation offers to keep them on this device for
 * the next sign-in or to remove them. A count that this device cannot read is
 * not a count of zero (record 0038), so that case asks too and offers only
 * the action that keeps the work. The confirmation loads only when needed.
 */
import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { useLocalStore, useSession } from '../app.tsx';

const SignOutDialog = lazy(async () => ({
  default: (await import('./sign-out-dialog.tsx')).SignOutDialog,
}));

/**
 * Sign out of the account menu: `start` checks the waiting saves and signs
 * out at once when there are none, and `dialog` is the confirmation.
 */
export function useSignOut(workspaceId: string): {
  readonly start: () => void;
  readonly dialog: ReactNode;
} {
  const session = useSession();
  const store = useLocalStore();
  const [waiting, setWaiting] = useState<'none' | 'unsent' | 'unknown'>('none');
  const accountId = session.account?.accountId ?? null;

  const start = useCallback((): void => {
    const activeStore = store.store;
    if (activeStore === null || accountId === null) {
      session.signOut();
      return;
    }
    void activeStore
      .pending(accountId, workspaceId)
      .then((queue) => {
        if (queue.length === 0) session.signOut();
        else setWaiting('unsent');
      })
      .catch(() => {
        setWaiting('unknown');
      });
  }, [store.store, accountId, workspaceId, session]);

  const dialog =
    waiting === 'none' ? null : (
      <Suspense fallback={null}>
        <SignOutDialog
          workspaceId={workspaceId}
          waiting={waiting}
          onClose={() => {
            setWaiting('none');
          }}
        />
      </Suspense>
    );

  return { start, dialog };
}
