import { pageGutter } from './public-layout.ts';
import { Stack, Inline } from './primitives.tsx';
import { useSettingsSurface, SettingsRowActions } from './settings-layout.tsx';
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
 * the same constant. `gap-2` and `gap-4` separate controls inside
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
  createElement,
  type ElementType,
  type ComponentPropsWithRef,
  createContext,
  useContext,
  type ReactNode,
  type HTMLAttributes,
  type Ref,
  type MouseEventHandler,
} from 'react';
import {
  rowClassName,
  buttonClassName,
  contentEdgeRowClassName,
} from './control-classes.ts';
import { ChevronRightIcon, MoreIcon } from './icons.tsx';
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
export { pageGutter } from './public-layout.ts';

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
    <main className={`${pageRowClassName()} ${pageGutter} py-6 coarse:py-4`}>
      <Stack gap={{ fine: 4, coarse: 3 }} className={pageColumnClassName()}>
        {children}
      </Stack>
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
    <Inline
      gap={4}
      align="start"
      justify="between"
      wrap
      className="ui-page-header"
    >
      <div
        className={
          actionLayout === 'inline'
            ? 'min-w-0 grow basis-0 flex flex-col gap-1'
            : 'min-w-0 grow basis-full sm:basis-0 flex flex-col gap-1'
        }
      >
        <Inline gap={1} align="start" className="min-w-0">
          {back}
          <h1
            className="m-0 min-w-0 text-title-page tracking-heading text-strong"
            id={id}
          >
            {title}
          </h1>
        </Inline>
        {description === undefined || description === '' ? null : (
          <p className="text-secondary text-muted">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className={pageHeaderActionsClassName(actionLayout)}>
          {actions}
        </div>
      )}
    </Inline>
  );
}

/** A raised surface that groups related content. */
export function Card<T extends ElementType = 'div'>({
  as,
  children,
  title,
  titleId,
  className = '',
  responsive = false,
  ...props
}: {
  readonly as?: T;
  readonly children: ReactNode;
  readonly title?: string | undefined;
  readonly titleId?: string | undefined;
  readonly className?: string | undefined;
  readonly responsive?: boolean;
} & Omit<
  ComponentPropsWithRef<T>,
  'as' | 'children' | 'className'
>): ReactNode {
  return createElement(
    as ?? 'div',
    {
      ...props,
      'data-ui-card': '',
      className: `flex min-w-0 flex-col gap-0 rounded-xl ${responsive ? 'bg-transparent coarse:bg-card-raised' : 'bg-card-raised'} ${className}`,
    },
    title === undefined ? null : (
      <h2 id={titleId} className="text-title-header text-strong">
        {title}
      </h2>
    ),
    children,
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
    <Stack
      pad={{ fine: 3, coarse: 4 }}
      gap={3}
      align="center"
      className="text-center"
    >
      {icon === undefined ? null : (
        <span className="text-muted" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2 className="text-title-header text-strong">{title}</h2>
      {description === undefined || description === '' ? null : (
        <p className="max-w-sm text-secondary text-muted">{description}</p>
      )}
      {action}
    </Stack>
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
export type RowDensity = 'tree' | 'setting' | 'menu';
export type RowTrailing =
  | { readonly kind: 'chevron' }
  | { readonly kind: 'value' }
  | { readonly kind: 'switch'; readonly checked: boolean }
  | {
      readonly kind: 'action';
      readonly label: string;
      readonly onClick: () => void;
      readonly danger?: boolean;
    }
  | {
      readonly kind: 'menu';
      readonly label: string;
      readonly onClick: () => void;
    };
export function listRowClasses(
  density: RowDensity,
  contentEdge = false,
): string {
  return density === 'setting'
    ? 'ui-settings-row relative flex min-w-0 w-full items-center gap-4 py-3 px-0 coarse:px-4 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b after:border-edge-subtle coarse:after:left-4 last:after:hidden'
    : `flex min-w-0 w-full items-center gap-2 rounded-md text-left py-1 coarse:rounded-lg coarse:py-2 ${contentEdge ? 'px-0 ' + contentEdgeRowClassName : 'px-2 coarse:px-3'}`;
}
export function ListRow({
  children,
  className = '',
  selected,
  current,
  href,
  onClick,
  label,
  leading,
  help,
  helpId,
  value,
  trailing,
  control: customControl,
  labelTone,
  density,
  indent = 0,
  contentEdge = false,
  as,
  buttonRef,
  ...nativeProps
}: Omit<HTMLAttributes<HTMLElement>, 'onClick'> & {
  readonly children?: ReactNode;
  readonly className?: string | undefined;
  readonly selected?: boolean | undefined;
  readonly current?: boolean | undefined;
  readonly href?: string | undefined;
  readonly onClick?: MouseEventHandler<HTMLElement> | undefined;
  readonly label?: ReactNode;
  readonly leading?: ReactNode;
  readonly help?: ReactNode;
  readonly helpId?: string;
  readonly value?: ReactNode;
  readonly trailing?: RowTrailing;
  readonly density?: RowDensity;
  readonly control?: ReactNode;
  readonly labelTone?: 'accent' | 'danger';
  readonly indent?: number;
  readonly contentEdge?: boolean;
  readonly as?: 'li' | 'div' | 'button' | 'a';
  readonly buttonRef?: Ref<HTMLButtonElement> | undefined;
  readonly disabled?: boolean | undefined;
}): ReactNode {
  const settings = useSettingsSurface(),
    rowDensity = density ?? (settings ? 'setting' : 'tree');
  const structured = children === undefined;
  const control =
    customControl ??
    (trailing?.kind === 'chevron' ? (
      <ChevronRightIcon />
    ) : trailing?.kind === 'switch' ? (
      <span
        className={`inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-edge-line p-1 ${trailing.checked ? 'justify-end bg-accent-fill' : 'justify-start bg-hover'}`}
        aria-hidden="true"
      >
        <span
          className={`h-4 w-4 rounded-full ${trailing.checked ? 'bg-on-accent' : 'bg-muted'}`}
        />
      </span>
    ) : trailing?.kind === 'action' ? (
      <button
        type="button"
        className={buttonClassName({
          variant: 'ghost',
          size: 'compact',
          tone: trailing.danger ? 'danger' : undefined,
        })}
        onClick={trailing.onClick}
      >
        {trailing.label}
      </button>
    ) : trailing?.kind === 'menu' ? (
      <button
        type="button"
        aria-label={trailing.label}
        className={buttonClassName({ variant: 'ghost', iconOnly: true })}
        onClick={trailing.onClick}
      >
        <MoreIcon />
      </button>
    ) : null);
  const body = structured ? (
    <>
      {leading}
      <span
        data-setting-text={rowDensity === 'setting' ? '' : undefined}
        className="ui-settings-copy flex min-w-0 flex-1 flex-col gap-0.5"
      >
        <span
          data-setting-label={rowDensity === 'setting' ? '' : undefined}
          className={`${selected || current ? 'text-label' : 'text-body'} ${labelTone === 'danger' ? 'text-danger' : labelTone === 'accent' ? 'text-accent' : 'text-strong'} ${rowDensity === 'tree' ? 'truncate' : ''}`}
        >
          {label}
        </span>
        {help ? (
          <span
            data-setting-help={rowDensity === 'setting' ? '' : undefined}
            id={helpId}
            className="text-secondary text-muted"
          >
            {help}
          </span>
        ) : null}
      </span>
      {value !== undefined || control ? (
        <span
          data-setting-control={rowDensity === 'setting' ? '' : undefined}
          className={`ui-settings-control inline-flex shrink-0 items-center justify-end gap-2 text-value text-muted ${rowDensity === 'setting' ? 'h-7 coarse:h-5' : ''}`}
        >
          {value}
          {control}
        </span>
      ) : null}
    </>
  ) : (
    children
  );
  const content =
    rowDensity === 'setting' ? (
      <SettingsRowActions>{body}</SettingsRowActions>
    ) : (
      body
    );
  const classes = `${listRowClasses(rowDensity, contentEdge)} ${rowClassName({
    layout: false,
    selected,
    current,
    interactive: href !== undefined || onClick !== undefined,
  })
    .replace('ui-tree-row', '')
    .replace('px-2', '')
    .replace('gap-2', '')} ${className}`;
  const ariaLabel =
    nativeProps['aria-label'] ??
    (typeof label === 'string' ? label : undefined);
  const row =
    href !== undefined ? (
      <a
        {...nativeProps}
        data-ui-row={rowDensity}
        className={classes}
        href={href}
        aria-current={current ? 'page' : undefined}
        aria-label={ariaLabel}
      >
        {content}
      </a>
    ) : onClick !== undefined || as === 'button' ? (
      <button
        {...nativeProps}
        data-ui-row={rowDensity}
        ref={buttonRef}
        type="button"
        className={classes}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    ) : as === 'div' ? (
      <div {...nativeProps} data-ui-row={rowDensity} className={classes}>
        {content}
      </div>
    ) : (
      <li {...nativeProps} data-ui-row={rowDensity} className={classes}>
        {content}
      </li>
    );
  const wrapped =
    indent > 0 ? (
      <div className="flex w-full items-stretch">
        {Array.from({ length: indent }, (_, index) => (
          <span key={index} className="w-5 shrink-0" aria-hidden="true" />
        ))}
        {row}
      </div>
    ) : (
      row
    );
  return (href !== undefined || onClick !== undefined) && as === undefined ? (
    <li className="flex">{wrapped}</li>
  ) : (
    wrapped
  );
}
