import { useCallback, useState } from 'react';

/** Keeps each workspace's creation failure until its own successful action. */
export function useWorkspaceProblem(workspaceId: string): {
  readonly problem: string | null;
  readonly report: (message: string | null) => void;
} {
  const [problems, setProblems] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const report = useCallback(
    (message: string | null): void => {
      setProblems((current) => {
        if ((current.get(workspaceId) ?? null) === message) return current;
        const next = new Map(current);
        if (message === null) next.delete(workspaceId);
        else next.set(workspaceId, message);
        return next;
      });
    },
    [workspaceId],
  );
  return { problem: problems.get(workspaceId) ?? null, report };
}
