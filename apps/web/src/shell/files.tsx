/**
 * The one file list of the open notes area.
 *
 * Every screen that needs the notes reads this provider. The list operation
 * therefore runs once for the area instead of once for the sidebar and once
 * for the note list, and both surfaces always agree.
 *
 * The list holds notes only. An attachment is a stored file of the same
 * workspace, but it is not a note: it has no editor and no name that a
 * person chose, so it never reaches the tree, the note list, or the command
 * palette.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { listFiles, type WorkspaceFileSummary } from '@notesapp/api-client';
import { maxListedFiles } from '@notesapp/core';
import type { LocalFileSummary, LocalStore } from '@notesapp/sync';
import { problemMessage, useLocalStore, useSession } from '../app.tsx';
import { useLocalQuery } from '../local-state.ts';
import {
  pruneEmptyFolders,
  removeEmptyFolders as removeEmptyFoldersPure,
  rewriteEmptyFolders,
  withEmptyFolder,
} from '../lib/empty-folders.ts';
import {
  fileListLimitNotice,
  loadBoundedFiles,
  type BoundedFiles,
} from '../lib/file-load.ts';
import { shouldRevalidate } from '../lib/revalidate.ts';
import { mergeNotes, type NoteSummary } from '../lib/note-list.ts';
import { folderPaths } from '../lib/note-name.ts';

/** What every screen reads about the notes of the open area. */
export type FilesValue = {
  readonly notes: readonly NoteSummary[];
  readonly loading: boolean;
  /** Every folder that the note paths imply, sorted by path. */
  readonly folders: readonly string[];
  /**
   * Folders that a person made and that hold no note yet.
   *
   * A folder is only a part of a note path, so the server cannot describe an
   * empty one. This device remembers a folder until the person deletes it,
   * and no placeholder note is created.
   */
  readonly emptyFolders: readonly string[];
  /** Remembers one more folder on this device. */
  readonly addEmptyFolder: (folder: string) => void;
  /** Follows a folder rename or move with the remembered empty folders. */
  readonly moveEmptyFolders: (fromFolder: string, toFolder: string) => void;
  /** Forgets a folder and everything below it after a folder left the tree. */
  readonly removeEmptyFolders: (folder: string) => void;
  /**
   * What the person reads when the area holds more notes than the list.
   *
   * The value is `null` while the list holds every note. The tree shows the
   * sentence as it is, so a person always knows when the list is shorter than
   * the area, and how to reach a note that is not in it.
   */
  readonly limitNotice: string | null;
  /** Reads the server list again, for example after a restore. */
  readonly reload: () => void;
};

const FilesContext = createContext<FilesValue>({
  notes: [],
  loading: true,
  folders: [],
  emptyFolders: [],
  addEmptyFolder: () => {},
  moveEmptyFolders: () => {},
  removeEmptyFolders: () => {},
  limitNotice: null,
  reload: () => {},
});

/** Reads the notes of the open area. */
export function useFiles(): FilesValue {
  return useContext(FilesContext);
}

/** The number of rows that one list call asks for. */
const listPageSize = 100;

/**
 * The live notes of the area, in the order of the folder tree, up to the
 * bound.
 *
 * The server sorts and pages the listing, so each page continues the
 * previous one through its cursor instead of scanning from the front. The
 * sidebar shows a folder tree, so it asks for the path order.
 *
 * The loop stops at `maxListedFiles`, which is the one bound that the server
 * and this device share. A mount therefore makes a small, fixed number of
 * calls, and it holds a list of a known size. A bigger area keeps its other
 * notes: search reads the server, so it opens a note that this list left out.
 */
function loadFiles(
  workspaceId: string,
): Promise<BoundedFiles<WorkspaceFileSummary>> {
  return loadBoundedFiles<WorkspaceFileSummary>(async (cursor) => {
    const page: { readonly cursor?: string } =
      cursor === null ? {} : { cursor };
    const result = await listFiles({
      path: { workspaceId },
      query: { ...page, limit: listPageSize, sort: 'path' },
    });
    if (result.error !== undefined || result.data === undefined)
      throw new Error(problemMessage(result.error));
    return { files: result.data.files, nextCursor: result.data.nextCursor };
  }, maxListedFiles);
}

/** The list before the first answer of the server, and after a failure. */
const noServerFiles: BoundedFiles<WorkspaceFileSummary> = {
  files: [],
  reachedLimit: false,
};

/** Publishes the one note list of the open area to every screen below. */
export function FilesProvider({
  workspaceId,
  children,
}: {
  readonly workspaceId: string;
  readonly children: ReactNode;
}): ReactNode {
  const session = useSession();
  const store = useLocalStore();
  const accountId = session.account?.accountId ?? null;
  const [serverFiles, setServerFiles] =
    useState<BoundedFiles<WorkspaceFileSummary>>(noServerFiles);
  // The list of this area has been read at least once. Only the first read
  // shows a placeholder; every later read is a background refresh that keeps
  // the rows a person is looking at.
  const [answered, setAnswered] = useState(false);
  const [generation, setGeneration] = useState(0);
  const lastReadAt = useRef<number | null>(null);
  const emptyLocalFiles = useMemo<readonly LocalFileSummary[]>(() => [], []);
  const localFiles = useLocalQuery(
    store.store,
    accountId,
    workspaceId,
    (activeStore: LocalStore, accountId: string, activeWorkspace: string) =>
      activeStore.listLocalFiles(accountId, activeWorkspace),
    emptyLocalFiles,
    (change) =>
      change.kind === 'draft' ||
      change.kind === 'queue' ||
      change.kind === 'file' ||
      change.kind === 'purge' ||
      change.kind === 'reset',
  );

  /** Reads the accepted server list again. */
  const reload = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  /**
   * Reads the server list again, at most once per quiet period.
   *
   * A window focus and a reconnect both arrive as often as a person switches
   * windows, so the rule in `lib/revalidate.ts` bounds them.
   */
  const revalidate = useCallback(() => {
    if (!shouldRevalidate(lastReadAt.current, Date.now())) return;
    reload();
  }, [reload]);

  // The area changed, so nothing that is on screen describes it. This is the
  // one moment the list is emptied and the placeholder comes back.
  useEffect(() => {
    setAnswered(false);
    setServerFiles(noServerFiles);
    lastReadAt.current = null;
  }, [workspaceId]);

  // A purge removes the local row that could mask an old server list. Read
  // the server list again when the store reports that exact transition. A
  // focus or reconnect is the safety path when another tab missed the event.
  useEffect(() => {
    const activeStore = store.store;
    if (activeStore === null || accountId === null) return;
    const unsubscribe = activeStore.subscribe((change) => {
      if (
        change.accountId === accountId &&
        change.workspaceId === workspaceId &&
        change.kind === 'purge'
      )
        reload();
    });
    window.addEventListener('focus', revalidate);
    window.addEventListener('online', revalidate);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('online', revalidate);
    };
  }, [store.store, accountId, workspaceId, reload, revalidate]);

  // The read itself. It never empties the list first and it never puts the
  // placeholder back, so a person who returns to the window keeps reading the
  // tree while the refresh runs behind it. A failed refresh keeps the rows
  // this device already had, because an empty tree is not what a lost
  // connection means.
  useEffect(() => {
    let cancelled = false;
    lastReadAt.current = Date.now();
    void loadFiles(workspaceId)
      .then((loaded) => {
        if (!cancelled) setServerFiles(loaded);
      })
      .catch(() => {
        // The local rows stay. The sync state line reports the connection.
      })
      .finally(() => {
        if (!cancelled) {
          lastReadAt.current = Date.now();
          setAnswered(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, generation]);

  const notes = useMemo(
    () => mergeNotes(serverFiles.files, localFiles.value),
    [serverFiles.files, localFiles.value],
  );

  // The notice counts the server rows only. A note that this device holds and
  // the server does not is in the list whatever the bound is, so it is not a
  // part of the size that the sentence states.
  const limitNotice = useMemo(
    () =>
      fileListLimitNotice(serverFiles.files.length, serverFiles.reachedLimit),
    [serverFiles],
  );

  const empty = useEmptyFolders(
    workspaceId,
    useMemo(() => notes.map((note) => note.path), [notes]),
  );

  const loading = !answered;

  const value = useMemo<FilesValue>(
    () => ({
      notes,
      loading,
      folders: folderPaths(notes.map((note) => note.path)),
      emptyFolders: empty.emptyFolders,
      addEmptyFolder: empty.addEmptyFolder,
      moveEmptyFolders: empty.moveEmptyFolders,
      removeEmptyFolders: empty.removeEmptyFolders,
      limitNotice,
      reload,
    }),
    [notes, loading, empty, limitNotice, reload],
  );

  return (
    <FilesContext.Provider value={value}>{children}</FilesContext.Provider>
  );
}

const openFoldersKey = 'notesapp.open-folders:';

/** Reads the folders a person left open, without trusting the stored shape. */
function readOpenFolders(workspaceId: string): ReadonlySet<string> {
  try {
    const stored = window.localStorage.getItem(
      `${openFoldersKey}${workspaceId}`,
    );
    if (stored === null) return new Set();
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((entry) => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

/**
 * Keeps the open folders of the tree across refreshes and reloads.
 *
 * The state is a person choice, so a file list change never rewrites it. A
 * folder that the person collapsed stays collapsed when a keystroke changes
 * a local file summary, and it is still collapsed after a page reload.
 */
export function useOpenFolders(workspaceId: string): {
  readonly openFolders: ReadonlySet<string>;
  readonly toggleFolder: (path: string) => void;
  readonly openFolder: (path: string) => void;
} {
  const [openFolders, setOpenFolders] = useState<ReadonlySet<string>>(() =>
    readOpenFolders(workspaceId),
  );

  useEffect(() => {
    setOpenFolders(readOpenFolders(workspaceId));
  }, [workspaceId]);

  /** Stores the open set so a reload keeps the shape of the tree. */
  const remember = (next: ReadonlySet<string>): void => {
    try {
      window.localStorage.setItem(
        `${openFoldersKey}${workspaceId}`,
        JSON.stringify([...next]),
      );
    } catch {
      // The tree still works when browser preference storage fails.
    }
  };

  const toggleFolder = useCallback(
    (path: string): void => {
      setOpenFolders((current) => {
        const next = new Set(current);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        remember(next);
        return next;
      });
    },
    [workspaceId],
  );

  const openFolder = useCallback(
    (path: string): void => {
      if (path === '') return;
      setOpenFolders((current) => {
        if (current.has(path)) return current;
        const next = new Set(current);
        next.add(path);
        remember(next);
        return next;
      });
    },
    [workspaceId],
  );

  return { openFolders, toggleFolder, openFolder };
}

const emptyFoldersKey = 'notesapp.empty-folders:';

/** Reads the remembered empty folders, without trusting the stored shape. */
function readEmptyFolders(workspaceId: string): readonly string[] {
  try {
    const stored = window.localStorage.getItem(
      `${emptyFoldersKey}${workspaceId}`,
    );
    if (stored === null) return [];
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    return value.filter((entry) => typeof entry === 'string');
  } catch {
    return [];
  }
}

/**
 * Keeps the folders that hold no note across refreshes and reloads.
 *
 * The set lives next to the open folders of the tree, because both are
 * choices of this person on this device. A remembered folder stays in the
 * set while a note lives in it. It is hidden from `emptyFolders` until its
 * last note leaves, then it becomes visible without a timing-dependent write.
 */
function useEmptyFolders(
  workspaceId: string,
  notePaths: readonly string[],
): {
  readonly emptyFolders: readonly string[];
  readonly addEmptyFolder: (folder: string) => void;
  readonly moveEmptyFolders: (fromFolder: string, toFolder: string) => void;
  readonly removeEmptyFolders: (folder: string) => void;
} {
  const [remembered, setRemembered] = useState<readonly string[]>(() =>
    readEmptyFolders(workspaceId),
  );

  useEffect(() => {
    setRemembered(readEmptyFolders(workspaceId));
  }, [workspaceId]);

  /** Stores the set so a reload keeps the shape of the tree. */
  const remember = useCallback(
    (next: readonly string[]): void => {
      try {
        window.localStorage.setItem(
          `${emptyFoldersKey}${workspaceId}`,
          JSON.stringify(next),
        );
      } catch {
        // The tree still works when browser preference storage fails.
      }
    },
    [workspaceId],
  );

  const emptyFolders = useMemo(
    () => pruneEmptyFolders(remembered, notePaths),
    [remembered, notePaths],
  );

  const addEmptyFolder = useCallback(
    (folder: string): void => {
      setRemembered((current) => {
        const next = withEmptyFolder(current, folder);
        remember(next);
        return next;
      });
    },
    [remember],
  );

  const moveEmptyFolders = useCallback(
    (fromFolder: string, toFolder: string): void => {
      setRemembered((current) => {
        const next = rewriteEmptyFolders(current, fromFolder, toFolder);
        remember(next);
        return next;
      });
    },
    [remember],
  );

  const removeEmptyFolders = useCallback(
    (folder: string): void => {
      setRemembered((current) => {
        const next = removeEmptyFoldersPure(current, folder);
        remember(next);
        return next;
      });
    },
    [remember],
  );

  return {
    emptyFolders,
    addEmptyFolder,
    moveEmptyFolders,
    removeEmptyFolders,
  };
}
