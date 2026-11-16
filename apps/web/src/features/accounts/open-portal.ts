/**
 * The one call of the handoff to the account portal (record 0190).
 *
 * Settings, the screen of a locked account and the route `/portal` all open
 * the portal through this hook, so a person reads the same states in each.
 */
import { useCallback, useState } from 'react';
import { openAccountPortal } from '@notesapp/api-client';
import { problemMessage } from '../../app.tsx';

/** The handoff to the portal, and what a person reads while it runs. */
export type OpenPortal = {
  /** Asks for the handoff and leaves for the portal when it answers. */
  readonly open: (path: string, newTab?: boolean) => Promise<void>;
  /** True from the request until the browser leaves or the request fails. */
  readonly busy: boolean;
  /** The message of a request that failed, or an empty text. */
  readonly error: string;
  /** Clears the message, when the person starts another action. */
  readonly reset: () => void;
};

/**
 * Opens one path of the portal through the handoff.
 *
 * The server answers the address of the portal with a single-use token, and
 * the browser leaves for it. A failure keeps the person on the screen with
 * one message.
 */
export function useOpenPortal(): OpenPortal {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = useCallback(
    async (path: string, newTab = false): Promise<void> => {
      setBusy(true);
      setError('');
      const tab = newTab ? window.open('about:blank', '_blank') : null;
      if (newTab && tab === null) {
        setBusy(false);
        setError('Allow a new tab to open billing.');
        return;
      }
      if (tab !== null) tab.opener = null;
      const result = await openAccountPortal({ body: { path } });
      if (result.data === undefined) {
        tab?.close();
        setBusy(false);
        setError(problemMessage(result.error));
        return;
      }
      if (tab === null) window.location.assign(result.data.url);
      else {
        tab.location.replace(result.data.url);
        setBusy(false);
      }
    },
    [],
  );
  const reset = useCallback((): void => {
    setError('');
  }, []);
  return { open, busy, error, reset };
}
