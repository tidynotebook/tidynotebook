/** Direct horizontal close gesture for the phone navigation drawer. */
import { phoneSheetMotion } from '@notesapp/ui';

export function followDrawerDrag(
  panel: HTMLElement,
  scrim: HTMLElement,
  close: () => void,
): () => void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drag: {
    id: number;
    x: number;
    y: number;
    last: number;
    time: number;
    speed: number;
    active: boolean;
  } | null = null;
  let x = 0;
  let settling = false;
  let suppressClick = false;
  let animations: Animation[] = [];
  const paint = (next: number) => {
    x = next;
    panel.style.transform = `translateX(${next}px)`;
    scrim.style.opacity = String(
      Math.max(0, 1 + Math.min(0, next) / panel.offsetWidth),
    );
  };
  const settle = (dismiss: boolean) => {
    settling = true;
    const from = x,
      opacity = Math.max(0, 1 + Math.min(0, x) / panel.offsetWidth);
    paint(dismiss ? -panel.offsetWidth : 0);
    const duration = reduced
      ? phoneSheetMotion.fadeDuration
      : phoneSheetMotion.duration;
    animations = [
      panel.animate(
        reduced
          ? [{ opacity: 1 }, { opacity: dismiss ? 0 : 1 }]
          : [
              { transform: `translateX(${from}px)` },
              { transform: panel.style.transform },
            ],
        { duration, easing: phoneSheetMotion.easing },
      ),
      scrim.animate([{ opacity }, { opacity: dismiss ? 0 : 1 }], {
        duration,
        easing: phoneSheetMotion.easing,
      }),
    ];
    void Promise.all(animations.map((a) => a.finished))
      .then(() => {
        settling = false;
        if (dismiss) close();
      })
      .catch(() => {});
  };
  const down = (e: PointerEvent) => {
    if (e.isPrimary) suppressClick = false;
    if (
      !e.isPrimary ||
      e.pointerType === 'mouse' ||
      settling ||
      !(e.target instanceof Element) ||
      e.target.closest('input,textarea,select,[contenteditable="true"]')
    )
      return;
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      last: e.clientX,
      time: e.timeStamp,
      speed: 0,
      active: false,
    };
  };
  const move = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dy) >= Math.abs(dx) || dx >= 0) {
        drag = null;
        return;
      }
      drag.active = true;
      panel.style.transition = 'none';
      suppressClick = true;
      panel.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    if (e.timeStamp > drag.time)
      drag.speed = (drag.last - e.clientX) / (e.timeStamp - drag.time);
    drag.time = e.timeStamp;
    drag.last = e.clientX;
    paint(Math.min(0, dx));
  };
  const finish = (e: PointerEvent) => {
    const d = drag;
    if (!d || d.id !== e.pointerId) return;
    drag = null;
    if (!d.active) return;
    if (panel.hasPointerCapture(d.id)) panel.releasePointerCapture(d.id);
    settle(
      e.type !== 'pointercancel' &&
        (-x > panel.offsetWidth * 0.25 ||
          (x < 0 && e.timeStamp - d.time < 100 && d.speed > 0.5)),
    );
  };
  const click = (e: MouseEvent) => {
    if (suppressClick && e.detail) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    }
  };
  const transition = panel.style.transition;
  panel.dataset.drawerReady = '';
  panel.addEventListener('pointerdown', down);
  panel.addEventListener('pointermove', move, { passive: false });
  panel.addEventListener('pointerup', finish);
  panel.addEventListener('pointercancel', finish);
  panel.addEventListener('click', click, true);
  return () => {
    for (const a of animations) a.cancel();
    panel.removeEventListener('pointerdown', down);
    panel.removeEventListener('pointermove', move);
    panel.removeEventListener('pointerup', finish);
    panel.removeEventListener('pointercancel', finish);
    panel.removeEventListener('click', click, true);
    delete panel.dataset.drawerReady;
    panel.style.transform = '';
    panel.style.transition = transition;
    scrim.style.opacity = '';
  };
}
