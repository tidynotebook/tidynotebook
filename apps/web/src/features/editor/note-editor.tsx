/**
 * The one-pane note editor screen.
 *
 * One mounted `NoteEditor` owns exactly one CodeMirror view and one working
 * copy. A key changes only the editor: it sets no React state and writes
 * nothing to the store. One local write takes the work of a burst after a
 * pause, and a version follows a longer pause, a blur, or Ctrl + S (records
 * 0022, 0175). The React tree may rerender and the theme may change as often
 * as it wants. Neither action replaces the editor document, so undo history,
 * IME composition, selection, and clipboard content survive them.
 *
 * File identity follows the local-first rule. Edits and renames are drafts.
 * Save and Delete create versions that the foreground sync engine submits.
 * This screen never calls `fetch` and never builds a request URL by hand.
 */
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { generateUUID } from '@notesapp/core';
import { classifyUrl } from '@notesapp/markdown';
import { flushUnchangedDraft } from '../../lib/draft-flush.ts';
import {
  isLocalStorageError,
  saveCheckpointMessage,
  type Draft,
  type LocalStore,
  type NoteDocument,
  type QueueEntry,
} from '@notesapp/sync';
import {
  createEditor,
  documentHolds,
  plainTextContext,
  runFormatAction,
  setEditorRich,
  setEditorSpellCheck,
  setEditorTheme,
  takeMarginTaps,
  type EditorView,
  type LinkTarget,
  type DiagramHandle,
  type FormatActionId,
  type FormatContext,
  type ImageOpenRequest,
  type RichWidgetResolvers,
  type TableMenuRequest,
} from '@notesapp/editor';
import { Button, CollapsibleSection, Notice, pageGutter } from '@notesapp/ui';
import { useSpellCheck, useTheme } from '../../app.tsx';
import { ActiveNoteScope, useActiveNoteControl } from './active-note.tsx';
import { downloadNote, transferFailureMessage } from '../export/export.ts';
import { useFiles, type FilesValue } from '../../shell/files.tsx';
import { useAttachmentUrls } from './note-editor-attachments.ts';
import {
  useRegisterNoteActions,
  type NoteScreenActions,
} from './note-actions.tsx';
import {
  noteFrameClassName,
  noteOutlineScrollClassName,
  noteRowClassName,
  noteSideRegionClassName,
} from '../../lib/note-column.ts';
import { localWriteFailureMessage } from '../../lib/local-write.ts';
import { FormatToolbar, toolSlashCommands } from './format-toolbar.tsx';
import { TableMenu } from './table-menu.tsx';
import { NoteFooter } from './note-footer.tsx';
import { NoteHeader, noteNameErrorId } from './note-header.tsx';
import { NoteHeaderActions } from './note-header-actions.tsx';
import { useInsertTemplate } from './insert-template.ts';
import { useImageUpload } from './image-upload.ts';
import { useNoteLinkSource } from './note-link-source.ts';
import { useNoteSaveFacts } from './note-save-facts.ts';
import { useCopyNote } from './copy-note.tsx';
import {
  baseNameOf,
  displayNoteName,
  duplicateNameProblem,
  folderOf,
} from '../../lib/note-name.ts';
import {
  commitNoteName,
  nameStillPending,
} from '../../lib/note-name-commit.ts';
import { shouldFocusNewNoteOnOpen } from '../../lib/note-name-input.ts';
import { useHeadingName } from './heading-name.ts';
import { duplicateNote as makeCopy } from '../notes/duplicate-note.ts';
import { OutlinePanel } from './outline.tsx';
import { useDeleteNotice } from '../trash/trash.tsx';
import { createDiagramFrame, diagramFramePath } from '../../diagram/frame.ts';
import { useRegisterNoteDraftFlush } from './save-status.tsx';
import { createDocumentWorkQueue } from './document-work.ts';
import { createWriteSchedule } from './write-schedule.ts';
import { createNoteWork, readAfterChange } from './note-work.ts';
import { useScreenNote } from './screen-note.ts';
import { createMountedRead } from '../../lib/coalesced-read.ts';
import { formatPaletteRows } from '../../lib/format-toolbar.ts';
import {
  headToAdopt,
  openedGeneration,
  remoteChangeWritesDraft,
  storedDocumentStep,
} from './head-replaced.ts';
import { Backlinks } from './backlinks.tsx';
import { ReviewNoticeBar } from '../review/review-notice.tsx';
import { ImageViewer } from './image-viewer.tsx';
import { recordTiming } from './timing.ts';

/** A draft write follows a pause in typing this long. */
const draftSaveDelayMs = 120;

/**
 * The longest time a draft waits while the typing goes on (record 0175). The
 * keys are on the disk one frame after they reach the editor, so this bounds
 * only how old the recovery copy of the name and the text can be.
 */
const draftMaxWaitMs = 1000;

/**
 * Delay before work that reads the complete document: the word count, the
 * outline and the attachment scan. It is not on the path of a save.
 */
const documentWorkDelayMs = 200;

/**
 * A version is created automatically this long after typing stops.
 *
 * The delay coalesces a burst of edits into one version, so a pause, not each
 * keystroke, marks a restore point. A blur, a hidden tab, and leaving the note
 * flush a version at once, and the store drops a version whose content already
 * matches the head, so an extra flush costs nothing.
 */
const versionPauseMs = 2500;

/** Safety refresh when browser invalidation messages are unavailable. */
const saveStateFallbackMs = 30_000;

/** Props of the editing surface. `initialText` is read once at mount. */
export type NoteEditorProps = {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly baseRevisionId: string | null;
  readonly initialText: string;
  /**
   * The document of the note as this device holds it, with its generation,
   * or `null` for a note it has not received yet (record 0081).
   *
   * The editor binds to this document, so the text a person edits and the
   * text of the note are one value. Work from another device joins the open
   * editor instead of waiting for a reload, and a save carries only the work
   * of this device. Every write of the editor names the generation, so its
   * work never enters a document of another one (record 0181).
   */
  readonly initialDocument?: NoteDocument | null | undefined;
  readonly initialPath: string;
  readonly initialWorkingCopyId?: string | undefined;
  readonly initialSequence?: number | undefined;
  /** A new note: the caret goes into its text (record 0163). */
  readonly focusText?: boolean | undefined;
  readonly onOpenLink?: ((target: LinkTarget) => void) | undefined;
  readonly onQueued?: ((entry: QueueEntry | null) => void) | undefined;
  /** Opens the Move to folder dialog that the note screen owns. */
  readonly onMoveToFolder?: (() => void) | undefined;
  /** Opens the Publish dialog that the note screen owns. */
  readonly onPublish?: (() => void) | undefined;
  /**
   * Reports that the store holds a new generation of the document of this
   * note, which cannot join this editor, and that no key of this session is
   * at stake. The loader reads the note again with a new editor. Every other
   * move of the head joins this editor and keeps its caret (record 0179).
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
  // The note list changes with every write of the area. The editor reads it
  // only at a boundary, such as a version or a rename, so it reads it through
  // a reference and a new list renders no part of the note (record 0175).
  const files = useFiles();
  const filesRef = useRef(files);
  filesRef.current = files;
  // The screen above passes new callbacks on each of its renders. The body
  // reads them through stable ones, so a render above renders no part of the
  // note (record 0175).
  const propsRef = useRef(props);
  propsRef.current = props;
  const stable = useMemo(
    () => ({
      onOpenLink: (target: LinkTarget): void => {
        propsRef.current.onOpenLink?.(target);
      },
      onQueued: (entry: QueueEntry | null): void => {
        propsRef.current.onQueued?.(entry);
      },
      onMoveToFolder: (): void => {
        propsRef.current.onMoveToFolder?.();
      },
      onPublish: (): void => {
        propsRef.current.onPublish?.();
      },
      onHeadReplaced: (): void => {
        propsRef.current.onHeadReplaced?.();
      },
    }),
    [],
  );
  return (
    <ActiveNoteScope>
      <NoteEditorBody
        {...props}
        onOpenLink={stable.onOpenLink}
        onQueued={stable.onQueued}
        onMoveToFolder={
          props.onMoveToFolder === undefined ? undefined : stable.onMoveToFolder
        }
        onPublish={props.onPublish === undefined ? undefined : stable.onPublish}
        onHeadReplaced={stable.onHeadReplaced}
        filesRef={filesRef}
      />
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
const NoteEditorBody = memo(function NoteEditorBody({
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
  focusText = false,
  onOpenLink,
  onQueued,
  onMoveToFolder,
  onPublish,
  onHeadReplaced,
  filesRef,
}: NoteEditorProps & {
  readonly filesRef: { readonly current: FilesValue };
}): ReactNode {
  const navigate = useNavigate();
  const { announce: announceDeleted } = useDeleteNotice();
  // The document queue and the editor view are built once for this working
  // copy. They reach the scope of the open note through this ref, so a new
  // value of the scope can never rebuild them and the one editor instance
  // keeps its document, its undo history, and its selection.
  const activeNoteControl = useActiveNoteControl();
  const activeNote = useRef(activeNoteControl);
  activeNote.current = activeNoteControl;
  const isDeletedRef = useRef(false);
  // True once the store holds a new generation of the document of this note
  // while this editor holds no key of its own. That document cannot join, so
  // the screen reads the note again, and this editor writes nothing more
  // (record 0179).
  const reopeningRef = useRef(false);
  // The generation of the document that this editor holds (record 0181).
  const openedEpochRef = useRef(openedGeneration(initialDocument));
  const { resolved } = useTheme();
  const spellCheck = useSpellCheck();
  const spellCheckRef = useRef(spellCheck);
  spellCheckRef.current = spellCheck;
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The page margin beside the text. A tap on it beside a task box is a tap
  // at the start of that line, so the editor takes it (record 0132).
  const marginRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // The resolvers the view holds, so the view is reconfigured only when they
  // change and never with the ones it was created with.
  const viewRichRef = useRef<RichWidgetResolvers | null>(null);
  const versionTimerRef = useRef<number | null>(null);
  // Reads the text of the editor now. A key hands over a new reader and
  // copies no text; the text is copied once a write or a panel asks for it
  // (record 0175).
  const textReaderRef = useRef<() => string>(() => initialText);
  const bufferRef = useMemo(
    () => ({
      get current(): string {
        return textReaderRef.current();
      },
    }),
    [],
  );
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
  // True once the open document is released, so a late write reads no
  // vector of a closed document.
  const releasedRef = useRef(false);
  const sequenceRef = useRef(initialSequence);
  // The live document of this note (`screen-note.ts`).
  const { noteRef: sessionRef, mountNote: mountSession } = useScreenNote(
    initialDocument,
    initialText,
  );
  const [name, setName] = useState(displayNoteName(baseNameOf(initialPath)));
  const [pathError, setPathError] = useState('');
  // The save facts of the note change no render (record 0175).
  const {
    saveSnapshotRef,
    lastSavedAtRef,
    writtenSequenceRef,
    storageError,
    setStorageError,
    rootRef,
    showSaveFacts,
  } = useNoteSaveFacts(sequenceRef, initialSequence);
  // Where the caret stands, which decides the tools of the formatting row.
  const [formatContext, setFormatContext] =
    useState<FormatContext>(plainTextContext);
  const formatContextRef = useRef(formatContext);
  formatContextRef.current = formatContext;
  // The menu of a row or a column that a handle of a table asked for.
  const [tableMenu, setTableMenu] = useState<TableMenuRequest | null>(null);
  // The picture that a press on an image of the note opened (record 0145).
  const [openImage, setOpenImage] = useState<ImageOpenRequest | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [backlinksOpen, setBacklinksOpen] = useState(true);
  // The one problem line of the editor: an attachment, a paste, or an action
  // that the store refused. It states one cause at a time.
  const [editorNotice, setEditorNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    attachState,
    recentAttachments,
    upload: uploadPastedFiles,
    retry: retryUpload,
  } = useImageUpload({
    store,
    workspaceId,
    viewRef,
    pathRef: validPathRef,
  });
  const attachments = useAttachmentUrls(
    store,
    accountId,
    workspaceId,
    validPathRef,
    initialText,
    recentAttachments,
  );
  const { attachmentUrls, attachmentUrlsRef } = attachments;
  const scanAttachments = useRef(attachments.scan);
  scanAttachments.current = attachments.scan;
  const [mathReady, setMathReady] = useState(false);
  // The base moves to each new checkpoint, so the next save names the parent
  // the server just accepted. Until the first save it is the one the loader
  // read.
  const baseRef = useRef<string | null>(baseRevisionId);
  const workingCopyId = useMemo(
    () => initialWorkingCopyId ?? generateUUID(),
    [initialWorkingCopyId],
  );
  const mathRenderRef = useRef<
    ((source: string, display: boolean) => string) | null
  >(null);
  // The panels around the text read it after a quiet time. They take it
  // through the scope of the open note, so the note screen does not render.
  const documentWork = useMemo(
    () =>
      createDocumentWorkQueue<number, () => string>({
        delayMs: documentWorkDelayMs,
        defer: (run, delayMs) => window.setTimeout(run, delayMs),
        cancel: (token) => window.clearTimeout(token),
        run: (readText) => {
          activeNote.current.announce();
          scanAttachments.current(readText());
        },
      }),
    [],
  );

  useEffect(() => {
    if (!focusText) return;
    if (
      !shouldFocusNewNoteOnOpen(
        window.matchMedia('(hover: none) and (pointer: coarse)').matches,
      )
    )
      return;
    viewRef.current?.focus();
  }, [focusText]);
  const headingName = useHeadingName(initialText, validPathRef, bufferRef);

  const live = useRef({
    store,
    accountId,
    workspaceId,
    fileId,
    workingCopyId,
  });
  live.current = {
    store,
    accountId,
    workspaceId,
    fileId,
    workingCopyId,
  };
  const callbacks = useRef({ onOpenLink, onQueued, onHeadReplaced });
  callbacks.current = { onOpenLink, onQueued, onHeadReplaced };
  const themeRef = useRef(resolved);
  themeRef.current = resolved;

  // The path of the open note belongs to the store, not to this screen. Move
  // to folder, a tree drag, and a rename in the tree all write it through
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
    headingName.adopt(bufferRef.current);
    // A relative picture names its file from the folder of the note.
    scanAttachments.current(bufferRef.current);
  };

  /** Gives an automatic name the heading at a version (record 0163). */
  const followHeading = (): void => {
    const next = headingName.next({
      notes: filesRef.current.namesInUse,
      fileId,
      typing: nameTypingRef.current,
      edited:
        sequenceRef.current !==
        (noteWork.versionedSequence() ?? initialSequence),
    });
    if (next === null) return;
    validPathRef.current = next;
    sequenceRef.current += 1;
    nameEditPendingRef.current = true;
    setName(displayNoteName(baseNameOf(next)));
  };

  /** The draft the store would write right now. */
  const buildDraftRef = useRef((_deleted: boolean): Draft => {
    throw new Error('The draft of the note is read before the note opened.');
  });
  buildDraftRef.current = (deleted: boolean): Draft => {
    const current = live.current;
    return {
      accountId: current.accountId,
      workspaceId: current.workspaceId,
      workingCopyId: current.workingCopyId,
      fileId: current.fileId,
      baseRevisionId: baseRef.current,
      text: bufferRef.current,
      path: validPathRef.current,
      deleted,
      sequence: sequenceRef.current,
    };
  };

  // The writes of this editor: the work of each frame, the draft after a
  // pause and the version (record 0175). The ports read references, so the
  // writes of the first render stay right.
  const noteWork = useMemo(
    () =>
      createNoteWork({
        takeWork: () => sessionRef.current.takeLocalWork(),
        wholeWork: () => sessionRef.current.work(),
        stateVector: () =>
          releasedRef.current ? null : sessionRef.current.stateVector(),
        holds: documentHolds,
        sequence: () => sequenceRef.current,
        draft: (deleted) => buildDraftRef.current(deleted),
        started: () => startWrittenRef.current,
        append: (work) => {
          const current = live.current;
          return current.store.appendNoteWork(
            current.accountId,
            current.workspaceId,
            current.fileId,
            openedEpochRef.current,
            work,
            current.workingCopyId,
          );
        },
        merge: async (work) => {
          const current = live.current;
          await current.store.mergeNoteWork(
            current.accountId,
            current.workspaceId,
            current.fileId,
            openedEpochRef.current,
            work,
          );
        },
        saveDraft: (draft) => live.current.store.saveDraft(draft),
        checkpoint: (draft) =>
          live.current.store.checkpoint(draft, saveCheckpointMessage, {
            kind: 'document',
            epoch: openedEpochRef.current,
          }),
        draftOwed: () => {
          void saveDraftNow.current();
        },
        frame: (run) => {
          const token = window.requestAnimationFrame(run);
          return () => {
            window.cancelAnimationFrame(token);
          };
        },
      }),
    [],
  );

  /**
   * Whether this editor gives way to a new editor of a new generation.
   *
   * Until the new editor mounts, this one writes no version: its document is
   * of the old generation. A key lifts the answer, because the person is then
   * writing a save of their own and record 0084 recovers it.
   */
  const bufferWasReplaced = (): boolean =>
    reopeningRef.current && sequenceRef.current === initialSequence;

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
    // The changes that the store took before this read, which the stored
    // document must hold (record 0181).
    const mark = noteWork.takenMark();
    try {
      const stored = await current.store.readNoteDocument(
        current.accountId,
        current.workspaceId,
        current.fileId,
      );
      if (stored === null) return;
      const step = storedDocumentStep({
        openedEpoch: openedEpochRef.current,
        storedEpoch: stored.epoch,
        typed: sequenceRef.current !== initialSequence,
      });
      if (step === 'join') {
        // A snapshot can replace the row under work of this editor. The
        // next version then writes the whole document again.
        noteWork.readStored(stored.bytes, mark);
        // Another device, a restore or a snapshot moved the note: the one
        // editor takes the work and keeps its caret and scroll (record 0179).
        bound.join(stored.bytes);
        return;
      }
      // A new generation holds none of the work of this editor. The store
      // refuses each write of it, and the draft keeps its text (record 0181).
      if (step === 'keep') noteWork.storeLacksWork();
      if (step === 'reopen' && !reopeningRef.current) {
        reopeningRef.current = true;
        callbacks.current.onHeadReplaced?.();
      }
    } catch {
      // A read that fails leaves the open document exactly as it is. The
      // next change of the store asks again.
    }
  };

  /** Re-reads the queue so the status reports pending and accepted saves. */
  const refreshQueue = useRef((_join: boolean): Promise<void> =>
    Promise.resolve(),
  );
  refreshQueue.current = async (join: boolean): Promise<void> => {
    const current = live.current;
    if (join) await joinStoredWork.current();
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
      saveSnapshotRef.current = snapshot;
      // The note may have moved or reached the trash from the sidebar, from
      // another tab, or from another device. The editor takes both facts from
      // the store, so no later save writes either one back.
      if (snapshot.deleted) isDeletedRef.current = true;
      else {
        adoptStoredPath.current(snapshot.path);
        // Another device moved the head and nothing of this device waits.
        // The join above brought the new text, so the next save of this
        // editor descends from the new head (record 0179).
        const adopted = headToAdopt({
          snapshot,
          base: baseRef.current,
          openedSequence: initialSequence,
          currentSequence: sequenceRef.current,
        });
        if (adopted !== null) baseRef.current = adopted;
      }
      const latest = checkpoints
        .filter((entry) => !entry.deleted)
        .map((entry) => entry.clientTime)
        .sort()
        .at(-1);
      lastSavedAtRef.current = latest ?? null;
      showSaveFacts.current();
    } catch {
      // Queue reads are feedback only. A failure here must not disturb the
      // buffer, the draft, or the draft timer.
    }
  };

  /**
   * One queue read at a time for a burst of store changes (record 0176). A
   * change that can bring work into the document asks for a join as well. A
   * draft never touches the document, so a draft write asks for none. The
   * effect below mounts the read, so a second mount of the effect, as React
   * runs in development, reads the store as the first did.
   */
  const joinWantedRef = useRef(false);
  const queueRead = useMemo(
    () =>
      createMountedRead(async (): Promise<void> => {
        const join = joinWantedRef.current;
        joinWantedRef.current = false;
        await refreshQueue.current(join);
      }),
    [],
  );
  const askQueue = useRef((join: boolean): void => {
    if (join) joinWantedRef.current = true;
    queueRead.ask();
  }).current;

  /**
   * Writes the current buffer as the working draft.
   *
   * A note that reached Trash keeps its tombstone: the draft states the
   * deletion that the store already holds, so a pending autosave of this
   * editor cannot bring the note back.
   */
  const saveDraftNow = useRef((): Promise<boolean> => Promise.resolve(true));
  saveDraftNow.current = async (): Promise<boolean> => {
    const startedAt = performance.now();
    try {
      const draft = await noteWork.writeDraft(isDeletedRef.current);
      recordTiming('notesapp.local-draft-save', startedAt);
      draftTaken.current(draft);
      setStorageError(null);
      askQueue(false);
      return true;
    } catch (failure: unknown) {
      setStorageError(isLocalStorageError(failure) ? failure.kind : 'aborted');
      return false;
    }
  };

  /** States that the store holds a draft: from a draft write or a checkpoint. */
  const draftTaken = useRef((_draft: Draft): void => {});
  draftTaken.current = (draft: Draft): void => {
    writtenSequenceRef.current = Math.max(
      writtenSequenceRef.current,
      draft.sequence,
    );
    // The store holds the name of this draft. A newer name, such as the name
    // of a heading that a version gave while this write ran, stays pending,
    // so a later queue read cannot put the older path back.
    nameEditPendingRef.current = nameStillPending(draft.path, validPathRef);
    showSaveFacts.current();
  };

  // The draft follows a pause in typing, no later than `draftMaxWaitMs`
  // after its first change. The keys do not wait for it: each frame appends
  // them to the document (record 0175).
  const localWrite = useMemo(
    () =>
      createWriteSchedule<number>({
        pauseMs: draftSaveDelayMs,
        maxWaitMs: draftMaxWaitMs,
        now: () => performance.now(),
        defer: (run, delayMs) => window.setTimeout(run, delayMs),
        cancel: (token) => window.clearTimeout(token),
        write: () => {
          void saveDraftNow.current();
        },
      }),
    [],
  );

  const flushDraftForUpdate = useCallback(async (): Promise<void> => {
    await flushUnchangedDraft(
      () =>
        releasedRef.current
          ? null
          : `${live.current.workingCopyId}:${sequenceRef.current}`,
      async () => {
        localWrite.cancel();
        if (versionTimerRef.current !== null) {
          window.clearTimeout(versionTimerRef.current);
          versionTimerRef.current = null;
        }
        await noteWork.flush();
        if (!(await saveDraftNow.current()))
          throw new Error(
            'The open draft could not be stored. Keep this tab open and try again.',
          );
      },
    );
  }, [localWrite]);
  useRegisterNoteDraftFlush(flushDraftForUpdate);

  /**
   * Creates one immutable checkpoint from the current buffer.
   *
   * A note that reached Trash gets none. The deletion is a whole-file action
   * of the store, so this editor never writes a tombstone of its own and never
   * writes a live version over one (decision record 0032).
   */
  const checkpointInFlightRef = useRef<Promise<boolean> | null>(null);
  // A boundary that arrives while a checkpoint runs, such as a second toggle
  // of a task box, gets one more checkpoint when the running one ends. The
  // running one froze the document before that change (record 0134).
  const checkpointAgainRef = useRef(false);
  const checkpointNow = useRef((): Promise<boolean> => Promise.resolve(true));
  checkpointNow.current = (): Promise<boolean> => {
    if (isDeletedRef.current) return Promise.resolve(false);
    if (bufferWasReplaced()) return Promise.resolve(false);
    // The document also holds the work of other tabs and devices, and that
    // work is a version of the editor that wrote it. An editor with no input
    // since its last checkpoint therefore writes no version (record 0133).
    // The first checkpoint always runs, because a draft that this open
    // recovered can hold work that no version holds yet.
    if (noteWork.versionedSequence() === sequenceRef.current)
      return Promise.resolve(false);
    followHeading();
    // The name was checked when the person kept it. Another note can take
    // the same name later, from another tab or device, and the server would
    // refuse the save, so the reason stands on the note instead.
    const error = duplicateNameProblem(
      validPathRef.current,
      filesRef.current.namesInUse,
      fileId,
    );
    if (error !== null) {
      setPathError(error);
      return Promise.resolve(false);
    }
    const existing = checkpointInFlightRef.current;
    if (existing !== null) {
      checkpointAgainRef.current = true;
      return existing;
    }
    // The checkpoint writes the draft in its own transaction, so the draft
    // write that waits is not needed first. A checkpoint that writes no
    // draft asks for it again. The work that waits is appended now, and the
    // checkpoint starts at once: an explicit save waits for no timer and for
    // no read (record 0176).
    localWrite.cancel();
    const run = (async (): Promise<boolean> => {
      // The version freezes the document and never writes the buffer into
      // it, because the buffer can lag remote work that the store took
      // first (record 0133). It claims only the changes whose work it wrote
      // (record 0175).
      const outcome = await noteWork.version();
      if (outcome.kind === 'written') {
        const { entry, draft } = outcome;
        if (entry !== null) draftTaken.current(draft);
        // The new checkpoint is the parent of the next one. Holding it here
        // keeps the editor right even when its draft row is removed, so a
        // later save never names a parent the file already passed.
        const created = entry?.input.revisions[0]?.id;
        if (created !== undefined) baseRef.current = created;
        callbacks.current.onQueued?.(entry);
        setStorageError(null);
        askQueue(true);
        return true;
      }
      const { failure } = outcome;
      // A `stale` refusal is not a failed write. The store holds a newer
      // statement of this file than the editor does, for example a deletion
      // that arrived from the sidebar or another device, so nothing was lost
      // and nothing is for the person to fix. The queue read brings the
      // editor to what the store holds.
      if (isLocalStorageError(failure) && failure.kind === 'stale') {
        askQueue(true);
        return false;
      }
      setStorageError(isLocalStorageError(failure) ? failure.kind : 'aborted');
      return false;
    })();
    checkpointInFlightRef.current = run;
    void run.finally(() => {
      if (checkpointInFlightRef.current === run)
        checkpointInFlightRef.current = null;
      if (checkpointAgainRef.current) {
        checkpointAgainRef.current = false;
        void checkpointNow.current();
      }
    });
    return run;
  };

  /** Cancels the pending timers and creates a version now, best effort. */
  const flushVersion = useRef((): void => {});
  flushVersion.current = (): void => {
    if (isDeletedRef.current) return;
    if (bufferWasReplaced()) return;
    if (versionTimerRef.current !== null) {
      window.clearTimeout(versionTimerRef.current);
      versionTimerRef.current = null;
    }
    void checkpointNow.current();
  };

  useEffect(() => {
    const unmountRead = queueRead.mount();
    askQueue(true);
    const unsubscribe = live.current.store.subscribe((change) => {
      const current = live.current;
      if (
        change.accountId !== current.accountId ||
        change.workspaceId !== current.workspaceId ||
        (change.fileId !== null && change.fileId !== current.fileId)
      )
        return;
      if (change.kind === 'purge') isDeletedRef.current = true;
      const read = readAfterChange(change, current.workingCopyId);
      if (read !== 'none') askQueue(read === 'join');
    });
    const polling = window.setInterval(() => {
      askQueue(true);
    }, saveStateFallbackMs);
    return () => {
      unsubscribe();
      window.clearInterval(polling);
      unmountRead();
      documentWork.cancel();
    };
  }, [workingCopyId, documentWork, queueRead, askQueue]);

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
      onOpenImage: setOpenImage,
    }),
    [attachmentUrls, mathReady, resolved],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (view === null || viewRichRef.current === richResolvers) return;
    viewRichRef.current = richResolvers;
    setEditorRich(view, richResolvers);
  }, [richResolvers]);

  // One editor instance per working copy. This effect never reruns for text,
  // path, or theme changes: those travel through transactions, the store, or
  // the compartments below. It is a layout effect, so the view holds the text
  // of the note before the browser paints the note screen. A passive effect
  // ran after that paint, and each open of a note showed one frame with the
  // tools and no text.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const bound = mountSession();
    const view = createEditor(
      container,
      bufferRef.current,
      (readText) => {
        // A key sets no React state. It keeps a reader of the text, counts
        // the change and moves the timers. Its work goes to the store on the
        // next frame (record 0175).
        const startedAt = performance.now();
        textReaderRef.current = readText;
        documentWork.schedule(readText);
        const first = sequenceRef.current === writtenSequenceRef.current;
        sequenceRef.current += 1;
        if (first) showSaveFacts.current();
        localWrite.touch();
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
          flushVersion.current();
        },
        theme: themeRef.current,
        spellCheck: spellCheckRef.current,
        rich: richResolvers,
        document: bound,
        onFormatContext: setFormatContext,
        onTableMenu: setTableMenu,
        // The slash menu offers the block tools of the row (issue 259).
        slashCommands: toolSlashCommands,
        // A toggle of a task box is a whole action, so it saves at once and
        // another device reads it before the person reaches that device. Two
        // toggles of one box that cross still merge to one state on the
        // server (record 0134).
        onTaskToggle: () => {
          flushVersion.current();
        },
        // Work of another device is not input of this device: the screen
        // shows it and schedules no save of its own (record 0085).
        onRemoteChange: (readText) => {
          textReaderRef.current = readText;
          documentWork.schedule(readText);
          // A draft is recovery data of local work, so remote work writes
          // only a draft that this editor has already (record 0179).
          if (remoteChangeWritesDraft(sequenceRef.current))
            void saveDraftNow.current();
        },
      },
    );
    viewRef.current = view;
    viewRichRef.current = richResolvers;
    activeNote.current.register(view);
    const margin = marginRef.current;
    const stopMarginTaps =
      margin === null ? null : takeMarginTaps(view, margin);
    return () => {
      stopMarginTaps?.();
      viewRef.current = null;
      viewRichRef.current = null;
      activeNote.current.register(null);
      view.destroy();
    };
  }, [workingCopyId, documentWork, localWrite]);

  // The local changes of the open document reach this device one frame
  // after they reach the editor, so a reload, a closed tab and a second tab
  // all read the work of this editor (records 0085, 0175). The document is
  // the one source of the text, so the save path that follows sends exactly
  // the work this device added.
  useEffect(() => {
    const bound = mountSession();
    releasedRef.current = false;
    const start = bound.startWork;
    if (start !== null) {
      const current = live.current;
      startWrittenRef.current = current.store
        .mergeNoteWork(
          current.accountId,
          current.workspaceId,
          current.fileId,
          openedEpochRef.current,
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
    const stopListening = bound.onLocalWork(noteWork.changed);
    return () => {
      stopListening();
      // Leaving the note writes the work, the draft and a version while the
      // document is still open, because each one reads it (record 0022).
      noteWork.stop();
      void noteWork.flush();
      localWrite.flush();
      flushVersion.current();
      releasedRef.current = true;
      bound.release();
    };
  }, [workingCopyId, localWrite, noteWork]);

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

  useNoteLinkSource(
    store,
    accountId,
    workspaceId,
    workingCopyId,
    viewRef,
    validPathRef,
  );

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
  // tab (a switch or a close) runs no frame, so it appends the work that
  // waits at once, writes the draft and flushes a version. The end of the
  // screen does the same, which is how one note gives way to another.
  // Typing that only pauses flushes through the version timer instead.
  useEffect(() => {
    const onHide = (): void => {
      void noteWork.flush();
      localWrite.flush();
      flushVersion.current();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [noteWork, localWrite]);

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
    localWrite.cancel();
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
      askQueue(true);
      return true;
    })();
    deleteInFlightRef.current = run;
    void run.finally(() => {
      if (deleteInFlightRef.current === run) deleteInFlightRef.current = null;
    });
    return run;
  }, [localWrite, askQueue, setStorageError]);

  // The root states the save state from its first frame on, and later
  // changes write it through `showSaveFacts`.
  useLayoutEffect(() => {
    showSaveFacts.current();
  }, []);
  // The note saves itself, so this is the one place that states a failed
  // local write, and the sidebar footer stops claiming that it is saved.
  const writeFailure = localWriteFailureMessage(storageError);

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
      notes: filesRef.current.namesInUse,
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
    showSaveFacts.current();
    localWrite.touch();
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
    void makeCopy(current.store, {
      ...current,
      path: validPathRef.current,
      text: bufferRef.current,
      takenPaths: filesRef.current.namesInUse.map((entry) => entry.path),
    }).then(
      (copyId) => navigate(`/w/${current.workspaceId}/notes/${copyId}`),
      (failure: unknown) =>
        setStorageError(
          isLocalStorageError(failure) ? failure.kind : 'aborted',
        ),
    );
  }, [filesRef.current.namesInUse, navigate]);

  /** Deletes the open note, tells the person, and leaves for the note list. */
  const deleteNoteAndLeave = useCallback((): void => {
    const deletedName = displayNoteName(validPathRef.current);
    const deletedFolder = folderOf(validPathRef.current);
    if (deletedFolder !== '') filesRef.current.addEmptyFolder(deletedFolder);
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
    filesRef,
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

  /** Fills one template over the selection (record 0149). */
  const insertTemplate = useInsertTemplate({
    store,
    accountId,
    workspaceId,
    viewRef,
    pathRef: validPathRef,
    setNotice: setEditorNotice,
  });

  const copyNote = useCopyNote(viewRef);

  /** The editor view of this working copy, for the menu of a table. */
  const currentView = useCallback((): EditorView | null => viewRef.current, []);
  const closeTableMenu = useCallback((): void => {
    setTableMenu(null);
  }, []);

  /** Saves the open note as one Markdown file on this device. */
  const exportMarkdown = useCallback((): void => {
    void downloadNote(workspaceId, fileId).catch((failure: unknown) => {
      setEditorNotice(transferFailureMessage(failure));
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
      copyMarkdown: copyNote.run,
      publish: publishNote,
      format: runFormat,
      // The palette reads the rows when it opens, so a move of the caret
      // registers nothing, and the frame imports no editor code (record
      // 0177).
      formatRows: () => formatPaletteRows(formatContextRef.current),
      insertTemplate,
    }),
    [
      fileId,
      deleteNoteAndLeave,
      moveNoteToFolder,
      duplicateNote,
      attachImage,
      exportMarkdown,
      copyNote.run,
      publishNote,
      runFormat,
      insertTemplate,
    ],
  );
  useRegisterNoteActions(noteScreenActions);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" ref={rootRef}>
      <NoteHeader
        fileId={fileId}
        name={name}
        nameError={pathError}
        nameInputRef={nameInputRef}
        selectOnFirstFocus={focusText}
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
      <div
        ref={marginRef}
        className={`flex min-h-0 flex-1 flex-col ${pageGutter}`}
      >
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
                  retryUpload();
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
          header, so the note starts with its text (decision 0069). The row
          is the row of every page, so the text keeps the place of the
          column of any other page (decision 0137).
        */}
        <div className={noteRowClassName()}>
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
            <NoteFooter initialText={initialText} />
            <ImageViewer
              image={openImage}
              onClose={() => {
                setOpenImage(null);
              }}
            />
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
                text={initialText}
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
      {copyNote.toast}
    </div>
  );
});
