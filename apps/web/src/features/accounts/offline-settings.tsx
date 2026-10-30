/** The offline section of Settings owns its mounted read and write lifecycle. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LocalStore } from '@notesapp/sync';
import { Button, LoadingState, Notice } from '@notesapp/ui';
import {
  offlineTargets,
  allOfflineTargetsPinned,
  createOfflineWriteGate,
  offlineProblemFor,
  type OfflineProblem,
} from '../../lib/offline-files.ts';
import { sectionOf, settingsSections } from '../../lib/page-sections.ts';
import { SettingsSection, SettingSwitchRow } from './settings-section.tsx';

/** The storage operations used by this section. */
export type OfflineSettingsStore = Pick<
  LocalStore,
  | 'listAcceptedFiles'
  | 'isAttachmentPinned'
  | 'isHistoryPinned'
  | 'setAttachmentPinned'
  | 'setHistoryPinned'
>;

/** What is kept on this device for use without a connection. */
type OfflineChoices = {
  readonly images: boolean;
  readonly history: boolean;
};

/** Whether this device could state what it keeps for offline use. */
type OfflineStatus = 'loading' | 'ready' | 'failed';

/**
 * Reads and writes what this device keeps for offline use.
 *
 * Notes are always kept. Images and older versions are larger, so each one
 * is a choice. A choice is on when every known item of that kind is already
 * kept, which is what the store records.
 *
 * A read that fails is not a pair of choices that are off (record 0038). The
 * status says that the read failed, so the card can name the failure instead
 * of showing two boxes that state something false about this device.
 */
function useOfflineChoices(
  store: OfflineSettingsStore | null,
  accountId: string | null,
  workspaceId: string | null,
): {
  readonly retry: () => void;
  readonly choices: OfflineChoices;
  readonly status: OfflineStatus;
  readonly setChoice: (kind: keyof OfflineChoices, keep: boolean) => void;
  readonly available: OfflineChoices;
  readonly busy: boolean;
  readonly problem: string;
} {
  const [choices, setChoices] = useState<OfflineChoices>({
    images: false,
    history: false,
  });
  const [status, setStatus] = useState<OfflineStatus>('loading');
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const writeExclusive = useRef(createOfflineWriteGate());
  const [problem, setProblem] = useState<OfflineProblem | null>(null);
  const currentScope = useRef({ store, accountId, workspaceId });
  useEffect(() => {
    currentScope.current = { store, accountId, workspaceId };
    setProblem(null);
  }, [store, accountId, workspaceId]);
  const [available, setAvailable] = useState<OfflineChoices>({
    images: false,
    history: false,
  });

  useEffect(() => {
    if (store === null || accountId === null || workspaceId === null) {
      setStatus('loading');
      return;
    }
    const activeStore = store;
    let cancelled = false;
    async function read(): Promise<void> {
      try {
        const files = await activeStore.listAcceptedFiles(
          accountId ?? '',
          workspaceId ?? '',
        );
        const images = offlineTargets(files, 'images');
        const versions = offlineTargets(files, 'history');
        const allImages = await allOfflineTargetsPinned(images, (target) =>
          activeStore.isAttachmentPinned(
            accountId ?? '',
            workspaceId ?? '',
            target,
          ),
        );
        const allHistory = await allOfflineTargetsPinned(versions, (target) =>
          activeStore.isHistoryPinned(
            accountId ?? '',
            workspaceId ?? '',
            target,
          ),
        );
        if (cancelled) return;
        setChoices({ images: allImages, history: allHistory });
        setAvailable({
          images: images.length > 0,
          history: versions.length > 0,
        });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    }
    void read();
    return () => {
      cancelled = true;
    };
  }, [store, accountId, workspaceId, generation]);

  const setChoice = useCallback(
    (kind: keyof OfflineChoices, keep: boolean): void => {
      if (store === null || accountId === null || workspaceId === null) return;

      const activeStore = store;
      const activeAccount = accountId;
      const activeWorkspace = workspaceId;
      void writeExclusive.current(async () => {
        setBusy(true);
        setProblem(null);
        setChoices((current) => ({ ...current, [kind]: keep }));
        try {
          const files = await activeStore.listAcceptedFiles(
            activeAccount,
            activeWorkspace,
          );
          for (const target of offlineTargets(files, kind)) {
            if (kind === 'images') {
              await activeStore.setAttachmentPinned(
                activeAccount,
                activeWorkspace,
                target,
                keep,
              );
            } else {
              await activeStore.setHistoryPinned(
                activeAccount,
                activeWorkspace,
                target,
                keep,
              );
            }
          }
        } catch {
          const failure = {
            accountId: activeAccount,
            workspaceId: activeWorkspace,
            message:
              'This device could not change offline storage. Check the available space and try again.',
          };
          const scope = currentScope.current;
          if (
            scope.store === activeStore &&
            offlineProblemFor(failure, scope.accountId, scope.workspaceId) !==
              ''
          )
            setProblem(failure);
        } finally {
          setBusy(false);
          setGeneration((value) => value + 1);
        }
      });
    },
    [store, accountId, workspaceId],
  );

  return {
    choices,
    retry: () => {
      setStatus('loading');
      setGeneration((value) => value + 1);
    },
    status,
    setChoice,
    available,
    busy,
    problem: offlineProblemFor(problem, accountId, workspaceId),
  };
}

/** This component stays mounted when Settings changes workspace. */
export function OfflineSettingsSection({
  store,
  accountId,
  workspaceId,
}: {
  readonly store: OfflineSettingsStore | null;
  readonly accountId: string | null;
  readonly workspaceId: string | null;
}): ReactNode {
  const offline = useOfflineChoices(store, accountId, workspaceId);
  return (
    <SettingsSection
      section={sectionOf(settingsSections, 'offline')}
      rows
      description="Your notes are always kept on this device. Images and older versions take more space, so you choose whether to keep them too."
    >
      {offline.status === 'failed' ? (
        <>
          <Notice
            tone="problem"
            message="Can't read offline settings. Try again."
          />
          <Button variant="secondary" onClick={offline.retry}>
            Try again
          </Button>
        </>
      ) : offline.status === 'loading' ? (
        // A choice that nothing has read yet is not a choice that is off
        // (record 0038), and the `Checkbox` primitive states no waiting
        // state, so the section shows the shape of the two rows instead.
        <LoadingState
          shape="list"
          rows={2}
          label="What this device keeps offline is loading."
        />
      ) : (
        <div className="flex flex-col">
          <SettingSwitchRow
            label="Images"
            help={
              offline.available.images ? 'Uses more space' : 'No images yet'
            }
            checked={offline.choices.images}
            disabled={offline.busy || !offline.available.images}
            onChange={(keep) => {
              offline.setChoice('images', keep);
            }}
          />
          <SettingSwitchRow
            label="Older versions"
            help={
              offline.available.history
                ? 'Uses more space'
                : 'No older versions yet'
            }
            checked={offline.choices.history}
            disabled={offline.busy || !offline.available.history}
            onChange={(keep) => {
              offline.setChoice('history', keep);
            }}
          />
        </div>
      )}
      {offline.problem === '' ? null : (
        <Notice tone="problem" message={offline.problem} />
      )}
    </SettingsSection>
  );
}
