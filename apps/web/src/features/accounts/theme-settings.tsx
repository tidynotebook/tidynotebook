import {
  Stack,
  Grid,
  Inline,
  SectionHeading,
  Card,
  ThemePreview,
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
  UploadIcon,
  type AppearanceChoice,
  type ThemeFamily,
} from '@notesapp/ui';

/**
 * The appearance of Appearance and editor in Settings (records 0143 and
 * issue 517, item 6).
 *
 * Mode and Theme are radio groups of preview cards. Each card paints a small
 * picture of the app with the tokens of the theme registry: a Mode card in
 * the light or dark variant of the family in use, System in both halves, and
 * a Theme card in the variant of the mode in force, so a card shows exactly
 * what the screen becomes on selection. A family with one variant says so. A
 * choice applies at once, and the chosen card takes the strong edge and a
 * ring of the same colour and never the accent fill (decision 0062).
 *
 * An imported theme is one more card, with its own Delete. The file goes
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

import { actionIcon } from '../../shell/action-icons.tsx';
import { deleteForGoodLabel, deleteGlyph } from '../../lib/delete-label.ts';
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
import {
  SettingActionRow,
  usePhoneSettings,
  SettingsSection,
} from './settings-section.tsx';

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
 * A small picture of the app in one theme (issue 517, item 6): the sidebar,
 * a title, two lines of text and a link, each painted with a token of the
 * theme registry, so the card shows what the screen becomes on selection.
 */
/** The mode of a family that has only one, or `null` for both modes. */
export function onlyModeOf(family: ThemeFamily): 'light' | 'dark' | null {
  const modes = new Set(family.variants.map((variant) => variant.appearance));
  if (modes.size !== 1) return null;
  return modes.has('dark') ? 'dark' : 'light';
}

/** The classes of one selectable card, chosen or not. */
function cardClassName(chosen: boolean): string {
  return `flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-md border bg-card text-body text-strong ${transitionSurface} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
    chosen
      ? 'border-strong ring-1 ring-strong'
      : 'border-edge-line hover:bg-hover'
  }`;
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
  const phone = usePhoneSettings();
  const theme = useTheme();
  const session = useSession();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });

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
  const exportCurrent = (): void =>
    save(
      new Blob([themeFileText(current)], { type: 'application/json' }),
      themeFileName(current.name),
    );
  const light = themeOfFamily(current, 'light');
  const dark = themeOfFamily(current, 'dark');

  return (
    <SettingsSection
      section={settingsSection('appearance')}
      grouped
      description="System follows the device. The choice applies at once on this device and goes to your account in the background. Import a theme file to use your own colours."
    >
      <Stack gap={{ fine: 6, coarse: 4 }}>
        <Stack gap={2} pad={0} className="border-0">
          <legend className="sr-only">Mode</legend>
          <SectionHeading label={<>Mode</>} divider />
          <Grid gap={2} as="div" className="ui-theme-tiles grid-cols-3">
            {appearanceChoices.map((choice) => {
              const chosen = theme.choice === choice.value;
              return (
                <label className={cardClassName(chosen)} key={choice.value}>
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
                  {choice.value === 'system' ? (
                    <span className="flex" aria-hidden="true">
                      <ThemePreview theme={light} className="w-1/2" />
                      <ThemePreview theme={dark} className="w-1/2" />
                    </span>
                  ) : (
                    <ThemePreview
                      theme={choice.value === 'light' ? light : dark}
                    />
                  )}
                  <Inline padY={2} gap={2} padX={2} align="center" as="span">
                    <span
                      className="inline-flex items-center"
                      aria-hidden="true"
                    >
                      {choice.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {choice.label}
                    </span>
                    {chosen ? (
                      <span
                        className="inline-flex items-center"
                        aria-hidden="true"
                      >
                        <CheckIcon />
                      </span>
                    ) : null}
                  </Inline>
                </label>
              );
            })}
          </Grid>
        </Stack>
        <Stack gap={2} pad={0} className="border-0">
          <legend className="sr-only">Theme</legend>
          <SectionHeading
            label={<>Theme</>}
            divider
            action={
              <>
                {phone ? null : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<UploadIcon />}
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                    >
                      {busy ? 'Importing the theme' : 'Import theme file'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<DownloadIcon />}
                      label={`Export the ${current.name} theme file`}
                      onClick={() => {
                        save(
                          new Blob([themeFileText(current)], {
                            type: 'application/json',
                          }),
                          themeFileName(current.name),
                        );
                      }}
                    >
                      Export theme file
                    </Button>
                  </>
                )}
              </>
            }
          />
          <Inline
            gap={2}
            pad={0}
            padY={1}
            as="ul"
            className="ui-theme-tiles list-none overflow-x-auto md:grid md:grid-cols-4 md:overflow-visible lg:grid-cols-4"
          >
            {theme.families.map((option) => {
              const chosen = theme.familyId === option.id;
              const only = onlyModeOf(option);
              const importedTheme = isImportedFamilyId(option.id);
              return (
                <Stack
                  gap={1}
                  as="li"
                  className="w-28 shrink-0 md:w-auto"
                  key={option.id}
                >
                  <label className={cardClassName(chosen)}>
                    <input
                      className="sr-only"
                      type="radio"
                      name="theme-family"
                      value={option.id}
                      checked={chosen}
                      onChange={(): void => {
                        theme.setFamily(option.id);
                      }}
                    />
                    <ThemePreview
                      theme={themeOfFamily(option, theme.resolved)}
                    />
                    <Inline padY={2} gap={1} padX={2} align="center" as="span">
                      <span className="min-w-0 flex-1 truncate">
                        {option.name}
                      </span>
                      {only === null ? null : (
                        <span className="shrink-0 text-secondary text-muted">
                          {only === 'dark' ? 'dark only' : 'light only'}
                        </span>
                      )}
                      {chosen ? (
                        <span
                          className="inline-flex items-center"
                          aria-hidden="true"
                        >
                          <CheckIcon />
                        </span>
                      ) : null}
                    </Inline>
                  </label>
                  {importedTheme ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      tone="danger"
                      icon={actionIcon(deleteGlyph)}
                      disabled={busy}
                      label={`${deleteForGoodLabel} ${option.name}`}
                      onClick={() => {
                        run(() => removeTheme(option));
                      }}
                    >
                      {deleteForGoodLabel}
                    </Button>
                  ) : null}
                </Stack>
              );
            })}
          </Inline>
          {phone ? (
            <Card responsive>
              <SettingActionRow
                label="Import theme file…"
                actionLabel="Import theme file"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              />
              <SettingActionRow
                label="Export theme file"
                actionLabel="Export theme file"
                onClick={exportCurrent}
              />
            </Card>
          ) : null}
        </Stack>
      </Stack>
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
      {outcome.kind === 'none' ? null : (
        <Stack gap={2} as="div">
          <Notice
            tone={outcome.kind === 'done' ? 'success' : 'problem'}
            message={outcome.message}
          />
          {outcome.kind === 'refused' && outcome.problems.length > 0 ? (
            <Stack gap={1} padX={6} as="ul" className="text-body text-strong">
              {outcome.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </Stack>
          ) : null}
        </Stack>
      )}
      {theme.syncError === null ? null : (
        <Notice tone="problem" message={theme.syncError} />
      )}
    </SettingsSection>
  );
}
