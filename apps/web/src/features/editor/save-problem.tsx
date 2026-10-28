/**
 * The save problem of the open note, in the note header.
 *
 * Saving is quiet, so the header shows nothing while a note is saved, saving,
 * offline or uploading. The control appears only when work can wait or be
 * lost without a step from the person: a failed write to this device, a
 * signed out or other account, or saves parked in Needs attention. Its dialog
 * states the cause and offers the one step that helps.
 */
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
import { saveProblem } from '../../lib/save-status-words.ts';
import { useFlushNoteDraft, useNoteSaveFact } from './save-status.tsx';

/** The problem-only save control of the open note. */
export function SaveProblemControl({
  workspaceId,
  onCopyText,
}: {
  readonly workspaceId: string;
  readonly onCopyText: () => void;
}): ReactNode {
  const sync = useSyncState();
  const failed = useNoteSaveFact((report) => report?.localWriteFailed ?? false);
  const flush = useFlushNoteDraft();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryProblem, setRetryProblem] = useState('');
  const trigger = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const problem = saveProblem({
    state: sync.state,
    failed,
    noteName: sync.noteName,
  });
  if (problem === null) return null;
  const kind = sync.state.kind;
  return (
    <>
      <Button
        buttonRef={trigger}
        variant="secondary"
        size="sm"
        tone={problem.kind === 'not-saved' ? 'danger' : undefined}
        ariaExpanded={open}
        ariaControls={open ? `${id}-panel` : undefined}
        ariaHasPopup="dialog"
        onClick={() => setOpen(true)}
      >
        {problem.label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={problem.title}
        titleId={id}
        width="small"
        align="sheet"
        anchor={trigger.current}
      >
        <DialogBody>
          <p className="m-0 text-help text-muted">{problem.detail}</p>
          {retryProblem === '' ? null : (
            <Notice tone="problem" message={retryProblem} />
          )}
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
                  setRetryProblem('');
                  void flush()
                    .catch(() =>
                      setRetryProblem(
                        'Could not save on this device. Try again.',
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? 'Saving' : 'Try again'}
              </Button>
            </>
          ) : null}
          {kind === 'signed-out' || kind === 'other-account' ? (
            <Link
              to="/login"
              className={buttonClassName({ variant: 'secondary' })}
            >
              Sign in
            </Link>
          ) : null}
          {kind === 'attention' ? (
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
