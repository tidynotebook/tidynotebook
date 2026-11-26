import { EditorView, ViewPlugin } from '@codemirror/view';
import type { EditorBinding } from '@notesapp/note-document/editor-bridge';
import type { Extension } from '@codemirror/state';

const showForMs = 3000;
const labelSelector = '.cm-ySelectionCaret > .cm-ySelectionInfo';

const theme = EditorView.theme({
  [labelSelector]: {
    top: '100%',
    bottom: 'auto',
    borderRadius: 'var(--radius-sm)',
    padding: '1px 4px',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-small)',
    fontWeight: '500',
    lineHeight: 'var(--text-small--line-height)',
    color: 'var(--color-live-ink)',
  },
  [`${labelSelector}[data-active="true"]`]: { opacity: '1' },
  '@media (prefers-reduced-motion: reduce)': {
    [labelSelector]: { transition: 'none' },
  },
});

export function remoteCaretLabels(
  awareness: EditorBinding['awareness'],
): Extension {
  return [
    theme,
    ViewPlugin.define((view) => {
      const window = view.dom.ownerDocument.defaultView;
      if (window === null) return {};
      const active = new Map<
        number,
        { name: string; slot: number; timer: number }
      >();
      let frame: number | null = null;

      const paint = (): void => {
        if (frame !== null) return;
        frame = window.requestAnimationFrame(() => {
          frame = null;
          for (const label of view.contentDOM.querySelectorAll(labelSelector)) {
            const caret = label.parentElement;
            const visible = [...active.values()].some(
              ({ name, slot }) =>
                name === label.textContent &&
                caret?.style.backgroundColor === `var(--color-live-${slot})`,
            );
            label.setAttribute('data-active', String(visible));
          }
        });
      };

      const clear = (id: number): void => {
        const current = active.get(id);
        if (current !== undefined) window.clearTimeout(current.timer);
        active.delete(id);
      };
      const change = ({
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      }): void => {
        for (const id of removed) clear(id);
        for (const id of [...added, ...updated]) {
          if (id === awareness.clientID) continue;
          const state: unknown = awareness.getStates().get(id);
          clear(id);
          if (
            state === null ||
            typeof state !== 'object' ||
            !('displayName' in state) ||
            typeof state.displayName !== 'string' ||
            !('slot' in state) ||
            typeof state.slot !== 'number' ||
            !('cursor' in state) ||
            state.cursor == null ||
            ('idle' in state && state.idle === true)
          )
            continue;
          const timer = window.setTimeout(() => {
            active.delete(id);
            paint();
          }, showForMs);
          active.set(id, { name: state.displayName, slot: state.slot, timer });
        }
        paint();
      };
      awareness.on('change', change);

      return {
        update: paint,
        destroy() {
          awareness.off('change', change);
          if (frame !== null) window.cancelAnimationFrame(frame);
          for (const id of active.keys()) clear(id);
        },
      };
    }),
  ];
}
