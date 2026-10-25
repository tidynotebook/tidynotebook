import type { ReactNode } from 'react';
import { Button, Notice } from '@notesapp/ui';

/** Keep a failed daily-note open visible beside the action that caused it. */
export function TodayNoteAction({
  waiting,
  problem,
  onOpen,
}: {
  readonly waiting: boolean;
  readonly problem: string | null;
  readonly onOpen: () => void;
}): ReactNode {
  return (
    <div>
      <Button variant="secondary" size="sm" disabled={waiting} onClick={onOpen}>
        Open today&apos;s note
      </Button>
      {problem === null ? null : (
        <Notice className="mt-2" tone="problem" message={problem} />
      )}
    </div>
  );
}
