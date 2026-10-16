/**
 * The grip that moves a list item (record 0106).
 *
 * With a mouse or a pen, a grip stands to the left of the item under the
 * pointer. A drag of the grip moves the item among its siblings, a line shows
 * where it lands, and the release moves it through `list-move.ts`, so one
 * undo puts it back. Escape cancels the drag.
 *
 * The grip stands in one layer over the text, inside the scroller of the
 * editor, as the handles of a table do (`table-controls.ts`), so it replaces
 * no text, the task box stays the control of record 0033, and the set of
 * widget kinds of record 0002 stays closed. It shows only where
 * `gripPointerQuery` holds, which is where the column keeps room for it
 * (`editor-theme.ts`), so the grip is never cut at the edge of the column.
 *
 * The grip takes no focus from the editor. The keyboard, the formatting row
 * and the palette move an item with the commands of `keymaps.ts`.
 */
import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { editingTransaction } from './commands.ts';
import { gripPointerQuery } from './editor-theme.ts';
import { glyph, gripParts } from '@notesapp/ui';
import {
  listItemAt,
  moveListItemSpec,
  type ListItemSpan,
} from './list-move.ts';
import {
  dragStep,
  dropPlace,
  followPointer,
  type DragInput,
} from './pointer-drag.ts';

/** The name of the grip, which a person hears and reads. */
export const listControlLabels = { grip: 'Drag to move the item' } as const;

/** The width of the line that shows where an item lands. */
const dropLineWidth = 2;

/** A place in the coordinates of the scroller. */
type Place = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

/** Where the grip and the drop line stand. */
type ControlPlaces = {
  readonly grip: Place;
  readonly dropLine: Place | null;
};

/** A press on the grip, which becomes a drag once the pointer travels. */
type Drag = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** The start of the marker of the item, which names what moves. */
  pos: number;
  /** The place of the item among its siblings. */
  readonly from: number;
  /** True once the pointer travelled far enough to be a drag. */
  moving: boolean;
  /** The place where the item lands. */
  to: number;
};

/** The top and the bottom of one item on the screen. */
function itemBounds(
  view: EditorView,
  item: ListItemSpan,
): { readonly top: number; readonly bottom: number } {
  return {
    top: view.documentTop + view.lineBlockAt(item.from).top,
    bottom: view.documentTop + view.lineBlockAt(item.to).bottom,
  };
}

/** Builds the layer of the grip and keeps it on the item under the pointer. */
class ListControls {
  private readonly layer: HTMLElement;
  private readonly grip: HTMLButtonElement;
  private readonly dropLine: HTMLElement;
  private readonly media: MediaQueryList | null;
  /** A position on the line under the pointer, or null. */
  private hovered: number | null = null;
  /** The start of the marker of the item the grip stands on, or null. */
  private active: number | null = null;
  private drag: Drag | null = null;
  /** Stops the listening of the window that one drag started. */
  private stopListening: (() => void) | null = null;
  private readonly onPointer: (event: PointerEvent) => void;
  private readonly onLeave: () => void;

  constructor(private readonly view: EditorView) {
    this.layer = document.createElement('div');
    this.layer.className = 'cm-np-list-controls';
    this.grip = document.createElement('button');
    this.grip.type = 'button';
    this.grip.className = 'cm-np-list-grip';
    this.grip.tabIndex = -1;
    this.grip.setAttribute('aria-label', listControlLabels.grip);
    this.grip.title = listControlLabels.grip;
    this.grip.append(glyph('cm-np-list-grip-mark', gripParts(true)));
    this.dropLine = document.createElement('div');
    this.dropLine.className = 'cm-np-list-drop';
    this.layer.append(this.grip, this.dropLine);
    view.scrollDOM.append(this.layer);
    this.media =
      view.dom.ownerDocument.defaultView?.matchMedia(gripPointerQuery) ?? null;

    // A press keeps the focus and the selection in the editor.
    this.grip.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    this.grip.addEventListener('pointerdown', (event) => {
      this.startDrag(event);
    });

    this.onPointer = (event: PointerEvent): void => {
      if (this.drag !== null) return;
      const target = event.target;
      if (!(target instanceof Element) || this.layer.contains(target)) return;
      const pos =
        event.pointerType === 'touch'
          ? null
          : this.view.posAtCoords({ x: event.clientX, y: event.clientY });
      const line = pos === null ? null : this.view.state.doc.lineAt(pos).from;
      if (line === this.hovered) return;
      this.hovered = line;
      this.schedule();
    };
    this.onLeave = (): void => {
      if (this.drag !== null) return;
      this.hovered = null;
      this.schedule();
    };
    view.dom.addEventListener('pointermove', this.onPointer);
    view.dom.addEventListener('pointerleave', this.onLeave);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      if (this.hovered !== null)
        this.hovered = update.changes.mapPos(this.hovered);
      if (this.drag !== null)
        this.drag.pos = update.changes.mapPos(this.drag.pos);
    }
    if (update.docChanged || update.geometryChanged || update.viewportChanged)
      this.schedule();
  }

  destroy(): void {
    this.view.dom.removeEventListener('pointermove', this.onPointer);
    this.view.dom.removeEventListener('pointerleave', this.onLeave);
    this.stopListening?.();
    this.layer.remove();
  }

  /** A press on the grip, which becomes a drag once the pointer travels. */
  private startDrag(event: PointerEvent): void {
    const active = this.active;
    if (active === null || this.view.state.readOnly) return;
    const place = listItemAt(this.view.state, active);
    if (place === null) return;
    event.preventDefault();
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pos: active,
      from: place.index,
      moving: false,
      to: place.index,
    };
    this.stopListening?.();
    const stop = followPointer(
      this.grip.ownerDocument.defaultView ?? window,
      (input) => {
        this.step(input);
      },
    );
    this.stopListening = (): void => {
      stop();
      this.stopListening = null;
    };
  }

  /** Applies one event of the window to the drag in progress. */
  private step(input: DragInput): void {
    const drag = this.drag;
    if (drag === null) return;
    const step = dragStep(drag, input);
    if (step === 'ignore') return;
    if (step === 'follow' && input.type !== 'cancel') {
      const place = listItemAt(this.view.state, drag.pos);
      if (place === null) return;
      drag.moving = true;
      drag.to = dropPlace(
        place.items.map((item) => {
          const bounds = itemBounds(this.view, item);
          return (bounds.top + bounds.bottom) / 2;
        }),
        drag.from,
        input.y,
      );
      this.schedule();
      return;
    }
    this.drag = null;
    this.stopListening?.();
    if (step === 'end' && drag.moving && drag.to !== drag.from) {
      const spec = moveListItemSpec(this.view.state, drag.pos, drag.to);
      if (spec !== null) {
        // The grip keeps the selection, which can be far from the drop.
        // Keep the reading place instead of scrolling to that selection.
        this.view.dispatch(
          this.view.state.update(
            editingTransaction({ ...spec, scrollIntoView: false }),
          ),
        );
        this.view.focus();
      }
    }
    this.schedule();
  }

  /** Measures the item under the pointer and places the grip beside it. */
  private schedule(): void {
    this.view.requestMeasure({
      key: this,
      read: (view): ControlPlaces | null => {
        this.active = null;
        if (view.state.readOnly || this.media?.matches !== true) return null;
        const drag = this.drag;
        const pos = drag?.pos ?? this.hovered;
        if (pos === null) return null;
        const place = listItemAt(view.state, pos);
        const item = place?.items[place.index];
        if (place === null || item === undefined || place.items.length < 2)
          return null;
        const marker = view.coordsAtPos(item.from, 1);
        if (marker === null) return null;
        this.active = item.from;

        const scroller = view.scrollDOM.getBoundingClientRect();
        const x = (left: number): number =>
          left - scroller.left + view.scrollDOM.scrollLeft;
        const y = (top: number): number =>
          top - scroller.top + view.scrollDOM.scrollTop;
        // The grip stands in the room at the start of the item, the height
        // of one line, beside the first line of its text.
        const width = this.grip.offsetWidth;
        const height = view.defaultLineHeight;
        const middle = (marker.top + marker.bottom) / 2;
        const grip: Place = {
          top: y(middle - height / 2),
          left: x(marker.left) - width,
          width,
          height,
        };
        if (drag === null || !drag.moving || drag.to === drag.from)
          return { grip, dropLine: null };

        const target = place.items[drag.to];
        if (target === undefined) return { grip, dropLine: null };
        const bounds = itemBounds(view, target);
        const edge = drag.to > drag.from ? bounds.bottom : bounds.top;
        // The line runs to the end of the measure of the item line.
        const { node } = view.domAtPos(item.from);
        const element = node instanceof Element ? node : node.parentElement;
        const line = element?.closest('.cm-line')?.getBoundingClientRect();
        const end = line?.right ?? marker.right;
        return {
          grip,
          dropLine: {
            top: y(edge) - dropLineWidth / 2,
            left: x(marker.left),
            width: end - marker.left,
            height: dropLineWidth,
          },
        };
      },
      write: (places): void => {
        this.layer.classList.toggle(
          'cm-np-list-controls-shown',
          places !== null,
        );
        if (places === null) return;
        // A place on the screen is a measured number, which no class can
        // state, so the layer writes it, as a tooltip of CodeMirror does.
        const put = (element: HTMLElement, place: Place | null): void => {
          element.classList.toggle('cm-np-list-control-off', place === null);
          if (place === null) return;
          element.style.top = `${String(place.top)}px`;
          element.style.left = `${String(place.left)}px`;
          element.style.width = `${String(place.width)}px`;
          element.style.height = `${String(place.height)}px`;
        };
        put(this.grip, places.grip);
        put(this.dropLine, places.dropLine);
      },
    });
  }
}

/** The grip of every list item (record 0106). */
export function listControls(): Extension {
  return ViewPlugin.fromClass(ListControls);
}
