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
  const active =
    account.controls.trialState === 'active' &&
    Date.parse(account.controls.trialEndsAt ?? '') > now;
  const action = account.accountPortal ? (
    <Button
      variant={active ? 'ghost' : 'secondary'}
      size="sm"
      disabled={portal.busy}
      onClick={() => {
        void portal.open(portalHome);
      }}
    >
      Upgrade account
    </Button>
  ) : null;
  if (active)
    return (
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 text-control text-muted"
        aria-label="Trial status"
      >
        <span role="status">{message}</span>
        {action}
        {portal.error === '' ? null : (
          <Notice tone="problem" message={portal.error} />
        )}
      </div>
    );
  return (
    <Notice message={message}>
      {portal.error === '' ? null : <p>{portal.error}</p>}
      {action}
    </Notice>
  );
}
