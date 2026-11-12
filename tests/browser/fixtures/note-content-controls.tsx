/** Real note controls and editor with synthetic text and no account or storage. */
import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createEditor,
  formatActionOf,
  plainTextContext,
  type EditorView,
} from '@notesapp/editor';
import { applyThemeToDocument, defaultThemeFor } from '@notesapp/ui';
import {
  ActiveNoteScope,
  useActiveNoteControl,
} from '../../../apps/web/src/features/editor/active-note.tsx';
import { FormatToolbar } from '../../../apps/web/src/features/editor/format-toolbar.tsx';
import { OutlinePanel } from '../../../apps/web/src/features/editor/outline.tsx';
import { NoteFooter } from '../../../apps/web/src/features/editor/note-footer.tsx';

const theme =
  new URLSearchParams(location.search).get('theme') === 'dark'
    ? 'dark'
    : 'light';
applyThemeToDocument(defaultThemeFor(theme));
const source = Array.from(
  { length: 18 },
  (_, index) =>
    `## Section ${String(index + 1)}\n\n${'Synthetic note content for a long paragraph. '.repeat(18)}\n\n`,
).join('');
let currentView: EditorView | null = null;
let creations = 0;
declare global {
  interface Window {
    noteControlsFixture: {
      readonly view: EditorView | null;
      readonly original: string;
      readonly creations: number;
    };
  }
}
window.noteControlsFixture = {
  get view() {
    return currentView;
  },
  original: source,
  get creations() {
    return creations;
  },
};

function Controls() {
  const parent = useRef<HTMLDivElement | null>(null);
  const { register, announce } = useActiveNoteControl();
  const [context, setContext] = useState(plainTextContext);
  useLayoutEffect(() => {
    if (!parent.current) return;
    const view = createEditor(parent.current, source, () => announce(), {
      theme,
      onFormatContext: setContext,
    });
    creations += 1;
    currentView = view;
    register(view);
    return () => {
      register(null);
      currentView = null;
      view.destroy();
    };
  }, [register, announce]);
  return (
    <main className="flex h-screen min-w-0 flex-col bg-app text-strong">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <FormatToolbar
            context={context}
            history={{ undo: false, redo: false }}
            onHistory={() => {}}
            onFormat={(id) => {
              if (currentView) formatActionOf(id).run(currentView);
            }}
          />
          <div ref={parent} className="min-h-0 flex-1 overflow-hidden" />
          <NoteFooter initialText={source} />
        </div>
        <aside className="hidden w-64 shrink-0 overflow-y-auto xl:block">
          <OutlinePanel text={source} open onToggle={() => {}} />
        </aside>
      </div>
    </main>
  );
}
const target = document.getElementById('fixture');
if (!target) throw Error('Missing fixture root');
createRoot(target).render(
  <ActiveNoteScope>
    <Controls />
  </ActiveNoteScope>,
);
