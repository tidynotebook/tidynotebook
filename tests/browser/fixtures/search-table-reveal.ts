/** A real editor with two wide tables for checks of Find in a table. */
import { createEditor } from '../../../packages/editor/src/create-editor.ts';
import { applyThemeToDocument, defaultThemeFor } from '@notesapp/ui';

const host = document.createElement('main');
host.style.width = '900px';
document.body.append(host);
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
].join('\n\n');
const view = createEditor(host, original, () => {}, { theme });
view.dom.style.height = '640px';

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits for layout to settle: a few frames with no new scroll offset. */
async function settle(): Promise<void> {
  let last = '';
  let still = 0;
  for (let i = 0; i < 120 && still < 4; i++) {
    await frame();
    const now =
      JSON.stringify(wrappers().map((w) => w.scrollLeft)) +
      String(view.scrollDOM.scrollTop);
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
  center(name: 'A' | 'B' | 'C') {
    const box = tablesByName().get(name)?.getBoundingClientRect();
    if (box === undefined) throw Error('Missing table ' + name);
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  },
  pan(name: 'A' | 'B' | 'C', left: number) {
    const wrapper = tablesByName().get(name);
    if (wrapper === undefined) throw Error('Missing table ' + name);
    wrapper.scrollLeft = left;
  },
  snapshot() {
    const { from, to, empty } = view.state.selection.main;
    const wrapper = wrapperAt(to);
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
      match:
        start === null || end === null || box === undefined
          ? null
          : {
              left:
                parts.length > 0
                  ? Math.min(...parts.map((part) => part.left))
                  : Math.min(start.left, end.left),
              right:
                parts.length > 0
                  ? Math.max(...parts.map((part) => part.right))
                  : Math.max(start.right, end.right),
              top:
                parts.length > 0
                  ? Math.min(...parts.map((part) => part.top))
                  : Math.min(start.top, end.top),
              bottom:
                parts.length > 0
                  ? Math.max(...parts.map((part) => part.bottom))
                  : Math.max(start.bottom, end.bottom),
              boxLeft: box.left,
              boxRight: box.right,
              screenTop: scroller.top,
              screenBottom: scroller.bottom,
            },
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
  /** Puts the caret at the start of the note with the focus in the text. */
  home() {
    view.focus();
    view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
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
