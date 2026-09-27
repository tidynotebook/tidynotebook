/**
 * The one icon set of the product.
 *
 * Every icon is drawn on the 24 by 24 grid of `./icon-grid.ts` at a stroke of
 * 1.5, and renders at 16 px in a control, a row or a label, and at 20 px in an
 * empty state. No other size exists. One frame component spreads the shared
 * attributes, so no icon states a stroke, a viewport or a line join of its
 * own, and `icons.test.ts` proves that none of them does.
 *
 * An icon inherits the text colour of its parent and hides from assistive
 * software, because the button or the link around it carries the name. An
 * icon that no screen uses is deleted; the test that pairs this file with
 * `./index.ts` is what keeps the set and its exports in step.
 *
 * See
 * [decision 0065](../../../docs/decisions/0065-one-recipe-for-a-control-and-one-grid-for-an-icon.md).
 */
import type { ReactNode } from 'react';
import { defaultIconSize, iconAttributes } from './icon-grid.ts';

/** Common properties for all icons. */
export type IconProps = {
  readonly size?: number | undefined;
  readonly className?: string | undefined;
};

/** The one frame that every icon of the set draws in. */
function IconFrame({
  size = defaultIconSize,
  className,
  children,
}: IconProps & { readonly children: ReactNode }): ReactNode {
  return (
    <svg width={size} height={size} className={className} {...iconAttributes}>
      {children}
    </svg>
  );
}

/** A note or document icon. */
export function FileTextIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </IconFrame>
  );
}

/** A closed folder icon. */
export function FolderIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </IconFrame>
  );
}

/** An open folder icon. */
export function FolderOpenIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />
    </IconFrame>
  );
}

/**
 * A folder with a plus, for the new folder action.
 *
 * The folder body is the same path as `FolderIcon`, so the glyph fills the
 * viewport to the same extent as the other icons. The plus sits in the centre
 * of the body.
 */
export function FolderPlusIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      <line x1="12" y1="10" x2="12" y2="16" />
      <line x1="9" y1="13" x2="15" y2="13" />
    </IconFrame>
  );
}

/** A search magnifying glass icon. */
export function SearchIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </IconFrame>
  );
}

/** A plus add icon. */
export function PlusIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </IconFrame>
  );
}

/** A trash icon, for Trash and for the move to trash action. */
export function TrashIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </IconFrame>
  );
}

/** A clock that turns back, for History and for a relative time. */
export function HistoryIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </IconFrame>
  );
}

/** A three dot overflow icon for a menu button. */
export function MoreIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </IconFrame>
  );
}

/** A side panel icon for the navigation sidebar on the left. */
export function PanelLeftIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </IconFrame>
  );
}

/** A pencil icon for a rename action. */
export function PencilIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </IconFrame>
  );
}

/** Four arrows from one centre, for a move action. */
export function MoveIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </IconFrame>
  );
}

/** A tray with an arrow into it, for an export or a download. */
export function DownloadIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </IconFrame>
  );
}

/** A tray with an arrow out of it, for an import or an upload. */
export function UploadIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </IconFrame>
  );
}

/** A settings gear icon. */
export function SettingsIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </IconFrame>
  );
}

/** Two people, for the accounts of the installation. */
export function UsersIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconFrame>
  );
}

/** A keyboard, for the list of keyboard shortcuts. */
export function KeyboardIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 9h.01" />
      <path d="M10 9h.01" />
      <path d="M14 9h.01" />
      <path d="M18 9h.01" />
      <path d="M8 13h.01" />
      <path d="M12 13h.01" />
      <path d="M16 13h.01" />
      <path d="M7 16.5h10" />
    </IconFrame>
  );
}

/** A door with an arrow out of it, for the sign out action. */
export function SignOutIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconFrame>
  );
}

/** A sun light theme icon. */
export function SunIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </IconFrame>
  );
}

/** A moon dark theme icon. */
export function MoonIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </IconFrame>
  );
}

/** A computer display device icon for system theme. */
export function ComputerIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </IconFrame>
  );
}

/** A circle with a mark, for the problem tone of a notice. */
export function AlertCircleIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </IconFrame>
  );
}

/** A circle with an i, for the plain tone of a notice. */
export function InfoIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </IconFrame>
  );
}

/** A navigation menu hamburger icon. */
export function MenuIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </IconFrame>
  );
}

/** A close cross icon. */
export function CloseIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </IconFrame>
  );
}

/** A chevron left icon. */
export function ChevronLeftIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <polyline points="15 18 9 12 15 6" />
    </IconFrame>
  );
}

/** A chevron right icon. */
export function ChevronRightIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <polyline points="9 18 15 12 9 6" />
    </IconFrame>
  );
}

/** A chevron down icon. */
export function ChevronDownIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <polyline points="6 9 12 15 18 9" />
    </IconFrame>
  );
}

/**
 * Two chevrons, one up and one down, for a switcher.
 *
 * A chevron down states that something opens below the control. A switcher
 * moves between alternatives, and the person can leave it on any one of
 * them, so its mark points both ways.
 */
export function ChevronsUpDownIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <polyline points="7 15 12 20 17 15" />
      <polyline points="7 9 12 4 17 9" />
    </IconFrame>
  );
}

/**
 * Two arrows that point in opposite directions, for the sort notes action.
 */
export function SortIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="m3 16 4 4 4-4" />
      <path d="M7 20V4" />
      <path d="m21 8-4-4-4 4" />
      <path d="M17 4v16" />
    </IconFrame>
  );
}

/**
 * Two arrows that point away from a centre line, for the expand all folders
 * action.
 *
 * It is not the chevron pair of the workspace switcher, because that glyph
 * says that a menu opens, and the two sit in one sidebar.
 */
export function ExpandAllIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M12 22v-6" />
      <path d="M12 8V2" />
      <path d="M4 12H2" />
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
      <path d="m15 19-3 3-3-3" />
      <path d="m15 5-3-3-3 3" />
    </IconFrame>
  );
}

/**
 * Two arrows that point at a centre line, for the collapse all folders
 * action.
 */
export function CollapseAllIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M12 22v-6" />
      <path d="M12 8V2" />
      <path d="M4 12H2" />
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
      <path d="m15 19-3-3-3 3" />
      <path d="m15 5-3 3-3-3" />
    </IconFrame>
  );
}

/** A copy text clipboard icon. */
export function CopyIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </IconFrame>
  );
}

/** A chain link icon, for a published link. */
export function LinkIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </IconFrame>
  );
}

/** A capital H with a 1, for a heading of the first level. */
export function Heading1Icon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 6v12" />
      <path d="M12 6v12" />
      <path d="M4 12h8" />
      <path d="M17 11l2.5-2v9" />
    </IconFrame>
  );
}

/** A capital H with a 2, for a heading of the second level. */
export function Heading2Icon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 6v12" />
      <path d="M12 6v12" />
      <path d="M4 12h8" />
      <path d="M16.5 11c0-1.2 1-2 2.2-2s2.3.8 2.3 2c0 2.4-4.5 3.6-4.5 7h4.5" />
    </IconFrame>
  );
}

/** A capital H with a 3, for a heading of the third level. */
export function Heading3Icon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 6v12" />
      <path d="M12 6v12" />
      <path d="M4 12h8" />
      <path d="M16.5 9h4.5l-2.6 3.3c1.5 0 2.6 1 2.6 2.5S19.9 17.5 18.6 17.5c-1 0-1.7-.4-2.1-1" />
    </IconFrame>
  );
}

/** A heavy capital B, for bold text. */
export function BoldIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h6.5a3.5 3.5 0 0 1 0 7H7z" />
    </IconFrame>
  );
}

/** A slanted capital I, for italic text. */
export function ItalicIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M10 5h8" />
      <path d="M6 19h8" />
      <path d="M14 5l-4 14" />
    </IconFrame>
  );
}

/** A capital S with a line through it, for struck through text. */
export function StrikethroughIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M16.5 7.5C15.8 6 14.2 5 12 5 9.2 5 7.5 6.4 7.5 8.3c0 1.5 1 2.6 3.2 3.2" />
      <path d="M4 12h16" />
      <path d="M7.5 16.5C8.2 18 9.8 19 12 19c2.8 0 4.5-1.4 4.5-3.3 0-.9-.3-1.6-1-2.2" />
    </IconFrame>
  );
}

/** Two angle brackets, for inline code. */
export function CodeIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <polyline points="8 7 3 12 8 17" />
      <polyline points="16 7 21 12 16 17" />
    </IconFrame>
  );
}

/** Three lines with a dot before each, for a bullet list. */
export function BulletListIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <circle cx="5" cy="6" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="5" cy="18" r="1" />
      <path d="M10 6h10" />
      <path d="M10 12h10" />
      <path d="M10 18h10" />
    </IconFrame>
  );
}

/** Three lines with a number before them, for an ordered list. */
export function OrderedListIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 5h1v5" />
      <path d="M4 10h2" />
      <path d="M4 15.5c0-.8.7-1.5 1.5-1.5S7 14.6 7 15.4c0 1.4-3 2-3 3.6h3" />
      <path d="M11 6h9" />
      <path d="M11 12h9" />
      <path d="M11 18h9" />
    </IconFrame>
  );
}

/** Two ticked boxes with lines, for a task list. */
export function TaskListIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="4" width="6" height="6" rx="1" />
      <polyline points="4.5 7 5.6 8.1 7.5 6" />
      <rect x="3" y="14" width="6" height="6" rx="1" />
      <path d="M13 7h8" />
      <path d="M13 17h8" />
    </IconFrame>
  );
}

/** A bar beside three lines, for a block quote. */
export function QuoteIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 5v14" />
      <path d="M9 7h11" />
      <path d="M9 12h11" />
      <path d="M9 17h7" />
    </IconFrame>
  );
}

/** A grid of two columns under a header row, for a table. */
export function TableIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M12 4v16" />
    </IconFrame>
  );
}

/** A table with a plus under it, for a new row. */
export function TableRowAddIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="3" width="18" height="11" rx="2" />
      <path d="M3 8.5h18" />
      <path d="M12 17v4" />
      <path d="M10 19h4" />
    </IconFrame>
  );
}

/** A table with a minus under it, for the removal of a row. */
export function TableRowRemoveIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="3" width="18" height="11" rx="2" />
      <path d="M3 8.5h18" />
      <path d="M10 19h4" />
    </IconFrame>
  );
}

/** A table with a cross at its corner, for the removal of the whole table. */
export function TableRemoveIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 8.5h14" />
      <path d="M10 3v14" />
      <path d="m17 17 4 4" />
      <path d="m21 17-4 4" />
    </IconFrame>
  );
}

/** A table with a plus beside it, for a new column. */
export function TableColumnAddIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="3" width="11" height="18" rx="2" />
      <path d="M8.5 3v18" />
      <path d="M17 12h4" />
      <path d="M19 10v4" />
    </IconFrame>
  );
}

/** A table with a minus beside it, for the removal of a column. */
export function TableColumnRemoveIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="3" width="11" height="18" rx="2" />
      <path d="M8.5 3v18" />
      <path d="M17 12h4" />
    </IconFrame>
  );
}

/** An arrow that points up, for a row that moves up. */
export function ArrowUpIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M12 19V5" />
      <polyline points="5 12 12 5 19 12" />
    </IconFrame>
  );
}

/** An arrow that points down, for a row that moves down. */
export function ArrowDownIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M12 5v14" />
      <polyline points="5 12 12 19 19 12" />
    </IconFrame>
  );
}

/** An arrow that points to the left, for a column that moves left. */
export function ArrowLeftIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M19 12H5" />
      <polyline points="12 5 5 12 12 19" />
    </IconFrame>
  );
}

/** An arrow that points to the right, for a column that moves right. */
export function ArrowRightIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M5 12h14" />
      <polyline points="12 5 19 12 12 19" />
    </IconFrame>
  );
}

/** Lines that start at one edge, for a column aligned to the left. */
export function AlignLeftIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h13" />
    </IconFrame>
  );
}

/** Lines centred on one axis, for a column aligned to the centre. */
export function AlignCenterIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M5.5 18h13" />
    </IconFrame>
  );
}

/** Lines that end at one edge, for a column aligned to the right. */
export function AlignRightIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M4 6h16" />
      <path d="M10 12h10" />
      <path d="M7 18h13" />
    </IconFrame>
  );
}

/** A calendar: the month of daily notes. */
export function CalendarIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </IconFrame>
  );
}

/** A calendar with one day marked: the note of today. */
export function CalendarDayIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <rect x="8" y="14" width="4" height="4" rx="1" />
    </IconFrame>
  );
}

/** A check mark icon. */
export function CheckIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <polyline points="20 6 9 17 4 12" />
    </IconFrame>
  );
}

/** The product mark: an N with an underline, the same mark as the install icon. */
export function AppMarkIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <path d="M7 17V5" />
      <path d="M17 5V17" />
      <path d="M7 5L17 17" />
      <path d="M7 20.5H17" />
    </IconFrame>
  );
}

/**
 * One workspace: four panes that sit side by side.
 *
 * It is deliberately unlike `AppMarkIcon`, which is the product mark of the
 * sign in screen. One glyph for both would make a workspace read as a copy of
 * the logo rather than as the area a person works in.
 */
export function WorkspaceIcon(props: IconProps): ReactNode {
  return (
    <IconFrame {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </IconFrame>
  );
}
