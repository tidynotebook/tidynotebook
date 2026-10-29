/** Shared UI text roles. The application stylesheet supplies these utilities. */
export const textRoleClasses = {
  pageTitle: 'text-title-page text-strong',
  headerTitle: 'text-title-header text-strong',
  body: 'text-body text-strong',
  label: 'text-label text-strong',
  value: 'text-value text-muted',
  secondary: 'text-secondary text-muted',
  group: 'text-group text-muted',
  small: 'text-small text-muted',
  avatar: 'text-avatar text-strong',
  previewBody: 'text-preview-body text-strong',
  previewHeading: 'text-preview-heading text-strong',
} as const;

/** The only size, line height, and weight combinations for touch UI text. */
export const touchTextRoles = {
  pageTitle: { size: 20, line: 28, weight: 600 },
  headerTitle: { size: 16, line: 24, weight: 600 },
  body: { size: 16, line: 24, weight: 400 },
  label: { size: 16, line: 24, weight: 500 },
  value: { size: 16, line: 24, weight: 400 },
  secondary: { size: 14, line: 20, weight: 400 },
  group: { size: 14, line: 20, weight: 600 },
  small: { size: 11, line: 16, weight: 400 },
  avatar: { size: 11, line: 16, weight: 600 },
  previewBody: { size: 14, line: 20, weight: 400 },
  previewHeading: { size: 14, line: 20, weight: 600 },
} as const;
