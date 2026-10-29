import type { Page } from './browser.ts';

/** Check visible text and controls on both sides of horizontal borders. */
export async function auditBorderSpacing(page: Page) {
  return page.evaluate(() => {
    const issues: {
      kind: string;
      text: string;
      actual: number;
      expected: number;
    }[] = [];
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      return (
        e.checkVisibility({
          visibilityProperty: true,
          opacityProperty: true,
        }) &&
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        !e.closest('.sr-only,[inert],.cm-content,svg')
      );
    };
    const borders = [...document.querySelectorAll('body *')]
      .filter(visible)
      .flatMap((e) => {
        const s = getComputedStyle(e),
          r = e.getBoundingClientRect();
        return [
          ...(parseFloat(s.borderTopWidth) > 0 &&
          s.borderTopStyle !== 'none' &&
          !['transparent', 'rgba(0, 0, 0, 0)'].includes(s.borderTopColor)
            ? [{ e, y: r.top, side: 'top' }]
            : []),
          ...(parseFloat(s.borderBottomWidth) > 0 &&
          s.borderBottomStyle !== 'none' &&
          !['transparent', 'rgba(0, 0, 0, 0)'].includes(s.borderBottomColor)
            ? [{ e, y: r.bottom, side: 'bottom' }]
            : []),
        ];
      });
    const report = (e: Element, rect: DOMRect, control: boolean) => {
      // A line partly clipped by a scrolling body is not a layout gap.
      for (let a = e.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a),
          r = a.getBoundingClientRect();
        if (
          ['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowY) &&
          (rect.top < r.top || rect.bottom > r.bottom)
        )
          return;
      }
      for (const border of borders) {
        if (border.e === e && control) continue;
        if (
          e.closest('[role="dialog"],[role="menu"]') !==
          border.e.closest('[role="dialog"],[role="menu"]')
        )
          continue;
        const b = border.e.getBoundingClientRect();
        if (Math.min(b.right, rect.right) - Math.max(b.left, rect.left) < 4)
          continue;
        const inside = border.e.contains(e);
        if (inside && border.e.scrollTop > 0) continue;
        if (
          inside &&
          border.side === 'bottom' &&
          ['auto', 'scroll'].includes(getComputedStyle(border.e).overflowY) &&
          border.e.scrollHeight > border.e.clientHeight
        )
          continue;
        if (inside) {
          let scrollingBody = false;
          for (
            let a = e.parentElement;
            a && a !== border.e;
            a = a.parentElement
          )
            if (['auto', 'scroll'].includes(getComputedStyle(a).overflowY))
              scrollingBody = true;
          // A scrolling viewport can show any part of its content at its edge.
          // The content's own headings, controls and dividers are still checked.
          if (scrollingBody) continue;
        }
        if (control && !inside) continue;
        // A descendant border is not a divider above its parent's text.
        if (!inside && e.contains(border.e)) continue;
        const gap = inside
          ? border.side === 'bottom'
            ? border.y - rect.bottom
            : rect.top - border.y
          : rect.top - border.y;
        if (gap < -0.6 || gap >= 3.5) continue;
        // Ignore a covered page behind an open modal or menu.
        const x = Math.max(
          0,
          Math.min(innerWidth - 1, rect.left + rect.width / 2),
        );
        const y = Math.max(
          0,
          Math.min(innerHeight - 1, rect.top + rect.height / 2),
        );
        const top = document.elementFromPoint(x, y);
        if (!top || !(e.contains(top) || top.contains(e))) continue;
        issues.push({
          kind: inside ? 'inside-border-gap' : 'after-border-gap',
          text: `${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 65)} | ${border.e.tagName}.${border.e.className}`.slice(
            0,
            200,
          ),
          actual: gap,
          expected: 4,
        });
      }
    };
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const e = n.parentElement;
      if (
        !n.textContent?.trim() ||
        !e ||
        !visible(e) ||
        e.closest('script,style')
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects())
        if (r.width && r.height) report(e, r, false);
    }
    for (const e of document.querySelectorAll(
      'button,input,select,textarea,[role="switch"]',
    ))
      if (visible(e)) {
        const style = getComputedStyle(e);
        // Transparent hit areas are measured through their visible text and icons.
        if (
          parseFloat(style.borderTopWidth) > 0 &&
          !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.borderTopColor)
        )
          report(e, e.getBoundingClientRect(), true);
      }
    if (matchMedia('(pointer: coarse) and (max-width: 1023px)').matches) {
      for (const card of document.querySelectorAll(
        '.ui-settings-list .ui-settings-card,.ui-settings-content .ui-settings-card',
      )) {
        if (
          !visible(card) ||
          ['transparent', 'rgba(0, 0, 0, 0)'].includes(
            getComputedStyle(card).backgroundColor,
          )
        )
          continue;
        const r = card.getBoundingClientRect();
        if (
          Math.abs(r.left - 16) > 0.6 ||
          Math.abs(innerWidth - r.right - 16) > 0.6
        )
          issues.push({
            kind: 'phone-settings-card-inset',
            text: card.textContent?.trim().slice(0, 60) ?? '',
            actual: r.left,
            expected: 16,
          });
      }
      for (const button of document.querySelectorAll(
        '.ui-settings-card .ui-settings-phone-row button,.ui-settings-card .ui-list-row button,.ui-settings-card button.ui-settings-phone-row,.ui-settings-list .ui-settings-card button',
      )) {
        if (!visible(button)) continue;
        const s = getComputedStyle(button),
          r = button.getBoundingClientRect();
        const clear = (colour: string) =>
          ['transparent', 'rgba(0, 0, 0, 0)'].includes(colour);
        if (
          (!clear(s.borderTopColor) && parseFloat(s.borderTopWidth) > 0) ||
          !clear(s.backgroundColor)
        )
          issues.push({
            kind: 'phone-setting-button-surface',
            text: button.getAttribute('aria-label') ?? button.textContent ?? '',
            actual: 1,
            expected: 0,
          });
        if (r.height < 43.5)
          issues.push({
            kind: 'phone-setting-target',
            text: button.textContent ?? '',
            actual: r.height,
            expected: 44,
          });
      }
    }
    return issues;
  });
}
