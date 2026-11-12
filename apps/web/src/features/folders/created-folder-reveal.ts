/** Plain one-shot creation action, loaded with the existing New folder dialog. */
import { scrollerOf } from '../../shell/row-window.ts';
import type { SidebarView } from '../../lib/sidebar-view.ts';

/** Stable ownership, without incidental account objects or layout state. */
export type CreatedFolderRevealOwner = {
  readonly accountId: string | null;
  readonly workspaceId: string;
  readonly routeKey: string;
  readonly view: SidebarView;
};

/** The current tree supplies its real row, window and ownership on each commit. */
type TreeContext = {
  readonly accountId: string | null;
  readonly workspaceId: string;
  readonly routeKey: string;
  readonly list: HTMLElement | null;
  readonly index: number | undefined;
  readonly row: () => HTMLElement | undefined;
  readonly reveal: (index: number) => void;
  readonly isCurrent: (request: CreatedFolderReveal) => boolean;
  readonly claim: () => void;
};

/** A unique transient action. Only its original owner can keep it current. */
export type CreatedFolderReveal = {
  readonly owner: CreatedFolderRevealOwner;
  readonly path: string;
  readonly update: (context: TreeContext) => void;
  readonly pause: () => void;
  readonly cancel: () => void;
  readonly manual: (event: Event) => void;
};

/** Supplied synchronously by the dialog that has already loaded this action. */
export type CreateFolderReveal = typeof createFolderReveal;

/** Reveal one inserted folder without changing focus or the general row window. */
export function createFolderReveal(
  owner: CreatedFolderRevealOwner,
  path: string,
  onFinish: (request: CreatedFolderReveal) => void,
): CreatedFolderReveal {
  let started = false;
  let done = false;
  let frame: number | null = null;
  let current: TreeContext | null = null;
  const pause = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const cancel = (): void => {
    pause();
    done = true;
  };
  const finish = (): void => {
    cancel();
    onFinish(request);
  };
  const valid = (context: TreeContext): boolean =>
    !done &&
    owner.accountId === context.accountId &&
    owner.workspaceId === context.workspaceId &&
    owner.routeKey === context.routeKey &&
    owner.view === 'notes' &&
    context.isCurrent(request);
  const viewport = (context: TreeContext): HTMLElement | null => {
    const list = context.list;
    if (!list?.isConnected) return null;
    const scroller = scrollerOf(list);
    return scroller &&
      scroller.clientHeight > 0 &&
      list.getBoundingClientRect().width > 0 &&
      getComputedStyle(list).visibility === 'visible'
      ? scroller
      : null;
  };
  const deltaFor = (row: HTMLElement, scroller: HTMLElement): number => {
    const box = row.getBoundingClientRect();
    const top = scroller.getBoundingClientRect().top + scroller.clientTop;
    if (box.height > scroller.clientHeight || box.top < top)
      return box.top - top;
    return Math.max(0, box.bottom - top - scroller.clientHeight);
  };
  const update = (context: TreeContext): void => {
    current = context;
    if (!valid(context)) {
      pause();
      return;
    }
    // Creation outranks the default reveal of the same unchanged active note.
    context.claim();
    const scroller = viewport(context);
    if (context.index === undefined || !scroller) return;
    let row = context.row();
    if (!started) {
      started = true;
      if (row && deltaFor(row, scroller) === 0) {
        finish();
        return;
      }
      context.reveal(context.index);
    }
    row = context.row();
    if (!row || frame !== null) return;
    // The existing virtualizer inserts/measures. This action gets one correction.
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!current || !valid(current)) return;
      const actualScroller = viewport(current);
      if (!actualScroller) return;
      const actualRow = current.row();
      if (!actualRow?.isConnected) {
        finish();
        return;
      }
      const delta = deltaFor(actualRow, actualScroller);
      finish();
      if (delta !== 0) actualScroller.scrollTop += delta;
    });
  };
  const request: CreatedFolderReveal = {
    owner,
    path,
    update,
    pause,
    cancel,
    manual(event) {
      if (
        event instanceof KeyboardEvent &&
        ![
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'PageUp',
          'PageDown',
          'Home',
          'End',
        ].includes(event.key)
      )
        return;
      finish();
    },
  };
  return request;
}
