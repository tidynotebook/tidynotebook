/**
 * Accessible application controls.
 *
 * Every control is a thin wrapper over a native element, so keyboard use,
 * focus, labels, and touch target size come from the platform. Styling uses
 * the central Tailwind theme and a fixed control scale.
 */
import type { ReactNode, Ref } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from './icons.tsx';

/** How a button looks. */
export type ButtonVariant =
  'primary' | 'secondary' | 'danger' | 'ghost' | 'subtle';

/** How large a button is. */
export type ButtonSize = 'sm' | 'md';

/**
 * The appearance of a button, as classes.
 *
 * A control that navigates is an anchor and never a button, so the platform
 * keeps the middle click, the context menu, and the address. The router of
 * the application owns that anchor, so this function hands out the same
 * appearance to it and every action button of a screen looks the same.
 */
export function buttonClassName(
  options: {
    readonly variant?: ButtonVariant | undefined;
    readonly size?: ButtonSize | undefined;
    readonly className?: string | undefined;
  } = {},
): string {
  const variant = options.variant ?? 'primary';
  const size = options.size ?? 'md';
  const variantClass =
    variant === 'secondary'
      ? 'border-edge bg-transparent text-strong hover:bg-hover'
      : variant === 'danger'
        ? 'border-danger-fill bg-danger-fill text-on-danger hover:brightness-110'
        : variant === 'ghost'
          ? 'border-transparent bg-transparent text-strong hover:bg-hover'
          : variant === 'subtle'
            ? 'border-edge-subtle bg-hover text-strong hover:bg-active'
            : 'border-accent-fill bg-accent-fill text-on-accent shadow-sm hover:brightness-110';

  // Touch pointers get the 44 px minimum. A mouse pointer keeps the compact
  // control scale, so the chrome stays quiet on a desktop screen.
  const sizeClass =
    size === 'sm' ? 'min-h-11 px-2.5 md:min-h-8' : 'min-h-11 px-3 md:min-h-9';
  return [
    'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border py-1.5 text-control font-medium no-underline motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
    variantClass,
    sizeClass,
    options.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** A labeled push button. */
export function Button({
  type,
  variant = 'primary',
  size = 'md',
  disabled,
  onClick,
  children,
  label,
  icon,
  className: extraClassName,
  title,
  buttonRef,
  ariaControls,
  ariaExpanded,
}: {
  readonly type?: 'button' | 'submit' | undefined;
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly disabled?: boolean | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly children?: ReactNode | undefined;
  readonly label?: string | undefined;
  readonly icon?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly title?: string | undefined;
  readonly buttonRef?: Ref<HTMLButtonElement> | undefined;
  readonly ariaControls?: string | undefined;
  readonly ariaExpanded?: boolean | undefined;
}): ReactNode {
  const classes = buttonClassName({
    variant,
    size,
    className: extraClassName,
  });

  // WCAG 2.5.3 Label in Name: a visible label is the accessible name. Only
  // an icon-only button names itself with `aria-label`.
  const hasChildren = children !== undefined && children !== null;

  return (
    <button
      ref={buttonRef}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled ?? false}
      onClick={onClick}
      aria-label={hasChildren ? undefined : label}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      title={title ?? (hasChildren ? undefined : label)}
    >
      {icon !== undefined ? (
        <span
          className="inline-flex items-center justify-center"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      {children === undefined || children === null ? null : (
        <span>{children}</span>
      )}
    </button>
  );
}

/** A small status badge pill. */
export function Badge({
  children,
  variant = 'default',
}: {
  readonly children: ReactNode;
  readonly variant?: 'default' | 'accent' | 'success' | 'danger' | undefined;
}): ReactNode {
  const variantClass =
    variant === 'accent'
      ? 'border-accent/30 bg-accent/15 text-accent'
      : variant === 'success'
        ? 'border-success/30 bg-success/15 text-success'
        : variant === 'danger'
          ? 'border-danger/30 bg-danger/15 text-danger'
          : 'border-edge-subtle bg-hover text-muted';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-control font-semibold ${variantClass}`}
    >
      {children}
    </span>
  );
}

/**
 * A labeled text input with an optional rule and an optional field error.
 *
 * `hint` states the rule of the field before anything is submitted, so a
 * person never learns a requirement from a failure. Both the hint and the
 * error are named by `aria-describedby`, so a screen reader reads them with
 * the field.
 *
 * The field carries no length rule of its own. A browser that enforces one
 * answers with its own bubble in its own words, which would compete with
 * the hint and the error of the screen. The screen checks the length and
 * reports it here.
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  inputType,
  autoComplete,
  placeholder,
  required,
  autoFocus,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  /** The rule of the field, stated under it at all times. */
  readonly hint?: string | undefined;
  readonly inputType?: 'text' | 'email' | 'password' | undefined;
  readonly autoComplete?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly required?: boolean | undefined;
  readonly autoFocus?: boolean | undefined;
}): ReactNode {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = error !== undefined && error !== '';
  const hasHint = hint !== undefined && hint !== '';
  const described = [hasHint ? hintId : '', hasError ? errorId : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="mb-3.5">
      <label
        className="mb-1.5 block text-control font-semibold text-strong"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-lg border bg-app px-3 py-2 text-ui text-strong outline-none motion-safe:transition-shadow focus:ring-2 focus:ring-focus/25 ${hasError ? 'border-danger focus:border-danger' : 'border-edge focus:border-focus'}`}
        type={inputType ?? 'text'}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required ?? false}
        autoFocus={autoFocus ?? false}
        aria-invalid={hasError}
        aria-describedby={described === '' ? undefined : described}
        onChange={(event): void => {
          onChange(event.target.value);
        }}
      />
      {hasHint ? (
        <p className="mb-0 mt-1 text-control text-muted" id={hintId}>
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p className="mt-1 text-control text-danger" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** One option of {@link SelectField}. */
export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

/** A labeled native select. */
export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="mb-3.5">
      <label
        className="mb-1.5 block text-control font-semibold text-strong"
        htmlFor={id}
      >
        {label}
      </label>
      <select
        id={id}
        className="min-h-11 w-full rounded-lg border border-edge bg-app px-3 py-2 text-ui text-strong outline-none motion-safe:transition-shadow focus:border-focus focus:ring-2 focus:ring-focus/25 md:min-h-9"
        value={value}
        onChange={(event): void => {
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A collapsible region, for the outline panel.
 *
 * The toggle button owns `aria-expanded` and the panel is a labeled region,
 * so screen reader and keyboard users can open, enter, and close it.
 */
export function CollapsibleSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  readonly children: ReactNode;
}): ReactNode {
  const panelId = `${id}-panel`;
  return (
    <section className="mt-2" aria-labelledby={id}>
      <button
        id={id}
        type="button"
        className="flex min-h-11 w-full cursor-pointer items-center gap-cluster rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-control font-semibold uppercase tracking-wide text-muted hover:bg-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-focus md:min-h-8"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(): void => {
          onToggle(!open);
        }}
      >
        <span className="inline-flex items-center" aria-hidden="true">
          {open ? (
            <ChevronDownIcon size={14} />
          ) : (
            <ChevronRightIcon size={14} />
          )}
        </span>
        <span className="flex-1">{title}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="py-2 pl-2"
          role="region"
          aria-label={title}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A polite live status region.
 *
 * Sync and save states render here with `role="status"`, so assistive
 * technology announces changes without moving focus.
 */
export function StatusRegion({
  message,
}: {
  readonly message: string;
}): ReactNode {
  return (
    <p
      className="my-1 text-control text-muted"
      role="status"
      aria-live="polite"
    >
      {message}
    </p>
  );
}
