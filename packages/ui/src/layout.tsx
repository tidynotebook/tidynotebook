/**
 * Layout primitives of the application.
 *
 * Every screen frames itself with `Page` and titles itself with `PageHeader`,
 * so spacing, measure, and the heading ramp are decided once. The heading ramp
 * of the chrome is: a page title is `text-xl`, a card or section title is
 * `text-base`, a list row title is `text-ui`, and a quiet group label is
 * `text-help`. There is no smaller size than `text-kbd`, which is a
 * keyboard hint and nothing else.
 *
 * Distance is decided once as well. `pageGutter` below is the one distance
 * from the edge of the screen to the content of a page, and every frame that
 * is not a `Page`, such as the application header and the note column, reads
 * the same constant. `gap-cluster` and `gap-group` separate controls inside
 * a row. The four values live in the central theme of
 * `apps/web/src/tailwind.css`.
 *
 * Depth is decided once too. A page sits on the page plane and a `Card` sits
 * on the raised plane above it with the first elevation step, the subtle edge
 * and the card fill, so a light palette shows the shadow and a dark palette
 * shows the edge. An `EmptyState` is not a surface at all: it is an icon, a
 * title, one sentence and one action on the page, with no box around it. See
 * [decision 0052](../../../docs/decisions/0052-three-planes-and-one-elevation-scale.md),
 * [decision 0063](../../../docs/decisions/0063-the-resting-edge-of-a-control-is-the-divider.md)
 * and
 * [decision 0065](../../../docs/decisions/0065-one-recipe-for-a-control-and-one-grid-for-an-icon.md).
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { rowClassName } from './control-classes.ts';
import { CollapsibleSection } from './controls.tsx';
import {
  currentPageSection,
  pageColumnClassName,
  pageHeaderActionsClassName,
  pageRowClassName,
  pageSectionsShown,
  pageSideClassName,
  sectionScrollTop,
  type ChosenPageSection,
  type PageHeaderActionLayout,
  type PageSection,
} from './layout-classes.ts';

/**
 * The distance from the edge of the screen to the content of a page.
 *
 * One string, so a frame that cannot use `Page`, for example a fixed header
 * or a column that owns its own scrolling, still lines its content up with
 * every page of the application.
 */
export const pageGutter = 'px-gutter sm:px-gutter-wide';

/**
 * The frame of one route.
 *
 * The page owns the `main` landmark, so a route renders exactly one of them
 * and a child state returns a section instead of a second landmark.
 *
 * Every page is the one row of decision 0137: the column of the note measure
 * and the side region to its right. The page takes no width of its own, so
 * the column stays where it is when a person moves from one page to another.
 * A page of two or more sections passes them in `sections`, in page order,
 * and the side region lists them. The page renders its sections from the same
 * list, so the two cannot disagree.
 */
export function Page({
  children,
  sections = [],
}: {
  readonly children: ReactNode;
  readonly sections?: readonly PageSection[] | undefined;
}): ReactNode {
  return (
    <main className={`${pageRowClassName()} ${pageGutter}`}>
      <div className={`${pageColumnClassName()} py-6`}>{children}</div>
      <PageSide sections={sections} />
    </main>
  );
}

/**
 * The frame of one state inside a route that already owns `main`.
 *
 * The note screen owns its landmark and its own scrolling, so a state that it
 * shows before the editor opens, such as a wait or a note that is gone, takes
 * this frame. It is the row of `Page` with no landmark and no list.
 */
export function PageRegion({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className={`${pageRowClassName()} ${pageGutter}`}>
      <div className={`${pageColumnClassName()} py-6`}>{children}</div>
      <div className={pageSideClassName()} />
    </div>
  );
}

/**
 * The side region of a page.
 *
 * It keeps its width when it lists nothing, so the column does not move. It
 * stays in view while the page scrolls, and its first row lines up with the
 * page title.
 */
function PageSide({
  sections,
}: {
  readonly sections: readonly PageSection[];
}): ReactNode {
  if (!pageSectionsShown(sections))
    return <div className={pageSideClassName()} />;
  return (
    <aside
      className={`${pageSideClassName()} sticky top-0 self-start pb-6 pt-4`}
      aria-label="Sections of this page"
    >
      <PageSections sections={sections} />
    </aside>
  );
}

/** The element that a row of the list brings into view. */
function sectionTarget(id: string): HTMLElement | null {
  const heading = document.getElementById(id);
  if (heading === null) return null;
  return heading.closest('section') ?? heading;
}

/** The nearest ancestor that scrolls, where the page sits. */
function scrollerOf(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent !== null;
    parent = parent.parentElement
  ) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return parent;
  }
  return null;
}

/**
 * The list of the sections of a page, with the section in view marked.
 *
 * It is the outline of a page, so it takes the section and the rows of the
 * note outline. A row brings its section to the top of the scroller of the
 * page and marks it, and the next scroll of the person moves the mark again,
 * from the rule of `currentPageSection`.
 */
function PageSections({
  sections,
}: {
  readonly sections: readonly PageSection[];
}): ReactNode {
  const [open, setOpen] = useState(true);
  const [current, setCurrent] = useState<string | null>(null);
  const chosen = useRef<ChosenPageSection | null>(null);
  // The effect reads the sections again only when the list itself changes,
  // and not for each new array with the same rows.
  const ids = sections.map((section) => section.id).join('\n');
  useEffect(() => {
    const order = ids.split('\n');
    const first = sectionTarget(order[0] ?? '');
    const scroller = first === null ? null : scrollerOf(first);
    if (scroller === null) return;
    const read = (): void => {
      const origin = scroller.getBoundingClientRect().top;
      const tops = order.flatMap((id) => {
        const target = sectionTarget(id);
        return target === null
          ? []
          : [{ id, top: target.getBoundingClientRect().top - origin }];
      });
      const atEnd =
        scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      const next = currentPageSection(
        tops,
        atEnd,
        chosen.current,
        scroller.scrollTop,
      );
      if (next !== chosen.current?.id) chosen.current = null;
      setCurrent(next);
    };
    read();
    scroller.addEventListener('scroll', read, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', read);
    };
  }, [ids]);
  return (
    <CollapsibleSection
      id="page-sections"
      title="On this page"
      open={open}
      onToggle={setOpen}
    >
      <ol className="m-0 list-none p-0">
        {sections.map((section) => {
          const marked = section.id === current;
          return (
            <li key={section.id}>
              <button
                type="button"
                className={rowClassName({
                  current: marked,
                  className: 'w-full text-left',
                })}
                aria-current={marked ? 'location' : undefined}
                onClick={(): void => {
                  const target = sectionTarget(section.id);
                  const scroller = target === null ? null : scrollerOf(target);
                  if (target === null || scroller === null) return;
                  scroller.scrollTo({
                    top: sectionScrollTop(
                      scroller.scrollTop,
                      target.getBoundingClientRect().top,
                      scroller.getBoundingClientRect().top,
                    ),
                  });
                  // The scroller clamps the offset at its end, so the mark
                  // holds at the offset it reached and not the one it asked.
                  chosen.current = {
                    id: section.id,
                    scrollTop: scroller.scrollTop,
                  };
                  setCurrent(section.id);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </CollapsibleSection>
  );
}

/** The back control that every page header of a frame draws. */
const PageBackContext = createContext<ReactNode>(null);

/**
 * Gives every `PageHeader` below it one back control (record 0138).
 *
 * The control decides for itself where it goes and whether it draws, so one
 * element serves every page of the frame.
 */
export const PageBackProvider = PageBackContext.Provider;

/**
 * The title row of a screen, with optional actions below or on the right.
 *
 * The title block grows and can shrink to nothing, so a long description
 * never pushes the action onto a line of its own on a wide screen. Below
 * the small width the title takes a full line and the action wraps under
 * it, because a title squeezed next to a button is unreadable.
 *
 * The one back control of the page stands before the title on the title line
 * (record 0138). The frame of the application provides it with
 * `PageBackProvider`, because the address it goes to is a fact of the router
 * and not of this package, and every header inside the frame takes it, so no
 * page can leave it out or draw one of its own.
 */
export function PageHeader({
  title,
  description,
  actions,
  actionLayout = 'cluster',
  id,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly actions?: ReactNode | undefined;
  readonly actionLayout?: PageHeaderActionLayout | undefined;
  readonly id?: string | undefined;
}): ReactNode {
  const back = useContext(PageBackContext);
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-group">
      <div className="min-w-0 grow basis-full sm:basis-0">
        <div className="flex min-w-0 items-center gap-1">
          {back}
          <h1
            className="m-0 min-w-0 text-xl font-semibold tracking-heading text-strong"
            id={id}
          >
            {title}
          </h1>
        </div>
        {description === undefined || description === '' ? null : (
          <p className="mb-0 mt-1 text-help text-muted">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className={pageHeaderActionsClassName(actionLayout)}>
          {actions}
        </div>
      )}
    </div>
  );
}

/** A raised surface that groups related content. */
export function Card({
  children,
  title,
  titleId,
  className,
}: {
  readonly children: ReactNode;
  readonly title?: string | undefined;
  readonly titleId?: string | undefined;
  readonly className?: string | undefined;
}): ReactNode {
  const body = (
    <>
      {title === undefined ? null : (
        <h2
          className="mb-3 mt-0 text-base font-semibold text-strong"
          id={titleId}
        >
          {title}
        </h2>
      )}
      {children}
    </>
  );
  const classes = `rounded-lg border border-edge-subtle bg-card p-4 shadow-raised ${className ?? ''}`;
  if (title === undefined || titleId === undefined)
    return <div className={classes}>{body}</div>;
  return (
    <section className={classes} aria-labelledby={titleId}>
      {body}
    </section>
  );
}

/**
 * The state of a screen that holds nothing yet.
 *
 * An icon, a title, one sentence and one action, on the page and in no box. A
 * dashed box around an empty state is the most recognised mark of a generated
 * admin template, and the state is not a thing a person acts on, so it needs
 * no plane of its own.
 *
 * The caller passes the icon at 20 px, the one size an icon takes outside a
 * control, and the `icon-size` rule of `tools/check-design-rules.mjs` refuses
 * any other size.
 *
 * The title is a heading and not a paragraph that looks like one. An empty
 * state stands where a `Card` stands, under the one page title, so a person
 * who moves by heading reaches it.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  readonly icon?: ReactNode | undefined;
  readonly title: string;
  readonly description?: string | undefined;
  readonly action?: ReactNode | undefined;
}): ReactNode {
  return (
    <div className="py-10 text-center">
      {icon === undefined ? null : (
        <p className="m-0 flex justify-center text-muted" aria-hidden="true">
          {icon}
        </p>
      )}
      <h2 className="mb-0 mt-3 text-title font-semibold text-strong">
        {title}
      </h2>
      {description === undefined || description === '' ? null : (
        <p className="mx-auto mb-0 mt-1 max-w-sm text-help text-muted">
          {description}
        </p>
      )}
      {action === undefined ? null : (
        <div className="mt-4 flex justify-center">{action}</div>
      )}
    </div>
  );
}

/**
 * One row of a list of things.
 *
 * The row reads `rowClassName`, the one recipe of a row (decision 0065), so a
 * list row, a tree row and a menu row are one size, one radius and one focus
 * treatment. Rows separate by space and by fill and never by a rule.
 *
 * A row is a container by default: the caller puts a link or a button inside
 * it, the interactive element stays native and keeps its own accessible name,
 * and the row itself promises nothing. `href` or `onClick` makes the whole row
 * the control, which is what a tree row and a footer row of the sidebar need.
 * `selected` is a choice a person made and `current` is the route that is
 * open; both read as one mark.
 */
export function ListRow({
  children,
  className,
  selected,
  current,
  href,
  onClick,
  label,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly selected?: boolean | undefined;
  readonly current?: boolean | undefined;
  /** Makes the whole row a link to this address. */
  readonly href?: string | undefined;
  /** Makes the whole row a button that runs this. */
  readonly onClick?: (() => void) | undefined;
  /** The accessible name of the row, when its text is not the whole name. */
  readonly label?: string | undefined;
}): ReactNode {
  const interactive = href !== undefined || onClick !== undefined;
  const classes = rowClassName({
    selected,
    current,
    interactive,
    className,
  });
  // The list item stays a list item, and the control inside it takes the whole
  // row. `display: contents` would have done the same with one element fewer,
  // and it drops the item out of the list that assistive software counts.
  const filling = `${classes} min-w-0 flex-1`;
  if (href !== undefined)
    return (
      <li className="flex">
        <a
          className={filling}
          href={href}
          aria-current={current === true ? 'page' : undefined}
          aria-label={label}
        >
          {children}
        </a>
      </li>
    );
  if (onClick !== undefined)
    return (
      <li className="flex">
        <button
          type="button"
          className={filling}
          aria-current={current === true ? 'page' : undefined}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </button>
      </li>
    );
  return <li className={classes}>{children}</li>;
}
