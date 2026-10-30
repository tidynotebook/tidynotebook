import { useEffect, useState, type ReactNode } from 'react';
import {
  Form,
  Inset,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  TextField,
} from '@notesapp/ui';
import {
  createWorkspace,
  deleteWorkspace,
  updateWorkspace,
  type Workspace,
} from '@notesapp/api-client';
import { problemMessage } from '../app.tsx';
const nameLimit = 200;
/** What a workspace name has to be before the dialog sends it. */
function nameProblem(name: string, taken: readonly string[]): string | null {
  if (name === '') return 'Give the workspace a name.';
  if (name.length > nameLimit)
    return `A workspace name can have up to ${String(nameLimit)} characters.`;
  if (taken.some((one) => one.toLowerCase() === name.toLowerCase()))
    return `A workspace named ${name} already exists.`;
  return null;
}

/**
 * Makes a workspace and opens it.
 *
 * The new workspace starts empty, so the person lands on the empty state of
 * the note list and the one action that fills it.
 */
export function NewWorkspaceDialog({
  open,
  onClose,
  workspaces,
  onCreated,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaces: readonly Workspace[];
  readonly onCreated: (workspace: Workspace) => void;
}): ReactNode {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setError(null);
    setSaving(false);
  }, [open]);

  const create = (): void => {
    if (saving) return;
    const wanted = name.trim();
    const problem = nameProblem(
      wanted,
      workspaces.map((workspace) => workspace.name),
    );
    if (problem !== null) {
      setError(problem);
      return;
    }
    setSaving(true);
    void (async (): Promise<void> => {
      const result = await createWorkspace({ body: { name: wanted } });
      setSaving(false);
      if (result.error !== undefined || result.data === undefined) {
        setError(problemMessage(result.error));
        return;
      }
      onCreated(result.data);
      onClose();
    })();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New workspace"
      titleId="new-workspace-title"
      width="small"
    >
      <Form
        regions
        onSubmit={(event): void => {
          event.preventDefault();
          create();
        }}
      >
        <DialogBody>
          <TextField
            id="new-workspace-name"
            label="Workspace name"
            hint="The workspace starts empty and keeps its notes apart from every other workspace."
            value={name}
            error={error ?? undefined}
            autoComplete="off"
            onChange={(value) => {
              setName(value);
              setError(null);
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            Make workspace
          </Button>
        </DialogFooter>
      </Form>
    </Dialog>
  );
}

/** Renames the open workspace. */
export function RenameWorkspaceDialog({
  open,
  onClose,
  workspace,
  workspaces,
  onRenamed,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspace: Workspace;
  readonly workspaces: readonly Workspace[];
  readonly onRenamed: () => void;
}): ReactNode {
  const [name, setName] = useState(workspace.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(workspace.name);
    setError(null);
    setSaving(false);
  }, [open, workspace.name]);

  const rename = (): void => {
    if (saving) return;
    const wanted = name.trim();
    if (wanted === workspace.name) {
      onClose();
      return;
    }
    const problem = nameProblem(
      wanted,
      workspaces
        .filter((one) => one.workspaceId !== workspace.workspaceId)
        .map((one) => one.name),
    );
    if (problem !== null) {
      setError(problem);
      return;
    }
    setSaving(true);
    void (async (): Promise<void> => {
      const result = await updateWorkspace({
        path: { workspaceId: workspace.workspaceId },
        body: { name: wanted },
      });
      setSaving(false);
      if (result.error !== undefined) {
        setError(problemMessage(result.error));
        return;
      }
      onRenamed();
      onClose();
    })();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename workspace"
      titleId="rename-workspace-title"
      width="small"
    >
      <Form
        regions
        onSubmit={(event): void => {
          event.preventDefault();
          rename();
        }}
      >
        <DialogBody>
          <TextField
            id="rename-workspace-name"
            label="Workspace name"
            hint="The notes of the workspace do not change."
            value={name}
            error={error ?? undefined}
            autoComplete="off"
            onChange={(value) => {
              setName(value);
              setError(null);
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            Rename workspace
          </Button>
        </DialogFooter>
      </Form>
    </Dialog>
  );
}

/**
 * Deletes the open workspace and everything in it.
 *
 * The step is not reversible and there is no Trash above a workspace, so the
 * dialog states what goes and asks the person to confirm the name. The server
 * refuses the last workspace of an account whatever this screen shows
 * (record 0051).
 */
export function DeleteWorkspaceDialog({
  open,
  onClose,
  workspace,
  onDeleted,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspace: Workspace;
  readonly onDeleted: () => void;
}): ReactNode {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmation('');
    setError(null);
    setDeleting(false);
  }, [open]);

  const matches = confirmation.trim() === workspace.name;

  const remove = (): void => {
    if (deleting || !matches) return;
    setDeleting(true);
    void (async (): Promise<void> => {
      const result = await deleteWorkspace({
        path: { workspaceId: workspace.workspaceId },
      });
      setDeleting(false);
      if (result.error !== undefined) {
        setError(problemMessage(result.error));
        return;
      }
      onDeleted();
      onClose();
    })();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete workspace permanently"
      titleId="delete-workspace-title"
      width="small"
    >
      <Form
        regions
        onSubmit={(event): void => {
          event.preventDefault();
          remove();
        }}
      >
        <DialogBody>
          <Inset as="p" className="text-body text-strong">
            Every note, version and published link of {workspace.name} goes. You
            cannot get them back.
          </Inset>
          <TextField
            id="delete-workspace-name"
            label={`Type ${workspace.name} to confirm`}
            value={confirmation}
            error={error ?? undefined}
            autoComplete="off"
            onChange={(value) => {
              setConfirmation(value);
              setError(null);
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            disabled={deleting || !matches}
          >
            Delete permanently
          </Button>
        </DialogFooter>
      </Form>
    </Dialog>
  );
}
