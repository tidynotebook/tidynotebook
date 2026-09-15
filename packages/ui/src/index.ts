/**
 * Public entry point of the notesapp UI package.
 *
 * It owns the theme registry, appearance helpers, layout primitives,
 * accessible controls, and lightweight SVG icons. It runs in the browser and
 * imports nothing but React, so it stays out of storage, sync, and network
 * decisions.
 */
export type {
  Appearance,
  AppearanceChoice,
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
  contrastRatio,
  defaultThemeFamilyId,
  defaultThemeFor,
  findTheme,
  findThemeFamily,
  parseAppearanceChoice,
  parseHexColor,
  parseThemeFamilyId,
  relativeLuminance,
  resolveAppearance,
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
  uiContrastMinimum,
} from './themes/index.ts';
export type { ButtonSize, ButtonVariant, SelectOption } from './controls.tsx';
export {
  Badge,
  Button,
  buttonClassName,
  CollapsibleSection,
  SelectField,
  StatusRegion,
  TextField,
} from './controls.tsx';
export type { LoadingShape } from './loading.tsx';
export { LoadingState } from './loading.tsx';
export type { PageWidth } from './layout.tsx';
export {
  Card,
  EmptyState,
  ListRow,
  Page,
  pageGutter,
  PageHeader,
  Toolbar,
} from './layout.tsx';
export type { DialogWidth } from './dialog.tsx';
export { Dialog, DialogBody, DialogFooter } from './dialog.tsx';
export type { MenuAlign, MenuItem } from './menu.tsx';
export { Menu } from './menu.tsx';
export type { NoticeTone } from './notice.tsx';
export { Notice } from './notice.tsx';
export type { IconProps } from './icons.tsx';
export {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CloudCheckIcon,
  CloudOffIcon,
  CloudUploadIcon,
  ComputerIcon,
  CopyIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HistoryIcon,
  ImageIcon,
  MenuIcon,
  MoonIcon,
  MoreIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
  WorkspaceIcon,
} from './icons.tsx';
