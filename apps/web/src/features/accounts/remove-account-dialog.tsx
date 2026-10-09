/**
 * The dialog that removes the account of the person, which Settings and the
 * consent page both open (record 0111). It is a module of its own, so the
 * consent page loads it without the Settings page (record 0177).
 */
import { useState, type ReactNode } from 'react';

import { removeOwnAccount } from '@notesapp/api-client';
import type { LocalStore } from '@notesapp/sync';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  TextField,
} from '@notesapp/ui';

import { problemMessage } from '../../app.tsx';
import { problemCode } from '../../lib/problem-text.ts';

/**
 * The dialog that removes the account of the person (record 0111).
 *
 * The person gives the password again, so a session that somebody else holds
 * cannot remove the account. After the removal this device keeps nothing of
 * the account: its queued work cannot reach the server any more.
 */
export function RemoveOwnAccountDialog({
  store,
  accountId,
  onClose,
  onRemoved,
}: {
  readonly store: LocalStore | null;
  readonly accountId: string;
  readonly onClose: () => void;
  readonly onRemoved: () => void;
}): ReactNode {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError('');
    const result = await removeOwnAccount({ body: { password } });
    if (result.data === undefined) {
      setBusy(false);
      setError(
        problemCode(result.error) === 'forbidden'
          ? 'That password is not the password of this account.'
          : problemMessage(result.error),
      );
      return;
    }
    // The refresh reads no account any more, and the loader then forgets
    // the account that this device cached.
    try {
      await store?.clearPrivateData(accountId);
    } catch {
      // The account is gone on the server. What stays here is out of view
      // of every other account, and the next sign-in deletes it.
    }
    onRemoved();
  };

  return (
    <Dialog
      open
      title="Delete your account?"
      titleId="remove-own-account-title"
      width="small"
      onClose={onClose}
    >
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          void submit();
        }}
      >
        <DialogBody>
          <p className="mb-4 mt-0 text-ui text-strong">
            Your account and every note in your workspaces go for good. You are
            signed out on every device.
          </p>
          <TextField
            id="remove-own-password"
            label="Password"
            value={password}
            inputType="password"
            autoComplete="current-password"
            required
            autoFocus
            error={error}
            onChange={setPassword}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={busy || password === ''}
          >
            {busy ? 'Deleting your account' : 'Delete account'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
