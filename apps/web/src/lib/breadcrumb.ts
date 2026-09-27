/**
 * Where the person is, as the parts of one breadcrumb.
 *
 * The frame header is the context of the route (decision 0064), and the
 * breadcrumb is the part that states it: the workspace a person works under,
 * then the folders of the open note, then the name of the note or the page.
 *
 * This module decides the parts and which of them is a link. It does not
 * decide their words: the name of a workspace comes from the workspace list
 * and the name of a page comes from the screen that owns it, so each of those
 * facts stays where it already lives and the caller passes them in.
 *
 * Which page the frame shows is a fact of the route table. Each child route
 * of the frame names its page in its `handle`, and `framePageOf` reads the
 * deepest one (record 0091). The frame does not match the address a second
 * time, so an address it does not know cannot read as another page.
 *
 * Every part but the last is a link, because the last part is where the
 * person already is. A folder part goes to the note list of the workspace and
 * selects that folder, which is what the folder row of the tree does, so the
 * two surfaces agree on what pressing a folder means.
 */

/** Every page of the frame, as a child route names it in its `handle`. */
export const framePages = [
  'notes',
  'note',
  'history',
  'review',
  'trash',
  'published',
  'accounts',
  'attention',
  'settings',
  'not-found',
] as const;

/** One page of the frame. */
export type FramePage = (typeof framePages)[number];

/** The `handle` of a child route of the frame. */
export type FrameHandle = { readonly page: FramePage };

/** The pages that take the name of the open note. */
type NotePage = 'note' | 'history' | 'review';

/**
 * The word of every page that names no note.
 *
 * The record is total by its type, so a new page fails the typecheck until it
 * has a word.
 */
export type PageTitles = Readonly<Record<Exclude<FramePage, NotePage>, string>>;

/** Whether a value is one page of the frame. */
function isFramePage(value: unknown): value is FramePage {
  return framePages.some((page) => page === value);
}

/** Reads the page one `handle` names, or `null` when it names none. */
function pageOfHandle(handle: unknown): FramePage | null {
  if (handle === null || typeof handle !== 'object') return null;
  const page: unknown = Object.fromEntries(Object.entries(handle))['page'];
  return isFramePage(page) ? page : null;
}

/**
 * The page the frame shows, from the handles of every matched route.
 *
 * The list runs from the outermost route to the deepest one, which is the
 * order the router gives. The deepest route that names a page decides, and a
 * route that names none answers `null`.
 */
export function framePageOf(handles: readonly unknown[]): FramePage | null {
  for (let index = handles.length - 1; index >= 0; index -= 1) {
    const page = pageOfHandle(handles[index]);
    if (page !== null) return page;
  }
  return null;
}

/**
 * The word of the last part of the breadcrumb.
 *
 * A note page takes the name of the open note, which can be missing for one
 * render while the list fills. A page with no name answers no word, and
 * `breadcrumbParts` then draws no last part.
 */
export function leafOf(
  page: FramePage | null,
  noteName: string | null,
  titles: PageTitles,
): string {
  switch (page) {
    case null:
      return '';
    case 'note':
      return noteName ?? 'Note';
    case 'history':
      return `History of ${noteName ?? 'this note'}`;
    case 'review':
      return `Review of ${noteName ?? 'this note'}`;
    default:
      return titles[page];
  }
}

/** One part of the breadcrumb. */
export type BreadcrumbPart = {
  readonly label: string;
  /** Where the part goes, or `null` when the part is where you are. */
  readonly to: string | null;
  /** The folder the part selects in the tree, or `null` when it selects none. */
  readonly folder: string | null;
};

/** What the frame is showing right now. */
export type BreadcrumbRoute = {
  readonly workspaceId: string;
  /** The name of the open workspace, which is the first part. */
  readonly workspaceName: string;
  /** The stored path of the note the route names, or `null` for a page. */
  readonly notePath: string | null;
  /** The name of the note or the page, which is the last part. */
  readonly leaf: string;
};

/**
 * The identity of one part, for the list that draws it.
 *
 * The last part is one place, whatever word it holds. The note route writes
 * its name field into that place (decision 0069), and the word of the place
 * is the name a person is typing. An identity that held the word therefore
 * changed on every keystroke, so React replaced the element, the portal lost
 * its host, and the field was destroyed under the caret: one character, then
 * the keyboard of a phone closed. The identity of the last part is fixed.
 *
 * Every other part is a link that only the route changes, so its position and
 * its word identify it and two folders of one name stay apart.
 */
export function breadcrumbKey(part: BreadcrumbPart, index: number): string {
  return part.to === null ? leafKey : `${String(index)}:${part.label}`;
}

/** The identity of the last part, which never changes while a route is open. */
const leafKey = 'leaf';

/** The address of the note list of one workspace. */
function workspaceHome(workspaceId: string): string {
  return `/w/${workspaceId}`;
}

/**
 * The parts of the breadcrumb of one route.
 *
 * A note inside a folder yields one part for each folder above it, so the
 * person reads the whole path and can reach every level of it. A route that
 * names no note yields the workspace and the page. A part carries a word or
 * it is absent, so the header never shows a link with nothing in it.
 */
export function breadcrumbParts(
  route: BreadcrumbRoute,
): readonly BreadcrumbPart[] {
  const home = workspaceHome(route.workspaceId);
  const parts: BreadcrumbPart[] = [];
  // The workspace list is a cache that a device fills after the first paint,
  // so the name can be missing for one render. A part with no word is a link
  // that a person cannot see and a screen reader cannot name, so there is no
  // part at all until the name arrives.
  if (route.workspaceName !== '')
    parts.push({ label: route.workspaceName, to: home, folder: '' });
  const segments =
    route.notePath === null ? [] : route.notePath.split('/').slice(0, -1);
  let walked = '';
  for (const segment of segments) {
    if (segment === '') continue;
    walked = walked === '' ? segment : `${walked}/${segment}`;
    parts.push({ label: segment, to: home, folder: walked });
  }
  if (route.leaf !== '')
    parts.push({ label: route.leaf, to: null, folder: null });
  return parts;
}
