import {
  Inline,
  Button,
  buttonClassName,
  Notice,
  PageHeader,
  PageRegion,
} from '@notesapp/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { LocalStore } from '@notesapp/sync';

import { useRequestSync } from '../../app.tsx';
import { useParkedSaves } from '../attention/attention-link.tsx';
import { restoreNote } from '../trash/trash.tsx';
import { displayNoteName } from '../../lib/note-name.ts';
import { useOnline } from './save-status.tsx';

/** Every failed read gives a route back to the note list. */
export function AllNotesAction({
  workspaceId,
}: {
  readonly workspaceId: string;
}): ReactNode {
  return (
    <Link
      className={buttonClassName({ variant: 'secondary' })}
      to={`/w/${workspaceId}`}
    >
      Go to All notes
    </Link>
  );
}

/** Kept text is offered only when this account and note have a record. */
export function PurgedNotePage({
  store,
  accountId,
  workspaceId,
  fileId,
}: {
  readonly store: LocalStore | null;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
}): ReactNode {
  const kept = useParkedSaves(store, accountId, workspaceId);
  const hasText = kept.saves.some((save) => save.fileId === fileId);
  return (
    <PageRegion>
      <PageHeader
        title="This note was deleted"
        description={
          hasText
            ? 'It is gone for good. Text from this device is in Needs attention.'
            : 'It is gone for good.'
        }
      />
      <Inline gap={2} wrap as="div">
        {hasText ? (
          <Link
            className={buttonClassName()}
            to={`/w/${workspaceId}/attention`}
          >
            Open Needs attention
          </Link>
        ) : null}
        <AllNotesAction workspaceId={workspaceId} />
      </Inline>
    </PageRegion>
  );
}

/** Restore uses the same operation and waiting rule as Trash. */
export function DeletedNotePage({
  store,
  workspaceId,
  fileId,
  path,
  onRestored,
}: {
  readonly store: LocalStore | null;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly path: string;
  readonly onRestored: () => void;
}): ReactNode {
  const online = useOnline();
  const requestSync = useRequestSync();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <PageRegion>
      <PageHeader
        title={`${displayNoteName(path)} is in Trash`}
        description={
          online
            ? 'Restore it to edit.'
            : 'You are offline. Connect to restore this note.'
        }
      />
      {problem === '' ? null : <Notice tone="problem" message={problem} />}
      <Inline gap={2} wrap as="div">
        <Button
          disabled={busy || !online}
          onClick={() => {
            if (busy || !online) return;
            setBusy(true);
            setProblem('');
            void restoreNote(
              workspaceId,
              fileId,
              store?.deviceId ?? 'web-device',
            )
              .then((result) => {
                if (!active.current) return;
                setBusy(false);
                if (!result.ok) {
                  setProblem(result.message);
                  return;
                }
                requestSync();
                onRestored();
              })
              .catch(() => {
                if (active.current) {
                  setBusy(false);
                  setProblem('Could not restore this note. Try again.');
                }
              });
          }}
        >
          {busy ? 'Restoring' : 'Restore note'}
        </Button>
        <AllNotesAction workspaceId={workspaceId} />
      </Inline>
    </PageRegion>
  );
}
