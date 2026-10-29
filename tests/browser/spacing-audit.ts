import { spacingSpec } from '../../packages/ui/src/spacing.ts';
import type { Page } from './browser.ts';

/** Measure shared geometry in the actual served CSS and rendered layout. */
export async function auditSpacing(page: Page) {
  return page.evaluate((spec) => {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const role = coarse ? spec.coarse : spec.fine;
    const issues: {
      kind: string;
      text: string;
      actual: number;
      expected: number;
    }[] = [];
    const measurements: Record<string, number[]> = {};
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      return (
        e.checkVisibility({ visibilityProperty: true }) &&
        r.width > 1 &&
        r.height > 1 &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        !e.closest('.sr-only,[inert]')
      );
    };
    const check = (
      e: Element,
      kind: string,
      actual: number,
      expected: number,
    ) => {
      (measurements[kind] ??= []).push(actual);
      if (Math.abs(actual - expected) > 0.6)
        issues.push({
          kind,
          text: (e.getAttribute('aria-label') ?? e.textContent ?? '')
            .trim()
            .slice(0, 70),
          actual,
          expected,
        });
    };
    for (const e of document.querySelectorAll('.ui-button')) {
      if (!visible(e)) continue;
      const style = getComputedStyle(e);
      const compact =
        e.classList.contains('ui-compact') ||
        e.classList.contains('ui-icon-button');
      check(
        e,
        'button-height',
        e.getBoundingClientRect().height,
        compact ? role.compact : role.button,
      );
      if (!e.classList.contains('ui-icon-button')) {
        const pad = compact && !coarse ? 8 : role.buttonPad;
        check(e, 'button-left-pad', parseFloat(style.paddingLeft), pad);
        check(e, 'button-right-pad', parseFloat(style.paddingRight), pad);
      }
      check(e, 'button-radius', parseFloat(style.borderRadius), spec.radius);
      check(e, 'button-gap', parseFloat(style.columnGap), spec.controlGap);
    }
    for (const e of document.querySelectorAll('.ui-field')) {
      if (!visible(e)) continue;
      const style = getComputedStyle(e);
      check(e, 'field-height', e.getBoundingClientRect().height, role.field);
      check(e, 'field-left-pad', parseFloat(style.paddingLeft), spec.fieldPad);
      check(
        e,
        'field-right-pad',
        parseFloat(style.paddingRight),
        e.classList.contains('ui-select') ? spec.selectRight : spec.fieldPad,
      );
    }
    for (const e of document.querySelectorAll('.ui-setting-row')) {
      if (!visible(e)) continue;
      const style = getComputedStyle(e);
      check(e, 'setting-min-height', parseFloat(style.minHeight), role.setting);
      check(e, 'setting-top-pad', parseFloat(style.paddingTop), 8);
      check(e, 'setting-bottom-pad', parseFloat(style.paddingBottom), 8);
      check(e, 'setting-control-gap', parseFloat(style.columnGap), spec.rowGap);
    }
    for (const e of document.querySelectorAll('.ui-list-row')) {
      if (visible(e))
        check(
          e,
          'list-min-height',
          parseFloat(getComputedStyle(e).minHeight),
          role.list,
        );
    }
    for (const e of document.querySelectorAll(
      '.ui-tree-row:not(.ui-list-row):not(.ui-setting-row)',
    )) {
      if (visible(e))
        check(
          e,
          'tree-min-height',
          parseFloat(getComputedStyle(e).minHeight),
          role.tree,
        );
    }
    for (const e of document.querySelectorAll('.ui-group-heading')) {
      if (visible(e))
        check(
          e,
          'group-heading-gap',
          parseFloat(getComputedStyle(e).marginBottom),
          spec.groupGap,
        );
    }
    for (const e of document.querySelectorAll('.ui-setting-row')) {
      if (visible(e) && e.querySelector('.ui-setting-row'))
        check(e, 'nested-setting-row', 1, 0);
    }
    const groups = [...document.querySelectorAll('.ui-field-group')].filter(
      visible,
    );
    for (const group of groups) {
      const label = group.querySelector(
        ':scope > label:not(.sr-only), :scope > .ui-field-label',
      );
      const field = group.querySelector(
        'input,select,textarea,button[aria-expanded]',
      );
      if (!label || !field || !visible(label) || !visible(field)) continue;
      check(
        field,
        'label-field-gap',
        field.getBoundingClientRect().top -
          label.getBoundingClientRect().bottom,
        spec.labelGap,
      );
      const help = group.querySelector(
        ':scope > [id$="-hint"], :scope > [id$="-error"]:not([aria-hidden="true"])',
      );
      if (help && visible(help))
        check(
          help,
          'field-help-gap',
          help.getBoundingClientRect().top -
            field.getBoundingClientRect().bottom,
          spec.labelGap,
        );
      const current = group.getBoundingClientRect();
      const next = groups.find((other) => {
        if (other === group || other.closest('form') !== group.closest('form'))
          return false;
        const r = other.getBoundingClientRect();
        return (
          r.top >= current.bottom - 0.5 && Math.abs(r.left - current.left) < 2
        );
      });
      if (next) {
        const nextLabel = next.querySelector(
          ':scope > label:not(.sr-only), :scope > .ui-field-label',
        );
        // Intervening prose, a fieldset heading, or another section is not a field pair.
        const gap = nextLabel
          ? nextLabel.getBoundingClientRect().top - current.bottom
          : Infinity;
        if (gap < 48) check(next, 'field-next-label-gap', gap, spec.formGap);
      }
    }
    for (const e of document.querySelectorAll('.ui-page-column')) {
      if (!visible(e)) continue;
      const main = e.parentElement;
      if (!main) continue;
      const m = main.getBoundingClientRect(),
        r = e.getBoundingClientRect();
      const pad = coarse ? spec.sheetPad : spec.settingsPad;
      const expectedWidth = Math.min(spec.pageMax, m.width - 2 * pad);
      check(e, 'page-column-width', r.width, expectedWidth);
      check(e, 'page-centre', r.left - m.left, (m.width - expectedWidth) / 2);
      const title = e.querySelector('.ui-page-header h1');
      if (title && visible(title) && main.scrollTop === 0 && m.top >= 0)
        check(
          title,
          'page-title-top',
          title.getBoundingClientRect().top - m.top,
          spec.pageTop,
        );
      const header = e.querySelector('.ui-page-header');
      if (header)
        check(
          header,
          'page-header-content-gap',
          parseFloat(getComputedStyle(header).marginBottom),
          spec.pageGap,
        );
    }
    for (const e of document.querySelectorAll(
      '.ui-dialog-body,.ui-dialog-footer',
    )) {
      if (!visible(e)) continue;
      const style = getComputedStyle(e),
        settings = e.closest('.ui-settings-action') !== null;
      const pad =
        coarse && innerWidth < 1024
          ? spec.sheetPad
          : settings
            ? spec.settingsPad
            : spec.dialogPad;
      check(e, 'dialog-left-inset', parseFloat(style.paddingLeft), pad);
      check(e, 'dialog-right-inset', parseFloat(style.paddingRight), pad);
      if (e.classList.contains('ui-dialog-footer'))
        check(e, 'footer-top-pad', parseFloat(style.paddingTop), 16);
    }
    for (const e of document.querySelectorAll(
      '.ui-settings-heading,.ui-settings-content',
    )) {
      if (!visible(e)) continue;
      const style = getComputedStyle(e),
        pad = coarse && innerWidth < 1024 ? spec.sheetPad : spec.settingsPad;
      check(e, 'settings-left-inset', parseFloat(style.paddingLeft), pad);
      check(e, 'settings-right-inset', parseFloat(style.paddingRight), pad);
      if (e.classList.contains('ui-settings-content'))
        check(
          e,
          'settings-horizontal-overflow',
          Math.max(0, e.scrollWidth - e.clientWidth),
          0,
        );
      if (e.classList.contains('ui-settings-heading')) {
        if (coarse && innerWidth < 1024)
          check(
            e,
            'settings-header-height',
            e.getBoundingClientRect().height,
            spec.sheetHeader,
          );
        else check(e, 'settings-title-top', parseFloat(style.paddingTop), 24);
      }
    }
    for (const e of document.querySelectorAll('.ui-sheet-header'))
      if (visible(e))
        check(
          e,
          'sheet-header-height',
          e.getBoundingClientRect().height,
          spec.sheetHeader,
        );
    return { issues, measurements };
  }, spacingSpec);
}
