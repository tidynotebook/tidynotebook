/**
 * The save facts of the open note, which change no render (record 0175).
 *
 * They decide three things that the screen writes when one of them changes:
 * the save state on the root of the note, for automation; the facts of the
 * frame, through the store of `save-status.tsx`; and the reload guard. Each
 * reads references only, so a call from the first render stays right, and an
 * unchanged value writes nothing to the page.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type {
  FileSaveSnapshot,
  LocalStorageErrorKind,
  LocalStore,
} from '@notesapp/sync';
import {
  noteSaveReport,
  resolveSaveState,
  useNoteSavePublisher,
  useUnsafeReloadGuard,
} from './save-status.tsx';

/** The save facts of one open note and the call that states them. */
export type NoteSaveFacts = {
  /** Reads durable save facts with the checkpoint sequence at read start. */
  readonly readSnapshot: (source: {
    readonly store: LocalStore;
    readonly accountId: string;
    readonly workspaceId: string;
    readonly fileId: string;
  }) => Promise<FileSaveSnapshot | null>;
  /** The sequence that the store holds, to tell text that no write took. */
  readonly writtenSequenceRef: { current: number };
  /** Records the sequence that this editor put in a checkpoint. */
  readonly checkpointTaken: (sequence: number) => void;
  /** Claims one version of an opened recovery draft before any new typing. */
  readonly claimRecoveredDraft: (snapshot: FileSaveSnapshot) => boolean;
  /** The cause of a failed local write, which the note states. */
  readonly storageError: LocalStorageErrorKind | null;
  readonly setStorageError: (kind: LocalStorageErrorKind | null) => void;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  /** States the facts after one of them changed. */
  readonly showSaveFacts: { readonly current: () => void };
};

/** Holds the save facts of the note whose sequence `sequenceRef` counts. */
export function useNoteSaveFacts(
  sequenceRef: { readonly current: number },
  initialSequence: number,
  openedDraft = false,
): NoteSaveFacts {
  const saveSnapshotRef = useRef<FileSaveSnapshot | null>(null);
  const lastSavedAtRef = useRef<string | null>(null);
  const writtenSequenceRef = useRef(initialSequence);
  const checkpointedSequenceRef = useRef(initialSequence);
  const snapshotSequenceRef = useRef(initialSequence);
  const snapshotReadGenerationRef = useRef(0);
  const recoveryRequestedRef = useRef(false);
  useLayoutEffect(
    () => () => {
      snapshotReadGenerationRef.current += 1;
    },
    [],
  );
  const [storageError, setStorageErrorState] =
    useState<LocalStorageErrorKind | null>(null);
  const storageErrorRef = useRef<LocalStorageErrorKind | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const publishSave = useNoteSavePublisher();
  const guardReload = useUnsafeReloadGuard();

  const showSaveFacts = useRef((): void => {});
  showSaveFacts.current = (): void => {
    const snapshot = saveSnapshotRef.current;
    const state = resolveSaveState({
      queueState: snapshot?.queueState ?? null,
      storageError: storageErrorRef.current,
      hasUncheckpointedDraft: snapshot?.hasUncheckpointedDraft ?? true,
      acceptedHeadRevisionId: snapshot?.acceptedHeadRevisionId ?? null,
      localHeadRevisionId: snapshot?.localHeadRevisionId ?? null,
    });
    const root = rootRef.current;
    if (root !== null && root.dataset.saveState !== state)
      root.dataset.saveState = state;
    publishSave(
      noteSaveReport({
        pendingSave:
          sequenceRef.current !== writtenSequenceRef.current ||
          sequenceRef.current !== snapshotSequenceRef.current ||
          state !== 'saved-server',
        storageError: storageErrorRef.current,
        lastSavedAt: lastSavedAtRef.current,
      }),
    );
    // The text is the only copy until a write takes it, and it is the only
    // copy again when storage fails. Both cases block an unsafe reload. A
    // queued save is durable on this device, so it never blocks one.
    guardReload(
      sequenceRef.current !== writtenSequenceRef.current ||
        storageErrorRef.current !== null,
    );
  };

  const setStorageError = useRef((kind: LocalStorageErrorKind | null): void => {
    if (storageErrorRef.current === kind) return;
    storageErrorRef.current = kind;
    setStorageErrorState(kind);
    showSaveFacts.current();
  }).current;

  return {
    readSnapshot: async ({ store, accountId, workspaceId, fileId }) => {
      const generation = ++snapshotReadGenerationRef.current;
      // An older snapshot read cannot prove that a later checkpoint reached
      // the server, even if its promise completes after that checkpoint.
      const sequence = checkpointedSequenceRef.current;
      const [snapshot, checkpoints] = await Promise.all([
        store.readFileSaveSnapshot(accountId, workspaceId, fileId),
        store.listCheckpoints(accountId, workspaceId, fileId),
      ]);
      if (generation !== snapshotReadGenerationRef.current) return null;
      saveSnapshotRef.current = snapshot;
      snapshotSequenceRef.current = sequence;
      lastSavedAtRef.current =
        checkpoints
          .filter((entry) => !entry.deleted)
          .map((entry) => entry.clientTime)
          .sort()
          .at(-1) ?? null;
      return snapshot;
    },
    writtenSequenceRef,
    checkpointTaken: (sequence) => {
      checkpointedSequenceRef.current = Math.max(
        checkpointedSequenceRef.current,
        sequence,
      );
    },
    claimRecoveredDraft: (snapshot) => {
      if (
        !openedDraft ||
        recoveryRequestedRef.current ||
        snapshot.deleted ||
        !snapshot.hasUncheckpointedDraft ||
        sequenceRef.current !== initialSequence
      )
        return false;
      recoveryRequestedRef.current = true;
      return true;
    },
    storageError,
    setStorageError,
    rootRef,
    showSaveFacts,
  };
}
