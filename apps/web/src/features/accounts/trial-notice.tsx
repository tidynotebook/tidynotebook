import type { ReactNode } from 'react';
import { Button, Notice } from '@notesapp/ui';
import { useSession } from '../../app.tsx';
import { trialStatus } from '../../lib/trial.ts';
import { portalHome } from '../../lib/portal.ts';
import { useNow } from '../../shell/now.ts';
import { useOpenPortal } from './open-portal.ts';

/** A trial notice follows the account contract and the fixed deadline. */
export function TrialNotice(): ReactNode {
  const { account } = useSession();
  const now = useNow();
  const portal = useOpenPortal();
  if (account === null) return null;
  const message = trialStatus(account.controls, now);
  if (message === null) return null;
  return (
    <Notice message={message}>
      {portal.error === '' ? null : <p>{portal.error}</p>}
      {account.accountPortal ? (
        <Button
          variant="secondary"
          disabled={portal.busy}
          onClick={() => {
            void portal.open(portalHome);
          }}
        >
          Upgrade account
        </Button>
      ) : null}
    </Notice>
  );
}
