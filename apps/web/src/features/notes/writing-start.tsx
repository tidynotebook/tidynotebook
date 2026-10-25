import { useState, type ReactNode } from 'react';
import { Button } from '@notesapp/ui';
import { today, useDailyNotes } from '../daily-notes/daily-notes.tsx';

/** Optional help on the note list, outside the writing area. */
export function WritingStart({
  preferenceKey,
}: {
  readonly preferenceKey: string;
}): ReactNode {
  const daily = useDailyNotes();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(preferenceKey) === 'dismissed';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <section
      className="mb-4 rounded-lg border border-edge-subtle bg-card p-4"
      aria-label="Start writing"
    >
      <h2 className="m-0 mb-2 text-ui font-medium">Start with a note</h2>
      <p className="m-0 text-control text-muted">
        Select New note and start writing. You can close these tips at any time.
      </p>
      <ul className="my-2 pl-4 text-control">
        <li>
          Type <code>[[</code> in a note to find and link another note.
        </li>
        <li>Use From template to preview text before you create a note.</li>
        <li>
          Use Search to find words in note names and body text in this
          workspace.
        </li>
        <li>
          Return to All notes to find your recent notes, or open today&apos;s
          note below.
        </li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={daily.waiting}
          onClick={() => daily.open(today())}
        >
          Open today&apos;s note
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem(preferenceKey, 'dismissed');
            } catch {
              /* The tips still close when browser storage is unavailable. */
            }
          }}
        >
          Dismiss tips
        </Button>
      </div>
    </section>
  );
}
