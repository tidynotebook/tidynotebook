import { MarkdownLimitError, markdownWordCount } from '@notesapp/markdown';
import { outlineOfSource, type OutlineHeading } from '@notesapp/editor/outline';

/** Counts the words of a Markdown buffer. */
export function wordCount(text: string): number | null {
  try {
    return markdownWordCount(text);
  } catch (error) {
    if (error instanceof MarkdownLimitError) return null;
    throw error;
  }
}

/** A long note calculation shared by the worker and its fallback. */
export type NoteMetrics = {
  readonly count: number | null;
  readonly headings: readonly OutlineHeading[];
};

export type NoteMetricsRequest = {
  readonly text: string;
  readonly outline: boolean;
};

export function readNoteMetrics({
  text,
  outline,
}: NoteMetricsRequest): NoteMetrics {
  return {
    count: wordCount(text),
    headings: outline ? outlineOfSource(text) : [],
  };
}
