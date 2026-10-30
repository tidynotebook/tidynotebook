import {
  Card,
  Button,
  Stack,
  ListRow,
  SectionHeading,
  WrapText,
  Switch,
  type PageSection,
} from '@notesapp/ui';
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
    <ListRow
      as="button"
      density="setting"
      label={label}
      labelTone={danger ? 'danger' : 'accent'}
      help={help?.trim() ? <WrapText>{help}</WrapText> : undefined}
      onClick={onClick}
      disabled={disabled}
      className="ui-settings-action-link text-left"
    />
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
  const hidden =
    topic !== null &&
    topic.hiddenTitles.includes(section.id) &&
    !(phone && section.id === 'profile-heading');
  return (
    <Stack as="section" gap={2} aria-label={section.title}>
      {hidden ? null : topic !== null ? (
        <SectionHeading
          id={section.id}
          label={heading ?? section.title}
          danger={danger}
          divider
          inset={{ fine: 0, coarse: 4 }}
        />
      ) : (
        <Stack gap={1}>
          <h2
            id={section.id}
            tabIndex={-1}
            className="text-title-header text-strong"
          >
            {section.title}
          </h2>
          {description === undefined ? null : (
            <p className="text-secondary text-muted">{description}</p>
          )}
        </Stack>
      )}
      {topic?.helpSection === section.id && description !== undefined ? (
        <p className="text-secondary text-muted">{description}</p>
      ) : null}
      {grouped ? (
        <Stack gap={{ fine: 6, coarse: 4 }} className="min-w-0">
          {warning === undefined ? null : (
            <p className="text-secondary text-muted">{warning}</p>
          )}
          {children}
        </Stack>
      ) : (
        <Card responsive className="min-w-0">
          {warning === undefined ? null : (
            <p className="text-secondary text-muted">{warning}</p>
          )}
          {children}
        </Card>
      )}
    </Stack>
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
    <ListRow
      as="div"
      density="setting"
      label={label}
      help={help?.trim() ? <WrapText>{help}</WrapText> : undefined}
      control={children}
    />
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
    <ListRow
      as="button"
      density="setting"
      buttonRef={buttonRef}
      label={label}
      help={help.trim() ? <WrapText>{help}</WrapText> : undefined}
      value={
        <>
          {valueIcon}
          <span>{value}</span>
        </>
      }
      trailing={{ kind: 'chevron' }}
      disabled={disabled}
      onClick={onClick}
      className="ui-settings-choice text-left"
    />
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
