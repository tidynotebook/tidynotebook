/** A real editor with two wide tables for checks of Find in a table. */
import { EditorSelection, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { createEditor } from '../../../packages/editor/src/create-editor.ts';
import { measurableRange } from '../../../packages/editor/src/table-grid.ts';
import { applyThemeToDocument, defaultThemeFor } from '@notesapp/ui';

const params = new URLSearchParams(location.search);
// `layout=nested` puts the editor, at its full height, inside an outer box
// that scrolls on both axes, so a scroll request reaches an ancestor.
const nested = params.get('layout') === 'nested';
const outer = document.createElement('div');
if (nested) {
  outer.style.cssText =
    'height: 500px; width: 600px; overflow: auto; position: relative';
  document.body.append(outer);
}
const host = document.createElement('main');
host.style.width = nested ? '1300px' : '900px';
(nested ? outer : document.body).append(host);
document.body.style.margin = '0';
const theme =
  new URLSearchParams(location.search).get('theme') === 'light'
    ? 'light'
    : 'dark';
applyThemeToDocument(defaultThemeFor(theme));
const prose =
  'Normal readable prose describes a synthetic test plan with enough detail for a useful review.';
const columns = 14;
// Each table names its cells, so a check can say which cell a match is in.
const table = (name: string, needles: ReadonlyMap<string, string>): string =>
  '| ' +
  Array.from({ length: columns }, (_, i) => 'Head ' + String(i)).join(' | ') +
  ' |\n| ' +
  Array.from({ length: columns }, () => '---').join(' | ') +
  ' |\n' +
  Array.from(
    { length: 4 },
    (_, row) =>
      '| ' +
      Array.from(
        { length: columns },
        (_, col) =>
          needles.get(`${String(row)}:${String(col)}`) ??
          `${name} cell ${String(row)} ${String(col)} plain words`,
      ).join(' | ') +
      ' |',
  ).join('\n');
const original = [
  '# Find in wide tables',
  prose,
  '## Table A',
  table(
    'A',
    new Map([
      ['0:12', 'needle far right'],
      ['1:1', 'needle near left'],
      ['2:13', 'needle last column'],
    ]),
  ),
  prose,
  '## Table B',
  table('B', new Map([['0:11', 'needle in b']])),
  // Table C sits far below, so Find also scrolls the text to reach it.
  ...Array.from({ length: 16 }, () => prose),
  '## Table C',
  table('C', new Map([['3:10', 'needle in c']])),
  prose,
  // Table D has a wide column whose second row holds a short cell, so the
  // box of that cell is much wider than its text.
  // Table E has one row taller than the editor: its middle cell wraps a
  // long text that ends with a short word at the foot of the row.
  '## Table E',
  '| E head 0 | E head 1 | E head 2 |\n| --- | --- | --- |\n| E cell 0 0 | ' +
    Array.from({ length: 60 }, () => prose).join(' ') +
    ' tailmark | E cell 0 2 |\n| E cell 1 0 | E cell 1 1 | E cell 1 2 |',
  prose,
  // Table F has an empty header row and an empty body row, so a row holds
  // no text at all.
  '## Table F',
  '|  |  |\n| --- | --- |\n| F 0 0 | F 0 1 |\n|  |  |\n| F 2 0 | F 2 1 |',
  prose,
  '## Table D',
  table(
    'D',
    new Map([
      ['0:11', prose],
      ['1:11', 'dx'],
    ]),
  ),
  prose,
].join('\n\n');
const view = createEditor(host, original, () => {}, { theme });
if (!nested) view.dom.style.height = '640px';

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits for layout to settle: a few frames with no new scroll offset. */
async function settle(): Promise<void> {
  let last = '';
  let still = 0;
  for (let i = 0; i < 120 && still < 4; i++) {
    await frame();
    const now = JSON.stringify([
      wrappers().map((w) => w.scrollLeft),
      view.scrollDOM.scrollTop,
      nested ? [outer.scrollTop, outer.scrollLeft] : null,
    ]);
    still = now === last ? still + 1 : 0;
    last = now;
  }
}

function wrappers(): HTMLElement[] {
  return Array.from(
    view.contentDOM.querySelectorAll('.cm-np-table'),
    (element) => {
      if (!(element instanceof HTMLElement)) throw Error('Missing table.');
      return element;
    },
  );
}

/** The table that holds a document position, by its heading above. */
function tableNameAt(pos: number): string {
  const text = view.state.doc.sliceString(0, pos);
  if (text.includes('## Table D')) return 'D';
  if (text.includes('## Table F')) return 'F';
  if (text.includes('## Table E')) return 'E';
  return text.includes('## Table C')
    ? 'C'
    : text.includes('## Table B')
      ? 'B'
      : 'A';
}

/** The rendered tables by name. A table out of the view has no entry. */
function tablesByName(): Map<string, HTMLElement> {
  return new Map(
    wrappers().map((element) => [tableNameAt(view.posAtDOM(element)), element]),
  );
}

function wrapperAt(pos: number): HTMLElement | null {
  const node = view.domAtPos(pos).node;
  const element = node instanceof Element ? node : node.parentElement;
  const wrapper = element?.closest('.cm-np-table');
  return wrapper instanceof HTMLElement ? wrapper : null;
}

const ready = (async () => {
  const font = new FontFace(
    'Geist',
    'url(/apps/web/public/fonts/geist-latin.woff2)',
  );
  document.fonts.add(font);
  await font.load();
  await document.fonts.ready;
  await settle();
})();

const fixture = {
  ready,
  settle,
  /** Scrolls one table by a person's offset, as a wheel or drag does. */
  /** The middle of one rendered table, where a wheel pans it. */
  center(name: 'A' | 'B' | 'C' | 'D') {
    const box = tablesByName().get(name)?.getBoundingClientRect();
    if (box === undefined) throw Error('Missing table ' + name);
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  },
  pan(name: 'A' | 'B' | 'C' | 'D', left: number) {
    const wrapper = tablesByName().get(name);
    if (wrapper === undefined) throw Error('Missing table ' + name);
    wrapper.scrollLeft = left;
  },
  snapshot() {
    const { from, to, empty } = view.state.selection.main;
    // A match that ends after a pipe ends outside its last cell.
    const wrapper = wrapperAt(to) ?? wrapperAt(from);
    const start = view.coordsAtPos(from, 1);
    const end = view.coordsAtPos(to, -1);
    const box = wrapper?.getBoundingClientRect();
    const scroller = view.scrollDOM.getBoundingClientRect();
    // The rendered parts of the selected match, which can sit in several
    // cells and rows. A zero width match has none and uses its caret.
    const parts = Array.from(
      view.contentDOM.querySelectorAll('.cm-searchMatch-selected'),
      (mark) => Array.from(mark.getClientRects()),
    )
      .flat()
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      }));
    const active = document.activeElement;
    const tables = Object.fromEntries(
      Array.from(tablesByName(), ([name, element]) => [
        name,
        {
          left: element.scrollLeft,
          max: element.scrollWidth - element.clientWidth,
          width: element.clientWidth,
        },
      ]),
    );
    return {
      text: view.state.doc.toString(),
      selection: {
        from,
        to,
        empty,
        ranges: view.state.selection.ranges.length,
      },
      selected: view.state.sliceDoc(from, to),
      table: wrapper === null ? null : tableNameAt(to),
      parts,
      charWidth: view.defaultCharacterWidth,
      match: (() => {
        // The rendered parts measure the match. A zero width match has none,
        // and its caret measures it.
        const ends =
          parts.length > 0
            ? {
                left: Math.min(...parts.map((part) => part.left)),
                right: Math.max(...parts.map((part) => part.right)),
                top: Math.min(...parts.map((part) => part.top)),
                bottom: Math.max(...parts.map((part) => part.bottom)),
              }
            : start !== null && end !== null
              ? {
                  left: Math.min(start.left, end.left),
                  right: Math.max(start.right, end.right),
                  top: Math.min(start.top, end.top),
                  bottom: Math.max(start.bottom, end.bottom),
                }
              : null;
        return ends === null || box === undefined
          ? null
          : {
              ...ends,
              boxLeft: box.left,
              boxRight: box.right,
              screenTop: scroller.top,
              screenBottom: scroller.bottom,
            };
      })(),
      tables,
      pageX: window.scrollX,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      focus:
        active instanceof HTMLElement
          ? (active.getAttribute('aria-label') ??
            (view.contentDOM.contains(active) ? 'text' : active.tagName))
          : null,
      panel: view.dom.querySelector('.cm-np-search') !== null,
      replaceShown:
        view.dom.querySelector<HTMLInputElement>(
          'input[aria-label="Replace with"]',
        )?.hidden === false,
      count:
        view.dom
          .querySelector('.cm-np-search [aria-live]')
          ?.getAttribute('aria-label') ?? null,
    };
  },
  /** The document offset of the first copy of `text`. */
  offset(text: string) {
    return view.state.doc.toString().indexOf(text);
  },
  /**
   * Asks the editor to scroll a range into view as a table-aware caller
   * does: with the ends moved off hidden table syntax first.
   */
  scrollMapped(
    anchor: number,
    head: number,
    y: 'nearest' | 'start' | 'end' | 'center',
  ) {
    view.dispatch({
      effects: EditorView.scrollIntoView(
        measurableRange(view.state, EditorSelection.range(anchor, head)),
        { y },
      ),
    });
  },
  /** Asks the editor to scroll a raw range into view, as any caller may. */
  scrollRange(
    anchor: number,
    head: number,
    y: 'nearest' | 'start' | 'end' | 'center',
    x: 'nearest' | 'start' | 'end' | 'center' = 'nearest',
  ) {
    view.dispatch({
      effects: EditorView.scrollIntoView(EditorSelection.range(anchor, head), {
        y,
        x,
      }),
    });
  },
  /**
   * The rendered text of a document range, measured on its text nodes
   * alone, and the caret rectangle when the range is empty.
   */
  rendered(from: number, to: number) {
    const rects: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }[] = [];
    if (from === to) {
      const caret = view.coordsAtPos(from, 1) ?? view.coordsAtPos(from, -1);
      if (caret !== null)
        rects.push({
          left: caret.left,
          right: caret.right,
          top: caret.top,
          bottom: caret.bottom,
        });
      return rects;
    }
    const first = view.domAtPos(from, 1);
    const last = view.domAtPos(to, -1);
    if (
      !view.contentDOM.contains(first.node) ||
      !view.contentDOM.contains(last.node)
    )
      return rects;
    const range = document.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset);
    // A walker never returns its own root, so a range inside one text node
    // walks from the parent of that node.
    const common = range.commonAncestorContainer;
    const walker = document.createTreeWalker(
      common instanceof Text && common.parentNode !== null
        ? common.parentNode
        : common,
      NodeFilter.SHOW_TEXT,
    );
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      if (!(node instanceof Text) || !range.intersectsNode(node)) continue;
      const part = document.createRange();
      part.setStart(
        node,
        node === range.startContainer ? range.startOffset : 0,
      );
      part.setEnd(
        node,
        node === range.endContainer ? range.endOffset : node.length,
      );
      for (const rect of part.getClientRects())
        if (rect.width > 0 && rect.height > 0)
          rects.push({
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          });
    }
    return rects;
  },
  /** The box that the person sees text through: the editor or the outer box. */
  frame() {
    const box = (nested ? outer : view.scrollDOM).getBoundingClientRect();
    return {
      top: Math.max(box.top, 0),
      bottom: Math.min(box.bottom, window.innerHeight),
      left: Math.max(box.left, 0),
      right: Math.min(box.right, window.innerWidth),
      outerTop: nested ? outer.scrollTop : null,
      outerLeft: nested ? outer.scrollLeft : null,
    };
  },
  /** Puts the caret at the end of the note with the focus in the text. */
  end() {
    view.focus();
    const end = view.state.doc.length;
    view.dispatch({ selection: { anchor: end }, scrollIntoView: true });
  },
  /** The scroll offset of the text, which a wheel moves. */
  top() {
    return view.scrollDOM.scrollTop;
  },
  /** Puts the caret at the start of the note with the focus in the text. */
  home() {
    view.focus();
    view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
  },
  /**
   * Selects an offscreen Find match, then destroys the view between its
   * measure and the deferred reveal. Completion follows that microtask
   * queue, not a fixed delay. This does not cover every later grid retry.
   */
  destroyDuringReveal() {
    return new Promise<void>((resolve, reject) => {
      let destroyed = false;
      const timeout = window.setTimeout(() => {
        if (!destroyed) view.destroy();
        reject(Error('The reveal measure did not complete.'));
      }, 5000);
      const from = view.state.doc.toString().indexOf('tailmark');
      view.dispatch({
        selection: EditorSelection.single(from, from + 'tailmark'.length),
        annotations: Transaction.userEvent.of('select.search'),
      });
      view.requestMeasure({
        read: () => {
          const caret = view.coordsAtPos(from);
          const hidden =
            caret === null || caret.top < 0 || caret.bottom > innerHeight;
          // Reads precede writes. This callback runs before the reveal
          // queued by a write, while completion runs after that reveal.
          queueMicrotask(() => {
            view.destroy();
            destroyed = true;
            queueMicrotask(() => {
              window.clearTimeout(timeout);
              if (hidden) resolve();
              else reject(Error('The destroy case needs an offscreen match.'));
            });
          });
        },
      });
    });
  },
  destroy() {
    view.destroy();
  },
};

declare global {
  interface Window {
    searchTableReveal: typeof fixture;
  }
}
window.searchTableReveal = fixture;
