/**
 * One section of Settings and of the pages that belong to it.
 *
 * A section is not a card. From the medium width it is two columns: the name
 * of the section and its sentence on the left, the controls on the right, so
 * a person scans the names of every section in one pass. A hairline separates
 * one section from the next, which is the one place a rule is drawn here,
 * because a person counts the sections of a list they scroll (decision 0063).
 *
 * The title and the heading come from the list of sections of the page,
 * which the side region reads as well, so the two cannot disagree
 * (decision 0137). Settings and Accounts both take this one layout, because
 * Accounts is a part of Settings (record 0138).
 */
import { createContext, useContext, type ReactNode } from 'react';
import { ChevronRightIcon, Switch, type PageSection } from '@notesapp/ui';

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
  heading,
  danger = false,
  description,
  warning,
  children,
}: {
  readonly section: PageSection;
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
  if (topic !== null)
    return (
      <section className={'ui-section'} aria-label={section.title}>
        {topic.hiddenTitles.includes(section.id) ? null : (
          <h3
            className={`ui-group-heading border-b border-edge-subtle text-group ${danger ? 'text-danger' : 'text-muted'}`}
            id={section.id}
          >
            {heading ?? section.title}
          </h3>
        )}
        {topic.helpSection === section.id && description !== undefined ? (
          <p className="mb-3 mt-0 text-secondary text-muted">{description}</p>
        ) : null}
        <div className="min-w-0">
          {warning === undefined ? null : (
            <p className="mb-3 mt-0 text-secondary text-muted">{warning}</p>
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
            <p className="mb-3 mt-0 text-secondary text-muted">{warning}</p>
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
    <div className="ui-setting-row ui-setting-align flex flex-wrap items-start border-b border-edge-subtle lg:flex-nowrap">
      <div className="contents lg:block lg:min-w-0 lg:flex-1">
        <p
          data-setting-label
          className="order-1 m-0 min-w-0 flex-1 break-words text-body text-strong lg:truncate"
        >
          {label}
        </p>
        {help === undefined ? null : (
          <p
            className="order-3 m-0 line-clamp-2 w-full break-words text-secondary text-muted lg:line-clamp-1"
            title={help}
          >
            {help}
          </p>
        )}
      </div>
      {children === undefined ? null : (
        <div
          data-setting-control
          className="order-2 flex shrink-0 flex-wrap items-start gap-cluster"
        >
          {children}
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
}: {
  readonly label: string;
  readonly help: string;
  readonly value: string;
  readonly valueIcon?: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="ui-setting-row ui-setting-align flex w-full items-start border-b border-edge-subtle bg-transparent text-left hover:bg-hover focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-default disabled:text-muted pointer-coarse:flex-wrap pointer-coarse:gap-y-0"
    >
      <span className="min-w-0 flex-1 pointer-coarse:contents">
        <span
          data-setting-label
          className="block truncate text-body text-strong pointer-coarse:order-1 pointer-coarse:min-w-0 pointer-coarse:flex-1"
        >
          {label}
        </span>
        <span className="line-clamp-2 break-words text-secondary text-muted lg:line-clamp-1 pointer-coarse:order-4 pointer-coarse:w-full pointer-coarse:basis-full">
          {help}
        </span>
      </span>
      <span
        data-setting-control
        className="inline-flex min-w-0 max-w-1/2 items-center gap-2 text-value text-muted pointer-coarse:order-2"
        title={value}
      >
        {valueIcon === undefined ? null : (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {valueIcon}
          </span>
        )}
        <span className="truncate">{value}</span>
      </span>
      <span
        className="inline-flex shrink-0 text-muted pointer-coarse:order-3"
        aria-hidden="true"
      >
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
    <SettingRow label={label} help={help}>
      <Switch
        hideLabel
        label={label}
        hint={help}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </SettingRow>
  );
}
