/**
 * The note outline panel, which reads the live buffer and moves the caret.
 *
 * Every row is the one clickable row of the product, from `rowClassName`, so
 * the outline hovers, marks and focuses like the folder tree and the command
 * palette (record 0065).
 */
import { useMemo, type ReactNode } from 'react';
import {
  outlineOf,
  previewStructureOf,
  type OutlineHeading,
} from '@notesapp/editor';
import { CollapsibleSection, rowClassName } from '@notesapp/ui';
import { revealInNote, useActiveNote } from './active-note.tsx';

/**
 * The inset of one outline row, one step for each level under the first.
 *
 * The step is the same distance at every level, so a deep heading is read by
 * how far it sits from the left and never by a guide line, which is what the
 * folder tree does as well (record 0064).
 */
const outlineIndent = (level: number): string =>
  ['', 'pl-3', 'pl-6', 'pl-8', 'pl-12', 'pl-12'][level - 1] ?? '';

/** The headings of one Markdown source, read from the shared grammar. */
function outlineOfText(source: string): readonly OutlineHeading[] {
  return previewStructureOf(source).flatMap((node, index) =>
    node.kind === 'heading'
      ? [{ level: node.level, text: node.text, from: index, to: index }]
      : [],
  );
}

/**
 * Renders the outline of an open note.
 *
 * The rows come from the same Markdown syntax tree the editor renders, so a
 * `#` inside a code fence is code here too. The panel sits in the scope of the
 * open note: while its editor is mounted the panel follows the live buffer and
 * a row moves the caret to its heading. Until the editor opens, the panel
 * reads the text of the note that the host gives it.
 *
 * The panel reads no server and no store, so it has nothing that can fail and
 * it never states an empty outline for a read that did not answer
 * (record 0038). The host always holds the text of the open note.
 *
 * A note with no heading has no outline, and an outline of nothing is not a
 * state worth a sentence, so the panel returns nothing and the section around
 * it never opens. The panel owns that section for the same reason: one place
 * reads the headings, so the section and the list cannot disagree
 * (record 0055).
 */
export function OutlinePanel({
  text,
  open,
  onToggle,
}: {
  readonly text: string;
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
}): ReactNode {
  // The scope gives a new value when the editor opens, when it closes, and
  // when the text moves on, so the rows below follow the live buffer. The
  // count is the reason to read the buffer again, so the walk of the syntax
  // tree happens once for each change and not once for each render.
  const { view, revision } = useActiveNote();
  const live = useMemo(
    () => (view === null ? null : outlineOf(view.state)),
    [view, revision],
  );
  const headings = live ?? outlineOfText(text);
  if (headings.length === 0) return null;
  return (
    <CollapsibleSection
      id="notes-outline"
      title="Outline"
      open={open}
      onToggle={onToggle}
    >
      <ol className="m-0 list-none p-0">
        {headings.map((heading, index) => (
          <li key={`${String(index)}:${heading.text}`}>
            {view !== null ? (
              <button
                type="button"
                className={rowClassName({
                  className: `w-full text-left ${outlineIndent(heading.level)}`,
                })}
                onClick={(): void => {
                  revealInNote(view, heading.from);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{heading.text}</span>
              </button>
            ) : (
              <span
                className={rowClassName({
                  interactive: false,
                  className: outlineIndent(heading.level),
                })}
              >
                <span className="min-w-0 flex-1 truncate">{heading.text}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </CollapsibleSection>
  );
}
