import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { IconButton, Button, CloseIcon, Toast } from '@notesapp/ui';
import { useLocalStore, useRequestSync } from '../../app.tsx';
import { restoreNote, type DeleteNotice } from './trash.tsx';

const undoNoticeMs = 8000;

/**
 * The notice that one note went to the trash, with one chance to restore it.
 *
 * It is the one `Toast` of the package: a raised surface at the foot of the
 * window that owns the live region, the measure and the arrival, so this
 * screen writes no width and no plane of its own. The button is an ordinary
 * button in the document order, so the offer is there for a reader and for
 * the keyboard. It goes away by itself after a few seconds; the note stays in
 * the trash.
 */
export function DeleteToast({
  notice,
  dismiss,
}: {
  readonly notice: DeleteNotice;
  readonly dismiss: () => void;
}): ReactNode {
  const store = useLocalStore();
  const navigate = useNavigate();
  const requestSync = useRequestSync();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const restoredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setFailure(null);
    restoredRef.current.clear();
    const timer = window.setTimeout(dismiss, undoNoticeMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [notice, dismiss]);

  const count = notice.items.length;
  const only = count === 1 ? notice.items[0] : undefined;
  const message =
    only === undefined
      ? `${String(count)} notes moved to Trash.`
      : `${only.name} moved to Trash.`;
  const restoreLabel =
    only === undefined
      ? `Restore ${String(count)} deleted notes`
      : `Restore ${only.name}`;
  const restore = (): void => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    void (async (): Promise<void> => {
      for (const item of notice.items) {
        if (restoredRef.current.has(item.fileId)) continue;
        const outcome = await restoreNote(
          notice.workspaceId,
          item.fileId,
          store.store?.deviceId ?? 'web-device',
        );
        if (!outcome.ok) {
          setBusy(false);
          if (restoredRef.current.size > 0)
            setFailure(
              `${String(restoredRef.current.size)} of ${String(count)} notes are back. Try Restore again for the other notes.`,
            );
          else setFailure(outcome.message);
          return;
        }
        restoredRef.current.add(item.fileId);
      }
      setBusy(false);
      requestSync();
      dismiss();
      if (only === undefined) {
        void navigate(`/w/${notice.workspaceId}`);
        return;
      }
      void navigate(`/w/${notice.workspaceId}/notes/${only.fileId}`);
    })();
  };

  return (
    // One message for one cause: a restore that did not work replaces the
    // sentence of the deletion, so the toast never stacks a general message
    // and a detailed one, and Restore stays on offer.
    <Toast message={failure ?? message}>
      <Button
        variant="secondary"
        size="compact"
        disabled={busy}
        title={restoreLabel}
        onClick={restore}
      >
        {busy ? 'Restoring' : 'Restore'}
      </Button>
      <IconButton
        variant="ghost"
        label="Close this notice"
        glyph={<CloseIcon />}
        onClick={dismiss}
      />
    </Toast>
  );
}
