/**
 * One section of Settings and of the pages that belong to it.
 *
 * Desktop sections use flat rows and divider headings. Phone Settings puts
 * each group in one card. The shared spacing roles define both layouts.
 *
 * The title and the heading come from the list of sections of the page,
 * which the side region reads as well, so the two cannot disagree
 * (decision 0137). Settings and Accounts both take this one layout, because
 * Accounts is a part of Settings (record 0138).
 */
import {
  Children,
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Button,
  SettingsRowActions,
  WrapText,
  ChevronRightIcon,
  Switch,
  type PageSection,
} from '@notesapp/ui';

const phoneQuery = '(pointer: coarse) and (max-width: 1023px)';
function subscribePhone(change: () => void): () => void {
  const query = window.matchMedia(phoneQuery);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
}
/** One phone layout boundary for every Settings row. */
export function usePhoneSettings(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}

/** A whole action row on phone, with the existing flat action on desktop. */
export function SettingActionRow({
  label,
  desktopLabel,
  help,
  actionLabel,
  onClick,
  disabled,
  danger = false,
  icon,
}: {
  readonly label: string;
  readonly desktopLabel?: string;
  readonly help?: string | undefined;
  readonly actionLabel: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly icon?: ReactNode;
}): ReactNode {
  const phone = usePhoneSettings();
  if (!phone)
    return (
      <SettingRow label={desktopLabel ?? label.replace(/…$/, '')} help={help}>
        <Button
          variant="secondary"
          size="sm"
          tone={danger ? 'danger' : undefined}
          icon={icon}
          disabled={disabled}
          onClick={onClick}
        >
          {actionLabel}
        </Button>
      </SettingRow>
    );
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`ui-settings-row ui-settings-action-link text-left ${danger ? 'text-danger' : 'text-accent'}`}
    >
      <span data-setting-label className="block text-body">
        {label}
      </span>
      {help === undefined || help.trim() === '' ? null : (
        <span
          data-setting-help
          className="ui-settings-help text-secondary text-muted"
        >
          <WrapText>{help}</WrapText>
        </span>
      )}
    </button>
  );
}

/**
 * The sections inside the Settings modal (issue 517, item 8).
 *
 * The page names its topic and one short scope line, so a section in it
 * shows no long paragraph: only a small group label, when the page has more
 * than one section, above compact rows.
 */
export const SettingsTopicContext = createContext<{
  readonly hiddenTitles: readonly string[];
  readonly helpSection: string | null;
} | null>(null);

/** One section: its name and sentence, then its controls. */
export function SettingsSection({
  section,
  grouped = false,
  heading,
  danger = false,
  description,
  warning,
  children,
}: {
  readonly section: PageSection;
  readonly grouped?: boolean;
  /** The group label in the modal, when it is not the section title. */
  readonly heading?: string | undefined;
  /** Draws the group label in the danger colour, for the Danger zone. */
  readonly danger?: boolean | undefined;
  readonly description?: string | undefined;
  readonly warning?: string | undefined;
  readonly rows?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const topic = useContext(SettingsTopicContext);
  const phone = usePhoneSettings();
  if (Children.toArray(children).length === 0) return null;
  if (topic !== null)
    return (
      <section className="ui-settings-group" aria-label={section.title}>
        {topic.hiddenTitles.includes(section.id) &&
        !(phone && section.id === 'profile-heading') ? null : (
          <h3
            className={`ui-settings-group-heading text-group ${danger ? 'text-danger' : 'text-muted'}`}
            id={section.id}
          >
            {heading ?? section.title}
          </h3>
        )}
        {topic.helpSection === section.id && description !== undefined ? (
          <p className="ui-settings-message text-secondary text-muted">
            {description}
          </p>
        ) : null}
        <div
          className={
            grouped ? 'ui-settings-groups min-w-0' : 'ui-settings-card min-w-0'
          }
        >
          {warning === undefined ? null : (
            <p className="ui-settings-message text-secondary text-muted">
              {warning}
            </p>
          )}
          {children}
        </div>
      </section>
    );
  return (
    <section className="ui-section" aria-labelledby={section.id}>
      <div>
        <div className="md:col-span-1">
          <h2
            className="m-0 text-title-header text-strong"
            id={section.id}
            tabIndex={-1}
          >
            {section.title}
          </h2>
          {description === undefined ? null : (
            <p className="mb-0 mt-1 text-secondary text-muted">{description}</p>
          )}
        </div>
        <div className="mt-2 min-w-0">
          {warning === undefined ? null : (
            <p className="ui-settings-message text-secondary text-muted">
              {warning}
            </p>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * One compact row of the Settings modal (issue 517, item 8): the label and
 * help on the left and the control on the right. Phone help can use two lines.
 */
export function SettingRow({
  label,
  help,
  children,
}: {
  readonly label: ReactNode;
  readonly help?: string | undefined;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <div className="ui-settings-row">
      <div data-setting-text className="ui-settings-copy">
        <p data-setting-label className="text-body text-strong">
          {label}
        </p>
        {help?.trim() ? (
          <p data-setting-help className="text-secondary text-muted">
            <WrapText>{help}</WrapText>
          </p>
        ) : null}
      </div>
      {children === undefined ? null : (
        <div data-setting-control className="ui-settings-control">
          <SettingsRowActions>{children}</SettingsRowActions>
        </div>
      )}
    </div>
  );
}

/** A whole Settings row opens one draft view. */
export function SettingChoiceRow({
  label,
  help,
  value,
  valueIcon,
  onClick,
  disabled = false,
  buttonRef,
}: {
  readonly label: string;
  readonly help: string;
  readonly value: string;
  readonly valueIcon?: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly buttonRef?: Ref<HTMLButtonElement>;
}): ReactNode {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="ui-settings-row ui-settings-choice text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span data-setting-text className="ui-settings-copy">
        <span data-setting-label className="text-body text-strong">
          {label}
        </span>
        {help.trim() ? (
          <span data-setting-help className="text-secondary text-muted">
            <WrapText>{help}</WrapText>
          </span>
        ) : null}
      </span>
      <span
        data-setting-control
        className="ui-settings-control text-value text-muted"
      >
        {valueIcon}
        <span className="ui-settings-value">{value}</span>
        <ChevronRightIcon />
      </span>
    </button>
  );
}

/** A Settings switch shares the same row, help line, and divider as actions. */
export function SettingSwitchRow({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly help: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
}): ReactNode {
  return (
    <Switch
      label={label}
      hint={help}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
