/**
 * Layout primitives of the application.
 *
 * Every screen frames itself with `Page` and titles itself with
 * `PageHeader`, so spacing, measure, and the heading ramp are decided once.
 * The heading ramp is: the note title is the largest item on the note
 * screen, a page title is `text-xl`, a section title is `text-base`, and a
 * quiet group label is `text-control`. There is no smaller size than
 * `text-control`.
 *
 * Distance is decided once as well. `pageGutter` below is the one distance
 * from the edge of the screen to the content of a page, and every frame that
 * is not a `Page`, such as the application header and the note column, reads
 * the same constant. `gap-cluster` and `gap-group` separate controls inside
 * a row. The four values live in the central theme of
 * `apps/web/src/tailwind.css`.
 */
import type { ReactNode } from 'react';

/**
 * The distance from the edge of the screen to the content of a page.
 *
 * One string, so a frame that cannot use `Page`, for example a fixed header
 * or a column that owns its own scrolling, still lines its content up with
 * every page of the application.
 */
export const pageGutter = 'px-gutter sm:px-gutter-wide';

/** How wide the reading column of a screen is. */
export type PageWidth = 'reading' | 'wide';

/**
 * The frame of one route.
 *
 * The page owns the `main` landmark, so a route renders exactly one of them
 * and a child state returns a section instead of a second landmark.
 */
export function Page({
  children,
  width = 'reading',
  className,
}: {
  readonly children: ReactNode;
  readonly width?: PageWidth | undefined;
  readonly className?: string | undefined;
}): ReactNode {
  const measure = width === 'wide' ? 'max-w-5xl' : 'max-w-3xl';
  return (
    <main
      className={`mx-auto w-full ${measure} ${pageGutter} py-6 ${className ?? ''}`}
    >
      {children}
    </main>
  );
}

/**
 * The title row of a screen, with one optional action on the right.
 *
 * The title block grows and can shrink to nothing, so a long description
 * never pushes the action onto a line of its own on a wide screen. Below
 * the small width the title takes a full line and the action wraps under
 * it, because a title squeezed next to a button is unreadable.
 */
export function PageHeader({
  title,
  description,
  actions,
  id,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly actions?: ReactNode | undefined;
  readonly id?: string | undefined;
}): ReactNode {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-group">
      <div className="min-w-0 grow basis-full sm:basis-0">
        <h1 className="m-0 text-xl font-semibold text-strong" id={id}>
          {title}
        </h1>
        {description === undefined || description === '' ? null : (
          <p className="mb-0 mt-1 text-control text-muted">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 items-center gap-cluster">{actions}</div>
      )}
    </div>
  );
}

/** A quiet surface that groups related content. */
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
  const classes = `rounded-xl border border-edge-subtle bg-card p-4 ${className ?? ''}`;
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
 * One sentence, one optional hint, and one primary action. A screen never
 * shows two primary actions, so the action here is the only one on it.
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
    <div className="rounded-xl border border-dashed border-edge-subtle bg-card px-gutter-wide py-14 text-center">
      {icon === undefined ? null : (
        <p className="m-0 flex justify-center text-muted" aria-hidden="true">
          {icon}
        </p>
      )}
      <p className="mb-0 mt-3 text-base font-semibold text-strong">{title}</p>
      {description === undefined || description === '' ? null : (
        <p className="mx-auto mb-0 mt-2 max-w-md text-control text-muted">
          {description}
        </p>
      )}
      {action === undefined ? null : (
        <div className="mt-5 flex justify-center">{action}</div>
      )}
    </div>
  );
}

/**
 * One row of a list of things.
 *
 * The row is a container only. The caller puts a link or a button inside it,
 * so the interactive element stays native and keeps its own accessible name.
 */
export function ListRow({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}): ReactNode {
  return (
    <li
      className={`flex min-h-11 items-center gap-group border-b border-edge-subtle px-1 py-2 last:border-b-0 ${className ?? ''}`}
    >
      {children}
    </li>
  );
}

/** A horizontal group of controls with one accessible name. */
export function Toolbar({
  label,
  children,
  className,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}): ReactNode {
  return (
    <div
      className={`flex flex-wrap items-center gap-cluster ${className ?? ''}`}
      role="toolbar"
      aria-label={label}
    >
      {children}
    </div>
  );
}
