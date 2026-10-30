import { Stack, Inline, Inset } from './primitives.tsx';
import { ListRow } from './layout.tsx';
import { Pill } from './section-heading.tsx';
import {
  useSettingsSurface,
  useSettingsRowActions,
} from './settings-layout.tsx';
import { WrapText } from './inline-text.tsx';
/**
 * Accessible application controls.
 *
 * Every control is a thin wrapper over a native element, so keyboard use,
 * focus, labels, and touch target size come from the platform. Every class it
 * renders comes from `./control-classes.ts`, which is the one recipe of a
 * control (decision 0065). No control here writes a class of its own except
 * the distances inside itself.
 */
import { isTouchInput } from './input-focus.ts';
import {
  useEffect,
  useRef,
  useId,
  type ReactNode,
  type Ref,
  type ComponentProps,
  type MouseEventHandler,
} from 'react';
import {
  buttonClassName,
  compactButtonVisualClassName,
  buttonName,
  checkboxClassNames,
  fieldClassName,
  meterAlmostFull,
  meterFillPercent,
  meterClassNames,
  switchClassNames,
  textAreaClassName,
  type ButtonSize,
  type IconSize,
  type ButtonTone,
  type ButtonVariant,
} from './control-classes.ts';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from './icons.tsx';

/** The label above a field, and the label beside a checkbox. */
const fieldLabelClassName = 'block text-label text-strong';

/** A named value against a maximum, with no state or callback. */
export function Meter({
  label,
  value,
  max,
  text,
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly text: string;
}): ReactNode {
  const settings = useSettingsSurface();
  const classes = meterClassNames(value, max);
  const percent = meterFillPercent(value, max);
  const words = meterAlmostFull(value, max) ? `${text}. Almost full` : text;
  return (
    <Stack
      gap={2}
      padY={settings ? 3 : 0}
      padX={settings ? { fine: 0, coarse: 4 } : 0}
    >
      {settings ? (
        <Inline gap={4} justify="between">
          <span className="text-body text-strong">{label}</span>
          <span className="text-value text-muted">{words}</span>
        </Inline>
      ) : (
        <p className={classes.text}>{words}</p>
      )}
      <div
        className={classes.track}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={words}
      >
        <svg
          className={classes.fill}
          aria-hidden="true"
          width="100%"
          height="100%"
        >
          <rect width={`${String(percent)}%`} height="100%" />
          {value > 0 ? <rect width="2" height="100%" /> : null}
        </svg>
      </div>
    </Stack>
  );
}

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
  ariaHasPopup,
  ariaPressed,
  tabIndex,
  compact = false,
  optical = false,
  hideTextOnPhone = false,
  iconSize,
  ref: nativeRef,
  ...nativeProps
}: Omit<
  ComponentProps<'button'>,
  | 'onClick'
  | 'children'
  | 'className'
  | 'title'
  | 'type'
  | 'disabled'
  | 'tabIndex'
> & {
  readonly iconSize?: IconSize | undefined;
  readonly type?: 'button' | 'submit' | undefined;
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly tone?: ButtonTone | undefined;
  readonly disabled?: boolean | undefined;
  readonly onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  readonly children?: ReactNode | undefined;
  readonly label?: string | undefined;
  readonly icon?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly title?: string | undefined;
  readonly buttonRef?: Ref<HTMLButtonElement> | undefined;
  readonly ariaControls?: string | undefined;
  readonly ariaExpanded?: boolean | undefined;
  readonly ariaHasPopup?: 'dialog' | 'menu' | undefined;
  readonly ariaPressed?: boolean | undefined;
  /**
   * The place of the button in the tab order. A group with one tab stop,
   * such as a toolbar, passes -1 to every button but the one in reach.
   */
  readonly tabIndex?: number | undefined;
  /** Keeps the touch target and draws a smaller surface inside it. */
  readonly compact?: boolean | undefined;
  readonly optical?: boolean;
  readonly hideTextOnPhone?: boolean;
}): ReactNode {
  const settingsRow = useSettingsRowActions();
  const hasChildren = children !== undefined && children !== null;
  const classes = buttonClassName({
    variant,
    size: settingsRow ? 'compact' : size,
    tone,
    iconOnly: !hasChildren,
    iconSize,
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
      {hasChildren ? (
        <span className={hideTextOnPhone ? 'max-md:hidden' : undefined}>
          {children}
        </span>
      ) : null}
    </>
  );

  const button = (
    <button
      {...nativeProps}
      ref={buttonRef ?? nativeRef}
      type={type ?? 'button'}
      className={`${classes} ${optical ? 'absolute inset-x-1 top-0 coarse:inset-x-0' : ''} ${settingsRow ? 'ds-row-button absolute left-0 top-1/2 -translate-y-1/2 h-7 w-full px-3 coarse:h-11 coarse:border-0 coarse:bg-transparent coarse:px-0 ' : ''}`}
      disabled={disabled ?? false}
      onClick={onClick}
      aria-label={name.ariaLabel}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-pressed={ariaPressed}
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
  if (optical)
    return (
      <span className="relative inline-flex h-7 shrink-0 coarse:h-11">
        <span
          aria-hidden="true"
          className="invisible inline-flex items-center gap-2 px-3 text-label coarse:px-4"
        >
          {content}
        </span>
        {button}
      </span>
    );
  return settingsRow ? (
    <span className="ui-settings-button-slot relative inline-flex h-7 shrink-0 items-center coarse:h-5">
      <span
        aria-hidden="true"
        className="ui-settings-button-measure invisible inline-flex items-center gap-2 px-3 text-label coarse:px-0"
      >
        {content}
      </span>
      {button}
    </span>
  ) : (
    button
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
  return <Pill>{children}</Pill>;
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
  listSearch = false,
  describedBy,
  inputRef,
  onKeyDown,
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
  hideLabel = false,
}: {
  readonly describedBy?: string | undefined;
  readonly inputRef?: React.Ref<HTMLInputElement> | undefined;
  readonly onKeyDown?: React.KeyboardEventHandler<HTMLInputElement> | undefined;
  readonly listSearch?: boolean | undefined;
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
  /** Keeps a visible placeholder with an accessible label. */
  readonly hideLabel?: boolean | undefined;
}): ReactNode {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = error !== undefined && error !== '';
  const hasHint = hint !== undefined && hint !== '';
  const described = [
    describedBy ?? '',
    hasHint ? hintId : '',
    hasError ? errorId : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="ui-field-group flex flex-col gap-2">
      <label
        className={hideLabel ? 'sr-only' : fieldLabelClassName}
        htmlFor={id}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        ) : null}
      </label>
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          onKeyDown={onKeyDown}
          id={id}
          className={fieldClassName({ invalid: hasError })}
          type={inputType ?? 'text'}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required ?? false}
          data-list-search={listSearch ? '' : undefined}
          autoFocus={(autoFocus ?? false) && (!listSearch || !isTouchInput())}
          aria-invalid={hasError}
          aria-describedby={described === '' ? undefined : described}
          onChange={(event): void => {
            onChange(event.target.value);
          }}
        />
        {hasHint ? (
          <p className="m-0 text-secondary text-muted" id={hintId}>
            <WrapText>{hint}</WrapText>
          </p>
        ) : null}
        {hasError ? (
          <p
            className="m-0 text-secondary text-danger"
            id={errorId}
            role={hasError ? 'alert' : undefined}
            aria-hidden={hasError ? undefined : true}
          >
            {hasError ? error : null}
          </p>
        ) : null}
      </div>
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
    <div className="ui-field-group flex flex-col gap-2">
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <div className="flex flex-col gap-1">
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
          <p className="m-0 text-secondary text-muted" id={hintId}>
            <WrapText>{hint}</WrapText>
          </p>
        ) : null}
        {hasError ? (
          <p
            className="m-0 text-secondary text-danger"
            id={errorId}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
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
    <div className="ui-field-group flex flex-col gap-2">
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <div className="flex flex-col gap-1">
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
    <div className="ui-field-group flex flex-col gap-2">
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <div className="flex flex-col gap-1">
        <div
          className={`${fieldClassName().replaceAll('focus:', 'focus-within:')} flex items-center gap-2`}
        >
          <select
            id={id}
            className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-body text-strong outline-none"
            value={value}
            aria-describedby={
              hint === undefined || hint.trim() === '' ? undefined : hintId
            }
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
          <ChevronDownIcon className="pointer-events-none shrink-0 text-muted" />
        </div>
        {hint === undefined || hint.trim() === '' ? null : (
          <p className="m-0 text-secondary text-muted" id={hintId}>
            <WrapText>{hint}</WrapText>
          </p>
        )}
      </div>
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
  /** The words of the choice. A link in them opens without a change of the box. */
  readonly label: ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly describedBy?: string | undefined;
  /** The choice cannot change now, for example while the last one is saved. */
  readonly disabled?: boolean | undefined;
}): ReactNode {
  const classes = checkboxClassNames({ disabled });
  return (
    <label className={classes.label} htmlFor={id}>
      <span className={classes.frame}>
        <input
          id={id}
          type="checkbox"
          className={classes.box}
          checked={checked}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event): void => {
            onChange(event.target.checked);
          }}
        />
        <CheckIcon className={classes.mark} />
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
    <Stack as="section" gap={2} aria-labelledby={id}>
      <ListRow
        as="button"
        density="tree"
        id={id}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
      >
        <span
          className="inline-flex w-4 shrink-0 items-center"
          aria-hidden="true"
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
        <span className="flex-1 text-left text-muted">{title}</span>
      </ListRow>
      {open ? (
        // The `section` above is already the named region of this group, so
        // the panel carries the identifier that `aria-controls` names and no
        // role of its own. It used to carry both, which put two regions with
        // one name in the list a person moves through. The content keeps the
        // header's disclosure slot. Child rows add only deeper indent levels.
        <Inset id={panelId} padX={{ fine: 2, coarse: 3 }} padY={2}>
          <Inline gap={2} align="start">
            <span className="w-4 shrink-0" aria-hidden="true" />
            <div data-disclosure-content={id} className="min-w-0 flex-1">
              {children}
            </div>
          </Inline>
        </Inset>
      ) : null}
    </Stack>
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
    <Inset
      as="p"
      padY={1}
      className="text-secondary text-muted"
      role="status"
      aria-live="polite"
    >
      {message}
    </Inset>
  );
}

/** A full row switch states its value and any unavailable reason. */
export function Switch({
  hideLabel = false,
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  readonly hideLabel?: boolean;
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
}): ReactNode {
  const hintId = useId(),
    classes = switchClassNames(checked);
  if (hideLabel)
    return (
      <span className="relative inline-flex h-7 w-10 shrink-0 items-center justify-center coarse:h-5">
        <button
          type="button"
          role="switch"
          aria-label={label}
          aria-checked={checked}
          disabled={disabled}
          className="absolute left-1/2 top-1/2 inline-flex h-7 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-transparent p-0 coarse:h-11"
          onClick={() => onChange(!checked)}
        >
          <span className={classes.track}>
            <span className={classes.thumb} />
          </span>
        </button>
      </span>
    );
  return (
    <ListRow
      as="button"
      density="setting"
      label={label}
      help={hint ? <WrapText>{hint}</WrapText> : undefined}
      helpId={hintId}
      trailing={{ kind: 'switch', checked }}
      role="switch"
      aria-checked={checked}
      aria-describedby={hint ? hintId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
export const SwitchRow = Switch;
export const Field = TextField;
/** A field whose value opens a choice instead of text entry. */
export function FieldButton({
  invalid = false,
  className = '',
  ...props
}: ComponentProps<'button'> & { readonly invalid?: boolean }): ReactNode {
  return (
    <button
      {...props}
      className={`${fieldClassName({ invalid })} flex cursor-pointer items-center gap-2 text-left ${className}`}
    />
  );
}
/** A custom field has the same label and help distances as a text field. */
export function FieldGroup({
  id,
  label,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'id'> & {
  readonly id: string;
  readonly label: string;
}): ReactNode {
  return (
    <Stack
      {...props}
      gap={2}
      className={`ui-field-group ${props.className ?? ''}`}
    >
      <label id={`${id}-label`} htmlFor={id} className={fieldLabelClassName}>
        {label}
      </label>
      <Stack gap={1}>{children}</Stack>
    </Stack>
  );
}
