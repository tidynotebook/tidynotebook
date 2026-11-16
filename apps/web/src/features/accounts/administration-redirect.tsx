import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import { useSession } from '../../app.tsx';

/** Keep old administration bookmarks inside the normal Settings modal. */
export function AdministrationRedirect(): ReactNode {
  const { workspaceId } = useParams();
  const session = useSession();
  return (
    <Navigate
      replace
      to={`/w/${workspaceId ?? ''}?settings=${session.account?.installationRole === 'administrator' ? 'accounts' : ''}`}
    />
  );
}
