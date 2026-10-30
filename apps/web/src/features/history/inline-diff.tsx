import { Inline, Stack, Inset } from '@notesapp/ui';

/**
 * One unified line comparison of two texts.
 *
 * History compares a version with the current text, and Review compares the
 * text that caused it with the note now (record 0087). Both read the rows of
 * `lib/diff-rows.ts`, so the two screens show a change the same way, and a
 * line whose only change is its line ending reads as unchanged (record 0166).
 */
import { useMemo, type ReactNode } from 'react';
import type { DiffHunk } from '@notesapp/editor';
import {
  diffBlockHeading,
  diffBlocks,
  diffRowSign,
  type DiffRow,
} from '../../lib/diff-rows.ts';

/** What a screen reader hears before the words of a changed line. */
const rowSpoken: Readonly<Record<DiffRow['kind'], string>> = {
  context: '',
  removed: 'Removed: ',
  added: 'Added: ',
};

/**
 * One unified inline diff in the main pane.
 *
 * Each region starts with the line where it starts on each side. A removed
 * line carries a minus sign, an added line a plus sign, and an unchanged line
 * no sign. The words of every line render verbatim, including white space.
 */
export function InlineDiff({
  hunks,
  idPrefix,
  oldLabel,
  newLabel,
  sameText,
}: {
  readonly hunks: readonly DiffHunk[];
  readonly idPrefix: string;
  readonly oldLabel: string;
  readonly newLabel: string;
  /** What the comparison says when the two texts hold the same lines. */
  readonly sameText: string;
}): ReactNode {
  const blocks = useMemo(() => diffBlocks(hunks), [hunks]);
  if (blocks.length === 0)
    return <p className="m-0 text-secondary text-muted">{sameText}</p>;
  return (
    <Stack
      gap={4}
      pad={0}
      as="ol"
      className="list-none"
      aria-label="Line differences"
    >
      {blocks.map((block, index) => (
        <li
          className="overflow-hidden rounded-lg border border-edge-subtle"
          key={`${idPrefix}-block-${String(index)}`}
        >
          <Inset
            padX={3}
            padY={2}
            as="h4"
            className="bg-surface text-label text-strong"
          >
            {diffBlockHeading(block, oldLabel, newLabel)}
          </Inset>
          <Inset pad={0} as="ol" className="list-none font-mono text-preview">
            {block.rows.map((row, rowIndex) => (
              <Inline
                as="li"
                gap={2}
                padX={3}
                padY={1}
                // The tone of a changed line is a fill from the palette and
                // never a fade of a text colour (decisions 0057 and 0065).
                // The text on a tone surface is the strong text, which the
                // contrast test holds on each of the three surfaces, and the
                // sign in front of the line states the change as well.
                className={`${row.kind === 'removed' ? 'bg-danger-surface text-strong' : row.kind === 'added' ? 'bg-success-surface text-strong' : 'text-muted'}`}
                key={`${idPrefix}-block-${String(index)}-row-${String(rowIndex)}`}
              >
                <span className="w-3 shrink-0" aria-hidden="true">
                  {diffRowSign(row.kind)}
                </span>
                <code className="min-w-0 whitespace-pre-wrap">
                  {row.kind === 'context' ? null : (
                    <span className="sr-only">{rowSpoken[row.kind]}</span>
                  )}
                  {row.text === '' ? '(empty line)' : row.text}
                </code>
              </Inline>
            ))}
          </Inset>
        </li>
      ))}
    </Stack>
  );
}
