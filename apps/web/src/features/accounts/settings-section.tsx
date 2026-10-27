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
import type { PageSection } from '@notesapp/ui';

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
  readonly children: ReactNode;
}): ReactNode {
  const topic = useContext(SettingsTopicContext);
  if (topic !== null)
    return (
      <section className="pb-2 pt-4 first:pt-0" aria-label={section.title}>
        {topic.hiddenTitles.includes(section.id) ? null : (
          <h3
            className={`m-0 border-b border-edge-subtle pb-1.5 text-control font-semibold ${danger ? 'text-danger' : 'text-muted'}`}
            id={section.id}
          >
            {heading ?? section.title}
          </h3>
        )}
        {topic.helpSection === section.id && description !== undefined ? (
          <p className="mb-3 mt-0 text-control text-muted">{description}</p>
        ) : null}
        <div className="min-w-0">
          {warning === undefined ? null : (
            <p className="mb-3 mt-0 text-control text-muted">{warning}</p>
          )}
          {children}
        </div>
      </section>
    );
  return (
    <section
      className="border-t border-edge-subtle py-6"
      aria-labelledby={section.id}
    >
      <div className="md:grid md:grid-cols-3 md:gap-group">
        <div className="md:col-span-1">
          <h2
            className="m-0 text-ui font-semibold text-strong"
            id={section.id}
            tabIndex={-1}
          >
            {section.title}
          </h2>
          {description === undefined ? null : (
            <p className="mb-0 mt-1 text-control text-muted">{description}</p>
          )}
        </div>
        <div className="mt-3 min-w-0 md:col-span-2 md:mt-0">
          {warning === undefined ? null : (
            <p className="mb-3 mt-0 text-control text-muted">{warning}</p>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * One compact row of the Settings modal (issue 517, item 8): the label and
 * one line of help on the left, the control on the right, 52 px high.
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
    <div className="flex min-h-13 flex-wrap items-center gap-x-group gap-y-2 border-b border-edge-subtle py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-ui text-strong">{label}</p>
        {help === undefined ? null : (
          <p className="m-0 text-control text-muted">{help}</p>
        )}
      </div>
      {children === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-cluster">
          {children}
        </div>
      )}
    </div>
  );
}
