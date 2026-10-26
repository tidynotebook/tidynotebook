import { useCallback, useRef, useState } from 'react';

/** Keeps each workspace's creation failure until its own successful action. */
export function useWorkspaceProblem(workspaceId: string): {
  readonly problem: string | null;
  readonly begin: () => (message: string | null) => void;
} {
  const [problems, setProblems] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const generations = useRef(new Map<string, number>());
  const begin = useCallback((): ((message: string | null) => void) => {
    const generation = (generations.current.get(workspaceId) ?? 0) + 1;
    generations.current.set(workspaceId, generation);
    return (message) => {
      setProblems((current) => {
        if (generations.current.get(workspaceId) !== generation) return current;
        if ((current.get(workspaceId) ?? null) === message) return current;
        const next = new Map(current);
        if (message === null) next.delete(workspaceId);
        else next.set(workspaceId, message);
        return next;
      });
    };
  }, [workspaceId]);
  return { problem: problems.get(workspaceId) ?? null, begin };
}
