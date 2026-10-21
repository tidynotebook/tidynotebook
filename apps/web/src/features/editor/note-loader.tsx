/**
 * The read that puts one note on the screen, and the states that are not one.
 *
 * Unknown, purged, deleted and unavailable each read as themselves, so an
 * empty note is never the answer to a failed read (decision 0038). The local
 * store answers first, and the generated `getFile` operation answers for a
 * note this device has not received yet.
 *
 * A note that this device holds opens in the commit that leaves the last one.
 * The router makes each navigation a transition, and the loader suspends on
 * the open read of the device (`device-note.ts`), so React keeps the screen a
 * person left until the next note is ready. The header, the tree and the note
 * then change together, and no placeholder shows between two notes.
 *
 * The screen follows the store. A restore brings a deleted note back, and a
 * version of another device replaces the note an idle editor holds (record
 * 0073). Both make the loader read the note again and mount the editor on what
 * the store now holds. An editor with a working copy of its own is never
 * remounted, so no text of this device can be lost to a read.
 */
import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { getFile } from '@notesapp/api-client';
import type { LocalFileSummary, LocalStore } from '@notesapp/sync';
import type { LinkTarget } from '@notesapp/editor';
import {
  LoadingState,
  Notice,
  pageGutter,
  PageHeader,
  PageRegion,
} from '@notesapp/ui';
import { problemMessage } from '../../app.tsx';
import {
  blockedLinkNotice,
  missingNoteNotice,
  resolveLinkAction,
} from '../../lib/note-link.ts';
import { displayNoteName } from '../../lib/note-name.ts';
import {
  isSameNote,
  noteHoldMs,
  noteLoadStatusFor,
  type NoteLoadIdentity,
  type NoteLoadState,
  type NoteLoadStatus,
} from '../../lib/note-load-state.ts';
import { createDeviceOpens, readDeviceNote } from './device-note.ts';
import { NoteEditor } from './note-editor.tsx';
import { recordTiming } from './timing.ts';

/**
 * The open reads of the note screen.
 *
 * They live outside the screen, because React asks a suspended screen for
 * the same read again and that screen keeps no state until it commits.
 */
const deviceOpens = createDeviceOpens<LocalStore>(
  async (store, identity) => {
    const startedAt = performance.now();
    const status = await readDeviceNote(store, identity);
    if (status !== null) recordTiming('notesapp.cached-note-open', startedAt);
    return status;
  },
  () =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, noteHoldMs);
    }),
);

/** The bytes of one base64 value that the contract states. */
function bytesOfBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

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
  onPublish,
}: {
  readonly store: LocalStore | null;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
  readonly onMoveToFolder?: (() => void) | undefined;
  readonly onPublish?: (() => void) | undefined;
}): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const identity: NoteLoadIdentity = { accountId, workspaceId, fileId };
  const [loadState, setLoadState] = useState<NoteLoadState>(() => ({
    identity,
    status: { kind: 'loading' },
  }));
  // A render of a note that the loader does not hold yet waits for the device.
  // A note that this device holds then renders with its content, and the
  // router keeps the last note on the screen until it does.
  const opened =
    store === null || isSameNote(loadState.identity, identity)
      ? null
      : use(deviceOpens.open(store, identity).held);
  const status = noteLoadStatusFor(loadState, identity, opened);
  const setStatus = useCallback(
    (next: NoteLoadStatus): void => {
      setLoadState({
        identity: { accountId, workspaceId, fileId },
        status: next,
      });
    },
    [accountId, workspaceId, fileId],
  );
  // A restore brings a deleted note back, and a new generation of a document
  // cannot join the open editor. The loader then reads the note once more,
  // so the screen follows the store without a page reload. A version of
  // another device joins the open editor instead (record 0179).
  const [reloadToken, setReloadToken] = useState(0);
  // A second read of a note that is already on the screen keeps the screen it
  // has. Only the first read of a note shows the loading state, so a version
  // that arrives does not blank a note a person is reading.
  const quietReload = useRef(false);
  const readAgain = useCallback((): void => {
    quietReload.current = true;
    setReloadToken((token) => token + 1);
  }, []);
  // A new generation of the document of the open note cannot join its
  // editor, so the screen reads the note again and mounts one new editor
  // for it. Every other move of the head joins the one editor (record 0179).
  const [generation, setGeneration] = useState(0);
  const reopen = useCallback((): void => {
    setGeneration((count) => count + 1);
    readAgain();
  }, [readAgain]);
  const statusKind = useRef<NoteLoadStatus['kind']>(status.kind);
  statusKind.current = status.kind;
  const [linkNotice, setLinkNotice] = useState('');
  const routeState: unknown = location.state;
  const focusText =
    routeState !== null &&
    typeof routeState === 'object' &&
    Object.fromEntries(Object.entries(routeState))['focusNoteText'] === true;

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const quiet = quietReload.current;
      quietReload.current = false;
      const opening = { accountId, workspaceId, fileId };
      // The first render of this note started the read of the device and
      // waited for it, so that read answers here when the store has not
      // changed the note since. A note on the screen never goes back to the
      // loading state: a read that follows it is quiet.
      const started = store === null ? null : deviceOpens.peek(store, opening);
      if (!quiet && statusKind.current !== 'ready')
        setStatus({ kind: 'loading' });
      if (store !== null) {
        const device = await (started?.read ?? readDeviceNote(store, opening));
        if (cancelled) return;
        if (device !== null) {
          setStatus(device);
          return;
        }
      }
      // The editor starts from the document of the server, so it reads the
      // text and the document together (records 0084, 0168).
      const result = await getFile({
        path: { workspaceId, fileId },
        query: { content: 'full' },
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
      // store, so this device holds no row for it, or no document for it.
      // Keep the read, so a later save, move, or deletion starts from a local
      // row and the document of the server instead of naming a create
      // precondition for a file the server already has.
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
            document:
              head.document === null || head.document === undefined
                ? null
                : bytesOfBase64(head.document),
            epoch: head.epoch ?? 1,
          });
        } catch {
          // The note still opens from the buffer above. A device that could
          // not keep the read reports its failure on the next write.
        }
      }
      // The document of the note comes from this device when it holds one,
      // and from the read otherwise. A device that started a document of its
      // own here would hold characters that the server never saw, and joining
      // the two would show the note twice (records 0081, 0084).
      // The kept read gives the text and the document from one moment, as the
      // cached open does, so work that the feed wrote after the server answer
      // never becomes a difference that the open writes back (record 0133).
      const kept =
        store === null
          ? null
          : await store
              .readCachedNote(accountId, workspaceId, fileId)
              .catch(() => null);
      if (cancelled) return;
      const servedDocument = head?.document ?? null;
      const paired =
        kept !== null && !kept.deleted && kept.document !== null ? kept : null;
      // The generation goes with the document, so the editor names the one
      // that it opened from in each write (record 0181).
      setStatus({
        kind: 'ready',
        path: result.data.path,
        text: paired?.text ?? result.data.head?.text ?? '',
        headRevisionId: result.data.headRevisionId,
        sequence: 0,
        document:
          paired?.document ??
          (servedDocument === null
            ? null
            : {
                bytes: bytesOfBase64(servedDocument),
                epoch: head?.epoch ?? 1,
              }),
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [store, accountId, workspaceId, fileId, reloadToken, setStatus]);

  // Once the loader holds the state of this note, no render asks the device
  // again, so the open reads are done. A read that a navigation started and
  // left goes when the screen does. A later open reads the device afresh.
  const holdsNote = isSameNote(loadState.identity, identity);
  useEffect(() => {
    if (store !== null && holdsNote) deviceOpens.forget(store);
  }, [store, holdsNote, accountId, workspaceId, fileId]);
  useEffect(() => {
    if (store === null) return;
    return () => {
      deviceOpens.forget(store);
    };
  }, [store]);

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
        if (!cached.deleted && statusKind.current === 'deleted') readAgain();
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
  }, [store, accountId, workspaceId, fileId, setStatus, readAgain]);

  if (status.kind === 'loading')
    return (
      <PageRegion>
        <LoadingState shape="note" label="The note is loading." />
      </PageRegion>
    );
  if (status.kind === 'unknown')
    return (
      <PageRegion>
        <PageHeader
          title="Note not found"
          description="The server knows no note at that address. It may be removed, or the address may be wrong. This is not an empty note."
        />
      </PageRegion>
    );
  if (status.kind === 'purged')
    return (
      <PageRegion>
        <PageHeader
          title="Note deleted permanently"
          description="This note was deleted permanently. Work for it that waits on this device stays here and can go into a new note."
        />
      </PageRegion>
    );
  if (status.kind === 'deleted')
    return (
      <PageRegion>
        <PageHeader
          title="Note deleted on this device"
          description={`${displayNoteName(status.path)} is in the trash. The deletion goes to the server when this device has a connection.`}
        />
        <p className="m-0 text-control">
          <Link to={`/w/${workspaceId}/trash`}>Open Trash.</Link>
        </p>
      </PageRegion>
    );
  if (status.kind === 'unavailable')
    return (
      <PageRegion>
        <PageHeader title="Note unavailable" />
        <p className="text-control text-danger" role="alert">
          {status.message}
        </p>
      </PageRegion>
    );
  if (store === null)
    return (
      <PageRegion>
        <PageHeader title={displayNoteName(status.path)} />
        <p className="text-control text-danger" role="alert">
          Local storage is unavailable, so editing is closed here. The saved
          text follows and can be read.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-edge-subtle bg-card p-3 text-control">
          {status.text}
        </pre>
      </PageRegion>
    );

  const activeStore = store;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {linkNotice === '' ? null : (
        <div className={`${pageGutter} pt-4`}>
          <Notice
            tone="info"
            message={linkNotice}
            onDismiss={() => setLinkNotice('')}
          />
        </div>
      )}
      <NoteEditor
        // The revision decides the instance, and not the count of the reads.
        // A read that answers with the revision the editor already holds
        // therefore mounts nothing, so an ask that arrives before the read
        // returns cannot start a round of mounts.
        key={`${fileId}:${status.headRevisionId ?? 'new'}:${String(generation)}`}
        store={store}
        accountId={accountId}
        workspaceId={workspaceId}
        fileId={fileId}
        baseRevisionId={status.headRevisionId}
        initialText={status.text}
        initialDocument={status.document ?? null}
        initialPath={status.path}
        initialWorkingCopyId={status.workingCopyId}
        initialSequence={status.sequence}
        focusText={focusText}
        onMoveToFolder={onMoveToFolder}
        onPublish={onPublish}
        onHeadReplaced={reopen}
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
              let files: readonly LocalFileSummary[];
              try {
                files = await activeStore.listLocalFiles(
                  accountId,
                  workspaceId,
                );
              } catch {
                // The link stays where it is and the note stays open. When
                // local storage stopped, the write of the note fails too, and
                // the note states that cause once (`lib/local-write.ts`).
                return;
              }
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
          setLinkNotice(blockedLinkNotice);
        }}
      />
    </div>
  );
}
