/**
 * Context boundaries of the folder dialogs and the folder fields of Settings.
 * The tree picker, the dialogs and the move plan stay the built application
 * code; only the store write and the settings hooks are replaced.
 */
import type { NoteSummary } from '../../../apps/web/src/lib/note-list.ts';

export const moves: { workspaceId: string; moves: readonly unknown[] }[] = [];
export const templateSaves: { folder: string }[] = [];
export const dailySaves: { folder: string }[] = [];

/** One listed note at a path. */
function note(fileId: string, path: string): NoteSummary {
  return {
    fileId,
    path,
    createdAt: '2026-10-27T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
    localOnly: false,
    unsent: false,
  };
}

export const folderNotes: readonly NoteSummary[] = [
  note('a', 'Projects/Launch/Brief.md'),
  note('b', 'Projects/Research/Notes.md'),
  note('c', 'Templates/Meeting.md'),
  note('d', 'Daily/2026-10-27.md'),
  note('e', 'Reading list.md'),
];

export async function applyMoves(
  _store: unknown,
  _accountId: string,
  workspaceId: string,
  planned: readonly unknown[],
): Promise<string | null> {
  moves.push({ workspaceId, moves: planned });
  return null;
}

export function useFiles() {
  return {
    notes: folderNotes,
    emptyFolders: [],
    loading: false,
    limitNotice: null,
  };
}

export function useTemplates() {
  return {
    settings: { status: 'ready', settings: { folder: 'Templates' } },
    save: (next: { folder: string }) => templateSaves.push(next),
    saveProblem: null,
  };
}

export function useDailyNotes() {
  return {
    settings: {
      status: 'ready',
      settings: {
        folder: 'Daily',
        format: 'YYYY-MM-DD',
        templateFileId: null,
        openOnStart: false,
      },
    },
    save: (next: { folder: string }) => dailySaves.push(next),
    saveProblem: null,
  };
}

export function today() {
  return { year: 2026, month: 10, day: 27 };
}
