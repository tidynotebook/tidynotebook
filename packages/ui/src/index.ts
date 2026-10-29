/**
 * Public entry point of the notesapp UI package.
 *
 * It owns the theme registry, appearance helpers, layout primitives,
 * accessible controls, the one recipe of a control, and one icon set on one
 * grid. It runs in the browser and imports nothing but React, so it stays out
 * of storage, sync, and network decisions.
 */
export type {
  Appearance,
  AppearanceChoice,
  DerivedPropertyName,
  SyntaxPropertyName,
  SyntaxTokens,
  Theme,
  ThemeFamily,
  ThemePropertyName,
  ThemeRoot,
  ThemeSource,
  ThemeTokens,
} from './themes/index.ts';
export {
  appearanceStorageKey,
  applyTheme,
  applyThemeToDocument,
  colourSchemeProperty,
  contrastRatio,
  defaultThemeFamilyId,
  defaultThemeFor,
  derivedPropertyName,
  derivedPropertyNames,
  derivedValue,
  dividerBlend,
  fillHoverShift,
  findTheme,
  findThemeFamily,
  mixHexColors,
  parseAppearanceChoice,
  parseHexColor,
  parseThemeFamilyId,
  relativeLuminance,
  resolveAppearance,
  scrollbarProperty,
  scrollbarValue,
  shiftAwayFrom,
  syntaxPropertyName,
  syntaxPropertyNames,
  textContrastMinimum,
  themeFamilies,
  themeFamilyStorageKey,
  themeFor,
  themeOfFamily,
  themeProperties,
  themePropertyName,
  themePropertyNames,
  themes,
  toneSurfaceBlend,
  uiContrastMinimum,
} from './themes/index.ts';
export type { ThemeProblem } from './theme-rules.ts';
export { themeColourLabels, themeProblems } from './theme-rules.ts';
export type {
  ThemeFileData,
  ThemeFileResult,
  ThemePalette,
} from './theme-file.ts';
export {
  importedFamilyPrefix,
  importedThemeFamily,
  readThemeFile,
  themeFileMaximumBytes,
  themeFileText,
  themeNameMaximumLength,
} from './theme-file.ts';
export type {
  ButtonName,
  ButtonSize,
  ButtonTone,
  ButtonVariant,
  EdgeMark,
  FrameEdge,
} from './control-classes.ts';
export {
  avatarClassName,
  badgeClassName,
  bareFieldClassName,
  buttonClassName,
  buttonName,
  calendarDayClassName,
  calendarNoteMarkClassName,
  checkboxClassNames,
  compactButtonVisualClassName,
  controlStripClassName,
  edgeControlClassName,
  fieldClassName,
  inlineFieldClassName,
  selectClassName,
  sidebarViewClassName,
  tabClassName,
  taskBoxClassName,
  textAreaClassName,
  focusOutline,
  focusOutlineInset,
  kbdClassName,
  menuSurfaceClassName,
  menuSurfaceStyle,
  menuSurfaceValues,
  meterAlmostFull,
  meterClassNames,
  meterFillPercent,
  rowClassName,
  touchFieldText,
} from './control-classes.ts';
export { defaultIconSize, iconAttributes, iconGrid } from './icon-grid.ts';
export type { GlyphPart } from './glyph-parts.ts';
export {
  arrowDownParts,
  arrowUpParts,
  checkParts,
  closeParts,
  copyParts,
  gripParts,
  plusParts,
} from './glyph-parts.ts';
export { glyph } from './glyph.ts';
export { codeFigureClassName } from './code-figure.ts';
export type { CopyControlWords, CopyState } from './copy-action.ts';
export { copiedForMs, copyCodeWords, copyControlWords } from './copy-action.ts';
export type { SelectOption } from './controls.tsx';
export {
  Badge,
  Button,
  Checkbox,
  CollapsibleSection,
  Meter,
  ReadOnlyField,
  SelectField,
  StatusRegion,
  TextAreaField,
  TextField,
} from './controls.tsx';
export type { LoadingShape } from './loading.tsx';
export { LoadingState } from './loading.tsx';
export {
  Card,
  EmptyState,
  ListRow,
  Page,
  pageGutter,
  PageBackProvider,
  PageHeader,
  PageRegion,
} from './layout.tsx';
export type { PageSection } from './layout-classes.ts';
export {
  pageColumnClassName,
  pageGroupLabelClassName,
  pageListClassName,
  pageRowClassName,
  pageSideClassName,
} from './layout-classes.ts';
export {
  transitionAction,
  transitionField,
  transitionPanel,
  transitionRaise,
  transitionSurface,
} from './motion.ts';
export type { DialogWidth } from './dialog.tsx';
export {
  Dialog,
  DialogBody,
  DialogFooter,
  FixedDialogLayout,
  DialogHeaderActionsContext,
  DialogHeaderAction,
} from './dialog.tsx';
export type { MenuAlign, MenuAnchor, MenuItem } from './menu.tsx';
export type { ScreenArea, VisualViewportBox } from './visible-area.ts';
export {
  followVisibleArea,
  readVisibleArea,
  visibleArea,
} from './visible-area.ts';
export { AnchoredMenu, Menu } from './menu.tsx';
export type { NoticeTone } from './notice.tsx';
export { Notice } from './notice.tsx';
export { Toast } from './toast.tsx';
export type { IconProps } from './icons.tsx';
export {
  AlertCircleIcon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AppMarkIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BoldIcon,
  BulletListIcon,
  CalendarDayIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  CloseIcon,
  CodeIcon,
  CollapseAllIcon,
  ComputerIcon,
  ClipboardIcon,
  CopyIcon,
  DownloadIcon,
  ExpandAllIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HistoryIcon,
  InfoIcon,
  ItalicIcon,
  KeyboardIcon,
  LinkIcon,
  MenuIcon,
  MoonIcon,
  MoreIcon,
  MoveIcon,
  OrderedListIcon,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  QuoteIcon,
  SearchIcon,
  SettingsIcon,
  SignOutIcon,
  SortIcon,
  StrikethroughIcon,
  SunIcon,
  TableColumnAddIcon,
  TableColumnRemoveIcon,
  TableRemoveIcon,
  TableIcon,
  TableRowAddIcon,
  TableRowRemoveIcon,
  TaskListIcon,
  TemplateIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
  PaletteIcon,
  PersonIcon,
  KeyIcon,
  WorkspaceIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons.tsx';

export { publicLayout } from './public-layout.ts';

export { PublicFooter } from './public-footer-react.ts';
export {
  hostedFooterColumns,
  installationFooterColumns,
  renderPublicFooter,
} from './public-footer.ts';
export type {
  FooterColumn,
  FooterLink,
  PublicFooterOptions,
} from './public-footer.ts';

export { HistoryButton } from './history-button.tsx';
export {
  historyButtonClassName,
  historyButtonName,
  historyButtonVisualClassName,
} from './control-classes.ts';
export { UndoIcon, RedoIcon } from './icons.tsx';
export { Switch } from './controls.tsx';

export { FieldPopover } from './field-popover.tsx';

export { isTouchInput } from './input-focus.ts';

export { textRoleClasses, touchTextRoles } from './typography.ts';
