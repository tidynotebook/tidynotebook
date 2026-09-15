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
import { Link, useLocation, useNavigate } from 'react-router';
import {
  finalizeAttachment,
  getFile,
  uploadAttachment,
} from '@notesapp/api-client';
import { generateUUID } from '@notesapp/core';
import { classifyUrl, portableRelativePath } from '@notesapp/markdown';
import {
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
  setEditorRich,
  setEditorTheme,
  setNoteLinkSource,
  type EditorView,
  type LinkTarget,
  type RichWidgetResolvers,
} from '@notesapp/editor';
import {
  Button,
  CollapsibleSection,
  LoadingState,
  Notice,
  pageGutter,
} from '@notesapp/ui';
import { problemMessage, useRequestSync, useTheme } from '../../app.tsx';
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
import { NoteFooter } from './note-footer.tsx';
import { NoteHeader } from './note-header.tsx';
import { missingNoteNotice, resolveLinkAction } from '../../lib/note-link.ts';
import {
  baseNameOf,
  cleanNoteBaseName,
  displayNoteName,
  duplicateNameProblem,
  folderOf,
  joinNotePath,
  noteBaseNameProblem,
  noteNameProblem,
  storageNotePath,
} from '../../lib/note-name.ts';
import { OutlinePanel } from './outline.tsx';
import { useDeleteNotice } from '../trash/trash.tsx';
import { createDiagramFrame } from '../../diagram/frame.ts';
import {
  resolveSaveState,
  useBlockUnsafeReload,
  usePublishNoteSave,
  type SaveState,
} from './save-status.tsx';
import { createDocumentWorkQueue } from './document-work.ts';
import { Backlinks } from './backlinks.tsx';

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
function recordTiming(name: string, startedAt: number): void {
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
  readonly initialPath: string;
  readonly initialWorkingCopyId?: string | undefined;
  readonly initialSequence?: number | undefined;
  readonly focusName?: boolean | undefined;
  readonly onOpenLink?: ((target: LinkTarget) => void) | undefined;
  readonly onQueued?: ((entry: QueueEntry | null) => void) | undefined;
  /** Opens the Move to folder dialog that the note screen owns. */
  readonly onMoveToFolder?: (() => void) | undefined;
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
  initialPath,
  initialWorkingCopyId,
  initialSequence = 0,
  focusName = false,
  onOpenLink,
  onQueued,
  onMoveToFolder,
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
  const { resolved } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const versionTimerRef = useRef<number | null>(null);
  const bufferRef = useRef(initialText);
  const folderRef = useRef(folderOf(initialPath));
  const pathRef = useRef(initialPath);
  // A name that breaks a rule is never written. The draft, the tree, and
  // the server keep the last valid name until the person fixes the field.
  const validPathRef = useRef(initialPath);
  // True while the name field holds a value the store has not taken yet. The
  // store is then the older statement of the path, so the editor does not
  // adopt it and the typed name survives.
  const nameEditPendingRef = useRef(false);
  const sequenceRef = useRef(initialSequence);
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
  const callbacks = useRef({ onOpenLink, onQueued });
  callbacks.current = { onOpenLink, onQueued };
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
    if (next === null || next === pathRef.current) return;
    // A name the person is still typing is never replaced. The field holds a
    // value the store has not taken yet, so the store is the older statement.
    if (nameEditPendingRef.current) return;
    folderRef.current = folderOf(next);
    pathRef.current = next;
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

  /** Re-reads the queue so the status reports pending and accepted saves. */
  const refreshQueue = useRef((): Promise<void> => Promise.resolve());
  refreshQueue.current = async (): Promise<void> => {
    const current = live.current;
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
      else adoptStoredPath.current(snapshot.path);
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
    const error = nameProblemRef.current();
    setPathError(error ?? '');
    if (error !== null) return Promise.resolve(false);
    const existing = checkpointInFlightRef.current;
    if (existing !== null) return existing;
    const run = (async (): Promise<boolean> => {
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
      createDiagram: (source: string): HTMLElement =>
        createDiagramFrame({
          source,
          theme: themeRef.current,
          framePath: diagramFramePath,
        }).element,
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
        rich: richResolvers,
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

  // Theme changes reconfigure one compartment, keeping document, undo,
  // selection, and composition exactly where they are.
  useEffect(() => {
    const view = viewRef.current;
    if (view !== null) setEditorTheme(view, resolved);
  }, [resolved]);

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
          currentPath: pathRef.current,
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
  usePublishNoteSave({
    state: saveState,
    hasUnsavedEdits,
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

  /** The one reason the typed name cannot be saved, or `null`. */
  const nameProblemRef = useRef((): string | null => null);
  nameProblemRef.current = (): string | null => {
    const folder = folderRef.current;
    const full = pathRef.current;
    const prefix = folder === '' ? '' : `${folder}/`;
    const remainder =
      prefix === ''
        ? full
        : full.startsWith(prefix)
          ? full.slice(prefix.length)
          : baseNameOf(full);
    const base = cleanNoteBaseName(displayNoteName(remainder));
    const problem = noteBaseNameProblem(base);
    if (problem !== null) return problem;
    const fullProblem = noteNameProblem(joinNotePath(folder, base));
    if (fullProblem !== null) return fullProblem;
    return duplicateNameProblem(
      joinNotePath(folderRef.current, storageNotePath(base)),
      noteList.notes,
      fileId,
    );
  };

  /** Reports the typed name and applies it when every rule holds. */
  const applyName = (nextName: string): void => {
    setName(nextName);
    const cleaned = cleanNoteBaseName(nextName);
    pathRef.current = joinNotePath(folderRef.current, storageNotePath(cleaned));
    const problem = nameProblemRef.current();
    setPathError(problem ?? '');
    if (problem !== null) return;
    validPathRef.current = pathRef.current;
    sequenceRef.current += 1;
    nameEditPendingRef.current = true;
    setDraftPending(true);
    if (saveTimerRef.current !== null)
      window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveDraftNow.current();
    }, draftSaveDelayMs);
  };

  /**
   * Writes the typed name into the field in its stored form.
   *
   * Edge spaces go, and a typed `.md` suffix disappears, so one note never
   * carries two names on screen. This runs when the field loses focus and
   * when the person presses Enter.
   */
  const commitName = (): void => {
    const cleaned = cleanNoteBaseName(name);
    if (cleaned !== name) applyName(cleaned);
    else setPathError(nameProblemRef.current() ?? '');
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
        await current.store.saveDraft(copy);
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

  /** Opens the image chooser of the editor. */
  const attachImage = useCallback((): void => {
    fileInputRef.current?.click();
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
    }),
    [
      fileId,
      deleteNoteAndLeave,
      moveNoteToFolder,
      duplicateNote,
      attachImage,
      exportMarkdown,
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
        onNameChange={applyName}
        onNameCommit={commitName}
      />

      <div className={`flex min-h-0 flex-1 flex-col ${pageGutter}`}>
        {editorNotice === '' ? null : (
          <div className="mt-4">
            <Notice tone="problem" message={editorNotice} />
          </div>
        )}
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

        <div className="flex min-h-0 flex-1 gap-6 pb-4">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          </div>
          <aside
            className="hidden w-56 shrink-0 overflow-y-auto lg:block"
            aria-label="Note outline"
          >
            <CollapsibleSection
              id="notes-outline"
              title="Outline"
              open={outlineOpen}
              onToggle={setOutlineOpen}
            >
              <OutlinePanel
                workspaceId={workspaceId}
                fileId={fileId}
                text={bufferText}
              />
            </CollapsibleSection>
            <CollapsibleSection
              id="notes-backlinks"
              title="Links to this note"
              open={backlinksOpen}
              onToggle={setBacklinksOpen}
            >
              <Backlinks workspaceId={workspaceId} fileId={fileId} />
            </CollapsibleSection>
          </aside>
        </div>
      </div>

      <NoteFooter text={bufferText} />
    </div>
  );
}

/** The loading states of one note before its editor mounts. */
type LoaderStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'purged' }
  | { readonly kind: 'deleted'; readonly path: string }
  | { readonly kind: 'unavailable'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly path: string;
      readonly text: string;
      readonly headRevisionId: string | null;
      readonly workingCopyId?: string | undefined;
      readonly sequence: number;
    };

/**
 * Loads one note and mounts its editor.
 *
 * Unknown, purged, and unavailable notes stay distinct and never render as
 * an empty note. The accepted head text comes from the generated `getFile`
 * operation; local drafts and checkpoints take over once the editor mounts.
 */
export function NoteEditorLoader({
  store,
  accountId,
  workspaceId,
  fileId,
  onMoveToFolder,
}: {
  readonly store: LocalStore | null;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly onMoveToFolder?: (() => void) | undefined;
}): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<LoaderStatus>({ kind: 'loading' });
  // A restore brings a deleted note back. The loader then reads the note once
  // more, so the screen leaves the deleted state without a reload.
  const [reloadToken, setReloadToken] = useState(0);
  const statusKind = useRef<LoaderStatus['kind']>(status.kind);
  statusKind.current = status.kind;
  const [linkNotice, setLinkNotice] = useState('');
  const routeState: unknown = location.state;
  const focusName =
    routeState !== null &&
    typeof routeState === 'object' &&
    Object.fromEntries(Object.entries(routeState))['focusNoteName'] === true;

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setStatus({ kind: 'loading' });
      if (store !== null) {
        try {
          const startedAt = performance.now();
          const cached = await store.readCachedNote(
            accountId,
            workspaceId,
            fileId,
          );
          if (cancelled) return;
          if (cached !== null) {
            recordTiming('notesapp.cached-note-open', startedAt);
            if (cached.deleted) {
              setStatus({ kind: 'deleted', path: cached.path });
              return;
            }
            setStatus({
              kind: 'ready',
              path: cached.path,
              text: cached.text,
              headRevisionId: cached.baseRevisionId,
              workingCopyId: cached.workingCopyId,
              sequence: cached.sequence,
            });
            return;
          }
        } catch {
          // A server read can still show content. A later local write failure
          // keeps the in-memory buffer visible and closes unsafe reload.
        }
      }
      const result = await getFile({
        path: { workspaceId, fileId },
      });
      if (cancelled) return;
      if (result.error !== undefined || result.data === undefined) {
        const code = result.response?.status ?? 0;
        if (code === 404) setStatus({ kind: 'unknown' });
        else if (code === 410) setStatus({ kind: 'purged' });
        else
          setStatus({
            kind: 'unavailable',
            message: problemMessage(result.error),
          });
        return;
      }
      // The screen reached this note before the ordered feed reached the
      // store, so this device holds no row for it. Keep the read, so a later
      // save, move, or deletion starts from a local row instead of naming a
      // create precondition for a file the server already has.
      const head = result.data.head;
      if (store !== null && head !== null && head !== undefined) {
        try {
          await store.cacheServerNote(accountId, workspaceId, {
            fileId,
            path: result.data.path,
            kind: result.data.kind === 'attachment' ? 'attachment' : 'note',
            revisionId: head.revisionId,
            digest: head.digest,
            text: head.text ?? '',
          });
        } catch {
          // The note still opens from the buffer above. A device that could
          // not keep the read reports its failure on the next write.
        }
      }
      if (cancelled) return;
      setStatus({
        kind: 'ready',
        path: result.data.path,
        text: result.data.head?.text ?? '',
        headRevisionId: result.data.headRevisionId,
        sequence: 0,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [store, accountId, workspaceId, fileId, reloadToken]);

  // A restore can reach this device while the note screen shows it as deleted.
  // The loader then reads the note again. The open editor keeps its instance,
  // its document, its undo history, and its selection.
  useEffect(() => {
    if (store === null) return;
    const activeStore = store;
    let cancelled = false;
    const recheck = async (): Promise<void> => {
      try {
        const cached = await activeStore.readCachedNote(
          accountId,
          workspaceId,
          fileId,
        );
        if (cancelled || cached === null) return;
        if (cached.deleted && statusKind.current === 'ready') {
          setStatus({ kind: 'deleted', path: cached.path });
          return;
        }
        // The note was in the trash and is not any more, so a restore
        // reached this device. The loader reads it again.
        if (!cached.deleted && statusKind.current === 'deleted')
          setReloadToken((token) => token + 1);
      } catch {
        // The open note keeps its buffer. A failed recheck changes nothing.
      }
    };
    const unsubscribe = activeStore.subscribe((change) => {
      if (
        change.accountId === accountId &&
        change.workspaceId === workspaceId &&
        (change.fileId === null || change.fileId === fileId)
      ) {
        if (change.kind === 'purge') {
          setStatus({ kind: 'purged' });
          return;
        }
        if (change.kind === 'file') void recheck();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store, accountId, workspaceId, fileId]);

  if (status.kind === 'loading')
    return (
      <section className={`mx-auto w-full max-w-3xl ${pageGutter} py-6`}>
        <LoadingState shape="note" label="The note is loading." />
      </section>
    );
  if (status.kind === 'unknown')
    return (
      <section className={`mx-auto w-full max-w-3xl ${pageGutter} py-6`}>
        <h1 className="mb-4 mt-0 text-xl font-semibold text-strong">
          Note not found
        </h1>
        <p>
          The server knows no note at that address. It may be removed, or the
          address may be wrong. This is not an empty note.
        </p>
        <p>
          <Link to={`/w/${workspaceId}`}>Back to your notes.</Link>
        </p>
      </section>
    );
  if (status.kind === 'purged')
    return (
      <section className={`mx-auto w-full max-w-3xl ${pageGutter} py-6`}>
        <h1 className="mb-4 mt-0 text-xl font-semibold text-strong">
          Note deleted permanently
        </h1>
        <p>
          This note was deleted permanently. Work for it that waits on this
          device stays here and can go into a new note.
        </p>
        <p>
          <Link to={`/w/${workspaceId}`}>Back to your notes.</Link>
        </p>
      </section>
    );
  if (status.kind === 'deleted')
    return (
      <section className={`mx-auto w-full max-w-3xl ${pageGutter} py-6`}>
        <h1 className="mb-4 mt-0 text-xl font-semibold text-strong">
          Note deleted on this device
        </h1>
        <p>
          {displayNoteName(status.path)} is in the trash. The deletion goes to
          the server when this device has a connection.
        </p>
        <p>
          <Link to={`/w/${workspaceId}/trash`}>Open Trash.</Link>
        </p>
      </section>
    );
  if (status.kind === 'unavailable')
    return (
      <section className={`mx-auto w-full max-w-3xl ${pageGutter} py-6`}>
        <h1 className="mb-4 mt-0 text-xl font-semibold text-strong">
          Note unavailable
        </h1>
        <p className="text-control text-danger" role="alert">
          {status.message}
        </p>
      </section>
    );
  if (store === null)
    return (
      <section className={`mx-auto w-full max-w-3xl ${pageGutter} py-6`}>
        <h1 className="mb-4 mt-0 text-xl font-semibold text-strong">
          {displayNoteName(status.path)}
        </h1>
        <p className="text-control text-danger" role="alert">
          Local storage is unavailable, so editing is closed here. The saved
          text follows and can be read.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-edge-subtle bg-card p-3 text-control">
          {status.text}
        </pre>
      </section>
    );

  const activeStore = store;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {linkNotice === '' ? null : (
        <div className={`${pageGutter} pt-4`}>
          <Notice tone="info" message={linkNotice} />
        </div>
      )}
      <NoteEditor
        key={fileId}
        store={store}
        accountId={accountId}
        workspaceId={workspaceId}
        fileId={fileId}
        baseRevisionId={status.headRevisionId}
        initialText={status.text}
        initialPath={status.path}
        initialWorkingCopyId={status.workingCopyId}
        initialSequence={status.sequence}
        focusName={focusName}
        onMoveToFolder={onMoveToFolder}
        onOpenLink={(target: LinkTarget): void => {
          const action = resolveLinkAction(target.target, status.path);
          if (action.kind === 'note-id') {
            setLinkNotice('');
            void navigate(`/w/${workspaceId}/notes/${action.fileId}`);
            return;
          }
          if (action.kind === 'external') {
            setLinkNotice('');
            window.open(action.url, '_blank', 'noopener,noreferrer');
            return;
          }
          if (action.kind === 'note-path') {
            void (async (): Promise<void> => {
              const files = await activeStore.listLocalFiles(
                accountId,
                workspaceId,
              );
              const found = files.find(
                (file) =>
                  file.kind === 'note' &&
                  !file.deleted &&
                  file.path === action.path,
              );
              if (found === undefined) {
                setLinkNotice(missingNoteNotice);
                return;
              }
              setLinkNotice('');
              void navigate(`/w/${workspaceId}/notes/${found.fileId}`);
            })();
            return;
          }
          setLinkNotice('This link points at nothing that can open here.');
        }}
      />
    </div>
  );
}
