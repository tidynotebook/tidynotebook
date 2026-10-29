/**
 * The one recipe of every control, as pure functions.
 *
 * A control in `controls.tsx` is JSX, so no unit test can load it. The rules
 * that decide how a control looks, and how it names itself to a person who
 * cannot see it, are not JSX, and they are the part a rule of this repository
 * holds: the named scale, the palette, the ban on making a colour at paint
 * time, and the accessible name of every action. They live here so
 * `control-classes.test.ts` can read them, and every control of the product
 * renders with them.
 *
 * Nothing outside this module writes the classes of a button, a clickable
 * row, a field or a keyboard hint. See
 * [decision 0065](../../../docs/decisions/0065-one-recipe-for-a-control-and-one-grid-for-an-icon.md).
 */
import {
  transitionField,
  transitionRaise,
  transitionSurface,
} from './motion.ts';

/**
 * The focus treatment of a control with room around it.
 *
 * One treatment for the whole product: two pixels of the focus colour, which
 * `theme.test.ts` holds to the 3 to 1 non text minimum on every surface. The
 * outline sits outside the control, so it never covers the label.
 *
 * `focus-visible` and never `focus`, so a pointer press does not leave a ring
 * behind on a control a person already clicked.
 */
export const focusOutline =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * The focus treatment of a control inside a box that scrolls.
 *
 * The same two pixels, drawn inside the edge of the control. A tree row, a
 * menu row and a list row sit in a box that clips its children, and an
 * outline offset outward is the part that box cuts off first.
 */
export const focusOutlineInset =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus';

/** How a button looks. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** How large a button is. */
export type ButtonSize = 'sm' | 'md' | 'touch' | 'inline';

/**
 * The tone of a quiet button.
 *
 * `danger` marks a ghost or a secondary button that starts a destructive
 * action, such as Delete on a Trash row, before the filled
 * `danger` variant confirms it. The tone is part of the recipe and never a
 * class a caller adds, because two colour utilities on one element are decided
 * by the stylesheet and not by the caller (decision 0065).
 */
export type ButtonTone = 'danger';

/** The colour key of one button: its variant, and its tone where it has one. */
type ButtonColour = ButtonVariant | 'secondary-danger' | 'ghost-danger';

/**
 * The colour and surface of every button, written out in full.
 *
 * Tailwind reads the source text to decide which utilities to emit, so a
 * class that a template builds from a prefix and a name is never emitted
 * unless another file happens to write it whole. The group hover of a compact
 * primary or danger button was such a class, and it drew no hover at all.
 * Every class is therefore a whole word here, and
 * `tests/integration/theme-variables.test.ts` finds each class that a recipe
 * answers in the built stylesheet.
 *
 * A disabled button states that it is unavailable with its own colours: the
 * muted text on the surface of `disabledButtonSurface`, in every state. An
 * opacity on the whole control did that before, and it made a colour at paint
 * time that no contrast test could see: the ink fill of a primary button at
 * half strength was a grey fill that still read as the action of the screen.
 * The hover of a disabled button names the same surface. A variant prefix
 * outranks the plain class, and the second prefix outranks the hover of the
 * resting recipe, so the outcome does not depend on the order of the
 * stylesheet. A compact button carries both states on its `group`.
 */
const buttonColours: Readonly<
  Record<'button' | 'group', Readonly<Record<ButtonColour, string>>>
> = {
  button: {
    primary:
      'bg-accent-fill text-on-accent hover:bg-accent-fill-hover disabled:bg-hover disabled:hover:bg-hover disabled:text-muted',
    danger:
      'bg-danger-fill text-on-danger hover:bg-danger-fill-hover disabled:bg-hover disabled:hover:bg-hover disabled:text-muted',
    secondary:
      'border border-edge-line bg-card text-strong shadow-raised hover:bg-hover disabled:bg-card disabled:hover:bg-card disabled:text-muted',
    'secondary-danger':
      'border border-edge-line bg-card text-danger shadow-raised hover:bg-danger-surface disabled:bg-card disabled:hover:bg-card disabled:text-muted',
    ghost:
      'bg-transparent text-strong hover:bg-hover disabled:bg-transparent disabled:hover:bg-transparent disabled:text-muted',
    'ghost-danger':
      'bg-transparent text-danger hover:bg-danger-surface disabled:bg-transparent disabled:hover:bg-transparent disabled:text-muted',
  },
  group: {
    primary:
      'bg-accent-fill text-on-accent group-hover:bg-accent-fill-hover group-disabled:bg-hover group-disabled:group-hover:bg-hover group-disabled:text-muted',
    danger:
      'bg-danger-fill text-on-danger group-hover:bg-danger-fill-hover group-disabled:bg-hover group-disabled:group-hover:bg-hover group-disabled:text-muted',
    secondary:
      'border border-edge-line bg-card text-strong shadow-raised group-hover:bg-hover group-disabled:bg-card group-disabled:group-hover:bg-card group-disabled:text-muted',
    'secondary-danger':
      'border border-edge-line bg-card text-danger shadow-raised group-hover:bg-danger-surface group-disabled:bg-card group-disabled:group-hover:bg-card group-disabled:text-muted',
    ghost:
      'bg-transparent text-strong group-hover:bg-hover group-disabled:bg-transparent group-disabled:group-hover:bg-transparent group-disabled:text-muted',
    'ghost-danger':
      'bg-transparent text-danger group-hover:bg-danger-surface group-disabled:bg-transparent group-disabled:group-hover:bg-transparent group-disabled:text-muted',
  },
};

/** The colour and surface of one button. */
function buttonVariantClassName(
  variant: ButtonVariant,
  tone: ButtonTone | undefined,
  interaction: 'button' | 'group',
): string {
  const colours = buttonColours[interaction];
  if (tone === 'danger' && variant === 'secondary')
    return colours['secondary-danger'];
  if (tone === 'danger' && variant === 'ghost') return colours['ghost-danger'];
  return colours[variant];
}

/**
 * The surface a disabled button rests on, by variant.
 *
 * A filled button gives up its fill, because the fill is what states that
 * this is the action of the screen. Every other button keeps its surface.
 * Each of these is a fill that `theme-rules.ts` holds the muted text to, so
 * an unavailable label still reads on every palette.
 */
export const disabledButtonSurface: Readonly<
  Record<ButtonVariant, 'bg-hover' | 'bg-card' | 'bg-transparent'>
> = {
  primary: 'bg-hover',
  danger: 'bg-hover',
  secondary: 'bg-card',
  ghost: 'bg-transparent',
};

/**
 * The appearance of a button, as classes.
 *
 * A control that navigates is an anchor and never a button, so the platform
 * keeps the middle click, the context menu, and the address. The router of
 * the application owns that anchor, so this function hands out the same
 * appearance to it and every action button of a screen looks the same.
 *
 * `primary` is the one action of a screen. `secondary` is every other button:
 * the card fill, the resting divider as its edge (decision 0063) and one
 * elevation step, so a light palette shows the shadow and a dark palette
 * shows the edge. `ghost` is an icon only action and a Cancel, and it draws
 * nothing until a pointer or the keyboard reaches it. `danger` confirms a
 * destructive action.
 *
 * A filled button reads its hover fill from the palette (decision 0057). The
 * registry moves that fill away from the page background, so the control comes
 * forward on a light palette and on a dark one, and the contrast test holds
 * the label of the fill on it. Nothing scales on press: a control that moves
 * under the pointer moves the target a person is aiming at.
 */
export function buttonClassName(
  options: {
    readonly variant?: ButtonVariant | undefined;
    readonly size?: ButtonSize | undefined;
    readonly tone?: ButtonTone | undefined;
    readonly iconOnly?: boolean | undefined;
    readonly compact?: boolean | undefined;
    readonly className?: string | undefined;
  } = {},
): string {
  const variant = options.variant ?? 'primary';
  const size = options.size ?? 'md';
  const compact = options.compact === true;
  const variantClass = compact
    ? 'group bg-transparent'
    : buttonVariantClassName(variant, options.tone, 'button');

  const sizeClass = options.iconOnly
    ? 'ui-icon-button'
    : compact || size === 'inline'
      ? 'ui-compact'
      : '';
  return [
    `ui-button inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-label no-underline ${transitionSurface} ${compact ? 'focus-visible:outline-none' : focusOutline} disabled:cursor-not-allowed`,
    variantClass,
    sizeClass,
    options.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The visible surface inside a compact button.
 *
 * The button keeps its 44 px touch target. A small surface is 32 px under
 * touch and 28 px on a desktop. It takes the focus treatment, fill, and hover
 * state that a person sees. An icon-only surface stays square.
 */
export function compactButtonVisualClassName(options: {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly tone?: ButtonTone | undefined;
  readonly iconOnly: boolean;
}): string {
  const variant = options.variant ?? 'primary';
  const size = options.size ?? 'md';
  const sizeClass = options.iconOnly
    ? size === 'sm'
      ? 'size-8 md:size-7'
      : 'size-9 md:size-8'
    : size === 'sm'
      ? 'min-h-8 px-2 md:min-h-7'
      : 'min-h-9 px-3 md:min-h-8';
  return [
    `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md ${transitionSurface}`,
    'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus',
    buttonVariantClassName(variant, options.tone, 'group'),
    sizeClass,
  ].join(' ');
}

/**
 * The appearance of an account avatar, as classes.
 *
 * A monochrome circle of the initial of the account, and the one mark of the
 * product that is not an icon and not a word (record 0064). It is 24 px, one
 * step wider than the 16 px icon beside it, because a letter needs more room
 * than a glyph drawn on the icon grid. `edgeControlClassName` reads that
 * width, so the two facts stay one fact.
 */
export function avatarClassName(): string {
  return 'inline-flex size-6 items-center justify-center rounded-full bg-active text-avatar text-strong';
}

/** The mark that a control at the edge of a frame draws inside its box. */
export type EdgeMark = 'icon' | 'avatar';

/** The side of a frame that a control sits on. */
export type FrameEdge = 'start' | 'end';

/**
 * The pull of a small compact control at the edge of a frame, as classes.
 *
 * A compact control keeps the 44 px touch target and draws a smaller surface
 * inside it, so the mark that a person reads sits well inside the box. At the
 * edge of a frame that distance pushes the mark off the gutter line, and the
 * header stops lining up with the page below it. The control takes the
 * distance back as a negative margin: the box grows into the gutter, the
 * touch target stays 44 px, and the mark lands on the line. The sidebar
 * reaches the same line with padding, because a row of 8 px inside a column
 * of 8 px puts the text of the row 16 px from the edge.
 *
 * The pull is half of the difference between the box and the mark. A small
 * control is 44 px under touch and 28 px from the medium width up, an icon is
 * 16 px and the avatar of the account menu is 24 px. An icon therefore takes
 * 14 px and then 6 px, and the avatar takes 10 px and then 2 px.
 * `control-classes.test.ts` holds each string below to that arithmetic.
 */
export function edgeControlClassName(options: {
  readonly edge: FrameEdge;
  readonly mark: EdgeMark;
}): string {
  return options.edge === 'start'
    ? options.mark === 'avatar'
      ? '-ms-2.5 pointer-fine:-ms-0.5'
      : '-ms-3.5 pointer-fine:-ms-1.5'
    : options.mark === 'avatar'
      ? '-me-2.5 pointer-fine:-me-0.5'
      : '-me-3.5 pointer-fine:-me-1.5';
}

/**
 * The box of a row of small compact controls that scrolls sideways, as
 * classes.
 *
 * A row that can hold more controls than its width, such as the formatting
 * tools of a note, scrolls instead of hiding the rest in a menu, so every
 * control stays one press away and no list covers the text (record 0094).
 *
 * A box that scrolls clips what reaches past it. The first control of the row
 * pulls its box into the gutter so its mark lands on the line of the text
 * (`edgeControlClassName`), and inside a scroller that pull is the part the
 * box cuts off. The scroller takes the pull instead: it grows by the pull on
 * both sides, so the first and the last mark land on the line. From the
 * medium width up a control is as small as its surface, and the focus outline
 * reaches four pixels past it, so the scroller grows four pixels more and
 * pads them back. Under touch the 44 px box already holds the outline.
 * `control-classes.test.ts` holds the strings to that arithmetic.
 */
export function controlStripClassName(): string {
  return 'flex items-center overflow-x-auto py-1 -mx-3.5 pointer-fine:-mx-2.5 pointer-fine:px-1';
}

/**
 * The appearance of a clickable row, as classes.
 *
 * One recipe for every row a person can press: a tree row, a list row, a menu
 * row, a row of the command palette and a footer row of the sidebar. A row is
 * 28 px on a desktop and 44 px under touch, it separates from its neighbour
 * by space and by fill and never by a rule, and it takes no ring.
 *
 * `selected` is the choice a person made, for example the folder that a new
 * note goes into. `current` is the route that is open, which a row states to
 * assistive software with `aria-current`. Both read as one mark, because a
 * person reads one list and needs one answer to "which row is mine".
 *
 * `inset` is true by default, because almost every row of the product sits in
 * a box that scrolls and clips. A row that stands on its own passes false and
 * takes the outward outline of every other control.
 *
 * `interactive` is true by default. A row that is only a container, with the
 * actions inside it, passes false: it keeps the size, the radius and the
 * spacing of a row and drops the pointer, the hover and the focus treatment,
 * so the cursor never promises an action the row does not have.
 *
 * `danger` is a row that destroys something, such as Delete in a menu, or a
 * row that reports work a person has to rescue. The tone is part of the
 * recipe and not a class a caller adds, because two colour utilities on one
 * element are decided by the order of the stylesheet and not by the order of
 * the string: `text-danger` appended to this recipe lost to the `text-ink` of
 * the recipe itself, so every Delete row of the product was the colour of
 * every other row.
 */
export function rowClassName(
  options: {
    readonly selected?: boolean | undefined;
    /** Aligns a Settings control with the content column. */
    readonly flush?: boolean | undefined;
    readonly current?: boolean | undefined;
    readonly inset?: boolean | undefined;
    readonly interactive?: boolean | undefined;
    readonly danger?: boolean | undefined;
    readonly className?: string | undefined;
  } = {},
): string {
  const marked = options.selected === true || options.current === true;
  const interactive = options.interactive ?? true;
  // A row with a tone keeps that tone in every state, so the mark and the
  // hover of a toned row change the fill alone. One colour utility for one
  // element, because two of them are decided by the order of the stylesheet
  // and not by the order of the string.
  const toned = options.danger === true;
  const colour = toned ? 'text-danger' : 'text-strong';
  const state = marked
    ? toned
      ? 'bg-active text-label'
      : 'bg-active text-strong text-label'
    : interactive
      ? toned
        ? 'hover:bg-hover'
        : 'hover:bg-hover hover:text-strong'
      : '';
  // A row that is a button can be disabled, such as a menu row that cannot
  // run now. It takes the muted text and keeps its fill under the pointer,
  // the way a disabled button does, and no opacity makes a colour of it. A
  // marked row states no hover, so it has none to undo.
  const disabled = interactive
    ? marked
      ? 'disabled:cursor-not-allowed disabled:text-muted'
      : 'disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted'
    : '';
  return [
    `ui-tree-row flex items-center gap-2 rounded-md ${options.flush === true ? 'px-0' : 'px-2'} text-body ${colour} no-underline ${transitionSurface}`,
    interactive ? 'cursor-pointer' : '',
    disabled,
    interactive
      ? options.inset === false
        ? focusOutline
        : focusOutlineInset
      : '',
    state,
    options.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The appearance of one button of the view bar of the sidebar, as classes.
 *
 * An icon-only button that selects what the sidebar shows (record 0105). It
 * is 44 px under touch and 32 px on a desktop. The view that shows takes the
 * mark of a current row, so the bar and the tree state "where am I" in one
 * way, and a view that does not show is muted until a pointer reaches it.
 */
export function sidebarViewClassName(options: {
  readonly current: boolean;
}): string {
  return [
    `ui-button ui-icon-button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md ${transitionSurface} ${focusOutline}`,
    options.current
      ? 'bg-active text-strong'
      : 'text-muted hover:bg-hover hover:text-strong',
  ].join(' ');
}

/**
 * The appearance of a task box, as classes.
 *
 * A task box is a control whose state a person reads from its shape alone
 * (record 0033), so it is one of the five controls that take the component
 * edge (record 0063). The published page draws the native box of a task with
 * these classes, and `tests/integration/published-styles.test.ts` holds its
 * copy to this recipe. The editor draws the same box with the same edge from
 * its theme. This is the one place of the web that names the task box edge,
 * so the `stateful-edge` rule reads it here and needs no exception.
 */
export function taskBoxClassName(): string {
  return 'size-4 appearance-none rounded-sm border border-edge bg-app align-middle';
}

/**
 * The appearance of one tab of a set of views, as classes.
 *
 * A tab chooses which view of one thing a panel shows, such as the changes
 * of a version or its preview in History (record 0166). It reads as a chip:
 * the text of a control at the medium weight, `rounded-md`, the hover fill at
 * rest and the fill of a chosen row when its view shows, so the tab that is
 * open is the one mark of the set and no line is drawn under it. It is 28 px
 * on a desktop and 44 px under touch, like a row.
 */
export function tabClassName(options: { readonly selected: boolean }): string {
  return [
    `ui-button ui-compact inline-flex shrink-0 cursor-pointer items-center rounded-md text-label ${transitionSurface} ${focusOutline}`,
    options.selected
      ? 'bg-active text-strong'
      : 'text-muted hover:bg-hover hover:text-strong',
  ].join(' ');
}

/**
 * The appearance of a field inside a row, as classes.
 *
 * A row of the tree turns its name into this field while a person renames
 * it (record 0164). The field takes the height of the text inside the row,
 * so the row keeps its own height and the rows below it do not move. It has
 * the fill of a field and the resting edge, and the focus edge of every
 * field.
 */
export function inlineFieldClassName(): string {
  return `ui-field min-w-0 flex-1 rounded-sm border bg-app text-body text-strong outline-none ${transitionField} border-edge-line focus-visible:border-focus`;
}

/** The classes of the parts of one checkbox and its label. */
export type CheckboxClassNames = {
  /** The label around the box and its words. */
  readonly label: string;
  /** The frame of the box, which holds the box and its check mark. */
  readonly frame: string;
  /** The native box, its appearance drawn again from the theme. */
  readonly box: string;
  /** The check mark over the box, which shows while the box is checked. */
  readonly mark: string;
};

/**
 * The appearance of a checkbox and its label, as classes.
 *
 * The box is a native input, so the space key, the label click and the
 * reported state come from the platform. Its own appearance is removed and
 * drawn again from the theme, because a native box paints the accent of the
 * operating system. The box carries the component edge, `edge`, which is one
 * of the five controls that decision 0063 reserves it for: a person reads
 * the state of a checkbox from its shape alone. The check mark is the check
 * glyph of the icon set, which follows the box with `peer-checked`.
 *
 * `Checkbox` of `controls.tsx` and the find panel of the editor, which builds
 * its own DOM, both read this.
 */
export function checkboxClassNames(
  options: { readonly disabled?: boolean | undefined } = {},
): CheckboxClassNames {
  return {
    label: `inline-flex min-h-11 items-center gap-2 text-body md:min-h-8 ${options.disabled === true ? 'cursor-not-allowed text-muted' : 'cursor-pointer text-strong'}`,
    frame: 'relative inline-flex size-4 shrink-0 items-center justify-center',
    box: `peer size-4 cursor-pointer appearance-none rounded-sm border border-edge bg-app ${transitionSurface} checked:border-accent-fill checked:bg-accent-fill disabled:cursor-not-allowed disabled:checked:border-edge disabled:checked:bg-hover ${focusOutline}`,
    mark: 'pointer-events-none absolute inset-0 hidden text-on-accent peer-checked:block peer-disabled:text-muted',
  };
}

/**
 * The parts of the surface of a menu: each class and the value it sets.
 *
 * One table states both, so the classes of a menu and the style of a menu
 * that no class reaches cannot drift. `theme-variables.test.ts` holds each
 * value to the theme variable that its class reads.
 */
const menuSurfaceParts = [
  {
    classes: 'rounded-lg',
    property: 'borderRadius',
    value: 'var(--radius-lg)',
  },
  {
    classes: 'border border-overlay-edge',
    property: 'border',
    value: '1px solid var(--notes-border-overlay)',
  },
  {
    classes: 'bg-overlay',
    property: 'backgroundColor',
    value: 'var(--notes-surface-overlay)',
  },
  { classes: 'p-1', property: 'padding', value: 'var(--spacing)' },
  {
    classes: 'shadow-overlay',
    property: 'boxShadow',
    value: 'var(--shadow-overlay)',
  },
] as const;

/**
 * The surface of a menu, as classes: a raised card of the overlay step.
 *
 * `rounded-lg`, the subtle edge of a raised surface and the card plane, with
 * a small inset for its rows (records 0052 and 0065). A menu of `menu.tsx`
 * reads it.
 */
export function menuSurfaceClassName(): string {
  return `flex flex-col ${menuSurfaceParts.map((part) => part.classes).join(' ')} ${transitionRaise}`;
}

/**
 * The surface of a menu, as style values, for a typed adapter whose menu no
 * class reaches: the completion list of the editor, which CodeMirror builds.
 */
export const menuSurfaceStyle: Readonly<Record<string, string>> =
  Object.fromEntries(
    menuSurfaceParts.map((part) => [part.property, part.value]),
  );

/** The class and the value of each part of the surface of a menu. */
export const menuSurfaceValues: readonly {
  readonly classes: string;
  readonly property: string;
  readonly value: string;
}[] = menuSurfaceParts;

/** Fields use the body role. The iOS-only viewport rule prevents focus zoom. */

/**
 * The appearance of a field, as classes.
 *
 * A text field, a select and a read only field all read this, so the three
 * copies of one field are one field. The resting edge is the derived divider
 * (decision 0063): a field is identified by its label above it, by its fill
 * and by the ring it takes when it is active, and the component edge on a
 * field read as a cage around every form of the product. Record 0063 states
 * the trade, so nobody reports it as a defect.
 *
 * The active state is the focus colour on the edge and a ring at a quarter of
 * its strength. `focus-visible` carries it, not `focus`: a browser always
 * matches `:focus-visible` on a control a person types into, however the
 * focus arrived, so one prefix covers the whole product and a pointer press
 * on a button still leaves no ring behind.
 *
 * `invalid` is the error state, and it is the one other edge a field changes.
 */
export function fieldClassName(
  options: {
    readonly invalid?: boolean | undefined;
    readonly className?: string | undefined;
  } = {},
): string {
  return [
    `ui-field w-full ${fieldSurface} text-body`,
    fieldEdge(options.invalid === true),
    options.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The box, the fill and the focus ring that every field shares. */
const fieldSurface = `rounded-md border bg-app px-3 text-strong outline-none ${transitionField} focus-visible:ring-2 focus-visible:ring-focus/25`;

/** The edge of a field at rest and in its error state. */
function fieldEdge(invalid: boolean): string {
  return invalid
    ? 'border-danger'
    : 'border-edge-line focus-visible:border-focus';
}

/**
 * The appearance of a field of several lines, as classes.
 *
 * It is a field in every part but its size: it holds a document in Markdown,
 * so it is tall, a person can make it taller, and it sets its text in the
 * code face at the control step, as a source text is.
 */
export function textAreaClassName(
  options: { readonly invalid?: boolean | undefined } = {},
): string {
  return [
    `block w-full min-h-64 resize-y py-2 font-mono text-body ${fieldSurface}`,
    fieldEdge(options.invalid === true),
  ].join(' ');
}

/**
 * The appearance of a field with no box of its own, as classes.
 *
 * The query of the command palette is a field inside a surface that already
 * frames it, so it takes no edge, no fill and no radius, and it takes the
 * body step of the chrome and the touch step of every field.
 */
export function bareFieldClassName(): string {
  return `ui-field min-w-0 flex-1 border-0 bg-transparent text-body text-strong outline-none placeholder:text-muted`;
}

/**
 * The appearance of a select, as classes: a field with its own chevron.
 *
 * Safari on iOS and on macOS draws a native select in its own shape and
 * height and ignores the height of a field, so the select stood apart from
 * the fields beside it. The native appearance is removed, the field recipe
 * draws the box, and `SelectField` draws the chevron in the space at the end.
 */
export function selectClassName(): string {
  return fieldClassName({
    className: 'ui-select cursor-pointer appearance-none',
  });
}

/**
 * The appearance of one key cap of a keyboard hint, as classes.
 *
 * A hint is the quietest text of the product, so it has a named step of its
 * own, `text-kbd`, and it is set in the code face because a key name is a
 * value and not prose. One cap holds one key; a combination is one cap for
 * each key.
 */
export function kbdClassName(): string {
  return 'inline-flex items-center rounded-sm border border-edge-line bg-surface px-2 py-1 font-mono text-small text-muted';
}

/**
 * The appearance of a badge, as classes.
 *
 * A badge states one fact about the row it sits on, for example that a note
 * exists on this device alone. It is not a tone: a fill that a screen mixes
 * from a tone moves with its own label, so the two close on each other and
 * the label loses its minimum (decision 0057). The badge therefore takes the
 * hover surface, which the contrast test holds the muted text to, and it
 * states its meaning in its word.
 */
export function badgeClassName(): string {
  return 'inline-flex items-center rounded-sm bg-hover px-2 text-secondary text-muted';
}

/** The real fill percentage, clamped to the track. */
export function meterFillPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(max) || max <= 0)
    throw new RangeError(
      'A meter needs a nonnegative value and a positive maximum.',
    );
  return Math.min(value / max, 1) * 100;
}

/** Whether the meter needs its warning in words and in its fill. */
export function meterAlmostFull(value: number, max: number): boolean {
  return value / max >= 0.9;
}

/** The one recipe of a static meter, including its text and warning. */
export function meterClassNames(
  value: number,
  max: number,
): {
  readonly text: string;
  readonly track: string;
  readonly fill: string;
} {
  return {
    text: 'mb-1 mt-0 text-secondary text-muted',
    track: 'h-1.5 w-full overflow-hidden rounded-sm bg-hover',
    fill: `block h-1.5 w-full rounded-sm ${meterAlmostFull(value, max) ? 'fill-danger-fill' : 'fill-accent-fill'}`,
  };
}

/**
 * The appearance of one day of a month calendar, as classes.
 *
 * A day fills the width of its cell of the sidebar calendar and is 28 px
 * high on a desktop, the height of a row, and 32 px under touch. Seven cells
 * of 44 px do not fit the narrowest sidebar, and the target stays above the
 * 24 px minimum of WCAG 2.5.8 (record 0100). It takes `rounded-md` and the row
 * hover. Every state
 * is a fact a person reads without colour alone (decision 0062 keeps the
 * accent for a link, a focus ring, a caret and a selection):
 *
 * - `selected` is the day the keyboard stands on and the calendar opens. It
 *   takes the fill of a chosen row.
 * - `today` takes the resting edge of a control (decision 0063) and the
 *   title weight, so it reads beside a selected day and on its own. Every
 *   other day keeps a transparent edge of the same width, so no day moves.
 * - `inMonth` false is a day of the month before or after, in muted text.
 *
 * The mark of a day that holds a note is `calendarNoteMarkClassName`.
 */
export function calendarDayClassName(options: {
  readonly selected: boolean;
  readonly today: boolean;
  readonly inMonth: boolean;
}): string {
  const text =
    options.selected || options.today
      ? 'text-strong'
      : options.inMonth
        ? 'text-ink'
        : 'text-muted';
  return [
    `ui-calendar-day relative inline-flex w-full cursor-pointer items-center justify-center rounded-md border text-body tabular-nums ${transitionSurface} ${focusOutlineInset}`,
    options.today ? 'border-edge-line text-label' : 'border-transparent',
    options.selected
      ? 'bg-active text-label'
      : 'hover:bg-hover hover:text-strong',
    text,
  ].join(' ');
}

/**
 * The mark under the number of a day that holds a note, as classes.
 *
 * A dot in the muted text colour, which the contrast test holds on every
 * surface a day sits on. It is a shape, so it needs no colour to be read, and
 * the name of the day states it to a person who cannot see it.
 */
export function calendarNoteMarkClassName(): string {
  return 'pointer-events-none absolute bottom-0.5 size-1 rounded-full bg-muted';
}

/** The accessible name and the tooltip of one button. */
export type ButtonName = {
  readonly ariaLabel: string | undefined;
  readonly title: string | undefined;
};

/**
 * How a button names itself.
 *
 * A `label` names the button whether or not the button also shows text. One
 * word on a row of a list, such as `Restore` or `Delete`, names
 * the action and never the row it acts on, so every row of that list carried
 * the same name while a label given to a button with text was dropped.
 *
 * WCAG 2.5.3 Label in Name still holds, and the caller holds it: a label for
 * a button that also shows text starts with that exact text, so speech input
 * reaches the control by the words a person reads on it.
 *
 * A tooltip belongs to an icon-only button alone. A button with visible text
 * already states its purpose on the screen, so a tooltip there repeats it. An
 * explicit `title` wins, because a caller can have a reason for one.
 */
export function buttonName(options: {
  readonly label?: string | undefined;
  readonly title?: string | undefined;
  readonly hasText: boolean;
}): ButtonName {
  return {
    ariaLabel: options.label,
    title: options.title ?? (options.hasText ? undefined : options.label),
  };
}

/**
 * The approved history controls are tools of the format row.
 *
 * The button is the target of a small compact tool: 44 px under touch and the
 * 28 px of every other tool on a desktop, so the row keeps one width and one
 * gap. The surface inside it carries the look, so Undo and Redo show the same
 * 16 px glyph, fill and colours as every other tool of the row. A history
 * control is unavailable through `aria-disabled` and not `disabled`, so it
 * keeps the focus, and its muted colour is written here and not read from a
 * `group-disabled` state that never applies to it.
 */
export function historyButtonClassName(): string {
  return buttonClassName({
    variant: 'ghost',
    size: 'sm',
    iconOnly: true,
    compact: true,
    className: 'shrink-0 aria-disabled:cursor-not-allowed',
  });
}

/** The visible surface of a history control, as a small compact tool. */
export function historyButtonVisualClassName(disabled: boolean): string {
  return [
    `inline-flex items-center justify-center rounded-md ${transitionSurface}`,
    'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus',
    disabled
      ? 'bg-transparent text-muted'
      : 'bg-transparent text-strong group-hover:bg-hover',
    'size-8 md:size-7',
  ].join(' ');
}

/** A history shortcut uses words that also work in a screen reader. */
export function historyButtonName(
  action: 'undo' | 'redo',
  apple: boolean,
): {
  readonly label: string;
  readonly tooltip: string;
} {
  const label = action === 'undo' ? 'Undo' : 'Redo';
  return {
    label,
    tooltip: `${label} (${apple ? 'Cmd' : 'Ctrl'}+${action === 'redo' ? 'Shift+' : ''}Z)`,
  };
}

/** The parts of an offline choice. The full row is the control. */
export function switchClassNames(checked: boolean): {
  readonly row: string;
  readonly track: string;
  readonly thumb: string;
} {
  return {
    row: rowClassName({
      flush: true,
      className:
        'ui-settings-phone-row ui-setting-row ui-setting-align w-full text-left',
    }),
    track: `inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-edge-line p-1 ${checked ? 'justify-end bg-accent-fill' : 'justify-start bg-hover'}`,
    thumb: `size-4 rounded-full ${checked ? 'bg-on-accent' : 'bg-muted'}`,
  };
}
