/**
 * Layout primitives of the application.
 *
 * Every screen frames itself with `Page` and titles itself with `PageHeader`,
 * so spacing, measure, and the heading ramp are decided once. The heading ramp
 * of the chrome uses the roles of `typography.ts`: page and header titles,
 * body rows, labels, values, secondary text, and quiet group headings.
 * Keyboard hints and avatar letters alone use the small step.
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
import { createContext, useContext, type ReactNode } from 'react';
import { rowClassName } from './control-classes.ts';
import {
  pageColumnClassName,
  pageHeaderActionsClassName,
  pageRowClassName,
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
 * Every page uses one centred 720 px column. Sections stay inside that
 * column. The note editor retains its own document measure and outline.
 * The optional sections prop remains compatible with existing callers.
 */
export function Page({
  children,
}: {
  readonly children: ReactNode;
  readonly sections?: readonly PageSection[] | undefined;
}): ReactNode {
  return (
    <main className={`${pageRowClassName()} ${pageGutter}`}>
      <div className={pageColumnClassName()}>{children}</div>
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
      <div className={pageColumnClassName()}>{children}</div>
    </div>
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
    <div className="ui-page-header flex flex-wrap items-start justify-between gap-group">
      <div
        className={
          actionLayout === 'inline'
            ? 'min-w-0 grow basis-0'
            : 'min-w-0 grow basis-full sm:basis-0'
        }
      >
        <div className="flex min-w-0 items-start gap-1">
          {back}
          <h1
            className="m-0 min-w-0 text-title-page tracking-heading text-strong"
            id={id}
          >
            {title}
          </h1>
        </div>
        {description === undefined || description === '' ? null : (
          <p className="mb-0 mt-1 text-secondary text-muted">{description}</p>
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
        <h2 className="mb-3 mt-0 text-title-header text-strong" id={titleId}>
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
    <div className="py-8 text-center">
      {icon === undefined ? null : (
        <p className="m-0 flex justify-center text-muted" aria-hidden="true">
          {icon}
        </p>
      )}
      <h2 className="mb-0 mt-3 text-title-header text-strong">{title}</h2>
      {description === undefined || description === '' ? null : (
        <p className="mx-auto mb-0 mt-1 max-w-sm text-secondary text-muted">
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
    className: `ui-list-row ${className ?? ''}`,
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
