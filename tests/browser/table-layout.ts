/** Check table geometry in a disposable deployment with a long table note. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { parseMarkdown } from '@notesapp/markdown';
import { pathToFileURL } from 'node:url';
import { hasChromium, isRecord } from './browser.ts';

const loaded: unknown = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '.local-app/node_modules/playwright-core/index.mjs',
  ).href
);
assert.ok(hasChromium(loaded));
const notePath = process.env.TABLE_NOTE_PATH;
const readerPath = process.env.TABLE_READER_PATH;
assert.ok(
  notePath?.startsWith('/w/'),
  'Set TABLE_NOTE_PATH to a long table fixture.',
);
assert.ok(
  readerPath?.startsWith('/published/'),
  'Set TABLE_READER_PATH to its published page.',
);
const fixture: unknown = JSON.parse(
  readFileSync(
    process.env.TABLE_FIXTURE_PATH ?? '.local-app/table-fixture.json',
    'utf8',
  ),
);
assert.ok(isRecord(fixture) && typeof fixture.text === 'string');
const parsed = parseMarkdown(fixture.text);
const sourceTable = parsed.children.find((node) => node.type === 'table');
assert.ok(sourceTable?.type === 'table');
type TextNode = {
  readonly type: string;
  readonly value?: string;
  readonly children?: readonly TextNode[];
};
const textOf = (node: TextNode): string =>
  node.value ?? node.children?.map(textOf).join('') ?? '';
const cellRows = sourceTable.children.map((row) => row.children.map(textOf));
const origin = process.env.UI_AUDIT_ORIGIN ?? 'http://localhost:3000';
mkdirSync('.local-app/screenshots', { recursive: true });
const browser = await loaded.chromium.launch();
try {
  for (const width of [320, 390, 1440])
    for (const scheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        storageState:
          process.env.UI_AUDIT_STATE ?? '.local-app/review-session.json',
        viewport: { width, height: 844 },
        hasTouch: width < 1024,
        isMobile: width < 1024,
        colorScheme: scheme,
      });
      try {
        await context.addInitScript(
          (theme) => localStorage.setItem('notesapp.theme', theme),
          scheme,
        );
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin + notePath);
        await page.locator('.cm-np-table-head').first().waitFor();
        const geometry = async () =>
          page.evaluate(async (sourceRows) => {
            await document.fonts.ready;
            await new Promise(requestAnimationFrame);
            const table = document.querySelector('.cm-np-table');
            if (!(table instanceof HTMLElement)) throw Error('Table missing.');
            const rows = [
              ...table.querySelectorAll(
                '.cm-np-table-line:not(.cm-np-table-closed)',
              ),
            ];
            const bounds = new Map<string, { left: number; width: number }>();
            for (const row of rows)
              for (const cell of row.querySelectorAll(
                '.cm-np-table-cell, .cm-np-table-head',
              )) {
                const style = getComputedStyle(cell);
                const column = style.gridColumnStart;
                if (
                  cell.getBoundingClientRect().width + 1 <
                  parseFloat(style.minWidth)
                )
                  throw Error('A cell is below the readable minimum.');
                if (cell.scrollWidth > cell.clientWidth + 1)
                  throw Error('Cell content is clipped.');
                const box = cell.getBoundingClientRect();
                const previous = bounds.get(column);
                if (
                  previous &&
                  (Math.abs(previous.left - box.left) > 1 ||
                    Math.abs(previous.width - box.width) > 1)
                )
                  throw Error('Table columns do not align.');
                bounds.set(column, { left: box.left, width: box.width });
                if (box.height < 24)
                  throw Error('An empty cell has no usable height.');
              }
            const header = table.querySelector('.cm-np-table-head');
            const body = table.querySelector('.cm-np-table-cell');
            if (body === null) throw Error('Body missing.');
            const bodyStyle = getComputedStyle(body);
            const maxima = [0, 0, 0];
            // Measure actual browser text independently of the canvas used
            // by the implementation. The probe takes no space in the note.
            const probe = document.createElement('span');
            probe.style.position = 'absolute';
            probe.style.whiteSpace = 'pre';
            probe.style.visibility = 'hidden';
            document.body.append(probe);
            const widths = new Map<string, number>();
            try {
              sourceRows.forEach((row, rowIndex) =>
                row.forEach((text, column) => {
                  const style =
                    header !== null && rowIndex === 0
                      ? getComputedStyle(header)
                      : bodyStyle;
                  const weight =
                    rowIndex === 0
                      ? bodyStyle.getPropertyValue('--font-weight-note-heading')
                      : style.fontWeight;
                  const font = `${style.fontStyle} ${weight} ${style.fontSize} ${style.fontFamily}`;
                  const key = `${font}:${text}`;
                  let width = widths.get(key);
                  if (width === undefined) {
                    probe.style.font = font;
                    probe.style.letterSpacing = style.letterSpacing;
                    probe.style.fontVariantNumeric = style.fontVariantNumeric;
                    probe.style.fontFeatureSettings = style.fontFeatureSettings;
                    probe.textContent = text;
                    width = probe.getBoundingClientRect().width;
                    widths.set(key, width);
                  }
                  maxima[column] = Math.max(
                    maxima[column] ?? 0,
                    width +
                      parseFloat(style.paddingLeft) +
                      parseFloat(style.paddingRight) +
                      parseFloat(style.borderLeftWidth) +
                      parseFloat(style.borderRightWidth),
                  );
                }),
              );
            } finally {
              probe.remove();
            }
            for (const [column, box] of bounds) {
              const limit = maxima[Number(column) - 2] ?? 0;
              const padding =
                parseFloat(bodyStyle.paddingLeft) +
                parseFloat(bodyStyle.paddingRight) +
                parseFloat(bodyStyle.borderLeftWidth) +
                parseFloat(bodyStyle.borderRightWidth);
              if (box.width > 20 * parseFloat(bodyStyle.fontSize) + padding + 2)
                throw Error('A long token bypasses the column cap.');
              if (
                box.width >
                Math.max(limit, parseFloat(bodyStyle.minWidth)) + 2
              )
                throw Error(
                  `Column ${column} has redundant space: ${String(box.width)} px for ${String(limit)} px of content and padding.`,
                );
            }
            return {
              tracks: getComputedStyle(rows[0] ?? table).gridTemplateColumns,
              columns: bounds.size,
              width: table.clientWidth,
              content: table.scrollWidth,
              pageWidth: document.documentElement.scrollWidth,
              viewport: innerWidth,
            };
          }, cellRows);
        const start = await geometry();
        assert.equal(start.columns, sourceTable.children[0]?.children.length);
        assert.ok(
          start.pageWidth <= start.viewport,
          'A wide table must not widen the page.',
        );
        assert.ok(start.content >= start.width);
        assert.ok(
          await page
            .locator('.cm-np-table-head')
            .first()
            .evaluate(
              (cell) =>
                cell.getBoundingClientRect().width + 1 >=
                parseFloat(getComputedStyle(cell).minWidth),
            ),
          'Columns retain the readable minimum.',
        );
        await page.screenshot({
          path: `.local-app/screenshots/table-editor-${width}-${scheme}.png`,
        });
        await page.locator('.cm-scroller').evaluate(async (element) => {
          element.scrollTop = element.scrollHeight / 2;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        assert.equal(
          (await geometry()).tracks,
          start.tracks,
          'Rows outside the first viewport use the same tracks.',
        );
        await page.locator('.cm-np-table').evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        assert.equal((await geometry()).tracks, start.tracks);
        assert.ok(
          await page
            .locator('.cm-np-table')
            .evaluate(
              (element) =>
                element.scrollWidth <= element.clientWidth + 1 ||
                element.scrollLeft + element.clientWidth >=
                  element.scrollWidth - 1,
            ),
          'The last editor column is reachable.',
        );
        await page.locator('.cm-scroller').evaluate(async (element) => {
          element.scrollTop = 0;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        assert.equal(
          (await geometry()).tracks,
          start.tracks,
          'Returning to the header must not resize columns.',
        );
        const firstCell = page.locator('.cm-np-table-cell').first();
        const original = await firstCell.evaluate(
          (element) => element.textContent,
        );
        await firstCell.click();
        await page.keyboard.press('q');
        assert.ok(
          (
            await firstCell.evaluate((element) => element.textContent)
          )?.includes('q'),
          'The text grid accepts typing in a cell.',
        );
        await page.keyboard.press('Control+z');
        assert.equal(
          await firstCell.evaluate((element) => element.textContent),
          original,
          'Undo restores the cell.',
        );
        for (const key of ['Tab', 'Shift+Tab']) {
          for (let column = 1; column < start.columns; column++) {
            await page.keyboard.press(key);
            assert.ok(
              await page.evaluate(async () => {
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
                // Use the editor caret API. A collapsed DOM Range can have
                // a zero rectangle at a hidden Markdown boundary.
                const record = (
                  value: unknown,
                ): value is Record<string, unknown> =>
                  typeof value === 'object' && value !== null;
                const content = document.querySelector('.cm-content');
                if (content === null) return false;
                const tile: unknown = Reflect.get(content, 'cmTile');
                if (
                  !record(tile) ||
                  !record(tile.root) ||
                  !record(tile.root.view)
                )
                  return false;
                const view = tile.root.view;
                const state = view.state;
                if (
                  !record(state) ||
                  !record(state.selection) ||
                  !record(state.selection.main)
                )
                  return false;
                const head = state.selection.main.head;
                if (
                  typeof head !== 'number' ||
                  typeof view.coordsAtPos !== 'function' ||
                  typeof view.domAtPos !== 'function'
                )
                  return false;
                const caret: unknown = view.coordsAtPos.call(view, head);
                if (
                  !record(caret) ||
                  typeof caret.left !== 'number' ||
                  typeof caret.right !== 'number'
                )
                  return false;
                const position: unknown = view.domAtPos.call(view, head);
                if (!record(position) || !(position.node instanceof Node))
                  return false;
                const element =
                  position.node instanceof Element
                    ? position.node
                    : position.node.parentElement;
                const wrapper = element?.closest('.cm-np-table');
                if (!(wrapper instanceof HTMLElement)) return false;
                const bounds = wrapper.getBoundingClientRect();
                return (
                  caret.left >= bounds.left - 1 &&
                  caret.right <= bounds.right + 1 &&
                  document.documentElement.scrollWidth <= innerWidth
                );
              }),
              'Cell navigation keeps the caret inside the table viewport.',
            );
          }
        }
        await page.goto(origin + readerPath);
        await page.locator('.notes-table-scroll table').waitFor();
        const reader = await page
          .locator('.notes-table-scroll')
          .evaluate((element) => {
            const style = getComputedStyle(element);
            if (
              element.matches(':focus-visible') ||
              (style.outlineStyle !== 'none' &&
                parseFloat(style.outlineWidth) > 0)
            )
              throw Error('The resting scroll area has a focus ring.');
            if (
              [
                style.borderTopWidth,
                style.borderRightWidth,
                style.borderBottomWidth,
                style.borderLeftWidth,
              ].some((width) => parseFloat(width) > 0)
            )
              throw Error('The scroll area has a resting border.');
            const table = element.querySelector('table');
            if (table === null) throw Error('Reader table missing.');
            const tableWidth = table.getBoundingClientRect().width;
            if (
              tableWidth <= element.clientWidth &&
              Math.abs(element.getBoundingClientRect().width - tableWidth) > 1
            )
              throw Error('The scroll area is wider than its table.');
            const rows = [...element.querySelectorAll('tr')];
            const header = [...(rows[0]?.querySelectorAll('th') ?? [])].map(
              (cell) => cell.getBoundingClientRect(),
            );
            for (const row of rows.slice(1))
              [...row.querySelectorAll('td')].forEach((cell, index) => {
                const box = cell.getBoundingClientRect();
                const head = header[index];
                if (
                  !head ||
                  Math.abs(head.left - box.left) > 1 ||
                  Math.abs(head.width - box.width) > 1
                )
                  throw Error('Reader columns do not align.');
              });
            return {
              width: element.clientWidth,
              content: element.scrollWidth,
              display: getComputedStyle(
                element.querySelector('table') ?? element,
              ).display,
              pageWidth: document.documentElement.scrollWidth,
              viewport: innerWidth,
            };
          });
        assert.equal(reader.display, 'table');
        assert.ok(reader.content >= reader.width);
        assert.ok(
          await page
            .locator('.notes-table-scroll th')
            .first()
            .evaluate(
              (cell) =>
                cell.getBoundingClientRect().width + 1 >=
                parseFloat(getComputedStyle(cell).minWidth),
            ),
          'Reader columns retain the readable minimum.',
        );
        assert.ok(reader.pageWidth <= reader.viewport);
        assert.ok(
          await page.locator('.notes-table-scroll').evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
            return (
              element.scrollLeft + element.clientWidth >=
              element.scrollWidth - 1
            );
          }),
          'The last reader column is reachable.',
        );
        await page.keyboard.press('Tab');
        assert.ok(
          await page.locator('.notes-table-scroll').evaluate((element) => {
            const style = getComputedStyle(element);
            return (
              element === document.activeElement &&
              element.matches(':focus-visible') &&
              style.outlineStyle !== 'none' &&
              parseFloat(style.outlineWidth) >= 2
            );
          }),
          'Keyboard focus has a visible ring around the table.',
        );
        await page
          .locator('.notes-table-scroll')
          .evaluate((element) => element.blur());
        assert.ok(
          await page.locator('.notes-table-scroll').evaluate((element) => {
            const style = getComputedStyle(element);
            return (
              !element.matches(':focus-visible') &&
              (style.outlineStyle === 'none' ||
                parseFloat(style.outlineWidth) === 0)
            );
          }),
          'The focus ring leaves when the scroll area loses focus.',
        );
        await page.screenshot({
          path: `.local-app/screenshots/table-reader-${width}-${scheme}.png`,
        });
        const wideReaderPath = process.env.TABLE_WIDE_READER_PATH;
        if (wideReaderPath !== undefined) {
          await page.goto(origin + wideReaderPath);
          const scrollArea = page.locator('.notes-table-scroll');
          await scrollArea.waitFor();
          assert.ok(
            await scrollArea.evaluate(
              (element) =>
                element.scrollWidth > element.clientWidth &&
                document.documentElement.scrollWidth <= innerWidth,
            ),
            'A wide table scrolls inside the page.',
          );
          await page.keyboard.press('Tab');
          await page.keyboard.press('ArrowRight');
          assert.ok(
            await scrollArea.evaluate(async (element) => {
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
              return (
                element === document.activeElement && element.scrollLeft > 0
              );
            }),
            'A keyboard user can scroll a wide table.',
          );
        }
        assert.deepEqual(errors, []);
        process.stdout.write(`Table layout passed: ${width} px, ${scheme}.\n`);
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
}
