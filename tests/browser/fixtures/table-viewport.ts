/** A real editor and synthetic data for viewport lifecycle checks. */
import { createEditor } from '../../../packages/editor/src/create-editor.ts';
import * as grid from '../../../packages/editor/src/table-grid.ts';
import { applyThemeToDocument, defaultThemeFor } from '@notesapp/ui';

const host = document.createElement('main');
document.body.append(host);
document.body.style.margin = '0';
const theme =
  new URLSearchParams(location.search).get('theme') === 'light'
    ? 'light'
    : 'dark';
applyThemeToDocument(defaultThemeFor(theme));
const prose =
  'Normal readable prose describes a synthetic test plan with enough detail for a useful review.';
const table = (columns: number, rows = 6): string =>
  '| ' +
  Array.from({ length: columns }, (_, i) => 'Field ' + String(i)).join(' | ') +
  ' |\n| ' +
  Array.from({ length: columns }, () => '---').join(' | ') +
  ' |\n' +
  Array.from(
    { length: rows },
    (_, row) =>
      '| ' +
      Array.from({ length: columns }, (_, col) =>
        col === 0 ? 'Synthetic row ' + String(row) : prose,
      ).join(' | ') +
      ' |',
  ).join('\n');
const original =
  Array.from(
    { length: 32 },
    (_, section) =>
      '## Synthetic section ' +
      String(section) +
      '\n\n' +
      prose +
      '\n\n' +
      table(section === 0 ? 16 : section % 4 === 0 ? 7 : 2) +
      '\n\n',
  ).join('\n') +
  '\n\n## Body-only first visit\n\n' +
  table(2, 140);
const view = createEditor(host, original, () => {}, { theme });
view.dom.style.height = '700px';
let watch = false;
const known = new Set<string>();
const firstVisits: string[] = [];
const failures: { id: string; tracks: string; head: number; top: number }[] =
  [];
let frames = 0;
function tables() {
  return Array.from(
    view.contentDOM.querySelectorAll('.cm-np-table'),
    (element) => {
      if (!(element instanceof HTMLElement))
        throw Error('Missing table element.');
      const id = element.getAttribute('data-notes-table') ?? '';
      const tracks = element.style.getPropertyValue('--notes-table-columns');
      const head = element.querySelectorAll('.cm-np-table-head').length;
      if (
        watch &&
        known.has(id) &&
        tracks.startsWith('repeat(') &&
        failures.length < 30
      )
        failures.push({ id, tracks, head, top: view.scrollDOM.scrollTop });
      if (
        !known.has(id) &&
        head === 0 &&
        tracks.startsWith('repeat(') &&
        !firstVisits.includes(id)
      )
        firstVisits.push(id);
      if (tracks !== '' && !tracks.startsWith('repeat(')) known.add(id);
      return {
        id,
        tracks,
        head,
        width: element.clientWidth,
        left: element.scrollLeft,
      };
    },
  );
}
const observer = new MutationObserver(() => tables());
observer.observe(view.contentDOM, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['style'],
});
function anchor() {
  const viewport = view.scrollDOM.getBoundingClientRect();
  for (const line of view.contentDOM.querySelectorAll(
    '.cm-np-table-line:not(.cm-np-table-closed)',
  )) {
    const box = line.getBoundingClientRect();
    if (box.top >= viewport.top && box.top < viewport.bottom)
      return { from: view.posAtDOM(line), top: box.top - viewport.top };
  }
  return null;
}
const frame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => {
      frames++;
      tables();
      resolve();
    }),
  );
async function observe(duration: number) {
  // Check every frame during an input-free observation interval, not a readiness sleep.
  const end = performance.now() + duration;
  do {
    await frame();
  } while (performance.now() < end);
}
const ready = (async () => {
  const font = new FontFace(
    'Geist',
    'url(/apps/web/public/fonts/geist-latin.woff2)',
  );
  document.fonts.add(font);
  await font.load();
  await document.fonts.ready;
  await frame();
  await frame();
  await frame();
})();
const fixture = {
  ready,
  snapshot: () => ({
    tables: tables(),
    failures: [...failures],
    frames,
    firstVisits: [...firstVisits],
    text: view.state.doc.toString(),
    selection: {
      ranges: view.state.selection.ranges.map(({ anchor, head }) => ({
        anchor,
        head,
      })),
      main: view.state.selection.mainIndex,
    },
    top: view.scrollDOM.scrollTop,
  }),
  start: () => {
    tables();
    watch = true;
  },
  async sweep(direction: number) {
    for (let i = 0; i < 100; i++) {
      view.scrollDOM.scrollTop += direction * 650;
      await frame();
    }
    await frame();
    await frame();
    const before = anchor();
    await observe(650);
    return { before, after: anchor() };
  },
  async geometry(width: number, fontSize: number) {
    host.style.width = String(width) + 'px';
    document.documentElement.style.fontSize = String(fontSize) + 'px';
    await observe(650);
  },
  async loadHeaderFont() {
    let completed = 0;
    const loaded = () => completed++;
    document.fonts.addEventListener('loadingdone', loaded);
    try {
      const font = new FontFace(
        'Geist',
        'url(/apps/web/public/fonts/geist-latin.woff2)',
        { weight: '600' },
      );
      document.fonts.add(font);
      await font.load();
      await document.fonts.ready;
      await observe(650);
      return { completed, status: font.status, tables: tables() };
    } finally {
      document.fonts.removeEventListener('loadingdone', loaded);
    }
  },
  async zoom(value: string) {
    document.body.style.zoom = value;
    await observe(650);
  },
  async jump(section: number, row = 0) {
    const source = view.state.doc.toString();
    const from =
      section < 0
        ? source.indexOf('## Body-only first visit')
        : source.indexOf('## Synthetic section ' + String(section) + '\n');
    const at = source.indexOf('Synthetic row ' + String(row) + ' |', from);
    view.scrollDOM.scrollTop = view.lineBlockAt(at).top;
    await frame();
    await frame();
    const before = anchor();
    await observe(650);
    return { before, after: anchor() };
  },
  pause: () => {
    watch = false;
  },
  async editColumn(remove: boolean) {
    const from = view.state.doc.toString().indexOf('| Field');
    const table = grid.tableAt(view.state, from);
    if (table === null) throw Error('Missing first table.');
    const pos = remove ? table.rows[0]?.cells.at(-1)?.textFrom : from + 2;
    const spec = grid.tableEditSpec(
      view.state,
      remove ? grid.removeColumnEdit : grid.appendColumnEdit,
      pos,
    );
    if (spec === null) throw Error('Missing table edit.');
    view.dispatch({ ...spec, userEvent: 'input.format' });
    await observe(650);
    return tables();
  },
  async deleteFirst() {
    const from = view.state.doc.toString().indexOf('| Field');
    const before = tables()[0]?.id;
    const spec = grid.deleteTableSpec(view.state, from);
    if (spec === null) throw Error('Missing table deletion.');
    view.dispatch({ ...spec, userEvent: 'input.format' });
    await observe(650);
    return { before, after: tables() };
  },
  async first() {
    view.scrollDOM.scrollTop = 0;
    await observe(650);
  },
  async horizontal() {
    const element = view.contentDOM.querySelector('.cm-np-table');
    if (!(element instanceof HTMLElement)) throw Error('Missing table.');
    element.scrollLeft = 100;
    await observe(650);
    return element.scrollLeft;
  },
  async replace() {
    watch = false;
    const before = tables().map((t) => t.id);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: table(2) },
      selection: { anchor: 2 },
      filter: false,
    });
    await observe(650);
    return { before, after: tables() };
  },
  destroy: () => {
    observer.disconnect();
    view.destroy();
  },
};
window.tableViewport = fixture;
declare global {
  interface Window {
    tableViewport: typeof fixture;
  }
}
