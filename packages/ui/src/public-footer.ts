/** Shared public navigation. This entry has no React or browser dependency. */
export type FooterLink = { readonly label: string; readonly href: string };
export type FooterColumn = {
  readonly title: string;
  readonly links: readonly FooterLink[];
};
export type PublicFooterOptions = {
  readonly home?: string;
  readonly icon?: string;
  readonly columns?: readonly FooterColumn[];
};
export type FooterNode =
  | string
  | {
      readonly tag: string;
      readonly attributes?: Readonly<Record<string, string>>;
      readonly children?: readonly FooterNode[];
    };
export const hostedFooterColumns: readonly FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: 'https://tidynotebook.com/#features' },
      { label: 'Pricing', href: 'https://tidynotebook.com/pricing' },
      { label: 'Sign in', href: 'https://app.tidynotebook.com/login' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: 'https://docs.tidynotebook.com' },
      { label: 'MCP', href: 'https://docs.tidynotebook.com/mcp/' },
      { label: 'Contact', href: 'mailto:support@tidynotebook.com' },
    ],
  },
  {
    title: 'Open source',
    links: [
      { label: 'GitHub', href: 'https://github.com/tidynotebook/tidynotebook' },
      {
        label: 'Source code',
        href: 'https://github.com/tidynotebook/tidynotebook/tree/main',
      },
      {
        label: 'License (AGPL-3.0)',
        href: 'https://github.com/tidynotebook/tidynotebook/blob/main/LICENSE',
      },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: 'https://tidynotebook.com/terms' },
      { label: 'Privacy', href: 'https://tidynotebook.com/privacy' },
      { label: 'Refunds', href: 'https://tidynotebook.com/refunds' },
      { label: 'Fair use', href: 'https://tidynotebook.com/fair-use' },
    ],
  },
];
/** An installation supplies its legal and contact destinations. No cloud terms are inserted. */
export function installationFooterColumns(
  legal: readonly FooterLink[] = [],
  {
    contact,
    signIn = '/login',
  }: {
    readonly contact?: FooterLink;
    readonly signIn?: string;
  } = {},
): readonly FooterColumn[] {
  return hostedFooterColumns
    .map((column) =>
      column.title === 'Legal'
        ? { ...column, links: legal }
        : column.title === 'Product'
          ? {
              ...column,
              links: [{ label: 'Sign in', href: signIn }],
            }
          : column.title === 'Resources'
            ? {
                ...column,
                links: [
                  ...column.links.filter((link) => link.label !== 'Contact'),
                  ...(contact ? [contact] : []),
                ],
              }
            : column,
    )
    .filter((column) => column.links.length > 0);
}
const node = (
  tag: string,
  attributes: Readonly<Record<string, string>>,
  children: readonly FooterNode[] = [],
): FooterNode => ({ tag, attributes, children });
/** Validate before either renderer receives a URL. Network-relative URLs are not paths. */
function footerAddress(value: string): string {
  const address = value.trim();
  if (
    address
      .split('')
      .some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
    address.includes('\\') ||
    address.startsWith('//')
  )
    throw new Error(
      'A footer URL must use http, https, mailto, or a relative path.',
    );
  let parsed: URL;
  try {
    parsed = new URL(address, 'https://footer.invalid/');
  } catch {
    throw new Error(
      'A footer URL must use http, https, mailto, or a relative path.',
    );
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol))
    throw new Error(
      'A footer URL must use http, https, mailto, or a relative path.',
    );
  return address;
}

/** One tree is used by the React and static renderers. */
export function publicFooterTree({
  home = '/',
  icon = '/favicon.svg',
  columns = installationFooterColumns(),
}: PublicFooterOptions = {}): FooterNode {
  return node(
    'footer',
    {
      className:
        'public-footer flex flex-col gap-6 border-t border-edge-subtle p-6 coarse:p-4',
    },
    [
      node(
        'div',
        {
          className:
            'public-footer-grid grid grid-cols-6 gap-6 coarse:grid-cols-2',
        },
        [
          node(
            'div',
            { className: 'public-footer-brand col-span-2 flex flex-col gap-3' },
            [
              node(
                'a',
                {
                  href: footerAddress(home),
                  className:
                    'public-footer-wordmark inline-flex items-center gap-2 text-title-header text-strong no-underline hover:underline focus-visible:outline-2 focus-visible:outline-focus',
                },
                [
                  node('img', {
                    src: footerAddress(icon),
                    width: '16',
                    height: '16',
                    alt: '',
                  }),
                  'tidy notebook',
                ],
              ),
              node('p', { className: 'text-secondary text-muted' }, [
                'Open source. Write in Markdown. Export your notes.',
              ]),
              node('p', { className: 'text-secondary text-muted' }, [
                '© 2026 tidy notebook',
              ]),
            ],
          ),
          ...columns.map((column, index) =>
            node(
              'nav',
              {
                'aria-labelledby': `public-footer-column-${index}`,
                className: 'flex flex-col gap-3',
              },
              [
                node(
                  'h2',
                  {
                    id: `public-footer-column-${index}`,
                    className: 'text-group text-muted',
                  },
                  [column.title],
                ),
                ...column.links.map((link) =>
                  node(
                    'a',
                    {
                      href: footerAddress(link.href),
                      className:
                        'block py-1 text-body text-muted no-underline hover:underline focus-visible:outline-2 focus-visible:outline-focus',
                    },
                    [link.label],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ],
  );
}
function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function staticNode(value: FooterNode): string {
  if (typeof value === 'string') return escape(value);
  const attrs = Object.entries(value.attributes ?? {})
    .map(
      ([key, value]) =>
        ` ${key === 'className' ? 'class' : key}="${escape(value)}"`,
    )
    .join('');
  return value.tag === 'img'
    ? `<img${attrs}/>`
    : `<${value.tag}${attrs}>` +
        (value.children ?? []).map(staticNode).join('') +
        `</${value.tag}>`;
}
/** Escaped static HTML for docs and server-built public pages. */
export function renderPublicFooter(options: PublicFooterOptions = {}): string {
  return staticNode(publicFooterTree(options));
}
