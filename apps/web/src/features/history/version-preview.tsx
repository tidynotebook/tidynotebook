/**
 * One version of a note, as the note surface draws it.
 *
 * History shows a version the way the note shows it, so a person reads the
 * headings, the task boxes, the tables and the pictures of that version before
 * they restore it (record 0166). The surface is a read-only editor of
 * `@notesapp/editor`: it is not a working copy, it binds to no document, and
 * it writes nothing, so the one editor of the open note (record 0025) stays
 * the one place where a note changes.
 *
 * The module is loaded lazily from the history screen, so the editor code
 * stays out of the first route and loads only when a person opens Preview.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { classifyUrl } from '@notesapp/markdown';
import {
  createEditor,
  setEditorRich,
  setEditorTheme,
  type DiagramHandle,
  type EditorView,
  type RichWidgetResolvers,
} from '@notesapp/editor';
import type { LocalStore } from '@notesapp/sync';
import { Notice } from '@notesapp/ui';
import { blockedLinkNotice, resolveLinkAction } from '../../lib/note-link.ts';
import {
  openExternalLink,
  protocolSaveFailureNotice,
} from '../../lib/open-external-link.ts';
import { useFlushNoteDraft } from '../editor/save-status.tsx';
import { useTheme } from '../../app.tsx';
import { createDiagramFrame, diagramFramePath } from '../../diagram/frame.ts';
import { useAttachmentUrls } from '../editor/note-editor-attachments.ts';

/** No attachment that this screen uploaded itself. */
const noRecentAttachments: ReadonlyMap<string, string> = new Map();

/** The read-only surface of one version. */
export default function VersionPreview({
  store,
  accountId,
  workspaceId,
  path,
  text,
  label,
}: {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  /** The path of the note, which resolves its relative picture links. */
  readonly path: string;
  /** The text of the version. */
  readonly text: string;
  /** The accessible name of the surface. */
  readonly label: string;
}): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [linkNotice, setLinkNotice] = useState('');
  const flushDraft = useFlushNoteDraft();
  const { resolved } = useTheme();
  const themeRef = useRef(resolved);
  themeRef.current = resolved;
  const [renderMath, setRenderMath] = useState<
    ((source: string, display: boolean) => string) | null
  >(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const { attachmentUrls, attachmentUrlsRef, scan } = useAttachmentUrls(
    store,
    accountId,
    workspaceId,
    pathRef,
    text,
    noRecentAttachments,
  );
  // A preview shows one version, and a new version is a new text to scan.
  useEffect(() => {
    scan(text);
  }, [scan, text, path]);

  // KaTeX loads after the first paint, as it does on the note screen.
  useEffect(() => {
    let cancelled = false;
    void import('../../lib/markdown.ts').then((module) => {
      if (!cancelled) setRenderMath(() => module.renderMath);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rich = useMemo<RichWidgetResolvers>(
    () => ({
      renderMath: renderMath ?? undefined,
      resolveAttachment: (destination: string): string | null => {
        const target = classifyUrl(destination, path);
        const key =
          target.kind === 'attachment'
            ? target.id
            : target.kind === 'relative'
              ? target.path
              : null;
        return key === null
          ? null
          : (attachmentUrlsRef.current.get(key) ?? null);
      },
      createDiagram: (source: string): DiagramHandle =>
        createDiagramFrame({
          source,
          theme: themeRef.current,
          framePath: diagramFramePath,
        }),
    }),
    [attachmentUrls, renderMath, path, resolved],
  );
  const richRef = useRef(rich);
  richRef.current = rich;

  // One view for one text. The screen keys this module by version, so a new
  // version is a new view and nothing replaces the document of a view.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const view = createEditor(container, text, () => {}, {
      readOnly: true,
      theme: themeRef.current,
      rich: richRef.current,
      navigation: {
        onOpenLink: (target) => {
          const action = resolveLinkAction(target.target, pathRef.current);
          if (action.kind === 'external') {
            setLinkNotice('');
            void openExternalLink(action.url, flushDraft).then((opened) => {
              if (!opened) setLinkNotice(protocolSaveFailureNotice);
            });
          } else if (
            classifyUrl(target.target, pathRef.current).kind === 'blocked'
          ) {
            setLinkNotice(blockedLinkNotice);
          }
        },
      },
    });
    // The live preview shows the marks of the line that holds the caret. The
    // caret of a preview stands at the end, so the first line, which is
    // most often the heading, reads as the note reads.
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [text, flushDraft]);

  useEffect(() => {
    const view = viewRef.current;
    if (view !== null) setEditorTheme(view, resolved);
  }, [resolved]);

  useEffect(() => {
    const view = viewRef.current;
    if (view !== null) setEditorRich(view, rich);
  }, [rich]);

  return (
    <div>
      {linkNotice === '' ? null : (
        <Notice message={linkNotice} onDismiss={() => setLinkNotice('')} />
      )}
      <div
        ref={containerRef}
        role="region"
        aria-label={label}
        className="max-h-96 overflow-y-auto rounded-lg border border-edge-subtle bg-app px-4 py-2"
      />
    </div>
  );
}
