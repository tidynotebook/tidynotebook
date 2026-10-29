/**
 * The view bar of the sidebar (record 0105).
 *
 * A thin column at the left edge of the sidebar with one icon-only button for
 * each view. The button of the view that shows is pressed, and a press on
 * another one shows that view. `lib/sidebar-view.ts` holds the views, their
 * names and the stored choice, and `sidebarViewClassName` draws a button.
 */
import { useCallback, useState, type ReactNode } from 'react';
import {
  CalendarIcon,
  FolderIcon,
  LinkIcon,
  sidebarViewClassName,
} from '@notesapp/ui';
import { Link, useLocation } from 'react-router';
import { actionIcon } from './action-icons.tsx';
import { trashPageGlyph } from '../lib/delete-label.ts';
import {
  parseSidebarView,
  sidebarViewLabels,
  sidebarViewStorageKey,
  sidebarViews,
  type SidebarView,
} from '../lib/sidebar-view.ts';

/** The glyph of each view. */
const viewIcons: Readonly<Record<SidebarView, ReactNode>> = {
  notes: <FolderIcon />,
  calendar: <CalendarIcon />,
};

/** The view of the sidebar on this device, kept across reloads. */
export function useSidebarView(): readonly [
  SidebarView,
  (view: SidebarView) => void,
] {
  const [view, setView] = useState<SidebarView>(() => {
    try {
      return parseSidebarView(
        window.localStorage.getItem(sidebarViewStorageKey),
      );
    } catch {
      return parseSidebarView(null);
    }
  });
  const choose = useCallback((next: SidebarView): void => {
    setView(next);
    try {
      window.localStorage.setItem(sidebarViewStorageKey, next);
    } catch {
      // The sidebar still works when browser preference storage fails.
    }
  }, []);
  return [view, choose] as const;
}

/** The column of view buttons. */
export function SidebarViewBar({
  view,
  onChoose,
  workspaceId,
  onNavigate,
}: {
  readonly workspaceId: string;
  readonly onNavigate: () => void;
  readonly view: SidebarView;
  readonly onChoose: (view: SidebarView) => void;
}): ReactNode {
  const location = useLocation();
  return (
    <nav
      aria-label="Sidebar views"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-edge-subtle py-2"
    >
      {sidebarViews.map((candidate) => (
        <button
          key={candidate}
          type="button"
          className={sidebarViewClassName({
            current:
              candidate === view &&
              !/\/(trash|published)$/.test(location.pathname),
          })}
          aria-label={sidebarViewLabels[candidate]}
          title={sidebarViewLabels[candidate]}
          aria-pressed={candidate === view}
          onClick={() => onChoose(candidate)}
        >
          <span className="inline-flex" aria-hidden="true">
            {viewIcons[candidate]}
          </span>
        </button>
      ))}
      <div className="mt-auto flex flex-col items-center gap-1">
        {[
          { name: 'Published links', path: 'published', icon: <LinkIcon /> },
          { name: 'Trash', path: 'trash', icon: actionIcon(trashPageGlyph) },
        ].map((item) => {
          const to = `/w/${workspaceId}/${item.path}`,
            current = location.pathname === to;
          return (
            <Link
              key={item.path}
              to={to}
              aria-label={item.name}
              title={item.name}
              aria-current={current ? 'page' : undefined}
              className={`${sidebarViewClassName({ current })} ui-rail-link`}
              onClick={onNavigate}
            >
              {item.icon}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
