/**
 * The quiet footer of the note screen.
 *
 * It states how long the note is, from the buffer of the open editor, so the
 * count is right while the person types. The note saves itself, so the footer
 * carries no save readout; the sidebar footer states the sync progress.
 */
import type { ReactNode } from 'react';
import { pageGutter } from '@notesapp/ui';

/** Counts the words of a Markdown buffer. */
export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/gu);
  return words === null ? 0 : words.length;
}

/** The footer row of one open note. */
export function NoteFooter({ text }: { readonly text: string }): ReactNode {
  const count = wordCount(text);
  return (
    <footer
      className={`flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge-subtle ${pageGutter} py-2 text-control text-muted`}
    >
      <span>
        {count} {count === 1 ? 'word' : 'words'}
      </span>
    </footer>
  );
}
