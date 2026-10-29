import { phoneSheetMotion } from './motion.ts';

/** Direct manipulation and lifecycle motion for the shared phone sheet. */
export function followPhoneSheetDrag(
  root: HTMLElement,
  panel: HTMLElement,
  close: () => void,
): () => void {
  const scrim = root.querySelector<HTMLElement>('[data-sheet-scrim]');
  if (!scrim) return () => {};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let animations: Animation[] = [];
  let stopped = false;
  let settling = false;
  let y = 0;
  let drag: {
    id: number;
    x: number;
    y: number;
    lastY: number;
    time: number;
    speed: number;
    active: boolean;
    header: boolean;
  } | null = null;
  const fields = 'input,textarea,select,[contenteditable="true"]';
  const focused = () =>
    document.activeElement instanceof Element &&
    panel.contains(document.activeElement) &&
    document.activeElement.matches(fields);
  const scrollers = () =>
    [...panel.querySelectorAll<HTMLElement>('*')].filter((e) =>
      /auto|scroll/.test(getComputedStyle(e).overflowY),
    );
  const atTop = () => scrollers().every((e) => e.scrollTop <= 0);
  const prior = new Map<HTMLElement, string>();
  const scrolling = () => {
    if (stopped) return;
    const action = !focused() && atTop() ? 'pan-x pan-up' : 'pan-y';
    for (const e of scrollers()) {
      if (!prior.has(e)) prior.set(e, e.style.touchAction);
      e.style.touchAction = action;
    }
  };
  const paint = (next: number) => {
    y = next;
    panel.style.transform = `translateY(${next}px)`;
    scrim.style.opacity = String(
      Math.max(0, 1 - Math.max(0, next) / panel.offsetHeight),
    );
  };
  const cancelAnimations = () => {
    for (const a of animations) a.cancel();
    animations = [];
  };
  const settle = (dismiss: boolean, opening = false) => {
    cancelAnimations();
    if (typeof panel.animate !== 'function') {
      paint(0);
      if (dismiss) close();
      return;
    }
    settling = true;
    const height = panel.offsetHeight;
    const from = opening ? height : y;
    const to = dismiss ? height : 0;
    const fromOpacity = opening ? 0 : Math.max(0, 1 - Math.max(0, y) / height);
    paint(to);
    if (reduced) {
      // Keep direct manipulation, but do not slide after the finger lifts.
      panel.style.transform = dismiss
        ? `translateY(${from}px)`
        : 'translateY(0px)';
      animations.push(
        panel.animate(
          [{ opacity: opening ? 0 : 1 }, { opacity: dismiss ? 0 : 1 }],
          {
            duration: phoneSheetMotion.fadeDuration,
            easing: phoneSheetMotion.easing,
          },
        ),
      );
    } else
      animations.push(
        panel.animate(
          [
            { transform: `translateY(${from}px)` },
            { transform: `translateY(${to}px)` },
          ],
          {
            duration: phoneSheetMotion.duration,
            easing: phoneSheetMotion.easing,
          },
        ),
      );
    animations.push(
      scrim.animate([{ opacity: fromOpacity }, { opacity: dismiss ? 0 : 1 }], {
        duration: reduced
          ? phoneSheetMotion.fadeDuration
          : phoneSheetMotion.duration,
        easing: phoneSheetMotion.easing,
      }),
    );
    void Promise.all(animations.map((a) => a.finished))
      .then(() => {
        if (stopped) return;
        settling = false;
        if (dismiss) close();
      })
      .catch(() => {});
  };
  const down = (event: PointerEvent) => {
    if (
      !event.isPrimary ||
      event.pointerType === 'mouse' ||
      settling ||
      !(event.target instanceof Element)
    )
      return;
    if (event.target.closest('[data-notes-dialog-root]') !== root) return;
    const header = event.target.closest('[data-sheet-drag]') !== null;
    if (!header && (focused() || !atTop() || event.target.closest(fields)))
      return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastY: event.clientY,
      time: event.timeStamp,
      speed: 0,
      active: false,
      header,
    };
  };
  const move = (event: PointerEvent) => {
    const d = drag;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x,
      dy = event.clientY - d.y;
    if (!d.active) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dx) >= Math.abs(dy) || (!d.header && dy <= 0)) {
        drag = null;
        return;
      }
      d.active = true;
      cancelAnimations();
      panel.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const elapsed = event.timeStamp - d.time;
    if (elapsed > 0) d.speed = (event.clientY - d.lastY) / elapsed;
    d.lastY = event.clientY;
    d.time = event.timeStamp;
    paint(dy >= 0 ? dy : Math.max(-24, dy / 3));
  };
  const finish = (event: PointerEvent) => {
    const d = drag;
    if (!d || d.id !== event.pointerId) return;
    drag = null;
    if (!d.active) return;
    if (panel.hasPointerCapture(d.id)) panel.releasePointerCapture(d.id);
    const fresh = event.timeStamp - d.time < 100;
    settle(
      event.type !== 'pointercancel' &&
        (y > panel.offsetHeight * 0.25 || (y > 0 && fresh && d.speed > 0.5)),
    );
  };
  const click = (event: MouseEvent) => {
    if (drag?.active || settling) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const focusChanged = () => queueMicrotask(scrolling);
  panel.dataset.sheetReady = '';
  panel.style.transition = 'none';
  scrolling();
  settle(false, true);
  panel.addEventListener('pointerdown', down);
  panel.addEventListener('pointermove', move, { passive: false });
  panel.addEventListener('pointerup', finish);
  panel.addEventListener('pointercancel', finish);
  panel.addEventListener('click', click, true);
  panel.addEventListener('scroll', scrolling, true);
  panel.addEventListener('focusin', focusChanged);
  panel.addEventListener('focusout', focusChanged);
  const observer = new MutationObserver(scrolling);
  observer.observe(panel, { childList: true, subtree: true });
  return () => {
    stopped = true;
    cancelAnimations();
    observer.disconnect();
    panel.removeEventListener('pointerdown', down);
    panel.removeEventListener('pointermove', move);
    panel.removeEventListener('pointerup', finish);
    panel.removeEventListener('pointercancel', finish);
    panel.removeEventListener('click', click, true);
    panel.removeEventListener('scroll', scrolling, true);
    panel.removeEventListener('focusin', focusChanged);
    panel.removeEventListener('focusout', focusChanged);
    for (const [e, action] of prior) e.style.touchAction = action;
    delete panel.dataset.sheetReady;
    panel.style.transform = '';
    panel.style.transition = '';
    scrim.style.opacity = '';
  };
}
