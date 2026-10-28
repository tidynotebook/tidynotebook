/**
 * The bar of a code block: its language and a copy action (record 0174).
 *
 * A bar stands at the top of the card of each code block on the screen, with
 * a copy control at the end. The opening fence line of a fenced block stays
 * on the screen and names the language with a small label, so the bar of a
 * fence stands on that line and shows the copy control alone. An indented
 * block has no fence, so its bar shows the label of the language at the
 * start, as `codeBlockLabel` of `@notesapp/markdown` names it, and its first
 * line keeps the room of the bar (`editor-theme.ts`).
 *
 * The bar stands in one layer over the text, inside the scroller of the
 * editor, as the controls of a table do (`table-controls.ts`), so it replaces
 * no text, holds no caret, and the set of widget kinds of record 0002 stays
 * closed. A diagram is a widget of its own and carries no bar.
 *
 * The copy control is the ghost button of `packages/ui`, with the copy glyph
 * and its word, and its name says the language of the block
 * (`copyControlWords`). It takes the focus with Tab after the text and runs
 * with Enter or Space. A press keeps the caret where it is. A copy writes the
 * code of the block as the renderer reads it, says Copied for a moment, and
 * tells a screen reader that the code is on the clipboard.
 *
 * A copy fails one way. When the browser refuses the clipboard, or the parse
 * refuses the note, the control selects the code in the text and says so,
 * and the person copies it with the keyboard. A note that the parse refuses
 * before it starts, such as one past the size limit, shows no bar at all:
 * the grammar gate shows it as plain text, so it has no code block, and the
 * bars read the answer of the gate rather than the whole note on a key.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import {
  codeBlockLabel,
  diagramFence,
  parseMarkdown,
  type Root,
} from '@notesapp/markdown';
import {
  buttonClassName,
  checkParts,
  compactButtonVisualClassName,
  copiedForMs,
  copyControlWords,
  copyParts,
  glyph,
  type CopyState,
} from '@notesapp/ui';
import { codeBlockDrawn, lineSelected } from './code-block-shape.ts';
import { markdownGrammarOn } from './grammar-gate.ts';

/** One code block that carries a bar. */
export type CodeBlockBar = {
  /** The start of the block in the document. */
  readonly from: number;
  /** The end of the block in the document. */
  readonly to: number;
  /** The label of the block, or `null` for a block with no info string. */
  readonly label: string | null;
  /**
   * Whether the block is fenced. Its bar then stands on the opening fence
   * line, which names the language itself, so the bar shows the copy action
   * alone and keeps no room of its own.
   */
  readonly fenced: boolean;
};

/**
 * The code blocks of a state between two offsets, in document order.
 *
 * A fenced block and an indented block each carry a bar. A Mermaid fence is a
 * diagram, which draws as a widget and carries none. The bar of a fenced
 * block steps aside while the selection is on its opening fence line, so it
 * never covers the text that the person edits there, and a fence that is
 * still being typed is not a block (`./code-block-shape.ts`).
 */
export function codeBlockBars(
  state: EditorState,
  from = 0,
  to = state.doc.length,
): readonly CodeBlockBar[] {
  const found: CodeBlockBar[] = [];
  const selection = state.selection.main;
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name === 'CodeBlock') {
        found.push({
          from: node.from,
          to: node.to,
          label: null,
          fenced: false,
        });
        return false;
      }
      if (node.name !== 'FencedCode') return true;
      const info = node.node.getChild('CodeInfo');
      const text =
        info === null ? '' : state.doc.sliceString(info.from, info.to);
      if (
        !diagramFence(text) &&
        codeBlockDrawn(state.doc, node.node, selection) &&
        !lineSelected(state.doc, node.from, selection)
      )
        found.push({
          from: node.from,
          to: node.to,
          label: codeBlockLabel(text),
          fenced: true,
        });
      return false;
    },
  });
  return found;
}

/**
 * The code of the block that holds `at`, as the renderer reads it, or `null`.
 *
 * The parse of `@notesapp/markdown` is the one reading of a block: it leaves
 * out the fences, the indentation of an indented block and the marks of a
 * quote or a list around it, so a copy of the note and a copy of the
 * published page hold the same code.
 */
export function codeBlockText(doc: string, at: number): string | null {
  let root: Root;
  try {
    root = parseMarkdown(doc);
  } catch {
    // A note over the limits of the grammar renders as its source, so its
    // blocks hold no code that a reader of the page could copy either.
    return null;
  }
  const shift = doc.startsWith('\uFEFF') ? 1 : 0;
  let found: string | null = null;
  const walk = (node: Root | Root['children'][number]): void => {
    const start = (node.position?.start.offset ?? -1) + shift;
    const end = (node.position?.end.offset ?? -1) + shift;
    if (start > at || end < at) return;
    if (node.type === 'code') found = node.value;
    if ('children' in node) for (const child of node.children) walk(child);
  };
  walk(root);
  return found;
}

/**
 * The range that a copy selects when the browser refuses it: the code of the
 * block that starts at `from`, without its fences, or `null` for no block.
 *
 * A fence with no code selects the place where its code would go, so the
 * caret lands inside the block.
 */
export function codeBlockSelection(
  state: EditorState,
  from: number,
): { readonly from: number; readonly to: number } | null {
  let found: { from: number; to: number } | null = null;
  syntaxTree(state).iterate({
    from,
    to: from,
    enter: (node) => {
      if (found !== null) return false;
      if (node.from !== from) return true;
      if (node.name === 'CodeBlock') {
        found = { from: node.from, to: node.to };
        return false;
      }
      if (node.name !== 'FencedCode') return true;
      // Inside a quote or a list the code is one piece for each line.
      const pieces = node.node.getChildren('CodeText');
      const first = pieces[0];
      const last = pieces.at(-1);
      if (first !== undefined && last !== undefined)
        found = { from: first.from, to: last.to };
      else {
        const end = state.doc.lineAt(node.from).to;
        found = { from: end, to: end };
      }
      return false;
    },
  });
  return found;
}

/**
 * The code blocks of the screen that carry a bar.
 *
 * `copies` says whether the parse takes the note, and runs only when the
 * screen holds a code block. The editor passes `markdownGrammarOn`, the
 * answer that the grammar gate keeps for each change (`grammar-gate.ts`),
 * so no key reads the rest of the note.
 */
export function barsOnScreen(
  state: EditorState,
  ranges: readonly { readonly from: number; readonly to: number }[],
  copies: (state: EditorState) => boolean,
): readonly CodeBlockBar[] {
  const blocks: CodeBlockBar[] = [];
  for (const range of ranges)
    for (const block of codeBlockBars(state, range.from, range.to))
      if (!blocks.some((done) => done.from === block.from)) blocks.push(block);
  return blocks.length === 0 || !copies(state) ? [] : blocks;
}

/** The class of the glyph inside a control: the 16 px of a control. */
const glyphClass = 'size-4 shrink-0';

/** One bar on the screen, and the block it belongs to. */
type Bar = {
  readonly element: HTMLElement;
  readonly label: HTMLElement;
  readonly control: HTMLButtonElement;
  readonly surface: HTMLElement;
  readonly word: HTMLElement;
  block: CodeBlockBar | null;
  state: CopyState;
  timer: number;
};

/** A place of one bar, in the coordinates of the scroller. */
type Place = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  /** The height of the line of a fence, or `null` for the room of a bar. */
  readonly height: number | null;
};

/** Builds the layer of the bars and keeps each bar on its block. */
class CodeControls {
  private readonly view: EditorView;
  private readonly layer: HTMLElement;
  private readonly bars: Bar[] = [];

  constructor(view: EditorView) {
    this.view = view;
    this.layer = document.createElement('div');
    this.layer.className = 'cm-np-code-controls';
    view.scrollDOM.append(this.layer);
    this.schedule();
  }

  update(update: ViewUpdate): void {
    // The bar steps aside while the selection is on the opening fence line.
    if (
      update.docChanged ||
      update.selectionSet ||
      update.geometryChanged ||
      update.viewportChanged
    )
      this.schedule();
  }

  destroy(): void {
    for (const bar of this.bars) window.clearTimeout(bar.timer);
    this.layer.remove();
  }

  /** One bar, built once and kept for the next block that needs one. */
  private bar(index: number): Bar {
    const existing = this.bars[index];
    if (existing !== undefined) return existing;
    const element = document.createElement('div');
    element.className = 'cm-np-code-bar';
    const label = document.createElement('span');
    label.className = 'cm-np-code-label';
    const control = document.createElement('button');
    control.type = 'button';
    control.className = buttonClassName({
      variant: 'ghost',
      size: 'sm',
      compact: true,
    });
    const surface = document.createElement('span');
    surface.className = compactButtonVisualClassName({
      variant: 'ghost',
      size: 'sm',
      iconOnly: false,
    });
    const word = document.createElement('span');
    control.append(surface);
    element.append(label, control);
    this.layer.append(element);
    const made: Bar = {
      element,
      label,
      control,
      surface,
      word,
      block: null,
      state: 'ready',
      timer: 0,
    };
    this.show(made, 'ready');
    // A press keeps the caret and the selection in the text.
    control.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    control.addEventListener('click', () => {
      this.copy(made);
    });
    this.bars.push(made);
    return made;
  }

  /** Shows one state of the control of a bar: its glyph, word and name. */
  private show(bar: Bar, state: CopyState): void {
    bar.state = state;
    const words = copyControlWords(state, bar.block?.label ?? null);
    bar.word.textContent = words.word;
    bar.surface.replaceChildren(
      glyph(glyphClass, state === 'copied' ? checkParts : copyParts),
      bar.word,
    );
    bar.control.setAttribute('aria-label', words.name);
  }

  /** States the outcome of one copy, then goes back to ready. */
  private settle(bar: Bar, state: CopyState): void {
    this.show(bar, state);
    this.view.dispatch({
      effects: EditorView.announce.of(
        copyControlWords(state, bar.block?.label ?? null).announcement,
      ),
    });
    window.clearTimeout(bar.timer);
    bar.timer = window.setTimeout(() => {
      this.show(bar, 'ready');
    }, copiedForMs);
  }

  /**
   * The one failure path of a copy: the code of the block is selected in the
   * text, so the person copies it with the keyboard, and the bar says so.
   */
  private selectCode(bar: Bar, block: CodeBlockBar): void {
    if (!this.view.dom.isConnected) return;
    const range = codeBlockSelection(this.view.state, block.from);
    if (range !== null)
      this.view.dispatch({
        selection: { anchor: range.from, head: range.to },
        scrollIntoView: true,
        userEvent: 'select',
      });
    this.view.focus();
    this.settle(bar, 'selected');
  }

  /** Writes the code of the block of one bar to the clipboard. */
  private copy(bar: Bar): void {
    const block = bar.block;
    if (block === null) return;
    const code = codeBlockText(this.view.state.doc.toString(), block.from);
    if (code === null) {
      this.selectCode(bar, block);
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => {
        if (bar.block === block) this.settle(bar, 'copied');
      },
      () => {
        if (bar.block === block) this.selectCode(bar, block);
      },
    );
  }

  /** Measures each code block on the screen and places its bar. */
  private schedule(): void {
    this.view.requestMeasure({
      key: this,
      read: (view): readonly { block: CodeBlockBar; place: Place }[] => {
        // A browser with no clipboard copies nothing, and the parse refuses a
        // note past its limits, so neither shows a bar.
        if (typeof navigator.clipboard?.writeText !== 'function') return [];
        const blocks = barsOnScreen(
          view.state,
          view.visibleRanges,
          markdownGrammarOn,
        );
        if (blocks.length === 0) return [];
        const scroller = view.scrollDOM.getBoundingClientRect();
        const placed: { block: CodeBlockBar; place: Place }[] = [];
        for (const block of blocks) {
          const { node } = view.domAtPos(block.from);
          const element = node instanceof Element ? node : node.parentElement;
          const line = element?.closest('.cm-line')?.getBoundingClientRect();
          if (line === undefined) continue;
          placed.push({
            block,
            place: {
              top: line.top - scroller.top + view.scrollDOM.scrollTop,
              left: line.left - scroller.left + view.scrollDOM.scrollLeft,
              width: line.width,
              // The bar of a fence stands on the opening fence line and takes
              // its height. An indented block keeps the room of the bar.
              height: block.fenced ? line.height : null,
            },
          });
        }
        return placed;
      },
      write: (placed): void => {
        placed.forEach(({ block, place }, index) => {
          const bar = this.bar(index);
          const same =
            bar.block?.from === block.from &&
            bar.block.label === block.label &&
            bar.block.fenced === block.fenced;
          bar.block = block;
          // The opening fence of a fenced block names its language, so its
          // bar shows the copy action alone. The name of the control still
          // says the language.
          bar.label.textContent = block.fenced ? '' : (block.label ?? '');
          // A bar that now stands on another block names that block.
          if (!same) {
            window.clearTimeout(bar.timer);
            this.show(bar, 'ready');
          }
          bar.element.hidden = false;
          // A place on the screen is a measured number, which no class can
          // state, so the layer writes it, as a tooltip of CodeMirror does.
          bar.element.style.top = `${String(place.top)}px`;
          bar.element.style.left = `${String(place.left)}px`;
          bar.element.style.width = `${String(place.width)}px`;
          bar.element.style.height =
            place.height === null ? '' : `${String(place.height)}px`;
        });
        for (const bar of this.bars.slice(placed.length)) {
          bar.block = null;
          bar.element.hidden = true;
        }
      },
    });
  }
}

/** The bar of every code block on the screen (record 0174). */
export function codeControls(): Extension {
  return ViewPlugin.fromClass(CodeControls);
}
