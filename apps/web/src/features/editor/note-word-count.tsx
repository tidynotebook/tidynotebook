import { useMemo, type ReactNode } from 'react';
import { DisclosureRow, MenuInformation } from '@notesapp/ui';
import { useActiveNote } from './active-note.tsx';
import { useLongNoteMetrics } from './long-note-metrics.tsx';
import { wordCount } from './note-metrics.ts';

export function NoteWordCount({
  initialText,
  menu = false,
}: {
  readonly initialText: string;
  readonly menu?: boolean;
}): ReactNode {
  const { view, revision } = useActiveNote();
  const long = useLongNoteMetrics();
  const count = useMemo(
    () =>
      long === null
        ? wordCount(view === null ? initialText : view.state.doc.toString())
        : long.metrics?.count,
    [view, revision, initialText, long],
  );
  if (count === undefined) return null;
  const line = (
    <p className="text-secondary text-muted" data-note-word-count="">
      {count === null
        ? 'Word count unavailable'
        : `${count} ${count === 1 ? 'word' : 'words'}`}
    </p>
  );
  return menu ? (
    <MenuInformation className="xl:hidden">{line}</MenuInformation>
  ) : (
    <DisclosureRow>{line}</DisclosureRow>
  );
}
