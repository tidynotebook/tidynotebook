/**
 * The HTML document of one page of the documentation site.
 *
 * Record 0152 makes the site read like the product by construction. This
 * module writes every element that the site draws around the text of a page:
 * the header, the contents, the column of the note measure, the list of the
 * headings, the previous and the next page, the search dialog, and the page
 * that answers an address with no page. It reads no file and writes no file,
 * so a unit test drives every part of it.
 *
 * **Presentation comes from the product.** Every control reads its classes
 * from `packages/ui/src/control-classes.ts`, every page column from
 * `packages/ui/src/layout-classes.ts`, and every icon from the one set of
 * `packages/ui/src/icons.tsx`, drawn here to static markup. The page loads the
 * one built stylesheet of the application, which `apps/web/src/tailwind.css`
 * writes with the classes of this folder registered as a source. The root
 * states no appearance, so the page takes the Default palette of the device
 * (record 0151).
 *
 * **The text of a page is already safe.** It arrives as the output of
 * `renderMarkdown`, the one sanitized renderer. Every other value passes
 * `escapeText` or `escapeAttribute`.
 *
 * **The article is generated markup**, which a class attribute cannot reach,
 * so `articleClasses` styles it through descendant variants with values from
 * the named scales, like the published page of record 0031.
 */
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  renderPublicFooter,
  hostedFooterColumns,
  AppMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  MenuIcon,
  SearchIcon,
  buttonClassName,
  codeFigureClassName,
  kbdClassName,
  pageColumnClassName,
  pageGroupLabelClassName,
  pageGutter,
  pageListClassName,
  pageRowClassName,
  pageSideClassName,
  rowClassName,
  type IconProps,
} from '@notesapp/ui';
import { slugOf, type GuideGroup, type GuidePage } from './guide.ts';
import { editHref, markdownHref, pageHref } from './links.ts';
import {
  absoluteAddress,
  productName,
  repositoryUrl,
  siteName,
  socialPreview,
  type SiteSettings,
} from './site.ts';

/** Text that a person reads, with every markup character removed. */
export function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** One attribute value, with the quote and the markup characters removed. */
export function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** One icon of the set at 16 pixels, as static markup. */
function icon(
  component: (props: IconProps) => ReactNode,
  className = 'shrink-0',
): string {
  return renderToStaticMarkup(
    createElement(component, { size: 16, className }),
  );
}

/** The assets of the built site that a page names. */
export type SiteAssets = {
  /** The stylesheets, in order. */
  readonly stylesheets: readonly string[];
  /** The one client module. */
  readonly script: string;
  /** The icon of the product. */
  readonly icon: string | null;
};

/** A page next to this one in the reading order. */
export type PageLink = {
  readonly title: string;
  readonly href: string;
};

/** What one page of the site shows. */
export type PageView = {
  readonly settings: SiteSettings;
  readonly assets: SiteAssets;
  readonly groups: readonly GuideGroup[];
  readonly page: GuidePage;
  /** The group of the page, or `null` for the home page. */
  readonly group: string | null;
  /** The sanitized HTML of the page text. */
  readonly html: string;
  /** The Markdown copy of the page, which the copy control writes. */
  readonly markdown: string;
  readonly previous: PageLink | null;
  readonly next: PageLink | null;
  /** Generated pages name their contract, instead of a guide edit address. */
  readonly sourceHref?: string;
  /** Long API pages list operations or schemas, without their repeated parts. */
  readonly outlineDepth?: 2 | 3;
};

/** The frame of the document. It matches the shell of the application. */
export const bodyClasses =
  'm-0 flex h-dvh flex-col overflow-hidden bg-app font-sans text-ui leading-relaxed text-ink antialiased';

/** The header: the chrome plane, the height of the frame header. */
export const headerClasses =
  'flex h-header shrink-0 items-center gap-cluster border-b border-edge-subtle bg-surface px-2 md:px-3';

/** The product mark and the name of the site, the link to the home page. */
export const homeLinkClasses =
  'flex min-w-0 items-center gap-2 rounded-md px-1 text-ui font-semibold text-strong no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** The row under the header that holds the contents and the page. */
export const frameClasses = 'relative flex min-h-0 flex-1';

/**
 * The contents of the site: the chrome plane beside the page.
 *
 * From the medium width up it stands beside the page. Below that it is hidden
 * until the menu button opens it over the page, which the client script states
 * with `data-open`.
 */
export const contentsClasses =
  'w-68 shrink-0 overflow-y-auto border-r border-edge-subtle bg-surface px-3 py-4 max-md:absolute max-md:inset-0 max-md:z-20 max-md:hidden max-md:w-full max-md:border-r-0 max-md:data-open:block';

/** The scroller of the page, which holds the column and the side region. */
export const mainClasses = 'min-w-0 flex-1 overflow-y-auto';

/** The line above the title: the group of the page and its two actions. */
export const toolbarClasses =
  'mb-2 flex min-h-8 flex-wrap items-center justify-between gap-cluster';

/** The group of the page above its title. */
export const groupClasses = 'm-0 text-help font-medium text-muted';

/**
 * The typography of the text of a page.
 *
 * It is the typography of a note on the published page: the note steps, the
 * heading ramp and its tightening, the quote bar and the alert tones. A guide
 * holds more code and more tables than a note, so code takes the fill of the
 * chrome plane, which differs from the page in light and in dark, and a table
 * scrolls on its own and takes the body text step.
 */
export const articleClasses = [
  'text-note',
  '[&_h1]:mb-4 [&_h1]:mt-0 [&_h1]:text-note-h1 [&_h1]:font-note-heading [&_h1]:tracking-display [&_h1]:text-strong',
  '[&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-note-h2 [&_h2]:font-note-heading [&_h2]:tracking-heading [&_h2]:text-strong',
  '[&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-note-h3 [&_h3]:font-note-heading [&_h3]:tracking-heading [&_h3]:text-strong',
  '[&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:text-note-h4 [&_h4]:font-note-heading [&_h4]:text-strong',
  '[&_p]:my-4',
  '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6',
  '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_li]:my-1',
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
  '[&_strong]:font-semibold',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-edge-line [&_blockquote]:pl-4 [&_blockquote]:text-muted',
  '[&_blockquote.notes-alert]:text-ink',
  '[&_blockquote[data-alert=note]]:border-accent [&_blockquote[data-alert=important]]:border-accent',
  '[&_blockquote[data-alert=tip]]:border-success',
  '[&_blockquote[data-alert=warning]]:border-danger [&_blockquote[data-alert=caution]]:border-danger',
  '[&_.notes-alert-title]:mb-1 [&_.notes-alert-title]:font-note-heading',
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface [&_pre]:p-4 [&_pre]:pr-20 [&_pre]:font-mono [&_pre]:text-note-mono [&_pre]:leading-relaxed',
  '[&_code]:font-mono [&_code]:text-note-mono',
  // A code block is a figure with its language at the top of the card, as the
  // renderer writes it and the published page shows it (record 0174), and
  // the copy button of the site stands at the other end of that top.
  codeFigureClassName,
  '[&_:not(pre)>code]:rounded-sm [&_:not(pre)>code]:bg-surface [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-strong',
  '[&_hr]:my-8 [&_hr]:border-edge-line',
  '[&_table]:my-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-ui',
  '[&_th]:border [&_th]:border-edge-line [&_th]:bg-surface [&_th]:p-2 [&_th]:text-left [&_th]:align-top [&_th]:font-medium [&_th]:text-strong',
  '[&_td]:border [&_td]:border-edge-line [&_td]:p-2 [&_td]:align-top',
].join(' ');

/** The links to the previous and the next page under the text. */
export const pagerClasses =
  'mt-12 grid grid-cols-1 gap-cluster border-t border-edge-line pt-6 sm:grid-cols-2';

/** One link of the pager, a row of the recipe that holds two lines. */
const pagerLinkClasses = rowClassName({
  className: 'flex-col items-start gap-0 py-2',
});

/** The second line of a pager link, which names the direction. */
export const pagerHintClasses = 'text-control text-muted';

/** The foot of a page, which names the source and the licence. */
export const footClasses =
  'mt-8 flex flex-wrap gap-x-group gap-y-1 pb-10 text-control text-muted';

/** A link of the foot. */
export const footLinkClasses =
  'rounded-sm text-muted underline underline-offset-2 hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** The side region that lists the headings of the page. */
const sideClasses = `${pageSideClassName()} sticky top-0 max-h-96 self-start overflow-y-auto pb-6 pt-6`;

/** The full screen layer of the search dialog, with the scrim behind it. */
export const searchDialogClasses =
  'm-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-scrim/40';

/** The raised panel of the search dialog, like a dialog of `packages/ui`. */
export const searchPanelClasses =
  'mx-auto mt-20 flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-edge-subtle bg-card text-ink shadow-modal';

/** The field row at the top of the search panel. */
export const searchFieldRowClasses =
  'flex items-center gap-cluster border-b border-edge-line pl-gutter pr-2';

/** The field of the search, as the command palette of the application draws it. */
export const searchFieldClasses =
  'min-w-0 flex-1 border-0 bg-transparent py-3 text-ui text-strong outline-none placeholder:text-muted';

/** The list of the results. */
export const searchResultsClasses =
  'm-0 flex max-h-96 list-none flex-col gap-1 overflow-y-auto p-2';

/** One result: a row of the recipe that holds a title and an excerpt. */
export const searchResultClasses = rowClassName({
  className: 'flex-col items-start gap-0 py-2',
});

/** The excerpt of a result, with the matched words marked. */
export const searchExcerptClasses =
  'line-clamp-2 text-control text-muted [&_mark]:bg-transparent [&_mark]:font-medium [&_mark]:text-strong';

/** The sentence that states the number of results, or that none match. */
export const searchStatusClasses = 'm-0 px-4 pb-3 pt-1 text-control text-muted';

/** The layer that holds one code block and its copy button. */
export const codeBlockClasses = 'relative';

/** The copy button of a code block, at the top right of the block. */
const codeCopyClasses = buttonClassName({
  variant: 'secondary',
  size: 'sm',
  className: 'absolute right-2 top-2',
});

/** The shell of the page that answers an address with no page. */
export const emptyStateClasses =
  'mx-auto flex max-w-sm flex-col items-center gap-2 px-gutter py-20 text-center';

/** The keyboard hint of the search button. */
const searchHint = `<kbd class="${kbdClassName()}">/</kbd>`;

/** The words of the controls of the site, in one place. */
export const words = {
  skip: 'Skip to the text',
  openContents: 'Open the contents',
  closeContents: 'Close the contents',
  contents: 'Contents',
  home: 'Overview',
  search: 'Search',
  searchLabel: 'Search the docs',
  searchPlaceholder: 'Search the docs',
  closeSearch: 'Close the search',
  onThisPage: 'On this page',
  copyPage: 'Copy page',
  copied: 'Copied',
  viewMarkdown: 'View as Markdown',
  previous: 'Previous',
  next: 'Next',
  morePages: 'More pages',
  editPage: 'Edit this page on GitHub',
  source: 'Source on GitHub',
  forAgents: 'For agents: llms.txt',
  copyCode: 'Copy',
  missingTitle: 'This page does not exist',
  missingText: 'The address names no page of the guide.',
  missingAction: 'Open the overview',
} as const;

/** The `<head>` of every page. */
function head(
  settings: SiteSettings,
  assets: SiteAssets,
  title: string,
  description: string,
  path: string | null,
  extra: readonly string[],
): string {
  const styles = assets.stylesheets.map(
    (href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">`,
  );
  const image = escapeAttribute(
    absoluteAddress(settings, `${settings.base}${socialPreview.file}`),
  );
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(title)}</title>`,
    `<meta name="description" content="${escapeAttribute(description)}">`,
    `<meta property="og:title" content="${escapeAttribute(title)}">`,
    `<meta property="og:description" content="${escapeAttribute(description)}">`,
    `<meta property="og:site_name" content="${escapeAttribute(siteName)}">`,
    ...(settings.origin === null || path === null
      ? []
      : [
          `<meta property="og:url" content="${escapeAttribute(absoluteAddress(settings, path))}">`,
        ]),
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary_large_image">',
    ...(settings.origin === null
      ? []
      : [
          `<meta property="og:image" content="${image}">`,
          `<meta property="og:image:type" content="${socialPreview.type}">`,
          `<meta property="og:image:width" content="${socialPreview.width}">`,
          `<meta property="og:image:height" content="${socialPreview.height}">`,
          `<meta property="og:image:alt" content="${escapeAttribute(socialPreview.alt)}">`,
          `<meta name="twitter:image" content="${image}">`,
        ]),
    `<link rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48" href="${escapeAttribute(settings.base)}favicon.ico">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${escapeAttribute(settings.base)}apple-touch-icon.png">`,
    ...(assets.icon === null
      ? []
      : [
          `<link rel="icon" type="image/svg+xml" href="${escapeAttribute(assets.icon)}">`,
        ]),
    `<link rel="alternate" type="text/plain" title="llms.txt" href="${escapeAttribute(absoluteAddress(settings, `${settings.base}llms.txt`))}">`,
    ...extra,
    ...styles,
    `<script type="module" src="${escapeAttribute(assets.script)}"></script>`,
  ];
  return lines.map((line) => `    ${line}`).join('\n');
}

/** The header of every page. */
function header(settings: SiteSettings): string {
  const menu = buttonClassName({
    variant: 'ghost',
    iconOnly: true,
    size: 'sm',
    className: 'md:hidden',
  });
  const search = buttonClassName({
    variant: 'secondary',
    size: 'sm',
    className: 'justify-between gap-6 max-sm:hidden',
  });
  const searchIconOnly = buttonClassName({
    variant: 'ghost',
    iconOnly: true,
    size: 'sm',
    className: 'sm:hidden',
  });
  const source = buttonClassName({ variant: 'ghost', size: 'sm' });
  return `<header class="${headerClasses}">
      <button type="button" class="${menu}" data-docs-menu data-docs-close-label="${words.closeContents}" aria-controls="docs-contents" aria-expanded="false" aria-label="${words.openContents}" title="${words.openContents}">${icon(MenuIcon)}</button>
      <a class="${homeLinkClasses}" href="${escapeAttribute(settings.base)}">${icon(AppMarkIcon)}<span class="truncate">${productName}</span><span class="font-medium text-muted">Docs</span></a>
      <span class="flex-1"></span>
      <button type="button" class="${search}" data-docs-search aria-keyshortcuts="/ Control+K Meta+K" aria-label="${words.searchLabel}"><span class="flex items-center gap-1.5">${icon(SearchIcon)}<span>${words.search}</span></span>${searchHint}</button>
      <button type="button" class="${searchIconOnly}" data-docs-search aria-label="${words.searchLabel}" title="${words.searchLabel}">${icon(SearchIcon)}</button>
      <a class="${source}" href="${repositoryUrl}" rel="noopener noreferrer">GitHub${icon(ExternalLinkIcon)}</a>
    </header>`;
}

/** The contents of the site, with the current page marked. */
function contents(
  settings: SiteSettings,
  groups: readonly GuideGroup[],
  current: string | null,
): string {
  const row = (href: string, title: string, here: boolean): string =>
    `<li><a class="${rowClassName({ current: here, className: 'w-full' })}" href="${escapeAttribute(href)}"${here ? ' aria-current="page"' : ''}><span class="min-w-0 flex-1 truncate">${escapeText(title)}</span></a></li>`;
  const sections = groups.map(
    (group) => `<section class="mt-6">
          <h2 class="${pageGroupLabelClassName()} px-2">${escapeText(group.title)}</h2>
          <ul class="${pageListClassName()} mx-0">
            ${group.pages.map((entry) => row(pageHref(settings, slugOf(entry.file)), entry.title, current === entry.file)).join('\n            ')}
          </ul>
        </section>`,
  );
  return `<nav id="docs-contents" class="${contentsClasses}" aria-label="${words.contents}" data-docs-contents>
        <ul class="${pageListClassName()} mx-0">
          ${row(settings.base, words.home, current === 'README.md')}
        </ul>
        ${sections.join('\n        ')}
      </nav>`;
}

/** The list of the headings of a page, in the side region. */
function outline(page: GuidePage, depth: 2 | 3 = 3): string {
  const headings = page.headings.filter((heading) => heading.depth <= depth);
  if (headings.length < 2) return `<div class="${pageSideClassName()}"></div>`;
  const rows = headings.map(
    (heading) =>
      `<li><a class="${rowClassName({ className: `w-full ${heading.depth === 3 ? 'pl-5' : ''}` })}" href="#${escapeAttribute(heading.id)}"><span class="min-w-0 flex-1 truncate">${escapeText(heading.text)}</span></a></li>`,
  );
  return `<aside class="${sideClasses}" aria-label="${words.onThisPage}">
          <h2 class="${pageGroupLabelClassName()} px-2">${words.onThisPage}</h2>
          <ol class="${pageListClassName()} mx-0">
            ${rows.join('\n            ')}
          </ol>
        </aside>`;
}

/** The previous and the next page. */
function pager(view: PageView): string {
  const link = (target: PageLink, hint: string, end: boolean): string =>
    `<a class="${pagerLinkClasses}${end ? ' sm:col-start-2 sm:items-end sm:text-right' : ''}" href="${escapeAttribute(target.href)}"><span class="${pagerHintClasses} flex items-center gap-1">${end ? '' : icon(ChevronLeftIcon)}${hint}${end ? icon(ChevronRightIcon) : ''}</span><span class="text-ui font-medium text-strong">${escapeText(target.title)}</span></a>`;
  const parts = [
    ...(view.previous === null
      ? []
      : [link(view.previous, words.previous, false)]),
    ...(view.next === null ? [] : [link(view.next, words.next, true)]),
  ];
  if (parts.length === 0) return '';
  return `<nav class="${pagerClasses}" aria-label="${words.morePages}">${parts.join('')}</nav>`;
}

/** The search dialog and the two templates that the client script fills. */
function searchDialog(): string {
  const close = buttonClassName({
    variant: 'ghost',
    iconOnly: true,
    size: 'sm',
  });
  return `<dialog id="docs-search" class="${searchDialogClasses}" aria-label="${words.searchLabel}" data-docs-search-dialog>
      <div class="${pageGutter} h-full">
        <div class="${searchPanelClasses}" data-docs-search-panel>
          <form class="${searchFieldRowClasses}" role="search" data-docs-search-form>
            <label class="sr-only" for="docs-search-field">${words.searchLabel}</label>
            <span class="flex text-muted" aria-hidden="true">${icon(SearchIcon)}</span>
            <input id="docs-search-field" class="${searchFieldClasses}" type="text" enterkeyhint="search" name="q" autocomplete="off" spellcheck="false" placeholder="${words.searchPlaceholder}" aria-controls="docs-search-results" data-docs-search-field>
            <button type="button" class="${close}" aria-label="${words.closeSearch}" title="${words.closeSearch}" data-docs-search-close>${icon(CloseIcon)}</button>
          </form>
          <p class="${searchStatusClasses}" role="status" aria-live="polite" data-docs-search-status></p>
          <ul id="docs-search-results" class="${searchResultsClasses}" data-docs-search-results></ul>
        </div>
      </div>
    </dialog>
    <template data-docs-search-result>
      <li><a class="${searchResultClasses}" href=""><span class="text-ui font-medium text-strong" data-docs-result-title></span><span class="${searchExcerptClasses}" data-docs-result-excerpt></span></a></li>
    </template>
    <template data-docs-code-copy>
      <div class="${codeBlockClasses}"><button type="button" class="${codeCopyClasses}" data-docs-copy-code data-docs-copied="${words.copied}">${icon(CopyIcon)}<span data-docs-copy-label>${words.copyCode}</span></button></div>
    </template>`;
}

/** The whole document of one page. */
// Docs is the project's own hosted site. It explicitly uses hosted navigation,
// including builds for another origin or base path through site.ts. Installation
// pages use the installation-safe footer defaults instead.
export function pageDocument(view: PageView): string {
  const { settings, page } = view;
  const title = page.slug === '' ? siteName : `${page.title} | ${siteName}`;
  const markdown = markdownHref(settings, page.slug);
  const canonical =
    settings.origin === null
      ? []
      : [
          `<link rel="canonical" href="${escapeAttribute(absoluteAddress(settings, pageHref(settings, page.slug)))}">`,
        ];
  const secondary = buttonClassName({ variant: 'secondary', size: 'sm' });
  const ghost = buttonClassName({ variant: 'ghost', size: 'sm' });
  return `<!doctype html>
<html lang="en">
  <head>
${head(
  settings,
  view.assets,
  title,
  page.description,
  pageHref(settings, page.slug),
  [
    ...canonical,
    `<link rel="alternate" type="text/markdown" title="${words.viewMarkdown}" href="${escapeAttribute(markdown)}">`,
  ],
)}
  </head>
  <body class="${bodyClasses}" data-docs-base="${escapeAttribute(settings.base)}">
    <a class="sr-only rounded-md bg-card px-3 py-2 text-control text-strong focus-visible:not-sr-only focus-visible:absolute focus-visible:left-2 focus-visible:top-2 focus-visible:z-40 focus-visible:outline-2 focus-visible:outline-focus" href="#docs-text">${words.skip}</a>
    ${header(settings)}
    <div class="${frameClasses}">
      ${contents(settings, view.groups, page.file)}
      <main id="docs-text" class="${mainClasses}" tabindex="-1">
        <div class="${pageRowClassName()} ${pageGutter}">
          <div class="${pageColumnClassName()} py-6">
            <div class="${toolbarClasses}">
              <p class="${groupClasses}">${escapeText(view.group ?? productName)}</p>
              <div class="flex items-center gap-cluster">
                <button type="button" class="${secondary}" data-docs-copy-page data-docs-copied="${words.copied}">${icon(CopyIcon)}<span data-docs-copy-label>${words.copyPage}</span></button>
                <a class="${ghost}" href="${escapeAttribute(markdown)}">${icon(FileTextIcon)}${words.viewMarkdown}</a>
              </div>
            </div>
            <article class="${articleClasses}" data-pagefind-body>
${view.html}
            </article>
            ${pager(view)}
            <nav aria-label="Page resources" class="${footClasses}">
              <a class="${footLinkClasses}" href="${escapeAttribute(view.sourceHref ?? editHref(page.file))}" rel="noopener noreferrer">${view.sourceHref === undefined ? words.editPage : words.source}</a>
              <a class="${footLinkClasses}" href="${escapeAttribute(`${settings.base}llms.txt`)}">${words.forAgents}</a>
            </nav>
          </div>
          ${outline(page, view.outlineDepth)}
        </div>
        <div class="${pageRowClassName()} ${pageGutter}"><div class="mx-auto min-w-0 max-w-5xl flex-1">${renderPublicFooter({ home: 'https://tidynotebook.com', columns: hostedFooterColumns, icon: view.assets.icon ?? `${settings.base}favicon.svg` })}</div></div>
      </main>
    </div>
    <template data-docs-markdown>${escapeText(view.markdown)}</template>
    ${searchDialog()}
  </body>
</html>
`;
}

/** The document that answers an address with no page. */
export function missingDocument(
  settings: SiteSettings,
  assets: SiteAssets,
  groups: readonly GuideGroup[],
): string {
  const action = buttonClassName({ variant: 'primary' });
  return `<!doctype html>
<html lang="en">
  <head>
${head(settings, assets, `${words.missingTitle} | ${siteName}`, words.missingText, null, ['<meta name="robots" content="noindex">'])}
  </head>
  <body class="${bodyClasses}" data-docs-base="${escapeAttribute(settings.base)}">
    ${header(settings)}
    <div class="${frameClasses}">
      ${contents(settings, groups, null)}
      <main id="docs-text" class="${mainClasses}" tabindex="-1">
        <div class="${emptyStateClasses}">
          <span class="flex text-muted" aria-hidden="true">${renderToStaticMarkup(createElement(SearchIcon, { size: 20 }))}</span>
          <h1 class="m-0 text-ui font-semibold text-strong">${words.missingTitle}</h1>
          <p class="m-0 text-control text-muted">${words.missingText}</p>
          <a class="${action} mt-2" href="${escapeAttribute(settings.base)}">${words.missingAction}</a>
        </div>
      </main>
    </div>
    ${searchDialog()}
  </body>
</html>
`;
}
