import type { Page } from './browser.ts';
/** Inspect real visible text, including fields, without counting clipped accessibility text. */
export async function auditText(
  page: Page,
  roles: Record<string, { size: number; line: number; weight: number }>,
) {
  return page.evaluate((roles) => {
    const allowed = new Set(
      Object.values(roles).map((r) => `${r.size}/${r.line}/${r.weight}`),
    );
    const problems: Problem[] = [],
      combinations: Record<string, string[]> = {};
    const roots = [...document.querySelectorAll('[role="dialog"]')].filter(
      (e) => e.checkVisibility(),
    );
    const root = roots.at(-1) ?? document.body;
    const visible = (e: Element, rect: DOMRect) => {
      if (
        !e.checkVisibility({
          visibilityProperty: true,
          opacityProperty: true,
        }) ||
        e.closest('.sr-only,.cm-content,.cm-line,.cm-tooltip-autocomplete')
      )
        return false;
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        rect.right <= 0 ||
        rect.left >= innerWidth
      )
        return false;
      for (let a = e.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a),
          r = a.getBoundingClientRect();
        if (
          ['hidden', 'auto', 'scroll', 'clip'].includes(s.overflowY) &&
          (rect.bottom <= r.top || rect.top >= r.bottom)
        )
          return false;
        if (
          ['hidden', 'auto', 'scroll', 'clip'].includes(s.overflowX) &&
          (rect.right <= r.left || rect.left >= r.right)
        )
          return false;
        if (s.position === 'fixed') break;
      }
      return true;
    };
    const colors: Record<string, string> = {};
    for (const role of ['strong', 'muted', 'danger']) {
      const probe = document.createElement('span');
      probe.style.color = `var(--notes-text-${role === 'danger' ? 'strong' : role})`;
      if (role === 'danger') probe.style.color = 'var(--notes-danger-text)';
      document.body.append(probe);
      colors[role] = getComputedStyle(probe).color;
      probe.remove();
    }
    const inspect = (e: Element, text: string) => {
      const s = getComputedStyle(e),
        size = parseFloat(s.fontSize),
        line = parseFloat(s.lineHeight),
        weight = Number(s.fontWeight);
      const key = `${size}/${line}/${weight}`;
      (combinations[key] ??= []).push(text.slice(0, 70));
      if (!allowed.has(key))
        problems.push({ kind: 'text-combination', text, key });
      if (e.classList.contains('text-value') && s.color !== colors.muted)
        problems.push({ kind: 'value-colour', text, colour: s.color });
      if (
        (e.classList.contains('text-title-header') ||
          e.classList.contains('text-title-page')) &&
        s.color !== colors.strong
      )
        problems.push({ kind: 'title-colour', text, colour: s.color });
      if (
        (e.classList.contains('text-secondary') ||
          e.classList.contains('text-group')) &&
        ![colors.muted, colors.danger].includes(s.color)
      )
        problems.push({ kind: 'secondary-colour', text, colour: s.color });

      if (size === 11 && !e.closest('kbd,.text-small,.text-avatar'))
        problems.push({ kind: 'small-role', text, key });
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode,
        text = (t.textContent ?? '').trim();
      if (!text) continue;
      const e = t.parentElement;
      if (e === null) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      if (visible(e, range.getBoundingClientRect())) inspect(e, text);
    }
    for (const e of root.querySelectorAll(
      'input:not([type="checkbox"]):not([type="radio"]),textarea,select',
    )) {
      if (!visible(e, e.getBoundingClientRect())) continue;
      if (!(
        e instanceof HTMLInputElement ||
        e instanceof HTMLTextAreaElement ||
        e instanceof HTMLSelectElement
      ))
        continue;
      inspect(e, e.value || e.getAttribute('aria-label') || e.id);
      if (getComputedStyle(e).fontWeight !== '400')
        problems.push({
          kind: 'field-weight',
          field: e.id,
          weight: getComputedStyle(e).fontWeight,
        });
      const label = [...document.querySelectorAll('label')].find(
        (l) => l.htmlFor === e.id,
      );
      if (label && visible(label, label.getBoundingClientRect())) {
        if (getComputedStyle(label).fontSize !== getComputedStyle(e).fontSize)
          problems.push({
            kind: 'field-label-size',
            field: e.id,
            label: getComputedStyle(label).fontSize,
            fieldSize: getComputedStyle(e).fontSize,
          });
      }
    }
    for (const title of root.querySelectorAll(
      '.text-title-header,.text-title-page',
    )) {
      if (
        !visible(title, title.getBoundingClientRect()) ||
        title.closest('[role="region"]')
      )
        continue;
      const section = title.closest('section,form,[role="dialog"],main');
      if (!section) continue;
      const size = parseFloat(getComputedStyle(title).fontSize);
      for (const e of section.querySelectorAll(
        'label,input,button,p,.text-body,.text-label',
      )) {
        if (
          e.closest('.cm-content,[role="region"]') ||
          !visible(e, e.getBoundingClientRect())
        )
          continue;
        const childSize = parseFloat(getComputedStyle(e).fontSize);
        if (childSize > size)
          problems.push({
            kind: 'inverted-heading',
            title: (title.textContent ?? '').trim(),
            text: (e.textContent ?? '').trim().slice(0, 50),
            size,
            childSize,
          });
      }
    }
    return { combinations, problems };
  }, roles);
}

export type Problem = { kind: string; [key: string]: unknown };
