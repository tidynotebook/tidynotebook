/**
 * The copy action of each code block of a published page (record 0174).
 *
 * The page shows each block with its language in a bar at the top of the
 * card, which a reader with no script reads too. This module puts a copy
 * control at the other end of the bar. The control is the ghost button of
 * `packages/ui`, with the copy glyph and its word, and its name says the
 * language of the block (`copyControlWords`). A copy says Copied for a
 * moment. A browser with no clipboard, such as one that opened the page over
 * plain HTTP, gets no control, and the reader selects the code instead.
 *
 * A copy fails one way. When the browser refuses the clipboard, the control
 * selects the code and says so, and the reader copies it with the keyboard.
 */
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
import {
  copiedCode,
  publishedCodeLabel,
  publishedCodeSelector,
  publishedCopyPlace,
} from '../lib/published-code.ts';

/** The class of the glyph inside the control: the 16 px of a control. */
const glyphClass = 'size-4 shrink-0';

/** One copy control for the code block of one figure. */
function copyControl(figure: HTMLElement, code: HTMLElement): HTMLElement {
  const label = publishedCodeLabel(figure);
  const control = document.createElement('button');
  control.type = 'button';
  control.className = buttonClassName({
    variant: 'ghost',
    size: 'compact',
    compact: true,
    className: publishedCopyPlace,
  });
  const surface = document.createElement('span');
  surface.className = compactButtonVisualClassName({
    variant: 'ghost',
    size: 'compact',
    iconOnly: false,
  });
  const word = document.createElement('span');
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  control.append(surface, status);
  let timer = 0;

  /** Shows one state of the control: its glyph, its word and its name. */
  const show = (state: CopyState): void => {
    const words = copyControlWords(state, label);
    word.textContent = words.word;
    surface.replaceChildren(
      glyph(glyphClass, state === 'copied' ? checkParts : copyParts),
      word,
    );
    control.setAttribute('aria-label', words.name);
    status.textContent = words.announcement;
  };

  /** States the outcome of one copy, then goes back to ready. */
  const settle = (state: CopyState): void => {
    show(state);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      show('ready');
    }, copiedForMs);
  };

  show('ready');
  control.addEventListener('click', () => {
    navigator.clipboard.writeText(copiedCode(code.textContent ?? '')).then(
      () => {
        settle('copied');
      },
      () => {
        // A copy that the browser refuses selects the code, so the reader
        // copies it with the keyboard, and the control says so.
        window.getSelection()?.selectAllChildren(code);
        settle('selected');
      },
    );
  });
  figure.append(control);
  return control;
}

/** Puts a copy control on every code block of the page. */
export function startCodeCopy(): void {
  // `navigator.clipboard` is absent where the page is not a secure context.
  if (typeof navigator.clipboard?.writeText !== 'function') return;
  for (const figure of document.querySelectorAll<HTMLElement>(
    publishedCodeSelector,
  )) {
    const code = figure.querySelector<HTMLElement>('pre code');
    if (code !== null) copyControl(figure, code);
  }
}
