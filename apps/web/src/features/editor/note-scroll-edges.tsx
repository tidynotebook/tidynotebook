import { useEffect, type ReactNode } from 'react';
import { fixedRegionClasses, observeElementScrollEdges } from '@notesapp/ui';
import { useActiveNote } from './active-note.tsx';

export function NoteScrollEdges(): ReactNode {
  const { view } = useActiveNote();
  useEffect(
    () =>
      view === null ? undefined : observeElementScrollEdges(view.scrollDOM),
    [view],
  );
  return (
    <div
      aria-hidden="true"
      data-scroll-edge="below"
      className={fixedRegionClasses('bottom')}
    />
  );
}
