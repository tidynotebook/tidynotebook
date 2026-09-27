/**
 * The one-pane note editor screen.
 *
 * One mounted `NoteEditor` owns exactly one CodeMirror view and one working
 * copy. Editor changes flow into `LocalStore.saveDraft` within about 120 ms.
 * Only an explicit Save creates an immutable revision and sends it to the
 * server. The React tree may rerender and the theme may change as often as it
 * wants. Neither action replaces the editor document, so undo history, IME
 * composition, selection, and clipboard content survive them.
 *
 * File identity follows the local-first rule. Edits and renames are drafts.
 * Save and Delete create versions that the foreground sync engine submits.
 * This screen never calls `fetch` and never builds a request URL by hand.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { finalizeAttachment, uploadAttachment } from '@notesapp/api-client';
import { generateUUID } from '@notesapp/core';
import { classifyUrl, portableRelativePath } from '@notesapp/markdown';
import {
  createNote,
  isLocalStorageError,
  saveCheckpointMessage,
  type Draft,
  type FileSaveSnapshot,
  type LocalStore,
  type LocalStorageErrorKind,
  type QueueEntry,
} from '@notesapp/sync';
import {
  createEditor,
  openBoundNote,
  plainTextContext,
  runFormatAction,
  setEditorRich,
  setEditorSpellCheck,
  setEditorTheme,
  setNoteLinkSource,
  type EditorView,
  type LinkTarget,
  type DiagramHandle,
  type FormatActionId,
  type FormatContext,
  type RichWidgetResolvers,
  type TableMenuRequest,
} from '@notesapp/editor';
import { Button, CollapsibleSection, Notice, pageGutter } from '@notesapp/ui';
import {
  problemMessage,
  useRequestSync,
  useSpellCheck,
  useTheme,
} from '../../app.tsx';
import { ActiveNoteScope, useActiveNoteControl } from './active-note.tsx';
import { downloadNote } from '../export/export.ts';
import { useFiles } from '../../shell/files.tsx';
import {
  maxPastedBytes,
  sanitizeAttachmentName,
  useAttachmentUrls,
} from './note-editor-attachments.ts';
import {
  useRegisterNoteActions,
  type NoteScreenActions,
} from './note-actions.tsx';
import {
  noteFrameClassName,
  noteOutlineScrollClassName,
  noteSideRegionClassName,
} from '../../lib/note-column.ts';
import {
  localWriteFailed,
  localWriteFailureMessage,
} from '../../lib/local-write.ts';
import { FormatToolbar } from './format-toolbar.tsx';
import { TableMenu } from './table-menu.tsx';
import { NoteFooter } from './note-footer.tsx';
import { NoteHeader, noteNameErrorId } from './note-header.tsx';
import { NoteHeaderActions } from './note-header-actions.tsx';
import {
  baseNameOf,
  displayNoteName,
  duplicateNameProblem,
  folderOf,
  joinNotePath,
  storageNotePath,
} from '../../lib/note-name.ts';
import { commitNoteName } from '../../lib/note-name-commit.ts';
import { shouldFocusNewNoteNameOnOpen } from '../../lib/note-name-input.ts';
import { OutlinePanel } from './outline.tsx';
import { useDeleteNotice } from '../trash/trash.tsx';
import { createDiagramFrame } from '../../diagram/frame.ts';
import {
  resolveSaveState,
  useBlockUnsafeReload,
  usePublishNoteSave,
  useRegisterNoteDraftFlush,
  type SaveState,
} from './save-status.tsx';
import { createDocumentWorkQueue } from './document-work.ts';
import { noteHeadWasReplaced } from './head-replaced.ts';
import { Backlinks } from './backlinks.tsx';
import { ReviewNoticeBar } from '../review/review-notice.tsx';

/** Draft writes trail input by this long, inside the 150 ms target. */
const draftSaveDelayMs = 120;

/** Delay before work that reads the complete document. */
const documentWorkDelayMs = 200;

/**
 * The built diagram frame document.
 *
 * A plain path string on purpose: this names a static Vite entry, not an
 * application API route, so it stays a literal instead of a constructed URL.
 */
const diagramFramePath = '/src/diagram/frame.html';

/**
 * A version is created automatically this long after typing stops.
 *
 * The delay coalesces a burst of edits into one version, so a pause, not each
 * keystroke, marks a restore point. A blur, a hidden tab, and leaving the note
 * flush a version at once, and the store drops a version whose content already
 * matches the head, so an extra flush costs nothing.
 */
const versionPauseMs = 2500;

/** Records a bounded browser timing entry without affecting the operation. */
export function recordTiming(name: string, startedAt: number): void {
  try {
    performance.measure(name, {
      start: startedAt,
      end: performance.now(),
    });
    if (performance.getEntriesByName(name).length > 200)
      performance.clearMeasures(name);
  } catch {
    // User Timing is development evidence only. It cannot break note work.
  }
}

/** Safety refresh when browser invalidation messages are unavailable. */
const saveStateFallbackMs = 30_000;

/** What one attachment upload is doing right now. */
type AttachState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'uploading'; readonly name: string }
  | { readonly kind: 'failed'; readonly message: string };

/** Props of the editing surface. `initialText` is read once at mount. */
export type NoteEditorProps = {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly baseRevisionId: string | null;
  readonly initialText: string;
  /**
   * The document of the note as this device holds it, or `null` for a note it
   * has not received yet (record 0081).
   *
   * The editor binds to this document, so the text a person edits and the
   * text of the note are one value. Work from another device joins the open
   * editor instead of waiting for a reload, and a save carries only the work
   * of this device.
   */
  readonly initialDocument?: Uint8Array | null | undefined;
  readonly initialPath: string;
  readonly initialWorkingCopyId?: string | undefined;
  readonly initialSequence?: number | undefined;
  readonly focusName?: boolean | undefined;
  readonly onOpenLink?: ((target: LinkTarget) => void) | undefined;
  readonly onQueued?: ((entry: QueueEntry | null) => void) | undefined;
  /** Opens the Move to folder dialog that the note screen owns. */
  readonly onMoveToFolder?: (() => void) | undefined;
  /** Opens the Publish dialog that the note screen owns. */
  readonly onPublish?: (() => void) | undefined;
  /**
   * Reports that the note this editor opened is no longer the note the store
   * holds, and that nothing of this device is at stake.
   *
   * The ordered feed moves the accepted head of a file that another device
   * wrote, and the store then drops a working copy that held nothing (record
   * 0073). An editor whose buffer is the text that was replaced has nothing
   * left to write and must not offer it as the note. It asks the loader for
   * the note again instead.
   */
  readonly onHeadReplaced?: (() => void) | undefined;
};

/**
 * The note screen and the scope of the note it opens.
 *
 * The scope wraps the editor and the outline panel together, and nothing more,
 * because those two are the only parts that share the open editor. The loader
 * below keys this component by file, so each note gets its own scope and a
 * panel never reads the editor of the note before it. A person who leaves the
 * note route unmounts the scope with the screen.
 */
export function NoteEditor(props: NoteEditorProps): ReactNode {
  return (
    <ActiveNoteScope>
      <NoteEditorBody {...props} />
    </ActiveNoteScope>
  );
}

/**
 * The live editing surface of one file.
 *
 * The editor view is created once per working copy and destroyed when the
 * copy closes. Later renders never touch its document: renames and deletes
 * checkpoint through the store, theme changes reconfigure one compartment,
 * and link targets leave through the navigation callback.
 */
function NoteEditorBody({
  store,
  accountId,
  workspaceId,
  fileId,
  baseRevisionId,
  initialText,
  initialDocument = null,
  initialPath,
  initialWorkingCopyId,
  initialSequence = 0,
  focusName = false,
  onOpenLink,
  onQueued,
  onMoveToFolder,
  onPublish,
  onHeadReplaced,
}: NoteEditorProps): ReactNode {
  const navigate = useNavigate();
  const noteList = useFiles();
  const { announce: announceDeleted } = useDeleteNotice();
  // The document queue and the editor view are built once for this working
  // copy. They reach the scope of the open note through this ref, so a new
  // value of the scope can never rebuild them and the one editor instance
  // keeps its document, its undo history, and its selection.
  const activeNoteControl = useActiveNoteControl();
  const activeNote = useRef(activeNoteControl);
  activeNote.current = activeNoteControl;
  const isDeletedRef = useRef(false);
  // True once the store holds a version of this note that this editor never
  // read, while this editor holds no work of its own. The buffer here is then
  // the text that version replaced, so it writes nothing more.
  const headReplacedRef = useRef(false);
  const { resolved } = useTheme();
  const spellCheck = useSpellCheck();
  const spellCheckRef = useRef(spellCheck);
  spellCheckRef.current = spellCheck;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const versionTimerRef = useRef<number | null>(null);
  const bufferRef = useRef(initialText);
  const folderRef = useRef(folderOf(initialPath));
  // The path of the note. The name field holds words the person is still
  // typing, and only a commit of the field moves this path (see
  // `lib/note-name-commit.ts`), so a half-typed name is never written.
  const validPathRef = useRef(initialPath);
  // True while the field holds words that are not the name of the note yet,
  // or a committed name that the store has not taken yet. The store is then
  // the older statement of the name, so the editor does not adopt it and the
  // typed words survive.
  const nameTypingRef = useRef(false);
  const nameEditPendingRef = useRef(false);
  // The write of the document that this editor started. A save waits for it,
  // so the store folds its text into that document and never starts one of
  // its own (see `startWork` in `@notesapp/editor`).
  const startWrittenRef = useRef<Promise<void>>(Promise.resolve());
  const sequenceRef = useRef(initialSequence);
  // The live document of this note, built once for this working copy. The
  // editor binds to it, so the text on the screen and the text of the note
  // are one value (records 0081, 0082). A stored draft that the document does
  // not hold yet becomes local work of this device, so nothing is lost while
  // a device moves from a text draft to a document.
  const liveDocument = useMemo(
    () => openBoundNote(initialDocument, initialText),
    [initialDocument, initialText],
  );
  const sessionRef = useRef(liveDocument);
  sessionRef.current = liveDocument;
  const [name, setName] = useState(displayNoteName(baseNameOf(initialPath)));
  const [pathError, setPathError] = useState('');
  const [bufferText, setBufferText] = useState(initialText);
  const [draftPending, setDraftPending] = useState(false);
  const [saveSnapshot, setSaveSnapshot] = useState<FileSaveSnapshot | null>(
    null,
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [storageError, setStorageError] =
    useState<LocalStorageErrorKind | null>(null);
  // Where the caret stands, which decides the tools of the formatting row.
  const [formatContext, setFormatContext] =
    useState<FormatContext>(plainTextContext);
  // The menu of a row or a column that a handle of a table asked for.
  const [tableMenu, setTableMenu] = useState<TableMenuRequest | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [backlinksOpen, setBacklinksOpen] = useState(true);
  // The one problem line of the editor: an attachment, a paste, or an action
  // that the store refused. It states one cause at a time.
  const [editorNotice, setEditorNotice] = useState('');
  const [attachState, setAttachState] = useState<AttachState>({ kind: 'idle' });
  const [recentAttachments, setRecentAttachments] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFilesRef = useRef<readonly File[]>([]);
  const requestSync = useRequestSync();
  const { attachmentUrls, attachmentUrlsRef } = useAttachmentUrls(
    store,
    accountId,
    workspaceId,
    validPathRef.current,
    bufferText,
    recentAttachments,
  );
  const [mathReady, setMathReady] = useState(false);
  // The base moves to each new checkpoint, so the next save names the parent
  // the server just accepted. Until the first save it is the one the loader
  // read.
  const [baseOverride, setBaseOverride] = useState<string | null | undefined>(
    undefined,
  );
  const openedBase = baseOverride === undefined ? baseRevisionId : baseOverride;
  const workingCopyId = useMemo(
    () => initialWorkingCopyId ?? generateUUID(),
    [initialWorkingCopyId],
  );
  const mathRenderRef = useRef<
    ((source: string, display: boolean) => string) | null
  >(null);
  const documentWork = useMemo(
    () =>
      createDocumentWorkQueue({
        delayMs: documentWorkDelayMs,
        defer: (run, delayMs) => window.setTimeout(run, delayMs),
        cancel: (token) => window.clearTimeout(token),
        run: (text) => {
          setBufferText(text);
          activeNote.current.announce();
        },
      }),
    [],
  );

  useEffect(() => {
    if (!focusName) return;
    if (
      !shouldFocusNewNoteNameOnOpen(
        window.matchMedia('(hover: none) and (pointer: coarse)').matches,
      )
    )
      return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [focusName]);

  const live = useRef({
    store,
    accountId,
    workspaceId,
    fileId,
    baseRevisionId: openedBase,
    workingCopyId,
  });
  live.current = {
    store,
    accountId,
    workspaceId,
    fileId,
    baseRevisionId: openedBase,
    workingCopyId,
  };
  const callbacks = useRef({ onOpenLink, onQueued, onHeadReplaced });
  callbacks.current = { onOpenLink, onQueued, onHeadReplaced };
  const themeRef = useRef(resolved);
  themeRef.current = resolved;

  // The path of the open note belongs to the store, not to this screen. Move
  // to folder, a tree drag, and Rename folder all write it through
  // `LocalStore.moveFiles`, which gives every working copy of the file the new
  // path (decision record 0032). The editor reads it back from the save
  // snapshot of its own file and adopts it without a remount and without
  // replacing its document, so every move surface reaches it the same way.
  //
  // The snapshot is read after a write of this editor commits, so it is never
  // older than what this editor last wrote. A value derived from the note list
  // would be: the list catches up later, and adopting it would undo a rename
  // the person just made.
  const adoptStoredPath = useRef((_path: string | null): void => {});
  adoptStoredPath.current = (next: string | null): void => {
    if (next === null || next === validPathRef.current) return;
    // A name the person is still typing is never replaced. The field holds a
    // value the store has not taken yet, so the store is the older statement.
    if (nameTypingRef.current || nameEditPendingRef.current) return;
    folderRef.current = folderOf(next);
    validPathRef.current = next;
    setPathError('');
    setName(displayNoteName(baseNameOf(next)));
  };

  /** The draft the store would write right now. */
  const buildDraft = (deleted: boolean): Draft => {
    const current = live.current;
    return {
      accountId: current.accountId,
      workspaceId: current.workspaceId,
      workingCopyId: current.workingCopyId,
      fileId: current.fileId,
      baseRevisionId: current.baseRevisionId,
      text: bufferRef.current,
      path: validPathRef.current,
      deleted,
      sequence: sequenceRef.current,
    };
  };

  /**
   * Whether this buffer is the text that a version of another device replaced.
   *
   * The screen reads the note again when that happens, and this editor gives
   * way. Until it does, it writes no version: leaving a note flushes one, and
   * a flush of this buffer would put the replaced text back on top of the
   * version that replaced it. A keystroke lifts the answer, because the person
   * is then writing a save of their own and record 0026 decides that case.
   */
  const bufferWasReplaced = (): boolean =>
    headReplacedRef.current && sequenceRef.current === initialSequence;

  /**
   * Joins the accepted work that this device received into the open document.
   *
   * The engine writes accepted work into the document row of the note. The
   * open editor asks for the part it lacks and applies it through the gate,
   * so the work reaches the screen as one transaction that keeps the
   * selection, and an IME composition keeps its characters (records 0081,
   * 0082).
   */
  const joinStoredWork = useRef((): Promise<void> => Promise.resolve());
  joinStoredWork.current = async (): Promise<void> => {
    const current = live.current;
    const bound = sessionRef.current;
    try {
      const stored = await current.store.readNoteDocument(
        current.accountId,
        current.workspaceId,
        current.fileId,
      );
      if (stored === null) return;
      bound.join(stored.bytes);
    } catch {
      // A read that fails leaves the open document exactly as it is. The
      // next change of the store asks again.
    }
  };

  /** Re-reads the queue so the status reports pending and accepted saves. */
  const refreshQueue = useRef((): Promise<void> => Promise.resolve());
  refreshQueue.current = async (): Promise<void> => {
    const current = live.current;
    await joinStoredWork.current();
    try {
      const [snapshot, checkpoints] = await Promise.all([
        current.store.readFileSaveSnapshot(
          current.accountId,
          current.workspaceId,
          current.fileId,
        ),
        current.store.listCheckpoints(
          current.accountId,
          current.workspaceId,
          current.fileId,
        ),
      ]);
      setSaveSnapshot(snapshot);
      // The note may have moved or reached the trash from the sidebar, from
      // another tab, or from another device. The editor takes both facts from
      // the store, so no later save writes either one back.
      if (snapshot.deleted) isDeletedRef.current = true;
      else {
        adoptStoredPath.current(snapshot.path);
        // Another device wrote this note and the store dropped the working
        // copy that held nothing, so the buffer here is the text that was
        // replaced. The screen reads the note again rather than offering it.
        // One ask per editor: the read that answers mounts a new editor, and
        // a second ask before it returns repeats the same question.
        if (
          !headReplacedRef.current &&
          noteHeadWasReplaced({
            snapshot,
            openedBase: live.current.baseRevisionId,
            openedSequence: initialSequence,
            currentSequence: sequenceRef.current,
          })
        ) {
          headReplacedRef.current = true;
          callbacks.current.onHeadReplaced?.();
        }
      }
      const latest = checkpoints
        .filter((entry) => !entry.deleted)
        .map((entry) => entry.clientTime)
        .sort()
        .at(-1);
      setLastSavedAt(latest ?? null);
    } catch {
      // Queue reads are feedback only. A failure here must not disturb the
      // buffer, the draft, or the draft timer.
    }
  };

  /**
   * Writes the current buffer as the working draft.
   *
   * A note that reached Trash keeps its tombstone: the draft states the
   * deletion that the store already holds, so a pending autosave of this
   * editor cannot bring the note back.
   */
  const saveDraftNow = useRef((): Promise<boolean> => Promise.resolve(true));
  saveDraftNow.current = async (): Promise<boolean> => {
    const isDeleting = isDeletedRef.current;
    const current = live.current;
    const savedSequence = sequenceRef.current;
    setDraftPending(true);
    const startedAt = performance.now();
    try {
      await current.store.saveDraft(buildDraft(isDeleting));
      recordTiming('notesapp.local-draft-save', startedAt);
      // A newer keystroke may have arrived while the write ran; only that
      // newer write clears the pending flag.
      if (sequenceRef.current === savedSequence) setDraftPending(false);
      // The store now holds the name of this field, so the next snapshot is
      // newer than the field. A move that landed while the name was pending is
      // adopted by the queue read below.
      nameEditPendingRef.current = false;
      setStorageError(null);
      await refreshQueue.current();
      return true;
    } catch (failure: unknown) {
      setDraftPending(false);
      setStorageError(isLocalStorageError(failure) ? failure.kind : 'aborted');
      return false;
    }
  };

  const flushDraftForUpdate = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (versionTimerRef.current !== null) {
      window.clearTimeout(versionTimerRef.current);
      versionTimerRef.current = null;
    }
    if (!(await saveDraftNow.current()))
      throw new Error(
        'The open draft could not be stored. Keep this tab open and try again.',
      );
  }, []);
  useRegisterNoteDraftFlush(flushDraftForUpdate);

  /**
   * Creates one immutable checkpoint from the current buffer.
   *
   * A note that reached Trash gets none. The deletion is a whole-file action
   * of the store, so this editor never writes a tombstone of its own and never
   * writes a live version over one (decision record 0032).
   */
  const checkpointInFlightRef = useRef<Promise<boolean> | null>(null);
  const checkpointNow = useRef((): Promise<boolean> => Promise.resolve(true));
  checkpointNow.current = (): Promise<boolean> => {
    if (isDeletedRef.current) return Promise.resolve(false);
    if (bufferWasReplaced()) return Promise.resolve(false);
    // The name was checked when the person kept it. Another note can take
    // the same name later, from another tab or device, and the server would
    // refuse the save, so the reason stands on the note instead.
    const error = duplicateNameProblem(
      validPathRef.current,
      noteList.notes,
      fileId,
    );
    if (error !== null) {
      setPathError(error);
      return Promise.resolve(false);
    }
    const existing = checkpointInFlightRef.current;
    if (existing !== null) return existing;
    const run = (async (): Promise<boolean> => {
      await startWrittenRef.current;
      const saved = await saveDraftNow.current();
      if (!saved) return false;
      const current = live.current;
      try {
        const entry = await current.store.checkpoint(
          buildDraft(false),
          saveCheckpointMessage,
        );
        // The new checkpoint is the parent of the next one. Holding it here
        // keeps the editor right even when its draft row is removed, so a
        // later save never names a parent the file already passed.
        const created = entry?.input.revisions[0]?.id;
        if (created !== undefined) setBaseOverride(created);
        callbacks.current.onQueued?.(entry);
        setStorageError(null);
        await refreshQueue.current();
        return true;
      } catch (failure: unknown) {
        // A `stale` refusal is not a failed write. The store holds a newer
        // statement of this file than the editor does, for example a deletion
        // that arrived from the sidebar or another device, so nothing was
        // lost and nothing is for the person to fix. The queue read below
        // brings the editor to what the store holds.
        if (isLocalStorageError(failure) && failure.kind === 'stale') {
          await refreshQueue.current();
          return false;
        }
        setStorageError(
          isLocalStorageError(failure) ? failure.kind : 'aborted',
        );
        return false;
      }
    })();
    checkpointInFlightRef.current = run;
    void run.finally(() => {
      if (checkpointInFlightRef.current === run)
        checkpointInFlightRef.current = null;
    });
    return run;
  };

  /** Cancels the pending timers and creates a version now, best effort. */
  const flushVersion = useRef((): void => {});
  flushVersion.current = (): void => {
    if (isDeletedRef.current) return;
    if (bufferWasReplaced()) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (versionTimerRef.current !== null) {
      window.clearTimeout(versionTimerRef.current);
      versionTimerRef.current = null;
    }
    void checkpointNow.current();
  };

  useEffect(() => {
    void refreshQueue.current();
    const unsubscribe = live.current.store.subscribe((change) => {
      const current = live.current;
      if (
        change.accountId === current.accountId &&
        change.workspaceId === current.workspaceId &&
        (change.fileId === null || change.fileId === current.fileId)
      ) {
        if (change.kind === 'purge') isDeletedRef.current = true;
        void refreshQueue.current();
      }
    });
    const polling = window.setInterval(() => {
      void refreshQueue.current();
    }, saveStateFallbackMs);
    return () => {
      unsubscribe();
      window.clearInterval(polling);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      documentWork.cancel();
    };
  }, [workingCopyId, documentWork]);

  // KaTeX and its stylesheet load after the first paint. The rich
  // compartment refreshes without changing the editor document, selection,
  // or undo history.
  useEffect(() => {
    let cancelled = false;
    void import('../../lib/markdown.ts').then((module) => {
      if (cancelled) return;
      mathRenderRef.current = module.renderMath;
      setMathReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The resolvers keep their identity between keystrokes. They are rebuilt
  // only when math arrives, when the palette changes, or when the set of
  // resolved attachment URLs really changed, because a new object here
  // reconfigures the widget compartment (MD-10).
  const richResolvers = useMemo<RichWidgetResolvers>(
    () => ({
      renderMath: !mathReady
        ? undefined
        : (source: string, display: boolean): string => {
            const render = mathRenderRef.current;
            if (render === null) throw new Error('Math is still loading.');
            return render(source, display);
          },
      resolveAttachment: (destination: string): string | null => {
        const target = classifyUrl(destination, validPathRef.current);
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
    [attachmentUrls, mathReady, resolved],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (view !== null) setEditorRich(view, richResolvers);
  }, [richResolvers]);

  // One editor instance per working copy. This effect never reruns for text,
  // path, or theme changes: those travel through transactions, the store, or
  // the compartments below.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const bound = sessionRef.current;
    const view = createEditor(
      container,
      bufferRef.current,
      (text) => {
        const startedAt = performance.now();
        bufferRef.current = text;
        documentWork.schedule(text);
        sequenceRef.current += 1;
        setDraftPending(true);
        if (saveTimerRef.current !== null)
          window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null;
          void saveDraftNow.current();
        }, draftSaveDelayMs);
        // A pause in typing creates a version. The timer resets on every
        // keystroke, so a burst becomes one version, not one per key.
        if (versionTimerRef.current !== null)
          window.clearTimeout(versionTimerRef.current);
        versionTimerRef.current = window.setTimeout(() => {
          versionTimerRef.current = null;
          void checkpointNow.current();
        }, versionPauseMs);
        recordTiming('notesapp.typing-handler', startedAt);
      },
      {
        navigation: {
          onOpenLink: (target) => {
            callbacks.current.onOpenLink?.(target);
          },
        },
        onSave: () => {
          void (async (): Promise<void> => {
            if (saveTimerRef.current !== null) {
              window.clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }
            await checkpointNow.current();
          })();
        },
        theme: themeRef.current,
        spellCheck: spellCheckRef.current,
        rich: richResolvers,
        document: bound,
        onFormatContext: setFormatContext,
        onTableMenu: setTableMenu,
        // Work of another device is not input of this device: the screen
        // shows it and schedules no save of its own (record 0085).
        onRemoteChange: (text) => {
          bufferRef.current = text;
          setBufferText(text);
          documentWork.schedule(text);
          void saveDraftNow.current();
        },
      },
    );
    viewRef.current = view;
    activeNote.current.register(view);
    return () => {
      viewRef.current = null;
      activeNote.current.register(null);
      view.destroy();
    };
  }, [workingCopyId, documentWork]);

  // Every local change of the open document is written to this device at
  // once, so a reload and a second tab both read the work of this editor
  // (record 0085). The document is the one source of the text, so the save
  // path that follows sends exactly the work this device added.
  useEffect(() => {
    const bound = sessionRef.current;
    const start = bound.startWork;
    if (start !== null) {
      const current = live.current;
      startWrittenRef.current = current.store
        .mergeNoteWork(
          current.accountId,
          current.workspaceId,
          current.fileId,
          start,
        )
        .then(
          () => undefined,
          () => {
            // A note that the server holds and whose document this device
            // lacks refuses the work (record 0084). The working copy keeps
            // the text, and the draft write reports a failed store.
          },
        );
    }
    const stop = bound.onLocalWork((update) => {
      const current = live.current;
      void current.store
        .mergeNoteWork(
          current.accountId,
          current.workspaceId,
          current.fileId,
          update,
        )
        .catch(() => {
          // A failed local write is reported by the draft write that follows
          // it, so this path says nothing a second time.
        });
    });
    return () => {
      stop();
      bound.release();
    };
  }, [workingCopyId]);

  // Theme changes reconfigure one compartment, keeping document, undo,
  // selection, and composition exactly where they are.
  useEffect(() => {
    const view = viewRef.current;
    if (view !== null) setEditorTheme(view, resolved);
  }, [resolved]);

  // The spell check setting reconfigures one compartment in the same way.
  useEffect(() => {
    const view = viewRef.current;
    if (view !== null) setEditorSpellCheck(view, spellCheck);
  }, [spellCheck]);

  // The note list feeds the link completion. It travels through one
  // compartment, so a refreshed list never replaces the document.
  useEffect(() => {
    let cancelled = false;
    const publish = async (): Promise<void> => {
      try {
        const files = await store.listLocalFiles(accountId, workspaceId);
        const view = viewRef.current;
        if (cancelled || view === null) return;
        setNoteLinkSource(view, {
          currentPath: validPathRef.current,
          notes: files
            .filter((file) => file.kind === 'note' && !file.deleted)
            .map((file) => ({ path: file.path })),
        });
      } catch {
        // Completion is an aid. Without the list the person still types a
        // link by hand, so a failed read changes nothing else.
      }
    };
    void publish();
    const unsubscribe = store.subscribe((change) => {
      if (change.accountId === accountId && change.workspaceId === workspaceId)
        void publish();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store, accountId, workspaceId, workingCopyId]);

  // The note saves itself, so Cmd or Ctrl + S is only an accelerator that
  // creates a version at once. It is window level, so it works while focus
  // sits in the note name field. CodeMirror marks the event handled first, so
  // the editor binding never fires twice.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (!event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        flushVersion.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // A version is a restore point, so leaving the note flushes one. A hidden
  // tab (a switch or a close) flushes at once, and the cleanup flushes when
  // the screen unmounts, which is how one note gives way to another. Typing
  // that only pauses flushes through the version timer instead.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flushVersion.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      flushVersion.current();
    };
  }, []);

  /**
   * Moves the open note to the trash.
   *
   * The write is the same store operation that the sidebar runs, so one
   * deletion path serves every surface (decision record 0032). It marks every
   * working copy of the note deleted, so this editor cannot bring it back. The
   * caller announces the undo notice and leaves for the note list.
   */
  const deleteInFlightRef = useRef<Promise<boolean> | null>(null);
  const deleteOpenNote = useCallback((): Promise<boolean> => {
    const existing = deleteInFlightRef.current;
    if (existing !== null) return existing;
    isDeletedRef.current = true;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (versionTimerRef.current !== null) {
      window.clearTimeout(versionTimerRef.current);
      versionTimerRef.current = null;
    }
    const run = (async (): Promise<boolean> => {
      const current = live.current;
      try {
        await current.store.trashFiles(current.accountId, current.workspaceId, [
          current.fileId,
        ]);
      } catch (failure: unknown) {
        isDeletedRef.current = false;
        // A `stale` refusal means this device does not hold the note yet, so
        // it cannot state the deletion. That is not a storage failure, and it
        // must not pass in silence: the person is told to wait for the note.
        if (isLocalStorageError(failure) && failure.kind === 'stale') {
          setEditorNotice(
            `${displayNoteName(baseNameOf(validPathRef.current))} is not on this device yet. Try again in a moment.`,
          );
          return false;
        }
        setStorageError(
          isLocalStorageError(failure) ? failure.kind : 'aborted',
        );
        return false;
      }
      setEditorNotice('');
      await refreshQueue.current();
      return true;
    })();
    deleteInFlightRef.current = run;
    void run.finally(() => {
      if (deleteInFlightRef.current === run) deleteInFlightRef.current = null;
    });
    return run;
  }, []);

  const saveState: SaveState = resolveSaveState({
    draftWritePending: draftPending,
    queueState: saveSnapshot?.queueState ?? null,
    storageError,
    hasUncheckpointedDraft: saveSnapshot?.hasUncheckpointedDraft ?? true,
    acceptedHeadRevisionId: saveSnapshot?.acceptedHeadRevisionId ?? null,
    localHeadRevisionId: saveSnapshot?.localHeadRevisionId ?? null,
  });
  // The buffer is the only copy until the draft commits, and it is the only
  // copy again when storage fails. Both cases block an unsafe reload. A
  // queued save is durable on this device, so it never blocks one.
  useBlockUnsafeReload(draftPending || storageError !== null);
  const hasUnsavedEdits =
    draftPending || (saveSnapshot?.hasUncheckpointedDraft ?? false);
  // The note saves itself, so this is the one place that states a failed
  // local write, and the sidebar footer stops claiming that it is saved.
  const writeFailure = localWriteFailureMessage(storageError);
  usePublishNoteSave({
    state: saveState,
    hasUnsavedEdits,
    localWriteFailed: localWriteFailed(storageError),
    lastSavedAt,
  });

  /** Inserts Markdown at the current cursor through an editor transaction. */
  const insertAtCursor = (text: string): void => {
    const view = viewRef.current;
    if (view === null) return;
    const { from, to } = view.state.selection.main;
    view.dispatch(view.state.update({ changes: { from, to, insert: text } }));
    view.focus();
  };

  /**
   * Uploads pasted or dropped image files with user supplied bytes.
   *
   * Each file is read locally first, uploaded through the generated
   * operation, finalized as an immutable attachment revision, and embedded
   * as a relative path. No external URL is ever fetched through
   * the server: importing an external image means the user supplies its bytes
   * here. A failure keeps the buffer and reports a notice.
   */
  const uploadPastedFiles = (files: readonly File[]): void => {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    lastFilesRef.current = images;
    void (async (): Promise<void> => {
      const current = live.current;
      for (const file of images) {
        setAttachState({ kind: 'uploading', name: file.name });
        if (file.size > maxPastedBytes) {
          setAttachState({
            kind: 'failed',
            message: `The image ${file.name} is larger than 20 MiB and was not uploaded.`,
          });
          setEditorNotice(
            `The image ${file.name} is larger than 20 MiB and was not uploaded.`,
          );
          continue;
        }
        try {
          const uploaded = await uploadAttachment({
            path: { workspaceId: current.workspaceId },
            body: { file },
          });
          if (uploaded.error !== undefined || uploaded.data === undefined) {
            const message = `The image ${file.name} did not upload: ${problemMessage(uploaded.error)}`;
            setAttachState({ kind: 'failed', message });
            setEditorNotice(message);
            continue;
          }
          const fileId = generateUUID();
          const revisionId = generateUUID();
          const safeName = sanitizeAttachmentName(file.name);
          const finalized = await finalizeAttachment({
            path: {
              workspaceId: current.workspaceId,
              objectId: uploaded.data.objectId,
            },
            body: {
              fileId,
              revisionId,
              mutationId: generateUUID(),
              deviceId: current.store.deviceId,
              path: `attachments/${fileId}-${safeName}`,
              digest: uploaded.data.digest,
            },
          });
          if (finalized.error !== undefined) {
            const message = `The image ${file.name} did not finalize: ${problemMessage(finalized.error)}`;
            setAttachState({ kind: 'failed', message });
            setEditorNotice(message);
            continue;
          }
          const attachmentPath = `attachments/${fileId}-${safeName}`;
          setRecentAttachments((currentAttachments) =>
            new Map(currentAttachments).set(attachmentPath, revisionId),
          );
          requestSync();
          insertAtCursor(
            `![${safeName}](${portableRelativePath(validPathRef.current, attachmentPath)})`,
          );
          setAttachState({ kind: 'idle' });
          setEditorNotice('');
        } catch {
          const message = `The image ${file.name} could not be read on this device.`;
          setAttachState({ kind: 'failed', message });
          setEditorNotice(message);
        }
      }
    })();
  };

  /**
   * Keeps the typed name, or states why it cannot be kept.
   *
   * A new name starts both timers, exactly as a keystroke in the note does.
   * A draft is recovery data of this device and never reaches the server, so
   * a rename that started the draft timer alone stopped at the local store.
   * The path is part of what a version states, so `shouldCheckpoint` writes
   * one for a rename.
   *
   * This runs when the field loses focus and when the person presses Enter,
   * and it returns whether the note has the name that the field shows. A
   * refused name stays in the field beside its reason, and the note keeps
   * its last name.
   */
  const commitName = (): boolean => {
    // Nothing was typed since the last commit or Escape. The blur that
    // follows Enter and Escape lands here, and it must not commit the words
    // that this render still holds.
    if (!nameTypingRef.current) return true;
    const outcome = commitNoteName({
      typed: name,
      folder: folderRef.current,
      currentPath: validPathRef.current,
      notes: noteList.notes,
      fileId,
    });
    if (outcome.kind === 'refused') {
      setPathError(outcome.problem);
      return false;
    }
    nameTypingRef.current = false;
    setName(outcome.name);
    setPathError('');
    if (outcome.kind === 'unchanged') return true;
    validPathRef.current = outcome.path;
    sequenceRef.current += 1;
    nameEditPendingRef.current = true;
    setDraftPending(true);
    if (saveTimerRef.current !== null)
      window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveDraftNow.current();
    }, draftSaveDelayMs);
    // A pause after a rename creates a version, as a pause in typing does.
    if (versionTimerRef.current !== null)
      window.clearTimeout(versionTimerRef.current);
    versionTimerRef.current = window.setTimeout(() => {
      versionTimerRef.current = null;
      void checkpointNow.current();
    }, versionPauseMs);
    return true;
  };

  /** Changes the words in the name field and nothing else. */
  const typeName = (nextName: string): void => {
    nameTypingRef.current = true;
    setName(nextName);
    // The reason belongs to the name that was kept. New words wait for the
    // next commit.
    setPathError('');
  };

  /** Gives the field back the name that the note has. */
  const revertName = (): void => {
    nameTypingRef.current = false;
    setName(displayNoteName(baseNameOf(validPathRef.current)));
    setPathError('');
  };

  /** Moves the caret into the note. */
  const focusNote = (): void => {
    viewRef.current?.focus();
  };

  /** Copies the open note into a new note beside it. */
  const duplicateNote = useCallback((): void => {
    const current = live.current;
    const base = displayNoteName(baseNameOf(validPathRef.current));
    const taken = new Set(
      noteList.notes.map((entry) => entry.path.toLowerCase()),
    );
    let candidate = `${base} copy`;
    let index = 2;
    while (
      taken.has(
        joinNotePath(
          folderRef.current,
          storageNotePath(candidate),
        ).toLowerCase(),
      )
    ) {
      candidate = `${base} copy ${String(index)}`;
      index += 1;
    }
    const copyId = generateUUID();
    const copy: Draft = {
      accountId: current.accountId,
      workspaceId: current.workspaceId,
      workingCopyId: generateUUID(),
      fileId: copyId,
      baseRevisionId: null,
      text: bufferRef.current,
      path: joinNotePath(folderRef.current, storageNotePath(candidate)),
      deleted: false,
      sequence: 1,
    };
    void (async (): Promise<void> => {
      try {
        await createNote(current.store, copy);
      } catch (failure: unknown) {
        setStorageError(
          isLocalStorageError(failure) ? failure.kind : 'aborted',
        );
        return;
      }
      void navigate(`/w/${current.workspaceId}/notes/${copyId}`);
    })();
  }, [noteList.notes, navigate]);

  /** Deletes the open note, tells the person, and leaves for the note list. */
  const deleteNoteAndLeave = useCallback((): void => {
    const deletedName = displayNoteName(validPathRef.current);
    const deletedFolder = folderOf(validPathRef.current);
    if (deletedFolder !== '') noteList.addEmptyFolder(deletedFolder);
    void (async (): Promise<void> => {
      const moved = await deleteOpenNote();
      if (!moved) return;
      // The note is in the trash now, so the person leaves for the note
      // list and the notice there offers one step back.
      announceDeleted({
        workspaceId,
        items: [{ fileId, name: deletedName }],
      });
      void navigate(`/w/${workspaceId}`);
    })();
  }, [
    deleteOpenNote,
    announceDeleted,
    workspaceId,
    fileId,
    navigate,
    noteList,
  ]);

  /** Opens the Move to folder dialog that the note screen owns. */
  const moveNoteToFolder = useCallback((): void => {
    onMoveToFolder?.();
  }, [onMoveToFolder]);

  /** Opens the Publish dialog that the note screen owns. */
  const publishNote = useCallback((): void => {
    onPublish?.();
  }, [onPublish]);

  /** Opens the image chooser of the editor. */
  const attachImage = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Moves the caret into the note name.
   *
   * Renaming a note is writing its name, and the name is on the screen, so
   * the action takes the person to it instead of opening a dialog that asks
   * for the same words in another box.
   */
  const renameNote = useCallback((): void => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, []);

  /**
   * Runs one format action on the one editor view of this working copy.
   *
   * The row of tools and the command palette both call this, so each of them
   * runs the command that the key of the action runs (record 0094).
   */
  const runFormat = useCallback((id: FormatActionId): void => {
    const view = viewRef.current;
    if (view !== null) runFormatAction(view, id);
  }, []);

  /** The editor view of this working copy, for the menu of a table. */
  const currentView = useCallback((): EditorView | null => viewRef.current, []);
  const closeTableMenu = useCallback((): void => {
    setTableMenu(null);
  }, []);

  /** Saves the open note as one Markdown file on this device. */
  const exportMarkdown = useCallback((): void => {
    void downloadNote(workspaceId, fileId).catch((failure: unknown) => {
      setEditorNotice(
        failure instanceof Error
          ? failure.message
          : 'The note could not be saved as a file.',
      );
    });
  }, [workspaceId, fileId]);

  // One stable object holds every action of the open note. It does not change
  // between keystrokes, so the shell registers it once and offers each action
  // in the command palette.
  const noteScreenActions = useMemo<NoteScreenActions>(
    () => ({
      fileId,
      deleteAndLeave: deleteNoteAndLeave,
      moveToFolder: moveNoteToFolder,
      duplicate: duplicateNote,
      attachImage,
      exportMarkdown,
      publish: publishNote,
      format: runFormat,
      formatContext,
    }),
    [
      fileId,
      deleteNoteAndLeave,
      moveNoteToFolder,
      duplicateNote,
      attachImage,
      exportMarkdown,
      publishNote,
      runFormat,
      formatContext,
    ],
  );
  useRegisterNoteActions(noteScreenActions);

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      data-save-state={saveState}
    >
      <NoteHeader
        fileId={fileId}
        name={name}
        nameError={pathError}
        nameInputRef={nameInputRef}
        selectOnFirstFocus={focusName}
        onNameChange={typeName}
        onNameCommit={commitName}
        onNameRevert={revertName}
        onNameDone={focusNote}
      />
      <NoteHeaderActions
        workspaceId={workspaceId}
        fileId={fileId}
        onRename={renameNote}
        onMoveToFolder={onMoveToFolder}
        onDuplicate={duplicateNote}
        onAttachImage={attachImage}
        onExport={exportMarkdown}
        onPublish={onPublish}
        onDelete={deleteNoteAndLeave}
      />
      <div className={`flex min-h-0 flex-1 flex-col ${pageGutter}`}>
        {/*
          The name field is in the frame header, which is one row of 44 px and
          holds no second line, so the reason a name cannot be kept stands
          here, on the note the name belongs to (record 0069). The field
          points at this message with `aria-describedby`.
        */}
        {pathError === '' ? null : (
          <div className="mt-4" id={noteNameErrorId(fileId)}>
            <Notice tone="problem" message={pathError} />
          </div>
        )}
        {writeFailure === null ? null : (
          <div className="mt-4">
            <Notice tone="problem" message={writeFailure} />
          </div>
        )}
        {editorNotice === '' ? null : (
          <div className="mt-4">
            <Notice tone="problem" message={editorNotice} />
          </div>
        )}
        {/*
          A save of this device that joined work of another device offers
          Review here, on the note it belongs to (record 0087).
        */}
        <ReviewNoticeBar
          store={store}
          accountId={accountId}
          workspaceId={workspaceId}
          fileId={fileId}
        />
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          multiple
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event): void => {
            const chosen = Array.from(event.target.files ?? []);
            event.target.value = '';
            uploadPastedFiles(chosen);
          }}
        />
        {attachState.kind === 'uploading' ? (
          <p className="m-0 mt-4 text-control text-muted" role="status">
            {`Uploading ${attachState.name}.`}
          </p>
        ) : null}
        {attachState.kind === 'failed' ? (
          <div className="mt-4">
            <Notice tone="problem" message={attachState.message}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  uploadPastedFiles(lastFilesRef.current);
                }}
              >
                Try again
              </Button>
            </Notice>
          </div>
        ) : null}

        {/*
          The text and the footer are one column, so they sit in one flex
          child and the side region is its sibling (decision 0055). The name
          is not here: it is the last part of the breadcrumb in the frame
          header, so the note starts with its text (decision 0069).
        */}
        <div className="flex min-h-0 flex-1 gap-6">
          <div className={noteFrameClassName()}>
            {/*
              The row of formatting tools is the one band above the text
              (decision 0094). It holds no name and no note action.
            */}
            <FormatToolbar context={formatContext} onFormat={runFormat} />
            {tableMenu === null ? null : (
              <TableMenu
                request={tableMenu}
                view={currentView}
                onClose={closeTableMenu}
              />
            )}
            <div
              ref={containerRef}
              className="min-h-0 flex-1 overflow-hidden"
              onPaste={(event): void => {
                const dropped = Array.from(event.clipboardData?.files ?? []);
                if (dropped.some((file) => file.type.startsWith('image/'))) {
                  event.preventDefault();
                  uploadPastedFiles(dropped);
                }
              }}
              onDrop={(event): void => {
                const dropped = Array.from(event.dataTransfer?.files ?? []);
                if (dropped.some((file) => file.type.startsWith('image/'))) {
                  event.preventDefault();
                  uploadPastedFiles(dropped);
                }
              }}
            />
            <NoteFooter text={bufferText} />
          </div>
          {/*
            The side region takes no width from the note text. It appears
            only from the extra large width up, where the measure and the
            region both fit, so a note on a laptop keeps its full measure
            (decision 0055).
          */}
          <aside
            className={noteSideRegionClassName()}
            aria-label="Note outline and inbound links"
          >
            <div className={noteOutlineScrollClassName()}>
              <OutlinePanel
                text={bufferText}
                open={outlineOpen}
                onToggle={setOutlineOpen}
              />
            </div>
            <div className="min-h-0 max-h-1/2 shrink-0 overflow-y-auto overscroll-contain">
              <CollapsibleSection
                id="notes-backlinks"
                title="Links to this note"
                open={backlinksOpen}
                onToggle={setBacklinksOpen}
              >
                <Backlinks
                  store={store}
                  accountId={accountId}
                  workspaceId={workspaceId}
                  fileId={fileId}
                />
              </CollapsibleSection>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
