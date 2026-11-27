import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { readWorkspaceInviteLink } from '@notesapp/api-client';
import {
  Button,
  CheckIcon,
  Inline,
  Notice,
  ReadOnlyField,
  Stack,
} from '@notesapp/ui';
import { problemMessage } from '../../app.tsx';
import { copyText } from '../../platform.ts';

export const inviteLinkCopied = 'Invitation link copied.';

type CopyProblem = {
  readonly message: string;
  readonly url?: string;
};

export function useWorkspaceInviteCopy(workspaceId: string) {
  const [problem, setProblem] = useState<CopyProblem | null>(null);

  async function copy(invitationId: string): Promise<boolean> {
    setProblem(null);
    try {
      const result = await readWorkspaceInviteLink({
        path: { workspaceId, invitationId },
      });
      if (!result.data) setProblem({ message: problemMessage(result.error) });
      else if (await copyText(result.data.url)) return true;
      else
        setProblem({
          message: 'Could not copy the link. Select and copy it yourself.',
          url: result.data.url,
        });
    } catch {
      setProblem({ message: 'The invitation link could not load.' });
    }
    return false;
  }

  return { copy, problem };
}

export function InviteCopyProblem({
  problem,
}: {
  readonly problem: CopyProblem;
}): ReactNode {
  const id = useId();
  return (
    <Stack gap={3}>
      <Notice tone="problem" message={problem.message} />
      {problem.url ? (
        <ReadOnlyField
          id={id}
          label="Invitation link"
          value={problem.url}
          takeFocus
        />
      ) : null}
    </Stack>
  );
}

export function CopyInviteButton({
  copy,
}: {
  readonly copy: () => Promise<boolean>;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <>
      <Button
        label={copied ? 'Copied!' : 'Copy link'}
        size="compact"
        variant="secondary"
        onClick={() => {
          if (pending.current || copied) return;
          pending.current = true;
          void copy()
            .then(setCopied)
            .finally(() => {
              pending.current = false;
            });
        }}
      >
        <span className="grid whitespace-nowrap" aria-hidden="true">
          <span
            className={`col-start-1 row-start-1 ${copied ? 'invisible' : ''}`}
          >
            Copy link
          </span>
          <Inline
            as="span"
            gap={1}
            align="center"
            className={`col-start-1 row-start-1 ${copied ? '' : 'invisible'}`}
          >
            <CheckIcon />
            Copied!
          </Inline>
        </span>
      </Button>
      <span className="sr-only" role="status">
        {copied ? inviteLinkCopied : ''}
      </span>
    </>
  );
}
