import { useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Notice,
  buttonClassName,
} from '@notesapp/ui';
import { useSyncState } from '../../app.tsx';
import { saveStatusWords } from '../../lib/save-status-words.ts';
import {
  useFlushNoteDraft,
  useNoteSaveFact,
  useOnline,
} from './save-status.tsx';

/** Existing save facts have one pill and details on request. */
export function SavePill({
  workspaceId,
  onCopyText,
}: {
  readonly workspaceId: string;
  readonly onCopyText: () => void;
}): ReactNode {
  const sync = useSyncState();
  const online = useOnline();
  const pending = useNoteSaveFact((report) => report?.pendingSave ?? true);
  const failed = useNoteSaveFact((report) => report?.localWriteFailed ?? false);
  const flush = useFlushNoteDraft();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const trigger = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const words = saveStatusWords({
    state: sync.state,
    online,
    pending,
    failed,
    noteName: sync.noteName,
  });
  return (
    <>
      <Button
        buttonRef={trigger}
        variant="secondary"
        size="sm"
        tone={failed ? 'danger' : undefined}
        ariaExpanded={open}
        ariaControls={open ? `${id}-panel` : undefined}
        ariaHasPopup="dialog"
        onClick={() => setOpen(true)}
      >
        {words.pill}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={words.title}
        titleId={id}
        width="small"
        align="sheet"
        anchor={trigger.current}
      >
        <DialogBody>
          <p className="m-0 text-control text-muted">{words.detail}</p>
          {problem === '' ? null : <Notice tone="problem" message={problem} />}
        </DialogBody>
        <DialogFooter>
          {failed ? (
            <>
              <Button onClick={onCopyText}>Copy text</Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setProblem('');
                  void flush()
                    .catch(() =>
                      setProblem('Could not save on this device. Try again.'),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? 'Saving' : 'Try again'}
              </Button>
            </>
          ) : null}
          {sync.state.kind === 'signed-out' ||
          sync.state.kind === 'other-account' ? (
            <Link
              to="/login"
              className={buttonClassName({ variant: 'secondary' })}
            >
              Sign in
            </Link>
          ) : null}
          {sync.state.kind === 'attention' ? (
            <Link
              to={`/w/${workspaceId}/attention`}
              className={buttonClassName({ variant: 'secondary' })}
              onClick={() => setOpen(false)}
            >
              Open Needs attention
            </Link>
          ) : null}
        </DialogFooter>
      </Dialog>
    </>
  );
}
