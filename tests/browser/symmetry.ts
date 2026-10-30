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
        return {
          key: `${base}:${index}`,
          text,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
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
};
function isGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== 'object') return false;
  return (
    'key' in value &&
    typeof value.key === 'string' &&
    'text' in value &&
    typeof value.text === 'string' &&
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
  return page.evaluate(() => {
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
    ) => {
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1)
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
    const rows = [...document.querySelectorAll('[data-ui-row]')].filter(
        visible,
      ),
      edges = new Map<Element, number>();
    for (const e of rows) {
      const s = getComputedStyle(e),
        r = e.getBoundingClientRect(),
        setting = e.getAttribute('data-ui-row') === 'setting',
        y = setting ? 12 : coarse ? 8 : 4,
        x = setting ? (coarse ? 16 : 0) : coarse ? 12 : 8;
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
          coarse ? 16 : 12,
        );
        check(
          e,
          'text button right inset',
          parseFloat(s.paddingRight),
          coarse ? 16 : 12,
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
}
