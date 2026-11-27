import type { ReactNode } from 'react';
import { useLocalStore, useSession } from '../app.tsx';
import {
  AttentionLink,
  useAttentionCount,
} from '../features/attention/attention-link.tsx';

export function SidebarAttention({
  workspaceId,
}: {
  readonly workspaceId: string;
}): ReactNode {
  const { store } = useLocalStore();
  const account = useSession().account;
  const count = useAttentionCount(
    store,
    account?.accountId ?? null,
    workspaceId,
  );
  return <AttentionLink workspaceId={workspaceId} count={count} />;
}
