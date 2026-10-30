import {
  IconButton,
  Rail,
  Stack,
  CalendarIcon,
  FolderIcon,
  LinkIcon,
} from '@notesapp/ui';
/**
 * The view bar of the sidebar (record 0105).
 *
 * A thin column at the left edge of the sidebar with one icon-only button for
 * each view. The button of the view that shows is pressed, and a press on
 * another one shows that view. `lib/sidebar-view.ts` holds the views, their
 * names and the stored choice, and `sidebarViewClassName` draws a button.
 */
import { useCallback, useState, type ReactNode } from 'react';

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
    <Rail
      aria-label="Sidebar views"
      className="ui-sidebar-rail border-r border-edge-subtle"
    >
      <Stack gap={0.5} align="center" className="ui-sidebar-rail-group">
        {sidebarViews.map((candidate) => (
          <IconButton
            key={candidate}
            size="rail"
            glyph={viewIcons[candidate]}
            label={sidebarViewLabels[candidate]}
            current={
              candidate === view &&
              !/\/(trash|published)$/.test(location.pathname)
            }
            ariaPressed={candidate === view}
            onClick={() => onChoose(candidate)}
            className="ui-sidebar-rail-button"
          />
        ))}
      </Stack>
      <div aria-hidden="true" />
      <Stack gap={0.5} align="center" className="ui-sidebar-rail-group">
        {[
          { name: 'Published links', path: 'published', icon: <LinkIcon /> },
          { name: 'Trash', path: 'trash', icon: actionIcon(trashPageGlyph) },
        ].map((item) => {
          const to = `/w/${workspaceId}/${item.path}`,
            current = location.pathname === to;
          return (
            <IconButton
              key={item.path}
              size="rail"
              glyph={item.icon}
              label={item.name}
              current={current}
              render={(props) => (
                <Link
                  {...props}
                  className={`${props.className} ui-rail-link ui-sidebar-rail-button`}
                  to={to}
                  aria-current={current ? 'page' : undefined}
                  onClick={onNavigate}
                />
              )}
            />
          );
        })}
      </Stack>
    </Rail>
  );
}
