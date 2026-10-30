/** Visual parity records use text and accessible names, not wrapper depth. */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import type { Page } from './browser.ts';
export async function captureSurface(
  page: Page,
  name: string,
  folder: string,
): Promise<void> {
  mkdirSync(folder, { recursive: true });
  const geometry = await page.evaluate((scope) => {
    const counts = new Map<string, number>();
    return [
      ...(scope
        ? (document.querySelector(scope) ?? document)
        : document
      ).querySelectorAll(
        'h1,h2,h3,label,button,a,input,select,textarea,[role=treeitem],[role=switch],[data-tree-name],header,footer,main,nav,[role=dialog]',
      ),
    ]
      .filter(
        (e) =>
          e.checkVisibility({ visibilityProperty: true }) &&
          e.getBoundingClientRect().width > 0,
      )
      .map((e) => {
        const text = (
          e.getAttribute('aria-label') ??
          e.getAttribute('data-tree-name') ??
          (e instanceof HTMLInputElement ? e.id : e.textContent) ??
          ''
        )
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\b\d+ (minutes?|hours?|days?) ago\b/g, 'TIME')
          .slice(0, 160);
        const base = `${e.tagName}:${e.getAttribute('role') ?? ''}:${text}`,
          index = counts.get(base) ?? 0;
        counts.set(base, index + 1);
        const r = e.getBoundingClientRect();
        let contentX: number | null = null;
        const walker = document.createTreeWalker(
          e,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (
            node instanceof Element &&
            !node.checkVisibility({
              visibilityProperty: true,
              opacityProperty: true,
            })
          )
            continue;
          if (node instanceof SVGElement && node.tagName === 'svg') {
            contentX = node.getBoundingClientRect().left;
            break;
          }
          if (
            node.nodeType !== Node.TEXT_NODE ||
            !node.textContent?.trim() ||
            !node.parentElement?.checkVisibility({
              visibilityProperty: true,
              opacityProperty: true,
            }) ||
            node.parentElement.closest('.sr-only,svg')
          )
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const textBox = range.getClientRects()[0];
          if (textBox?.width) {
            contentX = textBox.left;
            break;
          }
        }
        return {
          key: `${base}:${index}`,
          text,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          contentX,
          surface: getComputedStyle(e).backgroundColor,
          current:
            e.getAttribute('aria-current') ?? e.getAttribute('aria-pressed'),
        };
      });
  }, process.env.DS1_SCOPE ?? '');
  writeFileSync(`${folder}/${name}.json`, JSON.stringify(geometry, null, 2));
  await page.screenshot({
    path: `${folder}/${name}.png`,
    animations: 'disabled',
  });
}
type Geometry = {
  key: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  contentX?: number | null;
  surface?: string;
  current?: string | null;
};
function isGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== 'object') return false;
  return (
    'key' in value &&
    typeof value.key === 'string' &&
    'text' in value &&
    typeof value.text === 'string' &&
    (!('contentX' in value) ||
      value.contentX === null ||
      (typeof value.contentX === 'number' &&
        Number.isFinite(value.contentX))) &&
    (!('surface' in value) || typeof value.surface === 'string') &&
    (!('current' in value) ||
      value.current === null ||
      typeof value.current === 'string') &&
    ['x', 'y', 'width', 'height'].every(
      (name) =>
        typeof Reflect.get(value, name) === 'number' &&
        Number.isFinite(Reflect.get(value, name)),
    )
  );
}
function readGeometry(file: string): Geometry[] {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) throw Error('A parity record must be a list');
  const entries: unknown[] = data;
  if (!entries.every(isGeometry))
    throw Error('A parity record must contain finite geometry');
  return entries;
}
export function compareSurface(before: string, after: string) {
  if (!existsSync(before) || !existsSync(after))
    throw Error('Both parity records are required');
  const old = new Map(readGeometry(before).map((item) => [item.key, item]));
  const changes: {
    key: string;
    before: Geometry;
    after: Geometry;
    delta: number;
  }[] = [];
  for (const next of readGeometry(after)) {
    const previous = old.get(next.key);
    if (!previous || !previous.height || !next.height) continue;
    const delta = Math.max(
      typeof next.contentX === 'number' && typeof previous.contentX === 'number'
        ? Math.abs(next.contentX - previous.contentX)
        : 0,
      previous.surface !== undefined && next.surface !== previous.surface
        ? 2
        : 0,
      previous.current !== undefined && next.current !== previous.current
        ? 2
        : 0,
      ...(['x', 'y', 'width', 'height'] as const).map((p) =>
        Math.abs(next[p] - previous[p]),
      ),
    );
    if (delta > 1)
      changes.push({ key: next.key, before: previous, after: next, delta });
  }
  return changes;
}

/** Every composed surface uses the same measured contract. */
export async function auditComposition(page: Page) {
  const result = await page.evaluate(() => {
    const coarse = matchMedia('(pointer:coarse)').matches,
      issues: {
        kind: string;
        text: string;
        actual: number;
        expected: number;
      }[] = [];
    const visible = (e: Element) =>
      e.checkVisibility({ visibilityProperty: true }) &&
      e.getBoundingClientRect().width > 0 &&
      e.getBoundingClientRect().height > 0;
    const check = (
      e: Element,
      kind: string,
      actual: number,
      expected: number,
      tolerance = 1,
    ) => {
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance)
        issues.push({
          kind,
          text: (e.getAttribute('aria-label') ?? e.textContent ?? '')
            .trim()
            .slice(0, 80),
          actual,
          expected,
        });
    };
    const step = (e: Element, name: string): number | undefined => {
      const raw = e.getAttribute(`data-ui-${name}`);
      if (raw === null) return undefined;
      const data: unknown = JSON.parse(raw);
      if (typeof data === 'number') return data * 4;
      if (data && typeof data === 'object') {
        const value: unknown = Reflect.get(data, coarse ? 'coarse' : 'fine');
        if (typeof value === 'number') return value * 4;
      }
      throw Error('Invalid component spacing contract');
    };
    const layouts = [...document.querySelectorAll('[data-ui-layout]')].filter(
      visible,
    );
    for (const e of layouts) {
      const s = getComputedStyle(e),
        pad = step(e, 'pad'),
        x = step(e, 'padx') ?? pad,
        y = step(e, 'pady') ?? pad,
        before = Number(e.getAttribute('data-window-before') ?? 0),
        after = Number(e.getAttribute('data-window-after') ?? 0);
      check(e, 'nonnegative virtual start', Math.min(before, 0), 0);
      check(e, 'nonnegative virtual end', Math.min(after, 0), 0);
      check(
        e,
        'symmetric horizontal padding',
        parseFloat(s.paddingLeft),
        parseFloat(s.paddingRight),
      );
      check(
        e,
        'symmetric vertical padding',
        parseFloat(s.paddingTop) - before,
        parseFloat(s.paddingBottom) - after,
      );
      if (x !== undefined) {
        check(e, 'horizontal inset', parseFloat(s.paddingLeft), x);
        check(e, 'right inset', parseFloat(s.paddingRight), x);
      }
      if (y !== undefined) {
        check(e, 'vertical inset', parseFloat(s.paddingTop) - before, y);
        check(e, 'bottom inset', parseFloat(s.paddingBottom) - after, y);
      }
      const gap = step(e, 'gap'),
        gx = step(e, 'gapx') ?? gap,
        gy = step(e, 'gapy') ?? gap;
      if (gx !== undefined) check(e, 'column gap', parseFloat(s.columnGap), gx);
      if (gy !== undefined) check(e, 'row gap', parseFloat(s.rowGap), gy);
    }
    for (const item of document.querySelectorAll(
      '[data-menu-input="pointer"]:focus',
    )) {
      const style = getComputedStyle(item);
      check(
        item,
        'pointer menu focus ring',
        style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0
          ? 1
          : 0,
        1,
        0,
      );
    }
    for (const close of [
      ...document.querySelectorAll(
        '.ui-settings-heading [aria-label="Close Settings"]',
      ),
    ].filter(visible)) {
      check(
        close,
        'right Close slot',
        close
          .closest('[data-header-slot]')
          ?.getAttribute('data-header-slot') === 'trailing'
          ? 1
          : 0,
        1,
        0,
      );
      const glyph = close.querySelector('svg'),
        header = close.closest('header');
      if (glyph && header)
        check(
          close,
          'right Close glyph edge',
          glyph.getBoundingClientRect().right,
          header.getBoundingClientRect().right -
            parseFloat(getComputedStyle(header).paddingRight),
        );
    }
    for (const dialog of [
      ...document.querySelectorAll('[data-dialog-inset]'),
    ].filter(visible)) {
      const box = dialog.getBoundingClientRect(),
        style = getComputedStyle(dialog);
      for (const padding of [
        style.paddingTop,
        style.paddingBottom,
        style.paddingLeft,
        style.paddingRight,
      ])
        check(dialog, 'dialog inset', parseFloat(padding), 24);
      check(
        dialog,
        'dialog viewport center',
        box.top + box.height / 2,
        innerHeight / 2,
      );
      const scrim = dialog.closest('[data-notes-dialog-root]');
      if (scrim)
        check(
          dialog,
          'dialog scrim semantics',
          ['transparent', 'rgba(0, 0, 0, 0)'].includes(
            getComputedStyle(scrim).backgroundColor,
          )
            ? 0
            : 1,
          1,
          0,
        );
      const body = dialog.querySelector('.ui-scroll-region'),
        footer = dialog.querySelector('.ui-dialog-footer');
      for (const region of [body, footer])
        if (region && visible(region))
          check(
            region,
            'dialog nested inset',
            parseFloat(getComputedStyle(region).paddingLeft),
            0,
          );
    }
    for (const column of [
      ...document.querySelectorAll('[data-form-column]'),
    ].filter(visible)) {
      const fields = [
        ...column.querySelectorAll(
          'input:not([type=checkbox]),select,textarea',
        ),
      ].filter(visible);
      const edge = column.getBoundingClientRect();
      if (!coarse)
        check(column, 'form maximum width', Math.max(0, edge.width - 512), 0);
      for (const field of fields) {
        if (field.closest('[data-short-field]')) continue;
        const box = field.getBoundingClientRect();
        check(field, 'form left edge', box.left, edge.left);
        const pair = field.closest('[data-field-pair]');
        if (!pair) check(field, 'form right edge', box.right, edge.right);
      }
    }
    const sidePanel = document.querySelector(
      '[aria-label="Note outline and inbound links"]',
    );
    if (sidePanel && visible(sidePanel)) {
      const style = getComputedStyle(sidePanel);
      for (const padding of [
        style.paddingTop,
        style.paddingBottom,
        style.paddingLeft,
        style.paddingRight,
      ])
        check(
          sidePanel,
          'note panel inset',
          parseFloat(padding),
          coarse ? 12 : 8,
        );
      check(
        sidePanel,
        'note panel group gap',
        parseFloat(style.gap),
        coarse ? 12 : 8,
      );
      for (const header of sidePanel.querySelectorAll('[aria-expanded]'))
        if (visible(header))
          check(
            header,
            'note panel tree header',
            header.getBoundingClientRect().height,
            coarse ? 36 : 28,
          );
    }
    const rows = [...document.querySelectorAll('[data-ui-row]')].filter(
        visible,
      ),
      edges = new Map<Element, number>();
    for (const e of rows) {
      const s = getComputedStyle(e),
        r = e.getBoundingClientRect(),
        setting = e.getAttribute('data-ui-row') === 'setting',
        y = setting ? 12 : coarse ? 8 : 4,
        x = e.classList.contains('ui-content-row')
          ? 0
          : setting
            ? coarse
              ? 16
              : 0
            : coarse
              ? 12
              : 8;
      for (const copy of [
        e,
        ...e.querySelectorAll(
          '.ui-settings-copy,.ui-settings-copy > span,.ui-settings-copy > p',
        ),
      ].filter(visible)) {
        check(
          copy,
          'row text alignment',
          getComputedStyle(copy).textAlign === 'left' ? 1 : 0,
          1,
          0,
        );
      }
      check(e, 'row vertical inset', parseFloat(s.paddingTop), y);
      check(e, 'row bottom inset', parseFloat(s.paddingBottom), y);
      check(e, 'row left inset', parseFloat(s.paddingLeft), x);
      check(e, 'row right inset', parseFloat(s.paddingRight), x);
      const children = [...e.children].filter(
        (c) => visible(c) && getComputedStyle(c).position !== 'absolute',
      );
      if (children.length) {
        const top = Math.min(
            ...children.map((c) => c.getBoundingClientRect().top),
          ),
          bottom = Math.max(
            ...children.map((c) => c.getBoundingClientRect().bottom),
          );
        check(e, 'visible vertical symmetry', top - r.top, r.bottom - bottom);
      }
      const copy = e.querySelector('[data-setting-text],.ui-settings-copy'),
        control = e.querySelector(
          '[data-setting-control],.ui-settings-control',
        );
      if (copy && control) {
        const a = copy.getBoundingClientRect(),
          b = control.getBoundingClientRect();
        check(e, 'row control center', a.y + a.height / 2, b.y + b.height / 2);
      }
      const label = e.querySelector('[data-setting-label]'),
        help = e.querySelector('[data-setting-help]');
      if (label && help && visible(help))
        check(
          e,
          'label help gap',
          help.getBoundingClientRect().top -
            label.getBoundingClientRect().bottom,
          2,
        );
      const card = e.closest('[data-ui-card]');
      if (card) {
        const edge = r.left + x,
          old = edges.get(card);
        if (old !== undefined) check(e, 'one card content edge', edge, old);
        else edges.set(card, edge);
      }
    }
    for (const e of [...document.querySelectorAll('.ui-button')].filter(
      visible,
    )) {
      const s = getComputedStyle(e),
        r = e.getBoundingClientRect(),
        parts = e.classList,
        icon = parts.contains('ui-icon-button');
      const expected = coarse
        ? parts.contains('coarse:h-9')
          ? 36
          : parts.contains('coarse:h-10')
            ? 40
            : 44
        : parts.contains('h-7')
          ? 28
          : 32;
      check(e, 'control height', r.height, expected);
      if (!icon) {
        check(
          e,
          'text button left inset',
          parseFloat(s.paddingLeft),
          coarse ? 16 : parts.contains('h-7') ? 8 : 12,
        );
        check(
          e,
          'text button right inset',
          parseFloat(s.paddingRight),
          coarse ? 16 : parts.contains('h-7') ? 8 : 12,
        );
      } else {
        check(e, 'icon button left inset', parseFloat(s.paddingLeft), 0);
        check(e, 'icon button right inset', parseFloat(s.paddingRight), 0);
      }
    }
    for (const e of [...document.querySelectorAll('.ui-field-group')].filter(
      visible,
    )) {
      const label = e.querySelector(':scope > label:not(.sr-only)'),
        field = e.querySelector('input,textarea,select');
      if (!field || !visible(field)) continue;
      if (label && visible(label)) {
        check(
          e,
          'label to field',
          field.getBoundingClientRect().top -
            label.getBoundingClientRect().bottom,
          8,
        );
        check(
          e,
          'label field type size',
          parseFloat(getComputedStyle(label).fontSize),
          parseFloat(getComputedStyle(field).fontSize),
        );
      }
      if (!field.matches('textarea')) {
        const surface =
          field.matches('select') &&
          field.parentElement?.classList.contains('ui-field')
            ? field.parentElement
            : field;
        check(
          e,
          'field height',
          surface.getBoundingClientRect().height,
          coarse ? 44 : 32,
        );
      }
      const help = e.querySelector('[id$="-hint"],[id$="-error"]');
      if (help && visible(help))
        check(
          e,
          'field help gap',
          help.getBoundingClientRect().top -
            field.getBoundingClientRect().bottom,
          4,
        );
    }
    return { issues, counts: { layouts: layouts.length, rows: rows.length } };
  });
  result.issues.push(...(await auditContentParity(page)).issues);
  return result;
}

/** Selected surfaces and visible leading content must match their semantic owner. */
export async function auditContentParity(page: Page) {
  return page.evaluate(() => {
    const issues: {
      kind: string;
      text: string;
      actual: number;
      expected: number;
    }[] = [];
    const measurements: {
      kind: string;
      text: string;
      actual: number;
      expected: number;
    }[] = [];
    const visible = (e: Element) =>
      e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
      e.getBoundingClientRect().width > 0 &&
      e.getBoundingClientRect().height > 0 &&
      !e.closest('[inert],.sr-only');
    const firstX = (e: Element): number | null => {
      const walker = document.createTreeWalker(
        e,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (
          node instanceof SVGElement &&
          node.tagName === 'svg' &&
          visible(node)
        )
          return node.getBoundingClientRect().left;
        if (
          node.nodeType !== Node.TEXT_NODE ||
          !node.textContent?.trim() ||
          !node.parentElement ||
          !visible(node.parentElement) ||
          node.parentElement.closest('svg')
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getClientRects()[0];
        if (rect?.width) return rect.left;
      }
      return null;
    };
    const check = (
      e: Element,
      kind: string,
      actual: number,
      expected: number,
    ) => {
      const item = {
        kind,
        text: (e.getAttribute('aria-label') ?? e.textContent ?? '')
          .trim()
          .slice(0, 80),
        actual,
        expected,
      };
      measurements.push(item);
      if (
        !Number.isFinite(actual) ||
        Math.abs(actual - expected) >
          (kind.includes('surface') || kind.includes('semantics') ? 0 : 1)
      )
        issues.push(item);
    };
    for (const list of [
      ...document.querySelectorAll(
        '.ui-page-column ul,.ui-page-column ol,#command-palette-list',
      ),
    ].filter(visible)) {
      const pageColumn = list.closest('.ui-page-column');
      const owner = pageColumn ?? list;
      const edge =
        owner.getBoundingClientRect().left +
        parseFloat(getComputedStyle(owner).paddingLeft);
      for (const li of list.children) {
        if (!visible(li)) continue;
        const row = li.querySelector(':scope > a,:scope > button') ?? li;
        const x = firstX(row);
        if (x !== null) check(row, 'page row content edge', x, edge);
      }
    }
    for (const row of [...document.querySelectorAll('.ui-content-row')].filter(
      visible,
    )) {
      const box = row.getBoundingClientRect(),
        painted = getComputedStyle(row, '::before');
      const pad = matchMedia('(pointer:coarse)').matches ? 12 : 8;
      check(row, 'row fill left extent', parseFloat(painted.left), -pad);
      check(row, 'row fill right extent', parseFloat(painted.right), -pad);
      const hit = document.elementFromPoint(
        box.left - pad / 2,
        box.top + box.height / 2,
      );
      const center = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      if (center && row.contains(center))
        check(
          row,
          'row gutter hit semantics',
          hit === row || (hit !== null && row.contains(hit)) ? 1 : 0,
          1,
        );
    }
    for (const body of [
      ...document.querySelectorAll('[data-disclosure-content]'),
    ].filter(visible)) {
      const header = document.getElementById(
        body.getAttribute('data-disclosure-content') ?? '',
      );
      const label = header?.querySelector(':scope > span:last-child');
      const edge = label && visible(label) ? firstX(label) : null;
      if (edge !== null)
        check(
          body,
          'disclosure content edge',
          body.getBoundingClientRect().left,
          edge,
        );
      for (const text of [...body.querySelectorAll(':scope > p')].filter(
        visible,
      )) {
        const x = firstX(text);
        if (edge !== null && x !== null)
          check(text, 'disclosure text edge', x, edge);
      }
    }
    const title = document.querySelector('#notes-outline > span:last-child');
    if (title && visible(title)) {
      const edge = firstX(title);
      if (edge !== null)
        for (const row of [
          ...document.querySelectorAll(
            '#notes-outline-panel button,#notes-outline-panel [data-outline-level]',
          ),
        ].filter(visible)) {
          const x = firstX(row),
            level = Number(row.getAttribute('data-outline-level') ?? 1);
          if (x !== null)
            check(row, 'outline content edge', x, edge + (level - 1) * 20);
        }
    }
    const line = document.querySelector('.cm-content .cm-line'),
      footer = document.querySelector('footer');
    if (line && footer && visible(line) && visible(footer)) {
      const edge = firstX(line),
        x = firstX(footer);
      if (x !== null && edge !== null)
        check(footer, 'note footer content edge', x, edge);
    }
    const probe = document.createElement('span');
    probe.className = 'bg-active';
    document.body.append(probe);
    const active = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const allNotes = [
      ...document.querySelectorAll('#notes-sidebar .ui-sidebar-tree-items a'),
    ].find((item) => item.textContent?.trim() === 'All notes');
    if (allNotes && visible(allNotes)) {
      const row = allNotes.closest('.ui-sidebar-row');
      if (row)
        check(
          row,
          'All notes current surface semantics',
          getComputedStyle(row).backgroundColor === active ? 1 : 0,
          allNotes.getAttribute('aria-current') === 'page' ? 1 : 0,
        );
    }
    const selected = [
      ...document.querySelectorAll(
        '[aria-label="Sidebar views"] [aria-current],[aria-label="Sidebar views"] [aria-pressed="true"],nav [aria-current],.ui-settings-nav-row[aria-current],.ui-account-card[aria-current]',
      ),
    ].filter(visible);
    for (const item of new Set(selected)) {
      if (item.closest('[aria-label="Sidebar views"]'))
        check(
          item,
          'rail current semantics',
          item.hasAttribute('aria-current') ? 1 : 0,
          1,
        );
      let surface: Element | null =
        item.querySelector(':scope > .ui-sidebar-row') ?? item;
      let color = getComputedStyle(surface).backgroundColor;
      while (surface && ['transparent', 'rgba(0, 0, 0, 0)'].includes(color)) {
        surface = surface.parentElement;
        if (surface) color = getComputedStyle(surface).backgroundColor;
      }
      check(item, 'selected navigation surface', color === active ? 1 : 0, 1);
    }
    return { issues, measurements };
  });
}

/** A hover fill contains both content edges with symmetric, positive padding. */
export async function auditHoverPadding(page: Page) {
  const controls = page.locator(
    'button,a,[role="menuitem"],[role="menuitemradio"]',
  );
  const issues: {
    kind: string;
    text: string;
    actual: number;
    expected: number;
  }[] = [];
  for (let index = 0; index < (await controls.count()); index++) {
    const control = controls.nth(index);
    if (
      !(await control.evaluate((element) => {
        if (
          !element.checkVisibility({
            visibilityProperty: true,
            opacityProperty: true,
          }) ||
          element.closest('[inert],.sr-only')
        )
          return false;
        const box = element.getBoundingClientRect(),
          hit = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          );
        return (
          box.width > 0 &&
          box.height > 0 &&
          hit !== null &&
          element.contains(hit)
        );
      }))
    )
      continue;
    await control.hover();
    const stateContrast = await control.evaluate(async (element) => {
      if (
        !element.matches(
          '[data-ui-row],[role=menuitem],[role=menuitemradio],[role=option]',
        )
      )
        return null;
      const surface = element.parentElement?.closest(
        '.bg-overlay,.bg-card-raised,.coarse\\:bg-card-raised',
      );
      if (!surface) return null;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const colour = (value: string) => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = value;
        element.append(probe);
        const result = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return result;
      };
      const luminance = (value: string) => {
        const channels =
          value
            .match(/[\d.]+/g)
            ?.slice(0, 3)
            .map(Number) ?? [];
        return channels.reduce((sum, c, i) => {
          const v = c / 255;
          return (
            sum +
            (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) *
              ([0.2126, 0.7152, 0.0722][i] ?? 0)
          );
        }, 0);
      };
      const base = luminance(getComputedStyle(surface).backgroundColor);
      const fills = [
        getComputedStyle(element).backgroundColor,
        colour('var(--notes-surface-active)'),
      ];
      return Math.min(
        ...fills.map((fill) => {
          const v = luminance(fill);
          return (Math.max(v, base) + 0.05) / (Math.min(v, base) + 0.05);
        }),
      );
    });
    if (stateContrast !== null && stateContrast < 1.2)
      issues.push({
        kind: 'surface state contrast',
        text: await control.evaluate((e) => e.textContent ?? ''),
        actual: stateContrast,
        expected: 1.2,
      });
    const measured = await control.evaluate((element) => {
      const visible = (item: Element) =>
        item.checkVisibility({
          visibilityProperty: true,
          opacityProperty: true,
        }) && !item.closest('.invisible,.sr-only');
      const painted = (item: Element) =>
        !['transparent', 'rgba(0, 0, 0, 0)'].includes(
          getComputedStyle(item).backgroundColor,
        );
      const surface = painted(element)
        ? element
        : [...element.children].find(
            (child) => visible(child) && painted(child),
          );
      if (!surface) return null;
      const box = surface.getBoundingClientRect(),
        style = getComputedStyle(surface),
        before = getComputedStyle(surface, '::before');
      const boxes: { left: number; right: number }[] = [];
      for (const child of surface.childNodes) {
        if (child instanceof Element && visible(child)) {
          if (getComputedStyle(child).display === 'contents') {
            for (const nested of child.children)
              if (visible(nested)) boxes.push(nested.getBoundingClientRect());
          } else boxes.push(child.getBoundingClientRect());
        } else if (
          child.nodeType === Node.TEXT_NODE &&
          child.textContent?.trim()
        ) {
          const range = document.createRange();
          range.selectNodeContents(child);
          boxes.push(range.getBoundingClientRect());
        }
      }
      if (!boxes.length) return null;
      const extension =
        surface.classList.contains('ui-content-row') ||
        (surface.classList.contains('ui-setting-fill') &&
          matchMedia('(pointer:fine)').matches)
          ? Math.abs(parseFloat(before.left))
          : 0;
      return {
        text: element.getAttribute('aria-label') ?? element.textContent ?? '',
        left:
          Math.min(...boxes.map((part) => part.left)) - box.left + extension,
        right:
          box.right - Math.max(...boxes.map((part) => part.right)) + extension,
        padding: parseFloat(style.paddingLeft) + extension,
        border: parseFloat(style.borderLeftWidth),
      };
    });
    if (measured) {
      const { text, left, right, padding, border } = measured;
      if (
        left <= 0 ||
        right <= 0 ||
        Math.abs(left - right) > 1 ||
        left < padding + border - 1
      )
        issues.push({
          kind: 'hover fill padding',
          text: text.trim().slice(0, 80),
          actual: Math.min(left, right),
          expected: Math.max(padding + border, 1),
        });
    }
  }
  await page.mouse.move(0, 0);
  return issues;
}
