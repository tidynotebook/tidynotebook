import { Inline, Button, Notice } from '@notesapp/ui';
import type { ReactNode } from 'react';

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
      variant="secondary"
      size="sm"
      disabled={portal.busy}
      onClick={() => {
        void portal.open(portalHome, true);
      }}
    >
      Upgrade
    </Button>
  ) : null;
  if (active)
    return (
      <Inline
        padX={4}
        padY={2}
        wrap
        align="center"
        as="div"
        className="text-secondary text-muted"
        aria-label="Trial status"
      >
        <span role="status">{message}</span>
        {action}
        {portal.error === '' ? null : (
          <Notice tone="problem" message={portal.error} />
        )}
      </Inline>
    );
  return (
    <Notice message={message}>
      {portal.error === '' ? null : <p>{portal.error}</p>}
      {action}
    </Notice>
  );
}
