import { Stack, Inset, Button, rowClassName } from '@notesapp/ui';
/**
 * The notes that link to the open note.
 *
 * The accepted index on the server is the authority, and this device derives
 * its own answer from the note bodies it already holds, so the panel answers
 * with no connection (record 0037). The two answers merge, and the panel marks
 * the list when only this device answered.
 *
 * The panel never reports an empty list for a read that did not happen
 * (record 0038). With no answer at all it says so and offers one action.
 *
 * Every row is the one clickable row of the product, from `rowClassName`, so
 * a link to a note here hovers, marks and focuses like a row of the folder
 * tree (record 0065).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { listBacklinks } from '@notesapp/api-client';
import { localBacklinks, type LocalStore } from '@notesapp/sync';

import { Link } from 'react-router';
import { displayNoteName } from '../../lib/note-name.ts';
import { useFiles } from '../../shell/files.tsx';
import {
  backlinksEmptyMessage,
  backlinksState,
  serverBacklinkRead,
  serverBacklinkRows,
  type BacklinkRow,
  type BacklinksState,
  type ServerBacklinkRead,
} from './backlink-rows.ts';
import { useOnline } from './save-status.tsx';

/** Reads the notes that link to one note, from this device and the server. */
function useBacklinks(
  store: LocalStore,
  accountId: string,
  workspaceId: string,
  fileId: string,
  read: ServerBacklinkRead,
  attempt: number,
): BacklinksState {
  const [state, setState] = useState<BacklinksState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    if (read === 'wait') return;
    const device = store
      .listSearchFiles(accountId, workspaceId)
      .then((files) => localBacklinks(fileId, files))
      .catch((): readonly BacklinkRow[] | null => null);
    // A request with no connection cannot answer, so the device answers alone
    // and the list is marked. A note that the server does not hold has no
    // server link, so nothing is asked. The hook reads again when either
    // fact changes, because `read` is one of its inputs.
    const server =
      read === 'ask'
        ? listBacklinks({ path: { workspaceId, fileId } }).then((answer) =>
            serverBacklinkRows({
              status: answer.response?.status ?? 0,
              rows:
                answer.error !== undefined || answer.data === undefined
                  ? null
                  : answer.data.backlinks.map((item): BacklinkRow => ({
                      fileId: item.fileId,
                      path: item.path,
                    })),
            }),
          )
        : Promise.resolve(read === 'empty' ? [] : null);
    void Promise.all([server, device]).then(([serverRows, deviceRows]) => {
      if (!cancelled) setState(backlinksState(serverRows, deviceRows));
    });
    return () => {
      cancelled = true;
    };
  }, [store, accountId, workspaceId, fileId, read, attempt]);

  return state;
}

/** Lists notes that link to the open note. */
export function Backlinks({
  store,
  accountId,
  workspaceId,
  fileId,
}: {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
}): ReactNode {
  const online = useOnline();
  const files = useFiles();
  const note = files.notes.find((item) => item.fileId === fileId);
  const read = serverBacklinkRead({
    known: note !== undefined || !files.loading,
    localOnly: note?.localOnly ?? false,
    online,
  });
  const [attempt, setAttempt] = useState(0);
  const state = useBacklinks(
    store,
    accountId,
    workspaceId,
    fileId,
    read,
    attempt,
  );

  if (state.kind === 'loading') return null;
  if (state.kind === 'failed')
    return (
      <Stack gap={2} as="div">
        <p className="m-0 text-secondary text-muted">
          The links to this note did not load.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={(): void => {
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </Stack>
    );
  if (state.rows.length === 0)
    return (
      <p className="m-0 text-secondary text-muted">
        {backlinksEmptyMessage(state.partial, online)}
      </p>
    );
  return (
    <Stack gap={2} as="div">
      {state.partial ? (
        <p className="m-0 text-secondary text-muted">
          These links come from this device.
        </p>
      ) : null}
      <Inset pad={0} as="ul" className="list-none">
        {state.rows.map((item) => (
          <li key={item.fileId}>
            <Link
              className={rowClassName()}
              to={`/w/${workspaceId}/notes/${item.fileId}`}
            >
              <span className="min-w-0 flex-1 truncate">
                {displayNoteName(item.path)}
              </span>
            </Link>
          </li>
        ))}
      </Inset>
    </Stack>
  );
}
