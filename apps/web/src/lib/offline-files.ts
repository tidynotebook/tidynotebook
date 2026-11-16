import type { LocalStore } from '@notesapp/sync';

/** The current file states used by the offline controls. */
type OfflineFile = Pick<
  Awaited<ReturnType<LocalStore['listAcceptedFiles']>>[number],
  'kind' | 'deleted' | 'acceptedHeadDigest' | 'acceptedHeadRevisionId'
>;

/** The two kinds of current files that can be kept on this device. */
export type OfflineKind = 'images' | 'history';

/** Empty and deleted files cannot make a pin control available or checked. */
export function offlineTargets(
  files: readonly OfflineFile[],
  kind: OfflineKind,
): readonly string[] {
  return files.flatMap((file) => {
    if (file.deleted) return [];
    const target =
      kind === 'images'
        ? file.kind === 'attachment'
          ? file.acceptedHeadDigest
          : null
        : file.acceptedHeadRevisionId;
    return target === null ? [] : [target];
  });
}

/** A control is checked only when every current target is kept. */
export async function allOfflineTargetsPinned(
  targets: readonly string[],
  isPinned: (target: string) => Promise<boolean>,
): Promise<boolean> {
  if (targets.length === 0) return false;
  for (const target of targets) if (!(await isPinned(target))) return false;
  return true;
}

/** Only completion of a write releases this gate, including after failure. */
export function createOfflineWriteGate(): (
  write: () => Promise<void>,
) => Promise<boolean> {
  let writing = false;
  return async (write) => {
    if (writing) return false;
    writing = true;
    try {
      await write();
      return true;
    } finally {
      writing = false;
    }
  };
}

/** A write failure belongs only to the account and workspace that started it. */
export type OfflineProblem = {
  readonly accountId: string;
  readonly workspaceId: string;
  readonly message: string;
};

/** A late failure from another scope must never appear in this scope. */
export function offlineProblemFor(
  problem: OfflineProblem | null,
  accountId: string | null,
  workspaceId: string | null,
): string {
  return problem !== null &&
    problem.accountId === accountId &&
    problem.workspaceId === workspaceId
    ? problem.message
    : '';
}
