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
import { transitionField, transitionSurface } from './motion.ts';

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
export type ButtonSize = 'sm' | 'md';

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

/** The colour and surface of one button. */
function buttonVariantClassName(
  variant: ButtonVariant,
  tone: ButtonTone | undefined,
  interaction: 'button' | 'group',
): string {
  const danger = tone === 'danger';
  const hover = interaction === 'group' ? 'group-hover:' : 'hover:';
  return variant === 'secondary'
    ? danger
      ? `border border-edge-line bg-card text-danger shadow-raised ${hover}bg-danger-surface`
      : `border border-edge-line bg-card text-strong shadow-raised ${hover}bg-hover`
    : variant === 'ghost'
      ? danger
        ? `bg-transparent text-danger ${hover}bg-danger-surface`
        : `bg-transparent text-strong ${hover}bg-hover`
      : variant === 'danger'
        ? `bg-danger-fill text-on-danger ${hover}bg-danger-fill-hover`
        : `bg-accent-fill text-on-accent ${hover}bg-accent-fill-hover`;
}

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

  // Touch pointers get the 44 px minimum. A mouse pointer keeps the compact
  // control scale, so the chrome stays quiet on a desktop screen: 32 px for a
  // button and 28 px for a small one.
  const sizeClass = options.iconOnly
    ? size === 'sm'
      ? 'size-11 px-0 md:size-7'
      : 'size-11 px-0 md:size-8'
    : compact
      ? size === 'sm'
        ? 'min-h-11 px-0 md:min-h-7'
        : 'min-h-11 px-0 md:min-h-8'
      : size === 'sm'
        ? 'min-h-11 px-2.5 md:min-h-7'
        : 'min-h-11 px-3 md:min-h-8';
  return [
    `inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-control font-medium no-underline ${transitionSurface} ${compact ? 'focus-visible:outline-none' : focusOutline} disabled:cursor-not-allowed disabled:opacity-50`,
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
      ? 'min-h-8 px-2.5 md:min-h-7'
      : 'min-h-9 px-3 md:min-h-8';
  return [
    `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md ${transitionSurface}`,
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
  return 'inline-flex size-6 items-center justify-center rounded-full bg-active text-kbd font-semibold text-strong';
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
      ? '-ms-2.5 md:-ms-0.5'
      : '-ms-3.5 md:-ms-1.5'
    : options.mark === 'avatar'
      ? '-me-2.5 md:-me-0.5'
      : '-me-3.5 md:-me-1.5';
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
  return 'flex items-center overflow-x-auto py-1 -mx-3.5 md:-mx-2.5 md:px-1';
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
  const colour = toned ? 'text-danger' : 'text-ink';
  const state = marked
    ? toned
      ? 'bg-active font-medium'
      : 'bg-active text-strong font-medium'
    : interactive
      ? toned
        ? 'hover:bg-hover'
        : 'hover:bg-hover hover:text-strong'
      : '';
  return [
    `flex min-h-11 items-center gap-2 rounded-md px-2 text-control ${colour} no-underline ${transitionSurface} md:min-h-7`,
    interactive ? 'cursor-pointer' : '',
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
    `inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md ${transitionSurface} ${focusOutline} md:size-8`,
    options.current
      ? 'bg-active text-strong'
      : 'text-muted hover:bg-hover hover:text-strong',
  ].join(' ');
}

/**
 * The text step of a field under touch.
 *
 * Safari on iOS zooms the page into a field whose text is under 16 px when
 * the field takes focus, and the page stays zoomed after the keyboard
 * closes, so the zoom hides what the person had on the screen. Every field
 * a person types into therefore sets its text at `text-base`, 16 px, under a
 * coarse pointer, and keeps its compact step under a mouse. The viewport
 * does not forbid the zoom instead: a limit on the scale also stops the pinch
 * of a person on Android who needs larger text.
 *
 * The editor adapter states the same rule for the search field that
 * CodeMirror builds, which no class reaches, through `touchFieldQuery` of
 * `@notesapp/editor`. `tests/integration/theme-variables.test.ts` holds that
 * query to the one Tailwind writes for this variant.
 */
export const touchFieldText = 'pointer-coarse:text-base';

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
    `w-full min-h-11 ${fieldSurface} text-ui ${touchFieldText} md:min-h-8`,
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
    `block w-full min-h-64 resize-y py-2 font-mono text-control ${touchFieldText} leading-relaxed ${fieldSurface}`,
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
  return `min-w-0 flex-1 border-0 bg-transparent py-3 text-ui ${touchFieldText} text-strong outline-none placeholder:text-muted`;
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
  return fieldClassName({ className: 'cursor-pointer appearance-none pr-9' });
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
  return 'inline-flex items-center rounded-sm border border-edge-line bg-surface px-1.5 font-mono text-kbd text-muted';
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
  return 'inline-flex items-center rounded-sm bg-hover px-1.5 text-kbd font-medium text-muted';
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
    `relative inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-md border text-control tabular-nums ${transitionSurface} ${focusOutlineInset} md:h-7`,
    options.today ? 'border-edge-line font-semibold' : 'border-transparent',
    options.selected
      ? 'bg-active font-medium'
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
