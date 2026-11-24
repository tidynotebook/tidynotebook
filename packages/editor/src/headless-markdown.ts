/**
 * The shared Markdown parser without the optional fence languages.
 * A structural read can load this module without bringing in their bundles.
 */
import { markdown } from '@codemirror/lang-markdown';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import {
  ensureSyntaxTree,
  Language,
  type LanguageDescription,
  LanguageSupport,
  syntaxTree,
  syntaxTreeAvailable,
} from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import {
  Parser,
  TreeFragment,
  type Input,
  type PartialParse,
} from '@lezer/common';
import { footnoteMarkdownExtension } from './footnote-syntax.ts';
import { mathMarkdownExtension } from './math-syntax.ts';

/** Keeps cached blocks within the end of a partial Markdown parse. */
class PartialMarkdownParser extends Parser {
  private readonly base: Parser;

  constructor(base: Parser) {
    super();
    this.base = base;
  }

  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: readonly { from: number; to: number }[],
  ): PartialParse {
    const end = ranges[0]?.to;
    // Lezer Markdown 1.7.2 leaves a zero-length placeholder when a reused
    // block crosses a single partial-parse end. Cap reuse before that end.
    if (ranges.length === 1 && end !== undefined && end < input.length) {
      fragments = fragments.flatMap((fragment) =>
        fragment.from >= end
          ? []
          : fragment.to <= end
            ? [fragment]
            : [
                new TreeFragment(
                  fragment.from,
                  end,
                  fragment.tree,
                  fragment.offset,
                  fragment.openStart,
                  true,
                ),
              ],
      );
    }
    return this.base.createParse(input, fragments, ranges);
  }
}

/** The shared grammar for a complete outline and other structural reads. */
export function headlessNoteMarkdown(): LanguageSupport {
  return markdownWithFences(() => null);
}

export function markdownWithFences(
  codeLanguages: (info: string) => LanguageDescription | null,
): LanguageSupport {
  const content = markdown({
    extensions: [GFM, mathMarkdownExtension, footnoteMarkdownExtension],
    codeLanguages,
  });
  return yamlFrontmatter({
    content: new LanguageSupport(
      new Language(
        content.language.data,
        new PartialMarkdownParser(content.language.parser),
        [],
        content.language.name,
      ),
      content.support,
    ),
  });
}

/** How many pumps of the parser {@link parsedWhole} allows before it refuses. */
const wholeDocumentAttemptBound = 500;

/** How much parsing work one pump of {@link parsedWhole} buys, in milliseconds. */
const wholeDocumentSliceBudget = 5000;

/** Tuning knobs of {@link parsedWhole}, for a test that proves its refusal. */
export type ParsedWholeOptions = {
  /**
   * Overrides the attempt bound.
   *
   * A test sets this to 0 to force the refusal without waiting on a slow
   * machine: a fresh state only ever parses its initial viewport of about
   * 3000 characters, so a document past that length is provably partial
   * before the first pump.
   */
  readonly attempts?: number;
};

/** A complete parse whose tree has reached the state field. */
function wholeTreeReady(state: EditorState): boolean {
  return (
    syntaxTreeAvailable(state, state.doc.length) &&
    ensureSyntaxTree(state, state.doc.length, 0) === syntaxTree(state)
  );
}

/**
 * Pumps the parser of a state until its whole parse is complete.
 *
 * The outer tree of a mixed parse can cover the document while its nested
 * trees are still incomplete. CodeMirror's completion check, rather than
 * the outer length, states when the body and its fence languages are ready.
 *
 * A view parses at least its viewport before it renders, so the live
 * preview always reads a tree that is ready for what is on screen. A
 * headless state, the kind a test or an offline reader builds, parses in
 * slices instead and keeps the unfinished work in its parse context. This
 * helper drives that background work into the state field one slice at a
 * time, the same way `@codemirror/language` drives it during idle time in a
 * real view.
 *
 * The bound exists so a stuck parse fails loudly instead of spinning
 * forever. When the tree still does not cover the document after the bound
 * is spent, this throws instead of handing back a state whose tree is
 * partial: a caller that compares a partial tree against the whole document
 * would read the gap as a Markdown defect instead of a parser refusal.
 */
export function parsedWhole(
  state: EditorState,
  options: ParsedWholeOptions = {},
): EditorState {
  const attemptBound = options.attempts ?? wholeDocumentAttemptBound;
  let current = state;
  for (
    let attempt = 0;
    attempt < attemptBound && !wholeTreeReady(current);
    attempt += 1
  ) {
    ensureSyntaxTree(current, current.doc.length, wholeDocumentSliceBudget);
    current = current.update({}).state;
  }
  const reached = syntaxTree(current).length;
  if (!wholeTreeReady(current))
    throw new Error(
      `the parser stopped at ${String(reached)} of ${String(current.doc.length)} characters`,
    );
  return current;
}
