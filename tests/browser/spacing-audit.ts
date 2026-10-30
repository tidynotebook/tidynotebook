import { spacingSpec } from '../../packages/ui/src/spacing.ts';
import type { Page } from './browser.ts';
import { auditBorderSpacing } from './border-spacing.ts';
import { auditComposition } from './symmetry.ts';

/** Component geometry plus page, group and scroll-region relationships. */
export async function auditSpacing(page: Page) {
  const composition = await auditComposition(page);
  const measured = await page.evaluate((spec) => {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const role = coarse ? spec.coarse : spec.fine;
    const issues: {
      kind: string;
      text: string;
      actual: number;
      expected: number;
    }[] = [];
    const measurements: Record<string, number[]> = {};
    const visible = (e: Element) =>
      e.checkVisibility({ visibilityProperty: true }) &&
      e.getBoundingClientRect().width > 0 &&
      e.getBoundingClientRect().height > 0 &&
      !e.closest('.sr-only,[inert]');
    const box = (e: Element) => e.getBoundingClientRect();
    const check = (
      e: Element,
      kind: string,
      actual: number,
      expected: number,
    ) => {
      (measurements[kind] ??= []).push(actual);
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1)
        issues.push({
          kind,
          text: (e.getAttribute('aria-label') ?? e.textContent ?? '')
            .trim()
            .slice(0, 70),
          actual,
          expected,
        });
    };
    for (const e of [...document.querySelectorAll('.ui-field')].filter(
      visible,
    )) {
      const s = getComputedStyle(e);
      check(
        e,
        'field left inset',
        parseFloat(s.paddingLeft),
        e.classList.contains('ui-bare-field') ? 0 : spec.fieldPad,
      );
      check(
        e,
        'field right inset',
        parseFloat(s.paddingRight),
        e.classList.contains('ui-bare-field')
          ? 0
          : e.classList.contains('ui-select')
            ? spec.selectRight
            : spec.fieldPad,
      );
    }
    for (const e of [...document.querySelectorAll('[data-ui-row]')].filter(
      visible,
    )) {
      const s = getComputedStyle(e),
        setting = e.getAttribute('data-ui-row') === 'setting';
      check(e, 'content-owned row height', parseFloat(s.minHeight) || 0, 0);
      if (!setting) {
        // Rows own padding, while a search control, an inline field or a
        // second help line can make their content taller than one text line.
        const vertical = coarse ? 8 : 4;
        check(e, 'row top padding', parseFloat(s.paddingTop), vertical);
        check(e, 'row bottom padding', parseFloat(s.paddingBottom), vertical);
        const content = Math.max(
          20,
          ...[...e.children].filter(visible).map((child) => box(child).height),
        );
        check(
          e,
          'content-owned row height',
          box(e).height,
          content + 2 * vertical,
        );
      } else {
        const label = e.querySelector('[data-setting-label]'),
          help = e.querySelector('[data-setting-help],.ui-settings-meta');
        if (
          label &&
          visible(label) &&
          (!help || !visible(help)) &&
          box(label).height <= 20.5
        )
          check(
            e,
            'single-line setting height',
            box(e).height,
            coarse ? 44 : 52,
          );
      }
    }
    for (const parent of [
      ...document.querySelectorAll('form,[data-ui-layout="grid"]'),
    ].filter(visible)) {
      const fields = [...parent.children].filter(
        (e) => e.matches('.ui-field-group') && visible(e),
      );
      for (let i = 1; i < fields.length; i++) {
        const before = fields[i - 1],
          after = fields[i];
        if (before && after && box(after).top >= box(before).bottom - 1)
          check(
            after,
            'field to next label',
            box(after).top - box(before).bottom,
            role.formGap,
          );
      }
    }
    for (const e of [...document.querySelectorAll('.ui-page-column')].filter(
      visible,
    )) {
      const main = e.parentElement;
      if (!main) continue;
      const m = box(main),
        r = box(e),
        pad = coarse ? spec.sheetPad : spec.settingsPad;
      check(
        e,
        'page column width',
        r.width,
        Math.min(spec.pageMax, m.width - 2 * pad),
      );
      check(e, 'page centered', r.left - m.left, (m.width - r.width) / 2);
      const header = e.querySelector(':scope > .ui-page-header'),
        next = header?.nextElementSibling;
      if (header && main.scrollTop === 0)
        check(header, 'page title top', box(header).top - m.top, role.pageTop);
      if (header && next && main.scrollTop === 0)
        check(
          next,
          'page title block to content',
          box(next).top - box(header).bottom,
          role.pageGap,
        );
    }
    for (const e of [
      ...document.querySelectorAll('.ui-settings-content'),
    ].filter(visible))
      check(
        e,
        'settings horizontal overflow',
        Math.max(0, e.scrollWidth - e.clientWidth),
        0,
      );
    for (const e of [...document.querySelectorAll('.ui-sheet-header')].filter(
      visible,
    )) {
      if (coarse) check(e, 'sheet header height', box(e).height, 44);
      const title = e.querySelector('h2');
      if (title && coarse) {
        check(
          title,
          'sheet title vertical center',
          box(title).top - box(e).top,
          box(e).bottom - box(title).bottom,
        );
        check(
          title,
          'sheet title horizontal center',
          box(title).left + box(title).width / 2,
          box(e).left + box(e).width / 2,
        );
      }
    }
    for (const e of [...document.querySelectorAll('.ui-sidebar-status')].filter(
      visible,
    ))
      check(e, 'status footer height', box(e).height, 32);
    for (const e of [
      ...document.querySelectorAll('[role="switch"] > [aria-hidden="true"]'),
    ].filter(visible)) {
      check(e, 'switch track height', box(e).height, 24);
      check(e, 'switch track width', box(e).width, 40);
    }
    for (const e of [...document.querySelectorAll('.ui-calendar-day')].filter(
      visible,
    ))
      check(e, 'calendar cell height', box(e).height, coarse ? 44 : 28);
    return { issues, measurements };
  }, spacingSpec);
  return {
    issues: [
      ...composition.issues,
      ...measured.issues,
      ...(await auditBorderSpacing(page)),
    ],
    measurements: measured.measurements,
  };
}
