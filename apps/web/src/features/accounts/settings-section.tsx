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
import type { ReactNode } from 'react';
import type { PageSection } from '@notesapp/ui';

/** One section: its name and sentence, then its controls. */
export function SettingsSection({
  section,
  description,
  children,
}: {
  readonly section: PageSection;
  readonly description?: string | undefined;
  readonly children: ReactNode;
}): ReactNode {
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
        <div className="mt-3 min-w-0 md:col-span-2 md:mt-0">{children}</div>
      </div>
    </section>
  );
}
