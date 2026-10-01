/**
 * Accessible application controls.
 *
 * Every control is a thin wrapper over a native element, so keyboard use,
 * focus, labels, and touch target size come from the platform. Every class it
 * renders comes from `./control-classes.ts`, which is the one recipe of a
 * control (decision 0065). No control here writes a class of its own except
 * the distances inside itself.
 */
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import {
  badgeClassName,
  buttonClassName,
  buttonName,
  compactButtonVisualClassName,
  fieldClassName,
  focusOutline,
  selectClassName,
  textAreaClassName,
  type ButtonSize,
  type ButtonTone,
  type ButtonVariant,
} from './control-classes.ts';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from './icons.tsx';
import { transitionSurface } from './motion.ts';

/** The label above a field, and the label beside a checkbox. */
const fieldLabelClassName = 'mb-1.5 block text-control font-medium text-strong';

/**
 * A labeled push button.
 *
 * A button with no children is an icon only button, so it takes the square
 * shape of its size here rather than at every call site. It needs a `label`,
 * which names it and becomes its tooltip.
 */
export function Button({
  type,
  variant = 'primary',
  size = 'md',
  tone,
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
  tabIndex,
  compact = false,
}: {
  readonly type?: 'button' | 'submit' | undefined;
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly tone?: ButtonTone | undefined;
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
  /**
   * The place of the button in the tab order. A group with one tab stop,
   * such as a toolbar, passes -1 to every button but the one in reach.
   */
  readonly tabIndex?: number | undefined;
  /** Keeps the touch target and draws a smaller surface inside it. */
  readonly compact?: boolean | undefined;
}): ReactNode {
  const hasChildren = children !== undefined && children !== null;
  const classes = buttonClassName({
    variant,
    size,
    tone,
    iconOnly: !hasChildren,
    compact,
    className: extraClassName,
  });

  const name = buttonName({ label, title, hasText: hasChildren });
  const content = (
    <>
      {icon !== undefined ? (
        <span
          className="inline-flex items-center justify-center"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      {hasChildren ? <span>{children}</span> : null}
    </>
  );

  return (
    <button
      ref={buttonRef}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled ?? false}
      onClick={onClick}
      aria-label={name.ariaLabel}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      tabIndex={tabIndex}
      title={name.title}
    >
      {compact ? (
        <span
          className={compactButtonVisualClassName({
            variant,
            size,
            tone,
            iconOnly: !hasChildren,
          })}
        >
          {content}
        </span>
      ) : (
        content
      )}
    </button>
  );
}

/**
 * One fact about the row it sits on, as a small pill.
 *
 * A badge states a fact and never an action, so it is not a control and it
 * carries no tone. The word is the meaning.
 */
export function Badge({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return <span className={badgeClassName()}>{children}</span>;
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
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={fieldClassName({ invalid: hasError })}
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

/**
 * A labeled field of several lines, for a document that a person writes.
 *
 * It follows `TextField`: the hint stays under it at all times, the error
 * appears under it, and both are its description. A text area keeps the
 * spelling check of the browser off, because a document in Markdown holds
 * marks that are not words.
 */
export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  /** The rule of the field, stated under it at all times. */
  readonly hint?: string | undefined;
  readonly required?: boolean | undefined;
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
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={textAreaClassName({ invalid: hasError })}
        value={value}
        required={required ?? false}
        spellCheck={false}
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

/**
 * A labelled value that a person copies and cannot change.
 *
 * A machine value such as a link is text that a person moves to another
 * program, so the field carries it in a monospaced face, selects the whole
 * value whenever it takes focus, and stays a real input that the keyboard
 * reaches. A read only input keeps the value selectable and copyable, which a
 * paragraph of text does not.
 *
 * The field takes no `onChange`, so nothing can write through it, and it
 * reports `readonly` to assistive technology rather than `disabled`, because
 * a disabled control leaves the tab order and the value with it.
 *
 * `takeFocus` moves the caret here when the field appears. It calls `focus`
 * from an effect rather than passing the `autoFocus` attribute, because that
 * attribute acts while a document loads and this field appears long after
 * that, inside an open dialog, in answer to an action.
 */
export function ReadOnlyField({
  id,
  label,
  value,
  takeFocus,
  describedBy,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Takes focus when the field appears, for a value shown one time. */
  readonly takeFocus?: boolean | undefined;
  readonly describedBy?: string | undefined;
}): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (takeFocus !== true) return;
    inputRef.current?.focus();
  }, [takeFocus]);
  return (
    <div className="mb-3.5">
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        className={fieldClassName({ className: 'font-mono' })}
        type="text"
        value={value}
        readOnly
        aria-describedby={describedBy}
        onFocus={(event): void => {
          event.currentTarget.select();
        }}
      />
    </div>
  );
}

/** One option of {@link SelectField}. */
export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

/**
 * A labeled native select.
 *
 * The box and the chevron come from this product, so the select has the
 * height and the shape of the fields beside it in every browser.
 *
 * A `hint` is one sentence under the field that says what the choice does.
 * The select names it as its description, so a screen reader reads it with
 * the field and not after it.
 */
export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly hint?: string | undefined;
}): ReactNode {
  const hintId = `${id}-hint`;
  return (
    <div className="mb-3.5">
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          className={selectClassName()}
          value={value}
          aria-describedby={hint === undefined ? undefined : hintId}
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
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      </div>
      {hint === undefined ? null : (
        <p className="mb-0 mt-1 text-control text-muted" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A checkbox with its label beside it.
 *
 * The box is a native input, so the space key, the label click and the
 * reported state all come from the platform. Its own appearance is removed
 * and drawn again from the theme, because a native box paints the accent of
 * the operating system and nothing in the palette can reach it.
 *
 * The box carries the component edge, `edge`, which is one of the five
 * controls that decision 0063 reserves it for: a person reads the state of a
 * checkbox from its shape alone, so the edge has to meet the 3 to 1 non text
 * minimum that `theme.test.ts` holds it to.
 */
export function Checkbox({
  id,
  label,
  checked,
  onChange,
  describedBy,
  disabled = false,
}: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly describedBy?: string | undefined;
  /** The choice cannot change now, for example while the last one is saved. */
  readonly disabled?: boolean | undefined;
}): ReactNode {
  return (
    <label
      className={`inline-flex min-h-11 items-center gap-2 text-control text-strong md:min-h-8 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      htmlFor={id}
    >
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          className={`peer size-4 cursor-pointer appearance-none rounded-sm border border-edge bg-app ${transitionSurface} checked:border-accent-fill checked:bg-accent-fill disabled:cursor-not-allowed ${focusOutline}`}
          checked={checked}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event): void => {
            onChange(event.target.checked);
          }}
        />
        <CheckIcon className="pointer-events-none absolute inset-0 hidden text-on-accent peer-checked:block" />
      </span>
      <span>{label}</span>
    </label>
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
        className={buttonClassName({
          variant: 'ghost',
          size: 'sm',
          className: 'w-full justify-start text-muted',
        })}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(): void => {
          onToggle(!open);
        }}
      >
        <span className="inline-flex items-center" aria-hidden="true">
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
        <span className="flex-1 text-left">{title}</span>
      </button>
      {open ? (
        // The `section` above is already the named region of this group, so
        // the panel carries the identifier that `aria-controls` names and no
        // role of its own. It used to carry both, which put two regions with
        // one name in the list a person moves through.
        <div id={panelId} className="py-2 pl-2">
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
