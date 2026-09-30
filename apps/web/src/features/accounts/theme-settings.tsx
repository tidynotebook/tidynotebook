/**
 * The appearance section of Settings: the appearance, the theme family, and
 * the themes that the person imports (record 0141).
 *
 * The appearance choices are a segmented control: one radio group in one
 * track, so the whole set is visible, the arrow keys move through it and the
 * choice in force is the raised segment. The theme families are radio buttons
 * as well, one chip each, and the chosen chip takes the strong edge and a
 * ring of the same colour and never the accent fill (decision 0062). A
 * selection applies at once, which is why the swatch of every family shows
 * the variant of the appearance in force.
 *
 * An imported theme is one more chip of the same group. The file goes
 * through the one reader of a theme file first, so a theme that cannot be
 * used never reaches the account and the person reads every part to correct.
 * The theme in use downloads as a file, which is the start of a new one.
 *
 * Both groups carry their focus treatment with `focus-within`, because the
 * radio a person reaches is visually hidden and the label around it is what
 * they see. `focus-visible` on the label would never match.
 */
import { useRef, useState, type ReactNode } from 'react';
import { deleteTheme, importTheme } from '@notesapp/api-client';
import {
  Button,
  CheckIcon,
  ComputerIcon,
  defaultThemeFamilyId,
  DownloadIcon,
  MoonIcon,
  Notice,
  readThemeFile,
  SunIcon,
  themeFileMaximumBytes,
  themeFileText,
  themeOfFamily,
  transitionSurface,
  TrashIcon,
  UploadIcon,
  type AppearanceChoice,
  type ThemeFamily,
} from '@notesapp/ui';
import { problemMessage, useSession, useTheme } from '../../app.tsx';
import {
  familyAmong,
  importedThemeIdOf,
  isImportedFamilyId,
  themeImportBody,
} from '../../lib/imported-themes.ts';
import { problemCode } from '../../lib/problem-text.ts';
import {
  sectionOf,
  settingsSections,
  type SettingsSectionKey,
} from '../../lib/page-sections.ts';
import { save } from '../export/export.ts';
import { SettingsSection } from './settings-section.tsx';

/** The three appearance choices, with the icon that names each of them. */
const appearanceChoices: readonly {
  readonly value: AppearanceChoice;
  readonly label: string;
  readonly icon: ReactNode;
}[] = [
  { value: 'system', label: 'System', icon: <ComputerIcon /> },
  { value: 'light', label: 'Light', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon /> },
];

/** One section of Settings, by its name in the list of the page. */
function settingsSection(key: SettingsSectionKey) {
  return sectionOf(settingsSections, key);
}

/**
 * The four colours that show what one family looks like.
 *
 * The swatch is the page background, the sidebar surface, the accent fill,
 * and the body text of the variant that the current appearance selects, so
 * the preview is exactly what the screen becomes on selection.
 */
function FamilySwatch({ family }: { readonly family: ThemeFamily }): ReactNode {
  const theme = useTheme();
  const tokens = themeOfFamily(family, theme.resolved).tokens;
  const colours = [
    tokens.background,
    tokens.surface,
    tokens.accentFill,
    tokens.text,
  ];
  return (
    <span
      aria-hidden="true"
      className="inline-flex overflow-hidden rounded-sm border border-edge-line"
    >
      {colours.map((colour, index) => (
        <span
          className="block h-4 w-3"
          key={`${String(index)}-${colour}`}
          style={{ backgroundColor: colour }}
        />
      ))}
    </span>
  );
}

/** The file name of a downloaded theme, from the name a person reads. */
function themeFileName(name: string): string {
  return `${name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Theme'}.json`;
}

/** What the last import or delete told the person. */
type Outcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'done'; readonly message: string }
  | {
      readonly kind: 'refused';
      readonly message: string;
      readonly problems: readonly string[];
    };

export function ThemeSettings(): ReactNode {
  const theme = useTheme();
  const session = useSession();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });
  const imported = theme.families.filter((family) =>
    isImportedFamilyId(family.id),
  );

  async function importFile(file: File): Promise<void> {
    if (file.size > themeFileMaximumBytes) {
      setOutcome({
        kind: 'refused',
        message: 'The file is too large to be a theme. Choose a theme file.',
        problems: [],
      });
      return;
    }
    const read = readThemeFile(await file.text());
    if (!read.ok) {
      setOutcome({
        kind: 'refused',
        message:
          'The theme did not import. Correct these parts of the file, then import it again.',
        problems: read.problems,
      });
      return;
    }
    const result = await importTheme({ body: themeImportBody(read.theme) });
    if (result.data === undefined) {
      setOutcome({
        kind: 'refused',
        message:
          problemCode(result.error) === 'theme_limit'
            ? 'Your account keeps as many imported themes as it can. Delete one, then import again.'
            : problemMessage(result.error),
        problems: [],
      });
      return;
    }
    session.adoptPreferences(result.data);
    setOutcome({
      kind: 'done',
      message: `${read.theme.name} is imported. Choose it under Theme.`,
    });
  }

  async function removeTheme(family: ThemeFamily): Promise<void> {
    const result = await deleteTheme({
      path: { themeId: importedThemeIdOf(family.id) },
    });
    if (result.data === undefined) {
      setOutcome({
        kind: 'refused',
        message: problemMessage(result.error),
        problems: [],
      });
      return;
    }
    // The account takes the default family when the theme was in use, and
    // this device follows it.
    if (theme.familyId === family.id) theme.setFamily(defaultThemeFamilyId);
    session.adoptPreferences(result.data);
    setOutcome({ kind: 'done', message: `${family.name} is deleted.` });
  }

  function run(work: () => Promise<void>): void {
    setBusy(true);
    setOutcome({ kind: 'none' });
    void work()
      .catch((failure: unknown) => {
        setOutcome({
          kind: 'refused',
          message: problemMessage(failure),
          problems: [],
        });
      })
      .finally(() => {
        setBusy(false);
      });
  }

  const current = familyAmong(theme.families, theme.familyId);

  return (
    <SettingsSection
      section={settingsSection('appearance')}
      description="System follows the device. The choice applies at once on this device and goes to your account in the background. Import a theme file to use your own colours."
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="sr-only">Appearance</legend>
        <div className="inline-flex rounded-md border border-edge-subtle bg-surface p-0.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          {appearanceChoices.map((choice) => {
            const chosen = theme.choice === choice.value;
            return (
              <label
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-control ${transitionSurface} md:min-h-7 ${
                  chosen
                    ? 'bg-card font-medium text-strong shadow-raised'
                    : 'text-muted hover:text-strong'
                }`}
                key={choice.value}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="theme-choice"
                  value={choice.value}
                  checked={chosen}
                  onChange={(): void => {
                    theme.setChoice(choice.value);
                  }}
                />
                <span className="inline-flex items-center" aria-hidden="true">
                  {choice.icon}
                </span>
                <span>{choice.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="m-0 mt-4 border-0 p-0">
        <legend className="mb-2 p-0 text-control font-medium text-strong">
          Theme
        </legend>
        <div className="flex flex-wrap gap-cluster">
          {theme.families.map((family) => {
            const chosen = theme.familyId === family.id;
            return (
              <label
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-card px-2.5 text-control text-strong ${transitionSurface} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus md:min-h-8 ${
                  chosen
                    ? 'border-strong ring-1 ring-strong'
                    : 'border-edge-line hover:bg-hover'
                }`}
                key={family.id}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="theme-family"
                  value={family.id}
                  checked={chosen}
                  onChange={(): void => {
                    theme.setFamily(family.id);
                  }}
                />
                <FamilySwatch family={family} />
                <span>{family.name}</span>
                {chosen ? (
                  <span className="inline-flex items-center" aria-hidden="true">
                    <CheckIcon />
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        aria-label="Choose a theme file"
        onChange={(event): void => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) run(() => importFile(file));
        }}
      />
      <div className="mt-4 flex flex-wrap gap-cluster">
        <Button
          variant="secondary"
          icon={<UploadIcon />}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? 'Importing the theme' : 'Import a theme'}
        </Button>
        <Button
          variant="secondary"
          icon={<DownloadIcon />}
          onClick={() => {
            save(
              new Blob([themeFileText(current)], { type: 'application/json' }),
              themeFileName(current.name),
            );
          }}
        >
          Download this theme
        </Button>
      </div>
      {imported.length === 0 ? null : (
        <div className="mt-4">
          <h3 className="m-0 mb-2 text-control font-medium text-strong">
            Imported themes
          </h3>
          <ul className="m-0 flex list-none flex-col gap-cluster p-0">
            {imported.map((family) => (
              <li
                className="flex items-center justify-between gap-cluster text-control text-strong"
                key={family.id}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <FamilySwatch family={family} />
                  <span className="truncate">{family.name}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  tone="danger"
                  icon={<TrashIcon />}
                  disabled={busy}
                  label={`Delete ${family.name}`}
                  onClick={() => {
                    run(() => removeTheme(family));
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {outcome.kind === 'none' ? null : (
        <div className="mt-4">
          <Notice
            tone={outcome.kind === 'done' ? 'success' : 'problem'}
            message={outcome.message}
          />
          {outcome.kind === 'refused' && outcome.problems.length > 0 ? (
            <ul className="m-0 mt-2 flex flex-col gap-1 pl-5 text-control text-strong">
              {outcome.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {theme.syncError === null ? null : (
        <Notice className="mt-4" tone="problem" message={theme.syncError} />
      )}
    </SettingsSection>
  );
}
