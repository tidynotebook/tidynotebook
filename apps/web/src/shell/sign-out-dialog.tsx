/**
 * The confirmation of Sign out when saves wait on this device (issue 517,
 * item 10). It loads only when the account menu needs it.
 */
import { useId, useState, type ReactNode } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, Notice } from '@notesapp/ui';
import { problemMessage, useLocalStore, useSession } from '../app.tsx';
import {
  signOut as endSession,
  revokeSessionViaClient,
} from '../pwa/lifecycle.ts';

/** What Sign out found waiting on this device. */
export type Waiting = 'unsent' | 'unknown';

/** The text of the confirmation for one state of the waiting saves. */
export function signOutQuestion(waiting: Waiting): string {
  return waiting === 'unsent'
    ? 'Some saves have not reached the server yet. Keep them on this device for the next sign-in, or remove them now.'
    : 'This device cannot say what is still waiting to reach the server. Sign out keeps your work on this device.';
}

/** Asks how to sign out while saves wait, then signs out. */
export function SignOutDialog({
  workspaceId,
  waiting,
  onClose,
}: {
  readonly workspaceId: string;
  readonly waiting: Waiting;
  readonly onClose: () => void;
}): ReactNode {
  const session = useSession();
  const store = useLocalStore();
  const [problem, setProblem] = useState('');
  const titleId = useId();
  const accountId = session.account?.accountId ?? null;

  /**
   * Ends the session on this device. `discard` removes the work that never
   * reached the server; without it the work waits for the next sign-in.
   */
  function finish(discard: boolean): void {
    setProblem('');
    const activeStore = store.store;
    if (!discard || activeStore === null || accountId === null) {
      onClose();
      session.signOut();
      return;
    }
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    void endSession(
      activeStore,
      accountId,
      [workspaceId],
      online,
      true,
      revokeSessionViaClient,
    )
      .then(() => {
        onClose();
        session.refresh();
      })
      .catch((failure: unknown) => {
        setProblem(problemMessage(failure));
      });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Sign out?"
      titleId={titleId}
      width="small"
      align="center"
    >
      <DialogBody>
        <p className="m-0 text-body text-strong">{signOutQuestion(waiting)}</p>
        {problem === '' ? null : (
          <Notice className="mt-3" tone="problem" message={problem} />
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {waiting === 'unsent' ? (
          <Button
            variant="secondary"
            tone="danger"
            onClick={() => {
              finish(true);
            }}
          >
            Remove and sign out
          </Button>
        ) : null}
        <Button
          variant="primary"
          onClick={() => {
            finish(false);
          }}
        >
          {waiting === 'unsent' ? 'Sign out and keep them' : 'Sign out'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
