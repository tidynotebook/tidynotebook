/** Old folder links open All notes in the same workspace. */
import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';

export default function LegacyFolderRedirect(): ReactNode {
  const { workspaceId = '' } = useParams();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`/w/${workspaceId}${location.search}${location.hash}`}
    />
  );
}
