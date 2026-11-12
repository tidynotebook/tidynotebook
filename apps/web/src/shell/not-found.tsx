/**
 * The page of an address that names no page of the frame.
 *
 * It is a page of the workspace frame and not a bare sentence (record 0091):
 * the sidebar and the breadcrumb stay, and the page holds the one title, one
 * sentence, and the back control of every page to the notes (record 0138).
 */
import type { ReactNode } from 'react';
import { Page, PageHeader, buttonClassName } from '@notesapp/ui';
import { Link, useParams } from 'react-router';
import { useDocumentTitle } from './document-title.ts';

/** The title of the page, which is also the last part of the breadcrumb. */
export const notFoundTitle = 'Page not found';

/** Shown for an address under a workspace that names no route. */
export function NotFoundView(): ReactNode {
  const { workspaceId } = useParams();
  useDocumentTitle(notFoundTitle);
  return (
    <Page>
      <PageHeader
        title={notFoundTitle}
        description="The address names no page of this application."
      />
      <div>
        <Link
          className={buttonClassName({ variant: 'secondary' })}
          to={workspaceId === undefined ? '/' : `/w/${workspaceId}`}
        >
          Go to All notes
        </Link>
      </div>
    </Page>
  );
}
