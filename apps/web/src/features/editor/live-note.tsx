import type { NoteWork } from './note-work.ts';
import { registerAccessFlush } from '../../lib/workspace-recovery.ts';
import { base64, bytesOfBase64, type LocalStore } from '@notesapp/sync';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  type BoundNote,
  setEditorReadOnly,
  type EditorView,
  decodeNoteAwareness,
  decodeNoteSync,
  encodeNoteSync,
  mergeDocumentUpdates,
  updateActors,
} from '@notesapp/editor';
import {
  Button,
  Dialog,
  DialogBody,
  PresenceAvatar,
  Inline,
  ListRow,
  Notice,
  Popover,
  noteColumnInset,
  noteColumnFineInset,
  Stack,
  Pill,
} from '@notesapp/ui';
import { generateUUID } from '@notesapp/core';
import type { Role } from '@notesapp/api-client';
import { useSession, useTabNoticeStream, useWorkspace } from '../../app.tsx';
import { noteColumnClassName } from '../../lib/note-column.ts';
import { initialOf } from '../../lib/initial.ts';
function readProperty(value: unknown, key: string): unknown {
  return value === null || typeof value !== 'object'
    ? undefined
    : Object.fromEntries(Object.entries(value))[key];
}

const maxSyncBytes = 64 * 1024;
const maxAwarenessBytes = 4 * 1024;
const liveSendMs = 100;
const liveRetryMs = 5000;

type Person = {
  readonly clientId: number;
  readonly accountId: string;
  readonly name: string;
  readonly slot: number;
  readonly mode: string;
  readonly idle: boolean;
};
type LiveStatus = 'Live' | 'Reconnecting' | 'Offline';
export type LiveState = {
  readonly status: LiveStatus;
  readonly others: readonly Person[];
  readonly access?: Role | 'removed';
};

export function useLiveNote(input: {
  readonly workspaceId: string;
  readonly fileId: string;
  readonly epoch: number | null;
  readonly hold: () => { note: BoundNote; release: () => void };
  readonly persist: (update: Uint8Array) => Promise<unknown>;
  readonly flush: () => Promise<void>;
  readonly canEdit: () => boolean;
}): LiveState {
  const stream = useTabNoticeStream();
  const account = useSession().account;
  const workspace = useWorkspace();
  const reload = workspace.reload;
  const [state, setState] = useState<LiveState>({
    status: navigator.onLine ? 'Reconnecting' : 'Offline',
    others: [],
  });
  const { workspaceId, fileId, epoch, hold, persist, flush, canEdit } = input;

  useEffect(() => {
    if (stream === null || account === null || epoch === null) return;
    const { note, release } = hold();
    const roomId = generateUUID();
    const clientId = note.clientId();
    const others = new Map<number, Person>();
    let active = true;
    let joined = false;
    let role: Role = 'viewer';
    let retired = false;
    let sequence = 0;
    let status: LiveStatus = navigator.onLine ? 'Reconnecting' : 'Offline';
    let receiving = Promise.resolve();
    let pending: Uint8Array[] = [];
    let nextAwareness: Uint8Array | null = null;
    let lastInput = Date.now();
    let idle = false;
    let sendTimer: number | null = null;

    const updateState = (access?: Role | 'removed'): void => {
      const accounts = new Map(
        [...others.values()].map((person) => [person.accountId, person]),
      );
      setState((old) => ({
        ...old,
        status,
        others: [...accounts.values()],
        ...(access === undefined ? {} : { access }),
      }));
    };

    const canSendText = (): boolean => role !== 'viewer' && canEdit();

    function tryJoin(): void {
      if (!active || joined || retired || !navigator.onLine) return;
      stream?.sendLive({
        kind: 'joinNote',
        roomId,
        workspaceId,
        fileId,
        epoch: epoch ?? 1,
        clientId,
      });
    }

    function sendSync(
      kind: 'state' | 'vector' | 'update',
      bytes: Uint8Array,
    ): void {
      const frame = encodeNoteSync({ kind, bytes });
      if (frame.byteLength <= maxSyncBytes)
        stream?.sendLive({
          kind: 'sendNoteSync',
          roomId,
          payload: base64(frame),
        });
    }

    function reset(): void {
      joined = false;
      sequence = 0;
      pending = [];
      nextAwareness = null;
      others.clear();
      note.clearRemoteAwareness();
      status = navigator.onLine ? 'Reconnecting' : 'Offline';
      updateState();
    }

    const schedule = (): void => {
      if (sendTimer !== null) return;
      sendTimer = window.setTimeout(() => {
        sendTimer = null;
        const updates = pending;
        const awareness = nextAwareness;
        pending = [];
        nextAwareness = null;
        if (!joined) return;
        if (awareness !== null && awareness.byteLength <= maxAwarenessBytes)
          stream.sendLive({
            kind: 'sendNoteAwareness',
            roomId,
            payload: base64(awareness),
          });
        if (updates.length > 0 && canSendText())
          void flush()
            .then(() => {
              if (active && joined && canSendText())
                sendSync('update', mergeDocumentUpdates(updates));
            })
            .catch(() => {});
      }, liveSendMs);
    };

    function setIdle(value: boolean): void {
      if (idle === value) return;
      idle = value;
      note.setLiveIdle(value);
    }
    const markActive = (): void => {
      lastInput = Date.now();
      setIdle(false);
    };
    const idleTimer = window.setInterval(
      () => setIdle(document.hidden || Date.now() - lastInput > 45_000),
      5000,
    );
    window.addEventListener('pointerdown', markActive);
    window.addEventListener('keydown', markActive);

    const offUpdates = note.onLiveLocal((update) => {
      if (!joined || !canSendText()) return;
      pending.push(update);
      schedule();
    });
    const offAwareness = note.onAwarenessLocal((update) => {
      if (!joined) return;
      nextAwareness = update;
      schedule();
    });

    const offMessage = stream.onLive((message) => {
      if (!active) return;
      if (message === null) {
        reset();
        return;
      }
      if (message.kind === 'ready') {
        reset();
        tryJoin();
        return;
      }
      if (!('roomId' in message) || message.roomId !== roomId) return;
      if (message.kind === 'noteJoined') {
        joined = true;
        sequence = 0;
        role = message.role;
        updateState(role);
        sendSync('vector', note.stateVector());
        note.setLiveUser(account.name ?? 'Member', 'var(--color-accent)');
      } else if (message.kind === 'noteStopped') {
        reset();
        if (message.reason === 'forbidden') {
          retired = true;
          reload();
        }
      } else if (message.kind === 'noteAccess') {
        if (message.access === 'removed') {
          retired = true;
          reset();
        } else role = message.access;
        updateState(message.access);
        reload();
      } else if (message.kind === 'noteAwareness') {
        const bytes = bytesOfBase64(message.payload);
        const entries = decodeNoteAwareness(bytes, 32);
        if (entries === null) return;
        note.receiveAwareness(bytes);
        for (const entry of entries) {
          if (entry.state === null) {
            others.delete(entry.clientId);
            continue;
          }
          const other = readProperty(entry.state, 'accountId');
          const name = readProperty(entry.state, 'displayName');
          const mode = readProperty(entry.state, 'mode');
          const slot = readProperty(entry.state, 'slot');
          if (
            typeof other === 'string' &&
            other !== account.accountId &&
            typeof name === 'string' &&
            typeof slot === 'number' &&
            typeof mode === 'string'
          )
            others.set(entry.clientId, {
              accountId: other,
              name,
              mode,
              idle: readProperty(entry.state, 'idle') === true,
              slot,
              clientId: entry.clientId,
            });
        }
        updateState();
      } else if (message.kind === 'noteSync') {
        if (message.sequence !== sequence + 1) {
          stream.sendLive({ kind: 'leaveNote', roomId });
          reset();
          return;
        }
        sequence = message.sequence;
        const frame = decodeNoteSync(bytesOfBase64(message.payload));
        if (frame === null) return;
        receiving = receiving
          .then(async () => {
            if (!active || !joined) return;
            if (frame.kind === 'vector') {
              if (!canSendText()) return;
              await flush();
              if (!active || !joined || !canSendText()) return;
              const update = note.liveDelta(frame.bytes);
              if (updateActors(update).clientIds.every((id) => id === clientId))
                sendSync('state', update);
              return;
            }
            await persist(frame.bytes);
            if (!active || !joined) return;
            note.applyLive(frame.bytes);
            if (frame.kind === 'state') {
              status = 'Live';
              updateState();
            }
          })
          .catch(() => {
            if (active) {
              stream.sendLive({ kind: 'leaveNote', roomId });
              reset();
            }
          });
      }
    });
    const online = (): void => {
      reset();
      tryJoin();
    };
    const offline = (): void => {
      reset();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const retry = window.setInterval(tryJoin, liveRetryMs);
    tryJoin();
    return () => {
      active = false;
      stream.sendLive({ kind: 'leaveNote', roomId });
      offUpdates();
      offAwareness();
      offMessage();
      window.clearInterval(retry);
      window.clearInterval(idleTimer);
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
      if (sendTimer !== null) window.clearTimeout(sendTimer);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      note.clearRemoteAwareness();
      release();
    };
  }, [
    stream,
    account?.accountId,
    canEdit,
    epoch,
    workspaceId,
    fileId,
    hold,
    persist,
    flush,
    reload,
  ]);

  return state;
}

export function NotePresence({
  people,
}: {
  readonly people: readonly Person[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [desktop, setDesktop] = useState(
    () => window.matchMedia('(min-width: 64rem)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(min-width: 64rem)');
    const change = (): void => setDesktop(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  if (people.length === 0) return null;
  const label = people.map((person) => person.name).join(', ');
  const close = (): void => {
    setOpen(false);
    anchor.current?.focus();
  };
  const list = (
    <Stack role="list">
      {people.map((person) => {
        const mode = person.mode === 'viewing' ? 'Viewing' : 'Editing';
        return (
          <ListRow
            key={person.accountId}
            label={person.name}
            help={person.idle ? `${mode} · Idle` : mode}
            leading={
              <PresenceAvatar slot={person.slot} idle={person.idle}>
                {initialOf(person.name)}
              </PresenceAvatar>
            }
          />
        );
      })}
    </Stack>
  );
  return (
    <>
      <Button
        variant="ghost"
        size="compact"
        buttonRef={anchor}
        ariaHasPopup="dialog"
        ariaExpanded={open}
        label={`People in this note: ${label}`}
        title={label}
        onClick={() => setOpen(!open)}
      >
        <Inline gap={1}>
          <span className="inline-flex -space-x-1">
            {people.slice(0, 4).map((person, index) => (
              <span
                key={person.accountId}
                className={
                  index === 0 ? 'inline-flex' : 'inline-flex max-compact:hidden'
                }
              >
                <PresenceAvatar slot={person.slot} idle={person.idle} ring>
                  {initialOf(person.name)}
                </PresenceAvatar>
              </span>
            ))}
          </span>
          {people.length > 4 ? (
            <Pill className="max-compact:hidden">+{people.length - 4}</Pill>
          ) : null}
          {people.length > 1 ? (
            <span className="hidden text-small text-muted max-compact:inline">
              {people.length}
            </span>
          ) : null}
        </Inline>
      </Button>
      {open && desktop ? (
        <Popover
          id="note-presence"
          anchor={anchor}
          align="end"
          label="People in this note"
          onClose={close}
        >
          {list}
        </Popover>
      ) : (
        <Dialog
          open={open}
          onClose={close}
          titleId="note-presence"
          title="People in this note"
        >
          <DialogBody>{list}</DialogBody>
        </Dialog>
      )}
    </>
  );
}

export function ViewerNotice(): ReactNode {
  return (
    <Stack className={noteColumnInset}>
      <Stack align="center" className={noteColumnFineInset}>
        <div className={noteColumnClassName()}>
          <Notice message="View only. You can read this note and its history." />
        </div>
      </Stack>
    </Stack>
  );
}

export function useNoteAccess(
  view: { current: EditorView | null },
  viewerRole: boolean,
) {
  const [liveRole, setLiveRole] = useState<Role | 'removed'>();
  const readOnly =
    viewerRole || liveRole === 'viewer' || liveRole === 'removed';
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const wasWritable = useRef(!readOnly);
  useLayoutEffect(() => {
    if (view.current !== null) setEditorReadOnly(view.current, readOnly);
    if (!readOnly) wasWritable.current = true;
  }, [view, readOnly]);
  return {
    readOnly,
    readOnlyRef,
    setLiveRole,
    changedToViewer: readOnly && wasWritable.current,
  };
}

export function useEditorLiveBinding(input: {
  readonly workspaceId: string;
  readonly fileId: string;
  readonly epoch: number | null;
  readonly hold: () => { note: BoundNote; release: () => void };
  readonly store: LocalStore;
  readonly accountId: string;
  readonly work: Pick<NoteWork, 'flush' | 'frozen'>;
  readonly readOnly: { readonly current: boolean };
  readonly freeze: () => Promise<void>;
  readonly onAccess: (role: Role | 'removed' | undefined) => void;
}): LiveState {
  const {
    workspaceId,
    fileId,
    epoch,
    hold,
    store,
    accountId,
    work,
    readOnly,
    freeze,
    onAccess,
  } = input;
  const freezeRef = useRef(freeze);
  freezeRef.current = freeze;
  const persist = useCallback(
    async (bytes: Uint8Array) => {
      if (!work.frozen())
        await store.mergeNoteWork(
          accountId,
          workspaceId,
          fileId,
          epoch ?? 1,
          bytes,
        );
    },
    [store, accountId, workspaceId, fileId, epoch, work],
  );
  const canEdit = useCallback(
    () => !work.frozen() && !readOnly.current,
    [work, readOnly],
  );
  const note = useLiveNote({
    workspaceId,
    fileId,
    epoch,
    hold,
    persist,
    flush: work.flush,
    canEdit,
  });
  useLayoutEffect(() => {
    onAccess(note.access);
  }, [note.access, onAccess]);
  useEffect(
    () => registerAccessFlush(workspaceId, () => freezeRef.current()),
    [workspaceId],
  );
  return note;
}

export function NoteLiveStatus({
  note,
  enabled,
  changedToViewer,
}: {
  readonly note: LiveState;
  readonly enabled: boolean;
  readonly changedToViewer: boolean;
}): ReactNode {
  if (!enabled && !changedToViewer) return null;
  const label = changedToViewer
    ? 'Your role changed to Viewer. Editing is off.'
    : note.status === 'Live'
      ? 'Live'
      : note.status === 'Offline'
        ? 'Offline. Your edits merge when you reconnect.'
        : 'Reconnecting. Your edits are safe on this device.';
  return (
    <Inline as="span" gap={1} align="center" role="status">
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${changedToViewer ? 'bg-danger' : note.status === 'Live' ? 'bg-success' : 'bg-muted'}`}
      />
      <span>{label}</span>
    </Inline>
  );
}
