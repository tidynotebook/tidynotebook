import type { Page } from './browser.ts';

export async function auditSettings(page: Page) {
  return page.evaluate(() => {
    const phone = matchMedia('(pointer: coarse) and (width < 64rem)').matches;
    const errors: string[] = [],
      rows: unknown[] = [];
    const visible = (e: Element) =>
      e.checkVisibility({ visibilityProperty: true }) &&
      e.getBoundingClientRect().width > 0;
    const eq = (name: string, a: number, b: number) => {
      if (Math.abs(a - b) > 1) errors.push(`${name}: ${a} != ${b}`);
    };
    const box = (e: Element) => e.getBoundingClientRect();
    const headerEdges: unknown[] = [];
    for (const header of document.querySelectorAll(
      '.ui-settings-column .ui-settings-heading,.ui-settings-root-heading,.ui-settings-dialog-heading',
    )) {
      if (!visible(header) || header.classList.contains('sr-only')) continue;
      const edge = getComputedStyle(header, '::before');
      const hidden = header.hasAttribute('data-edge-bottom');
      if (Number(edge.opacity) < 0.99)
        errors.push('Settings header line must remain visible');
      if (Math.abs(parseFloat(edge.borderBottomWidth) - 1) > 0.01)
        errors.push('Settings header line must have one CSS pixel width');
      if (edge.borderBottomStyle !== 'solid')
        errors.push('Settings header line must be solid');
      if (edge.position !== 'absolute')
        errors.push('Settings header line must stay outside layout');
      eq('Settings header line bottom', parseFloat(edge.bottom), 0);
      const token = document.createElement('span');
      token.hidden = true;
      token.className = 'border-edge-subtle';
      header.append(token);
      const color = getComputedStyle(token).borderBottomColor;
      token.remove();
      if (edge.borderBottomColor !== color || color === 'rgba(0, 0, 0, 0)')
        errors.push(
          'Settings header line must use the visible theme edge token',
        );
      if (hidden === (edge.boxShadow === 'none'))
        errors.push('Settings header shadow must follow hidden content only');
      headerEdges.push({
        title: header.textContent,
        overflow: header.hasAttribute('data-scroll-overflow'),
        hidden,
        opacity: edge.opacity,
        borderWidth: edge.borderBottomWidth,
        borderColor: edge.borderBottomColor,
        shadow: edge.boxShadow,
        box: {
          left: box(header).left,
          top: box(header).top,
          width: box(header).width,
          height: box(header).height,
        },
      });
    }
    if (phone) {
      for (const footer of document.querySelectorAll(
        '.ui-settings-column .ui-dialog-footer',
      )) {
        if (!visible(footer) || footer.closest('[inert]')) continue;
        const style = getComputedStyle(footer);
        eq(
          'pinned Settings action left inset',
          parseFloat(style.paddingLeft),
          16,
        );
        eq(
          'pinned Settings action right inset',
          parseFloat(style.paddingRight),
          16,
        );
        eq(
          'pinned Settings action top inset',
          parseFloat(style.paddingTop),
          12,
        );
        const action = footer.querySelector('button');
        if (action !== null && visible(action))
          eq(
            'pinned Settings button width',
            box(action).width,
            box(footer).width - 32,
          );
      }
    }
    for (const header of [
      ...document.querySelectorAll('.ui-settings-heading'),
    ].filter(visible)) {
      const style = getComputedStyle(header);
      const root = header.classList.contains('ui-settings-root-heading');
      if (
        header.closest('.ui-settings-column') ||
        header.classList.contains('ui-settings-root-heading')
      ) {
        eq(
          'header top padding',
          parseFloat(style.paddingTop),
          root ? 0 : phone ? 16 : 24,
        );
        eq(
          'header bottom padding',
          parseFloat(style.paddingBottom),
          root ? 0 : phone ? 16 : 24,
        );
        if (root && phone) eq('root header height', box(header).height, 44);
        const close = header.querySelector('[aria-label="Close Settings"]');
        if (close && visible(close)) {
          if (
            close
              .closest('[data-header-slot]')
              ?.getAttribute('data-header-slot') !== 'trailing'
          )
            errors.push('Close must be in the right header slot');
          const slot = close.closest('[data-header-slot]');
          const glyph = close.querySelector('svg');
          if (slot && glyph) {
            eq(
              'close slot on right content edge',
              box(slot).right,
              box(header).right - parseFloat(style.paddingRight),
            );
            eq(
              'close glyph centered in slot',
              box(glyph).left + box(glyph).width / 2,
              box(slot).left + box(slot).width / 2,
            );
          }
        }
      }
    }
    for (const sections of document.querySelectorAll('.ui-settings-sections')) {
      if (!visible(sections)) continue;
      const header = sections
        .closest('.ui-settings-column')
        ?.querySelector('header');
      let scrollOffset = 0;
      for (
        let parent = sections.parentElement;
        parent && !parent.classList.contains('ui-settings-column');
        parent = parent.parentElement
      )
        scrollOffset += parent.scrollTop;
      if (header && visible(header))
        eq(
          'header to sections group gap',
          box(sections).top + scrollOffset - box(header).bottom,
          matchMedia('(pointer: coarse)').matches ? 16 : 24,
        );
      const edge =
        box(sections).left + parseFloat(getComputedStyle(sections).paddingLeft);
      for (const heading of sections.querySelectorAll('h3')) {
        if (visible(heading))
          eq('section heading content edge', box(heading).left, edge);
      }
    }
    for (const heading of document.querySelectorAll(
      '.ui-settings-nav-heading',
    )) {
      if (!visible(heading)) continue;
      const card = heading.nextElementSibling;
      const label = heading.firstElementChild;
      if (card && label && visible(card))
        eq(
          'navigation heading content edge',
          box(label).left,
          box(card).left + (phone ? 0 : 8),
        );
    }
    for (const label of [
      ...document.querySelectorAll('[data-mode-label]'),
    ].filter(visible)) {
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      if (text.width > box(label).width + 1)
        errors.push(`Mode label is cut: ${label.textContent}`);
      const check = label.parentElement?.querySelector('[data-mode-check]');
      if (check && visible(check)) {
        if (box(check).left < box(label).right)
          errors.push('Mode check overlaps the label');
        const line = label.parentElement;
        if (
          line &&
          box(check).right >
            box(line).right -
              parseFloat(getComputedStyle(line).paddingRight) +
              1
        )
          errors.push('Mode check exceeds the content edge');
      }
    }
    for (const el of document.querySelectorAll(
      '.ui-settings-row,.ui-settings-nav-row,.ui-account-card,.ui-settings-form-body,.ui-settings-footer',
    )) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el),
        r = box(el);
      eq(
        'vertical padding',
        parseFloat(s.paddingTop),
        parseFloat(s.paddingBottom),
      );
      eq(
        'horizontal padding',
        parseFloat(s.paddingLeft),
        parseFloat(s.paddingRight),
      );
      if (el.matches('.ui-settings-row')) {
        eq('row vertical padding', parseFloat(s.paddingTop), 12);
        eq('row horizontal padding', parseFloat(s.paddingLeft), phone ? 16 : 0);
        for (const text of el.querySelectorAll(
          '.ui-settings-copy,.ui-settings-copy > span,.ui-settings-copy > p',
        )) {
          if (visible(text) && getComputedStyle(text).textAlign !== 'left')
            errors.push('Row label and help text must align left');
        }
        const copy = el.querySelector('.ui-settings-copy');
        const control = el.querySelector(
          '.ui-settings-control,.ui-settings-switch-slot,.ui-settings-button-slot',
        );
        if (copy && control)
          eq(
            'centered control',
            box(copy).y + box(copy).height / 2,
            box(control).y + box(control).height / 2,
          );
        const children = [...el.children].filter(
          (c) => visible(c) && getComputedStyle(c).position !== 'absolute',
        );
        if (children.length) {
          const top = Math.min(...children.map((c) => box(c).top)),
            bottom = Math.max(...children.map((c) => box(c).bottom));
          eq('content vertical symmetry', top - r.top, r.bottom - bottom);
        }
        rows.push({
          text: el.textContent?.trim().slice(0, 70),
          height: r.height,
          pad: s.padding,
        });
      }
      if (el.matches('.ui-settings-nav-row')) {
        eq('nav y', parseFloat(s.paddingTop), phone ? 12 : 4);
        eq('nav x', parseFloat(s.paddingLeft), phone ? 16 : 8);
      }
      if (el.matches('.ui-settings-form-body'))
        eq('form inset', parseFloat(s.paddingLeft), phone ? 16 : 24);
      if (el.matches('.ui-settings-footer'))
        eq('footer inset', parseFloat(s.paddingLeft), phone ? 12 : 24);
    }
    for (const card of document.querySelectorAll(
      '.ui-settings-card,.ui-settings-nav-card',
    )) {
      if (!visible(card)) continue;
      const expected =
        box(card).left +
        (phone ? 16 : card.classList.contains('ui-settings-nav-card') ? 8 : 0);
      for (const row of card.querySelectorAll(
        '.ui-settings-row,.ui-settings-nav-row',
      )) {
        if (visible(row))
          eq(
            'shared row edge',
            box(row).left + parseFloat(getComputedStyle(row).paddingLeft),
            expected,
          );
      }
    }
    for (const heading of document.querySelectorAll(
      '.ui-settings-group-heading',
    )) {
      if (!visible(heading)) continue;
      const card = heading.nextElementSibling;
      if (card && visible(card))
        eq('heading to card', box(card).top - box(heading).bottom, 8);
      if (phone && card?.classList.contains('ui-settings-card'))
        eq(
          'heading outer edge',
          box(heading).left + parseFloat(getComputedStyle(heading).paddingLeft),
          box(card).left,
        );
    }
    for (const heading of document.querySelectorAll(
      '.ui-settings-nav-heading',
    )) {
      if (!visible(heading)) continue;
      const card = heading.nextElementSibling;
      if (card)
        eq(
          'navigation heading gap',
          box(card).top - box(heading).bottom,
          phone ? 8 : 2,
        );
      if (!phone) eq('navigation heading height', box(heading).height, 28);
    }
    for (const button of document.querySelectorAll(
      '.ui-settings-heading .ui-button,.ui-settings-footer .ui-button,.ui-settings-row-button',
    )) {
      if (!visible(button)) continue;
      const content = [...button.children].filter(visible);
      if (!content.length) continue;
      const r = box(button),
        left = Math.min(...content.map((e) => box(e).left)),
        right = Math.max(...content.map((e) => box(e).right)),
        top = Math.min(...content.map((e) => box(e).top)),
        bottom = Math.max(...content.map((e) => box(e).bottom));
      eq('button visible horizontal symmetry', left - r.left, r.right - right);
      eq('button visible vertical symmetry', top - r.top, r.bottom - bottom);
    }
    for (const copy of document.querySelectorAll('.ui-settings-copy')) {
      if (!visible(copy)) continue;
      const label = copy.querySelector('[data-setting-label]'),
        help = copy.querySelector('[data-setting-help]');
      if (label && help && visible(help))
        eq('label help gap', box(help).top - box(label).bottom, 2);
    }
    for (const field of document.querySelectorAll(
      '.ui-settings-form-body .ui-field-group',
    )) {
      if (!visible(field)) continue;
      const label = field.querySelector('label'),
        control = field.querySelector('input,select,textarea');
      if (label && control && visible(label))
        eq('label to field', box(control).top - box(label).bottom, 8);
      const next = field.nextElementSibling;
      if (
        next?.matches('.ui-field-group') &&
        visible(next) &&
        (getComputedStyle(field.parentElement ?? field).display !== 'grid' ||
          box(next).top > box(field).top + 1)
      )
        eq('field group gap', box(next).top - box(field).bottom, 12);
    }
    for (const grid of document.querySelectorAll('.ui-settings-form-grid')) {
      if (!visible(grid)) continue;
      eq('form grid row gap', parseFloat(getComputedStyle(grid).rowGap), 12);
      eq(
        'form grid column gap',
        parseFloat(getComputedStyle(grid).columnGap),
        12,
      );
    }
    if (phone) {
      for (const h of document.querySelectorAll('.ui-settings-heading')) {
        if (!visible(h)) continue;
        const parts = [...h.children].filter(
          (item) =>
            visible(item) && getComputedStyle(item).position !== 'absolute',
        );
        if (parts.length) {
          const first = Math.min(...parts.map((item) => box(item).top));
          const last = Math.max(...parts.map((item) => box(item).bottom));
          if (h.classList.contains('coarse:h-11')) {
            eq('fixed header height', box(h).height, 44);
            eq(
              'fixed header top padding',
              parseFloat(getComputedStyle(h).paddingTop),
              0,
            );
            eq(
              'fixed header bottom padding',
              parseFloat(getComputedStyle(h).paddingBottom),
              0,
            );
            eq(
              'fixed header content centered',
              first - box(h).top,
              box(h).bottom - last,
            );
          } else {
            eq('header content top inset', first - box(h).top, 16);
            eq('header content bottom inset', box(h).bottom - last, 16);
          }
        }
        const title =
          h.querySelector('h2,p') ??
          (h.classList.contains('ui-settings-root-heading')
            ? h.querySelector('[tabindex="-1"]')
            : null);
        if (title) {
          if (
            h.closest('.ui-settings-column') ||
            h.matches('.ui-settings-root-heading,.ui-sheet-header')
          ) {
            eq(
              'header title horizontal center',
              box(title).left + box(title).width / 2,
              box(h).left + box(h).width / 2,
            );
          } else {
            // A confirmation has no Back slot. Its title starts at the inset.
            eq(
              'sheet title content edge',
              box(title).left,
              box(h).left + parseFloat(getComputedStyle(h).paddingLeft),
            );
          }
          const line =
            title.parentElement?.closest('[data-ui-layout="inline"]') ?? h;
          eq(
            'header title line center',
            box(title).top + box(title).height / 2,
            box(line).top + box(line).height / 2,
          );
        }
      }
    }
    return { errors, rows, headerEdges };
  });
}
