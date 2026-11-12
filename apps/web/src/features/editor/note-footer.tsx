import { observeElementScrollEdges } from '@notesapp/ui';
import { MarkdownLimitError, markdownWordCount } from '@notesapp/markdown';
/**
 * The quiet footer of the note screen.
 *
 * It states how long the note is, from the buffer of the open editor. The
 * count follows the text after a short quiet time, through the scope of the
 * open note, so a key renders neither the footer nor the note screen (record
 * 0175). The note saves itself, so the footer carries no save readout; the
 * sidebar footer states the sync progress.
 *
 * The row draws `edge-line` above itself. The text of a note is a region a
 * person scrolls, and the design guide draws a divider exactly there, so the
 * line states where the text stops. `noteFooterClassName` in
 * `apps/web/src/lib/note-column.ts` holds the rule, and a unit test reads it.
 *
 * On a phone the footer gives its row to the text while the text has the
 * focus, which is while the keyboard is up. The focus moves no key, so the
 * footer renders only when the text takes the focus or lets it go.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useActiveNote } from './active-note.tsx';
import {
  noteColumnClassName,
  noteFooterClassName,
} from '../../lib/note-column.ts';

/** Counts the words of a Markdown buffer. */
export function wordCount(text: string): number | null {
  try {
    return markdownWordCount(text);
  } catch (error) {
    if (error instanceof MarkdownLimitError) return null;
    throw error;
  }
}

/**
 * The footer row of one open note. `initialText` is the text until the
 * editor of the note registers.
 */
export function NoteFooter({
  initialText,
}: {
  readonly initialText: string;
}): ReactNode {
  // The revision moves when the text moved on, so the count is read once for
  // each change and not once for each render.
  const { view, revision } = useActiveNote();
  const count = useMemo(
    () => wordCount(view === null ? initialText : view.state.doc.toString()),
    [view, revision, initialText],
  );
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (view === null) return;
    const text = view.contentDOM;
    const take = (): void => {
      setTyping(true);
    };
    const leave = (): void => {
      setTyping(false);
    };
    setTyping(view.hasFocus);
    text.addEventListener('focus', take);
    text.addEventListener('blur', leave);
    return () => {
      text.removeEventListener('focus', take);
      text.removeEventListener('blur', leave);
    };
  }, [view]);
  useEffect(
    () => (view ? observeElementScrollEdges(view.scrollDOM) : undefined),
    [view],
  );
  return (
    <footer data-scroll-edge="below" className={noteFooterClassName(typing)}>
      <div className={noteColumnClassName()}>
        <span>
          {count === null
            ? 'Word count unavailable'
            : `${String(count)} ${count === 1 ? 'word' : 'words'}`}
        </span>
      </div>
    </footer>
  );
}
